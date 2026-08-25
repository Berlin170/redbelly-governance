import { NextRequest, NextResponse } from "next/server";
import { verifyTypedData, getAddress, isAddress } from "viem";
import { supabaseAdmin } from "@/lib/supabase";
import { domain, profileTypes } from "@/lib/eip712";

export const dynamic = "force-dynamic";

const NAME_MAX = 40;
const BIO_MAX = 200;

/** Same missing-table shape the follows endpoint learned the hard way. */
function isMissingTable(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    /schema cache/i.test(error.message ?? "")
  );
}

/**
 * A handle is only ever a label on an address, never a substitute for it.
 * Anyone can sign the name "Redbelly Foundation", so the UI keeps the address
 * beside the name and this endpoint makes no attempt to police what people
 * call themselves. What the signature buys is narrower and worth having: the
 * name against an address was put there by that address.
 */
function clean(value: unknown, max: number) {
  if (typeof value !== "string") return null;
  // Control characters and the bidi overrides that let a name render as
  // something other than what is stored.
  const stripped = value.replace(/[\u0000-\u001f\u007f\u200e\u200f\u202a-\u202e]/g, "").trim();
  if (!stripped) return null;
  return stripped.slice(0, max);
}

/** Only http(s) images. A javascript: or data: avatar is a script, not a face. */
function cleanUrl(value: unknown) {
  const s = clean(value, 500);
  if (!s) return null;
  try {
    const u = new URL(s);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/** Handles are stored bare, so "@name" and a pasted profile URL both work. */
function cleanHandle(value: unknown) {
  const s = clean(value, 40);
  if (!s) return null;
  return s.replace(/^@/, "").replace(/^https?:\/\/[^/]+\//, "").replace(/\/$/, "");
}

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

    const address = getAddress(message.from);
    const row = {
      address,
      display_name: clean(message.displayName, NAME_MAX),
      bio: clean(message.bio, BIO_MAX),
      avatar_url: cleanUrl(message.avatar),
      twitter: cleanHandle(message.twitter),
      github: cleanHandle(message.github),
      signature,
      updated_at: new Date().toISOString(),
    };

    const db = supabaseAdmin();
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
