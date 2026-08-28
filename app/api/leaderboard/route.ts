import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { isMissingColumn } from "@/lib/pg-errors";
import type { LeaderboardEntry } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * The leaderboard is two full-table reads and a fold, and the thing it ranks
 * moves at the speed of a DAO — a ballot here, a proposal there. Sixty seconds
 * of CDN cache is longer than the proposal list's thirty because nobody
 * arrives at this page to watch their own row update; they arrive to see who
 * shows up. `stale-while-revalidate` keeps the first visitor after expiry from
 * paying for the rebuild.
 */
const LIST_CACHE = "public, s-maxage=60, stale-while-revalidate=300";

interface Tally {
  address: string;
  votes: number;
  proposals: number;
  lastActive: string | null;
}

/** Latest of two possibly-null ISO timestamps. */
function later(a: string | null, b: string | null) {
  if (!a) return b;
  if (!b) return a;
  return new Date(a).getTime() >= new Date(b).getTime() ? a : b;
}

export async function GET(req: NextRequest) {
  const space =
    req.nextUrl.searchParams.get("space") ?? process.env.NEXT_PUBLIC_SPACE_ID!;
  const db = supabaseAdmin();

  const { data: proposalRows, error } = await db
    .from("proposals")
    .select("id, author, created_at")
    .eq("space_id", space);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const proposals = proposalRows ?? [];
  if (proposals.length === 0) {
    return NextResponse.json(
      { members: [] },
      { headers: { "Cache-Control": LIST_CACHE } }
    );
  }

  const ids = proposals.map((p) => p.id);

  // `voted_at` carries Snapshot's original timestamp on imported ballots and
  // arrives with migration 002; `created_at` is the row insert time and is
  // always there. Reading both and preferring the former is what keeps an
  // imported member's "last active" from reading as the day we ran the import.
  let voteRows: { voter: string; created_at: string; voted_at?: string | null }[] =
    [];

  const withVotedAt = await db
    .from("votes")
    .select("voter, created_at, voted_at")
    .in("proposal_id", ids);

  if (isMissingColumn(withVotedAt.error)) {
    const fallback = await db
      .from("votes")
      .select("voter, created_at")
      .in("proposal_id", ids);
    if (fallback.error) {
      return NextResponse.json({ error: fallback.error.message }, { status: 500 });
    }
    voteRows = fallback.data ?? [];
  } else if (withVotedAt.error) {
    return NextResponse.json({ error: withVotedAt.error.message }, { status: 500 });
  } else {
    voteRows = withVotedAt.data ?? [];
  }

  // Addresses are keyed lowercase because the two tables disagree about case:
  // native rows are checksummed by viem's getAddress, imported ones carry
  // whatever Snapshot stored. Folding on the raw string would file one member
  // under two rows and rank them both wrong. The first spelling seen is kept
  // for display, since that is the one an explorer link should carry.
  const tallies = new Map<string, Tally>();

  const entry = (address: string) => {
    const key = address.toLowerCase();
    let row = tallies.get(key);
    if (!row) {
      row = { address, votes: 0, proposals: 0, lastActive: null };
      tallies.set(key, row);
    }
    return row;
  };

  for (const p of proposals) {
    if (!p.author) continue;
    const row = entry(p.author);
    row.proposals += 1;
    row.lastActive = later(row.lastActive, p.created_at);
  }

  for (const v of voteRows) {
    if (!v.voter) continue;
    const row = entry(v.voter);
    row.votes += 1;
    row.lastActive = later(row.lastActive, v.voted_at ?? v.created_at);
  }

  // A list, not a ranking. Nobody is numbered and no score is invented from
  // votes and proposals, because any weighting between the two would be this
  // portal deciding what the DAO values rather than reporting what it did.
  // Most ballots first is just a useful default order; the page can re-sort.
  const members: LeaderboardEntry[] = [...tallies.values()].sort(
    (a, b) =>
      b.votes - a.votes ||
      b.proposals - a.proposals ||
      new Date(b.lastActive ?? 0).getTime() -
        new Date(a.lastActive ?? 0).getTime()
  );

  return NextResponse.json(
    { members },
    { headers: { "Cache-Control": LIST_CACHE } }
  );
}
