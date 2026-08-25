import { NextRequest, NextResponse } from "next/server";
import { verifyTypedData, getAddress, isAddress } from "viem";
import { supabaseAdmin } from "@/lib/supabase";
import { isMissingTable, isMissingColumn } from "@/lib/pg-errors";
import { domain, profileTypes } from "@/lib/eip712";
import { normalizeProfile, unnormalizedFields } from "@/lib/profile-fields";
import { MAX_CLOCK_SKEW_SECONDS } from "@/lib/limits";

export const dynamic = "force-dynamic";

/**
 * GET /api/profile?addresses=0x..,0x..  — batch lookup for lists
 * GET /api/profile?address=0x..         — one profile
 *
 * Lists resolve in one request rather than one per row: a voters table with
 * fifty rows should not make fifty calls.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const single = searchParams.get("address");
  const many = searchParams.get("addresses");

  const raw = single ? [single] : (many ?? "").split(",").filter(Boolean);
  // isAddress takes an options argument second, which filter would fill with
  // the index, so it is called explicitly rather than passed by reference.
  const addresses = [...new Set(raw.map((a) => a.trim()).filter((a) => isAddress(a)))]
    .slice(0, 200)
    .map((a) => getAddress(a));

  if (addresses.length === 0) return NextResponse.json({ profiles: {} });

  const db = supabaseAdmin();
  const { data, error } = await db
    .from("profiles")
    .select("address, display_name, bio, avatar_url, twitter, github")
    .in("address", addresses);

  // Before the migration runs, every address simply has no profile. The
  // portal reads the same either way, which is what keeps a half-deployed
  // schema from taking the proposal list down with it.
  if (isMissingTable(error)) {
    return NextResponse.json({ profiles: {}, available: false });
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const profiles: Record<string, unknown> = {};
  for (const row of data ?? []) profiles[row.address.toLowerCase()] = row;

  return NextResponse.json({ profiles, available: true });
}

export async function POST(req: NextRequest) {
  try {
    const { message, signature } = await req.json();

    const valid = await verifyTypedData({
      address: message.from,
      domain,
      types: profileTypes,
      primaryType: "Profile",
      message: { ...message, timestamp: BigInt(message.timestamp) },
      signature,
    });

    if (!valid) {
      return NextResponse.json({ error: "Signature does not match." }, { status: 401 });
    }

    // What was signed has to be what gets stored. Sanitising after the check
    // and keeping the sanitised value is how the row and the signature beside
    // it drifted apart: "@alice" was signed, "alice" was kept, and nobody
    // could re-verify the result. buildProfileMessage normalises before the
    // wallet sees the payload, so a genuine client never lands here.
    const drifted = unnormalizedFields(message);
    if (drifted.length > 0) {
      return NextResponse.json(
        { error: `These fields are not in their stored form: ${drifted.join(", ")}.` },
        { status: 400 }
      );
    }

    const signedAt = Number(message.timestamp);
    if (!Number.isFinite(signedAt)) {
      return NextResponse.json({ error: "Profile is missing a timestamp." }, { status: 400 });
    }
    if (signedAt > Math.floor(Date.now() / 1000) + MAX_CLOCK_SKEW_SECONDS) {
      return NextResponse.json(
        { error: "This profile is dated in the future. Check your device clock." },
        { status: 400 }
      );
    }

    const address = getAddress(message.from);
    const db = supabaseAdmin();

    // Same floor the votes table keeps. Profile signatures are not published,
    // so a replay needs a copy that is not easy to come by — but an address
    // that can only ever move its profile forwards costs one indexed read.
    const { data: prior, error: priorErr } = await db
      .from("profiles")
      .select("signed_at")
      .eq("address", address)
      .maybeSingle();

    const guarded = !isMissingColumn(priorErr);

    if (isMissingTable(priorErr)) {
      return NextResponse.json(
        { error: "Profiles are not enabled yet on this deployment." },
        { status: 503 }
      );
    }

    if (guarded && prior?.signed_at != null && signedAt <= Number(prior.signed_at)) {
      return NextResponse.json(
        { error: "This profile has already been saved. Sign again to change it." },
        { status: 409 }
      );
    }

    const fields = normalizeProfile(message);
    const row = {
      address,
      // Empty is absent in the table and "" in the signed payload; the two
      // spellings mean the same thing and only the column is picky.
      display_name: fields.displayName || null,
      bio: fields.bio || null,
      avatar_url: fields.avatar || null,
      twitter: fields.twitter || null,
      github: fields.github || null,
      signature,
      ...(guarded ? { signed_at: signedAt } : {}),
      updated_at: new Date().toISOString(),
    };

    const { error } = await db.from("profiles").upsert(row, { onConflict: "address" });

    if (error) {
      const missing = isMissingTable(error);
      return NextResponse.json(
        { error: missing ? "Profiles are not enabled yet on this deployment." : error.message },
        { status: missing ? 503 : 500 }
      );
    }

    return NextResponse.json({ profile: row });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Could not save the profile.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
