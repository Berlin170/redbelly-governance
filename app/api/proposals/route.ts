import { NextRequest, NextResponse } from "next/server";
import { verifyTypedData, getAddress } from "viem";
import { supabaseAdmin } from "@/lib/supabase";
import { domain, proposalTypes } from "@/lib/eip712";
import { currentBlock } from "@/lib/voting-power";
import { LIMITS, dayAgo } from "@/lib/limits";
import { VOTING_SYSTEMS } from "@/lib/voting";
import { resultsFor } from "@/lib/results";
import type { Proposal, Vote } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const space = req.nextUrl.searchParams.get("space") ?? process.env.NEXT_PUBLIC_SPACE_ID!;
  const db = supabaseAdmin();

  const { data, error } = await db
    .from("proposals")
    .select("*")
    .eq("space_id", space)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const proposals = (data ?? []) as Proposal[];
  if (proposals.length === 0) return NextResponse.json({ proposals: [] });

  // One read for every ballot in the space rather than a query per proposal.
  // At DAO scale (hundreds of votes) this is cheaper than the round trips.
  const { data: voteRows } = await db
    .from("votes")
    .select("proposal_id, voter, choice, voting_power")
    .in(
      "proposal_id",
      proposals.map((p) => p.id)
    );

  const byProposal = new Map<string, Vote[]>();
  for (const v of (voteRows ?? []) as Vote[]) {
    const list = byProposal.get(v.proposal_id);
    if (list) list.push(v);
    else byProposal.set(v.proposal_id, [v]);
  }

  const enriched = proposals.map((p) => {
    const votes = byProposal.get(p.id) ?? [];
    return {
      ...p,
      vote_count: p.source_vote_count ?? votes.length,
      results: resultsFor(p, votes),
    };
  });

  return NextResponse.json({ proposals: enriched });
}

export async function POST(req: NextRequest) {
  try {
    const { message, signature } = await req.json();

    const valid = await verifyTypedData({
      address: message.from,
      domain,
      types: proposalTypes,
      primaryType: "Proposal",
      message: {
        ...message,
        start: BigInt(message.start),
        end: BigInt(message.end),
        timestamp: BigInt(message.timestamp),
      },
      signature,
    });

    if (!valid) {
      return NextResponse.json({ error: "Signature does not match author." }, { status: 401 });
    }

    const choices: string[] = JSON.parse(message.choices);
    if (!Array.isArray(choices) || choices.length < 2) {
      return NextResponse.json({ error: "A proposal needs at least two choices." }, { status: 400 });
    }
    if (choices.length > LIMITS.maxChoices) {
      return NextResponse.json({ error: "Too many choices." }, { status: 400 });
    }

    if (message.title.length > LIMITS.titleChars) {
      return NextResponse.json({ error: "Title is too long." }, { status: 400 });
    }
    if (message.body.length > LIMITS.bodyChars) {
      return NextResponse.json({ error: "Body is too long." }, { status: 400 });
    }
    if (choices.some((c) => typeof c !== "string" || c.length > LIMITS.choiceChars)) {
      return NextResponse.json({ error: "A choice is too long." }, { status: 400 });
    }

    // Spam ceilings. Imported history is excluded (signature is null on it),
    // so a bulk import cannot exhaust the day's allowance for real authors.
    const db0 = supabaseAdmin();
    const since = dayAgo();

    const { count: authorToday } = await db0
      .from("proposals")
      .select("id", { count: "exact", head: true })
      .eq("author", getAddress(message.from))
      .not("signature", "is", null)
      .gte("created_at", since);

    if ((authorToday ?? 0) >= LIMITS.perAuthorPerDay) {
      return NextResponse.json(
        { error: `This address has already opened ${LIMITS.perAuthorPerDay} proposals today. Try again tomorrow.` },
        { status: 429 }
      );
    }

    const { count: spaceToday } = await db0
      .from("proposals")
      .select("id", { count: "exact", head: true })
      .eq("space_id", message.space)
      .not("signature", "is", null)
      .gte("created_at", since);

    if ((spaceToday ?? 0) >= LIMITS.perSpacePerDay) {
      return NextResponse.json(
        { error: "This space has reached its proposal limit for today." },
        { status: 429 }
      );
    }
    if (!VOTING_SYSTEMS.some((s) => s.value === message.votingSystem)) {
      return NextResponse.json({ error: "Unknown voting system." }, { status: 400 });
    }

    const start = Number(message.start);
    const end = Number(message.end);
    if (end <= start) {
      return NextResponse.json({ error: "Voting must close after it opens." }, { status: 400 });
    }

    // Balances are read at this block for the whole vote, so buying tokens
    // after a proposal opens cannot buy voting power in it.
    let snapshotBlock: number | null = null;
    try {
      snapshotBlock = await currentBlock();
    } catch {
      snapshotBlock = null; // RPC unreachable — fall back to live balances
    }

    const { data, error } = await supabaseAdmin()
      .from("proposals")
      .insert({
        space_id: message.space,
        author: getAddress(message.from),
        title: message.title,
        body: message.body,
        choices,
        voting_system: message.votingSystem,
        strategy: message.strategy,
        token_address: message.tokenAddress || null,
        snapshot_block: snapshotBlock,
        quorum: Number(message.quorum ?? 0),
        start_at: new Date(start * 1000).toISOString(),
        end_at: new Date(end * 1000).toISOString(),
        signature,
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ proposal: data }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Could not create the proposal.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
