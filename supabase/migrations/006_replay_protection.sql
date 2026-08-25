-- Spend every signature once. Run this in the Supabase SQL editor.
--
-- Signed payloads carry a timestamp, but it was read to check the signature
-- and then thrown away. Nothing recorded that a given payload had already been
-- used, so anyone holding a copy could post it again — and votes and proposals
-- publish their signatures, so holding a copy takes no privilege at all.
--
-- Two replays followed, one per table.
--
-- Votes overwrite through the upsert on (proposal_id, voter). Archive a
-- member's ballot from the public feed, wait for them to change their mind,
-- post the old payload back: the signature is genuine, the proposal is still
-- open, and their new choice is quietly replaced by their old one. Nobody's
-- vote could be forged, but a changed vote could be undone by a stranger.
-- Fixed by keeping the signed timestamp and demanding the next one be newer.
--
-- Proposals insert rather than upsert, so a replayed proposal is not an
-- overwrite but a duplicate — the same text, the same signature, the same
-- author, posted again by someone who was not them. The daily ceiling caps how
-- many, but attribution is the damage, not volume. A signature can only ever
-- belong to one row, so the database can say that itself.
--
-- Profiles are last and mildest: their signatures are not published, so the
-- replay needs a copy nobody has an easy way to get. The column goes on anyway
-- for the second reason all three want it — lib/eip712.ts promises a stored
-- signature can be re-verified without trusting this server, and rebuilding
-- the EIP-712 hash needs the timestamp that was never kept.
--
-- All nullable. Rows written before this migration have no signed timestamp to
-- backfill, and imported Snapshot history never had one. Null reads as "no
-- floor yet", so those rows keep working and the next signed write sets the
-- floor for everything after it.

alter table votes
  add column if not exists signed_at bigint;

alter table profiles
  add column if not exists signed_at bigint;

comment on column votes.signed_at is
  'Unix seconds from the signed EIP-712 payload. Must strictly increase per '
  '(proposal_id, voter) so a payload cannot be replayed. Null before 006.';

comment on column profiles.signed_at is
  'Unix seconds from the signed EIP-712 payload. Must strictly increase per '
  'address so a payload cannot be replayed. Null before 006.';

-- Partial, because imported Snapshot proposals carry no signature over our
-- domain and share a null that a plain unique index would collide on.
create unique index if not exists proposals_signature_key
  on proposals (signature)
  where signature is not null;
