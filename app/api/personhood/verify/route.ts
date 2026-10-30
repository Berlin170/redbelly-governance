import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { selfVerifier } from "@/lib/personhood";
import { personhoodEnabled } from "@/lib/personhood-config";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/personhood/verify — called by the Self app, not by the browser.
 *
 * The member's phone posts the proof here once they have scanned their
 * document. Self expects `{ status, result }` back and shows `reason` to the
 * member when it fails, so every refusal is written for them to read on a
 * phone screen.
 *
 * Order of checks: the proof first, because it is the only input that cannot
 * be forged, then the session it names, then the two uniqueness constraints,
 * which the database enforces so that two phones racing cannot both win.
 */
function refuse(reason: string) {
  return NextResponse.json({ status: "error", result: false, reason }, { status: 200 });
}

export async function POST(req: NextRequest) {
  if (!personhoodEnabled) return refuse("Self verification is not enabled on this portal.");

  let body: {
    attestationId?: number;
    proof?: unknown;
    publicSignals?: unknown;
    userContextData?: string;
  };
  try {
    body = await req.json();
  } catch {
    return refuse("The proof could not be read.");
  }

  const { attestationId, proof, publicSignals, userContextData } = body;
  if (!attestationId || !proof || !Array.isArray(publicSignals) || typeof userContextData !== "string") {
    return refuse("The proof is incomplete. Please scan again.");
  }

  let result;
  try {
    result = await selfVerifier().verify(
      attestationId as 1 | 2 | 3 | 4,
      proof as Parameters<ReturnType<typeof selfVerifier>["verify"]>[1],
      publicSignals as string[],
      userContextData
    );
  } catch (err) {
    console.warn("[personhood] proof rejected:", err instanceof Error ? err.message : err);
    return refuse("This proof could not be verified. Please scan again.");
  }

  if (!result.isValidDetails.isValid) {
    return refuse("This proof could not be verified. Please scan again.");
  }

  const sessionId = result.userData.userIdentifier;
  const nullifier = String(result.discloseOutput.nullifier);
  const db = supabaseAdmin();

  const { data: session, error: sErr } = await db
    .from("personhood_sessions")
    .select("id, address, expires_at, used_at")
    .eq("id", sessionId)
    .maybeSingle();

  if (sErr || !session) return refuse("This QR code is not recognised. Start again from the portal.");
  if (session.used_at) return refuse("This QR code has already been used. Start again from the portal.");
  if (new Date(session.expires_at).getTime() < Date.now()) {
    return refuse("This QR code has expired. Start again from the portal.");
  }

  // Spent before the binding is written, and only if nobody spent it first.
  // A QR code is a one-time ticket; two phones scanning it get one binding.
  const { data: spent } = await db
    .from("personhood_sessions")
    .update({ used_at: new Date().toISOString() })
    .eq("id", session.id)
    .is("used_at", null)
    .select("id");
  if (!spent?.length) return refuse("This QR code has already been used. Start again from the portal.");

  const { error: bErr } = await db.from("personhood_bindings").insert({
    nullifier,
    address: session.address,
    attestation_id: Number(result.attestationId),
    session_id: session.id,
  });

  if (bErr) {
    if (bErr.code === "23505") {
      // Which constraint fired decides what the member is told. Both are
      // ordinary: a second wallet, or a second document for this wallet.
      const reason = /nullifier/.test(bErr.message ?? "")
        ? "This document is already linked to another wallet. One person can verify one wallet."
        : "This wallet is already verified.";
      return refuse(reason);
    }
    console.error("[personhood] binding failed:", bErr.message);
    return refuse("Verification worked but could not be saved. Please try again.");
  }

  return NextResponse.json({ status: "success", result: true }, { status: 200 });
}
