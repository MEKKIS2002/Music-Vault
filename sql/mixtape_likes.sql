-- ════════════════════════════════════════════════════════════════
-- Music Vault — anonymous likes on shared mixtapes (mixtape.html)
-- Supabase project ylvqkfdvijqnecuqznyr.
--
-- Before: policies "Anyone can read / insert / delete own likes" (all `true`) let
-- anyone list every like WITH its session id and delete any like. Now the public
-- page only talks to two SECURITY DEFINER RPCs:
--   get_mixtape_like_counts(token)                → counts per beat, no session ids
--   set_mixtape_like(token, beat, session, liked) → add/remove THIS session's like,
--                                                   only for a beat in an enabled share
-- ════════════════════════════════════════════════════════════════

-- Original table (for record; already exists in production)
create table if not exists public.mixtape_likes (
  id          uuid primary key default gen_random_uuid(),
  mixtape_id  text,          -- = mixtape_shares.id (share token)
  beat_id     text,
  session_id  text,
  created_at  timestamptz
);

-- ── Step 1 (migration: mixtape_likes_rpc, applied 2026-11-14) — additive ──
create unique index if not exists mixtape_likes_unique_idx
  on public.mixtape_likes(mixtape_id, beat_id, session_id);

create or replace function public.get_mixtape_like_counts(p_token text)
returns table(beat_id text, likes bigint)
language sql
stable
security definer
set search_path = public
as $$
  select l.beat_id, count(*)::bigint
  from public.mixtape_likes l
  where l.mixtape_id = p_token
    and exists (select 1 from public.mixtape_shares s where s.id = p_token and s.enabled is not false)
  group by l.beat_id;
$$;

create or replace function public.set_mixtape_like(p_token text, p_beat_id text, p_session text, p_liked boolean)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_session is null or length(p_session) < 8 or length(p_session) > 64 then
    raise exception 'ugyldig sesjon';
  end if;
  if not exists (
    select 1 from public.mixtape_shares s
    where s.id = p_token and s.enabled is not false
      and exists (select 1 from jsonb_array_elements(coalesce(s.data->'beats','[]'::jsonb)) b where b->>'id' = p_beat_id)
  ) then
    raise exception 'ukjent spor';
  end if;
  if p_liked then
    insert into public.mixtape_likes(mixtape_id, beat_id, session_id, created_at)
    values (p_token, p_beat_id, p_session, now())
    on conflict (mixtape_id, beat_id, session_id) do nothing;
  else
    delete from public.mixtape_likes
    where mixtape_id = p_token and beat_id = p_beat_id and session_id = p_session;
  end if;
  return (select count(*) from public.mixtape_likes where mixtape_id = p_token and beat_id = p_beat_id);
end;
$$;

revoke all on function public.get_mixtape_like_counts(text) from public;
revoke all on function public.set_mixtape_like(text, text, text, boolean) from public;
grant execute on function public.get_mixtape_like_counts(text) to anon, authenticated;
grant execute on function public.set_mixtape_like(text, text, text, boolean) to anon, authenticated;

-- ── Step 2 (migration: mixtape_likes_lock) — run AFTER the new mixtape.html is
--    live, otherwise likes stop working on the deployed page in between. ──
-- drop policy if exists "Anyone can read likes"       on public.mixtape_likes;
-- drop policy if exists "Anyone can insert likes"     on public.mixtape_likes;
-- drop policy if exists "Anyone can delete own likes" on public.mixtape_likes;
-- -- Share owners may read likes on their own shares (no write access for anyone).
-- create policy mixtape_likes_owner_read on public.mixtape_likes
--   for select using (exists (select 1 from public.mixtape_shares s
--                             where s.id = mixtape_id and s.owner_id = auth.uid()));
