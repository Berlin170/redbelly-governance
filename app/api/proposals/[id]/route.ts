import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { resultsFor } from "@/lib/results";
import type { Proposal, Vote } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = supabaseAdmin();

  const [{ data: proposal, error: pErr }, { data: votes, error: vErr }] =
    await Promise.all([
      db.from("proposals").select("*").eq("id", id).single(),
      db.from("votes").select("*").eq("proposal_id", id).order("voting_power", { ascending: false }),
    ]);

  if (pErr) return NextResponse.json({ error: "Proposal not found." }, { status: 404 });
  if (vErr) return NextResponse.json({ error: vErr.message }, { status: 500 });

  const results = resultsFor(proposal as Proposal, (votes ?? []) as Vote[]);

  // The 11-point check this proposal passed, published beside it so a reader
  // can see what was checked and why it passed. `caller` is never selected.
  let screening = null;
  if (proposal.screening_id) {
    const { data } = await db
      .from("proposal_screenings")
      .select("id, passed, requests_funds, criteria, model, created_at")
      .eq("id", proposal.screening_id)
      .maybeSingle();
    screening = data;
  }

  return NextResponse.json({ proposal, votes: votes ?? [], results, screening });
}
