-- Migration 011 — the 11-point proposal check
-- Run this in the Supabase SQL editor after 010_identity_quorum.sql.
--
-- The DAO's own rule for funding proposals is that each one is run through AI
-- against an 11-point checklist and needs a green tick on every section before
-- it goes to a vote. Until now that was done by hand, by whoever was around,
-- which is the step Buffy named as the one that stalls.
--
-- /api/proposals/screen runs the check and records the verdict here, keyed by
-- a hash of the exact title and body it read. Publishing looks the hash up:
-- the text that goes to a vote has to be the text that passed, so a proposal
-- cannot pass the check and then be edited into something else before signing.
--
-- `caller` is an HMAC of the IP, as in avatar_uploads, and exists only so the
-- endpoint (which costs money per call and takes no signature) can be
-- throttled. RLS is on with no policy: the verdicts are served to readers
-- through the API, never straight from PostgREST, so the caller column is
-- never handed to anyone.

create table if not exists proposal_screenings (
  id              uuid primary key default gen_random_uuid(),
  space_id        text not null,
  content_hash    text not null,
  passed          boolean not null,
  requests_funds  boolean not null,
  criteria        jsonb not null,
  model           text not null,
  caller          text not null,
  created_at      timestamptz not null default now()
);

create index if not exists proposal_screenings_hash_idx
  on proposal_screenings (content_hash, created_at desc);

create index if not exists proposal_screenings_caller_idx
  on proposal_screenings (caller, created_at desc);

alter table proposal_screenings enable row level security;

comment on table proposal_screenings is
  'One row per run of the 11-point AI check. Publishing requires a passing row '
  'whose content_hash matches the signed title and body. RLS on, no policy.';

-- Which check a proposal went to a vote on. Null on everything published
-- before this migration, on imported history, and on proposals a space admin
-- published without a pass (the manual override for a check that got it wrong).
alter table proposals
  add column if not exists screening_id uuid references proposal_screenings(id);
