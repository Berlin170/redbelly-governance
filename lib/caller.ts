import { createHmac } from "crypto";
import type { NextRequest } from "next/server";

/**
 * Who is calling, as a number rather than a name.
 *
 * A rolling count has to recognise a repeat caller, which a keyed digest does,
 * and nothing beyond that needs to know whose address it was. Keying it means
 * the stored value cannot be walked back to an IP by anyone who later reads
 * the table, and salting it with a server-only secret means it cannot be
 * confirmed by guessing either.
 *
 * Shared by the endpoints that take no signature and so have no author to
 * count against: avatar uploads and the proposal check.
 */
export function callerId(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || req.headers.get("x-real-ip") || "unknown";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  return createHmac("sha256", key).update(ip).digest("hex");
}
