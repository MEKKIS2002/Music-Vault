# Music Vault

Personlig hiphop-studioapp for én artist. Samler beats, tekster, innspillinger og prosjektflyt på én skjerm — kjører direkte i nettleseren uten server eller installasjon.

**Live:** [mekkis2002.github.io/Music-Vault](https://mekkis2002.github.io/Music-Vault/)

---

## Prosjektstruktur

```
music-vault/
├── index.html              # Ren HTML-markup. Ingen inline CSS/JS.
├── css/
│   ├── main.css            # Basisstiler, CSS-variabler, layout, tab-transitions
│   ├── ui.css              # Hero-seksjon, stats-kort, knapper, vinyl-posisjonering
│   ├── track-cards.css     # Beat-kort (grid/liste/studio-visning)
│   ├── archive.css         # Arkiv-tab, trekasse-animasjoner
│   ├── mixtape.css         # PNG-kassett-kort, mixtape-grid, søk
│   └── lyriclab.css        # Lyric Lab — tre-kolonne layout, seksjonseditor, rimbank
├── js/
│   ├── lock.js             # Innloggingsskjerm (brukernavn → Supabase auth)
│   ├── db.js               # State (localStorage), renderAll/renderActiveTab, tab-handler
│   ├── app.js              # Albumdetalj-render, produsentmodus
│   ├── track-cards.js      # View mode (liste/kort/studio), beat-kort-enhancer
│   ├── archive.js          # Arkiv-renderer — oppretter #archiveTab dynamisk
│   ├── mixtape.js          # Mixtape-søk
│   ├── beats-tab.js        # Beats-oversiktsfane med søk, sortering og ⋯-meny
│   ├── lyriclab.js         # Lyric Lab — seksjonseditor, rimbank, innspilling
│   ├── r2-storage.js       # Cloudflare R2 opplasting/sletting/flytte
│   ├── audio-compress.js   # Lydkomprimering (deaktivert — MediaRecorder er sanntid)
│   ├── supabase.js         # Supabase admin-login + datasynk (push/pull)
│   └── changelog.js        # Endringslogg injisert i Integrasjoner-tabben
├── assets/
│   ├── favicon.png
│   ├── crate-back.png / crate-front.png / crate-empty.png
│   ├── vinyl-label.png
│   ├── Cassette 1.png – Cassette 4.png   # Realistiske kassett-PNG-er
│   └── cassette.png                       # Fallback-kassett
└── worker/
    └── worker.js           # Cloudflare Worker kildekode (R2 + rimbank-proxy)
```

---

## Faner og funksjoner

| Fane | Beskrivelse |
|------|-------------|
| 🎵 **Beats** | Oversikt over alle sanger med søk, sortering og ⋯-meny |
| 📼 **Mixtapes** | Realistiske PNG-kassetter. Kassettvariant velges deterministisk per mixtape-ID. |
| 📁 **Albumer** | Offisielle utgivelser med vinyl-animasjon. Tre visningsmoduser: rader, kort, studio. |
| 📊 **Pipeline** | Kanban-oversikt over aktive album med ferdigstillelsesprosent. |
| 🗄️ **Arkivert** | Fysisk trekasse-grensesnitt for arkiverte demoer, mixtapes og album. |
| ✍️ **Lyric Lab** | Fullskjerm teksteditor (se under). |
| 🔌 **Integrasjoner** | Supabase-tilkobling, import/eksport, backup, endringslogg. |

---

## Lyric Lab

Tre-kolonne studioskjerm for tekstskriving:

**Venstre — Beat-info**
- Coverbilde, tittel, produsent, BPM, toneart, mood
- Status-dropdown: utkast / skriver / demo / revisjon / ferdig
- Spill beat, spill inn over beat (3s nedtelling + Web Audio API-miks), hurtigmemo

**Midten — Seksjonseditor**
- Seksjoner: Hook, Vers 1, Bro, Vers 2, Outro + egendefinerte
- Linjenummer, collapse/expand, ⋯-meny (dupliser, flytt, slett)
- Autosave 600ms etter tastetrykk → `saveState()` → Supabase
- Eksisterende `beat.lyrics` migreres til `beat.lyricSections[0]` (original beholdes)
- Samme seksjonseditor vises inline i album- og mixtape-beat-kort

**Høyre — Analyse og rimbank**
- Statistikk: ord, linjer, seksjoner, estimert låtlengde
- Manglende seksjoner, gjentagende ord
- Rimbank: skriv et ord eller marker i teksten → Claude Haiku (via Cloudflare Worker) returnerer norske rimforslag

**Innspilling over beat**
- Beat hentes som blob via `fetch()` (løser CORS-problem med captureStream)
- Mikrofon + beat mikses med Web Audio API → `MediaRecorder` tar opp
- Takes lagres på `beat.takes[]` i localStorage

---

## Datamodell

State lagres i `localStorage` under nøkkelen `musicVault.v4`:

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

**Viktige regler:**
- `beatsFromIds()` filtrerer alltid arkiverte beats
- `saveState()` → `markDirty()` → `schedulePush()` → Supabase (900ms debounce)
- Arkiv-tabben finnes **ikke** i HTML — opprettes dynamisk av `archive.js`
- Tab-synlighet krever begge: `.hidden` (display:none) + `.tab-visible` (opacity:1)

---

## Teknisk stack

| Lag | Teknologi |
|-----|-----------|
| Frontend | Ren HTML/CSS/JS — ingen build-steg, ingen npm |
| Hosting | GitHub Pages |
| Lyd-lagring | Cloudflare R2 (`music-vault-audio`) via Worker-proxy |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth (brukernavn → epost → JWT) |
| AI | Anthropic Claude Haiku (via Cloudflare Worker) — rimbank |

---

## Cloudflare Worker

Worker-fil: `worker/worker.js`

| Metode | Path | Beskrivelse |
|--------|------|-------------|
| `PUT` | `/upload/:key` | Last opp lydfil til R2 |
| `GET` | `/file/:key` | Stream lydfil (Range-støtte for seek) |
| `DELETE` | `/delete/:key` | Slett lydfil |
| `POST` | `/move` | Flytt fil (arkiver/gjenopprett) |
| `GET` | `/stats` | Lagringsstatus |
| `POST` | `/rhyme` | Rimbank-proxy → Anthropic API |

**Secrets (Cloudflare dashboard):**
- `ANTHROPIC_API_KEY`
- `ALLOWED_ORIGIN` → `https://mekkis2002.github.io`

Bucket-binding: `BUCKET` → `music-vault-audio`

---

## Brukere

| Brukernavn | Rolle |
|------------|-------|
| marcus | admin |
| erik | admin |

Viewer-modus: kun Mixtapes og Beats vises.

---

## Kjøre lokalt

```bash
npx serve .
# eller
python3 -m http.server 8080
```

> ⚠️ Web Audio API krever HTTP (ikke `file://`).

## Deploy

Push til `main` → GitHub Pages deployer automatisk.

---

*Versjon: v2.2 — Mai 2026*
