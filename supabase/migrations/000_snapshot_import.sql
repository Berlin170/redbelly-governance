-- Migration 000 — Snapshot import + richer space metadata
-- Run this in the Supabase SQL editor after schema.sql.
--
-- Numbered 000, not 002. It was written as "002" while it lived in supabase/
-- rather than supabase/migrations/, which already had a different 002 — so the
-- one number named two migrations and 003_copeland.sql was missed for a day
-- because of it. This is the earliest change on top of the baseline, so it
-- takes the number below the series instead of pushing every later file up.

-- ---------------------------------------------------------------- spaces
-- Space header needs a banner, links and follower count to look like a real
-- governance home rather than a bare list.
alter table spaces add column if not exists banner_url      text;
alter table spaces add column if not exists website         text;
alter table spaces add column if not exists twitter         text;
alter table spaces add column if not exists github          text;
alter table spaces add column if not exists discord         text;
alter table spaces add column if not exists followers_count integer not null default 0;
alter table spaces add column if not exists members         text[] not null default '{}';
alter table spaces add column if not exists snapshot_space  text;
alter table spaces add column if not exists symbol          text;

-- ------------------------------------------------------------- proposals
-- Imported history has no EIP-712 signature over our domain, so signature
-- becomes nullable and `source` records where a row actually came from.
-- Nothing imported is presented as signature-verified.
alter table proposals alter column signature drop not null;

alter table proposals add column if not exists source        text not null default 'native';
alter table proposals add column if not exists source_id     text;
alter table proposals add column if not exists source_url    text;
alter table proposals add column if not exists source_type   text;

-- Final tallies as Snapshot recorded them. For imported proposals these are
-- displayed verbatim instead of being recomputed, so the numbers on this site
-- always match the numbers the DAO already voted on.
alter table proposals add column if not exists source_scores       jsonb;
alter table proposals add column if not exists source_scores_total numeric;
alter table proposals add column if not exists source_vote_count   integer;

-- Full index, not a partial one: Postgres can only infer a partial unique
-- index for ON CONFLICT when the statement carries a matching WHERE clause,
-- which an upsert does not. NULL source_id rows (portal-native proposals)
-- never collide, since NULLs are distinct in a unique index.
create unique index if not exists proposals_source_uidx
  on proposals(source, source_id);

-- ----------------------------------------------------------------- votes
alter table votes alter column signature drop not null;
alter table votes add column if not exists source    text not null default 'native';
alter table votes add column if not exists source_id text;

create unique index if not exists votes_source_uidx
  on votes(source, source_id);

-- Imported ballots predate this system, so `created_at` must carry Snapshot's
-- original timestamp rather than the row insert time.
alter table votes add column if not exists voted_at timestamptz;
