import { NextRequest, NextResponse } from "next/server";
import { verifyTypedData, getAddress } from "viem";
import { supabaseAdmin } from "@/lib/supabase";
import { domain, voteTypes, canonicalChoice } from "@/lib/eip712";
import {
  getVotingPower,
  snapshotDrift,
  MAX_SNAPSHOT_DRIFT_SECONDS,
} from "@/lib/voting-power";
import { validateChoice } from "@/lib/voting";

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

    const db = supabaseAdmin();
    const { data: proposal, error: pErr } = await db
      .from("proposals")
      .select("*")
      .eq("id", message.proposal)
      .single();

    if (pErr || !proposal) {
      return NextResponse.json({ error: "Proposal not found." }, { status: 404 });
    }

    const now = Date.now();
    if (now < new Date(proposal.start_at).getTime()) {
      return NextResponse.json({ error: "Voting has not opened yet." }, { status: 400 });
    }
    if (now > new Date(proposal.end_at).getTime()) {
      return NextResponse.json({ error: "Voting has closed." }, { status: 400 });
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
          voter: getAddress(message.from),
          choice,
          voting_power: votingPower,
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
