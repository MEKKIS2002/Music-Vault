-- ════════════════════════════════════════════════════════════════
-- Music Vault — public mixtape share links («Pitch» på mixtape)
-- Applied to Supabase project ylvqkfdvijqnecuqznyr (migration: mixtape_shares_page).
--
-- The table predates this repo: it was created for the Cloudflare Worker page
-- (beat-vault…workers.dev/share/<token>). The public page now lives in the repo
-- as mixtape.html?t=<token> and reads ONLY through get_mixtape_share below —
-- same pattern as song_shares / share.html.
--
-- Row shape: data = { mt:{id,name,cover,color}, beats:[{id,name,duration,audio_url}] }
-- ════════════════════════════════════════════════════════════════

-- Original table (for record; already exists in production)
create table if not exists public.mixtape_shares (
  id          text primary key,                 -- share token
  data        jsonb not null,
  enabled     boolean default true,
  created_at  timestamptz default now()
);

-- Additive: who owns the link, and when the snapshot was last refreshed.
-- owner_id is nullable because the Worker-era rows were written without one.
alter table public.mixtape_shares add column if not exists owner_id uuid references auth.users(id) on delete set null;
alter table public.mixtape_shares add column if not exists updated_at timestamptz default now();
create index if not exists mixtape_shares_owner_idx on public.mixtape_shares(owner_id);

-- Public, token-gated read. SECURITY DEFINER so it keeps working after the open
-- SELECT policy is removed; returns only the single enabled row for an exact token.
create or replace function public.get_mixtape_share(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select data || jsonb_build_object('updatedAt', coalesce(updated_at, created_at))
  from public.mixtape_shares
  where id = p_token and enabled is not false
  limit 1;
$$;

revoke all on function public.get_mixtape_share(text) from public;
grant execute on function public.get_mixtape_share(text) to anon, authenticated;

-- ── NOT YET APPLIED — needs a decision (breaks the old Worker page if it reads
--    with the anon key). The policies below are today wide open: anyone holding
--    the public anon key can list, overwrite or delete every mixtape share.
--
-- update public.mixtape_shares set owner_id = '<marcus uid>' where owner_id is null;
-- drop policy if exists "Anyone can read"   on public.mixtape_shares;
-- drop policy if exists "Anyone can insert" on public.mixtape_shares;
-- drop policy if exists "Anyone can update" on public.mixtape_shares;
-- drop policy if exists "Anyone can delete" on public.mixtape_shares;
-- create policy mixtape_shares_owner_all on public.mixtape_shares
--   for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
