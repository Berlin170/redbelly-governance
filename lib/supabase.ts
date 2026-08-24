import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;

/** Browser + read-only server use. Row Level Security applies. */
export const supabase = createClient(
  url,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

/**
 * Server-only. Bypasses RLS, so it must never be imported into a client
 * component. Writes go through the API routes, which verify signatures first.
 */
export function supabaseAdmin() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
