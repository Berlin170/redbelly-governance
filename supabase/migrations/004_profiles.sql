-- Member profiles. Run this once in the Supabase SQL editor.
--
-- Numbered 004 rather than 003 because supabase/003_copeland.sql already
-- claims that number outside this folder. Until the two directories are
-- merged, numbers are unique across both.
--
-- A profile is signed like a vote or a follow. An unsigned name column would
-- let anyone with API access relabel any address, and in a governance tool the
-- name beside a proposal is not decoration — it is the thing readers trust.
-- The signature makes a display name a claim its own address made.

create table if not exists profiles (
  address       text primary key,
  display_name  text,
  bio           text,
  avatar_url    text,
  twitter       text,
  github        text,
  signature     text not null,
  updated_at    timestamptz not null default now()
);

-- Length caps belong here as well as in the API: the API is one caller, the
-- table is the last word. A name long enough to break a layout is a nuisance;
-- one long enough to fill a page is an attack.
alter table profiles drop constraint if exists profiles_display_name_len;
alter table profiles add constraint profiles_display_name_len
  check (display_name is null or char_length(display_name) between 1 and 40);

alter table profiles drop constraint if exists profiles_bio_len;
alter table profiles add constraint profiles_bio_len
  check (bio is null or char_length(bio) <= 200);

alter table profiles enable row level security;

-- Readable by anyone, like every other governance record here. Writes go
-- through /api/profile, which verifies the signature first.
drop policy if exists "public read profiles" on profiles;
create policy "public read profiles" on profiles for select using (true);
