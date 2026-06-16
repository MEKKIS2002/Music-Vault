// === pipeline.js ===
// Pipeline v3 — "Release Studio"
// A project-centric workspace that answers: where is this project, what's most
// done, what should I do today, and how close am I to release.
//
// Layout (top → bottom):
//   1. Project selector   — choose album/mixtape to focus on
//   2. Project hero       — cover, title, total progress, release-readiness
//   3. Dagens fokus       — 3 concrete, clickable tasks
//   4. Tabbed workspace   — Oversikt | Board | Timeline | Sjekkliste
//
// db.js calls (window.renderPipelineV2 || renderPipeline) for the pipeline tab,
// so defining window.renderPipelineV2 is all that's needed to take over.

(function () {
  'use strict';

  // ── Flow stages (fine-grained, used by Oversikt/Timeline/Status) ────────────
  const FLOW = [
    { key: 'idea',    label: 'Idé',          color: '#8b8794' },
    { key: 'writing', label: 'Skriving',     color: '#a78bfa' },
    { key: 'record',  label: 'Innspilling',  color: '#60a5fa' },
    { key: 'mix',     label: 'Mixing',       color: '#f4a443' },
    { key: 'master',  label: 'Mastering',    color: '#fbbf24' },
    { key: 'done',    label: 'Ferdig',       color: '#34d399' },
  ];

  // Board buckets (coarse, drag & drop)
  const BOARD = [
    { id: 'todo',       label: 'Ikke startet', color: 'rgba(255,255,255,.05)' },
    { id: 'inprogress', label: 'I arbeid',     color: 'rgba(244,164,67,.10)'  },
    { id: 'done',       label: 'Ferdig',       color: 'rgba(52,211,153,.10)'  },
  ];

  const ALBUM_STATUS = ['Idé', 'Skriving', 'Innspilling', 'Mixing', 'Mastering', 'Klar for release'];

  // ── Helpers ─────────────────────────────────────────────────────────────────
  function st()     { return typeof state !== 'undefined' ? state : window.state; }
  function save()   { if (typeof saveState === 'function') saveState(); }
  function esc(s)   { return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function clamp(n) { return Math.max(0, Math.min(100, Number(n) || 0)); }
  function pctColor(p){ return p >= 70 ? '#34d399' : p >= 40 ? '#f4a443' : '#fb7185'; }

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
  function flowIndex(b) {
    const pct = clamp(b.done || 0);
    if (pct >= 100) return 5;            // Ferdig
    if (pct >= 76)  return 4;            // Mastering
    if (pct >= 51)  return 3;            // Mixing
    if (pct >= 26)  return 2;            // Innspilling
    if (pct > 0 || hasAudio(b)) return 1;// Skriving / skisse
    if (hasLyrics(b)) return 1;          // har tekst → skriving
    return 0;                            // Idé
  }
  // Coarse board bucket
  function boardBucket(b) {
    const pct = clamp(b.done || 0);
    if (pct >= 100) return 'done';
    if (pct > 0 || hasAudio(b) || hasLyrics(b)) return 'inprogress';
    return 'todo';
  }

  // The single most important next step for a beat.
  // The done-slider is the artist's explicit "finished" signal: a song at 100%
  // gets no task, regardless of audio/lyrics metadata flags.
  function nextStep(b) {
    const pct = clamp(b.done || 0);
    if (pct >= 100)                         return null;  // Ferdig — ingen oppgave
    if (!hasAudio(b))                       return { txt: 'Last opp lydfil',        kind: 'audio'  };
    if (!hasLyrics(b))                      return { txt: 'Skriv tekst',            kind: 'lyrics' };
    if ((b.lyricSections||[]).length && !sectionsDone(b))
                                            return { txt: 'Ferdigstill seksjoner',  kind: 'lyrics' };
    if (pct < 50)                           return { txt: 'Spill inn / skisse',     kind: 'record' };
    if (pct < 76)                           return { txt: 'Miks ferdig',            kind: 'mix'    };
    return { txt: 'Master & sett til 100%', kind: 'master' };
  }

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
  function gates(project, beats) {
    const n = beats.length;
    const some = n > 0;
    return [
      { label: 'Minst én låt i prosjektet',        ok: some,                                          hint: 'Legg til låter for å starte' },
      { label: 'Alle låter har lydfil',            ok: some && beats.every(hasAudio),                  hint: 'Last opp lyd der det mangler' },
      { label: 'Alle låter har tekst',             ok: some && beats.every(hasLyrics),                 hint: 'Skriv ferdig tekstene' },
      { label: 'Alle seksjoner ferdigstilt',       ok: some && beats.every(b => !(b.lyricSections||[]).length || sectionsDone(b)), hint: 'Marker seksjoner som ferdige i Lyric Lab' },
      { label: 'Alle låter mikset (≥ 75 %)',       ok: some && beats.every(b => clamp(b.done||0) >= 75), hint: 'Løft de svakeste låtene' },
      { label: 'Prosjektomslag lastet opp',        ok: !!project.obj.cover,                            hint: 'Legg til et cover' },
      { label: 'Alle låter 100 % ferdig',          ok: some && beats.every(b => clamp(b.done||0) >= 100), hint: 'Fullfør de siste låtene' },
    ];
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
    return cand.slice(0, 3);
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
    return localStorage.getItem('mv_pl_subtab') || 'oversikt';
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
          <div class="pl3-empty-icn">📊</div>
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
          ${subtab === 'timeline'  ? renderTimeline(project, beats, r)   : ''}
          ${subtab === 'checklist' ? renderChecklist(project, beats, r)  : ''}
        </div>
      </div>`;

    wireBoardDrag(board, project);
  }

  // 1 ── Project selector ───────────────────────────────────────────────────────
  function renderProjectSelector(projects, activeRef) {
    return `
      <div class="pl3-projsel">
        ${projects.map(p => {
          const beats = projectBeats(p);
          const avg = beats.length ? Math.round(beats.reduce((s,b)=>s+clamp(b.done||0),0)/beats.length) : 0;
          const cover = p.obj.cover
            ? `<img src="${esc(p.obj.cover)}" alt="">`
            : `<span>${p.type === 'mixtape' ? '📼' : '🎵'}</span>`;
          return `
            <button class="pl3-projchip ${p.ref === activeRef ? 'active' : ''}" onclick="plSelectProject('${esc(p.ref)}')">
              <span class="pl3-projchip-cover">${cover}</span>
              <span class="pl3-projchip-meta">
                <span class="pl3-projchip-name">${esc(p.obj.name || 'Uten navn')}</span>
                <span class="pl3-projchip-sub">${p.type === 'mixtape' ? 'Mixtape' : 'Album'} · ${avg}%</span>
              </span>
            </button>`;
        }).join('')}
      </div>`;
  }

  // 2 ── Project hero ───────────────────────────────────────────────────────────
  function renderHero(project, beats, m, r, streak) {
    const a = project.obj;
    const avgCol = pctColor(m.avg);
    const readyCol = pctColor(r.pct);
    const cover = a.cover
      ? `<img class="pl3-hero-cover" src="${esc(a.cover)}" alt="">`
      : `<div class="pl3-hero-cover pl3-hero-cover-ph">${project.type === 'mixtape' ? '📼' : '🎵'}</div>`;
    const status = a.status || (project.type === 'mixtape' ? 'Mixtape' : 'Idé');

    return `
      <div class="pl3-hero">
        ${cover}
        <div class="pl3-hero-body">
          <div class="pl3-hero-toprow">
            <div>
              <div class="pl3-hero-kicker">${project.type === 'mixtape' ? 'MIXTAPE' : 'ALBUM'} · ${m.n} låt${m.n!==1?'er':''}</div>
              <div class="pl3-hero-title">${esc(a.name || 'Uten navn')}</div>
            </div>
            <button class="pl3-iconbtn" title="Notater" onclick="plToggleNotes('${esc(project.ref)}')">📝</button>
          </div>

          <div class="pl3-hero-statusrow">
            <select class="pl3-statussel" onchange="plSetStatus('${esc(project.ref)}',this.value)">
              ${ALBUM_STATUS.map(s => `<option value="${esc(s)}"${s===status?' selected':''}>${esc(s)}</option>`).join('')}
            </select>
            <span class="pl3-streak">🔥 ${streak} dag${streak!==1?'er':''} på rad</span>
          </div>

          <div class="pl3-hero-metrics">
            <div class="pl3-metric">
              <div class="pl3-ring" style="background:conic-gradient(${avgCol} ${m.avg*3.6}deg, rgba(255,255,255,.08) 0)">
                <div class="pl3-ring-hole"><b style="color:${avgCol}">${m.avg}%</b></div>
              </div>
              <div class="pl3-metric-lbl"><b>Total fremgang</b><span>${m.done} ferdig · ${m.wip} i arbeid · ${m.todo} ikke startet</span></div>
            </div>
            <div class="pl3-metric">
              <div class="pl3-ring" style="background:conic-gradient(${readyCol} ${r.pct*3.6}deg, rgba(255,255,255,.08) 0)">
                <div class="pl3-ring-hole"><b style="color:${readyCol}">${r.pct}%</b></div>
              </div>
              <div class="pl3-metric-lbl"><b>Release-klar</b><span>${r.passed} av ${r.total} krav oppfylt</span></div>
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
    const icnMap = { audio:'🎙️', lyrics:'✍️', record:'🎛️', mix:'🎚️', master:'✨' };
    let inner;
    if (!beats.length) {
      inner = `<div class="pl3-focus-empty">Legg til låter for å få konkrete oppgaver.</div>`;
    } else if (!focus.length) {
      inner = `<div class="pl3-focus-empty">🎉 Alt er ferdig her — prosjektet er klart!</div>`;
    } else {
      inner = focus.map((f, i) => `
        <button class="pl3-focus-task" onclick="plFocusGoto('${esc(f.b.id)}','${f.step.kind}')">
          <span class="pl3-focus-num">${i+1}</span>
          <span class="pl3-focus-icn">${icnMap[f.step.kind] || '→'}</span>
          <span class="pl3-focus-txt">
            <b>${esc(f.step.txt)}</b>
            <span>${esc(f.b.name || 'Uten navn')} · ${f.pct}%</span>
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
      { id:'oversikt',  label:'Oversikt',  icn:'▦' },
      { id:'board',     label:'Board',     icn:'▤' },
      { id:'timeline',  label:'Timeline',  icn:'⎯' },
      { id:'checklist', label:'Sjekkliste',icn:'☑' },
    ];
    return `
      <div class="pl3-tabs">
        ${tabs.map(t => `
          <button class="pl3-tab ${t.id===active?'active':''}" onclick="plSetSubtab('${t.id}')">
            <span class="pl3-tab-icn">${t.icn}</span>${t.label}
          </button>`).join('')}
      </div>`;
  }

  // 4a ── Oversikt: tracklist + song cards ─────────────────────────────────────
  function renderOversikt(project, beats) {
    if (!beats.length) return `<div class="pl3-pane-empty">Ingen låter i dette prosjektet ennå.</div>`;

    // sorted: most complete first
    const sorted = beats.slice().sort((a,b) => clamp(b.done||0) - clamp(a.done||0));

    const rows = sorted.map((b, i) => {
      const pct = clamp(b.done||0);
      const fi  = flowIndex(b);
      const stage = FLOW[fi];
      const col = pctColor(pct);
      return `
        <div class="pl3-trow" onclick="plScrollToCard('${esc(b.id)}')">
          <span class="pl3-trow-idx">${String(i+1).padStart(2,'0')}</span>
          <span class="pl3-trow-name">${esc(b.name || 'Uten navn')}</span>
          <span class="pl3-trow-stage" style="color:${stage.color}">● ${stage.label}</span>
          <span class="pl3-trow-bar"><i style="width:${pct}%;background:${col}"></i></span>
          <span class="pl3-trow-pct" style="color:${col}">${pct}%</span>
        </div>`;
    }).join('');

    const cards = sorted.map(b => renderSongCard(b)).join('');

    return `
      <div class="pl3-oversikt">
        <div class="pl3-section-lbl">Tracklist</div>
        <div class="pl3-tracklist">${rows}</div>
        <div class="pl3-section-lbl" style="margin-top:22px">Låter</div>
        <div class="pl3-cards">${cards}</div>
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
      : `<div class="pl3-card-thumb pl3-card-thumb-ph">🎵</div>`;

    return `
      <div class="pl3-card" id="plcard-${esc(b.id)}">
        <div class="pl3-card-top">
          ${thumb}
          <div class="pl3-card-head">
            <div class="pl3-card-name">${esc(b.name || 'Uten navn')}</div>
            <div class="pl3-card-stage" style="color:${stage.color}">● ${stage.label}</div>
          </div>
          <div class="pl3-ring sm" style="background:conic-gradient(${col} ${pct*3.6}deg, rgba(255,255,255,.08) 0)">
            <div class="pl3-ring-hole"><b style="color:${col};font-size:11px">${pct}</b></div>
          </div>
        </div>

        <div class="pl3-card-tags">
          ${hasAudio(b)  ? '<span class="pl3-tag ok">Lyd ✓</span>'  : '<span class="pl3-tag no">Mangler lyd</span>'}
          ${hasLyrics(b) ? '<span class="pl3-tag ok">Tekst ✓</span>' : '<span class="pl3-tag mut">Ingen tekst</span>'}
        </div>

        ${step ? `<div class="pl3-card-next"><span>Neste steg</span><b>${esc(step.txt)}</b></div>`
               : `<div class="pl3-card-next done"><span>Status</span><b>🎉 Ferdig</b></div>`}

        <div class="pl3-card-slider">
          <input type="range" min="0" max="100" value="${pct}" style="accent-color:${col}"
            oninput="plLiveBeat('${esc(b.id)}',this.value,this)"
            onchange="plSaveBeat('${esc(b.id)}',this.value)">
        </div>
        <div class="pl3-card-actions">
          <button class="pl3-cardbtn" onclick="plOpenLyric('${esc(b.id)}')">✍️ Lyric Lab</button>
          ${pct < 100 ? `<button class="pl3-cardbtn ghost" onclick="plSaveBeat('${esc(b.id)}',100)">✓ Sett 100%</button>` : ''}
        </div>
      </div>`;
  }

  // 4b ── Board (kanban) ───────────────────────────────────────────────────────
  function renderBoard(project, beats) {
    if (!beats.length) return `<div class="pl3-pane-empty">Ingen låter å vise på boardet.</div>`;
    const buckets = { todo: [], inprogress: [], done: [] };
    beats.forEach(b => buckets[boardBucket(b)].push(b));

    return `
      <div class="pl3-board">
        ${BOARD.map(col => `
          <div class="pl3-col" data-stage="${col.id}" style="background:${col.color}">
            <div class="pl3-col-hd"><span>${col.label}</span><span class="pl3-col-count">${buckets[col.id].length}</span></div>
            <div class="pl3-col-list">
              ${buckets[col.id].map(b => renderBoardCard(b)).join('') || '<div class="pl3-col-empty">Dra låter hit</div>'}
            </div>
          </div>`).join('')}
      </div>`;
  }
  function renderBoardCard(b) {
    const pct = clamp(b.done||0);
    const col = pctColor(pct);
    const step = nextStep(b);
    return `
      <div class="pl3-bcard" draggable="true" data-beat-id="${esc(b.id)}">
        <div class="pl3-bcard-top">
          <span class="pl3-bcard-name">${esc(b.name || 'Uten navn')}</span>
          <span class="pl3-bcard-pct" style="color:${col}">${pct}%</span>
        </div>
        <div class="pl3-bcard-bar"><i style="width:${pct}%;background:${col}"></i></div>
        ${step ? `<div class="pl3-bcard-next">→ ${esc(step.txt)}</div>` : '<div class="pl3-bcard-next done">✓ Ferdig</div>'}
      </div>`;
  }

  // 4c ── Timeline ─────────────────────────────────────────────────────────────
  function renderTimeline(project, beats, r) {
    if (!beats.length) return `<div class="pl3-pane-empty">Ingen låter å plassere på tidslinjen.</div>`;

    // Distribution of songs across flow stages
    const counts = FLOW.map(() => 0);
    beats.forEach(b => counts[flowIndex(b)]++);
    const maxC = Math.max(1, ...counts);

    const lanes = FLOW.map((stage, i) => {
      const songs = beats.filter(b => flowIndex(b) === i);
      return `
        <div class="pl3-tl-stage">
          <div class="pl3-tl-node" style="background:${stage.color}"></div>
          <div class="pl3-tl-stagehd">
            <b style="color:${stage.color}">${stage.label}</b>
            <span>${songs.length}</span>
          </div>
          <div class="pl3-tl-bar"><i style="width:${counts[i]/maxC*100}%;background:${stage.color}"></i></div>
          <div class="pl3-tl-songs">
            ${songs.map(b => `<span class="pl3-tl-chip" onclick="plOpenLyric('${esc(b.id)}')">${esc(b.name || 'Uten navn')}</span>`).join('') || '<span class="pl3-tl-none">—</span>'}
          </div>
        </div>`;
    }).join('');

    return `
      <div class="pl3-timeline">
        <div class="pl3-tl-head">Hver låt plassert i produksjonsløpet — fra idé til ferdig. Klikk en låt for å åpne den.</div>
        <div class="pl3-tl-track">${lanes}</div>
      </div>`;
  }

  // 4d ── Sjekkliste ───────────────────────────────────────────────────────────
  function renderChecklist(project, beats, r) {
    const items = r.gates.map(g => `
      <div class="pl3-check ${g.ok ? 'ok' : ''}">
        <span class="pl3-check-box">${g.ok ? '✓' : ''}</span>
        <span class="pl3-check-body">
          <b>${esc(g.label)}</b>
          ${g.ok ? '' : `<span>${esc(g.hint)}</span>`}
        </span>
      </div>`).join('');

    const col = pctColor(r.pct);
    return `
      <div class="pl3-checklist">
        <div class="pl3-check-summary">
          <div class="pl3-ring" style="background:conic-gradient(${col} ${r.pct*3.6}deg, rgba(255,255,255,.08) 0)">
            <div class="pl3-ring-hole"><b style="color:${col}">${r.pct}%</b></div>
          </div>
          <div>
            <div class="pl3-check-sumtitle">${r.passed} av ${r.total} krav oppfylt</div>
            <div class="pl3-check-sumsub">${r.pct === 100 ? 'Prosjektet er klart for release! 🚀' : 'Fullfør kravene under for å bli release-klar.'}</div>
          </div>
        </div>
        <div class="pl3-check-list">${items}</div>
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
        const stage = col.dataset.stage;
        if (stage === 'done') beat.done = 100;
        else if (stage === 'inprogress') { if (!beat.done || beat.done === 0) beat.done = 10; else if (beat.done >= 100) beat.done = 60; }
        else beat.done = 0;
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
    const card = document.getElementById('plcard-' + beatId);
    if (card) {
      const hole = card.querySelector('.pl3-ring.sm .pl3-ring-hole b');
      const ring = card.querySelector('.pl3-ring.sm');
      if (hole) { hole.textContent = pct; hole.style.color = col; }
      if (ring) ring.style.background = `conic-gradient(${col} ${pct*3.6}deg, rgba(255,255,255,.08) 0)`;
    }
  };

  // Commit slider — persist + re-render (preserve scroll)
  window.plSaveBeat = function (beatId, val) {
    const beat = (st().beats || []).find(b => b.id === beatId);
    if (!beat) return;
    beat.done = clamp(Number(val));
    save();
    const y = window.scrollY;
    render();
    window.scrollTo(0, y);
  };

  window.plOpenLyric = function (beatId) {
    if (typeof openInLyricLab === 'function') openInLyricLab(beatId);
  };

  // Focus task → jump to the right place
  window.plFocusGoto = function (beatId, kind) {
    if (kind === 'lyrics') { window.plOpenLyric(beatId); return; }
    // ensure Oversikt is visible, then scroll + flash the card
    if (getSubtab() !== 'oversikt') { localStorage.setItem('mv_pl_subtab','oversikt'); render(); }
    setTimeout(() => window.plScrollToCard(beatId), 60);
  };

  window.plScrollToCard = function (beatId) {
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
