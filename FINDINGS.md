# FINDINGS.md — Music Vault memory bank

> **Read this file first** before doing any work in Music Vault, and **update it last**
> after you finish. It is the shared memory bank for any AI working on this repo:
> versions, conventions, gotchas, architecture, and "do / don't" rules. Keep it accurate —
> a wrong note here misleads the next agent. This file holds the **technical/dev** detail;
> `README.md` is the user-facing description only.
>
> _Last updated: 2026-06-17_

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
  `get_usernames`).
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
- A fixed bottom **footer nav** (`#mvMobileNav` in `index.html`) with buttons Hjem, Beats,
  Mixtapes, Albumer, Lab, and "Mer". Each button calls `mvMobileTab('<tab>')` (inline script
  in `index.html`), which just `.click()`s the matching desktop `.tab-btn[data-tab=...]`.
  The "Mer" button opens a bottom sheet with the remaining tabs (Pipeline, Arkivert, Label,
  Admin, Integrasjoner).
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
