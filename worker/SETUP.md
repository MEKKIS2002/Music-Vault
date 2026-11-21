# Cloudflare Worker + R2 — Oppsett

## Steg 1: Lag en Cloudflare-konto
Gå til https://cloudflare.com og opprett gratis konto.

## Steg 2: Lag R2 bucket
1. Gå til **R2 Object Storage** i dashbordet
2. Trykk **"Create bucket"**
3. Gi den navnet `music-vault-audio`
4. Region: velg nærmeste (Auto er fint)
5. Trykk **"Create bucket"**

## Steg 3: Opprett Worker
1. Gå til **Workers & Pages** → **"Create"** → **"Create Worker"**
2. Gi den et navn, f.eks. `music-vault-r2`
3. Trykk **"Deploy"** (bare for å opprette)
4. Trykk **"Edit code"**
5. **Slett all eksisterende kode** og lim inn innholdet fra `r2-worker.js`
6. Trykk **"Save and Deploy"**

## Steg 4: Koble R2 bucket til Worker
1. Gå inn på Workeren din → **"Settings"** → **"Bindings"**
2. Trykk **"Add"** → **"R2 bucket"**
3. Variable name: `BUCKET`
4. Velg bucket: `music-vault-audio`
5. Trykk **"Save"**

## Steg 5: Sett ALLOWED_ORIGIN
1. Fortsatt under **"Settings"** → **"Variables"** → **"Environment Variables"**
2. Trykk **"Add variable"**
3. Name: `ALLOWED_ORIGIN`
4. Value: `https://MEKKIS2002.github.io` (ditt GitHub Pages domene)
5. Trykk **"Save and Deploy"**

## Steg 6: Sett Worker-URL i appen
1. Kopier Worker-URL-en din (ser ut som `https://music-vault-r2.ditt-navn.workers.dev`)
2. Åpne `index.html` og finn denne linjen nær bunnen:
   ```html
   <script>window.R2_WORKER_URL = '';</script>
   ```
3. Fyll inn URL-en:
   ```html
   <script>window.R2_WORKER_URL = 'https://music-vault-r2.ditt-navn.workers.dev';</script>
   ```
4. Commit og push til GitHub

## Steg 7: Supabase-tabeller (kjør én gang i Supabase SQL Editor)
```sql
-- Beats-tabell (hvis den ikke finnes)
create table if not exists public.beats (
  id text primary key,
  title text not null default 'Untitled',
  bpm integer,
  tags text[] default '{}',
  audio_url text default '',
  drive_file_id text default '',
  archived boolean default false,
  created_at timestamptz default now(),
  metadata jsonb default '{}'
);

-- Albumer
create table if not exists public.albums (
  id text primary key,
  title text not null default 'Untitled',
  description text default '',
  cover_url text default '',
  archived boolean default false,
  created_at timestamptz default now(),
  metadata jsonb default '{}'
);

-- Mixtapes
create table if not exists public.mixtapes (
  id text primary key,
  title text not null default 'Untitled',
  description text default '',
  cover_url text default '',
  archived boolean default false,
  created_at timestamptz default now(),
  metadata jsonb default '{}'
);

-- Relasjoner
create table if not exists public.album_beats (
  album_id text references public.albums(id) on delete cascade,
  beat_id text references public.beats(id) on delete cascade,
  position integer default 0,
  primary key (album_id, beat_id)
);

create table if not exists public.mixtape_beats (
  mixtape_id text references public.mixtapes(id) on delete cascade,
  beat_id text references public.beats(id) on delete cascade,
  position integer default 0,
  primary key (mixtape_id, beat_id)
);

-- Row Level Security: slå på for alle tabeller
alter table public.beats enable row level security;
alter table public.albums enable row level security;
alter table public.mixtapes enable row level security;
alter table public.album_beats enable row level security;
alter table public.mixtape_beats enable row level security;
```

> ⚠️ **Ikke** bruk `for all using (auth.role() = 'authenticated')` — det lar ALLE innloggede
> endre ALLES data. Bruk eier-policyer (`owner_id = auth.uid()`), se
> `sql/security_fixes_2026_11_18.sql` for album_beats/mixtape_beats.

## Ferdig! Flyten er nå:
- **Ny lydfil** → lastes opp til R2 `active/beat-id` → URL lagres i Supabase
- **Arkiver beat** → flyttes til R2 `archived/beat-id` → oppdateres i Supabase
- **Gjenopprett beat** → flyttes tilbake til R2 `active/beat-id` → oppdateres i Supabase
- **Data (tekst/metadata)** → synkes alltid via Supabase på tvers av maskiner

## Sikkerhet (2026-11-18) — Workeren krever innlogging
`r2-worker.js` er nå den faktiske koden for den deployede Workeren «beat-vault»
(inkl. `/rhyme`, `/inspire`, `/stats`, `/list`). Deploy med `npx wrangler deploy` fra
`worker/` — `wrangler.toml` har navn, R2-binding og variabler. `ANTHROPIC_API_KEY`
er en secret og beholdes ved deploy.

- Offentlig: `GET /file/:key`, `GET /share/:id` (videresender til `mixtape.html?t=`)
- Innlogget (Supabase-token i `Authorization`): `/upload`, `/delete`, `/move`
  (+ brukeren må eie beaten/filen), `/stats`, `/rhyme`, `/inspire`
- Kun admin: `/list`

Eierskap sjekkes med brukerens eget token mot `beats` (RLS), så Workeren trenger
ingen service-nøkkel.
