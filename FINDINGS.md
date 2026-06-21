# FINDINGS.md — Music Vault memory bank

> **Read this file first** before doing any work in Music Vault, and **update it last**
> after you finish. It is the shared memory bank for any AI working on this repo:
> versions, conventions, gotchas, architecture, and "do / don't" rules. Keep it accurate —
> a wrong note here misleads the next agent. This file holds the **technical/dev** detail;
> `README.md` is the user-facing description only.
>
> _Last updated: 2026-06-21_

---

## 1. What this project is

**Music Vault** — a personal hiphop studio web app for a single artist. Collects beats,
lyrics, recordings and project flow on one screen. Runs entirely in the browser, no
server, no install. UI language is **Norwegian** — match it in any user-facing strings.

- **Live:** https://mekkis2002.github.io/Music-Vault/
- **Repo version label:** v2.2 (May 2026).

## 2. Tech stack (no build step!)

| Layer | Tech |
|-------|------|
| Frontend | Plain HTML/CSS/JS. **No build, no npm, no bundler.** Edit files directly. |
| Hosting | GitHub Pages — push to `main` auto-deploys. |
| Audio storage | Cloudflare R2 (`music-vault-audio`) via Worker proxy |
| Database / sync | Supabase (PostgreSQL + Auth + Edge Functions) |
| Auth | Supabase Auth (username → email lookup → JWT) |
| AI (rhyme bank) | Anthropic Claude (Haiku) called through a Cloudflare Worker |

## 3. Critical conventions — DO follow

- **Cache-busting query strings.** Every `<script src>` and `<link href>` in `index.html`
  carries `?v=YYYYMMDDNNNN`. **When you edit a JS/CSS file, you MUST bump its `?v=` in
  `index.html`** or the deployed change won't load for users (GitHub Pages + browser cache).
  Use the date + a counter, e.g. `?v=202606170004`.
- **No inline CSS/JS in `index.html`.** Markup only. Styles go in `css/`, logic in `js/`.
- **Never remove the viewport/charset meta tags** (`index.html` head). Without
  `<meta name="viewport" ...>` the whole mobile layout breaks (phone renders the
  zoomed-out desktop and no `@media` rules fire). `viewport-fit=cover` enables safe-area insets.
- **`css/mobile.css` must stay the LAST stylesheet** linked in `index.html` so it overrides
  desktop rules. See §11.
- **Validate JS after edits:** `node --check js/<file>.js` (pre-approved for admin-panel.js
  and lyriclab.js). Do this before considering a JS change done.
- **localStorage is the source of truth client-side.** Key: `musicVault.v4` (also
  per-user `musicVault.v4.<uid>`).
- **Save → sync pipeline:** `saveState()` → `markDirty()` → `schedulePush()` → Supabase
  (debounced ~900ms). Lyric Lab autosaves 600ms after a keystroke.
- **`beatsFromIds()` always filters out archived beats** — don't bypass it.
- **Public share links** (`song_shares`): public read is ONLY via the SECURITY DEFINER RPC
  `get_song_share(p_token)`. Never add a broad anon SELECT policy to `song_shares` — that would let
  anyone enumerate every link. Public sharing requires a **public http(s) `audio_url`** (R2);
  `share-song.js` refuses to share beats whose audio is still a local/data URL. `share.html` is the
  one place inline CSS/JS is allowed (it's a standalone public page, NOT index.html).
- **Tab visibility needs BOTH** `.hidden` (display) removed **and** `.tab-visible`
  (opacity:1) added. Missing one = invisible or ghost tab.

## 4. Gotchas / landmines — DON'T trip on these

- **Archive tab is NOT in `index.html`.** `js/archive.js` creates `#archiveTab` dynamically.
  Don't go looking for it in the HTML.
- **`audio-compress.js` is loaded 3× in `index.html`** (3 different `?v=`) and is
  effectively **disabled** (MediaRecorder is realtime). Treat it as dead weight.
- **Worker filename mismatch:** older docs referenced `worker/worker.js`, but the repo file
  is **`worker/r2-worker.js`**. The `/rhyme` proxy + Anthropic model id are **not in the
  repo** (configured/deployed in Cloudflare directly). To change the rhyme model you edit
  the deployed Worker, not this repo. Setup notes: `worker/SETUP.md`.
- **Recording over a beat:** beat is fetched as a blob via `fetch()` to dodge a CORS issue
  with `captureStream`, then mixed with mic via Web Audio API → `MediaRecorder`. Web Audio
  requires HTTP — `file://` won't work.
- **Now-playing glow is JS-applied, not in markup.** The `.now-playing-glow` class (`css/ui.css`)
  is added/removed at runtime by `updatePlayingAnimations()` in `js/app.js` (matches the playing
  beat by `data-beat-id`). Don't assume it's dead CSS just because `renderAlbumBeats` never emits it.
- **Load order gotcha — `db.js` loads LAST.** `app.js` + `track-cards.js` load before it, so they
  can't wrap `updateBottomUI` (it doesn't exist yet — their `if(old){...}` guards silently skip).
  Live play/pause hooks must be exposed on `window` and called from inside `db.js`'s `updateBottomUI`.
- **`bottomPlayer` is a `const`, not on `window`.** It's a global *lexical* binding: reference it by
  bare name from any script (works), NOT via `window.bottomPlayer` (undefined).
- **Collection song-reorder drag handle:** drag starts from the whole `.album-beat-card` row;
  `startCollectionDrag` (`js/db.js`) only blocks it over interactive controls. Don't re-narrow it
  back to `.ab-cover-wrap` (that thumbnail also click-toggles expand → felt broken).
- **Windows line endings:** git warns LF→CRLF on these files; harmless, expected.
- **Secrets:** `js/db.js` / `js/supabase.js` contain the Supabase **anon** key (public by
  design, RLS-protected). `.local.json` and `.env*` are gitignored — never commit
  service-role keys or `ANTHROPIC_API_KEY`.

## 5. Key constants / "latest versions"

- **Supabase project ref:** `ylvqkfdvijqnecuqznyr`
  URL: `https://ylvqkfdvijqnecuqznyr.supabase.co`
- **Supabase JS SDK:** `@supabase/supabase-js@2` (CDN: jsdelivr)
- **Anthropic models** (use latest when touching AI features): Opus 4.8 `claude-opus-4-8`,
  Sonnet 4.6 `claude-sonnet-4-6`, Haiku 4.5 `claude-haiku-4-5-20251001`, Fable 5 `claude-fable-5`.
  Rhyme bank currently uses a Haiku-class model via the Worker.
- **Edge functions seen:** `admin-update-user` (plus RPCs `lookup_login_email`,
  `get_usernames`, `get_user_id_by_username`, `get_song_share`).
- **Share tables:** `mixtape_shares` (pitch, via deployed Worker) and `song_shares`
  (single song/beat public links, this repo — see `sql/song_shares.sql` + §4 gotcha).
- **Users:** `marcus` (admin), `erik` (admin). Viewer mode shows only Mixtapes + Beats.

## 6. Data model

State lives in `localStorage` under key `musicVault.v4` (per-user mirror
`musicVault.v4.<uid>`):

```js
{
  beats: [{
    id, name, cover, audio_url, lyrics,
    lyricSections: [{ id, type, title, text, collapsed, order }],
    lyricLabStatus, takes, memos,
    bpm, key, mood, tags, done, favorite, rating, archived
  }],
  albums:   [{ id, name, cover, beatIds, status, done, archived }],
  mixtapes: [{ id, name, cover, beatIds, archived }],
  settings: {}
}
```

Notes:
- Legacy `beat.lyrics` is migrated into `beat.lyricSections[0]` (original kept).
- Recording takes are stored on `beat.takes[]`.
- Mixtape cassette variant is chosen **deterministically per mixtape id**.

## 7. Cloudflare Worker API

Source in repo: `worker/r2-worker.js` (R2 endpoints). The `/rhyme` proxy lives in the
deployed Worker. See `worker/SETUP.md`.

| Method | Path | Purpose |
|--------|------|---------|
| `PUT` | `/upload/:key` | Upload audio file to R2 |
| `GET` | `/file/:key` | Stream audio file (Range support for seek) |
| `DELETE` | `/delete/:key` | Delete audio file |
| `POST` | `/move` | Move file (archive / restore) |
| `GET` | `/stats` | Storage status |
| `POST` | `/rhyme` | Rhyme-bank proxy → Anthropic API |

**Secrets (Cloudflare dashboard):** `ANTHROPIC_API_KEY`,
`ALLOWED_ORIGIN` → `https://mekkis2002.github.io`.
**Bucket binding:** `BUCKET` → `music-vault-audio`.

## 8. Lyric Lab internals

Three-column studio screen (`js/lyriclab.js`, `css/lyriclab.css`):
- **Left — beat info:** cover, title, producer, BPM, key, mood; status dropdown
  (utkast / skriver / demo / revisjon / ferdig); play beat, record over beat, quick memo.
- **Middle — section editor:** sections Hook, Vers 1, Bro, Vers 2, Outro + custom; line
  numbers, collapse/expand, ⋯-menu (duplicate, move, delete). Autosave 600ms after
  keystroke → `saveState()` → Supabase. Same editor renders inline in album/mixtape beat cards.
- **Right — analysis + rhyme bank:** word/line/section stats, estimated song length, missing
  sections, repeated words; rhyme bank (type or select text → Claude Haiku via Worker →
  Norwegian rhyme suggestions).

## 9. File map (js/)

`lock.js` login • `db.js` state+render+tabs • `app.js` album detail/producer mode •
`track-cards.js` view modes • `archive.js` archive tab (dynamic) • `mixtape.js` mixtape search •
`beats-tab.js` beats overview • `lyriclab.js` Lyric Lab editor/rhyme/recording •
`r2-storage.js` R2 upload/delete/move • `supabase.js` admin login + push/pull sync •
`changelog.js` changelog • `pipeline.js` kanban • `packages.js` • `label.js` • `mobile.js` •
`admin-panel.js` admin UI.

CSS: `main.css` base/vars/layout • `ui.css` hero/stats/buttons/vinyl • `track-cards.css` •
`archive.css` • `mixtape.css` • `lyriclab.css` • `pipeline.css` • `mobile.css`.

## 10. Run locally

```bash
npx serve .      # or: python3 -m http.server 8080
```
Web Audio API requires HTTP, not `file://`. Deploy = push to `main` (GitHub Pages auto).

## 11. Mobile / phone layout (rebuilt juni 2026)

The mobile view **reuses desktop tab content** — it does NOT re-render screens. How it works:
- A fixed bottom **footer nav** (`#mvMobileNav` in `index.html`) with buttons Beats,
  Mixtapes, Albumer, Lab, and "Mer". Each button calls `mvMobileTab('<tab>')` (inline script
  in `index.html`), which just `.click()`s the matching desktop `.tab-btn[data-tab=...]`.
  The "Mer" button opens a bottom sheet with the remaining tabs (Hjem, Pipeline, Arkivert,
  Label, Admin, Integrasjoner).
- **Hjem is not in the footer** (dropped on purpose). On phones (`innerWidth <= 768`) the app
  auto-lands on **Beats** instead of the Hjem dashboard (see the `load` handler in the inline
  mobile script); Hjem stays reachable via the "Mer" sheet.
- All phone styling lives in **`css/mobile.css`** (single source of truth, loaded last,
  one breakpoint `@media (max-width: 768px)`). It hides the desktop `.mv-tabs` row, shows the
  footer/sheet/FAB, reflows grids to 1–2 columns, stacks toolbars, sizes touch targets ≥44px,
  forces inputs to 16px (avoids iOS zoom), and repositions the bottom player above the footer.
  Tunable constants are CSS vars at the top (`--mv-footer-h`, `--mv-mini-player-h`, etc.).

**To add a tab to mobile:** add one `<button class="mv-mob-btn" data-mob-tab="X"
onclick="mvMobileTab('X')">` to the footer (or a `.mv-mob-sheet-btn` to the "Mer" sheet)
pointing at an existing `data-tab`. No new render code needed.

Notes / gotchas:
- `beats-tab.js` injects its OWN mobile grid rules at `@768`; `lyriclab.css` self-collapses at
  760/1200px. `mobile.css` complements these, doesn't duplicate the beats grid.
- The old broken approach (`js/mobile.js` + `#mvMobileApp` full-screen overlay) was **deleted** —
  it referenced undefined functions (`buildOverlay`, `showScreen`) and was never loaded.

## 12. Work log (newest first)

- **2026-06-21** — Redesigned the `share.html` player to match the app theme (custom play/pause,
  styled seek bar with fill, current/total time, volume slider + mute toggle) and added a
  **download** button. Download fetches the audio as a blob and saves it with a filename — a plain
  cross-origin `download` attr is ignored, so the blob is the only client-side way to force a real
  download. The deployed R2 Worker `/file` sends `Access-Control-Allow-Origin: https://mekkis2002.github.io`
  (verified) and `Content-Disposition: inline` (and ignores `?download`/`?dl` params), so the blob
  download works **only from the live github.io origin**; from any other origin (local dev) the
  fetch is CORS-blocked. We deliberately do **not** open a new window on failure (user request) —
  the button just shows "⚠ Kunne ikke laste ned" briefly. The native `<audio controls>` was replaced
  by a hidden `<audio id="audio">` driven by the custom UI. To make download work off-origin you'd
  have to add the origin to the Worker's `ALLOWED_ORIGIN` (deployed Worker, not in repo).
- **2026-06-21** — Added **public single-song/beat share links** (login-free). New Supabase table
  `public.song_shares` (`id`=unguessable token, `owner_id`, `beat_id`, `kind`, `data` jsonb snapshot,
  `enabled`, `created_at`) + RLS (owner-only manage) + SECURITY DEFINER RPC
  `get_song_share(p_token)` granted to `anon` (token-gated public read; no table enumeration —
  verified anon sees 0 rows directly). SQL kept in `sql/song_shares.sql`. New `js/share-song.js`
  exposes `window.shareSong(beatId, kind)` (create/refresh link + copy/disable modal) and helpers
  `listSongShares` / `setSongShareEnabled` / `deleteSongShare` / `songShareUrl`. "Del"-knapper added
  to album/mixtape beat cards (`db.js`, `.ab-share-btn`), the beats-tab ⋯ menu (`beatsTab.shareLink`),
  and Lyric Lab rec-row (`lyriclab.js`). New self-contained public page **`share.html`** (no app JS,
  no auth) reads `?s=<token>`, calls the RPC with the anon key, renders title/cover/artist/audio for
  that one track only (audio streams from the public R2 `/file` endpoint, same origin). Admin panel
  (`admin-panel.js`) gained an "Offentlige delingslenker" section (`renderAdminShareLinks`) to
  open/copy/disable/delete links. Link token is stored on the beat (`b.shareToken`/`b.shareEnabled`)
  for reuse. Bumped `db.js`/`track-cards.js`/`lyriclab.js`/`beats-tab.js`/`admin-panel.js` `?v=` and
  added `share-song.js` to `index.html`.
- **2026-06-21** — Album/mixtape per-song play now continues the collection. Previously every
  per-song play button called `playSingleBeat` (a one-item queue → stopped after that song). Added
  `playCollectionFromBeat(beatId,mode)` in `js/db.js`: builds the queue from the whole open
  collection **in displayed order** (`beatsFromIds` for albums, `getSortedMixtapeBeats` for
  mixtapes), starts at the chosen song, and the existing `ended`→`bottomNext(true)` chain plays the
  rest. Rewired all 5 per-song play buttons (3 in `renderAlbumBeats`, plus the injected
  `.quick-play-btn` and the studio-board ▶ in `js/track-cards.js`); both track-cards call sites fall
  back to `playSingleBeat` if the fn is missing. `playSingleBeat` is unchanged (still used by the
  beats tab / standalone beats). Note: the "▶ Spill fra start" header buttons use
  `playAlbumFromStart`/`playMixtapeFromStart` (the latter ignores sort mode — pre-existing).
- **2026-06-21** — Fixed two album/mixtape regressions. (1) **Song reorder drag**:
  `startCollectionDrag` (`js/db.js`) only let a drag start when grabbing the small
  `.ab-cover-wrap` thumbnail (which also click-toggles expand), so dragging the row anywhere
  else aborted. Now drags from the whole row, excluding interactive controls
  (`button,a,input,textarea,select,.progress-wrap,.ab-stars,.star-btn,.ab-remove-btn,.ab-rename-btn`).
  (2) **Now-playing glow**: the `.now-playing-glow` CSS (`css/ui.css`) was defined but never
  applied at runtime. Root cause = **script load order**: `app.js` + `track-cards.js` load
  *before* `db.js`, yet both tried to wrap `db.js`'s `updateBottomUI` (`const old=window.updateBottomUI;
  if(old){...}`). At their load time `updateBottomUI` is `undefined`, so the wrappers never
  installed and the live play/pause hooks (`updatePlayingAnimations`, `markPlayingCard`) never
  fired. Fix: those two functions are now exposed on `window`, and `db.js`'s `updateBottomUI`
  (loaded last, the real source) calls them at the end. `updatePlayingAnimations` toggles
  `.now-playing-glow` on the playing `.album-beat-card`/`.bl-row` (matched by `data-beat-id`).
  Also fixed `markPlayingCard` reading `window.bottomPlayer` (undefined — `bottomPlayer` is a
  `const`, a global *lexical* binding, not a `window` property). Bumped `app.js`+`db.js`+`track-cards.js` `?v=`.
- **2026-06-17** — Mobile footer: dropped Hjem, leaving the four tabs (Beats, Mixtapes,
  Albumer, Lab) + "Mer". Moved Hjem into the "Mer" sheet; phones now auto-land on Beats.
- **2026-06-17** — Rebuilt mobile/phone view from scratch (see §11). Added missing
  `charset`/`viewport` meta tags (the root cause: no media queries fired on phones); authored
  fresh `css/mobile.css` as the single mobile source of truth; removed the old scattered mobile
  block from `ui.css` (was lines ~2145–2431); kept the proxy footer-nav architecture; deleted
  broken/unused `js/mobile.js`. Bumped `ui.css` + linked `mobile.css` last in `index.html`.
- **2026-06-17** — Slimmed `README.md` down to a user-facing description + how-to-use;
  moved all technical/dev detail (data model, Worker API, Lyric Lab internals, stack,
  conventions) into this file.
- **2026-06-17** — Created this FINDINGS.md memory bank. Working tree had uncommitted
  changes across `css/lyriclab.css`, `index.html`, `js/{admin-panel,app,db,label,lock,lyriclab}.js`.

---

### How to update this file
When you finish a task, add a dated bullet to **§12 Work log**, and revise any section whose
facts changed (versions in §5, new gotchas in §4, new conventions in §3, data model in §6,
mobile in §11).
Bump the "_Last updated_" date at the top.
