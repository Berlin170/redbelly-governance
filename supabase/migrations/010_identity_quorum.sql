-- Migration 010 — identity quorum
-- Run this in the Supabase SQL editor after 009_avatar_uploads_rls.sql.
--
-- `quorum` asks how much voting power turned up. One address can answer that
-- on its own: a holder with enough RBNT clears any power threshold the DAO
-- sets, and the proposal then reads as though the room agreed when nobody
-- else was in it. Every wallet-level platform has this hole and none of them
-- can close it, because a wallet count is not a people count.
--
-- This column asks the other question — how many distinct verified people
-- turned up — which is a question this deployment can actually answer, since
-- eligibility is read from Redbelly's access contract rather than guessed at
-- from balances. A proposal may set either threshold, both, or neither; both
-- must be met for the vote to carry.
--
-- What it is worth is bounded by what the chain can tell us. One credential
-- currently enables several addresses, measured at roughly ten, so this
-- counts verified addresses and not yet verified humans. That caps a split
-- at about tenfold rather than removing it. See lib/identity.ts for where
-- that ceiling lifts if a per-person nullifier ever lands.
--
-- Default 0 (off): proposals already open were written under terms that did
-- not include this, and introducing a threshold to a live vote would change
-- the rules midway through the count.

alter table proposals
  add column if not exists identity_quorum integer not null default 0;

alter table proposals drop constraint if exists proposals_identity_quorum_check;

alter table proposals add constraint proposals_identity_quorum_check
  check (identity_quorum >= 0);
