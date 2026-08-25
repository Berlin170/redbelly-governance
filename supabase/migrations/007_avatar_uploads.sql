-- Throttle avatar uploads. Run this once in the Supabase SQL editor.
--
-- /api/avatar takes no signature, and that is deliberate: an avatar has to
-- exist at a URL before the profile naming it can be signed, so demanding a
-- signature first would mean two wallet prompts to set one picture. The
-- endpoint stays open and stays dumb.
--
-- Open and dumb still needs a ceiling. Without one the endpoint is a free
-- 512 KB write per request against the project's storage quota, repeatable in
-- a loop by anyone who finds it. Proposals already answer this with a rolling
-- daily count per author; uploads have no author to count, so they are counted
-- per caller instead.
--
-- The caller is stored as an HMAC of its IP, never the address itself. A count
-- needs to recognise a repeat visitor, which a keyed digest does, and nothing
-- here needs to know who that visitor was or to hand a readable IP log to
-- anyone who later reads this table.

create table if not exists avatar_uploads (
  id          uuid primary key default gen_random_uuid(),
  caller      text not null,
  created_at  timestamptz not null default now()
);

create index if not exists avatar_uploads_caller_idx
  on avatar_uploads (caller, created_at desc);

comment on table avatar_uploads is
  'Rolling rate-limit ledger for /api/avatar. One row per accepted upload. '
  'Rows older than the window are dead weight and safe to delete.';

comment on column avatar_uploads.caller is
  'HMAC-SHA256 of the caller IP keyed by the service role key. Not reversible '
  'to an address, and only ever compared against itself.';
