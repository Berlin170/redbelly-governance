# Database

The portal's schema is a baseline plus an ordered set of migrations. Everything
here is run by hand in the Supabase SQL editor: the key the app holds can write
rows but cannot run DDL, so a schema change ships as a file for the operator to
paste, and the app has to tolerate running ahead of it.

## Order

Run `schema.sql` first, then `migrations/` in numeric order.

| File | What it adds | Applied |
|---|---|---|
| `schema.sql` | spaces, proposals, votes | yes |
| `migrations/000_snapshot_import.sql` | `source_*` provenance columns, space metadata | yes |
| `migrations/001_follows.sql` | `follows` | yes |
| `migrations/002_follow_sources.sql` | imported-follow provenance | yes |
| `migrations/003_copeland.sql` | Copeland in the `voting_system` check, `source_receipt` | yes |
| `migrations/004_profiles.sql` | `profiles` | yes |
| `migrations/005_require_verified.sql` | `proposals.require_verified` | yes |
| `migrations/006_replay_protection.sql` | unique signatures, `signed_at` on votes | yes |
| `migrations/007_avatar_uploads.sql` | the `avatars` storage bucket | yes |
| `migrations/008_ipfs_receipts.sql` | `signed_at` on proposals, receipt columns | yes |

All of the above are live in production, verified 2026-08-30 by reading rows
that only exist if the migration ran — every native proposal carries both a
`source_receipt` CID and a `signed_at`, which are 008's columns.

## Why 000 is numbered below 001

`000_snapshot_import.sql` was written as `002` while it lived in `supabase/`
instead of `supabase/migrations/`, which already had its own `002`. One number
named two different migrations, and `003_copeland.sql` sat unapplied for a day
because it was in the directory nobody was looking at — Copeland proposals were
refused by `proposals_voting_system_check` and the IPFS provenance links were
dead the whole time. The two directories are now one. This file is the earliest
change on top of the baseline, so it took the number below the series rather
than renumbering every migration after it, which would have broken every
reference to them by number.

## Adding one

Next number is `009`. Put it in `migrations/`, make it idempotent
(`add column if not exists`, `create table if not exists`) so a re-run is
harmless, and make the code tolerate its absence until it is applied —
`isMissingColumn` in `lib/pg-errors.ts` is how the proposal route degrades to
"no receipt" rather than "no proposal" when it is deployed ahead of the SQL.
