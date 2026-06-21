// === changelog.js ===
// Music Vault changelog — add new entries at the TOP of VERSIONS array

(function () {
  'use strict';

  const VERSIONS = [
    {
      version: 'v3.1',
      date: '21. juni 2026',
      label: 'Docs, offentlig deling og avspillingsfikser',
      color: '#34d399',
      changes: [
        'Ny Docs-fane: frittstående skrive-/notatfunksjon (Apple Notes-stil) uavhengig av beats',
        'Docs: sidebar med alle notater sortert etter sist endret + editor til høyre',
        'Docs: opprett, gi nytt navn, slett og rik-tekst (fet, kursiv, overskrifter, punkt- og nummerliste)',
        'Docs: autolagring mens du skriver, med «Lagrer…/Lagret»-status',
        'Docs er privat per bruker og tilgjengelig for alle pakker',
        'Offentlig deling av enkeltsang/beat: «Del»-knapp lager en ekstern lenke alle kan åpne uten innlogging',
        'Delt side viser kun det ene sporet — ingen tilgang til resten av albumet, mixtapen eller admin',
        'Delt side har egen temasatt spiller (play, søk, volum) + nedlastingsknapp',
        'Delingslenker kan deaktiveres/slettes, og admin kan se og styre alle aktive lenker',
        'Avspilling: sangen som spilles nå får en tydelig glød i album/mixtape og beats-listen',
        'Avspilling: dra hele sangraden for å endre rekkefølge (ikke bare coveret)',
        'Avspilling: trykk play på en sang → resten av albumet/mixtapen spilles automatisk videre',
        'Ryddigere fanerad: Arkivert, Label, Admin og Integrasjoner samlet i en «Mer»-meny',
        'Docs flyttet frem mellom Beats og Mixtapes',
      ],
    },
    {
      version: 'v3.0',
      date: '14. juni 2026',
      label: 'Hjem-dashboard og topbar-redesign',
      color: '#f4a443',
      changes: [
        'Ny Hjem-fane som standard startside — alltid første tab i rekken',
        'Topbar redesignet: logo til venstre, tabs i midten, brukerkontroller integrert til høyre',
        'Admin-badge, brukernavn, avatar-sirkel, 🔔 varslingsknapp og ⚙ innstillinger i én sammenhengende header',
        'Varslingsbjelle plassert direkte i header-sloten — ingen race condition',
        'Tannhjul-dropdown redesignet med brukerinfo, pakkevisning og Logg ut/Forlat label',
        'Hjem-dashboard: hilsen med tidspunkt, stat-pills (beats · albumer · mixtapes · uten lyd · snitt ferdig)',
        'Siste prosjekter: 4 kort i 16:9 med fremdriftsbar (grønn/oransje/rød) — smart sortering',
        'Smart prosjektsortering: første kort alltid nyest redigerte album, resten scoret etter aktivitet + uferdighet',
        'Fortsett der du slapp: stor amber-kortlayout med siste spilte sang og direkteknapper',
        'Nylig lastet opp: 4 kompakte kort med thumbnail, varighet, Spill og Lab-knapper',
        'Aktivitetsstripe: søyle-grid for siste 7 dager med streak-teller',
        'Smarte varsler: albumer ikke oppdatert på 14+ dager, sanger ferdig men ikke i album, mangler lyd',
        'Fremdrift: progress bars per album med fargekoding',
        'Kommentarfeed på Hjem: viser pitch-kommentarer og label-kommentarer samlet',
        'Hurtigknapper: Ny sang (utløser filvelger), Nytt album, Ny mixtape, Lyric Lab',
        'Vinyl fjernet fra hero — redesignes i en fremtidig versjon',
        'Eksporter backup og Importer backup-knapper fjernet fra toppen',
        'Status-panelet med tall fjernet — erstattet av stat-pills',
      ],
    },
    {
      version: 'v2.9',
      date: '14. juni 2026',
      label: 'Album- og mixtape-forbedringer',
      color: '#60a5fa',
      changes: [
        'Album-detaljside fullstendig redesignet — samme layout og ramme som mixtape-siden',
        'Album-header: lite coverbilde til venstre, kicker + tittel + antall beats + nå-spilles i midten, knapper til høyre',
        'Vinyl-animasjon på album: en plate stikker ut til venstre av coveret og spinner sakte når albumet spilles av',
        'Vinyl glir smidig inn og ut med cubic-bezier-overgang (5 sek per runde)',
        'Avspillingsknapp, Del med bruker, Bytt bilde (admin) og Pitch (admin) på begge album og mixtape',
        'Sangkort-rad: ▶ play-knapp alltid synlig, ✏️ rename og ✕ fjern vises ved hover',
        'Inline sangnavn-redigering: klikk ✏️ → tekstfelt direkte i raden',
        '"Mangler tekst"-statusdott fjernet — bare "mangler lyd" beholdt',
        'Kommentarfeed nederst på album- og mixtapesider: pitch-kommentarer og label-kommentarer',
        'Slette-knapp (✕) på kommentarer — kun synlig for admin eller eier',
        'Del med bruker-modal: standalone implementasjon i db.js uten avhengighet av app.js',
        'Pitch på mixtape: fallback-dialog med lenke og kopierknapp hvis mixtapeShareMode ikke er klar',
        'mvShare og mvPitch leser data-attributter (data-share, data-pitch) — ingen esc()-problemer i onclick',
        'lock.js: auto-login setter _mvCurrentUserId fra sessionStorage synkront',
        'openShareModal: henter UID fra Supabase-session direkte — fungerer etter page reload',
        'Supabase auto-push: 20-sekunders heartbeat, push ved tab-skjul, beforeunload og online',
      ],
    },
    {
      version: 'v2.8',
      date: '25. mai 2026',
      label: 'Label-dashboard',
      color: '#f4a443',
      changes: [
        'Label-dashboard: sidebar + detaljvisning (Versjon C) for label-pakke-brukere',
        'Label kan invitere artister via brukernavn — artist får 🔔 varsel med Aksepter/Avslå',
        'Ved aksept: alle artistens beats, albumer og mixtapes deles automatisk med labelen',
        'Label ser artistens albumer med status-badge, progress-bar og mixtapes',
        'Artist kan forlate label via ⚙-menyen — label beholder visningstilgang i 14 dager',
        'Label får 👋-varsel når artist forlater',
        'Forlatte artister vises i sidebar med nedtelling: "12d tilgang igjen"',
        'Tannhjul-meny ⚙ i topbar — samler Logg ut og Forlat label på ett sted',
        'Varsel-bjelle flyttet inn i topbar ved siden av tannhjulet',
        'Duplikat Admin-label fjernet fra topbar',
        'Label-tab vises som første tab for label-brukere ved innlogging',
      ],
    },
    {
      version: 'v2.7',
      date: '24. mai 2026',
      label: 'Onboarding og multi-tenant',
      color: '#34d399',
      changes: [
        'Selvbetjent registrering direkte fra lock screen — "Opprett ny konto"',
        '3 pakker å velge mellom: Artist, PRO og Label',
        'Artist: Beats, Mixtapes, Albumer, Lyric Lab',
        'PRO: Alt i Artist + Pipeline, AI og Stats',
        'Label: Alt i PRO + label-dashboard (krever invitasjonskode)',
        'Invitasjonskoder for label-pakken — genereres i Supabase og sendes manuelt',
        'Profil opprettes automatisk i profiles-tabellen ved registrering',
        'Innlogging støtter nå brukernavn for alle brukere via profiles-oppslag',
        'Multi-tenant: owner_id på alle beats/albumer/mixtapes, RLS per bruker',
        'content_access-tabell: del innhold med editor eller viewer rolle',
        'Del med bruker-modal på beats, albumer og mixtapes',
        'Beats deles automatisk når album/mixtape deles',
        'Auto-revoke: beat-tilgang trekkes når beat fjernes fra delt samling',
        'Supabase-triggere: ny beat/album/mixtape → automatisk delt med editor-tilgang',
        'Varsel-bjelle 🔔 med ulest-teller og slett-knapp per varsel',
        'Varsler for ny deling, ny beat/album/mixtape og label-invitasjoner',
        'Viewer-brukere kan ikke redigere tekst, slette, arkivere eller pitch',
        'Del med bruker-knapp skjules for ikke-eiere',
        'lock.js henter e-post fra profiles for brukernavn-innlogging',
        'Bruker-spesifikk localStorage-nøkkel per bruker-ID',
      ],
    },
    {
      version: 'v2.6',
      date: '22. mai 2026',
      label: 'Multi-tenant og deling',
      color: '#34d399',
      changes: [
        'Multi-tenant arkitektur: hver bruker ser kun sitt eget innhold via owner_id og Supabase RLS',
        'Bruker-spesifikk localStorage-nøkkel (musicVault.v4.{userId}) — ingen datalekkasje mellom brukere',
        'Innhold delt via content_access-tabell: editor og viewer roller per objekt',
        'pullFromSupabase henter eget + delt innhold i én operasjon',
        'Marcus og erik har automatisk redaktørtilgang på hverandres innhold',
        'Del med bruker-modal: søk opp brukernavn, velg rolle, send varsel',
        'Varsel-bjelle 🔔 med ulest-teller — varsler ved ny deling',
        'Del-knapp på beats (⋯-meny), album og mixtapes',
        'Tilgang kan trekkes tilbake direkte fra del-modalen',
        'Nye brukere starter med tom profil — arver ikke andres data',
      ],
    },
    {
      version: 'v2.5',
      date: '22. mai 2026',
      label: 'Pakke-system og brukerroller',
      color: '#a855f7',
      changes: [
        'packages.js: definerer hvilke tabs og funksjoner hver pakke har tilgang til',
        'Pakker: admin / artist / producer / lyricist / label / viewer',
        'Artist: Beats, Mixtapes, Albumer, Lyric Lab',
        'Produsent: Beats, Mixtapes, Albumer, Pipeline',
        'Tekstforfatter: Beats, Lyric Lab',
        'Label: Beats, Mixtapes, Albumer, Pipeline',
        'Pakke leses fra profiles.package-kolonne i Supabase ved innlogging',
        'Tab-synlighet oppdateres automatisk basert på pakke',
        'Testbrukere: artist/producer/lyricist/label/viewer (passord: 123)',
        'hasFeature() og hasTab() for feature-flag-sjekk overalt i koden',
        'applyPackage() kjøres ved innlogging og oppdaterer UI umiddelbart',
      ],
    },
    {
      version: 'v2.4',
      date: '21. mai 2026',
      label: 'Mixtape pitch, liker og forbedringer',
      color: '#f4a443',
      changes: [
        'Mixtape pitch-side via Cloudflare Worker — fungerer på alle enheter (ikke bare blob-URL)',
        'Pitch-URL er unik per deling — ny token ved ny deling, gammel token deaktiveres',
        'Del-side: volum-slider starter på 30%, minimalistisk design',
        'Liker-system på mixtape-delingsside: ♡-knapp per sang, teller vises (f.eks. 7♡)',
        'Likes lagres i Supabase mixtape_likes med session-ID for å hindre doble likes',
        'Deaktiver deling: pitch-URL slutter å fungere umiddelbart',
        'Ny URL genereres automatisk neste gang man deler',
        'Album pitch gjenopprettet: vinyl, crossfade, shiny tekst, kommentarer',
        'Pitch-knapp på mixtapes omdøpt fra "Del" til "Pitch"',
        'Sortering i mixtapes: lagt til "Mest tekst" og "Lengst varighet"',
        '"Del med bruker"-knapp på mixtapes og albumer',
        'Worker: GET /share/:id, PUT /share/:id, DELETE /share/:id endepunkter',
        'Worker: GET /list endepunkt for å liste R2-nøkler (brukt til beat-gjenoppretting)',
      ],
    },
    {
      version: 'v2.35',
      date: '21. mai 2026',
      label: 'Listevisning og beat-gjenoppretting',
      color: '#60a5fa',
      changes: [
        'Listevisning i album og mixtapes fullstendig omskrevet fra bunnen — ny HTML med egne klasser (abi-list-row)',
        'track-cards.js sin enhanceCards() hopper over abi-list-row — ingen CSS-konflikter lenger',
        'Listevisning: 66px rader med kvadratisk cover, nummer, tittel, uploader, varighet, ▶-knapp, ★-knapp',
        'Kortvisning: TAKE/DEMO-badge skjult på kollapsede kort — tittelen er nå synlig',
        'Beat-gjenoppretting: 18 beats som bare lå i R2 gjenopprettet til Supabase og localStorage',
        'supabase.js: automatisk retry (2x) ved push-feil med 3s mellomrom',
        'schedulePush: maxWait 8s sikrer at push alltid skjer under kontinuerlig skriving',
        'uploadBeatToR2 awaiter nå push til Supabase — ikke fire-and-forget',
        'beforeunload-advarsel ved usynkroniserte endringer + emergency push',
        'Batch-upsert i grupper av 20 for å unngå payload-størrelsesgrenser',
      ],
    },
    {
      version: 'v2.3',
      date: '16. mai 2026',
      label: 'Album & Pipeline',
      color: '#60a5fa',
      changes: [
        'Album-kortene viser nå status-badge med fargekoding (Idé/Skriving/Innspilling/Mixing/Ferdig) og total spilletid',
        'Tracklist-nummer (01. 02. 03.) vises foran hvert sangnavn i albumvisningen',
        'Mangler-indikator: rød prikk = ingen lydfil, oransje prikk = ingen tekst — vises i utvidet kortvisning',
        'A/B-side-knapp deler tracklisten i to sider som på en vinyl',
        'Vinyl-animator: snurrer langsomt alltid, raskere ved avspilling',
        'Pitch-modus: generer en artist one-pager med cover, trackliste og A/B-side klar til deling',
        'Total albumvarighet vises i albumdetalj-headeren',
        'Beat-varighet lagres automatisk på beatet når bottom player laster audio metadata',
        'Pipeline v2: Kanban-visning med tre kolonner (Ikke startet / I arbeid / Ferdig)',
        'Pipeline: drag sanger mellom kolonner for å oppdatere ferdigstillelse',
        'Pipeline: neste steg per sang (Last opp lydfil / Skriv tekst / Ferdigstill seksjoner)',
        'Pipeline: drag-rekkefølge for prioritering innad i kolonner',
        'Pipeline: ✍️ Lyric Lab-knapp direkte fra sangkortet',
        'Pipeline: hurtig-slider for ferdigstillelse uten å åpne sangen',
        'Pipeline: ukentlig fremgang-pill og streak-teller',
        'Pipeline: albumnotater med 📝-knapp',
        'Pipeline: album-status dropdown (Idé/Skriving/Innspilling/Mixing/Masterering/Ferdig)',
      ],
    },
    {
      version: 'v2.2',
      date: '15. mai 2026',
      label: 'Lyric Lab',
      color: '#f4a443',
      changes: [
        'Ny Lyric Lab-fane — fullskjerm teksteditor med tre kolonner: beat-info, seksjonseditor og skriveanalyse',
        'Seksjonseditor med Hook, Vers 1, Bro, Vers 2, Outro — linjenummer, collapse/expand, ⋯-meny per seksjon',
        'Eksisterende lyrics migreres automatisk til seksjoner — gammel data beholdes trygt',
        'Autosave 600ms etter tastetrykk via saveState() — synker til Supabase',
        'Statistikk-panel: ord, linjer, seksjoner, estimert lengde (120 ord/min)',
        'Rimbank med Claude AI — skriv et ord eller marker i teksten for rim-forslag (perfekte og nesten-rim)',
        'Innspilling over beat — 3s nedtelling, mikrofon + beat mikses via Web Audio API, lagres som take',
        'Hurtigmemo — ta opp korte vokal-ideer, lagres på beat med avspiller og slett-knapp',
        'Åpne i Lyric Lab-knapp i beat-kort under albumer og mixtapes',
        'Seksjonseditor erstattet gammel rich-text editor under albumer og mixtapes',
        'Favorittstjerne flyttet til avspillingskontrollene i listevisning',
        'Dropdown-meny på seksjoner fungerer nå riktig (var klippet av overflow:hidden)',
        'Linjenummer vises nå vertikalt (white-space:pre-fix)',
        'Rimbank rutes gjennom Cloudflare Worker med ANTHROPIC_API_KEY secret',
      ],
    },
    {
      version: 'v2.1',
      date: '14. mai 2026',
      label: 'PNG-kassetter, arkiv-fix og view modes',
      color: '#f4a443',
      changes: [
        'Kassettdesign byttet fra CSS til realistiske PNG-bilder — 4 varianter (velges deterministisk per mixtape)',
        '"Ny mixtape"-kortet bruker kassett-PNG med + NY MIXTAPE-tekst på labelen',
        'Mixtape-detaljsiden viser kassetbildet i headeren i stedet for liten preview',
        'Tekst-overlay på kassett-label: navn og beat-antall med tynt font på papirfeltet',
        'Arkivert-tabben fungerer nå korrekt — var usynlig pga. manglende tab-visible opacity',
        'Tab-bytte: tab-visible fjernes nå fra gammel tab slik at fade-overgang fungerer på alle tabs',
        'Visningsmodus (list/kort/studio) fungerer endelig — rotårsakene var 4 konkurrerende setTrackViewMode-definisjoner og hardkodet album-beat-grid i renderAlbumBeats',
        'track-cards.js fullstendig omskrevet (774 → 387 linjer) — én IIFE, én click-lytter, ingen konflikter',
        'Spotify-stil listevisning: 44px kompakte rader med thumbnail, tittel, varighet',
        'beatsFromIds() filtrerer nå arkiverte beats — beat-telling er korrekt overalt',
        'toggleAlbumBeat bruker kontekst-bevisst oppslag — samme sang i mixtape og album åpner riktig kort',
        'Vedlikeholdsnotater oppdatert i alle JS-filer og index.html',
      ],
    },
    {
      version: 'v2.0',
      date: '13. mai 2026',
      label: 'Tab-rekkefølge, visningsmoduser og viewer-forbedringer',
      color: '#f4a443',
      changes: [
        'Tab-rekkefølge endret til: Beats → Mixtapes → Albumer → Pipeline → Integrasjoner',
        'Mixtapes er nå standard startside',
        'Visningsmodus (viewer): gir nå tilgang til både Beats og Mixtapes — kun lytting',
        'Innloggingsikon (🔐 Admin) vises øverst til høyre i visningsmodus for rask admin-innlogging',
        '"ADMIN"-boblen skjules i visningsmodus',
        'Alle tre visningsmoduser synlige i toggle: ☰ Rader · ▦ Kort · ▤ Studio',
        'Tab-flimring fikset med dirty-flagg system — kun aktiv tab re-rendres',
        'Myk fade-overgang (150ms) ved tab-bytte',
      ],
    },
    {
      version: 'v1.9',
      date: '13. mai 2026',
      label: 'Lydkomprimering',
      color: '#34d399',
      changes: [
        'WAV, FLAC og andre ukomprimerte lydfiler komprimeres automatisk til WebM/Opus (128kbps) før opplasting til R2',
        'Typisk besparelse: WAV ~50MB → ~5MB (−90%), FLAC ~25MB → ~5MB (−80%)',
        'MP3-filer og filer under 8MB hoppes over — allerede komprimert',
        'Toast-meldinger viser fremgang og resultat under konvertering',
      ],
    },
    {
      version: 'v1.8',
      date: '13. mai 2026',
      label: 'Beats-tab + listvisning',
      color: '#a855f7',
      changes: [
        'Ny "Beats"-tab som første tab — total oversikt over alle sanger med søk og sortering',
        'Beats-tabellen viser: navn, samlinger (mixtape/album), hvem som lastet opp, dato og varighet',
        'Klikk ⋯ på en beat for nedtrekksmeny med: Spill, Favoritt, Arkiver, Slett permanent',
        'Standardvisning i mixtapes og albumer endret til radvisning (Spotify-stil)',
        'Toggle mellom ▦ Kortvisning og ☰ Listevisning',
        'Albumer er nå første tab man ser ved innlasting',
        'Integrasjonssiden oppdatert og ryddet — Google Drive-seksjoner fjernet',
      ],
    },
    {
      version: 'v1.7',
      date: '13. mai 2026',
      label: 'Sletting + opplasternavn',
      color: '#fb7185',
      changes: [
        '"Slett sang"-knapp lagt til i alle visninger — kun synlig for admin',
        'Sletting fjerner sangen fra R2, Supabase og lokal state i én operasjon',
        'Brukernavnet til den som laster opp en sang vises på beat-kortet med 👤-ikon',
        'Brukernavnet lagres automatisk fra innloggingssession',
      ],
    },
    {
      version: 'v1.6',
      date: '13. mai 2026',
      label: 'Nytt innloggingssystem',
      color: '#f97316',
      changes: [
        'Passordlåsskjermen erstattet med brukernavn/passord-innlogging via Supabase',
        'To moduser på innloggingsskjermen: Admin og Visningsmodus',
        'Visningsmodus: kun mixtapes synlig, ingen tekster, ingen opplasting eller redigering',
        'Admin-tilgang kobler til Supabase-profil med role = "admin"',
        'Brukernavn mappes til Supabase-epost i koden — passordet er aldri synlig i repo',
        'Kun admin kan laste opp lydfiler',
        'Støtte for flere admin-brukere (f.eks. marcus og erik)',
      ],
    },
    {
      version: 'v1.5',
      date: '13. mai 2026',
      label: 'Cloudflare R2 + Supabase-synk',
      color: '#22d3ee',
      changes: [
        'Cloudflare R2 integrert for lagring av lydfiler (10GB gratis, ingen egress-kostnad)',
        'Lydfiler organiseres i active/ og archived/ mapper i R2',
        'Arkivering av sang flytter lydfilen mellom mapper i R2 automatisk',
        'Supabase-database synker metadata (beats, albumer, mixtapes) på tvers av enheter',
        'saveState() pusher automatisk til Supabase ved alle endringer',
        'R2-lagringswidget i Integrasjoner viser brukt plass med progress-bar',
        'Cloudflare Worker fungerer som sikker proxy mellom appen og R2',
      ],
    },
    {
      version: 'v1.4',
      date: '13. mai 2026',
      label: 'Prosjektstruktur splitt',
      color: '#818cf8',
      changes: [
        'Én stor HTML-fil (2MB) splittet til organisert prosjektstruktur',
        'css/: main.css, ui.css, track-cards.css, archive.css, mixtape.css',
        'js/: lock.js, db.js, app.js, track-cards.js, archive.js, mixtape.js, supabase.js',
        'assets/: favicon.png, crate-back.png, crate-front.png, crate-empty.png, vinyl-label.png',
        'Base64-bilder (~1.5MB) ekstrahert til egne PNG-filer',
        'Cache-busting versjonsnummer på alle CSS- og JS-lenker',
        'README.md med dokumentasjon og oppsettguide lagt til',
      ],
    },
    {
      version: 'v1.3',
      date: '13. mai 2026',
      label: 'Stor kode-opprydding (runde 2)',
      color: '#f4a443',
      changes: [
        '3 konkurrerende mixtape-søk-scripts (hotfix, single, visibility) slettet — erstattet av performance-versjon',
        'Duplikat @keyframes vinylSpin fjernet',
        'Ubrukte window-exports (advancedTrackFilter, advancedTrackSearch, advancedOpenCurrentTrack) renset',
        '10 CSS-blokker fusjonert til færre og mer logiske filer',
        '25 funksjoner i dead-code-blokk slettet (final-archive-experience-js)',
        'Totalt: 70 navngitte blokker redusert til 39 — over halvparten borte',
      ],
    },
    {
      version: 'v1.0',
      date: '13. mai 2026',
      label: 'Første versjon (denne chatten)',
      color: '#94a3b8',
      changes: [
        'Music Vault lansert som én portabel HTML-fil',
        'Mixtapes med kassett-grensesnitt, albumer med vinyl-animasjoner, pipeline og arkiv',
        'Supabase admin-innlogging og synk-funksjonalitet',
        'Arkiv-tab med trekasse-animasjoner og samlinger',
        'Bottom player med kø, seek og volum',
        'Lyrics-editor med fargemarkering',
        'Rating og ferdigstillelsesprosent per beat',
      ],
    },
  ];

  function renderChangelog() {
    const el = document.getElementById('changelogPanel');
    if (!el) return;
    const latest = VERSIONS[0];
    el.innerHTML = `
      <div class="cl-header">
        <div>
          <h2 style="margin:0 0 4px">📋 Changelog</h2>
          <p class="hint" style="margin:0">Siste: <strong style="color:${latest.color}">${latest.version} — ${latest.label}</strong> · ${latest.date}</p>
        </div>
        <button class="ghost-btn cl-toggle" onclick="changelogToggle()" id="clToggleBtn">
          Vis alle versjoner ▾
        </button>
      </div>
      <div id="clBody" style="display:none;margin-top:16px">
        ${VERSIONS.map((v, i) => `
          <div class="cl-version ${i === 0 ? 'cl-latest' : ''}">
            <div class="cl-version-header">
              <span class="cl-badge" style="background:${v.color}22;color:${v.color};border-color:${v.color}44">${v.version}</span>
              <strong class="cl-label">${v.label}</strong>
              <span class="cl-date">${v.date}</span>
            </div>
            <ul class="cl-list">
              ${v.changes.map(c => `<li>${c}</li>`).join('')}
            </ul>
          </div>
        `).join('')}
      </div>
    `;
  }

  window.changelogToggle = function () {
    const body = document.getElementById('clBody');
    const btn = document.getElementById('clToggleBtn');
    if (!body || !btn) return;
    const open = body.style.display === 'none';
    body.style.display = open ? 'block' : 'none';
    btn.textContent = open ? 'Skjul ▴' : 'Vis alle versjoner ▾';
  };

  function install() {
    const panel = document.querySelector('#integrationsTab .content-panel');
    if (!panel || document.getElementById('changelogPanel')) return;
    const card = document.createElement('div');
    card.className = 'settings-card';
    card.id = 'changelogPanel';
    panel.appendChild(card);
    renderChangelog();
    if (document.getElementById('cl-style')) return;
    const style = document.createElement('style');
    style.id = 'cl-style';
    style.textContent = `
      .cl-header { display:flex; justify-content:space-between; align-items:flex-start; gap:12px; flex-wrap:wrap; }
      .cl-toggle { font-size:12px !important; padding:6px 12px !important; white-space:nowrap; }
      .cl-version { padding: 14px 0; border-bottom: 1px solid rgba(255,255,255,.06); }
      .cl-version:last-child { border-bottom: none; padding-bottom: 0; }
      .cl-latest { padding-top: 0; }
      .cl-version-header { display:flex; align-items:center; gap:10px; margin-bottom:8px; flex-wrap:wrap; }
      .cl-badge { font-size:11px; font-weight:900; letter-spacing:.06em; padding:3px 10px; border-radius:999px; border:1px solid; flex-shrink:0; }
      .cl-label { font-size:14px; font-weight:800; }
      .cl-date { font-size:11px; color:var(--muted); margin-left:auto; white-space:nowrap; }
      .cl-list { margin:0; padding-left:18px; display:flex; flex-direction:column; gap:4px; }
      .cl-list li { font-size:12px; color:var(--muted); line-height:1.55; list-style:disc; }
    `;
    document.head.appendChild(style);
  }

  document.addEventListener('click', e => {
    if (e.target.closest('.tab-btn[data-tab="integrations"]')) setTimeout(install, 80);
  });

  if (document.readyState !== 'loading') setTimeout(install, 800);
  else document.addEventListener('DOMContentLoaded', () => setTimeout(install, 800));
})();
