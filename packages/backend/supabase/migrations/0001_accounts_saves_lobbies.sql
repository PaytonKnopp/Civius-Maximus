-- Civius Maximus: accounts, cloud saves and public lobbies (docs/guides/supabase.md).
-- Run once in the Supabase SQL editor (or with `supabase db push`). Safe to run again.

-- Profiles: one per account, named at sign-up.
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null default 'Player' check (char_length(name) between 1 and 24),
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
drop policy if exists "profiles are readable" on public.profiles;
create policy "profiles are readable" on public.profiles for select using (true);
drop policy if exists "players edit their own profile" on public.profiles;
create policy "players edit their own profile" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

create or replace function public.handle_new_player()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, name)
  values (new.id, coalesce(left(new.raw_user_meta_data ->> 'name', 24), 'Player'))
  on conflict (id) do nothing;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_player();

-- Cloud saves: each player sees and changes only their own.
create table if not exists public.saves (
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null check (char_length(id) between 1 and 64),
  name text not null check (char_length(name) between 1 and 80),
  turn integer not null default 1,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (owner, id)
);
alter table public.saves enable row level security;
drop policy if exists "players read their saves" on public.saves;
create policy "players read their saves" on public.saves for select using (auth.uid() = owner);
drop policy if exists "players add saves" on public.saves;
create policy "players add saves" on public.saves for insert with check (auth.uid() = owner);
drop policy if exists "players update their saves" on public.saves;
create policy "players update their saves" on public.saves
  for update using (auth.uid() = owner) with check (auth.uid() = owner);
drop policy if exists "players delete their saves" on public.saves;
create policy "players delete their saves" on public.saves for delete using (auth.uid() = owner);

-- Public lobbies: a host lists their join code for a few hours; anyone can see open ones.
create table if not exists public.lobbies (
  code text primary key check (code ~ '^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$'),
  host uuid not null default auth.uid() references auth.users (id) on delete cascade,
  host_name text not null check (char_length(host_name) between 1 and 24),
  open_seats integer not null default 1 check (open_seats between 0 and 7),
  info jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '6 hours'
);
alter table public.lobbies enable row level security;
drop policy if exists "open lobbies are public" on public.lobbies;
create policy "open lobbies are public" on public.lobbies for select using (expires_at > now());
drop policy if exists "hosts list their lobby" on public.lobbies;
create policy "hosts list their lobby" on public.lobbies for insert with check (auth.uid() = host);
drop policy if exists "hosts update their lobby" on public.lobbies;
create policy "hosts update their lobby" on public.lobbies
  for update using (auth.uid() = host) with check (auth.uid() = host);
drop policy if exists "hosts close their lobby" on public.lobbies;
create policy "hosts close their lobby" on public.lobbies for delete using (auth.uid() = host);

-- Old lobbies are cleaned up whenever someone lists a new one.
create or replace function public.prune_lobbies()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  delete from public.lobbies where expires_at < now();
  return new;
end;
$$;
drop trigger if exists prune_lobbies_on_insert on public.lobbies;
create trigger prune_lobbies_on_insert
  before insert on public.lobbies
  for each statement execute function public.prune_lobbies();
