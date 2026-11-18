-- review_fixes_2026_11_18.sql — funn fra /code-review av PR #26–#27
-- Applied to Supabase project ylvqkfdvijqnecuqznyr (migration: review_fixes_2026_11_18).

-- Profil lages server-side ved registrering (virker også uten sesjon / med e-postbekreftelse).
-- role er alltid 'user', package bare artist/pro (label kommer via redeem_invite_code).
-- Blokkerer aldri registreringen: ved feil (f.eks. opptatt brukernavn) logges en warning.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  begin
    insert into public.profiles (id, username, role, package, email)
    values (
      new.id,
      coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
      'user',
      case when new.raw_user_meta_data->>'package' in ('artist','pro')
           then new.raw_user_meta_data->>'package' else 'artist' end,
      new.email
    )
    on conflict (id) do nothing;
  exception when others then
    raise warning 'handle_new_user: kunne ikke lage profil for %: %', new.id, sqlerrm;
  end;
  return new;
end;
$$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Brenn koden bare hvis brukeren faktisk har en profil som kan oppgraderes.
create or replace function public.redeem_invite_code(p_code text)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_pkg text;
begin
  if auth.uid() is null then return false; end if;
  select package into v_pkg from public.invite_codes
   where code = p_code and used_by is null
   for update;
  if v_pkg is null then return false; end if;
  update public.profiles set package = v_pkg where id = auth.uid();
  if not found then return false; end if;
  update public.invite_codes set used_by = auth.uid(), used_at = now() where code = p_code;
  return true;
end;
$$;
revoke all on function public.redeem_invite_code(text) from public, anon;
grant execute on function public.redeem_invite_code(text) to authenticated;

-- Brukes av R2-Workeren: kan denne brukeren skrive filer for denne beat-id-en?
--   'admin' | 'owner' | 'other' (finnes, andres) | 'none' (finnes ikke)
create or replace function public.beat_file_access(p_beat_id text)
returns text language plpgsql stable security definer set search_path = public as $$
declare v_owner uuid;
begin
  if auth.uid() is null then return 'other'; end if;
  if public.is_admin() then return 'admin'; end if;
  if p_beat_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return 'none'; end if;
  select owner_id into v_owner from public.beats where id = p_beat_id::uuid;
  if not found then return 'none'; end if;
  return case when v_owner = auth.uid() then 'owner' else 'other' end;
end;
$$;
revoke all on function public.beat_file_access(text) from public, anon;
grant execute on function public.beat_file_access(text) to authenticated;
