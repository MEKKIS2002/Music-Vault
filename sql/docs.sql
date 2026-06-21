-- ════════════════════════════════════════════════════════════════
-- Music Vault — standalone Docs / notes (Apple Notes-style)
-- Applied to Supabase project ylvqkfdvijqnecuqznyr (migration: docs_notes).
-- Independent of beats/albums/mixtapes. Per-user (owner-only RLS).
-- ════════════════════════════════════════════════════════════════

create table if not exists public.docs (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  title       text not null default 'Uten tittel',
  content     text not null default '',
  format      text not null default 'html',   -- 'html' | 'plain' (future-proof)
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists docs_owner_updated_idx on public.docs(owner_id, updated_at desc);

alter table public.docs enable row level security;

-- Each user only ever sees / edits their own docs.
drop policy if exists docs_owner_all on public.docs;
create policy docs_owner_all on public.docs
  for all
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

-- Keep updated_at fresh on every edit (so the list can sort by most-recent).
create or replace function public.tg_docs_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists docs_set_updated_at on public.docs;
create trigger docs_set_updated_at
  before update on public.docs
  for each row execute function public.tg_docs_updated_at();
