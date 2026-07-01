# FINDINGS.md — Music Vault memory bank

> **Read this file first** before doing any work in Music Vault, and **update it last**
> after you finish. It is the shared memory bank for any AI working on this repo:
> versions, conventions, gotchas, architecture, and "do / don't" rules. Keep it accurate —
> a wrong note here misleads the next agent. This file holds the **technical/dev** detail;
> `README.md` is the user-facing description only.
>
> _Last updated: 2026-07-02_

---

## 0. ⚠️ MOST COMMON BUG — script load-order clobbering (READ THIS)

This has caused the **same regression at least 3 times** (now-playing glow, `markPlayingCard`,
the album/mixtape detail header losing Del/Pitch + breaking layout). Check it FIRST whenever a
feature "just stops rendering" or an enhancement silently doesn't apply.

**The trap:** `js/db.js` loads **LAST** of the core scripts (after `app.js`, `track-cards.js`,
`archive.js` — see `<script>` order in `index.html`). Several other files try to *wrap* or *enhance*
functions that `db.js` defines (`renderAlbumDetail`, `renderMixtapeDetail`, `updateBottomUI`, …):

```js
// app.js (runs BEFORE db.js):
const _old = window.renderAlbumDetail;          // ← undefined right now!
window.renderAlbumDetail = function(){ _old&&_old(); redesign(); };
// …then db.js runs: `function renderAlbumDetail(){…}`  ← clobbers the wrapper. Wrapper lost.
```

Result: the wrapper/enhancement never runs; only the base `db.js` version renders. It often goes
unnoticed because the *body* (e.g. the song list) still renders — only the header/overlay/animation
is missing.

**The fix (always the same):** expose the enhancement on `window` and have **`db.js` call it at the
end of its own function**:
```js
// app.js:  window.redesignAlbumDetail = redesignAlbumDetail;
// db.js (end of renderAlbumDetail):  if(typeof window.redesignAlbumDetail==='function') window.redesignAlbumDetail();
```
Do NOT rely on `const _old = window.fn; if(_old){…}` wrappers in app.js/track-cards.js for anything
db.js owns — they silently no-op. Currently wired this way: `redesignAlbumDetail`,
`updatePlayingAnimations`, `markPlayingCard` (all called from `db.js`). Keep those calls.

Related sub-gotcha: `bottomPlayer` is a `const` (global *lexical* binding) — reference it by bare
name, never `window.bottomPlayer` (undefined).

---

## 1. What this project is

**Music Vault** — a personal hiphop studio web app for a single artist. Collects beats,
lyrics, recordings and project flow on one screen. Runs entirely in the browser, no
server, no install. UI language is **Norwegian** — match it in any user-facing strings.

- **Live:** https://mekkis2002.github.io/Music-Vault/
- **Repo version label:** v3.1 (June 2026) — see `js/changelog.js` (authoritative).

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
  Same trap bites `renderAlbumDetail`: app.js's `redesignAlbumDetail` wrapper is clobbered by db.js's
  later `function renderAlbumDetail` declaration. The premium album header only renders because
  db.js's `renderAlbumDetail` calls `window.redesignAlbumDetail()` at the end — keep that call.
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
    rawVocals: [{ id, name, size, type, key, idbKey, url, uploadedAt }],
    playCount, lastPlayedAt,
    bpm, key, mood, tags, done, favorite, rating, archived
  }],
  albums:   [{ id, name, cover, beatIds, studioOrder, status, done, archived }],
  mixtapes: [{ id, name, cover, beatIds, studioOrder, archived }],
  settings: {}
}
```

Notes:
- Legacy `beat.lyrics` is migrated into `beat.lyricSections[0]` (original kept).
- Recording takes are stored on `beat.takes[]`.
- Mixtape cassette variant is chosen **deterministically per mixtape id**.
- `album/mixtape.studioOrder` (optional `[beatId]`) is the **studio-view-only** ordering, kept
  separate from `beatIds` so reordering in the studio kanban does NOT change the album/mixtape
  track order. Seeded from `beatIds` on first studio drop; `renderStudioBoard` falls back to
  `beatIds` order when it's absent. Only `js/track-cards.js` reads/writes it. (FINDINGS §12 2026-06-23 F2)

## 7. Cloudflare Worker API

Source in repo: `worker/r2-worker.js` (R2 endpoints). The `/rhyme` proxy lives in the
deployed Worker. See `worker/SETUP.md`.

**R2 key namespaces:** `active/{beatId}` (live audio), `archived/{beatId}` (archived audio),
`raw/{beatId}/{fileId}` (F5 RAW vocal stems — uncompressed, one per uploaded file). `r2-storage.js`
exposes `upload(beatId,file,archived)`/`remove(beatId,archived)`/`move` for the beat audio, plus
generic `uploadKey(key,file)`/`removeKey(key)`/`fileUrl(key)` for arbitrary keys (used by RAW vocals).

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
`admin-panel.js` admin UI • `share-song.js` public single-song share links •
`docs.js` standalone Docs/notes tab.

CSS: `main.css` base/vars/layout • `ui.css` hero/stats/buttons/vinyl • `track-cards.css` •
`archive.css` • `mixtape.css` • `lyriclab.css` • `pipeline.css` • `docs.css` •
`player.css` (Spotify-style bottom player) • `home.css` (Hjem/dashboard redesign) •
`mobile.css` (both player.css & home.css load after ui.css, before mobile.css).

## 10. Run locally

```bash
npx serve .      # or: python3 -m http.server 8080
```
Web Audio API requires HTTP, not `file://`. Deploy = push to `main` (GitHub Pages auto).

## 11. Mobile / phone layout (rebuilt juni 2026)

The mobile view **reuses desktop tab content** — it does NOT re-render screens. How it works:
- A fixed bottom **footer nav** (`#mvMobileNav` in `index.html`) with 4 buttons **Hjem,
  Mixtapes, Album, Docs** (redesign 2026-07-02 — was Beats/Mixtapes/Albumer/Lab/Mer). Each
  button calls `mvMobileTab('<tab>')` (inline script in `index.html`), which just `.click()`s
  the matching desktop `.tab-btn[data-tab=...]`.
- **The old "Mer" bottom sheet was removed** (markup + `mvMobileMore`/`mvMobileMoreClose` JS +
  the `.mv-mob-sheet*` CSS). All other tabs are now reached from the **Hjem dashboard hub**
  instead (see below), so nothing is stranded.
- **Hjem IS now the mobile landing + footer home.** On phones (`innerWidth <= 768`) the app
  auto-lands on **Hjem** (see the `load` handler in the inline mobile script; previously Beats).
- **Hjem is a mobile hub.** The dashboard has two mobile-only nav blocks (in `#hjemTab`,
  hidden on desktop via `home.css` `.hjem-mobile-shortcuts,.hjem-mobile-more{display:none}`,
  revealed in `mobile.css`): a 4-up **shortcut grid** (`.hjem-mobile-shortcuts` → Beats, Lyric
  Lab, Pipeline, Docs) and a **"Flere sider"** row (`.hjem-mobile-more` → Arkivert,
  Integrasjoner, Label, Admin). Label/Admin are admin-gated by `mvSyncHomeMoreLinks()` (inline
  script), which mirrors the authoritative desktop `.tab-btn` display onto each
  `.hjem-more-link[data-req-tab]`; it's called at the end of `renderDashboard()` (runs after
  login + every Hjem render). The mobile home is **reflowed via flex `order`** on `.dash-inner`
  (mobile.css only, desktop DOM untouched): greeting → shortcuts → Flere sider → status cluster
  (`.hjem-bottom-row` Aktivitet/Varsler/Fremdrift = "hva bør du jobbe med", lifted up) → the
  rest (projects, last-beat, recent, comments).
- All phone styling lives in **`css/mobile.css`** (single source of truth, loaded last,
  one breakpoint `@media (max-width: 768px)`). It hides the desktop `.mv-tabs` row, shows the
  footer/sheet/FAB, reflows grids to 1–2 columns, stacks toolbars, sizes touch targets ≥44px,
  forces inputs to 16px (avoids iOS zoom), and repositions the bottom player above the footer.
  Tunable constants are CSS vars at the top (`--mv-footer-h`, `--mv-mini-player-h`, etc.).

**To add a tab to mobile:** either add one `<button class="mv-mob-btn" data-mob-tab="X"
onclick="mvMobileTab('X')">` to the footer (keep it to ~4), OR add a `.hjem-shortcut`
(onclick `mvMobileTab('X')`) to `.hjem-mobile-shortcuts` / a `.hjem-more-link data-req-tab="X"`
to `.hjem-mobile-more` on the Hjem hub, pointing at an existing `data-tab`. No new render code
needed. (The old "Mer" bottom sheet no longer exists — see the redesign note above.)

Notes / gotchas:
- **Album/mixtape + beats rows are redesigned Spotify-style on phones** (2026-07-02): cover +
  title + favourite star; **no play button** — tapping the row plays it (via `window.mvTapPlay`),
  except tapping the **cover** (which still expands album/mixtape rows). A now-playing row shows an
  animated gold equalizer over the cover + gold title (`.now-playing-glow`, keyframes `mvEq`/`mvEqBl`).
  `mvTapPlay` is mobile-only (`innerWidth>768`→no-op) and is wired on `.ab-body` (cover is a sibling,
  so cover taps don't reach it) and on `.bl-row` (cover excluded in the guard). The "uploaded-by" 👤
  tag (`.ab-uploader` / `.bl-uploader`) is hidden on phones. To show the cover you MUST out-specify
  `track-cards.css` @700 (`.ab-cover-wrap{display:none}`) and `archive.css` (cover `::after` reset) —
  use the full `.album-beat-listmode .album-beat-card:not(.expanded)` selector. See §12 2026-07-02.
- **The bottom player is a simplified mini-player on phones** (2026-07-02): only cover+title,
  prev/play/next and a thin full-width seek bar. `.bp-actions` (volume + ✕ close) and `.bp-time`
  labels are `display:none` in `mobile.css`; `.bp-center` is `display:contents` so controls +
  progress wrap as direct flex items. Don't re-add volume/close to the phone player. See §12.
- **Album/mixtape detail is simplified on phones** (2026-07-02): secondary header/toolbar actions
  (Bytt bilde, A/B-side, Pitch, Del med bruker) carry the marker class **`.mv-mob-hide`**
  (`display:none` in mobile.css `@768`); the view toggle (`.track-view-toggle`) + dropzone
  (`.drop-zone`) are hidden; and `track-cards.js` `getView()` is **locked to `'list'` when
  `innerWidth<=768`** (both getView copies). To expose a new action on the mobile detail view,
  do NOT add `.mv-mob-hide` to it. See §12 2026-07-02.
- `beats-tab.js` injects its OWN mobile grid rules at `@768`; `lyriclab.css` self-collapses at
  760/1200px. `mobile.css` complements these, doesn't duplicate the beats grid.
- The old broken approach (`js/mobile.js` + `#mvMobileApp` full-screen overlay) was **deleted** —
  it referenced undefined functions (`buildOverlay`, `showScreen`) and was never loaded.

## 12. Work log (newest first)

- **2026-07-02** — **Mobil rad: tap-to-play + fjernet play-knapper og uploader.** Bumpet
  `db.js`→`202607020003`, `beats-tab.js`→`202607020002`, `mobile.css`→`202607020004`. **KUN telefon.**
  (1) **Fjernet play-knappene** i radene på mobil (`.ab-quick-play` album/mixtape via `display:none` i
  mobile.css; `.bl-play` beats via `display:none` i beats-tab.js `@768`). (2) **Tap-to-play:** ny global
  `window.mvTapPlay(e,id,kind)` i `db.js` — gjør INGENTING på desktop (`innerWidth>768` → return), og på
  mobil spiller den sangen med mindre klikket traff coveret eller en kontroll (guard:
  `closest('button,a,input,select,textarea,label,.ab-cover-wrap,.bl-cover,.ab-stars,.progress-wrap,.star-btn')`).
  `kind==='beat'`→`beatsTab.playBeat`, ellers `playCollectionFromBeat(id,kind)`. Koblet på **`.ab-body`**
  (album/mixtape — coveret er et SØSKEN av ab-body, så cover-tap bobler ikke dit → coveret utvider fortsatt
  via sin egen `toggleAlbumBeat`) og på **`.bl-row`** (beats — coveret `.bl-cover` er ekskludert i guarden).
  Verifisert med headless klikk-simulering: cover→ingen avspilling, tittel→spiller, stjerne/meny→ingen
  avspilling. (3) **Fjernet «lastet opp av»-info** på mobil: la til klasse `.ab-uploader` på 👤-taggen i
  `renderAlbumBeats` (begge rad-variantene, `db.js`) og skjuler den i mobile.css (beats-fanens
  `.bl-uploader` var allerede skjult på mobil). Se §11.
- **2026-07-02** — **Mobil rad-redesign: album/mixtape + beats i Spotify-stil, med «spilles nå»-
  equalizer.** Bumpet `db.js`→`202607020002`, `beats-tab.js`→`202607020001`, `mobile.css`→
  `202607020003`. **KUN telefon** (desktop urørt — alt i `@768`/injisert `@768`; verifisert med
  headless-render av begge rad-systemer). Hver rad = **cover + tittel + play + favoritt-stjerne**,
  alltid synlig; resten (del/gi nytt navn/fjern, spilleteller-chip, 10-stjerners rating, %-bar) skjult
  på mobil (fortsatt tilgjengelig ved å utvide raden). **(A) Album/mixtape-rader** (`.album-beat-card`
  i `.album-beat-listmode`, `mobile.css`): la til `class="ab-quick-play"` på den runde play-knappen i
  `renderAlbumBeats` (`db.js`) så den kan styles rent; skjuler klutter; tvinger en ren flex-rad med
  **synlig 52px cover**. **VIKTIG gotcha:** `track-cards.css:396` har `@media(max-width:700px)` som
  SKJULER coveret i listmode (`.ab-cover-wrap{display:none}`), og `archive.css:816` skjuler
  `.ab-cover-wrap::after`. Begge har høy spesifisitet + `!important`, så cover-vis- og equalizer-reglene
  MÅ bruke den fulle `.album-beat-listmode .album-beat-card:not(.expanded) …`-selektoren for å vinne
  (mobile.css laster òg sist). Equalizer-selektoren legger til `.now-playing-glow` for å nå (0,5,1) >
  archive sin (0,4,1), og setter eksplisitt `display:block` (archive tvinger `display:none`). **(B) Beats-
  fanen** (`.bl-row`, injisert CSS i `beats-tab.js`): forrige mobil-CSS SKJULTE coveret og play var
  hover-avslørt (`opacity:0`, ingen hover på touch) — nå vises cover (46px) + alltid-synlig play; grid
  `46px 1fr auto`; skjuler num/samlinger/opplaster/dato/lengde + kolonne-headeren. **(C) «Spilles nå»-
  effekt:** animert gull-equalizer (3 bars) tegnet som cover-`::after` via 3 `linear-gradient`-lag hvis
  `background-size`-høyder animeres i `@keyframes mvEq` (album, i mobile.css) / `mvEqBl` (beats,
  selvstendig i beats-tab.js) + gull tittel, på `.now-playing-glow`-raden (settes av
  `updatePlayingAnimations` i app.js via `data-beat-id`; fjernes ved pause). `::after` har
  `pointer-events:none` så tapp-for-å-utvide på coveret fortsatt virker. **Merk:** `track-cards.css`
  ~L342-352 har en pre-eksisterende ØDELAGT CSS-blokk (foreldreløse deklarasjoner etter `}`) som gjør at
  `.album-beat-listmode …ab-top{display:grid}` (L354) forkastes → ab-top er `flex` i listmode. Ikke stol
  på grid-regelen der. Se §11.
- **2026-07-02** — **Mobil bunnavspiller — forenklet til Spotify-stil mini-spiller.** Bumpet
  `mobile.css`→`202607020002` (KUN telefon; desktop-spilleren i `player.css` er urørt — verifisert).
  Ny mobil-layout: `.bottom-player.show` blir `display:flex;flex-wrap:wrap`, og `.bp-center` settes
  til **`display:contents`** så dens barn (`.bp-controls` + `.bp-progress`) blir direkte flex-items av
  spilleren og kan brytes uavhengig. Rad 1: cover+tittel (`.bp-track` `flex:1`, `max-width:none` for å
  overstyre `player.css:26` sin `max-width:30%`) til venstre + prev/play/next (`.bp-controls` order 2)
  høyrejustert. Rad 2: tynn full-bredde seek-bar (`.bp-progress` `flex:1 1 100%`, order 4). **Droppet
  på mobil:** hele høyre-klyngen `.bp-actions` (🔊-ikon + volum-slider + ✕-lukk) via `display:none`, og
  tid-etikettene `.bp-time` (0:00/0:00). Begrunnelse: volum styres av telefonens maskinvareknapper, og
  ✕ er unødvendig (Spotify/Apple Music mini-spillere har ingen lukk — pause stopper lyden, baren er
  vedvarende). `--mv-mini-player-h` 60→78px (to rader) så innholdets bunnmarg stemmer. **Gotcha:**
  første forsøk beholdt ✕ men den kollapset til `width:0` (kjempet mot `.bp-btn`/`player.css`-regler i
  en `display:grid`-knapp) — å skjule hele `.bp-actions` var både enklere og renere. Se §11.
- **2026-07-02** — **Mobil album/mixtape-detalj — forenklet (fjernet støy).** Bumpet
  `app.js`/`db.js`/`track-cards.js`→`202607020001`, `mobile.css`→`202607020001`. **KUN telefon**
  (desktop 100 % uendret — verifisert med headless-render begge bredder). (1) **Skjulte sekundære
  knapper** på album/mixtape-detalj-headeren + toolbaren: 🖼️ Bytt albumbilde / Kassettbilde,
  💿 A/B-side, 📄 Pitch, 👤 Del med bruker. Metode: la til markørklassen **`.mv-mob-hide`** på hvert
  element i render-kilden (`app.js` album-header `redesignAlbumDetail`, `db.js` mixtape-header
  `renderMixtapeDetail`, `index.html` de to cover-bytte-labelene i toolbarene), og
  `mobile.css` har `.mv-mob-hide{display:none!important}` inne i `@768`. **Beholdt: ▶ Spill fra
  start, ⏹ Stopp, + Legg til eksisterende, 📂 Last opp filer, Arkiver, Slett, (mixtape) sortering.**
  (2) **Visningsveksler (Rader/Kort/Studio) skjult** på telefon (`.track-view-toggle{display:none}`),
  og **rad-visning tvunget** som eneste modus: `track-cards.js` `getView()` (BEGGE forekomstene —
  IIFE §2 + render-hook §3) returnerer `'list'` når `innerWidth<=768`, uansett lagret
  `musicVaultTrackViewMode`. (3) **Dropzonen «Slipp lydfiler her» skjult** (`.drop-zone{display:none}`)
  — native HTML5-DnD virker uansett ikke på touch. **Ny konvensjon: mobil-only skjuling gjøres med
  markørklassen `.mv-mob-hide` (skjult i mobile.css `@768`), lagt på elementet i render-kilden når
  en ren CSS-selektor er skjør.** Se §11.
- **2026-07-02** — **F1 «fiks telefonvisning» — mobil Hjem-redesign + ny footer.** Bumpet
  `home.css`/`mobile.css`/`db.js` `?v=`→`202607010001`. **KUN telefon** (desktop-hjem er 100 %
  uendret — verifisert med headless-Chrome-render på begge bredder). (1) **Footer** (`#mvMobileNav`
  i `index.html`) ble til 4 knapper: **Hjem, Mixtapes, Album, Docs** (var Beats/Mixtapes/Albumer/
  Lab/Mer). (2) **«Mer»-arket fjernet helt** — markup, `mvMobileMore`/`mvMobileMoreClose`-JS, og
  `.mv-mob-sheet*`-CSS. (3) **Hjem er nå mobil-landing** (`load`-handler: `mvMobileTab('hjem')`, var
  `'beats'`). (4) **Hjem er en mobil-hub:** to nye mobil-only nav-blokker i `#hjemTab` (skjult på
  desktop via `home.css`, vist i `mobile.css`): snarveis-grid `.hjem-mobile-shortcuts` (Beats/Lyric
  Lab/Pipeline/Docs) + `.hjem-mobile-more` «Flere sider» (Arkivert/Integrasjoner/Label/Admin).
  Label/Admin gates av ny `mvSyncHomeMoreLinks()` (inline script) som speiler desktop-`.tab-btn`-
  synlighet onto `.hjem-more-link[data-req-tab]`; kalles på slutten av `renderDashboard()`. (5) **Mobil
  reflow via flex `order`** på `.dash-inner` (kun mobile.css, desktop-DOM urørt): greeting → snarveier
  → Flere sider → status-klynge (`.hjem-bottom-row` Aktivitet/Varsler/Fremdrift løftet opp = «hva bør
  du jobbe med») → resten. Se §11. **Testnotat/gotcha:** headless Chrome på denne maskinen rendrer
  viewporten ~1.25× bredere enn `--window-size` (OS-skalering 125 % → 390 blir 485 CSS-px);
  `--force-device-scale-factor=1` hjelper ikke. `scrollWidth==clientWidth` (pga `overflow-x:hidden`)
  skjuler ekte overflow — mål `getBoundingClientRect().right` mot faktisk `clientWidth` i stedet, og
  sett `--window-size`-bredde til ~1.25× ønsket telefonbredde for et ukuttet skjermbilde.
- **2026-06-23** — **Forbedringsliste Pulje 4 del 2** (F7 — FULLFØRT PULJE 4). Bumpet `db.js`/
  `beats-tab.js`/`track-cards.css` `?v=`→`202606230012`. **Avspillingshistorikk/spilleteller.** La til
  `recordBeatPlay(beatId)` kalt fra `playBottomIndex` rett etter at `audio.play()` lykkes — det er det
  ENESTE knutepunktet for all avspilling (album, mixtape, enkeltbeat, samling går alle via
  `playQueue`→`playBottomIndex`), så én opptelling dekker alt. Øker `beat.playCount` +
  setter `beat.lastPlayedAt`, `saveState()` (synker til Supabase). **Terskel (per brukerønske, `?v=…0013`):
  teller KUN når ≥20% av sangen er spilt av** (ikke ved start). `playBottomIndex` nuller
  `bottomPlayer.playCounted=false` per ny sang; `updateBottomProgress` (timeupdate) kaller `recordBeatPlay`
  når `currentTime/dur>=0.2 && !paused && !playCounted`, og setter flagget så det teller maks én gang per
  avspilling. (NB: å scrolle forbi 20% teller også — akseptabelt; matcher «20% spilt av».) Vises som en liten gull-chip
  `.ab-playcount` (`data-pc-id=<beatId>`, skjult når 0 via `.empty`) i tittel-raden på album/mixtape-kort
  (`db.js`) OG i beats-fanens `.bl-row` (`beats-tab.js`). `updatePlayCountBadges(beatId)` oppdaterer alle
  chips live via `[data-pc-id]` uten full re-render. Hjelpere i `db.js`: `recordBeatPlay`, `playCountTitle`
  (tooltip «Spilt N ganger · sist …»), `updatePlayCountBadges`. Se §6 datamodell (`playCount`,
  `lastPlayedAt`). **Pulje 4 KOMPLETT (F6 bytt lydfil, F5 RAW-vokaler, F7 spilleteller).**
- **2026-06-23** — **Forbedringsliste Pulje 4 del 1** (F6 + F5). Bumpet `db.js`/`track-cards.css`/
  `r2-storage.js` `?v=`→`202606230010`. (F6) **Bytt ut lydfil på en sang.** «🎵 Bytt lydfil»-knappen
  (`uploadBeatAudio`) lagret før KUN lokalt (IDB), uten advarsel og uten R2. Nå: `confirm()`-advarsel
  («overskriver den gamle PERMANENT»), lagrer ny lokal blob (umiddelbar avspilling), OG laster opp til R2.
  Siden R2-nøkkelen er `active/{beat.id}` (stabil) **overskriver** PUT-en den gamle filen → gammel fil
  slettet/​lagring frigjort automatisk. URL-en er identisk etter overskriving, så `audio_url` får en
  cache-bust (`?v=Date.now()`) for å unngå at gammel lyd serveres. Pusher til Supabase. (F5) **RAW-vokaler.**
  Ny seksjon i det utvidede album/mixtape-beat-kortet (`.ab-raw`, `id=abraw-<beatId>`): last opp FLERE
  høykvalitets vokalfiler (NB: hopper bevisst over `audioCompress` — full kvalitet), hver får offentlig
  R2-URL. Lagres i `beat.rawVocals[]` (synkes til Supabase). Per fil: ⬇ last ned/åpne, 🔗 kopier
  delingslenke (for produsenter), 🗑 slett (confirm → R2 `removeKey` + fjern metadata). R2-nøkkel:
  `raw/{beatId}/{fileId}` — krevde nye generiske `uploadKey/removeKey/fileUrl` i `r2-storage.js` (de gamle
  `upload/remove` bygger bare `active|archived/{beatId}`). Funksjoner i `db.js`: `uploadRawVocals`,
  `deleteRawVocal`, `copyRawVocalLink`, `rawVocalsMarkup`, `renderRawList`. Se §6 (datamodell) + §7
  (R2-namespaces). NB: nedlasting via `download`-attr ignoreres cross-origin (FINDINGS share-notat) — derfor
  er 🔗 kopier-lenke hovedmåten å dele med produsenter. **Follow-up (`?v=…0011`) — LOKAL-FØRST:** første
  versjon krevde R2 og gjorde «ingenting» lokalt (R2-CORS tillater kun github.io-origin → opplasting feiler
  stille). Nå lagres hver fil i IndexedDB FØRST (`audioDB.save('raw:{beatId}:{rawId}', file)`) og vises
  umiddelbart med ⬇ lokal nedlasting (`downloadLocalRaw` → objekt-URL fra IDB); R2-opplasting skjer i
  bakgrunnen for delbar lenke. Uten R2-url vises «lokal»-badge og 🔗 sier at lenke lages på live-siden.
  `rawVocals`-entry har nå også `idbKey`. `accept` utvidet med eksplisitte endelser (`.wav,.aif,.aiff,
  .flac,.m4a`) siden `.wav` ikke alltid matcher `audio/*` i fil-velgeren. **Regel: R2-funksjoner kan ikke
  testes lokalt (CORS = kun github.io) — bygg lokal-først (IDB) så de er testbare + degraderer pent.**
  **GJENSTÅR i Pulje 4: F7 avspillingshistorikk/spilleteller** (ikke startet).
- **2026-06-23** — **Forbedringsliste Pulje 3** (visuell polish). Bumpet `db.js`/`track-cards.js`/
  `track-cards.css`/`app.js`/`main.css` `?v=`→`202606230008`. (V11) **Én kombinert progresjonsbar.**
  Album-beat-kortet hadde TO barer: en visuell `.progress-bar` + en `<input type=range>` under. Erstattet
  begge med ÉN stylet range (`<input class="ab-progress-range" id="abirange-<id>" style="--pct:..%">`):
  gull gradient-fyll opp til `--pct`, grå spor etter, hvit thumb. Fyllet males via `--pct` (samme mønster
  som player-seekbaren, `bpSetRangeFill`). CSS i `track-cards.css` bruker `::-webkit-slider-runnable-track`
  + `::-moz-range-track` (gradient) og sentrert thumb (`margin-top:-3px`). `setAlbumBeatDone` oppdaterer nå
  `--pct` på range i stedet for `.progress-bar` width. NB: det finnes TO `setAlbumBeatDone` (db.js + en
  `window.`-versjon i track-cards.js) — db.js vinner (laster sist), men begge ble oppdatert. (V12) **Album-
  vinylen roterer ved avspilling.** Den roterte ALDRI: `#albumDetailHd .album-detail-vinyl` har
  `transform:translateY(-50%)!important` (ui.css) for sentrering, og `!important` statisk transform slår
  CSS-animasjoner → `vinylSpin` ble blokkert. Fiks: la disk-VISUALET (bakgrunn/spor/skygge) + spinnet på et
  NYTT indre element `.album-detail-vinyl-disc` (uten posisjonerings-transform, så rotasjon er fri).
  `.album-detail-vinyl` (ytre) beholder posisjonering. Roterer KUN under avspilling via `body.is-playing-album`
  (allerede live-togglet av `updatePlayingAnimations`, app.js:559 — gjelder både album-spill OG per-sang siden
  `playCollectionFromBeat` setter `context.type='album'`). Idle = statisk. Markup endret i `app.js`
  (wrapper-div). Fjernet den døde `vinyl-spinning`-toggle på «Spill fra start». **Regel: en CSS-rotasjon
  blokkeres av en `!important` statisk `transform` på samme element — roter et indre element uten
  posisjonerings-transform.** **Follow-up (per brukerønske, `?v=…0009`):** byttet CSS-spinnet ut med en
  **rAF-drevet spinn-motor** i `app.js` (`mvVinylSetPlaying`, kalt fra `updatePlayingAnimations`) slik at
  vinylen **gradvis spinner OPP fra null** når avspilling starter og **gradvis ned til stopp** når den
  stopper — en CSS `animation:…infinite` kan ikke ease seg inn/ut av full fart. Vinkelhastigheten ease-er
  mot et mål (full fart ved spilling, 0 ved stopp) via `vel+=(target-vel)*(1-e^(-dt/TAU))`; setter
  `transform:rotate()` på `.album-detail-vinyl-disc` hver frame; stopper rAF-loopen når den er helt stille.
  Topphastighet senket til 6s/omdreining (`VINYL_MAX_DPS=360/6`), ramp `VINYL_RAMP_TAU=1.5s` (juster disse
  to konstantene for fart/mykhet). Fjernet `animation:vinylSpin`-regelen i `main.css` (ikke re-add den). (V13) **Nytt beat arver cover umiddelbart.** `archive.js` har allerede
  arve-maskineri (`syncCollectionCover`, hekta på `renderAlbumDetail`), men nye beats (cover:"") fikk
  placeholder til neste detail-render. La til `inheritCollectionCover(beat,col,type)` kalt direkte i
  `addBeatToAlbum`/`addBeatToMixtape`: setter `beat.cover=col.cover` + `coverInherited`-flagg med en gang
  (kun hvis beatet mangler cover). (V14) **Cover-crop: største sentrerte kvadrat.** `setAlbumBeatCover`
  STREKTE bildet inn i 600x338 (`drawImage(img,0,0,600,338)`), og `newAlbumCoverInput` letterboxet
  (`Math.min`). Ny delt helper `mvSquareCoverDataURL(img,size,quality)` (sentrert største-kvadrat-crop via
  `drawImage(img,sx,sy,s,s,0,0,size,size)`) brukt i `setAlbumBeatCover`, `newAlbumCoverInput` og
  `makeAlbumCover`. Mixtape/kassett-cover har egen interaktiv crop (`cassetteCropUpload`) — IKKE rørt.
- **2026-06-23** — **Forbedringsliste Pulje 2** (drag-and-drop-opprydding). (F3) **Reorder-drag starter
  nå BARE fra coveret, etter press-and-hold.** Tok `draggable`/`ondragstart` av hele `.album-beat-card`
  og la det på `.ab-cover-wrap` i `js/db.js` (`renderAlbumBeats`); drop-handlerne (`dragBeatOver`/
  `dragBeatLeave`/`dropCollectionBeat`) ble igjen på kortet (drop-target). La til en arm-gate:
  `startCollectionDrag` (på coveret) flytter sangen. **ENDELIG design (etter 2 mislykkede forsøk samme
  dag — `?v=…0005`):** drag fra coveret er nå UMIDDELBAR (ingen press-and-hold), helt lik studio-boardet
  som brukeren bekreftet «funker perfekt». Historikk for å unngå å gjeninnføre fellene: forsøk 1 hadde en
  «arm»-gate (onpointerdown→200/280ms-timer→`_coverDragArmed`-flagg som `startCollectionDrag`
  sjekket). To problemer drepte den: (a) `onpointerleave` nullet armingen — coveret er 42px i radvisning,
  så pekeren forlater det i det du begynner å dra, FØR `dragstart`; (b) selv uten det krevde gaten at man
  holdt STILLE i 200ms før man dro — en naturlig «ta-tak-og-dra» (<200ms) ble alltid blokkert → «kan ikke
  dra kortene i det hele tatt». Konklusjon: **ikke prøv press-and-hold-gating oppå native HTML5-DnD** —
  pointer-events (leave/cancel/up) fyrer rundt `dragstart` på uforutsigbar måte og native drag trenger
  bevegelse umiddelbart. Fjernet hele arm-mekanikken (`coverHoldStart`/`coverHoldCancel`/`_coverDragArmed`
  og pointer-attrs). Slider-bugen («drag aktiveres når jeg justerer progresjonen») er løst alene av at
  drag-kilden nå KUN er `.ab-cover-wrap` (slideren ligger ikke lenger i et `draggable` element). Klikk på
  cover = utvid (native dragstart fyrer bare på faktisk drag-bevegelse, ikke klikk). `.drag-armed`-CSS i
  track-cards.css er nå ubrukt (ufarlig). Erstattet den gamle `closest("button,a,input,…")`-guarden (unødig
  — kilden er kun coveret). NB: native HTML5-DnD virker ikke på touch (desktop-interaksjon, uendret). (F2)
  **Studio-rekkefølge er nå uavhengig av album/mixtape.** `handleStudioDrop` (`js/track-cards.js`)
  skrev tidligere `col.beatIds` → endret faktisk album-rekkefølgen. Nå skriver den en egen
  `col.studioOrder` (seedes fra `beatIds` første gang, holdes i sync på medlemskap), og `beatIds` røres
  ikke. `renderStudioBoard` sorterer beats etter `studioOrder` når den finnes (ellers `beatIds`).
  Stage-bytte (`beat.done = STAGE_VAL`) beholdt — det er studioens hensikt. Se §6 datamodell. (V8)
  **Gull drop-linje i rad/kort — FIKSET (var aldri synlig).** CSS-en fantes (`track-cards.css:~1407`)
  men `::after`-linjen lå UTENFOR kortet (`top/bottom/left/right:-3px`) og `.album-beat-card` har
  `overflow:hidden` (main.css:161/584 + track-cards.css:8) → linjen ble alltid klippet bort. Min første
  «verifisering» var feil (jeg leste bare CSS-en, testet den ikke). **To bom-fikser før det funket:**
  (a) flyttet `::after` fra utenfor (`-3px`) til innenfor (`0`) kanten — fortsatt usynlig fordi en
  `::after` er et BARN av kortet: utenfor klippes den av `overflow:hidden`, og innenfor males den UNDER
  radinnholdet (cover/tittel). (b) **Endelig løsning:** dropp `::after` helt — bruk en YTRE `box-shadow`
  på selve kortet (`box-shadow: 0 -3px 0 0 #f4a443, 0 -3px 13px glow` for «slipp før», `0 3px …` for
  «etter»; venstre/høyre for grid). Et elements egen `overflow:hidden` klipper IKKE elementets egen
  outset-skygge, og den males i mellomrommet ved siden av kortet (over innholdet). La til `z-index:3` på
  `.drag-over` så skyggen ligger over nabokortet. **Regel: drop-indikatorer på et `overflow:hidden`-kort
  må tegnes som kortets egen outset `box-shadow`, ALDRI som et `::after`-barn (klippes/males under
  innhold).** `track-cards.css?v=`→`202606230007`. (Pulje 2 versjoner: `db.js`→`…0005`,
  `track-cards.js`→`…0003`, `track-cards.css`→`…0007`.)
- **2026-06-23** — **Forbedringsliste Pulje 1** (3 raske gevinster). (F4) **Logo → Hjem**: la til en
  click-listener på `.mv-logo` i `js/db.js` (rett før `.tab-btn`-wiringen) som `.click()`er
  `[data-tab="hjem"]`; gjorde logoen klikkbar i `css/ui.css` (`cursor:pointer` + gull hover/glow). Holdt
  den ut av inline-JS (konvensjon). For produsentbrukere blokkeres hjem av den eksisterende tab-guarden
  (viser bare en toast) — akseptabelt. (V9) **Rad-handlinger alltid synlige**: `.ab-share-btn`/
  `.ab-rename-btn`/`.ab-remove-btn` hadde inline `opacity:0` + ble bare avslørt av
  `.album-beat-card:hover` (i `track-cards.css`/`ui.css`). Endret hover-regelen i `css/track-cards.css`
  (~L1322) til `.album-beat-card .ab-*-btn{opacity:1!important}` (stylesheet-`!important` slår den
  *normale* inline `opacity:0`). De gamle `:hover`-reglene i ui.css setter samme verdi → harmløse.
  (V10) **Tom del-knapp**: radkortets «Del offentlig lenke»-knapp (`db.js:882`) brukte et inline-SVG
  lenkeikon som rendret tomt hos brukeren; byttet til `🔗`-emoji (matcher del-modalens `🔗 Del sang`)
  + la til `font-size:13px;line-height:1`. NB: del-knappen finnes IKKE i den *utvidede* `ab-expand`-raden
  (Spill/Bytt lydfil/Coverbilde) — den ligger på selve sangraden som vises over det åpne kortet. Bumpet
  `db.js`/`ui.css`/`track-cards.css` `?v=`→`202606230002`. **Resterende forbedringsliste (prioritert):**
  Pulje 2 (DnD-opprydding) F3 hold-på-cover for å starte drag (long-press, skille fra klikk-utvid),
  F2 uavhengig studio-rekkefølge (egen `studioOrder`, ikke del `beatIds`), V8 verifiser drop-linje i
  rad/kort. Pulje 3 (visuell): V11 kombiner de to progresjonsbarene til én, V12 vinyl roterer ved
  avspilling (merk: `app.js:201` legger allerede `vinyl-spinning` på `#albumDetailHd` ved «Spill fra
  start» — bygg på den), V13 nytt beat arver album/mixtape-cover umiddelbart, V14 bedre cover-crop
  (største kvadratiske utsnitt). Pulje 4 (R2/datamodell): F6 bytt ut lydfil (slett gammel + advarsel),
  F5 last opp RAW-vokaler (flere filer, deling/sletting), F7 avspillingshistorikk/spilleteller.
  Egen sak: F1 «fiks telefonvisning» — venter på konkret beskrivelse fra bruker (hvilken side/bredde).
- **2026-06-23** — **Drag-and-drop drop indicators** + **studio column DnD**. (1) Studio board: tracks
  are now draggable between the 4 stage columns (`js/track-cards.js`: `wireStudioDnD`/`handleStudioDrop`).
  Dropping into a different column snaps the song's `done%` into that stage (Idé=10/Spilt inn=40/
  Miks=80/Ferdig=100); dropping within the same column just reorders (preserves %). A stage-coloured
  drop-line (`.studio-drop-line`, uses the column's `--s`) + a column glow (`.studio-col-over`) show
  where it lands; the dragged track fades. After drop it `saveState()`s and re-renders. (2) List & card
  song reorder now show a **gold insertion line** instead of the old loud cyan/gold box — pure CSS via
  `.album-beat-card.drag-over[data-drop-after]::after` (list = horizontal top/bottom, grid = vertical
  left/right). Made `dragBeatOver` (`js/db.js`) mode-aware (list → Y, grid → X) so the line is accurate;
  left `isDropAfter` untouched (still used by album/mixtape card reorder). Bumped `db.js`/`track-cards.js`/
  `track-cards.css` `?v=`→`202606230001`.
- **2026-06-23** — Redesigned the **Studio view** (album/mixtape) into a real **production-pipeline
  kanban** + fixed why it looked identical to the cards view. Root cause was the classic §0 trap:
  track-cards.js tried to wrap `window.renderAlbumBeats` (`const origRender=window.renderAlbumBeats; …`)
  but db.js loads LAST and `origRender` is undefined at wrap time, so the wrapper never installed and
  `renderStudioBoard` **never ran** — "studio" was just the card grid + an `.album-beat-studio` class
  (hence "identical to cards, smaller, harder to read"). Fix (FINDINGS §0 pattern): exposed
  `window.afterRenderAlbumBeats(el,mode)` in `track-cards.js` and call it at the END of db.js's
  `renderAlbumBeats`; it applies the view class and, for studio, calls `renderStudioBoard`. Redesigned
  the board: 4 stage columns (Idé/Skriver=blue, Spilt inn=amber, Miks/Master=purple, Ferdig=green) each
  with a glowing dot + count pill, and track rows with a tinted thumb, bold title, stage-coloured
  progress bar, ★/audio status, and a coloured play button. Track click → `openInLyricLab`; ▶ →
  `playCollectionFromBeat`. New CSS appended to `css/track-cards.css` (uses `color-mix` for the per-stage
  tints — needs an evergreen browser). Cards/list views are intentionally left exactly as db.js renders
  them (didn't wire `enhanceCards`). Bumped `db.js`/`track-cards.js`→`202606220005`, `track-cards.css`→
  `202606220005`. NB: studio board play buttons use `.studio-play` (not `.quick-play-btn`) so they don't
  get the live ⏸ playing-state toggle — minor, acceptable.
- **2026-06-22** — Progress bar **turns gold on hover** (Spotify uses green; we use `#f4a443`) — added
  `.bp-seek:hover` gradient override in `css/player.css` (bumped `?v=`→`202606220002`). Plus a
  **Hjem (dashboard) redesign** — CSS-only, keeps all markup + `renderDashboard()` in `js/db.js`
  untouched (every `.dash-*/.hjem-*` class preserved). New dedicated `css/home.css` (loaded after
  `ui.css`, before `mobile.css`): hero greeting band with amber glow + bigger greeting; gold gradient
  "Ny sang" quick-action; legible section labels with a gold tick; elevated project/beat cards (gradient
  + shadow + hover lift); a premium amber "Fortsett der du slapp" continue-strip with pill buttons;
  taller gradient activity bars; capped `.dash-inner` to 1200px centred; 2-col grids on mobile.
  Follow-up tweak (per feedback): **tightened the corner radii** (cards ~9–12px instead of 14–20px,
  buttons 7–8px instead of pills) to match the app's more squared panels, and **removed the gold tick
  (`.dash-section-label::before`)** that preceded each section title. `home.css?v=202606220002`. **Convention: page-specific visual polish goes in its own `css/<page>.css`
  loaded after ui.css and before mobile.css (see also `player.css`).**
- **2026-06-22** — Redesigned the **bottom player to a Spotify-style bar**. Two-colour scheme
  (black + white); the only accent is the **gold play/pause button** (`#f4a443`, same as primary
  buttons), black glyph. The player's styling was scattered across `main.css` + many `ui.css`
  `!important` blocks (amber rounded frame, spinning vinyl-reel cover `::before/::after`, 3D button
  shadows, amber seek). Rather than untangle those, added a **dedicated `css/player.css`** loaded
  **after `ui.css`** (beats the desktop overrides) and **before `mobile.css`** (phones keep their
  floating mini-player). It makes the bar flat/full-width/pure-black, hides the vinyl reels, makes
  prev/next plain white glyphs, and restyles the seek+volume `<input type=range>` to a thin bar with a
  white "played" fill + hover-only round thumb. The fill is driven by a `--pct` CSS var set in
  `js/db.js` (`bpSetRangeFill`, called from `updateBottomProgress`/`bottomSeek`/`bottomSetVolume` +
  an `input` listener on `#bpSeek`/`#bpVolume`). New convention: **player visuals live in
  `css/player.css`** (must stay after ui.css, before mobile.css). Bumped `db.js` `?v=`→`202606220004`,
  linked `player.css?v=202606220001`. Markup in `index.html` (`#bottomPlayer`/`.bp-*`) unchanged.
- **2026-06-22** — Docs editor: **paste no longer turns text black** + added **highlight (uthev)** like
  Lyric Lab. Paste: pasted HTML carried inline `color`/`bgcolor` (usually black) which was unreadable on
  the dark editor — added an `onDocsPaste` handler that sanitises pasted HTML (`sanitizePastedHtml`:
  strips every attribute except `href` on links, and keeps only a `background` on `<mark>`), falling back
  to plain text. Highlight: 6 colour swatches (gul/grønn/blå/rosa/rød/lilla) + clear (✕) added to the
  `#docsToolbar`; `docsHighlight(color)` wraps the selection in `<mark>` (black text on colour, styled in
  `docs.css`), recolours when the selection is already inside a mark, and clears via `unwrapDocsMarks`.
  Same mark-wrapping pattern as Lyric Lab's `llApplyColorActive`. Selection survives the toolbar click via
  the existing `mousedown`→`preventDefault`. Bumped `docs.css`/`docs.js` `?v=` to `202606220003`.
- **2026-06-22** — Fixed the **Docs page being full-width / not centered** like the other pages. Root
  cause was **structural, not CSS**: `<main class="app">` (the `width:min(1440px,calc(100% - 32px));
  margin:0 auto` container) opens at `index.html` line 240 and **closes at line ~585**, but
  `#docsTab` — along with `#lyriclabTab`, `#labelTab`, `#adminPanelTab` — was placed **after**
  `</main>`, so Docs spanned the full viewport and no amount of inner padding (the earlier
  `.docs-item`/panel tweaks) could center it. Fix: **moved `#docsTab` inside `<main class="app">`**
  (right after `#integrationsTab`) so it inherits the exact same centered max-width + L/R padding as
  Hjem/Beats/Mixtapes/Album. Verified with a 3-way headless-Chrome render (Hjem centered / Docs-before
  full-bleed / Docs-after centered & matching Hjem). NB: `#lyriclabTab`, `#labelTab`, `#adminPanelTab`
  are still outside `<main>` — left as-is (out of scope; don't assume they're centered). **Gotcha for
  future tabs: every page tab-view MUST live inside `<main class="app">` or it renders full-width.**
- **2026-06-22** — Redesigned the **Docs** page to match the rest of the app. It was a visual
  bolt-on: its own greyer palette (`--d-bg:#1c1a17`, custom `--d-*` vars) and rounded 14px corners,
  while the app uses the warm dark tokens (`--bg:#090705`, `--accent:#df7f22`, amber) with **sharp
  panels** (`--radius:0`) and pill buttons. Now `js/docs.js` `shell()` wraps the page in the standard
  `<section class="content-panel glass">` + `.section-title` header ("Docs" + hint) like Pipeline /
  Integrasjoner, and `css/docs.css` was rewritten to consume the app's own CSS vars (no more `--d-*`):
  sharp container/sidebar (`border-radius:var(--radius)`), pill search/buttons/toolbar, amber accent
  for active doc + `--accent2` links, app primary-btn gradient. Sidebar label renamed "Docs"→
  "Dokumenter" to avoid duplicating the new page title. Bumped `docs.css`/`docs.js` `?v=` to
  `202606220002`. Verified the panel left/right padding now equals the other content pages
  (`.content-panel` 18px — confirmed against a Mixtapes-style reference in a throwaway headless-Chrome
  render). Also bumped the doc-list item left padding (`.docs-item` left 12px→18px, list 8px→10px) so
  the document titles align with the search field instead of hugging the sidebar edge.
- **2026-06-22** — Fixed the "**falsk FERDIGSPILT**" playback bug (worked for admin, failed for the
  producer/shared users — e.g. `erik`, editor on 37 shared beats; `Bounceprovida Records`, viewer).
  Two code paths in `js/db.js` masked broken audio as a finished song:
  (1) `playBottomIndex` did `if(!url){…return playBottomIndex(i+1);}` — a beat with no playable URL
  silently **recursed to the next track**, so one bad beat early in an album skipped through the WHOLE
  album to `i>=queue.length` → `showToast("✓ Ferdigspilt")`. That's why "many" songs looked finished
  from just a few broken beats. (2) The `<audio>` `error` handler called `bottomNext(true)` — the
  exact same advance as `ended` — so 404/403/decode errors were treated as track completion. The admin
  never hit either path because his audio plays from a **local IndexedDB blob** (`getPlayableAudioUrl`
  returns the blob first); shared users have no blob and rely solely on `audio_url`.
  **Fix:** `ended` now owns the only path to "Ferdigspilt" (last track genuinely ending). The `error`
  handler is now `onBottomAudioError` — surfaces a REAL Norwegian error (decoded `MediaError.code` via
  `describeMediaError`) and **HEAD-probes** http(s) sources to report the actual HTTP status, then stops
  (never advances). The no-URL branch now calls `reportUnplayableBeat` (distinguishes `:idb` local-only
  vs missing `audio_url`) and stops instead of skipping. `showToast(msg,ms)` gained an optional duration
  (default 2500ms; errors use 6000–7000ms) + `max-width`. Bumped `db.js` `?v=` to `202606220001`.
  **Data diagnosis (Supabase `beats`, all 45 owned by `marcus`):** R2 storage is **healthy** — all 40
  `/file/active%2F…` URLs HEAD-returned **200** (public, no auth → no RLS/signed-URL/permissions issue
  for audio playback at all). The only unplayable beats are **5** with no usable audio: empty `audio_url`
  → `BANKROLL_BABY_ft_pistolstarr`, `cold nights` (×2: `2c8377a7…`, `79dd9568…`), `nothing more 150bpm`;
  and a non-audio **SoundCloud page link** (`on.soundcloud.com/…`, will never play in `<audio>`) →
  `La meg gå nå`. These need their real audio re-uploaded to R2 (likely only ever existed in marcus's
  local IndexedDB) or the dead rows removed. R2 key note: audio_url encodes the slash as `active%2F<id>`
  (not `active/`); 2 archived beats still point at `active%2F` but those files are physically present, so
  they 200 — harmless. NOT modified any DB data (left to the user).
- **2026-06-21** — Fixed the album/mixtape detail header (lost "Del med bruker" + "Pitch", and album
  text stacked under the cover instead of right). Root cause: the premium album header lives in
  `js/app.js` (`redesignAlbumDetail`) which wraps `renderAlbumDetail`, but app.js loads BEFORE db.js,
  so db.js's `function renderAlbumDetail` declaration clobbers the wrapper → only the basic db.js
  header rendered (no Del/Pitch, wrong layout). The song list still worked, so it went unnoticed
  during the earlier drag/glow/play work. Fix: exposed `window.redesignAlbumDetail` and call it at
  the end of db.js `renderAlbumDetail` (same load-order hook pattern as the now-playing glow).
  Also defined `window.isOwnerOrEditor` (was referenced but never defined → Pitch/Bytt bilde always
  hidden; now true for admins). Added "Del med bruker" + "Pitch" buttons to the mixtape header
  (`renderMixtapeDetail`) via the safe `data-share`/`data-pitch` + `mvShare`/`mvPitch` pattern.
  Bumped `app.js`/`db.js` `?v=`.
- **2026-06-21** — Tidied the desktop tab bar. Collapsed **Arkivert, Label, Admin, Integrasjoner**
  into a "⋯ Mer ▾" dropdown (`#mvMoreBtn`/`#mvMoreMenu` in `index.html`; styles in `css/ui.css`;
  toggle logic appended to `js/db.js` after the tab-click handler). The dropdown menu uses
  `position:fixed` (JS-positioned under the trigger) because `.mv-tabs` has `overflow-x:auto` which
  would clip a normal absolute menu. Menu items are still real `.tab-btn[data-tab]` (so the existing
  handler drives them); CSS deliberately does NOT override their `display` so the inline
  `display:none` admin-gating on Label/Admin still works. Moved **Docs** to sit between Beats and
  Mixtapes. Made Docs available to **all** packages incl. producer mode (added `docs` to
  `PRODUCER_TABS` in `js/app.js` + the producer guard in `js/db.js`, and render it in
  `showProducerAllowedTab`). Bumped `ui.css`/`app.js`/`db.js` `?v=`.
- **2026-06-21** — Added a standalone **Docs** tab (Apple Notes-style notes, independent of
  beats/albums/mixtapes). New Supabase table `public.docs` (`id`, `owner_id`, `title`, `content`,
  `format`, `created_at`, `updated_at`) + owner-only RLS + `updated_at` trigger (`tg_docs_updated_at`);
  SQL in `sql/docs.sql`. New `js/docs.js` (`window.renderDocs`): sidebar list sorted by `updated_at`
  desc, rich-text editor (contenteditable + `execCommand` toolbar: bold/italic/H1/H2/¶/bullet/
  numbered), debounced autosave (~800ms, "Lagrer…/Lagret" status, flush on blur + on doc switch),
  create/rename(inline title)/delete, empty + loading + error states. Per-user via REST + JWT
  (RLS). New `css/docs.css` (warm dark + amber, sidebar+editor, mobile stacks). Wired into
  `index.html`: desktop nav button (`data-tab="docs"`), mobile "Mer" sheet button, `#docsTab`
  section, css/js links. Tab activation uses the same self-hook pattern as `admin-panel.js`; `#docs`
  hash deep-links to the tab. (No real `/docs` path route — the app is tab/hash based, not a router.)
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
