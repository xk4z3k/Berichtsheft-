-- Run once in the Supabase SQL Editor for the Berichtsheft app.
-- Accounts can only access their own row.

create table if not exists public.berichtsheft_data (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null default '{}'::jsonb
    check (jsonb_typeof(data) = 'object'),
  updated_at timestamptz not null default now()
);

alter table public.berichtsheft_data enable row level security;

revoke all on table public.berichtsheft_data from anon, authenticated;
grant usage on schema public to authenticated;
grant select, insert, update, delete on table public.berichtsheft_data to authenticated;

drop policy if exists "Users manage their own Berichtsheft" on public.berichtsheft_data;
create policy "Users manage their own Berichtsheft"
  on public.berichtsheft_data
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
