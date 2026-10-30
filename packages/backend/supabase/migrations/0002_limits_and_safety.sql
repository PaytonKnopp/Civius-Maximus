-- Civius Maximus: limits that keep a free project healthy and players' data safe
-- (docs/guides/supabase.md, step 2). Run after 0001, in the Supabase SQL editor (or with
-- `supabase db push`). Safe to run again.

-- Profiles: only signed-in players can see who else has an account.
drop policy if exists "profiles are readable" on public.profiles;
drop policy if exists "signed-in players see profiles" on public.profiles;
create policy "signed-in players see profiles" on public.profiles
  for select using (auth.uid() is not null);

-- Saves: at most 8 MB each (a late game on a huge map is about 2 MB) and 30 per player,
-- autosaves included. The server stamps the time, and a save never changes hands.
alter table public.saves drop constraint if exists saves_data_size;
alter table public.saves
  add constraint saves_data_size check (octet_length(data::text) <= 8 * 1024 * 1024);
alter table public.saves drop constraint if exists saves_turn_range;
alter table public.saves add constraint saves_turn_range check (turn between 0 and 100000);

create or replace function public.guard_saves()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  new.updated_at := now();
  if tg_op = 'UPDATE' then
    new.owner := old.owner;
  elsif not exists (select 1 from public.saves where owner = new.owner and id = new.id)
    and (select count(*) from public.saves where owner = new.owner) >= 30 then
    raise exception 'You have 30 cloud saves already: delete one first'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
drop trigger if exists guard_saves on public.saves;
create trigger guard_saves
  before insert or update on public.saves
  for each row execute function public.guard_saves();

-- Public lobbies: one per host (listing a new one replaces the old), small details only, and
-- the server sets when it was listed and when it expires (six hours later).
alter table public.lobbies drop constraint if exists lobbies_info_size;
alter table public.lobbies
  add constraint lobbies_info_size check (octet_length(info::text) <= 2000);

create or replace function public.guard_lobbies()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    delete from public.lobbies where host = new.host and code <> new.code;
    new.created_at := now();
  else
    new.host := old.host;
    new.created_at := old.created_at;
  end if;
  new.expires_at := now() + interval '6 hours';
  return new;
end;
$$;
drop trigger if exists guard_lobbies on public.lobbies;
create trigger guard_lobbies
  before insert or update on public.lobbies
  for each row execute function public.guard_lobbies();

-- Nothing here is callable through the API: these functions only run as triggers.
revoke all on function public.handle_new_player() from public, anon, authenticated;
revoke all on function public.prune_lobbies() from public, anon, authenticated;
revoke all on function public.guard_saves() from public, anon, authenticated;
revoke all on function public.guard_lobbies() from public, anon, authenticated;
