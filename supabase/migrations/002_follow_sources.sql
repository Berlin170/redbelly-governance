-- Followers as people, not as a number. Run this once in the Supabase SQL editor.
--
-- The imported Snapshot following used to live in spaces.followers_count: a
-- scalar frozen at import time that the API added on top of every real follow.
-- It could only ever drift, and it did — Snapshot had moved from 67 to 68
-- while this portal still showed the number it copied down.
--
-- These columns let the imported followers live here as ordinary rows, so the
-- count is count(*) and nothing is frozen.

alter table follows add column if not exists source text not null default 'portal';

-- Imported follows carry no signature. Nobody signed anything on this portal,
-- and claiming otherwise would be the same lie the imported proposals avoid.
alter table follows alter column signature drop not null;

alter table follows drop constraint if exists follows_source_check;
alter table follows add constraint follows_source_check
  check (source in ('portal', 'snapshot'));

-- A follow made here, though, must carry the signature that proves it.
alter table follows drop constraint if exists follows_portal_signed;
alter table follows add constraint follows_portal_signed
  check (source <> 'portal' or signature is not null);
