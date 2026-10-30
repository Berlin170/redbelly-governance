-- Migration 012 — one person, one wallet (Self)
-- Run this in the Supabase SQL editor after 011_proposal_screening.sql.
--
-- Redbelly's access contract proves that an address belongs to a verified
-- person. It cannot prove that two addresses belong to two different people:
-- one credential enables roughly ten addresses and nothing on chain groups
-- them (see lib/identity.ts). This migration adds the missing half from
-- outside the chain.
--
-- A member scans an identity document in the Self app (passport, a biometric
-- national ID such as Pakistan's NIC, or Aadhaar). Self returns a nullifier:
-- a number that is the same every time the same document proves itself to
-- this portal, and reveals nothing else about it. Each nullifier may be bound
-- to exactly one wallet, and each wallet to exactly one nullifier. A second
-- wallet presenting the same document is refused.
--
-- The ceiling this leaves is the number of *documents* a person holds, not
-- the number of wallets they can credential. Someone with both a passport and
-- a NIC produces two different nullifiers, because Self derives them per
-- document. That is a small, fixed number, against roughly ten today.
--
-- All three objects are RLS-on with no policy. The binding table links a
-- wallet to a nullifier, which is exactly the pairing nobody should be able
-- to page through; it is read only by the API, with the service key.

-- A sign-in for the Self app. The member signs with their wallet, which is
-- how this portal knows the wallet is theirs; the Self app then carries the
-- session id inside the proof, which is how the proof finds the wallet.
create table if not exists personhood_sessions (
  id          uuid primary key default gen_random_uuid(),
  address     text not null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  used_at     timestamptz
);

create index if not exists personhood_sessions_address_idx
  on personhood_sessions (address, created_at desc);

alter table personhood_sessions enable row level security;

-- One row per person per wallet. Both columns unique: that pair of
-- constraints *is* the feature, so it lives in the database rather than in
-- application code that a race could get past.
create table if not exists personhood_bindings (
  id              uuid primary key default gen_random_uuid(),
  nullifier       text not null unique,
  address         text not null unique,
  attestation_id  smallint not null,
  session_id      uuid references personhood_sessions(id),
  bound_at        timestamptz not null default now()
);

alter table personhood_bindings enable row level security;

comment on table personhood_bindings is
  'Self nullifier <-> wallet, one to one. Addresses stored lowercase. RLS on, '
  'no policy: served only through /api/personhood, never straight from PostgREST.';

-- The person behind a ballot, stamped at the moment it is cast: the binding's
-- own id, never the nullifier. Null for wallets with no binding and for all
-- history before this migration.
alter table votes
  add column if not exists identity_key text;

-- A person votes once per proposal, whichever wallet they use. Bindings are
-- one to one, so this cannot fire today; it is here so that it still holds on
-- the day a binding is moved to a new wallet mid-vote.
create unique index if not exists votes_proposal_identity_key
  on votes (proposal_id, identity_key)
  where identity_key is not null;

-- Strict mode. A proposal with this set counts only wallets bound to a Self
-- identity before the proposal was created, so the electorate is frozen the
-- same way snapshot blocks freeze balances.
--
-- Default false: proposals already open were written under terms that did not
-- include it, and adding a gate to a live vote would change the rules midway.
alter table proposals
  add column if not exists require_unique boolean not null default false;
