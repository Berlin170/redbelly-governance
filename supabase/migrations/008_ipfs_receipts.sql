-- Migration 008 — IPFS receipts for votes and proposals cast on this portal.
-- Run this in the Supabase SQL editor after 007_avatar_uploads.sql.
--
-- Imported Snapshot history arrived with IPFS receipts and has linked to them
-- since migration 003. Ballots cast here had none, which left the DAO's
-- borrowed past more auditable than its own present: every native vote could
-- only be checked by asking this server for it. Pinning the signed payload
-- fixes that, and demotes Supabase from the only copy of the DAO's record to
-- an index that can be rebuilt from one.
--
-- Almost nothing is needed here, because the display side already exists. The
-- receipt goes in the same source_receipt column the imports use and renders
-- through the same helper. Only the two gaps below need closing.

-- ------------------------------------------------------- proposals.signed_at
-- Migration 006 kept the signed timestamp for votes and profiles, and stopped
-- short of proposals because their replay was solved a different way — a
-- unique index on the signature, which needs no timestamp.
--
-- Receipts need it for the other reason 006 gave: rebuilding the EIP-712 hash
-- requires every signed field, and `timestamp` is a signed field. Without it a
-- proposal's published signature cannot be checked by anyone, here or on IPFS,
-- because the payload it covers cannot be reconstructed.
--
-- Nullable, like its siblings. Proposals written before this migration have no
-- timestamp to backfill and simply go unpinned; the sweep skips them rather
-- than publishing a receipt that would not verify.

alter table proposals
  add column if not exists signed_at bigint;

comment on column proposals.signed_at is
  'Unix seconds from the signed EIP-712 payload. Needed to rebuild the hash '
  'so the stored signature can be re-verified. Null before 008.';

-- --------------------------------------------------------- source_receipt
-- The column now carries two things that are the same kind of thing: the CID
-- of the signed record, wherever that record was signed. For an imported row
-- that is Snapshot''s pin; for a native row it is ours. `source` says which,
-- and lib/utils.ts receiptUrl() picks the gateway from it.

comment on column proposals.source_receipt is
  'IPFS CID of the signed record. Snapshot''s own pin on imported rows; this '
  'portal''s pin of the EIP-712 envelope on native ones.';

comment on column votes.source_receipt is
  'IPFS CID of the signed record. Snapshot''s own pin on imported rows; this '
  'portal''s pin of the EIP-712 envelope on native ones.';

-- ------------------------------------------------------------ the sweep
-- Pinning happens after the response goes out, so a provider outage, a cold
-- start killed mid-flight, or a deployment that shipped before the credentials
-- did all leave rows behind. /api/ipfs/pin comes back for them, and these are
-- the indexes that make "what is still unpinned" a cheap question rather than
-- a scan of every ballot the DAO has ever cast.
--
-- Partial on exactly the sweep's predicate: signed here, not yet pinned. Both
-- indexes shrink to nothing once the backlog clears, which is the state they
-- are expected to live in.

create index if not exists votes_unpinned_idx
  on votes (created_at)
  where signature is not null and source_receipt is null;

create index if not exists proposals_unpinned_idx
  on proposals (created_at)
  where signature is not null and source_receipt is null;
