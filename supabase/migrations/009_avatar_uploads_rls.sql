-- Close the last table without row level security. Run once in the SQL editor.
--
-- Every other table in this schema enables RLS and then grants a public read:
-- spaces, proposals, votes, verified_addresses, follows, profiles. avatar_uploads
-- was created by 007 and never got either, which makes it the one table where
-- Supabase's default applies instead of ours — and that default is that the
-- anon role, whose key is designed to be public, may select, insert, update and
-- delete through PostgREST.
--
-- Nothing exploits this today. The Supabase URL and anon key appear in zero
-- built client files: lib/supabase.ts is imported only by API routes and server
-- components, so the browser is never handed the pair needed to reach PostgREST
-- directly. This is the gap closing before something opens it — the day anyone
-- adds a client-side Supabase call, Next.js inlines both values into the bundle
-- and this table becomes writable by anyone who reads the page source.
--
-- What it would cost: avatar_uploads is the ledger /api/avatar counts against to
-- rate-limit an endpoint that deliberately takes no signature. Delete its rows
-- and the throttle resets, which turns the endpoint back into a free 512 KB
-- write per request against the project's storage quota, repeatable in a loop.
-- Quota abuse rather than vote manipulation, but it is the one table where the
-- fix is this short.
--
-- Deliberately NO policy is added.
--
-- A public read policy would be wrong here in a way it is not for the other
-- tables. Those hold the governance record and are meant to be read by anyone —
-- that is the point of publishing signatures. This one holds an HMAC of a
-- caller's IP and exists only to be counted against; nobody outside the rate
-- limiter has any business reading it. RLS enabled with no policy denies every
-- ordinary role outright, which is the correct answer.
--
-- The application is unaffected. /api/avatar reaches this table exclusively
-- through supabaseAdmin(), and the service role bypasses RLS by definition.

alter table avatar_uploads enable row level security;

comment on table avatar_uploads is
  'Rolling rate-limit ledger for /api/avatar. One row per accepted upload. '
  'Rows older than the window are dead weight and safe to delete. '
  'RLS is on with no policy: reachable only by the service role, never by anon.';
