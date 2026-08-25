import { NextRequest, NextResponse } from "next/server";
import { verifyTypedData, getAddress } from "viem";
import { supabaseAdmin } from "@/lib/supabase";
import { domain, voteTypes, canonicalChoice } from "@/lib/eip712";
import {
  getVotingPower,
  isIdentityVerified,
  snapshotDrift,
  MAX_SNAPSHOT_DRIFT_SECONDS,
} from "@/lib/voting-power";
import { validateChoice } from "@/lib/voting";
import { LIMITS, MAX_CLOCK_SKEW_SECONDS } from "@/lib/limits";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { message, signature } = await req.json();

    const valid = await verifyTypedData({
      address: message.from,
      domain,
      types: voteTypes,
      primaryType: "Vote",
      message: { ...message, timestamp: BigInt(message.timestamp) },
      signature,
    });

    if (!valid) {
      return NextResponse.json({ error: "Signature does not match voter." }, { status: 401 });
    }

    // A reason is prose beside a ballot. Proposals bound every field they
    // store and this one was the gap, so an unbounded string could be parked
    // in the votes table for the price of one signature.
    if (typeof message.reason === "string" && message.reason.length > LIMITS.reasonChars) {
      return NextResponse.json({ error: "That reason is too long." }, { status: 400 });
    }

    // The timestamp decides which of two payloads is newer, so a far-future
    // one would pin this address to a ballot it could never revise. Drifting
    // clocks are forgiven; a year from Tuesday is not.
    const signedAt = Number(message.timestamp);
    if (!Number.isFinite(signedAt)) {
      return NextResponse.json({ error: "Vote is missing a timestamp." }, { status: 400 });
    }
    if (signedAt > Math.floor(Date.now() / 1000) + MAX_CLOCK_SKEW_SECONDS) {
      return NextResponse.json(
        { error: "This vote is dated in the future. Check your device clock." },
        { status: 400 }
      );
    }

    const db = supabaseAdmin();
    const { data: proposal, error: pErr } = await db
      .from("proposals")
      .select("*")
      .eq("id", message.proposal)
      .single();

    if (pErr || !proposal) {
      return NextResponse.json({ error: "Proposal not found." }, { status: 404 });
    }

    // The space is signed, so it has to be checked, or it is decoration. The
    // EIP-712 domain names this app and the chain but not this deployment, so
    // a second portal on Redbelly would mint signatures that verify here too.
    // Binding the payload to the proposal's own space is what keeps a ballot
    // cast in one space from being posted into another.
    if (message.space !== proposal.space_id) {
      return NextResponse.json(
        { error: "This vote was signed for a different space." },
        { status: 400 }
      );
    }

    const now = Date.now();
    if (now < new Date(proposal.start_at).getTime()) {
      return NextResponse.json({ error: "Voting has not opened yet." }, { status: 400 });
    }
    if (now > new Date(proposal.end_at).getTime()) {
      return NextResponse.json({ error: "Voting has closed." }, { status: 400 });
    }

    // Re-voting overwrites, votes are public, and signatures are published
    // with them — so an old ballot could be archived and posted back after its
    // author changed their mind, undoing the change with their own signature.
    // Requiring each payload to be strictly newer than the one on file spends
    // every signature exactly once. Checked before any RPC work, because a
    // replay should cost us a single indexed read and nothing more.
    const voter = getAddress(message.from);
    const { data: prior } = await db
      .from("votes")
      .select("signed_at")
      .eq("proposal_id", proposal.id)
      .eq("voter", voter)
      .maybeSingle();

    // Null means a vote cast before migration 006, or imported history. There
    // is no floor to enforce yet; this vote sets one for everything after it.
    if (prior?.signed_at != null && signedAt <= Number(prior.signed_at)) {
      return NextResponse.json(
        {
          error:
            "This ballot has already been counted. Sign a new vote to change " +
            "your choice.",
        },
        { status: 409 }
      );
    }

    // The identity gate, before any power is measured. A blocked address gets
    // told why and what to do about it rather than a bare refusal — the fix is
    // a Receptor credential, which is not something to leave people guessing at.
    if (proposal.require_verified) {
      const verified = await isIdentityVerified(voter, proposal.snapshot_block);
      if (!verified) {
        return NextResponse.json(
          {
            error:
              "This proposal is open to identity-verified wallets only. This " +
              "address does not hold a Receptor credential on Redbelly, so it " +
              "cannot vote here.",
          },
          { status: 403 }
        );
      }
    }

    const choice = JSON.parse(message.choice);
    validateChoice(proposal.voting_system, choice, proposal.choices.length);

    // Re-signing the same payload must produce the same string, or the
    // signature the client made will not match what we store.
    if (canonicalChoice(choice) !== message.choice) {
      return NextResponse.json({ error: "Choice encoding mismatch." }, { status: 400 });
    }

    // Refuse rather than read a snapshot block that belongs to another chain.
    // Imported proposals are exempt: their block comes from Snapshot and their
    // created_at is the import time, so the two legitimately disagree.
    if (proposal.signature && proposal.snapshot_block) {
      const drift = await snapshotDrift(proposal.snapshot_block, proposal.created_at);
      if (drift > MAX_SNAPSHOT_DRIFT_SECONDS) {
        return NextResponse.json(
          {
            error:
              "This proposal's snapshot block does not belong to the current " +
              "network, so voting power cannot be measured. Create a new proposal.",
          },
          { status: 409 }
        );
      }
    }

    const votingPower = await getVotingPower({
      voter: message.from,
      strategy: proposal.strategy,
      tokenAddress: proposal.token_address,
      blockNumber: proposal.snapshot_block,
    });

    if (votingPower <= 0) {
      const reason =
        proposal.strategy === "verified-identity"
          ? "This address is not identity-verified, so it cannot vote on this proposal."
          : "This address held no voting power at the snapshot block.";
      return NextResponse.json({ error: reason }, { status: 403 });
    }

    const { data, error } = await db
      .from("votes")
      .upsert(
        {
          proposal_id: proposal.id,
          voter,
          choice,
          voting_power: votingPower,
          // Stored so the replay floor survives, and so the published
          // signature can finally be re-verified against the published row:
          // rebuilding the signed payload needs this timestamp.
          signed_at: signedAt,
          reason: message.reason || null,
          signature,
        },
        { onConflict: "proposal_id,voter" }
      )
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ vote: data }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Could not record the vote.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
