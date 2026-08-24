-- Migration 003 — Copeland voting, and verifiable provenance for imports
-- Run this in the Supabase SQL editor after 002_snapshot_import.sql.

-- ------------------------------------------------------- copeland voting
-- Copeland is now tallied natively (lib/voting.ts), so it stops being folded
-- into ranked-choice on import. The two methods can disagree about a winner,
-- which is exactly why it needs its own value rather than an approximation.
alter table proposals drop constraint if exists proposals_voting_system_check;

alter table proposals add constraint proposals_voting_system_check
  check (voting_system in (
    'single-choice','approval','weighted',
    'quadratic','ranked-choice','copeland','one-person-one-vote'));

-- --------------------------------------------------------- provenance
-- Every Snapshot proposal and ballot is pinned to IPFS and signed by its
-- author. Carrying those receipts across means an imported record can be
-- checked against its origin by anyone, instead of being taken on trust
-- because this site says so.
alter table proposals add column if not exists source_receipt text;
alter table votes     add column if not exists source_receipt text;

-- The original author/voter signature as recorded by the source. It does not
-- verify against this portal's EIP-712 domain and is never presented as if it
-- did — it is kept so the ballot stays auditable at the source.
alter table votes add column if not exists source_signature text;
