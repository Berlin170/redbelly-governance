-- Identity-gated voting. Run this once in the Supabase SQL editor.
--
-- Until now, identity was tangled up with weight: choosing the
-- verified-identity strategy gave you a KYC gate AND one-vote-each, and there
-- was no way to have one without the other. But those are two questions:
--
--   may this address vote at all?     <- eligibility
--   how much does its vote count?     <- weight
--
-- A DAO that wants RBNT-weighted voting restricted to verified members had no
-- way to say so. This flag separates the two, so any voting system and any
-- weighting strategy can be gated on a Receptor credential.
--
-- Default false: adding a gate to proposals that were written without one
-- would change terms their authors already signed.

alter table proposals
  add column if not exists require_verified boolean not null default false;
