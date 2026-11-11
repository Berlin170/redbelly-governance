-- Migration 013 — a record of every change to a Self binding
-- Run this in the Supabase SQL editor after 012_personhood.sql.
--
-- A binding says "this document votes from this wallet". Members cannot
-- change one themselves, on purpose; an admin does it by hand in this editor
-- when a member loses a wallet. Until now that left no trace: an update
-- overwrote the old address, a delete freed the document to bind again, and
-- afterwards nobody could say that either had happened, when, or why.
--
-- That matters because these two edits are the only way around one person,
-- one vote. Moving a binding gives a person a new wallet; deleting one lets
-- the same document verify a second time. Both are sometimes right. Neither
-- should be invisible.
--
-- A trigger writes the record, not the application, so it is kept whichever
-- way the change is made: the helper below, a typed UPDATE, or the table
-- editor. The helper exists so the reason is written down at the same moment.
--
-- This is a record, not a lock. Whoever can run SQL here can also drop the
-- trigger; what they cannot do is change a binding by accident, or casually,
-- without it showing up.

create table if not exists personhood_binding_log (
  id           bigint generated always as identity primary key,
  binding_id   uuid not null,
  action       text not null check (action in ('moved', 'deleted')),
  old_address  text not null,
  new_address  text,
  -- Kept for deletions only. Once the row is gone this is the one way left
  -- to tell that a later binding is the same document coming back.
  nullifier    text,
  reason       text,
  db_role      text not null default current_user,
  changed_at   timestamptz not null default now()
);

create index if not exists personhood_binding_log_binding_idx
  on personhood_binding_log (binding_id, changed_at desc);

-- RLS on, no policy, like the bindings themselves: the log pairs wallets with
-- each other and, for deletions, with a nullifier.
alter table personhood_binding_log enable row level security;

comment on table personhood_binding_log is
  'Every move or deletion of a Self binding, written by trigger. Append-only. '
  'RLS on, no policy: read it from the SQL editor.';

create or replace function log_personhood_binding_change()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  why text := nullif(current_setting('personhood.reason', true), '');
begin
  if tg_op = 'UPDATE' then
    insert into personhood_binding_log (binding_id, action, old_address, new_address, reason)
    values (old.id, 'moved', old.address, new.address, why);
    return new;
  end if;

  insert into personhood_binding_log (binding_id, action, old_address, nullifier, reason)
  values (old.id, 'deleted', old.address, old.nullifier, why);
  return old;
end;
$$;

drop trigger if exists personhood_bindings_log_move on personhood_bindings;
create trigger personhood_bindings_log_move
  after update of address on personhood_bindings
  for each row
  when (old.address is distinct from new.address)
  execute function log_personhood_binding_change();

drop trigger if exists personhood_bindings_log_delete on personhood_bindings;
create trigger personhood_bindings_log_delete
  after delete on personhood_bindings
  for each row
  execute function log_personhood_binding_change();

-- The log is only worth reading if its rows are the ones that were written.
create or replace function personhood_binding_log_is_append_only()
returns trigger
language plpgsql
as $$
begin
  raise exception 'personhood_binding_log is append-only';
end;
$$;

drop trigger if exists personhood_binding_log_append_only on personhood_binding_log;
create trigger personhood_binding_log_append_only
  before update or delete on personhood_binding_log
  for each row
  execute function personhood_binding_log_is_append_only();

-- Moving a member to a new wallet, with the reason on the record:
--
--   select move_personhood_binding('0xOLD…', '0xNEW…', 'Lost wallet, asked in Discord by …');
--
-- Updates the row in place, so the binding keeps its id and bound_at and the
-- votes_proposal_identity_key index still stops the person voting twice on a
-- proposal that is open during the move.
create or replace function move_personhood_binding(
  old_wallet text,
  new_wallet text,
  reason     text
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  moved uuid;
begin
  if coalesce(trim(reason), '') = '' then
    raise exception 'A reason is required: it is the point of the record.';
  end if;
  if new_wallet !~* '^0x[0-9a-f]{40}$' then
    raise exception 'New wallet is not a valid address: %', new_wallet;
  end if;

  -- Transaction-local, so it cannot leak onto some later, unrelated edit.
  perform set_config('personhood.reason', trim(reason), true);

  update personhood_bindings
     set address = lower(new_wallet)
   where address = lower(old_wallet)
  returning id into moved;

  if moved is null then
    raise exception 'No binding found for %', old_wallet;
  end if;
  return moved;
end;
$$;

-- Functions in the public schema are callable through the REST API by
-- default. These are for the SQL editor only.
revoke all on function move_personhood_binding(text, text, text) from public, anon, authenticated;
revoke all on function log_personhood_binding_change() from public, anon, authenticated;
revoke all on function personhood_binding_log_is_append_only() from public, anon, authenticated;
