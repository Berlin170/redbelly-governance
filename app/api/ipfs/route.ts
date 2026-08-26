/**
 * How much of this DAO's record is independently checkable right now.
 *
 * Public, and deliberately so. The portal's claim is that a vote can be
 * re-verified without trusting this server, and a claim like that should come
 * with a number rather than a promise. If pinning has been quietly failing for
 * a week, this is where it shows — to the DAO, not only to whoever reads the
 * function logs.
 *
 * Counts only. No credentials, no CIDs, nothing that is not already public in
 * the proposals and votes tables.
 */

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { isMissingColumn, isMissingTable } from "@/lib/pg-errors";
import { pinningStatus } from "@/lib/ipfs";

export const dynamic = "force-dynamic";

type Table = "votes" | "proposals";

async function tally(db: ReturnType<typeof supabaseAdmin>, table: Table) {
  // `head: true` would be the obvious way to ask for a count and nothing else,
  // and it is a trap here: it sends an HTTP HEAD, PostgREST puts the error in
  // the response body, and HEAD throws the body away. A missing column then
  // arrives with no code and no message, so the "run migration 008" branch
  // below could never fire and the endpoint would report a bare 500 instead.
  // `limit(0)` is the same single row-less request over GET, with its errors.
  const base = () => db.from(table).select("id", { count: "exact" }).limit(0);

  const signed = await base().not("signature", "is", null);
  if (signed.error) return { error: signed.error };

  const pinned = await base()
    .not("signature", "is", null)
    .not("source_receipt", "is", null);
  if (pinned.error) return { error: pinned.error };

  // Signed here but with no signed timestamp on file: the payload cannot be
  // rebuilt, so no receipt for these rows will ever be produced. Reported
  // rather than hidden inside the shortfall, because it is a different thing
  // from a pin that has not happened yet — one is pending, one is permanent.
  const unrebuildable = await base()
    .not("signature", "is", null)
    .is("source_receipt", null)
    .is("signed_at", null);
  if (unrebuildable.error) return { error: unrebuildable.error };

  const total = signed.count ?? 0;
  const have = pinned.count ?? 0;
  const stuck = unrebuildable.count ?? 0;
  return {
    signed: total,
    pinned: have,
    pending: Math.max(0, total - have - stuck),
    unrebuildable: stuck,
    coverage: total === 0 ? 1 : Number((have / total).toFixed(4)),
  };
}

export async function GET() {
  const db = supabaseAdmin();
  const [proposals, votes] = await Promise.all([
    tally(db, "proposals"),
    tally(db, "votes"),
  ]);

  for (const r of [proposals, votes]) {
    if ("error" in r && r.error) {
      const migrating = isMissingColumn(r.error) || isMissingTable(r.error);
      return NextResponse.json(
        {
          pinning: pinningStatus(),
          error: migrating
            ? "Receipts are not available yet: run supabase/migrations/008_ipfs_receipts.sql."
            : r.error.message,
        },
        { status: migrating ? 200 : 500 }
      );
    }
  }

  return NextResponse.json({ pinning: pinningStatus(), proposals, votes });
}
