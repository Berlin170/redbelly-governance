import { NextRequest, NextResponse } from "next/server";
import { verifyTypedData, getAddress } from "viem";
import { supabaseAdmin } from "@/lib/supabase";
import { isMissingTable } from "@/lib/pg-errors";
import { domain, followTypes } from "@/lib/eip712";

export const dynamic = "force-dynamic";

/**
 * Follower counts, and following as a signed action.
 *
 * The count is count(*) over the follows table and nothing else. The imported
 * Snapshot following used to be added on top as spaces.followers_count, which
 * kept the DAO's community visible on day one but froze it: the scalar was
 * read once and never moved again, so the portal drifted from Snapshot and
 * from itself. Those followers are rows in this table now — see
 * supabase/migrations/002_follow_sources.sql — and the column survives only as
 * the fallback for a deployment that has yet to run the migrations.
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

  // Only reached when the follows table is missing entirely.
  const imported = spaceRow?.followers_count ?? 0;

  // limit(0) rather than head:true. A head request throws away the response
  // body, and PostgREST puts the "no such table" code in the body — so the
  // missing-table check below never saw it and the endpoint claimed following
  // was available before the migration had run.
  const { count, error } = await db
    .from("follows")
    .select("follower", { count: "exact" })
    .eq("space_id", space)
    .limit(0);

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
    count: count ?? 0,
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
          // source is set, not left to the default: an imported follower who
          // signs here has stopped being hearsay and should say so.
          .upsert(
            { space_id: message.space, follower, signature, source: "portal" },
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
