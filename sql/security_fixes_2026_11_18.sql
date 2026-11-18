-- security_fixes_2026_11_18.sql
-- Applied to Supabase project ylvqkfdvijqnecuqznyr (migration: security_fixes_2026_11_18).
-- Kept here for record / re-deploy.
--
-- #1 profiles: nye brukere kunne sette role='admin' (insert-policy med check = true)
-- #3 album_beats / mixtape_beats: alle innloggede kunne skrive til alle rader
-- #4 invite_codes: hvem som helst (også anon) kunne lese/lage/endre koder
-- #5 lookup_login_email: ga e-posten bak et brukernavn til hvem som helst
-- #6 notifications: hvem som helst kunne sende varsler med falsk avsender

-- #1 profiles
drop policy if exists "Auth users can insert own profile" on public.profiles;
create policy profiles_self_insert on public.profiles
  for insert to authenticated
  with check (id = auth.uid() and role = 'user' and package in ('artist','pro'));
revoke insert, update, delete, truncate, references, trigger on public.profiles from anon;
revoke truncate, references, trigger on public.profiles from authenticated;
alter table public.profiles alter column package set default 'artist';

-- #3 album_beats / mixtape_beats
drop policy if exists "Autentiserte kan skrive album_beats" on public.album_beats;
drop policy if exists "Kun autentiserte kan skrive" on public.album_beats;
create policy album_beats_owner_write on public.album_beats
  for all to authenticated
  using (exists (select 1 from public.albums a where a.id = album_beats.album_id and a.owner_id = auth.uid()))
  with check (exists (select 1 from public.albums a where a.id = album_beats.album_id and a.owner_id = auth.uid()));

drop policy if exists "Autentiserte kan skrive mixtape_beats" on public.mixtape_beats;
drop policy if exists "Kun autentiserte kan skrive" on public.mixtape_beats;
create policy mixtape_beats_owner_write on public.mixtape_beats
  for all to authenticated
  using (exists (select 1 from public.mixtapes m where m.id = mixtape_beats.mixtape_id and m.owner_id = auth.uid()))
  with check (exists (select 1 from public.mixtapes m where m.id = mixtape_beats.mixtape_id and m.owner_id = auth.uid()));

-- #4 invite_codes
drop policy if exists "Anyone can insert codes" on public.invite_codes;
drop policy if exists "Anyone can read codes"   on public.invite_codes;
drop policy if exists "Anyone can update codes" on public.invite_codes;
create policy invite_codes_admin_all on public.invite_codes
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
revoke all on public.invite_codes from anon;
revoke truncate, references, trigger on public.invite_codes from authenticated;

create or replace function public.check_invite_code(p_code text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.invite_codes
                 where code = p_code and used_by is null and package = 'label');
$$;
revoke all on function public.check_invite_code(text) from public;
grant execute on function public.check_invite_code(text) to anon, authenticated;

create or replace function public.redeem_invite_code(p_code text)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_pkg text;
begin
  if auth.uid() is null then return false; end if;
  update public.invite_codes
     set used_by = auth.uid(), used_at = now()
   where code = p_code and used_by is null
  returning package into v_pkg;
  if v_pkg is null then return false; end if;
  update public.profiles set package = v_pkg where id = auth.uid();
  return true;
end;
$$;
revoke all on function public.redeem_invite_code(text) from public, anon;   -- anon: migration revoke_anon_redeem_invite_code
grant execute on function public.redeem_invite_code(text) to authenticated;

-- #5
revoke execute on function public.lookup_login_email(text) from public, anon, authenticated;

-- #6 notifications
drop policy if exists "Anyone can insert"               on public.notifications;
drop policy if exists "Anyone can insert notifications" on public.notifications;
drop policy if exists "Anyone can send notifications"   on public.notifications;
create policy notifications_insert_as_self on public.notifications
  for insert to authenticated with check (sender_id = auth.uid());
