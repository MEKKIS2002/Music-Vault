// === pipeline.js ===
// Pipeline v3 — "Release Studio"
// A project-centric workspace that answers: where is this project, what's most
// done, what should I do today, and how close am I to release.
//
// Layout (top → bottom):
//   1. Project selector   — choose album/mixtape to focus on
//   2. Project hero       — cover, title, total progress, release-readiness
//   3. Dagens fokus       — 3 concrete, clickable tasks
//   4. Tabbed workspace   — Oversikt | Board (kravet for release står øverst)
//
// db.js calls (window.renderPipelineV2 || renderPipeline) for the pipeline tab,
// so defining window.renderPipelineV2 is all that's needed to take over.

(function () {
  'use strict';

  // ── Flow stages (fine-grained, used by Oversikt/Timeline/Status) ────────────
  const FLOW = [
    { key: 'idea',    label: 'Idé',          color: 'var(--stage-idea)' },
    { key: 'writing', label: 'Skriving',     color: 'var(--stage-writing)' },
    { key: 'record',  label: 'Innspilling',  color: 'var(--muted)' },
    { key: 'mix',     label: 'Miks',         color: 'var(--accent-ink)' },
    { key: 'master',  label: 'Master',       color: 'var(--stage-master)' },
    { key: 'done',    label: 'Ferdig',       color: 'var(--ok)' },
  ];

  // Samme ord som låtstegene (js/stages.js); eldre «Mixing»/«Mastering» leses som «Miks»/«Master»
  const ALBUM_STATUS = window.mvStages ? window.mvStages.album : ['Idé', 'Skriving', 'Innspilling', 'Miks', 'Master', 'Klar for release'];

  // ── Helpers ─────────────────────────────────────────────────────────────────
  function st()     { return typeof state !== 'undefined' ? state : window.state; }
  function save()   { if (typeof saveState === 'function') saveState(); }
  function esc(s)   { return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function clamp(n) { return Math.max(0, Math.min(100, Number(n) || 0)); }
  // Felles statusfarger: ikke startet = nøytral, i arbeid = oransje, ferdig = grønn.
  // Rødt er forbeholdt feil og destruktive handlinger (ikke «lav prosent»).
  function pctColor(p){ return p >= 100 ? 'var(--ok)' : p > 0 ? 'var(--accent-ink)' : 'var(--muted)'; }

  function hasAudio(b)  { return !!(b.audio_url || b.url); }
  function hasLyrics(b) { return (b.lyricSections||[]).some(s => s && s.text && s.text.trim()) || !!(b.lyrics||'').trim(); }
  function sectionsDone(b){
    const secs = b.lyricSections || [];
    return secs.length > 0 && secs.every(s => s && s.done);
  }

  // Projects = active albums + active mixtapes, unified
  function getProjects() {
    const albums   = (st().albums   || []).filter(a => !a.archived).map(o => ({ obj:o, type:'album',   ref:'album:'+o.id }));
    const mixtapes = (st().mixtapes || []).filter(m => !m.archived).map(o => ({ obj:o, type:'mixtape', ref:'mixtape:'+o.id }));
    return albums.concat(mixtapes);
  }
  function projectBeats(p) {
    return (p.obj.beatIds || [])
      .map(id => (st().beats || []).find(b => b.id === id))
      .filter(b => b && !b.archived);
  }

  // Fine-grained flow stage for a beat
  // Felles stegmodell (js/stages.js) — samme grenser som Lyric Lab og Studio
  function flowIndex(b) {
    if (window.mvStages) return window.mvStages.index(b);
    const pct = clamp(b.done || 0);
    return pct >= 100 ? 5 : pct >= 75 ? 4 : pct >= 50 ? 3 : pct >= 25 ? 2 : pct > 0 ? 1 : 0;
  }
  // Coarse board bucket
  // Grov inndeling for nøkkeltallene «ferdig · i arbeid · ikke startet» (samme steg som boardet)
  function boardBucket(b) {
    const i = flowIndex(b);
    return i >= 5 ? 'done' : i >= 1 ? 'inprogress' : 'todo';
  }

  // Neste steg for en låt. STEGET bestemmer rådet (en låt i Master får aldri «Skriv tekst»);
  // det som mangler fra tidligere steg vises som en grunn under rådet (why).
  function lyricsPct(b){
    const secs = (b.lyricSections || []).filter(Boolean);
    if (!secs.length) return hasLyrics(b) ? 100 : 0;
    return Math.round(secs.filter(s => s.done || (s.text && s.text.trim())).length / secs.length * 100);
  }
  // Tekst som «2/5 seksjoner» — prosent er forbeholdt låtens fremdrift
  function secTxt(b){
    const secs = (b.lyricSections || []).filter(Boolean);
    if (!secs.length) return hasLyrics(b) ? 'skrevet' : '0 seksjoner';
    return `${secs.filter(s => s.done || (s.text && s.text.trim())).length}/${secs.length} seksjoner`;
  }
  function nextStep(b) {
    const i = flowIndex(b);
    if (i >= 5) return null;                                            // Ferdig — ingen oppgave
    const audio = hasAudio(b), lyr = hasLyrics(b), lp = lyricsPct(b);
    const gaps = [];
    if (!audio) gaps.push('mangler lydfil');
    if (i >= 2 && (!lyr || lp < 100)) gaps.push(lyr ? `tekst ${secTxt(b)}` : 'mangler tekst');
    const why = gaps.join(' · ');
    if (i === 0) return audio ? { txt: 'Start på teksten', kind: 'lyrics', why: '' } : { txt: 'Last opp lydfil', kind: 'audio', why: '' };
    if (i === 1){
      if (!lyr) return { txt: 'Skriv tekst', kind: 'lyrics', why };
      if (lp < 100 || ((b.lyricSections || []).length && !sectionsDone(b))) return { txt: 'Ferdigstill seksjoner', kind: 'lyrics', why: (lp >= 100 ? 'seksjoner ikke markert ferdig' : `tekst ${secTxt(b)}`) + (audio ? '' : ' · mangler lydfil') };
      return { txt: 'Spill inn / skisse', kind: 'record', why };
    }
    if (i === 2) return { txt: 'Spill inn vokal', kind: 'record', why };
    if (i === 3) return { txt: 'Miks ferdig',     kind: 'mix',    why };
    return { txt: 'Master låten',               kind: 'master', why };   // en studiooppgave, ikke «sett prosent»
  }

  window.mvNextStep = nextStep;

  // ── Per-project metrics ──────────────────────────────────────────────────────
  function metrics(beats) {
    const n = beats.length;
    const avg = n ? Math.round(beats.reduce((s,b)=>s+clamp(b.done||0),0)/n) : 0;
    const done = beats.filter(b => clamp(b.done||0) >= 100).length;
    const wip  = beats.filter(b => boardBucket(b) === 'inprogress').length;
    const todo = n - done - wip;
    return { n, avg, done, wip, todo };
  }

  // Release-readiness gates → drives Sjekkliste + hero "Release-klar"
  // Klar for release (eierens definisjon): alle låter i prosjektet er 100 % ferdige — samme tall som
  // telleverket viser. Kravet lister låtene som mangler (nærmest ferdig først), så det kan følges opp.
  function gates(project, beats) {
    const some = beats.length > 0;
    const notDone = beats.filter(b => clamp(b.done || 0) < 100).sort((a, b) => clamp(b.done || 0) - clamp(a.done || 0));
    return [
      { label: 'Alle låter er 100 % ferdige', ok: some && !notDone.length, missing: notDone, kind: 'progress', hint: some ? '' : 'Legg til låter i prosjektet' },
    ];
  }
  // Én rad i kravlisten: krav + låtene som mangler (åpnes for å se dem; de 5 første vises, resten bak «+N til»)
  function gateRow(g) {
    const fmt = window.mvStages ? mvStages.fmt : (n => n + ' %');
    if (g.ok || !g.missing.length) return `<li class="${g.ok ? 'ok' : ''}"><span class="pl3-cue-mark" aria-hidden="true"></span><span>${esc(g.label)}${g.hint ? ` <small>${esc(g.hint)}</small>` : ''}</span><span class="sr-only">${g.ok ? 'gjort' : 'ikke gjort'}</span></li>`;
    const row = (b, i) => `<li${i >= 5 ? ' class="pl3-cue-extra"' : ''}><button type="button" onclick="plFocusGoto('${esc(b.id)}','progress')">${esc(b.name || 'Uten navn')}</button><span>${fmt(clamp(b.done || 0))}</span></li>`;
    const extra = g.missing.length - 5;
    return `<li><details class="pl3-cue-more"><summary><span class="pl3-cue-mark" aria-hidden="true"></span><span>${esc(g.label)} <em>${g.missing.length} mangler</em></span><span class="sr-only">ikke gjort</span></summary>
      <ul>${g.missing.map(row).join('')}${extra > 0 ? `<li class="pl3-cue-moreli"><button type="button" onclick="this.closest('ul').classList.add('all');this.parentNode.remove()">+${extra} til</button></li>` : ''}</ul></details></li>`;
  }
  function readiness(project, beats) {
    const g = gates(project, beats);
    const passed = g.filter(x => x.ok).length;
    return { passed, total: g.length, pct: Math.round(passed / g.length * 100), gates: g };
  }

  // Today's focus: up to 3 concrete tasks, prioritised by momentum then gaps
  function todaysFocus(beats) {
    const cand = beats
      .map(b => ({ b, step: nextStep(b), pct: clamp(b.done||0) }))
      .filter(x => x.step);
    // Priority: closest-to-done first (finish momentum), then by gap severity
    const kindRank = { master: 0, mix: 1, record: 2, lyrics: 3, audio: 4 };
    cand.sort((a, c) => {
      const ka = kindRank[a.step.kind], kc = kindRank[c.step.kind];
      if (ka !== kc) return ka - kc;
      return c.pct - a.pct; // higher % first within same kind
    });
    // Like oppgaver slås sammen til én linje («Master låten — start med X, +5 til»),
    // så de tre plassene viser ulike typer arbeid i stedet for samme oppgave tre ganger
    const groups = [];
    for (const c of cand){
      const g = groups.find(x => x.step.txt === c.step.txt);
      if (g) g.more++; else groups.push({ ...c, more: 0 });
    }
    return groups.slice(0, 3);
  }

  // ── Streak (kept, lightweight) ──────────────────────────────────────────────
  function updateStreak() {
    const key = 'mv_pipeline_streak';
    const today = new Date().toDateString();
    const stored = JSON.parse(localStorage.getItem(key) || '{"last":"","count":0}');
    const yesterday = new Date(Date.now()-86400000).toDateString();
    if (stored.last === today) return stored.count;
    if (stored.last === yesterday) stored.count++;
    else stored.count = 1;
    stored.last = today;
    localStorage.setItem(key, JSON.stringify(stored));
    return stored.count;
  }

  // ── UI persistence ──────────────────────────────────────────────────────────
  function getSelectedRef(projects) {
    const saved = localStorage.getItem('mv_pl_project');
    if (saved && projects.some(p => p.ref === saved)) return saved;
    return projects.length ? projects[0].ref : null;
  }
  function getSubtab() {
    const t = localStorage.getItem('mv_pl_subtab') || 'oversikt';
    return (t === 'checklist' || t === 'timeline') ? 'oversikt' : t;   // Sjekkliste og Timeline er fjernet
  }

  // ── Drag state ──────────────────────────────────────────────────────────────
  let _dragBeatId = null;

  // ── Main render ─────────────────────────────────────────────────────────────
  function render() {
    const board = document.getElementById('pipelineBoard');
    if (!board) return;

    const projects = getProjects();
    if (!projects.length) {
      board.innerHTML = `
        <div class="pl3-empty">
          <div class="pl3-empty-icn"><span class="ic ic-chart" aria-hidden="true"></span></div>
          <div class="pl3-empty-title">Ingen prosjekter ennå</div>
          <div class="pl3-empty-sub">Opprett et album eller en mixtape og legg til låter for å bygge en release-pipeline.</div>
        </div>`;
      return;
    }

    const ref = getSelectedRef(projects);
    const project = projects.find(p => p.ref === ref) || projects[0];
    const beats = projectBeats(project);
    const m = metrics(beats);
    const r = readiness(project, beats);
    const subtab = getSubtab();
    const streak = updateStreak();

    board.innerHTML = `
      <div class="pl3">
        ${renderProjectSelector(projects, project.ref)}
        ${renderHero(project, beats, m, r, streak)}
        ${renderFocus(beats)}
        ${renderTabsNav(subtab)}
        <div class="pl3-tabwrap">
          ${subtab === 'oversikt'  ? renderOversikt(project, beats)      : ''}
          ${subtab === 'board'     ? renderBoard(project, beats)         : ''}
        </div>
      </div>`;

    wireBoardDrag(board, project);

    // Kom du fra «Board ›» i et album/mixtape? Vis veien tilbake, og start ved boardet (Pipeline er ellers en rapport)
    const from = window.__plFrom;
    if (from && from.ref === project.ref && subtab === 'board'){
      const wrap = board.querySelector('.pl3-tabwrap');
      if (wrap && !wrap.querySelector('.pl3-back')){
        wrap.insertAdjacentHTML('afterbegin', `<button type="button" class="pl3-back" onclick="plBackToCollection()">← Tilbake til ${from.type === 'mixtape' ? 'mixtapen' : 'albumet'}</button>`);
      }
      if (from.scroll){ from.scroll = false; setTimeout(() => board.querySelector('.pl3-tabs, .pl3-tabwrap')?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 60); }
    } else if (from && from.ref !== project.ref) window.__plFrom = null;
  }
  window.plBackToCollection = function(){
    const f = window.__plFrom; window.__plFrom = null; if (!f) return;
    document.querySelector(`.tab-btn[data-tab="${f.type === 'mixtape' ? 'mixtapes' : 'albums'}"]`)?.click();
    setTimeout(() => (f.type === 'mixtape' ? window.openMixtape : window.openAlbum)?.(f.id), 80);
  };

  // 1 ── Project selector ───────────────────────────────────────────────────────
  function renderProjectSelector(projects, activeRef) {
    return `
      <div class="pl3-projsel">
        ${projects.map(p => {
          const beats = projectBeats(p);
          const avg = beats.length ? Math.round(beats.reduce((s,b)=>s+clamp(b.done||0),0)/beats.length) : 0;
          const cover = p.obj.cover
            ? `<img src="${esc(p.obj.cover)}" alt="">`
            : `<span>${p.type === 'mixtape' ? '<span class="ic ic-cassette" aria-hidden="true"></span>' : '<span class="ic ic-music" aria-hidden="true"></span>'}</span>`;
          return `
            <button class="pl3-projchip ${p.ref === activeRef ? 'active' : ''}" onclick="plSelectProject('${esc(p.ref)}')">
              <span class="pl3-projchip-cover">${cover}</span>
              <span class="pl3-projchip-meta">
                <span class="pl3-projchip-name">${esc(p.obj.name || 'Uten navn')}</span>
                <span class="pl3-projchip-sub">${p.type === 'mixtape' ? 'Mixtape' : 'Album · ' + (window.mvStages ? mvStages.fmt(avg) : avg + ' %') + ' ferdig'}</span>
              </span>
            </button>`;
        }).join('')}
      </div>`;
  }

  // 2 ── Project hero ───────────────────────────────────────────────────────────
  function renderHero(project, beats, m, r, streak) {
    const a = project.obj;
    const avgCol = pctColor(m.avg);
    const cover = a.cover
      ? `<img class="pl3-hero-cover" src="${esc(a.cover)}" alt="">`
      : `<div class="pl3-hero-cover pl3-hero-cover-ph">${project.type === 'mixtape' ? '<span class="ic ic-cassette" aria-hidden="true"></span>' : '<span class="ic ic-music" aria-hidden="true"></span>'}</div>`;
    const status = project.type === 'mixtape' && !a.status ? 'Mixtape' : (window.mvStages ? window.mvStages.normalizeAlbum(a.status) : (a.status || 'Idé'));

    return `
      <div class="pl3-hero">
        ${cover}
        <div class="pl3-hero-body">
          <div class="pl3-hero-toprow">
            <div>
              <div class="pl3-hero-kicker">${project.type === 'mixtape' ? 'MIXTAPE' : 'ALBUM'} · ${m.n} låt${m.n!==1?'er':''}</div>
              <div class="pl3-hero-title">${esc(a.name || 'Uten navn')}</div>
            </div>
            <button class="pl3-iconbtn" title="Notater" aria-label="Notater" onclick="plToggleNotes('${esc(project.ref)}')"><span class="ic ic-file" aria-hidden="true"></span></button>
          </div>

          <div class="pl3-hero-statusrow">
            ${project.type === 'album' && window.mvStages && mvStages.pill
              ? mvStages.pill({ value: status, album: true, label: 'Albumets steg', onchange: `plAlbumStage('${esc(project.obj.id)}',this.value)` })
              : `<button type="button" class="pl3-stagechip" onclick="plOpenProject('${esc(project.ref)}')" title="Åpne mixtapen">${esc(status)} <span aria-hidden="true">›</span></button>`}
            <span class="pl3-streak"><span class="ic ic-flame" aria-hidden="true"></span> ${streak} dag${streak!==1?'er':''} på rad</span>
          </div>

          <div class="pl3-hero-metrics">
            <div class="pl3-metric">
              <div class="pl3-ring" style="background:conic-gradient(${avgCol} ${m.avg*3.6}deg, rgba(255,255,255,.08) 0)">
                <div class="pl3-ring-hole"><b style="color:${avgCol}">${m.avg}%</b></div>
              </div>
              <div class="pl3-metric-lbl"><b>Total fremgang</b><span>Snittet av låtenes fremdrift (steg og %)</span><span>${m.done} ferdig · ${m.wip} i arbeid · ${m.todo} ikke startet</span></div>
            </div>
            <div class="pl3-metric pl3-cue">
              <div class="pl3-metric-lbl"><b>${r.passed === r.total ? 'Klar for release' : 'Ikke klar for release ennå'}${window.mvHelpBtn ? mvHelpBtn('release', 'Hva betyr klar for release?') : ''}</b><span>Klar når alle låter er 100 % ferdige</span></div>
              <ul class="pl3-cue-list">${r.gates.map(gateRow).join('')}</ul>
            </div>
          </div>
        </div>

        <div class="pl3-notes" id="plnotes-${esc(project.ref)}" style="display:${a.pipelineNotes ? 'block' : 'none'}">
          <textarea class="pl3-notes-ta" placeholder="Produksjonsnotater for dette prosjektet…"
            oninput="plSaveNotes('${esc(project.ref)}',this.value)">${esc(a.pipelineNotes || '')}</textarea>
        </div>
      </div>`;
  }

  // 3 ── Dagens fokus ───────────────────────────────────────────────────────────
  function renderFocus(beats) {
    const focus = todaysFocus(beats);
    const icnMap = { audio:'<span class="ic ic-mic" aria-hidden="true"></span>', lyrics:'<span class="ic ic-pen" aria-hidden="true"></span>', record:'<span class="ic ic-sliders" aria-hidden="true"></span>', mix:'<span class="ic ic-sliders" aria-hidden="true"></span>', master:'<span class="ic ic-disc" aria-hidden="true"></span>' };
    let inner;
    if (!beats.length) {
      inner = `<div class="pl3-focus-empty">Legg til låter for å få konkrete oppgaver.</div>`;
    } else if (!focus.length) {
      inner = `<div class="pl3-focus-empty">Alt er ferdig her — prosjektet er klart!</div>`;
    } else {
      inner = focus.map((f, i) => `
        <button class="pl3-focus-task" onclick="plFocusGoto('${esc(f.b.id)}','${f.step.kind}')">
          <span class="pl3-focus-num">${i+1}</span>
          <span class="pl3-focus-icn">${icnMap[f.step.kind] || '→'}</span>
          <span class="pl3-focus-txt">
            <b>${esc(f.step.txt)}</b>
            <span>${f.more ? 'Start med ' : ''}<span data-no-i18n>${esc(f.b.name || 'Uten navn')}</span> · ${f.pct}%${f.step.why ? ` · <span class="pl3-why">${esc(f.step.why)}</span>` : ''}${f.more ? ` · <span class="pl3-more">+${f.more} til</span>` : ''}</span>
          </span>
          <span class="pl3-focus-go">→</span>
        </button>`).join('');
    }
    return `
      <div class="pl3-focus">
        <div class="pl3-focus-hd"><span class="pl3-focus-dot"></span> Dagens fokus</div>
        <div class="pl3-focus-list">${inner}</div>
      </div>`;
  }

  // 4 ── Tabs nav ───────────────────────────────────────────────────────────────
  function renderTabsNav(active) {
    const tabs = [
      { id:'oversikt',  label:'Oversikt',  icn:'<span class="ic ic-grid" aria-hidden="true"></span>' },
      { id:'board',     label:'Board',     icn:'<span class="ic ic-list" aria-hidden="true"></span>' },
    ];
    return `
      <div class="pl3-tabs">
        ${tabs.map(t => `
          <button class="pl3-tab ${t.id===active?'active':''}" onclick="plSetSubtab('${t.id}')">
            <span class="pl3-tab-icn">${t.icn}</span>${t.label}
          </button>`).join('')}
      </div>`;
  }

  // Åpne rader i oversikten huskes, så de ikke lukker seg når Pipeline tegnes på nytt (f.eks. etter glidebryteren)
  const OPEN_ROWS = new Set();
  document.addEventListener('toggle', e => {
    const d = e.target; if (!(d instanceof HTMLDetailsElement) || !d.classList.contains('pl3-songrow')) return;
    if (d.open) OPEN_ROWS.add(d.dataset.beatId); else OPEN_ROWS.delete(d.dataset.beatId);
  }, true);

  // 4a ── Oversikt: én sporliste, hver rad åpnes til låtkortet ─────────────────
  function renderOversikt(project, beats) {
    if (!beats.length) return `<div class="pl3-pane-empty">Ingen låter i dette prosjektet ennå.</div>`;

    // Én liste i albumrekkefølge (før: sporliste OG kort med de samme låtene, sortert etter %).
    // Hver rad åpnes til kortet med glidebryteren — du stiller fremdrift selv, men den ligger ikke åpen overalt.
    const fmt = window.mvStages ? mvStages.fmt : (n => n + ' %');
    const rows = beats.map((b, i) => {
      const pct = clamp(b.done||0);
      const stage = FLOW[flowIndex(b)];
      return `
        <details class="pl3-songrow" id="plrow-${esc(b.id)}" data-beat-id="${esc(b.id)}"${OPEN_ROWS.has(b.id) ? ' open' : ''}>
          <summary class="pl3-trow">
            <span class="pl3-trow-idx">${String(i+1).padStart(2,'0')}</span>
            <span class="pl3-trow-name" data-no-i18n>${esc(b.name || 'Uten navn')}</span>
            <span class="pl3-trow-stage" style="color:${stage.color}">● ${stage.label}</span>
            <span class="pl3-trow-bar"><i style="width:${pct}%;background:${stage.color}"></i></span>
            <span class="pl3-trow-pct">${fmt(pct)}</span>
          </summary>
          ${renderSongCard(b)}
        </details>`;
    }).join('');

    return `
      <div class="pl3-oversikt">
        <div class="pl3-section-lbl">Sporliste <span class="pl3-section-hint">— åpne en låt for å endre fremdriften</span></div>
        <div class="pl3-tracklist">${rows}</div>
      </div>`;
  }

  function renderSongCard(b) {
    const pct = clamp(b.done||0);
    const col = pctColor(pct);
    const fi  = flowIndex(b);
    const stage = FLOW[fi];
    const step = nextStep(b);
    const thumb = b.cover
      ? `<img class="pl3-card-thumb" src="${esc(b.cover)}" alt="">`
      : `<div class="pl3-card-thumb pl3-card-thumb-ph"><span class="ic ic-music" aria-hidden="true"></span></div>`;

    return `
      <div class="pl3-card" id="plcard-${esc(b.id)}">
        <div class="pl3-card-top">
          ${thumb}
          <div class="pl3-card-head">
            <div class="pl3-card-name">${esc(b.name || 'Uten navn')}</div>
            <div class="pl3-card-stage" style="color:${stage.color}">● ${stage.label}</div>
          </div>

        </div>

        <div class="pl3-card-tags">
          ${hasAudio(b)  ? '<span class="pl3-tag ok">Lyd ✓</span>'  : '<span class="pl3-tag no">Mangler lyd</span>'}
          ${(() => { const lp = lyricsPct(b); return lp >= 100 ? '<span class="pl3-tag ok">Tekst ✓</span>' : lp > 0 ? `<span class="pl3-tag">Tekst ${secTxt(b)}</span>` : '<span class="pl3-tag mut">Ingen tekst</span>'; })()}
        </div>

        ${step ? `<div class="pl3-card-next"><span>Neste steg</span><b>${esc(step.txt)}</b>${step.why ? `<small class="pl3-why">${esc(step.why)}</small>` : ''}</div>`
               : `<div class="pl3-card-next done"><span>Steg</span><b>Ferdig</b></div>`}

        <div class="pl3-card-slider">
          <span class="pl3-slider-lbl">Fremdrift</span>
          <input type="range" min="0" max="100" value="${pct}" style="accent-color:${col}" aria-label="Fremdrift for ${esc(b.name || 'låten')}"
            oninput="plLiveBeat('${esc(b.id)}',this.value,this)"
            onchange="plSaveBeat('${esc(b.id)}',this.value)">
          <output class="pl3-slider-val">${pct}%</output>
        </div>
        <div class="pl3-card-actions">
          <button class="pl3-cardbtn" onclick="plOpenLyric('${esc(b.id)}')"><span class="ic ic-pen" aria-hidden="true"></span> Lyric Lab</button>
          ${pct < 100 ? `<button class="pl3-cardbtn ghost" onclick="plSaveBeat('${esc(b.id)}',100)">✓ Sett 100%</button>` : ''}
        </div>
      </div>`;
  }

  // 4b ── Board (kanban) ───────────────────────────────────────────────────────
  // Board = de seks stegene (js/stages.js), samme kolonner som Studio-visningen.
  // Tomme kolonner smalnes inn, men stegene slås aldri sammen.
  function renderBoard(project, beats) {
    if (!beats.length) return `<div class="pl3-pane-empty">Ingen låter å vise på boardet.</div>`;
    const stages = window.mvStages ? mvStages.list : FLOW.map(f => ({ key: f.key, label: f.label }));
    const buckets = Object.fromEntries(stages.map(s => [s.key, []]));
    beats.forEach(b => buckets[stages[flowIndex(b)].key].push(b));
    return `
      <div class="pl3-board">
        ${stages.map((s, i) => `
          <div class="pl3-col${buckets[s.key].length ? '' : ' is-empty'}" data-stage="${s.key}" style="--stage-c:${FLOW[i] ? FLOW[i].color : 'var(--muted)'}">
            <div class="pl3-col-hd"><span>${s.label}</span><span class="pl3-col-count">${buckets[s.key].length}</span></div>
            <div class="pl3-col-list">
              ${buckets[s.key].map(b => renderBoardCard(b)).join('') || '<div class="pl3-col-empty">Dra låter hit</div>'}
            </div>
          </div>`).join('')}
      </div>`;
  }
  // Samme kort som Studio-visningen (js/track-cards.js): cover · tittel · prosent · linje i stegets farge · neste steg
  function renderBoardCard(b) {
    const pct = clamp(b.done||0);
    const step = nextStep(b);
    const fmt = window.mvStages ? mvStages.fmt : (n => n + ' %');
    const thumb = b.cover ? `<img src="${esc(b.cover)}" alt="" draggable="false" loading="lazy">` : '<span class="ic ic-music" aria-hidden="true"></span>';
    return `
      <div class="pl3-bcard" draggable="true" data-beat-id="${esc(b.id)}">
        <div class="pl3-bcard-top">
          <span class="pl3-bcard-thumb">${thumb}</span>
          <span class="pl3-bcard-name" data-no-i18n lang="nb">${esc(b.name || 'Uten navn')}</span>
        </div>
        <button type="button" class="pl3-bcard-play" draggable="false" title="Spill" aria-label="Spill ${esc(b.name || '')}"
          onclick="event.stopPropagation();if(typeof playSingleBeat==='function')playSingleBeat('${esc(b.id)}')"><span class="ic ic-play" aria-hidden="true"></span></button>
        <div class="pl3-bcard-meter"><div class="pl3-bcard-bar"><i style="width:${pct}%"></i></div><span class="pl3-bcard-pct"><small>Fremdrift</small> ${fmt(pct)}</span></div>
        ${step ? `<div class="pl3-bcard-next">→ ${esc(step.txt)}${step.why ? `<small class="pl3-why">${esc(step.why)}</small>` : ''}</div>` : '<div class="pl3-bcard-next done">✓ Ferdig</div>'}
      </div>`;
  }

  // ── Board drag wiring ────────────────────────────────────────────────────────
  function wireBoardDrag(board, project) {
    board.querySelectorAll('.pl3-bcard').forEach(el => {
      el.addEventListener('dragstart', e => {
        _dragBeatId = el.dataset.beatId;
        el.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
      });
      el.addEventListener('dragend', () => el.classList.remove('dragging'));
    });
    board.querySelectorAll('.pl3-col').forEach(col => {
      col.addEventListener('dragover', e => { e.preventDefault(); col.classList.add('drag-over'); });
      col.addEventListener('dragleave', () => col.classList.remove('drag-over'));
      col.addEventListener('drop', e => {
        e.preventDefault();
        col.classList.remove('drag-over');
        if (!_dragBeatId) return;
        const beat = (st().beats || []).find(b => b.id === _dragBeatId);
        _dragBeatId = null;
        if (!beat) return;
        if (window.mvStages) mvStages.set(beat, col.dataset.stage);
        save();
        render();
      });
    });
  }

  // ── Actions (global) ─────────────────────────────────────────────────────────
  function findProject(ref) {
    return getProjects().find(p => p.ref === ref);
  }

  window.plSelectProject = function (ref) {
    localStorage.setItem('mv_pl_project', ref);
    render();
  };

  window.plSetSubtab = function (id) {
    localStorage.setItem('mv_pl_subtab', id);
    render();
  };

  // Åpne albumet/mixtapen (der steget endres)
  window.plOpenProject = function (ref) {
    const p = findProject(ref); if (!p) return;
    document.querySelector(`.tab-btn[data-tab="${p.type === 'mixtape' ? 'mixtapes' : 'albums'}"]`)?.click();
    setTimeout(() => (p.type === 'mixtape' ? window.openMixtape : window.openAlbum)?.(p.obj.id), 80);
  };

  window.plSetStatus = function (ref, status) {
    const p = findProject(ref);
    if (p) { p.obj.status = status; save(); }
  };

  window.plToggleNotes = function (ref) {
    const box = document.getElementById('plnotes-' + ref);
    if (!box) return;
    box.style.display = box.style.display === 'none' ? 'block' : 'none';
    if (box.style.display === 'block') box.querySelector('textarea')?.focus();
  };

  window.plSaveNotes = function (ref, text) {
    const p = findProject(ref);
    if (p) { p.obj.pipelineNotes = text; save(); }
  };

  // Live slider — update colour/number without re-render
  window.plLiveBeat = function (beatId, val, slider) {
    const pct = clamp(Number(val));
    const col = pctColor(pct);
    slider.style.accentColor = col;
    const out = slider.parentElement?.querySelector('.pl3-slider-val'); if (out) out.textContent = pct + '%';
    const card = document.getElementById('plcard-' + beatId);
    if (card) {
      const hole = card.querySelector('.pl3-ring.sm .pl3-ring-hole b');
      const ring = card.querySelector('.pl3-ring.sm');
      if (hole) { hole.textContent = pct; hole.style.color = col; }
      if (ring) ring.style.background = `conic-gradient(${col} ${pct*3.6}deg, rgba(255,255,255,.08) 0)`;
    }
  };

  // Commit slider — persist + re-render (preserve scroll)
  window.plSaveBeat = function (beatId, val, noUndo) {
    const beat = (st().beats || []).find(b => b.id === beatId);
    if (!beat) return;
    const prev = clamp(beat.done || 0);
    beat.done = clamp(Number(val));
    if (!noUndo && prev !== beat.done && typeof showToast === 'function')
      setTimeout(() => showToast(`✓ ${beat.name || 'Låten'}: ${beat.done}%`, 'Angre', () => window.plSaveBeat(beatId, prev, true)), 0);
    save();
    const y = window.scrollY;
    render();
    window.scrollTo(0, y);
  };

  window.plOpenLyric = function (beatId) {
    if (typeof openInLyricLab === 'function') openInLyricLab(beatId);
  };

  // Focus task → jump to the right place
  // Albumets steg fra Pipeline (samme velger og samme «Angre» som på albumsiden)
  window.plAlbumStage = function (albumId, val) {
    const a = (st().albums || []).find(x => x.id === albumId); if (!a) return;
    const prev = a.status; a.status = val; save(); render();
    if (typeof showToast === 'function') showToast('✓ Albumets steg: ' + val, 'Angre', () => { a.status = prev; save(); render(); });
  };

  window.plFocusGoto = function (beatId, kind) {
    if (kind === 'lyrics') { window.plOpenLyric(beatId); return; }
    // ensure Oversikt is visible, then scroll + flash the card
    if (getSubtab() !== 'oversikt') { localStorage.setItem('mv_pl_subtab','oversikt'); render(); }
    setTimeout(() => window.plScrollToCard(beatId), 60);
  };

  window.plScrollToCard = function (beatId) {
    const row = document.getElementById('plrow-' + beatId); if (row) row.open = true;
    const card = document.getElementById('plcard-' + beatId);
    if (!card) return;
    card.scrollIntoView({ behavior:'smooth', block:'center' });
    card.classList.add('flash');
    setTimeout(() => card.classList.remove('flash'), 1400);
  };

  // ── Register (take over db.js's renderPipeline) ──────────────────────────────
  window.renderPipelineV2 = render;
  window.renderPipeline   = render;

  // Boot if pipeline tab is already active
  if (!document.getElementById('pipelineTab')?.classList.contains('hidden')) {
    setTimeout(render, 0);
  }

})();
