import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import type { Space } from "@/lib/types";

export const dynamic = "force-dynamic";

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
  });
}
