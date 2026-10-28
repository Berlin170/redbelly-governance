import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { isMissingTable } from "@/lib/pg-errors";
import { LIMITS, dayAgo } from "@/lib/limits";
import { callerId } from "@/lib/caller";
import { contentHash, screenProposal, screeningEnabled } from "@/lib/screening";

export const dynamic = "force-dynamic";
// Two model attempts at up to 90s each, with room to spare.
export const maxDuration = 200;

/** Whether publishing requires the check, so /create knows to offer it. */
export async function GET() {
  return NextResponse.json({ enabled: screeningEnabled() });
}

/**
 * Run the 11-point check on a draft and record the verdict.
 *
 * Takes no signature, deliberately: an author should be able to check, fix and
 * check again without a wallet prompt each time. What makes a pass worth
 * anything is that publishing looks it up by the hash of the exact text, so
 * passing one draft and signing another gets nothing.
 */
export async function POST(req: NextRequest) {
  if (!screeningEnabled()) {
    return NextResponse.json(
      { error: "The proposal check is not configured on this portal." },
      { status: 503 }
    );
  }

  try {
    const { title, body, space } = await req.json();
    if (typeof title !== "string" || !title.trim()) {
      return NextResponse.json({ error: "Give the proposal a title." }, { status: 400 });
    }
    if (typeof body !== "string" || !body.trim()) {
      return NextResponse.json(
        { error: "Write the proposal before checking it." },
        { status: 400 }
      );
    }
    if (title.length > LIMITS.titleChars || body.length > LIMITS.bodyChars) {
      return NextResponse.json({ error: "The proposal is too long." }, { status: 400 });
    }

    const db = supabaseAdmin();
    const caller = callerId(req);

    // Counted before the model is called: a caller past its ceiling should
    // not cost anything to refuse.
    const { count, error: countError } = await db
      .from("proposal_screenings")
      .select("id", { count: "exact", head: true })
      .eq("caller", caller)
      .gte("created_at", dayAgo());

    if (isMissingTable(countError)) {
      console.warn(
        "[screening] proposal_screenings is missing — run " +
          "supabase/migrations/011_proposal_screening.sql."
      );
      return NextResponse.json(
        { error: "The proposal check is not set up yet. Ask an admin to run migration 011." },
        { status: 503 }
      );
    }
    if (countError) throw countError;

    if ((count ?? 0) >= LIMITS.screeningsPerCallerPerDay) {
      return NextResponse.json(
        { error: "Too many checks today. Try again tomorrow." },
        { status: 429 }
      );
    }

    const verdict = await screenProposal(title, body);

    const { data, error } = await db
      .from("proposal_screenings")
      .insert({
        space_id: typeof space === "string" && space ? space : process.env.NEXT_PUBLIC_SPACE_ID!,
        content_hash: contentHash(title, body),
        passed: verdict.passed,
        requests_funds: verdict.requests_funds,
        criteria: verdict.criteria,
        model: verdict.model,
        caller,
      })
      .select("id, created_at")
      .single();

    if (error) throw error;

    return NextResponse.json({
      screening: { ...verdict, id: data.id, created_at: data.created_at },
    });
  } catch (err) {
    console.error("[screening]", err);
    return NextResponse.json(
      { error: "The check could not be run right now. Try again in a minute." },
      { status: 502 }
    );
  }
}
