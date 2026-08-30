-- Redbelly Governance Portal — baseline schema
--
-- This is the starting point, NOT the current shape of the database. It
-- creates the original tables; everything since is an ordered migration in
-- ./migrations, and production is this file plus all of them. Reading it alone
-- will tell you there are no source_* columns and no Copeland, both of which
-- have been live since 2026-08-24.
--
-- To build the database from nothing: run this, then ./migrations in numeric
-- order. See ./README.md for what is applied where.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------- spaces
create table if not exists spaces (
  id            text primary key,
  name          text not null,
  about         text,
  avatar_url    text,
  admins        text[] not null default '{}',
  created_at    timestamptz not null default now()
);

-- ------------------------------------------------------------- proposals
create table if not exists proposals (
  id              uuid primary key default gen_random_uuid(),
  space_id        text not null references spaces(id) on delete cascade,
  author          text not null,
  title           text not null,
  body            text not null default '',
  discussion      text,
  choices         jsonb not null,
  voting_system   text not null check (voting_system in (
                    'single-choice','approval','weighted',
                    'quadratic','ranked-choice','one-person-one-vote')),
  strategy        text not null check (strategy in (
                    'native-balance','erc20-balance','verified-identity')),
  token_address   text,
  snapshot_block  bigint,
  quorum          numeric not null default 0,
  start_at        timestamptz not null,
  end_at          timestamptz not null,
  created_at      timestamptz not null default now(),
  signature       text not null,
  results_hash    text,
  anchor_tx       text,
  constraint end_after_start check (end_at > start_at)
);

create index if not exists proposals_space_idx on proposals(space_id, end_at desc);
create index if not exists proposals_author_idx on proposals(author);

-- ----------------------------------------------------------------- votes
create table if not exists votes (
  id            uuid primary key default gen_random_uuid(),
  proposal_id   uuid not null references proposals(id) on delete cascade,
  voter         text not null,
  choice        jsonb not null,
  voting_power  numeric not null,
  reason        text,
  signature     text not null,
  created_at    timestamptz not null default now(),
  -- one ballot per address per proposal; re-voting overwrites via upsert
  unique (proposal_id, voter)
);

create index if not exists votes_proposal_idx on votes(proposal_id, created_at desc);

-- --------------------------------------------------- verified addresses
-- Fallback for the one-person-one-vote strategy until the on-chain
-- Redbelly identity registry is wired up in lib/voting-power.ts.
create table if not exists verified_addresses (
  address     text primary key,
  note        text,
  verified_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- follows
-- Signed, so the count cannot be inflated by anyone able to reach the API.
create table if not exists follows (
  space_id    text not null references spaces(id) on delete cascade,
  follower    text not null,
  signature   text not null,
  created_at  timestamptz not null default now(),
  primary key (space_id, follower)
);

create index if not exists follows_space_idx on follows(space_id, created_at desc);

-- ------------------------------------------------------------------ RLS
alter table spaces             enable row level security;
alter table proposals          enable row level security;
alter table votes              enable row level security;
alter table verified_addresses enable row level security;
alter table follows            enable row level security;

-- Everything is public to read. Governance that nobody can audit is not
-- governance. Writes go only through the API routes, which use the service
-- role key and verify an EIP-712 signature first.
drop policy if exists "public read spaces" on spaces;
create policy "public read spaces" on spaces for select using (true);

drop policy if exists "public read proposals" on proposals;
create policy "public read proposals" on proposals for select using (true);

drop policy if exists "public read votes" on votes;
create policy "public read votes" on votes for select using (true);

drop policy if exists "public read verified" on verified_addresses;
create policy "public read verified" on verified_addresses for select using (true);

drop policy if exists "public read follows" on follows;
create policy "public read follows" on follows for select using (true);

-- --------------------------------------------------------------- seed
insert into spaces (id, name, about)
values ('redbelly-dao', 'Redbelly DAO', 'Governance for the Redbelly Network community.')
on conflict (id) do nothing;
