-- Following a space. Run this once in the Supabase SQL editor.
--
-- A follow is signed like everything else here, so the count cannot be
-- inflated by anyone able to reach the API. Unfollowing deletes the row
-- rather than flagging it: a space should not keep a record of people who
-- decided to leave.

create table if not exists follows (
  space_id    text not null references spaces(id) on delete cascade,
  follower    text not null,
  signature   text not null,
  created_at  timestamptz not null default now(),
  primary key (space_id, follower)
);

create index if not exists follows_space_idx on follows(space_id, created_at desc);

alter table follows enable row level security;

drop policy if exists "public read follows" on follows;
create policy "public read follows" on follows for select using (true);
