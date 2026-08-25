import { NextRequest, NextResponse } from "next/server";
import { getAddress } from "viem";
import { supabaseAdmin } from "@/lib/supabase";
import {
  getVotingPower,
  isIdentityVerified,
  snapshotDrift,
  MAX_SNAPSHOT_DRIFT_SECONDS,
} from "@/lib/voting-power";
import type { Proposal } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * What one address may cast on one proposal, answered before they sign.
 *
 * Voters should not have to guess. Finding out that an address had no power
 * only after a wallet popup and a rejected request is the single most
 * confusing thing this portal can do, and it is entirely avoidable: the same
 * read the vote endpoint performs is a cheap public query.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const proposalId = searchParams.get("proposal");
  const voter = searchParams.get("voter");

  if (!proposalId || !voter) {
    return NextResponse.json({ error: "proposal and voter are required." }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin()
    .from("proposals")
    .select("*")
    .eq("id", proposalId)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Proposal not found." }, { status: 404 });
  }

  const proposal = data as Proposal;

  try {
    if (proposal.signature && proposal.snapshot_block) {
      const drift = await snapshotDrift(proposal.snapshot_block, proposal.created_at);
      if (drift > MAX_SNAPSHOT_DRIFT_SECONDS) {
        return NextResponse.json({
          power: 0,
          unavailable:
            "This proposal's snapshot block is not from the current network.",
        });
      }
    }

    // The identity gate is reported here for the same reason power is: the
    // vote endpoint will refuse this address, and finding that out after a
    // wallet popup is the worst way to learn it.
    if (proposal.require_verified) {
      const verified = await isIdentityVerified(
        getAddress(voter),
        proposal.snapshot_block
      );
      if (!verified) {
        return NextResponse.json({
          power: 0,
          blocked: true,
          unavailable:
            "This proposal is open to identity-verified wallets only. This " +
            "address does not hold a Receptor credential on Redbelly.",
        });
      }
    }

    const power = await getVotingPower({
      voter: getAddress(voter),
      strategy: proposal.strategy,
      tokenAddress: proposal.token_address,
      blockNumber: proposal.snapshot_block,
    });

    return NextResponse.json({
      power,
      strategy: proposal.strategy,
      snapshotBlock: proposal.snapshot_block,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Voting power is unavailable.";
    return NextResponse.json({ power: 0, unavailable: msg });
  }
}
