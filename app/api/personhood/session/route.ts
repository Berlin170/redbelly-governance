import { NextRequest, NextResponse } from "next/server";
import { getAddress, isAddress, verifyTypedData } from "viem";
import { supabaseAdmin } from "@/lib/supabase";
import { isMissingTable } from "@/lib/pg-errors";
import { domain, personhoodTypes } from "@/lib/eip712";
import { bindingFor } from "@/lib/personhood";
import { personhoodEnabled, SESSION_MINUTES } from "@/lib/personhood-config";
import { isIdentityVerified } from "@/lib/voting-power";
import { MAX_CLOCK_SKEW_SECONDS } from "@/lib/limits";

export const dynamic = "force-dynamic";
export const maxDuration = 30;
const headers = { "Cache-Control": "no-store" };

const SPACE = process.env.NEXT_PUBLIC_SPACE_ID ?? "redbelly-dao";

/**
 * POST /api/personhood/session — open a Self session for a wallet.
 *
 * Takes a signed `Personhood` message and returns a session id for the QR
 * code. The signature is what ties the eventual proof to a wallet its owner
 * controls; the session id is how the proof, arriving later from a phone,
 * finds that wallet again.
 *
 * Only Redbelly-verified wallets may open one. Binding exists to say "this
 * verified wallet is this person's only one", which means nothing for a
 * wallet that is not verified to begin with, and refusing here spares the
 * member a scan that could never count.
 */
export async function POST(req: NextRequest) {
  if (!personhoodEnabled) {
    return NextResponse.json({ error: "Self verification is not enabled on this portal." }, { status: 404, headers });
  }

  try {
    const { message, signature } = await req.json();
    if (!message || !isAddress(message.from ?? "")) {
      return NextResponse.json({ error: "A signed request is required." }, { status: 400, headers });
    }

    const valid = await verifyTypedData({
      address: message.from,
      domain,
      types: personhoodTypes,
      primaryType: "Personhood",
      message: { ...message, timestamp: BigInt(message.timestamp) },
      signature,
    });
    if (!valid) {
      return NextResponse.json({ error: "Signature does not match this wallet." }, { status: 401, headers });
    }
    if (message.space !== SPACE) {
      return NextResponse.json({ error: "This request was signed for a different space." }, { status: 400, headers });
    }

    // Fresh, not merely valid. A signature is the only thing standing between
    // a stranger and opening a session for someone else's wallet, so an old
    // one is not accepted even though it would still verify.
    const signedAt = Number(message.timestamp);
    const now = Math.floor(Date.now() / 1000);
    if (!Number.isFinite(signedAt) || signedAt > now + MAX_CLOCK_SKEW_SECONDS || signedAt < now - 10 * 60) {
      return NextResponse.json({ error: "This request has expired. Sign again." }, { status: 400, headers });
    }

    const address = getAddress(message.from);

    const existing = await bindingFor(address);
    if (existing.state === "not-installed") {
      return NextResponse.json(
        { error: "Self verification needs migration 012 before it can be used." },
        { status: 503, headers }
      );
    }
    if (existing.state === "bound") {
      return NextResponse.json({ error: "This wallet is already verified as one person." }, { status: 409, headers });
    }

    const verified = await isIdentityVerified(address);
    if (!verified) {
      return NextResponse.json(
        {
          error:
            "Complete Redbelly KYC for this wallet first. Self verification " +
            "is for wallets that can already vote as a verified person.",
        },
        { status: 403, headers }
      );
    }

    const { data, error } = await supabaseAdmin()
      .from("personhood_sessions")
      .insert({
        address: address.toLowerCase(),
        expires_at: new Date(Date.now() + SESSION_MINUTES * 60_000).toISOString(),
      })
      .select("id, expires_at")
      .single();

    if (error) {
      if (isMissingTable(error)) {
        return NextResponse.json(
          { error: "Self verification needs migration 012 before it can be used." },
          { status: 503, headers }
        );
      }
      return NextResponse.json({ error: "Could not start verification." }, { status: 500, headers });
    }

    return NextResponse.json({ sessionId: data.id, expiresAt: data.expires_at }, { headers });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Could not start verification.";
    return NextResponse.json({ error: msg }, { status: 400, headers });
  }
}
