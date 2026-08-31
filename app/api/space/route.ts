import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import type { Space } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * How long the CDN may serve the space header without asking us again.
 *
 * This is the busiest read in the portal: the header and the sidebar counts
 * are on every page, so every visitor to every route pays for it. Building it
 * costs four sequential round trips — the space, its proposals, a count of
 * native ballots, then every voter address to size a set — about a second of
 * server time, repeated per visitor, to render numbers that move when somebody
 * votes.
 *
 * Sixty seconds is the client's own number, not a new judgement:
 * `space-provider` has always set `staleTime: 60_000`, having decided a
 * minute-old count was current enough to render. This makes the CDN agree with
 * it rather than rebuilding a total from scratch behind a client that was not
 * going to ask. The same reasoning, and the same shape, as the list endpoint.
 *
 * Nothing here is per-viewer — the space, its counts, its admin list are the
 * same for everyone and already public — so a shared edge copy shows no one
 * anything they could not read themselves.
 */
const SPACE_CACHE = "public, s-maxage=60, stale-while-revalidate=120";

export async function GET(req: NextRequest) {
  const id =
    req.nextUrl.searchParams.get("space") ?? process.env.NEXT_PUBLIC_SPACE_ID!;
  const db = supabaseAdmin();

  const { data: space, error } = await db
    .from("spaces")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !space) {
    return NextResponse.json({ error: "Space not found." }, { status: 404 });
  }

  const { data: proposals } = await db
    .from("proposals")
    .select("id, start_at, end_at, source_vote_count")
    .eq("space_id", id);

  const rows = proposals ?? [];
  const now = Date.now();

  // Imported proposals already carry their source vote count; portal-native
  // ones are counted from the votes table. Summing both avoids double-reading
  // hundreds of imported ballots just to render a header number.
  const nativeIds = rows.filter((p) => !p.source_vote_count).map((p) => p.id);

  let nativeVotes = 0;
  if (nativeIds.length) {
    const { count } = await db
      .from("votes")
      .select("id", { count: "exact", head: true })
      .in("proposal_id", nativeIds);
    nativeVotes = count ?? 0;
  }

  const importedVotes = rows.reduce(
    (sum, p) => sum + (p.source_vote_count ?? 0),
    0
  );

  const activeCount = rows.filter(
    (p) =>
      now >= new Date(p.start_at).getTime() &&
      now <= new Date(p.end_at).getTime()
  ).length;

  const closedCount = rows.filter(
    (p) => now > new Date(p.end_at).getTime()
  ).length;

  // Distinct voters, counted across imported and native ballots alike. Only
  // the address column is read, so this stays one narrow scan rather than
  // pulling every ballot body just to size a set.
  const { data: voterRows } = await db
    .from("votes")
    .select("voter")
    .in(
      "proposal_id",
      rows.map((p) => p.id)
    );

  const voterCount = new Set(
    (voterRows ?? []).map((v) => (v.voter ?? "").toLowerCase())
  ).size;

  const totalVotes = importedVotes + nativeVotes;

  // Only the successful response is cached. A 404 from one bad minute at the
  // database must not be served to everyone for the next one.
  return NextResponse.json({
    space: space as Space,
    stats: {
      proposalCount: rows.length,
      voteCount: totalVotes,
      activeCount,
      closedCount,
      voterCount,
      avgTurnout: rows.length ? Math.round(totalVotes / rows.length) : 0,
    },
  }, { headers: { "Cache-Control": SPACE_CACHE } });
}
