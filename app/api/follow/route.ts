import { NextRequest, NextResponse } from "next/server";
import { verifyTypedData, getAddress } from "viem";
import { supabaseAdmin } from "@/lib/supabase";
import { domain, followTypes } from "@/lib/eip712";

export const dynamic = "force-dynamic";

/**
 * "The follows table is not there yet."
 *
 * Postgres says 42P01, but PostgREST answers from its own schema cache and
 * reports PGRST205 with a different message, which is what actually comes
 * back through supabase-js. Both are checked, and the message as a last
 * resort, so the fallback triggers on the error that really arrives.
 */
function isMissingTable(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    /schema cache/i.test(error.message ?? "")
  );
}

/**
 * Follower counts, and following as a signed action.
 *
 * The count shown is the imported Snapshot following plus everyone who has
 * followed here. Dropping the imported number the day this shipped would have
 * told the DAO it had lost its community, when all that changed was where the
 * list is kept.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const space = searchParams.get("space");
  const address = searchParams.get("address");

  if (!space) {
    return NextResponse.json({ error: "space is required." }, { status: 400 });
  }

  const db = supabaseAdmin();

  const { data: spaceRow } = await db
    .from("spaces")
    .select("followers_count")
    .eq("id", space)
    .maybeSingle();

  const imported = spaceRow?.followers_count ?? 0;

  const { count, error } = await db
    .from("follows")
    .select("follower", { count: "exact", head: true })
    .eq("space_id", space);

  // The table is created by a migration the operator runs. Until then the
  // page should still show the imported count rather than an error.
  if (isMissingTable(error)) {
    return NextResponse.json({ count: imported, following: false, available: false });
  }

  let following = false;
  if (address) {
    const { data } = await db
      .from("follows")
      .select("follower")
      .eq("space_id", space)
      .eq("follower", getAddress(address))
      .maybeSingle();
    following = !!data;
  }

  return NextResponse.json({
    count: imported + (count ?? 0),
    following,
    available: true,
  });
}

export async function POST(req: NextRequest) {
  try {
    const { message, signature } = await req.json();

    const valid = await verifyTypedData({
      address: message.from,
      domain,
      types: followTypes,
      primaryType: "Follow",
      message: { ...message, timestamp: BigInt(message.timestamp) },
      signature,
    });

    if (!valid) {
      return NextResponse.json({ error: "Signature does not match." }, { status: 401 });
    }

    const db = supabaseAdmin();
    const follower = getAddress(message.from);

    const { error } = message.following
      ? await db
          .from("follows")
          .upsert(
            { space_id: message.space, follower, signature },
            { onConflict: "space_id,follower" }
          )
      : await db
          .from("follows")
          .delete()
          .eq("space_id", message.space)
          .eq("follower", follower);

    if (error) {
      const missing = isMissingTable(error);
      const status = missing ? 503 : 500;
      const msg = missing
        ? "Following is not enabled yet on this deployment."
        : error.message;
      return NextResponse.json({ error: msg }, { status });
    }

    return NextResponse.json({ following: !!message.following });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Could not update following.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
