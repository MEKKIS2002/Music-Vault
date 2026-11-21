-- features_2026_11_19.sql — kjørt i Supabase (migration: user_settings_share_stats_artist_pages).
-- Kort oversikt; fullstendige funksjonsdefinisjoner ligger i Supabase.

-- Tema/aksent på kontoen
--   public.user_settings(user_id pk → auth.users, theme dark|light, accent oransje|rosa|bla|gronn|lilla|gul, updated_at)
--   RLS: user_settings_own — bare egen rad (for all, user_id = auth.uid()).

-- Statistikk på delingslenker
--   public.share_listens(kind song|mixtape, token, beat_id, session, played, max_pct, first_at, last_at)
--     pk (kind, token, beat_id, session). RLS på, INGEN policyer (kun via funksjonene).
--   log_share_event(p_kind, p_token, p_session, p_event open|play|progress, p_beat, p_pct)
--     security definer, anon+authenticated. Sjekker at lenken finnes og er aktiv,
--     maks 200 rader per økt, played = OR, max_pct = greatest. Ingen IP lagres.
--   get_share_stats(p_kind, p_token) → (beat_id, opens, plays, avg_pct)
--     security definer, kun authenticated; bare eieren av lenken (eller admin) får rader.

-- Artistside (EPK)
--   public.artist_pages(user_id pk, slug unique ^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$, display_name, bio ≤2000,
--     photo_url, contact ≤200, links jsonb, featured jsonb (song_shares-tokens), published, updated_at)
--   RLS: artist_pages_own — bare egen rad.
--   get_artist_page(p_slug) → jsonb — bare publiserte sider; låter kun fra eierens aktive song_shares.
--     security definer, anon+authenticated.

-- ── Artistside v2: visuell redigering (fanen «Artistside») ─────────────────
-- Kjørt som migrering artist_pages_blocks.
alter table public.artist_pages add column if not exists banner_url text not null default '';
alter table public.artist_pages add column if not exists accent text not null default '#d68155' check (accent ~ '^#[0-9a-fA-F]{6}$');
alter table public.artist_pages add column if not exists blocks jsonb not null default '[]'::jsonb;
-- get_artist_page returnerer nå også banner_url, accent, blocks og
-- tracks som objekt { <token>: data } for låter i tracks-seksjoner (+ featured).

-- ── Explore: offentlige låter + profiler (migrering explore_public_songs) ───
alter table public.song_shares add column if not exists is_public boolean not null default false;
alter table public.song_shares add column if not exists published_at timestamptz;
create index if not exists song_shares_public_idx on public.song_shares (published_at desc) where is_public and enabled;
-- explore_feed(p_limit, p_slug) og explore_profiles(): SECURITY DEFINER,
-- kun authenticated (anon får 42501). Returnerer bare is_public+enabled låter
-- og publiserte artistsider.

-- ── Artistside: låter = utvalg av OFFENTLIGE låter (migrering artist_page_public_tracks_only)
-- get_artist_page tar nå bare med song_shares der is_public og enabled.

-- ── Språk på kontoen (migrering user_settings_lang) ─────────────────────────
alter table public.user_settings add column if not exists lang text not null default 'no' check (lang in ('no', 'en'));
