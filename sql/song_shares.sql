-- ════════════════════════════════════════════════════════════════
-- Music Vault — public single-song / single-beat share links
-- Applied to Supabase project ylvqkfdvijqnecuqznyr (migration: song_shares).
-- Kept here for record / re-deploy. Mirrors the mixtape_shares pattern.
-- ════════════════════════════════════════════════════════════════

create table if not exists public.song_shares (
  id          text primary key,                          -- unguessable share token
  owner_id    uuid not null references auth.users(id) on delete cascade,
  beat_id     text,                                       -- app-side beat id (reuse/dedup)
  kind        text not null default 'song',               -- 'song' | 'beat' (label only)
  data        jsonb not null default '{}'::jsonb,         -- {title,cover,artist,producer,audio_url,...}
  enabled     boolean not null default true,
  created_at  timestamptz not null default now()
);

create index if not exists song_shares_owner_idx on public.song_shares(owner_id);
create index if not exists song_shares_owner_beat_idx on public.song_shares(owner_id, beat_id);

alter table public.song_shares enable row level security;

-- Owners fully manage their own share links (insert/select/update/delete).
drop policy if exists song_shares_owner_all on public.song_shares;
create policy song_shares_owner_all on public.song_shares
  for all
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

-- Public, token-gated read. SECURITY DEFINER bypasses RLS but only ever returns the
-- single row matching an exact (unguessable) token that is still enabled. No enumeration.
create or replace function public.get_song_share(p_token text)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select data
  from public.song_shares
  where id = p_token and enabled = true
  limit 1;
$$;

revoke all on function public.get_song_share(text) from public;
grant execute on function public.get_song_share(text) to anon, authenticated;
