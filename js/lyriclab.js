// === lyriclab.js ===
// Lyric Lab — fullskjerm teksteditor med beat-info og skriveanalyse.
//
// DATAMODELL per beat:
//   beat.lyricSections: Array<{id, type, title, text, collapsed, order}>
//   beat.lyricLabStatus: 'utkast' | 'skriver' | 'demo' | 'revisjon' | 'ferdig'
//   beat.lyrics: eksisterende felt — brukes som fallback, aldri slettet
//
// INNGANGER:
//   openInLyricLab(beatId) — sett currentLyricLabBeatId og bytt tab
//
// GLOBALT:
//   window.currentLyricLabBeatId
//   window.renderLyricLab

(function () {
  'use strict';

  // ── Constants ─────────────────────────────────────────────────────────────
  const DEFAULT_SECTIONS = [
    { id: 'hook',   type: 'hook',   title: 'Hook',   text: '', collapsed: false, done: false, order: 0 },
    { id: 'verse1', type: 'verse',  title: 'Vers 1', text: '', collapsed: false, done: false, order: 1 },
    { id: 'bridge', type: 'bridge', title: 'Bro',    text: '', collapsed: false, done: false, order: 2 },
    { id: 'verse2', type: 'verse',  title: 'Vers 2', text: '', collapsed: false, done: false, order: 3 },
    { id: 'outro',  type: 'outro',  title: 'Outro',  text: '', collapsed: true,  done: false, order: 4 },
  ];
  const STATUS_OPTIONS = ['utkast','skriver','demo','revisjon','ferdig'];
  const TYPE_LABELS    = { hook:'Hook', verse:'Vers', bridge:'Bro', outro:'Outro', custom:'Custom' };

  let _lastSaved = null;
  let _saveTimer = null;
  let _saveMaxTimer = null; // maxWait guard — ensures save even during non-stop typing

  // Debounce with maxWait: saves 600ms after last keystroke, but forces save every 5s
  // during continuous typing so Supabase stays in sync underveis.
  function scheduleAutoSave(beat, updateRight) {
    clearTimeout(_saveTimer);
    _saveTimer = setTimeout(() => {
      clearTimeout(_saveMaxTimer); _saveMaxTimer = null;
      saveSections(beat);
      if (updateRight) updateRightPanel(beat);
    }, 600);
    if (!_saveMaxTimer) {
      _saveMaxTimer = setTimeout(() => {
        _saveMaxTimer = null;
        clearTimeout(_saveTimer); _saveTimer = null;
        saveSections(beat);
        if (updateRight) updateRightPanel(beat);
      }, 5000);
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  function esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function getState(){ return typeof state !== 'undefined' ? state : window.state; }
  function getBeat(id){ return (getState()?.beats||[]).find(b=>b.id===id); }
  function uid(){ return Math.random().toString(36).slice(2,10); }
  function fmtDur(sec){ sec=Number(sec||0); if(!isFinite(sec)||sec<=0) return '--:--'; return Math.floor(sec/60)+':'+String(Math.floor(sec%60)).padStart(2,'0'); }

  // ── Data helpers ──────────────────────────────────────────────────────────
  // Convert stored text to HTML for contenteditable
  // Stored format: plain text with %%COLOR:hex%%text%%ENDCOLOR%% markers
  function llTextToHtml(text) {
    if (!text) return '';
    // Escape HTML first
    let safe = text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    // Then restore our own color markers
    safe = safe.replace(/%%COLOR:([^%]+)%%(.+?)%%ENDCOLOR%%/g,
      (_, color, content) => `<mark style="background:${color};border-radius:3px;padding:0 1px">${content}</mark>`);
    return safe;
  }

  // Convert editor HTML back to storage format
  function llHtmlToText(html) {
    // Replace <mark> spans with our markers
    let text = html.replace(/<mark[^>]*style="background:([^";]+)[^"]*"[^>]*>([\s\S]*?)<\/mark>/g,
      (_, color, content) => `%%COLOR:${color.trim()}%%${content}%%ENDCOLOR%%`);
    // Strip remaining HTML
    text = text.replace(/<br\s*\/?>/gi,'\n').replace(/<\/div>/gi,'\n').replace(/<\/p>/gi,'\n').replace(/<[^>]+>/g,'');
    text = text.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&nbsp;/g,' ');
    // Collapse multiple newlines
    text = text.replace(/\n{3,}/g,'\n\n').trim();
    return text;
  }

  // Strip HTML tags from rich-text lyrics (old editor used contenteditable with spans)
  function stripHtml(html) {
    if (!html || !html.includes('<')) return html || '';
    return html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/div>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function getSections(beat) {
    if (beat.lyricSections && beat.lyricSections.length) {
      // Also strip any HTML that crept into existing sections
      beat.lyricSections.forEach(s => { s.text = stripHtml(s.text); });
      return beat.lyricSections;
    }
    // Migrate existing lyrics string into Hook section (strip HTML first)
    const sections = DEFAULT_SECTIONS.map(s => ({...s}));
    if (beat.lyrics && beat.lyrics.trim()) sections[0].text = stripHtml(beat.lyrics);
    beat.lyricSections = sections;
    return sections;
  }

  function saveSections(beat) {
    if (typeof saveState === 'function') saveState();
    _lastSaved = new Date();
    updateStatusBar();
  }

  // ── Text analysis ─────────────────────────────────────────────────────────
  function allText(beat) {
    return (getSections(beat)||[]).map(s=>s.text).join('\n');
  }
  function countWords(text) {
    return text.trim() ? text.trim().split(/\s+/).filter(Boolean).length : 0;
  }
  function countLines(text) {
    return text.trim() ? text.split('\n').filter(l=>l.trim()).length : 0;
  }
  function estimateDuration(words) {
    // ~120 words/min rapping = 0.5s/word
    const mins = words / 120;
    const s = Math.round(mins * 60);
    return Math.floor(s/60) + ':' + String(s%60).padStart(2,'0');
  }
  function repeatedWords(text) {
    const words = text.toLowerCase().replace(/[^a-zæøå\s]/g,'').split(/\s+/).filter(w=>w.length>3);
    const freq = {};
    words.forEach(w => freq[w] = (freq[w]||0)+1);
    return Object.entries(freq).filter(([,n])=>n>=3).sort((a,b)=>b[1]-a[1]).slice(0,8);
  }
  function missingSections(beat) {
    const have = new Set((getSections(beat)||[]).filter(s=>s.done || s.text.trim()).map(s=>s.type));
    return ['hook','verse','bridge'].filter(t=>!have.has(t));
  }
  // Writing progress 0–100: done sections count full, sections with text count partial.
  function writingProgress(beat) {
    const secs = (getSections(beat)||[]).filter(s => ['hook','verse','bridge','outro'].includes(s.type) || s.text.trim());
    if (!secs.length) return 0;
    let score = 0;
    secs.forEach(s => { score += s.done ? 1 : (s.text.trim() ? 0.55 : 0); });
    return Math.min(100, Math.round((score / secs.length) * 100));
  }

  // ── Status bar ────────────────────────────────────────────────────────────
  function updateStatusBar() {
    const beat = getBeat(window.currentLyricLabBeatId);
    const el = document.getElementById('llStatusBar');
    if (!el || !beat) return;
    const txt = allText(beat);
    const w = countWords(txt), l = countLines(txt);
    document.getElementById('llStatWords').textContent = w;
    document.getElementById('llStatLines').textContent = l;
    document.getElementById('llStatDur').textContent   = estimateDuration(w);
    if (_lastSaved) document.getElementById('llLastSaved').textContent = 'Lagret ' + _lastSaved.toLocaleTimeString('no-NO',{hour:'2-digit',minute:'2-digit'});
  }

  // ── Waveform bars HTML ────────────────────────────────────────────────────
  function waveformHTML() {
    const heights = [20,35,55,70,50,80,65,45,90,70,55,40,75,60,45,30,65,50,35,55,70,45,60,80,55];
    return heights.map(h => `<div class="ll-waveform-bar" style="height:${h}%"></div>`).join('');
  }

  // ── Section HTML ──────────────────────────────────────────────────────────
  function sectionHTML(sec, beat) {
    const typeClass = `ll-type-${sec.type}`;
    const lineNums  = sec.text.split('\n').map((_,i)=>i+1).join('\n');
    const lineCount = countLines(sec.text);
    return `
    <div class="ll-section${sec.collapsed?' collapsed':''}" data-section-id="${esc(sec.id)}" id="llsec-${esc(sec.id)}">
      <div class="ll-section-header" onclick="llToggleSection('${esc(sec.id)}')">
        <span class="ll-section-type ${typeClass}">${esc(TYPE_LABELS[sec.type]||sec.type)}</span>
        <input class="ll-section-title-input" value="${esc(sec.title)}" onclick="event.stopPropagation()"
          onchange="llRenameSection('${esc(sec.id)}',this.value)">
        <span class="ll-section-line-count">${lineCount} ${lineCount===1?'linje':'linjer'}</span>
        <button class="ll-section-menu-btn" onclick="event.stopPropagation();llToggleSectionMenu('${esc(sec.id)}')">⋯</button>
        <button class="ll-section-done-btn${sec.done?' done':''}" onclick="event.stopPropagation();llToggleSectionDone('${esc(sec.id)}')" title="${sec.done?'Ferdig':'Merk som ferdig'}">
          ${sec.done?'✓':'○'}
        </button>
        <button class="ll-section-toggle">${sec.collapsed?'▸':'▾'}</button>
      </div>
      <div class="ll-section-body">
        <div class="ll-line-numbers" id="llnums-${esc(sec.id)}">${sec.text.split('\n').map((_,i)=>i+1).join('\n')}</div>
        <div class="ll-textarea ll-highlight-editor"
          id="lltxt-${esc(sec.id)}"
          contenteditable="true"
          data-section-id="${esc(sec.id)}"
          data-placeholder="Skriv ${sec.title.toLowerCase()} her..."
          oninput="llSectionInput(this,'${esc(sec.id)}')"
          spellcheck="false"
        >${llTextToHtml(sec.text)}</div>
      </div>
      <div class="ll-section-menu" id="llmenu-${esc(sec.id)}">
        <button onclick="llDuplicateSection('${esc(sec.id)}')">⧉ Dupliser</button>
        <button onclick="llMoveSectionUp('${esc(sec.id)}')">↑ Flytt opp</button>
        <button onclick="llMoveSectionDown('${esc(sec.id)}')">↓ Flytt ned</button>
        <button onclick="llSaveVersion('${esc(sec.id)}')">💾 Lagre versjon</button>
        <button onclick="llShowHistory('${esc(sec.id)}')">⌛ Historikk</button>
        <button class="danger" onclick="llDeleteSection('${esc(sec.id)}')">🗑 Slett seksjon</button>
      </div>
    </div>`;
  }

  // ── Main render ───────────────────────────────────────────────────────────
  function renderLyricLab() {
    const container = document.getElementById('lyricLabContent');
    if (!container) return;

    const beatId = window.currentLyricLabBeatId;
    const beat   = beatId ? getBeat(beatId) : null;

    if (!beat) {
      renderEmptyState(container);
      return;
    }

    const sections = getSections(beat);
    const txt      = allText(beat);
    const words    = countWords(txt);
    const lines    = countLines(txt);
    const repeated = repeatedWords(txt);
    const missing  = missingSections(beat);
    const prog     = writingProgress(beat);
    const status   = beat.lyricLabStatus || 'utkast';
    const dur      = fmtDur(beat.duration);
    const coverEl  = beat.cover
      ? `<img class="ll-cover-img" src="${esc(beat.cover)}" alt="${esc(beat.name)}">`
      : `<div class="ll-cover-ph">🎵</div>`;

    container.innerHTML = `
<div class="ll-wrap">
<div class="ll-header">\n  <button class="ll-back-btn" onclick="llGoBack()">← Tilbake</button>\n  <span class="ll-header-title">✍️ Lyric Lab</span>\n  <span class="ll-header-beat-name">${esc(beat.name)}</span>\n  <span class="ll-status-pill ll-status-${status}">${esc(status)}</span>\n  <button class="ll-change-beat-btn" onclick="llShowBeatPicker()" title="Velg annen låt">⇄ Bytt låt</button>\n</div>
<div class="ll-layout">

  <!-- LEFT: Beat -->
  <div class="ll-left">
    <div class="ll-beat-card">
      <div class="ll-beat-head">
        <div class="ll-cover-wrap">
          ${coverEl}
          <div class="ll-play-overlay" onclick="llWavePlay()">
            <button class="ll-play-overlay-btn" id="llPlayBtn">▶</button>
          </div>
        </div>
        <div class="ll-beat-head-info">
          <div class="ll-beat-title">${esc(beat.name)}</div>
          ${beat.source ? `<div class="ll-beat-source">prod. ${esc(beat.source)}</div>` : ''}
          <div class="ll-chip-row">
            <span class="ll-chip"><span class="ll-chip-k">BPM</span><span class="ll-chip-v">${beat.bpm?esc(String(beat.bpm)):'–'}</span></span>
            <span class="ll-chip"><span class="ll-chip-k">Key</span><span class="ll-chip-v">${beat.key?esc(beat.key):'–'}</span></span>
            <span class="ll-chip"><span class="ll-chip-k">Tid</span><span class="ll-chip-v">${dur}</span></span>
            ${beat.mood?`<span class="ll-chip"><span class="ll-chip-k">Mood</span><span class="ll-chip-v">${esc(beat.mood)}</span></span>`:''}
          </div>
        </div>
      </div>

      <div class="ll-player">
        <div id="llWaveSurfer" class="ll-wave"></div>
        <div class="ll-player-row">
          <button class="ll-play-main" id="llWavePlayBtn" onclick="llWavePlay()">▶</button>
          <span class="ll-time"><span id="llWaveCur">0:00</span><span class="ll-time-sep">/</span><span id="llWaveTot">${dur}</span></span>
          <span class="ll-player-spacer"></span>
          <button class="ll-icon-btn" id="llWaveLoopBtn" onclick="llToggleLoop()" title="Loop av/på">↺</button>
        </div>
        <div class="ll-zoom-row">
          <span class="ll-zoom-ico">🔍</span>
          <input type="range" id="llWaveZoom" class="ll-zoom-slider" min="0" max="100" value="0" oninput="llZoomWave(this.value)">
          <span class="ll-zoom-val" id="llWaveZoomVal">1×</span>
        </div>
        <div class="ll-loop-bar" id="llLoopBar" style="display:none">
          <span class="ll-loop-tag">LOOP</span>
          <span class="ll-loop-times"><b id="llLoopStart">0:00</b><span class="ll-loop-arrow">→</span><b id="llLoopEnd">0:00</b></span>
          <span class="ll-loop-dur" id="llLoopDur">0s</span>
          <button class="ll-loop-clear" onclick="llClearLoop()" title="Fjern loop">✕</button>
        </div>
        <div class="ll-player-hint" id="llPlayerHint">Dra over bølgeformen for å markere et loopområde</div>
      </div>

      <div class="ll-status-block">
        <label class="ll-mini-label">Status</label>
        <select class="ll-status-select" onchange="llSetStatus(this.value)">
          ${STATUS_OPTIONS.map(s=>`<option value="${s}"${s===status?' selected':''}>${s.charAt(0).toUpperCase()+s.slice(1)}</option>`).join('')}
        </select>
      </div>
    </div>

    <div class="ll-rec-card">
      <div class="ll-rec-btns">
        <button class="ll-rec-btn rec" id="llTakeBtn" onclick="llRecordTake()" title="Spill inn vokal over beaten">🎙️ Take</button>
        <button class="ll-rec-btn" id="llMemoBtn" onclick="llRecordMemo()" title="Rask idé-memo">⬤ Memo</button>
      </div>
      <details class="ll-rec-details">
        <summary>Takes <span class="ll-count-badge" id="llTakeCount"></span></summary>
        <div id="llTakeList"></div>
      </details>
      <details class="ll-rec-details">
        <summary>Memoer <span class="ll-count-badge" id="llMemoCount"></span></summary>
        <div id="llMemoList"></div>
      </details>
    </div>
  </div>

  <!-- CENTER: Editor -->
  <div class="ll-center">
    <div class="ll-editor-header">
      <div class="ll-editor-progress">
        <div class="ll-progbar"><div class="ll-progbar-fill" id="llProgFill" style="width:${prog}%"></div></div>
        <span class="ll-prog-pct" id="llProgPct">${prog}%</span>
      </div>
      <div class="ll-editor-actions">
        <button class="ll-tool-btn" onclick="llAnalyzeFlow()" title="Fargekod rimlinjer">🌊 Flow</button>
        <button class="ll-tool-btn" onclick="llInspirasjon()" title="Inspirasjon fra andre sanger">💡 Inspirer</button>
        <button class="ll-tool-btn" onclick="llShare()" title="Generer delbar demo-side">🔗 Del</button>
        <button class="ll-tool-btn primary" onclick="llAddSection()">+ Seksjon</button>
      </div>
    </div>
    <div id="llInspirasjonBox" style="display:none;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07);border-radius:12px;padding:12px 14px;margin-bottom:8px"></div>
    <div id="llFlowLegend" style="display:none;font-size:11px;font-weight:700;color:rgba(255,255,255,.35);padding:4px 0 8px;text-align:right"></div>

    <div id="llSections">
      ${sections.sort((a,b)=>a.order-b.order).map(s=>sectionHTML(s,beat)).join('')}
    </div>

    <div class="ll-statusbar" id="llStatusBar">
      <div class="ll-statusbar-dot"></div>
      <span>Autosave aktiv</span>
      <span id="llLastSaved" style="color:var(--muted)">Ikke lagret ennå</span>
      <span style="margin-left:auto">Ord: <strong id="llStatWords">${words}</strong></span>
      <span>Linjer: <strong id="llStatLines">${lines}</strong></span>
      <span>Est.: <strong id="llStatDur">${estimateDuration(words)}</strong></span>
    </div>
  </div>

  <!-- RIGHT: Analysis -->
  <div class="ll-right">
    <div class="ll-card ll-progress-card">
      <div class="ll-ring-wrap">
        <div class="ll-ring" id="llRing" style="--pct:${prog}"></div>
        <span class="ll-ring-val" id="llRingVal">${prog}%</span>
      </div>
      <div class="ll-progress-meta">
        <div class="ll-pm-row"><span>Ord</span><b id="llRightWords">${words}</b></div>
        <div class="ll-pm-row"><span>Linjer</span><b id="llRightLines">${lines}</b></div>
        <div class="ll-pm-row"><span>Seksjoner</span><b id="llRightSecs">${sections.filter(s=>s.text.trim()).length}</b></div>
        <div class="ll-pm-row"><span>Est. tid</span><b id="llRightDur">${estimateDuration(words)}</b></div>
      </div>
    </div>

    <div class="ll-card ll-stat-card" id="llMissingCard">${missingCardHTML(beat)}</div>

    <div class="ll-card ll-stat-card" id="llRhymeCard">
      <div class="ll-stat-title">Rimbank</div>
      <div class="ll-rhyme-search">
        <input id="llRhymeInput" type="text" placeholder="Skriv et ord..." onkeydown="if(event.key==='Enter')llFindRhymes()">
        <button onclick="llFindRhymes()">Finn</button>
      </div>
      <div id="llRhymeResults" class="ll-rhyme-results">
        <p class="ll-muted-hint">Skriv et ord, eller høyreklikk et ord i teksten</p>
      </div>
    </div>

    <div class="ll-card ll-stat-card">
      <div class="ll-stat-title">Notater</div>
      <textarea id="llNotes" class="ll-notes" placeholder="Idéer, tema, referanser, hva sangen handler om…" oninput="llSaveNotes(this.value)">${esc(beat.lyricNotes||'')}</textarea>
    </div>

    <div class="ll-card ll-stat-card">
      <div class="ll-stat-title">Tags</div>
      <div class="ll-tags" id="llTagList"></div>
      <input id="llTagInput" class="ll-tag-input" placeholder="+ legg til tag (Enter)" onkeydown="if(event.key==='Enter'){llAddTag(this.value);this.value='';}">
    </div>

    ${repeated.length ? `
    <div class="ll-card ll-stat-card">
      <div class="ll-stat-title">Gjentagende ord</div>
      <div class="ll-repeated-list">
        ${repeated.map(([w,n])=>`<span class="ll-word-chip">${esc(w)} ×${n}</span>`).join('')}
      </div>
    </div>` : ''}

    <div class="ll-card ll-stat-card">
      <div class="ll-stat-title">Fargemark</div>
      <div class="ll-color-row">
        <button class="ll-color-dot" style="background:#f59e0b" onmousedown="event.preventDefault()" onclick="llApplyColorActive('#f59e0b')" title="Gul"></button>
        <button class="ll-color-dot" style="background:#10b981" onmousedown="event.preventDefault()" onclick="llApplyColorActive('#10b981')" title="Grønn"></button>
        <button class="ll-color-dot" style="background:#3b82f6" onmousedown="event.preventDefault()" onclick="llApplyColorActive('#3b82f6')" title="Blå"></button>
        <button class="ll-color-dot" style="background:#ec4899" onmousedown="event.preventDefault()" onclick="llApplyColorActive('#ec4899')" title="Rosa"></button>
        <button class="ll-color-dot" style="background:#ef4444" onmousedown="event.preventDefault()" onclick="llApplyColorActive('#ef4444')" title="Rød"></button>
        <button class="ll-color-dot" style="background:#a855f7" onmousedown="event.preventDefault()" onclick="llApplyColorActive('#a855f7')" title="Lilla"></button>
        <button class="ll-color-dot ll-color-clear" onmousedown="event.preventDefault()" onclick="llApplyColorActive(null)" title="Fjern farge">✕</button>
      </div>
      <div id="llColorHint" class="ll-color-hint">Marker tekst i editoren, klikk så farge</div>
    </div>
  </div>

</div>
</div><!-- /.ll-wrap -->
`;
    _lastSaved = null;
    setTimeout(()=>{ renderMemoList(); renderTakeList(); renderTags(beat); initWaveSurfer(beat); updateRightPanel(beat); }, 100);
    // Focus first empty textarea
    setTimeout(() => {
      const emptyTa = Array.from(container.querySelectorAll('.ll-textarea')).find(el=>!(el.value||el.textContent||'').trim());
      if (emptyTa) emptyTa.focus();
    }, 100);
  }

  // ── Empty state ───────────────────────────────────────────────────────────
  function renderEmptyState(container) {
    const beats = (getState()?.beats||[]).filter(b=>!b.archived);
    const last  = beats.sort((a,b)=>(b.createdAt||0)-(a.createdAt||0))[0];
    container.innerHTML = `
<div class="ll-empty">
  <div class="ll-empty-icon">✍️</div>
  <h2>Velg en låt å skrive på</h2>
  <p>Lyric Lab samler beat, tekst og skrivehjelp på én skjerm. Velg et beat for å komme i gang.</p>
  <div class="ll-empty-btns">
    <button class="primary-btn" onclick="llPickBeat()">🎵 Velg fra beats</button>
    ${last ? `<button class="ghost-btn" onclick="openInLyricLab('${esc(last.id)}')">↩ Åpne siste: ${esc(last.name)}</button>` : ''}
    <button class="ghost-btn" onclick="llCreateNewBeat()">+ Opprett ny låt</button>
  </div>
</div>`;
  }

  // ── Section actions ───────────────────────────────────────────────────────
  // Preserve selection across button clicks
  window._llSavedRange = null;
  window._llSavedEditor = null;

  // Track selection using selectionchange (most reliable cross-browser)
  document.addEventListener('selectionchange', () => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;
    const anchor = sel.anchorNode;
    if (!anchor) return;
    const node = anchor.nodeType === 3 ? anchor.parentElement : anchor;
    const editor = node?.closest?.('.ll-highlight-editor');
    if (editor) {
      window._llSavedRange  = sel.getRangeAt(0).cloneRange();
      window._llSavedEditor = editor;
      const hint = document.getElementById('llColorHint');
      if (hint) {
        const secId = editor.dataset.sectionId;
        const beat  = getBeat(window.currentLyricLabBeatId);
        const sec   = (getSections(beat||{})||[]).find(s=>s.id===secId);
        hint.textContent = sec ? '✓ ' + sec.title + ' — klikk farge' : '✓ Klikk farge';
        hint.style.color = '#f4a443';
      }
    }
  });

  window.llApplyColorActive = function(color) {
    const editor = window._llSavedEditor;
    const range  = window._llSavedRange;

    if (!editor || !range) {
      if(typeof showToast==='function') showToast('Marker tekst i en seksjon f\u00f8rst');
      return;
    }

    try {
      if (color) {
        _unwrapMarks(range);
        const freshRange = window._llSavedRange;
        if (!freshRange || freshRange.collapsed) { if(typeof showToast==='function') showToast('Marker tekst p\u00e5 nytt'); return; }
        const mark = document.createElement('mark');
        mark.style.cssText = 'background:' + color + ';border-radius:3px;padding:0 2px;color:#000;font-weight:600;';
        try { freshRange.surroundContents(mark); }
        catch(e) { const frag=freshRange.extractContents(); mark.appendChild(frag); freshRange.insertNode(mark); }
      } else {
        _unwrapMarks(range);
      }
      const secId = editor.dataset.sectionId;
      if (secId) llHighlightInput(editor, secId);
      window._llSavedRange  = null;
      window._llSavedEditor = null;
      const hint = document.getElementById('llColorHint');
      if (hint) { hint.textContent = 'Marker tekst i editoren, klikk s\u00e5 farge'; hint.style.color = ''; }
      if(typeof showToast==='function') showToast(color ? '\u2713 Farge brukt' : '\u2713 Farge fjernet');
    } catch(e) {
      console.warn('[LyricLab] Color apply error:', e);
      if(typeof showToast==='function') showToast('Feil: ' + e.message);
    }
  };

  function _unwrapMarks(range) {
    if (!range) return;
    const editor = window._llSavedEditor;
    if (!editor) return;
    // Find all marks within the range and replace with their contents
    const marks = Array.from(editor.querySelectorAll('mark'));
    marks.forEach(mark => {
      const mRange = document.createRange();
      mRange.selectNode(mark);
      // Check if mark overlaps with range
      if (range.compareBoundaryPoints(Range.END_TO_START, mRange) < 0 &&
          range.compareBoundaryPoints(Range.START_TO_END, mRange) > 0) {
        const parent = mark.parentNode;
        while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
        parent.removeChild(mark);
        parent.normalize();
      }
    });
    // Update saved range after DOM change
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      window._llSavedRange = sel.getRangeAt(0).cloneRange();
    }
  }

  window.llApplyColor = function(secId, color) {
    // Legacy — used by contextmenu / popover
    const editor = document.getElementById('lltxt-' + secId);
    if (!editor) return;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
      if(typeof showToast==='function') showToast('Marker tekst først');
      return;
    }
    if (color) {
      document.execCommand('backColor', false, color);
    } else {
      document.execCommand('removeFormat');
    }
    llHighlightInput(editor, secId);
  };

  window.llToggleSectionDone = function(id) {
    const beat = getBeat(window.currentLyricLabBeatId); if(!beat) return;
    const sec = getSections(beat).find(s=>s.id===id); if(!sec) return;
    sec.done = !sec.done;
    // Update button
    const btn = document.querySelector(`#llsec-${id} .ll-section-done-btn, #llins-sec-${id} .ll-section-done-btn`);
    if(btn){ btn.classList.toggle('done', sec.done); btn.textContent = sec.done ? '✓' : '○'; btn.title = sec.done ? 'Ferdig' : 'Merk som ferdig'; }
    saveSections(beat);
    // Update right panel missing sections
    updateRightPanel(beat);
  };
  window.llToggleSection = function(id) {
    const beat = getBeat(window.currentLyricLabBeatId);
    if (!beat) return;
    const sec = getSections(beat).find(s=>s.id===id);
    if (!sec) return;
    sec.collapsed = !sec.collapsed;
    const el = document.getElementById(`llsec-${id}`);
    if (el) {
      el.classList.toggle('collapsed', sec.collapsed);
      const toggle = el.querySelector('.ll-section-toggle');
      if (toggle) toggle.textContent = sec.collapsed ? '▸' : '▾';
    }
    saveSections(beat);
  };

  window.llRenameSection = function(id, title) {
    const beat = getBeat(window.currentLyricLabBeatId);
    const sec  = getSections(beat||{}).find(s=>s.id===id);
    if (sec) { sec.title = title; saveSections(beat); }
  };

  window.llToggleSectionMenu = function(id) {
    document.querySelectorAll('.ll-section-menu.open').forEach(m=>{ if(m.id!==`llmenu-${id}`) m.classList.remove('open'); });
    document.getElementById(`llmenu-${id}`)?.classList.toggle('open');
  };
  // Only add the close-listener once
  if (!window._llMenuListenerAttached) {
    window._llMenuListenerAttached = true;
    document.addEventListener('click', e => {
      if (!e.target.closest('.ll-section-menu-btn') && !e.target.closest('.ll-section-menu'))
        document.querySelectorAll('.ll-section-menu.open').forEach(m=>m.classList.remove('open'));
    });
  }

  window.llHighlightInput = function(div, id) {
    const beat = getBeat(window.currentLyricLabBeatId);
    const sec  = getSections(beat||{}).find(s=>s.id===id);
    if (!sec) return;
    // contenteditable: read innerHTML and convert to storage format
    sec.text = llHtmlToText(div.innerHTML);
    // Update line numbers from stored text
    const nums = document.getElementById('llnums-' + id);
    if (nums) { nums.style.whiteSpace='pre'; nums.textContent = sec.text.split('\n').map((_,i)=>i+1).join('\n'); }
    const cnt = document.getElementById('llsec-' + id)?.querySelector('.ll-section-line-count');
    const l = countLines(sec.text);
    if (cnt) cnt.textContent = `${l} ${l===1?'linje':'linjer'}`;
    clearTimeout(_saveTimer);
    scheduleAutoSave(beat, true);
  };
  window.llSectionInput = window.llHighlightInput;

  window.llAddSection = function() {
    const beat = getBeat(window.currentLyricLabBeatId);
    if (!beat) return;
    const secs  = getSections(beat);
    const newSec = { id: uid(), type: 'custom', title: 'Ny seksjon', text: '', collapsed: false, order: secs.length };
    secs.push(newSec);
    saveSections(beat);
    const container = document.getElementById('llSections');
    if (container) {
      container.insertAdjacentHTML('beforeend', sectionHTML(newSec, beat));
      const ta = document.getElementById(`lltxt-${newSec.id}`);
      if (ta) ta.focus();
    }
  };

  window.llDeleteSection = function(id) {
    if (!confirm('Slette seksjonen og teksten?')) return;
    const beat = getBeat(window.currentLyricLabBeatId);
    if (!beat) return;
    beat.lyricSections = getSections(beat).filter(s=>s.id!==id);
    saveSections(beat);
    document.getElementById(`llsec-${id}`)?.remove();
  };

  window.llDuplicateSection = function(id) {
    const beat = getBeat(window.currentLyricLabBeatId);
    if (!beat) return;
    const secs = getSections(beat);
    const src  = secs.find(s=>s.id===id);
    if (!src) return;
    const copy = {...src, id: uid(), title: src.title + ' (kopi)', order: secs.length};
    secs.push(copy);
    saveSections(beat);
    const container = document.getElementById('llSections');
    if (container) container.insertAdjacentHTML('beforeend', sectionHTML(copy, beat));
    document.getElementById(`llmenu-${id}`)?.classList.remove('open');
  };

  window.llMoveSectionUp = function(id) {
    const beat = getBeat(window.currentLyricLabBeatId);
    if (!beat) return;
    const secs = getSections(beat).sort((a,b)=>a.order-b.order);
    const idx  = secs.findIndex(s=>s.id===id);
    if (idx <= 0) return;
    [secs[idx].order, secs[idx-1].order] = [secs[idx-1].order, secs[idx].order];
    saveSections(beat);
    renderLyricLab();
    document.getElementById(`llmenu-${id}`)?.classList.remove('open');
  };

  window.llMoveSectionDown = function(id) {
    const beat = getBeat(window.currentLyricLabBeatId);
    if (!beat) return;
    const secs = getSections(beat).sort((a,b)=>a.order-b.order);
    const idx  = secs.findIndex(s=>s.id===id);
    if (idx >= secs.length-1) return;
    [secs[idx].order, secs[idx+1].order] = [secs[idx+1].order, secs[idx].order];
    saveSections(beat);
    renderLyricLab();
  };

  // ── Beat actions ──────────────────────────────────────────────────────────
  window.llGoBack = function() {
    const btn = document.querySelector('.tab-btn[data-tab="mixtapes"]');
    if (btn) btn.click();
  };
  window.llPlayBeat = function() {
    const id = window.currentLyricLabBeatId;
    if (!id) return;
    const wv = document.getElementById('llWaveform');
    if (typeof playSingleBeat === 'function') {
      playSingleBeat(id);
      if (wv) { wv.classList.remove('paused'); setTimeout(()=>wv.classList.add('paused'), 30000); }
    } else if (typeof showToast === 'function') {
      showToast('Lydavspilling ikke tilgjengelig ennå');
    }
  };

  window.llLoopHook = function() {
    if (typeof showToast === 'function') showToast('Loop hook kommer snart');
    else console.log('[LyricLab] Loop hook — not implemented yet');
  };

  // ── Voice memo + take recorder ───────────────────────────────────────────
  let _memoRecorder = null;
  let _memoChunks   = [];
  let _memoInterval = null;
  let _takeRecorder = null;
  let _takeChunks   = [];
  let _takeSecs     = 0;
  let _takeInterval = null;

  window.llRecordMemo = function() {
    if (_memoRecorder && _memoRecorder.state === 'recording') {
      _memoRecorder.stop();
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      if(typeof showToast==='function') showToast('Mikrofon ikke tilgjengelig i denne nettleseren');
      return;
    }
    navigator.mediaDevices.getUserMedia({ audio: true })
      .then(stream => {
        _memoChunks = [];
        const mime = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/ogg';
        _memoRecorder = new MediaRecorder(stream, { mimeType: mime });
        _memoRecorder.ondataavailable = e => { if(e.data.size>0) _memoChunks.push(e.data); };
        _memoRecorder.onstart = () => {
          const btn = document.getElementById('llMemoBtn');
          if(btn){ btn.textContent='⏹ Stopp memo'; btn.style.background='rgba(251,113,133,.2)'; btn.style.borderColor='rgba(251,113,133,.4)'; }
          let secs = 0;
          _memoInterval = setInterval(()=>{ secs++; const b=document.getElementById('llMemoBtn'); if(b) b.textContent=`⏹ Stopp (${secs}s)`; if(secs>=60) _memoRecorder?.stop(); }, 1000);
          if(typeof showToast==='function') showToast('⬤ Tar opp memo... (maks 60s)');
        };
        _memoRecorder.onstop = () => {
          clearInterval(_memoInterval);
          stream.getTracks().forEach(t=>t.stop());
          const btn = document.getElementById('llMemoBtn');
          if(btn){ btn.textContent='⬤ Ta opp memo'; btn.style.background=''; btn.style.borderColor=''; }
          const blob = new Blob(_memoChunks, { type: mime });
          const reader = new FileReader();
          reader.onload = e => {
            const beat = getBeat(window.currentLyricLabBeatId);
            if(!beat) return;
            if(!beat.memos) beat.memos = [];
            beat.memos.push({ id: uid(), url: e.target.result, ts: Date.now(), mime });
            if(typeof saveState==='function') saveState();
            renderMemoList();
            if(typeof showToast==='function') showToast('✓ Memo lagret');
          };
          reader.readAsDataURL(blob);
        };
        _memoRecorder.start(500);
      })
      .catch(err => {
        console.error('[LyricLab] Mic error:', err);
        if(typeof showToast==='function') showToast('Klarte ikke åpne mikrofon: ' + err.message);
      });
  };

  function renderMemoList() {
    const beat = getBeat(window.currentLyricLabBeatId);
    const el   = document.getElementById('llMemoList');
    if(!el || !beat) return;
    const memos = beat.memos || [];
    const badge = document.getElementById('llMemoCount');
    if (badge) badge.textContent = memos.length || '';
    el.innerHTML = memos.length
      ? memos.map((m,i) => `
          <div class="ll-memo-row">
            <audio controls src="${m.url}" style="height:28px;flex:1;min-width:0"></audio>
            <span class="ll-memo-ts">${new Date(m.ts).toLocaleTimeString('no-NO',{hour:'2-digit',minute:'2-digit'})}</span>
            <button class="ll-memo-del" onclick="llDeleteMemo('${esc(beat.id)}',${i})" title="Slett">✕</button>
          </div>`).join('')
      : '<p style="font-size:11px;color:var(--muted);margin:0">Ingen memoer ennå</p>';
  }

  window.llDeleteMemo = function(beatId, idx) {
    const beat = getBeat(beatId); if(!beat||!beat.memos) return;
    beat.memos.splice(idx, 1);
    if(typeof saveState==='function') saveState();
    renderMemoList();
  };

  window.llSetStatus = function(val) {
    const beat = getBeat(window.currentLyricLabBeatId);
    if (!beat) return;
    beat.lyricLabStatus = val;
    const pill = document.querySelector('.ll-status-pill');
    if (pill) { pill.className = 'll-status-pill ll-status-' + val; pill.textContent = val; }
    if (typeof saveState === 'function') saveState();
  };

  // ── Notater (debounced autosave) ──────────────────────────────────────────
  let _notesTimer = null;
  window.llSaveNotes = function(val) {
    const beat = getBeat(window.currentLyricLabBeatId);
    if (!beat) return;
    beat.lyricNotes = val;
    clearTimeout(_notesTimer);
    _notesTimer = setTimeout(() => { if (typeof saveState === 'function') saveState(); }, 700);
  };

  // ── Tags ──────────────────────────────────────────────────────────────────
  window.llAddTag = function(val) {
    const beat = getBeat(window.currentLyricLabBeatId);
    if (!beat) return;
    const tag = (val||'').trim().replace(/^#/,'');
    if (!tag) return;
    if (!Array.isArray(beat.lyricTags)) beat.lyricTags = [];
    if (beat.lyricTags.some(t => t.toLowerCase() === tag.toLowerCase())) return;
    beat.lyricTags.push(tag);
    renderTags(beat);
    if (typeof saveState === 'function') saveState();
  };
  window.llRemoveTag = function(i) {
    const beat = getBeat(window.currentLyricLabBeatId);
    if (!beat || !Array.isArray(beat.lyricTags)) return;
    beat.lyricTags.splice(i, 1);
    renderTags(beat);
    if (typeof saveState === 'function') saveState();
  };

  // ── Smart "Mangler" → add/jump to that section ────────────────────────────
  window.llAddMissing = function(type) {
    const beat = getBeat(window.currentLyricLabBeatId);
    if (!beat) return;
    const secs = getSections(beat);
    let target = secs.find(s => s.type === type && !s.text.trim());
    let created = false;
    if (!target) {
      target = { id: uid(), type, title: TYPE_LABELS[type]||type, text: '', collapsed: false, order: secs.length };
      secs.push(target);
      saveSections(beat);
      renderLyricLab();
      created = true;
    }
    setTimeout(() => {
      const ta = document.getElementById(`lltxt-${target.id}`);
      if (ta) { ta.scrollIntoView({ behavior:'smooth', block:'center' }); ta.focus(); }
      refreshMissing(beat);
    }, created ? 160 : 60);
  };

  // ── Empty state actions ────────────────────────────────────────────────────
  window.llPickBeat = function() {
    llShowBeatPicker();
  };

  window.llShowBeatPicker = function() {
    // Remove existing picker
    document.getElementById('llBeatPicker')?.remove();

    const st = getState();
    if (!st) return;

    const allBeats = (st.beats || []).filter(b => !b.archived);
    const mixtapes = (st.mixtapes || []).filter(m => !m.archived);
    const albums   = (st.albums   || []).filter(a => !a.archived);

    function beatsByCollection(colId, colType) {
      const col = colType === 'mixtape'
        ? mixtapes.find(m => m.id === colId)
        : albums.find(a => a.id === colId);
      return (col?.beatIds || [])
        .map(id => allBeats.find(b => b.id === id))
        .filter(Boolean);
    }

    function renderList(beats, emptyMsg) {
      if (!beats.length) return `<div class="ll-picker-empty">${emptyMsg}</div>`;
      return beats.map(b => `
        <div class="ll-picker-row" onclick="openInLyricLab('${esc(b.id)}');document.getElementById('llBeatPicker').remove()">
          ${b.cover ? `<img class="ll-picker-thumb" src="${esc(b.cover)}" alt="">` : '<div class="ll-picker-thumb ll-picker-ph">🎵</div>'}
          <div class="ll-picker-info">
            <div class="ll-picker-name">${esc(b.name)}</div>
            <div class="ll-picker-meta">${b.lyricLabStatus || 'utkast'}${b.bpm ? ' · ' + b.bpm + ' bpm' : ''}</div>
          </div>
          ${b.favorite ? '<span style="color:#f4a443;font-size:14px">★</span>' : ''}
        </div>`).join('');
    }

    const overlay = document.createElement('div');
    overlay.id = 'llBeatPicker';
    overlay.className = 'll-picker-overlay';
    overlay.innerHTML = `
      <div class="ll-picker-modal">
        <div class="ll-picker-header">
          <span style="font-size:16px;font-weight:900;letter-spacing:-.03em">Velg låt for Lyric Lab</span>
          <button onclick="document.getElementById('llBeatPicker').remove()" class="ll-picker-close">✕</button>
        </div>
        <input id="llPickerSearch" type="text" placeholder="Søk etter låt..." class="ll-picker-search"
          oninput="llFilterPicker(this.value)">
        <div class="ll-picker-tabs">
          <button class="ll-picker-tab active" onclick="llPickerTab(this,'all')">Alle beats</button>
          ${mixtapes.map(m => `<button class="ll-picker-tab" onclick="llPickerTab(this,'mt-${esc(m.id)}')">${esc(m.name)}</button>`).join('')}
          ${albums.map(a => `<button class="ll-picker-tab" onclick="llPickerTab(this,'al-${esc(a.id)}')">${esc(a.name)}</button>`).join('')}
        </div>
        <div class="ll-picker-list" id="llPickerList">
          ${renderList(allBeats, 'Ingen beats ennå')}
        </div>
      </div>`;
    document.body.appendChild(overlay);

    // Close on backdrop click
    overlay.addEventListener('click', e => { if(e.target === overlay) overlay.remove(); });

    // Store data for filtering
    overlay._allBeats = allBeats;
    overlay._mixtapes = mixtapes;
    overlay._albums   = albums;
    overlay._currentTab = 'all';

    document.getElementById('llPickerSearch')?.focus();
  };

  window.llPickerTab = function(btn, tabId) {
    document.querySelectorAll('.ll-picker-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const overlay = document.getElementById('llBeatPicker');
    if (!overlay) return;
    overlay._currentTab = tabId;
    llFilterPicker(document.getElementById('llPickerSearch')?.value || '');
  };

  window.llFilterPicker = function(query) {
    const overlay = document.getElementById('llBeatPicker');
    if (!overlay) return;
    const { _allBeats: all, _mixtapes: mts, _albums: albs, _currentTab: tab } = overlay;
    const q = query.toLowerCase().trim();

    let beats = all;
    if (tab.startsWith('mt-')) {
      const mt = mts.find(m => m.id === tab.slice(3));
      beats = (mt?.beatIds || []).map(id => all.find(b => b.id === id)).filter(Boolean);
    } else if (tab.startsWith('al-')) {
      const al = albs.find(a => a.id === tab.slice(3));
      beats = (al?.beatIds || []).map(id => all.find(b => b.id === id)).filter(Boolean);
    }

    if (q) beats = beats.filter(b => b.name.toLowerCase().includes(q));

    const list = document.getElementById('llPickerList');
    if (!list) return;
    list.innerHTML = beats.length
      ? beats.map(b => `
          <div class="ll-picker-row" onclick="openInLyricLab('${esc(b.id)}');document.getElementById('llBeatPicker')?.remove()">
            ${b.cover ? `<img class="ll-picker-thumb" src="${esc(b.cover)}" alt="">` : '<div class="ll-picker-thumb ll-picker-ph">🎵</div>'}
            <div class="ll-picker-info">
              <div class="ll-picker-name">${esc(b.name)}</div>
              <div class="ll-picker-meta">${b.lyricLabStatus || 'utkast'}${b.bpm ? ' · ' + b.bpm + ' bpm' : ''}</div>
            </div>
            ${b.favorite ? '<span style="color:#f4a443;font-size:14px">★</span>' : ''}
          </div>`).join('')
      : `<div class="ll-picker-empty">Ingen treff for "${esc(query)}"</div>`;
  };

  window.llCreateNewBeat = function() {
    if (typeof showToast === 'function') showToast('Opprett en sang i Mixtapes eller Albumer først');
  };

  // ── Smart "Mangler"-panel ─────────────────────────────────────────────────
  function missingCardHTML(beat) {
    const missing = missingSections(beat);
    if (!missing.length) {
      return `<div class="ll-stat-title">Struktur</div>
        <div class="ll-struct-ok">✓ Alle hoveddeler er med</div>`;
    }
    return `<div class="ll-stat-title">Mangler</div>
      <div class="ll-missing-list">
        ${missing.map(t=>`<button class="ll-missing-item" onclick="llAddMissing('${t}')">
          <span class="ll-missing-dot ll-type-${t}"></span>
          <span class="ll-missing-name">${esc(TYPE_LABELS[t]||t)}</span>
          <span class="ll-missing-add">+ legg til</span>
        </button>`).join('')}
      </div>`;
  }
  function refreshMissing(beat) {
    const card = document.getElementById('llMissingCard');
    if (card) card.innerHTML = missingCardHTML(beat);
  }

  // ── Tags ──────────────────────────────────────────────────────────────────
  function renderTags(beat) {
    const wrap = document.getElementById('llTagList');
    if (!wrap) return;
    const tags = beat.lyricTags || [];
    wrap.innerHTML = tags.length
      ? tags.map((t,i)=>`<span class="ll-tag">${esc(t)}<button class="ll-tag-x" onclick="llRemoveTag(${i})" title="Fjern">✕</button></span>`).join('')
      : `<span class="ll-muted-hint">Ingen tags ennå</span>`;
  }

  // ── Update right panel without full re-render ─────────────────────────────
  function updateRightPanel(beat) {
    const txt      = allText(beat);
    const w        = countWords(txt);
    const l        = countLines(txt);
    const secs     = (getSections(beat)||[]).filter(s=>s.text.trim()).length;
    const prog     = writingProgress(beat);
    const setTxt   = (id,v) => { const el=document.getElementById(id); if(el) el.textContent=v; };
    setTxt('llRightWords', w);
    setTxt('llRightLines', l);
    setTxt('llRightSecs',  secs);
    setTxt('llRightDur',   estimateDuration(w));
    setTxt('llStatWords',  w);
    setTxt('llStatLines',  l);
    setTxt('llStatDur',    estimateDuration(w));
    // progress ring + center bar
    const ring = document.getElementById('llRing'); if (ring) ring.style.setProperty('--pct', prog);
    setTxt('llRingVal', prog + '%');
    setTxt('llProgPct', prog + '%');
    const fill = document.getElementById('llProgFill'); if (fill) fill.style.width = prog + '%';
    refreshMissing(beat);
  }


  // ── Inline section editor (used inside album/mixtape beat cards) ──────────
  function renderInlineSections(beatId) {
    const beat = getBeat(beatId);
    if (!beat) return '<p style="color:var(--muted);font-size:12px">Beat ikke funnet</p>';
    const sections = getSections(beat);
    return `<div class="ll-inline-editor" data-beat-id="${esc(beatId)}">
      <div class="ll-inline-sections" id="llins-${esc(beatId)}">
        ${sections.sort((a,b)=>a.order-b.order).map(s => inlineSectionHTML(s, beatId)).join('')}
      </div>
      <div style="display:flex;gap:8px;margin-top:8px;align-items:center">
        <button class="ghost-btn" style="font-size:11px;padding:5px 10px" onclick="llInlineAddSection('${esc(beatId)}')">+ Seksjon</button>
        <button class="ghost-btn" style="font-size:11px;padding:5px 10px" onclick="openInLyricLab('${esc(beatId)}')">✍️ Åpne i Lyric Lab</button>
      </div>
    </div>`;
  }

  function inlineSectionHTML(sec, beatId) {
    const typeClass = `ll-type-${sec.type}`;
    const lineCount = countLines(sec.text);
    return `<div class="ll-section${sec.collapsed?' collapsed':''}" id="llins-sec-${esc(beatId)}-${esc(sec.id)}" style="margin-bottom:8px">
      <div class="ll-section-header" onclick="llInlineToggle('${esc(beatId)}','${esc(sec.id)}')">
        <span class="ll-section-type ${typeClass}">${esc(TYPE_LABELS[sec.type]||sec.type)}</span>
        <input class="ll-section-title-input" value="${esc(sec.title)}" onclick="event.stopPropagation()"
          onchange="llInlineRename('${esc(beatId)}','${esc(sec.id)}',this.value)">
        <span class="ll-section-line-count">${lineCount} ${lineCount===1?'linje':'linjer'}</span>
        <button class="ll-section-toggle">${sec.collapsed?'▸':'▾'}</button>
      </div>
      <div class="ll-section-body">
        <div class="ll-line-numbers" id="llins-nums-${esc(beatId)}-${esc(sec.id)}">${sec.text.split('\n').map((_,i)=>i+1).join('\n')}</div>
        <textarea class="ll-textarea" id="llins-txt-${esc(beatId)}-${esc(sec.id)}"
          placeholder="Skriv ${esc(sec.title.toLowerCase())} her..."
          oninput="llInlineInput(this,'${esc(beatId)}','${esc(sec.id)}')"
          rows="${Math.max(4, sec.text.split('\n').length + 2)}"
        >${esc(sec.text)}</textarea>
      </div>
    </div>`;
  }

  // Inline section actions
  window.llInlineToggle = function(beatId, secId) {
    const beat = getBeat(beatId); if(!beat) return;
    const sec = getSections(beat).find(s=>s.id===secId); if(!sec) return;
    sec.collapsed = !sec.collapsed;
    const el = document.getElementById(`llins-sec-${beatId}-${secId}`);
    if(el){ el.classList.toggle('collapsed', sec.collapsed); el.querySelector('.ll-section-toggle').textContent = sec.collapsed?'▸':'▾'; }
    saveSections(beat);
  };
  window.llInlineRename = function(beatId, secId, title) {
    const beat = getBeat(beatId); if(!beat) return;
    const sec = getSections(beat).find(s=>s.id===secId); if(!sec) return;
    sec.title = title; saveSections(beat);
  };
  window.llInlineInput = function(ta, beatId, secId) {
    const beat = getBeat(beatId); if(!beat) return;
    const sec = getSections(beat).find(s=>s.id===secId); if(!sec) return;
    sec.text = ta.value;
    const nums = document.getElementById(`llins-nums-${beatId}-${secId}`);
    if(nums) nums.textContent = ta.value.split('\n').map((_,i)=>i+1).join('\n');
    const cnt = document.getElementById(`llins-sec-${beatId}-${secId}`)?.querySelector('.ll-section-line-count');
    const l = countLines(ta.value);
    if(cnt) cnt.textContent = `${l} ${l===1?'linje':'linjer'}`;
    clearTimeout(_saveTimer);
    scheduleAutoSave(beat, false);
  };
  window.llInlineAddSection = function(beatId) {
    const beat = getBeat(beatId); if(!beat) return;
    const secs = getSections(beat);
    const newSec = {id: uid(), type:'custom', title:'Ny seksjon', text:'', collapsed:false, order:secs.length};
    secs.push(newSec);
    saveSections(beat);
    const container = document.getElementById(`llins-${beatId}`);
    if(container) container.insertAdjacentHTML('beforeend', inlineSectionHTML(newSec, beatId));
  };
  window.llInlineSave = function(beatId, text) {
    const beat = getBeat(beatId); if(!beat) return;
    const secs = getSections(beat);
    if(secs[0]) secs[0].text = text;
    clearTimeout(_saveTimer);
    scheduleAutoSave(beat, false);
  };

  // ── Record lyric take over beat ──────────────────────────────────────────
  window.llRecordTake = function() {
    if (_takeRecorder && _takeRecorder.state === 'recording') {
      _takeRecorder.stop();
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      if(typeof showToast==='function') showToast('Mikrofon ikke tilgjengelig');
      return;
    }

    const beat = getBeat(window.currentLyricLabBeatId);
    if (!beat) { if(typeof showToast==='function') showToast('Velg en sang først'); return; }

    // Countdown UI
    const btn = document.getElementById('llTakeBtn');
    const overlay = document.getElementById('llTakeOverlay');
    let count = 3;

    function startCountdown() {
      if(overlay) { overlay.style.display='flex'; overlay.querySelector('.ll-take-count').textContent = count; }
      if(btn) btn.textContent = `🎙️ Starter om ${count}s...`;
      const cd = setInterval(() => {
        count--;
        if(overlay) overlay.querySelector('.ll-take-count').textContent = count || 'REC';
        if(btn) btn.textContent = count > 0 ? `🎙️ Starter om ${count}s...` : '⏹ Stopp innspilling';
        if (count <= 0) {
          clearInterval(cd);
          startRecording();
        }
      }, 1000);
    }

    function startRecording() {
      // Don't use playSingleBeat — the blob Audio element handles playback
      const beatUrl = beat.audio_url || beat.url || null;

      function doRecord(blobUrl) {
        const localAudio = blobUrl ? new Audio(blobUrl) : null;

        navigator.mediaDevices.getUserMedia({ audio: true, video: false })
          .then(micStream => {
            _takeChunks = [];
            _takeSecs   = 0;
            const mime  = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/ogg';
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const dest     = audioCtx.createMediaStreamDestination();

            // Mic → mixer (with gain boost)
            const micSrc  = audioCtx.createMediaStreamSource(micStream);
            const micGain = audioCtx.createGain();
            micGain.gain.value = 1.5;
            micSrc.connect(micGain);
            micGain.connect(dest);

            // Beat blob → mixer via captureStream + also to speakers
            if (localAudio) {
              localAudio.volume = 1.0; // full volume
              localAudio.play().catch(()=>{});
              try {
                const cs = localAudio.captureStream?.() || localAudio.mozCaptureStream?.();
                if (cs) {
                  const beatSrc  = audioCtx.createMediaStreamSource(cs);
                  const beatGain = audioCtx.createGain();
                  beatGain.gain.value = 1.0;
                  beatSrc.connect(beatGain);
                  beatGain.connect(dest);                  // → recording
                  beatGain.connect(audioCtx.destination); // → speakers
                }
              } catch(e) { console.warn('[LyricLab] beat mix:', e.message); }
            }

            _takeRecorder = new MediaRecorder(dest.stream, { mimeType: mime });
            _takeRecorder.ondataavailable = e => { if(e.data.size>0) _takeChunks.push(e.data); };

            _takeRecorder.onstart = () => {
              if(overlay) {
                overlay.querySelector('.ll-take-count').textContent = '⬤';
                overlay.querySelector('.ll-take-label').textContent = `Spiller inn over ${esc(beat.name)}`;
              }
              _takeInterval = setInterval(() => {
                _takeSecs++;
                const m = Math.floor(_takeSecs/60), s = String(_takeSecs%60).padStart(2,'0');
                const timer = document.getElementById('llTakeTimer');
                if(timer) timer.textContent = `${m}:${s}`;
              }, 1000);
              if(typeof showToast==='function') showToast('🎙️ Innspilling startet');
            };

            _takeRecorder.onstop = () => {
              clearInterval(_takeInterval);
              micStream.getTracks().forEach(t=>t.stop());
              audioCtx.close().catch(()=>{});
              if(localAudio) { localAudio.pause(); }
              if(blobUrl) URL.revokeObjectURL(blobUrl);
              if(overlay) overlay.style.display='none';
              if(btn){ btn.textContent='🎙️ Spill inn over beat'; btn.style.background=''; }
              const blob2 = new Blob(_takeChunks, { type: mime });
              const reader = new FileReader();
              reader.onload = ev => {
                if(!beat.takes) beat.takes = [];
                beat.takes.push({ id: uid(), url: ev.target.result, ts: Date.now(), dur: _takeSecs, mime });
                if(typeof saveState==='function') saveState();
                renderTakeList();
                if(typeof showToast==='function') showToast(`✓ Take lagret (${_takeSecs}s)`);
              };
              reader.readAsDataURL(blob2);
            };

            _takeRecorder.start(500);
          })
          .catch(err => {
            if(overlay) overlay.style.display='none';
            if(btn) btn.textContent='🎙️ Spill inn over beat';
            if(typeof showToast==='function') showToast('Mikrofon feil: ' + err.message);
          });
      } // end doRecord

      if (beatUrl) {
        fetch(beatUrl)
          .then(r => r.blob())
          .then(b => doRecord(URL.createObjectURL(b)))
          .catch(() => doRecord(null));
      } else {
        doRecord(null);
      }
    }

    startCountdown();
  };
  function renderTakeList() {
    const beat = getBeat(window.currentLyricLabBeatId);
    const el   = document.getElementById('llTakeList');
    if(!el || !beat) return;
    const takes = beat.takes || [];
    const badge = document.getElementById('llTakeCount');
    if (badge) badge.textContent = takes.length || '';
    el.innerHTML = takes.length
      ? takes.map((t,i) => {
          const m = Math.floor((t.dur||0)/60), s = String((t.dur||0)%60).padStart(2,'0');
          return `<div class="ll-memo-row">
            <audio controls src="${t.url}" style="height:28px;flex:1;min-width:0"></audio>
            <span class="ll-memo-ts">${m}:${s}</span>
            <button class="ll-memo-del" onclick="llDeleteTake('${esc(beat.id)}',${i})" title="Slett">✕</button>
          </div>`;
        }).join('')
      : '<p style="font-size:11px;color:var(--muted);margin:0">Ingen takes ennå</p>';
  }
  window.llDeleteTake = function(beatId, idx) {
    const beat = getBeat(beatId); if(!beat||!beat.takes) return;
    beat.takes.splice(idx, 1);
    if(typeof saveState==='function') saveState();
    renderTakeList();
  };

  window.renderInlineSections = renderInlineSections;


  // ── Rimbank via Claude API ────────────────────────────────────────────────
  window.llFindRhymes = async function() {
    const input = document.getElementById('llRhymeInput');
    const results = document.getElementById('llRhymeResults');
    if(!input || !results) return;
    const word = input.value.trim();
    if(!word) return;

    results.innerHTML = '<p style="font-size:11px;color:rgba(255,255,255,.4);margin:0">Søker...</p>';

    try {
      // Route through Cloudflare Worker (has ANTHROPIC_API_KEY as secret)
      const workerUrl = window.R2_WORKER_URL || 'https://beat-vault.marcus-aas-mekiassen.workers.dev';
      const res = await fetch(`${workerUrl}/rhyme`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ word })
      });
      const data = await res.json();
      const text = data.text || '';
      let parsed;
      try { parsed = JSON.parse(text.replace(/```json|```/g,'')); } catch(e) { throw new Error('Parse feil'); }

      const { perfekte = [], nesten = [] } = parsed;
      results.innerHTML = `
        ${perfekte.length ? `
          <div style="margin-bottom:8px">
            <div style="font-size:10px;font-weight:800;letter-spacing:.08em;color:rgba(255,255,255,.3);text-transform:uppercase;margin-bottom:5px">Perfekte rim</div>
            <div style="display:flex;flex-wrap:wrap;gap:4px">
              ${perfekte.map(w => `<button class="ll-rhyme-chip" onclick="llInsertRhyme('${w.replace(/'/g,"\'")}')">
                ${w}
              </button>`).join('')}
            </div>
          </div>` : ''}
        ${nesten.length ? `
          <div>
            <div style="font-size:10px;font-weight:800;letter-spacing:.08em;color:rgba(255,255,255,.3);text-transform:uppercase;margin-bottom:5px">Nesten-rim</div>
            <div style="display:flex;flex-wrap:wrap;gap:4px">
              ${nesten.map(w => `<button class="ll-rhyme-chip muted" onclick="llInsertRhyme('${w.replace(/'/g,"\'")}')">
                ${w}
              </button>`).join('')}
            </div>
          </div>` : ''}
      `;
    } catch(e) {
      results.innerHTML = `<p style="font-size:11px;color:#fb7185;margin:0">Feil: ${e.message}</p>`;
    }
  };

  // Click a rhyme chip to copy it
  window.llInsertRhyme = function(word) {
    navigator.clipboard?.writeText(word).then(()=>{
      if(typeof showToast==='function') showToast(`✓ Kopiert: ${word}`);
    }).catch(()=>{
      if(typeof showToast==='function') showToast(word);
    });
  };

  // Click on a word in a textarea to populate rhyme input
  document.addEventListener('mouseup', e => {
    const ta = e.target.closest('.ll-textarea');
    if(!ta) return;
    const sel = window.getSelection?.()?.toString().trim() || (ta.value||'').substring(ta.selectionStart||0, ta.selectionEnd||0).trim();
    const word = sel.split(/\s+/)[0].replace(/[^a-zæøåA-ZÆØÅ]/g,'');
    if(word.length > 1) {
      const input = document.getElementById('llRhymeInput');
      if(input) { input.value = word; }  // just fill the field, user presses Finn rim manually
    }
  });


  // ── WaveSurfer waveform + Regions plugin for loop ───────────────────────────
  let _ws       = null;
  let _wsRegion = null;   // active WaveSurfer Region object (or {start,end} fallback)
  let _wsRegions = null;  // Regions plugin instance
  let _wsLooping = false;

  const WS_URL      = 'https://unpkg.com/wavesurfer.js@7/dist/wavesurfer.min.js';
  const REGIONS_URL = 'https://unpkg.com/wavesurfer.js@7/dist/plugins/regions.min.js';

  function fmtT(sec) {
    sec = Math.max(0, Number(sec) || 0);
    return Math.floor(sec/60) + ':' + String(Math.floor(sec%60)).padStart(2,'0');
  }
  function _setPlayIcon(playing) {
    const b = document.getElementById('llWavePlayBtn'); if (b) b.textContent = playing ? '⏸' : '▶';
    const o = document.getElementById('llPlayBtn');     if (o) o.textContent = playing ? '⏸' : '▶';
  }
  function _setLoopBtn(on) {
    const b = document.getElementById('llWaveLoopBtn');
    if (b) { b.classList.toggle('active', !!on); b.title = on ? 'Loop på' : 'Loop av'; }
  }
  function _showLoopBar(start, end) {
    const bar = document.getElementById('llLoopBar'); if (!bar) return;
    bar.style.display = 'flex';
    const s = document.getElementById('llLoopStart'); if (s) s.textContent = fmtT(start);
    const e = document.getElementById('llLoopEnd');   if (e) e.textContent = fmtT(end);
    const d = document.getElementById('llLoopDur');   if (d) d.textContent = Math.round(end-start) + 's';
    const hint = document.getElementById('llPlayerHint'); if (hint) hint.style.display = 'none';
  }

  function initWaveSurfer(beat) {
    const container = document.getElementById('llWaveSurfer');
    if (!container) return;
    if (_ws) { try { _ws.destroy(); } catch(e) {} _ws = null; _wsRegion = null; _wsRegions = null; _wsLooping = false; }

    const audioUrl = beat.audio_url || beat.url || null;
    if (!audioUrl) {
      container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:64px;color:rgba(255,255,255,.25);font-size:12px">Ingen lydfil</div>';
      return;
    }

    function load() {
      if (window.WaveSurfer && window.WaveSurfer.Regions) { _buildWS(container, audioUrl); return; }
      if (!window.WaveSurfer) {
        const s = document.createElement('script'); s.src = WS_URL;
        s.onload = () => {
          const r = document.createElement('script'); r.src = REGIONS_URL;
          r.onload = () => _buildWS(container, audioUrl);
          document.head.appendChild(r);
        };
        document.head.appendChild(s);
      } else {
        const r = document.createElement('script'); r.src = REGIONS_URL;
        r.onload = () => _buildWS(container, audioUrl);
        document.head.appendChild(r);
      }
    }
    load();
  }

  function _buildWS(container, audioUrl) {
    // WaveSurfer v7 UMD: plugin exposed as WaveSurfer.Regions
    const RegionsCtor = window.WaveSurfer?.Regions;
    let regions = null;
    try { regions = RegionsCtor ? RegionsCtor.create() : null; } catch(e) {}
    _wsRegions = regions;
    const plugins = regions ? [regions] : [];

    try {
      _ws = WaveSurfer.create({
        container,
        waveColor:      'rgba(244,164,67,.4)',
        progressColor:  'rgba(244,164,67,.95)',
        cursorColor:    '#fff',
        cursorWidth:    2,
        height: 72, barWidth: 2, barGap: 1, barRadius: 3,
        normalize: true, url: audioUrl,
        plugins,
      });

      _ws.on('play',  () => _setPlayIcon(true));
      _ws.on('pause', () => _setPlayIcon(false));
      _ws.on('finish', () => {
        _setPlayIcon(false);
        if (_wsLooping && _wsRegion) setTimeout(() => { _ws.setTime(_wsRegion.start); _ws.play(); }, 20);
      });

      const setTot = () => { const t=document.getElementById('llWaveTot'); if(t) t.textContent = fmtT(_ws.getDuration()); };
      _ws.on('decode', setTot);
      _ws.on('ready',  setTot);

      _ws.on('timeupdate', t => {
        const cur = document.getElementById('llWaveCur'); if (cur) cur.textContent = fmtT(t);
        if (_wsLooping && _wsRegion && t >= _wsRegion.end - 0.03) {
          _ws.setTime(_wsRegion.start);
          if (!_ws.isPlaying()) _ws.play();
        }
      });

      if (regions) {
        _ws.on('ready', () => {
          if (regions.enableDragSelection) regions.enableDragSelection({ color: 'rgba(244,164,67,.18)' });
        });
        regions.on('region-created', reg => {
          try { regions.getRegions().forEach(r => { if (r !== reg) r.remove(); }); } catch(e) {}
          try { reg.setOptions({ color: 'rgba(244,164,67,.18)', resize: true, drag: true }); } catch(e) {}
          _wsRegion  = reg;
          _wsLooping = true;
          _setLoopBtn(true);
          _showLoopBar(reg.start, reg.end);
        });
        regions.on('region-updated', reg => { _wsRegion = reg; _showLoopBar(reg.start, reg.end); });
        regions.on('region-clicked', (reg, e) => { e.stopPropagation(); _ws.setTime(reg.start); _ws.play(); });
      } else {
        _buildManualDrag(container);
      }

    } catch(e) { console.warn('[WaveSurfer]', e); }
  }

  function _buildManualDrag(container) {
    // Simple manual drag when RegionsPlugin unavailable
    container.style.position = 'relative';
    let ds = null, dm = false;
    const ov = document.createElement('div');
    ov.style.cssText='position:absolute;inset:0;z-index:20;cursor:crosshair';
    container.appendChild(ov);

    ov.addEventListener('mousedown', e => { if(_ws?.getDuration()) { ds=_tFromEvent(e); dm=false; } e.stopPropagation(); });
    ov.addEventListener('mousemove', e => {
      if(ds===null) return; dm=true;
      const s=Math.min(ds,_tFromEvent(e)), en=Math.max(ds,_tFromEvent(e));
      _drawFallbackRegion(s, en);
    });
    ov.addEventListener('mouseup', e => {
      if(ds===null) return;
      if(!dm) { _ws.seekTo(_tFromEvent(e)/(_ws.getDuration()||1)); ds=null; return; }
      const s=Math.min(ds,_tFromEvent(e)), en=Math.max(ds,_tFromEvent(e));
      ds=null; dm=false;
      if(en-s<0.2) return;
      _wsRegion={start:s,end:en};
      _wsLooping=true;
      _drawFallbackRegion(s,en);
      _setLoopBtn(true);
      _showLoopBar(s,en);
    });
  }
  function _tFromEvent(e) {
    const r=document.getElementById('llWaveSurfer')?.getBoundingClientRect();
    if(!r||!_ws) return 0;
    return ((e.clientX-r.left)/r.width)*(_ws.getDuration()||1);
  }
  function _drawFallbackRegion(s,en) {
    const c=document.getElementById('llWaveSurfer'); if(!c||!_ws) return;
    let d=document.getElementById('llWaveRegion');
    if(!d){d=document.createElement('div');d.id='llWaveRegion';d.style.cssText='position:absolute;top:0;bottom:0;pointer-events:none;z-index:5;';c.appendChild(d);}
    const dur=_ws.getDuration()||1;
    d.style.left=(s/dur*100)+'%';d.style.width=((en-s)/dur*100)+'%';
    d.style.background='rgba(244,164,67,.15)';d.style.borderLeft='2px solid #f4a443';d.style.borderRight='2px solid #f4a443';
  }

  window.llWavePlay = function() {
    if (!_ws) return;
    if (_ws.isPlaying()) { _ws.pause(); return; }
    if (_wsLooping && _wsRegion && (_ws.getCurrentTime() < _wsRegion.start || _ws.getCurrentTime() >= _wsRegion.end - 0.02)) {
      _ws.setTime(_wsRegion.start);
    }
    _ws.play();
  };
  window.llToggleLoop = function() {
    if (!_wsRegion) {
      if (typeof showToast === 'function') showToast('Dra over bølgeformen for å lage et loopområde først');
      return;
    }
    _wsLooping = !_wsLooping;
    _setLoopBtn(_wsLooping);
  };
  window.llClearLoop = function() {
    _wsLooping = false;
    try { _wsRegions?.getRegions().forEach(r => r.remove()); } catch(e){}
    if (_wsRegion?.remove) { try { _wsRegion.remove(); } catch(e){} }
    _wsRegion = null;
    document.getElementById('llWaveRegion')?.remove();
    const bar = document.getElementById('llLoopBar'); if (bar) bar.style.display = 'none';
    const hint = document.getElementById('llPlayerHint'); if (hint) hint.style.display = '';
    _setLoopBtn(false);
  };
  window.llZoomWave = function(val) {
    if (!_ws) return;
    const n = Number(val);                       // 0–100 slider
    try { _ws.zoom(n <= 0 ? 0 : Math.round((n/100) * 260)); } catch(e) {}
    const lbl = document.getElementById('llWaveZoomVal');
    if (lbl) lbl.textContent = (1 + (n/100) * 15).toFixed(1).replace(/\.0$/,'') + '×';
  };


  // ══════════════════════════════════════════════════════════════════════════
  // 1. INLINE RHYME POPOVER
  // Right-click a word in any .ll-textarea → popover appears at cursor
  // ══════════════════════════════════════════════════════════════════════════
  (function() {
    let _popover = null;

    function closePopover() {
      if (_popover) { _popover.remove(); _popover = null; }
    }

    function getWordAt(el) {
      // Works for both textarea (selectionStart) and contenteditable (Selection API)
      if (el.tagName === 'TEXTAREA') {
        const s = el.selectionStart, val = el.value;
        let start = s, end = s;
        while (start > 0 && /[a-zA-Z\u00e6\u00f8\u00e5\u00c6\u00d8\u00c5]/.test(val[start-1])) start--;
        while (end < val.length && /[a-zA-Z\u00e6\u00f8\u00e5\u00c6\u00d8\u00c5]/.test(val[end])) end++;
        return val.slice(start, end).toLowerCase().trim();
      }
      // contenteditable: use Selection API
      try {
        const sel = window.getSelection();
        if (!sel || !sel.rangeCount) return '';
        const r = sel.getRangeAt(0).cloneRange();
        r.expand('word');
        return r.toString().toLowerCase().replace(/[^a-z\u00e6\u00f8\u00e5]/gi,'').trim();
      } catch(e) { return ''; }
    }

    async function showRhymePopover(e, ta) {
      closePopover();
      e.preventDefault();
      const word = getWordAt(ta);
      if (!word || word.length < 2) return;

      // Update side panel input too
      const inp = document.getElementById('llRhymeInput');
      if (inp) inp.value = word;

      // Build popover
      const pop = document.createElement('div');
      pop.id = 'llRhymePopover';
      pop.style.cssText = `position:fixed;z-index:9000;background:#1a1614;border:1px solid rgba(255,255,255,.15);`
        + `border-radius:12px;padding:10px 12px;min-width:220px;max-width:300px;`
        + `box-shadow:0 12px 40px rgba(0,0,0,.7);font-family:inherit;`;
      pop.style.left = Math.min(e.clientX, window.innerWidth - 320) + 'px';
      pop.style.top  = (e.clientY + 8) + 'px';
      pop.innerHTML = `<div style="font-size:11px;font-weight:900;letter-spacing:.08em;color:rgba(255,255,255,.35);text-transform:uppercase;margin-bottom:8px">Rim for "${word}"</div>
        <div id="llPopoverResults" style="font-size:12px;color:rgba(255,255,255,.4)">Laster...</div>`;
      document.body.appendChild(pop);
      _popover = pop;

      document.addEventListener('click', closePopover, { once: true });

      // Fetch rhymes
      try {
        const workerUrl = window.R2_WORKER_URL || 'https://beat-vault.marcus-aas-mekiassen.workers.dev';
        const res = await fetch(`${workerUrl}/rhyme`, {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({word})
        });
        const data = await res.json();
        let parsed;
        try { parsed = JSON.parse((data.text||'{}').replace(/```json|```/g,'')); } catch(e) { parsed = {}; }
        const { perfekte=[], nesten=[] } = parsed;
        const r = document.getElementById('llPopoverResults');
        if (!r) return;
        if (!perfekte.length && !nesten.length) { r.textContent = 'Ingen rimord funnet'; return; }
        r.innerHTML = [
          perfekte.length ? `<div style="margin-bottom:6px"><div style="font-size:9px;font-weight:800;letter-spacing:.1em;color:rgba(255,255,255,.25);text-transform:uppercase;margin-bottom:4px">Perfekte rim</div><div style="display:flex;flex-wrap:wrap;gap:4px">${perfekte.map(w=>`<button onclick="event.stopPropagation();llInsertRhyme('${w}');document.getElementById('llRhymePopover')?.remove()" style="background:rgba(244,164,67,.12);border:1px solid rgba(244,164,67,.28);border-radius:999px;color:#f4a443;font-size:11px;font-weight:800;padding:2px 8px;cursor:pointer;font-family:inherit">${w}</button>`).join('')}</div></div>` : '',
          nesten.length ? `<div><div style="font-size:9px;font-weight:800;letter-spacing:.1em;color:rgba(255,255,255,.25);text-transform:uppercase;margin-bottom:4px">Nesten</div><div style="display:flex;flex-wrap:wrap;gap:4px">${nesten.slice(0,6).map(w=>`<button onclick="event.stopPropagation();llInsertRhyme('${w}');document.getElementById('llRhymePopover')?.remove()" style="background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);border-radius:999px;color:rgba(255,255,255,.6);font-size:11px;font-weight:800;padding:2px 8px;cursor:pointer;font-family:inherit">${w}</button>`).join('')}</div></div>` : ''
        ].join('');
      } catch(e) {
        const r = document.getElementById('llPopoverResults');
        if (r) r.textContent = 'Feil: ' + e.message;
      }
    }

    // Attach contextmenu on all .ll-textarea (delegated)
    document.addEventListener('contextmenu', e => {
      const ta = e.target.closest('.ll-textarea');
      if (!ta) return;
      showRhymePopover(e, ta);
    });

    window.llCloseRhymePopover = closePopover;
  })();


  // ══════════════════════════════════════════════════════════════════════════
  // 2. FLOW ANALYSIS — color-code rhyming lines
  // ══════════════════════════════════════════════════════════════════════════
  const FLOW_COLORS = [
    'rgba(244,164,67,.35)',  // amber
    'rgba(168,85,247,.35)',  // purple
    'rgba(52,211,153,.35)',  // green
    'rgba(96,165,250,.35)',  // blue
    'rgba(251,113,133,.35)', // pink
    'rgba(251,191,36,.35)',  // yellow
  ];

  function getLineEnding(line) {
    const words = line.trim().split(/\s+/);
    const last = words[words.length-1]?.toLowerCase().replace(/[^a-zæøå]/g,'') || '';
    return last.slice(-3); // last 3 chars as rhyme key
  }

  window.llAnalyzeFlow = function(beatId) {
    const beat = getBeat(beatId || window.currentLyricLabBeatId);
    if (!beat) return;
    const secs = getSections(beat);

    // Collect all non-empty lines
    const allLines = [];
    secs.forEach(s => {
      s.text.split('\n').forEach((line, i) => {
        if (line.trim()) allLines.push({ secId: s.id, lineIdx: i, ending: getLineEnding(line) });
      });
    });

    // Group by ending → assign colors to groups with 2+ matches
    const groups = {};
    allLines.forEach(l => {
      if (!l.ending || l.ending.length < 2) return;
      if (!groups[l.ending]) groups[l.ending] = [];
      groups[l.ending].push(l);
    });
    const colorMap = {};
    let colorIdx = 0;
    Object.values(groups).filter(g => g.length >= 2).forEach(g => {
      const color = FLOW_COLORS[colorIdx % FLOW_COLORS.length];
      g.forEach(l => colorMap[l.secId + '-' + l.lineIdx] = color);
      colorIdx++;
    });

    // Color the LINE NUMBER column per line (no overlap with textarea text)
    secs.forEach(s => {
      const numsEl = document.getElementById('llnums-' + s.id);
      if (!numsEl) return;
      const lines = s.text.split('\n');
      numsEl.innerHTML = lines.map((_, i) => {
        const color = colorMap[s.id + '-' + i];
        const num = i + 1;
        return color
          ? `<div style="background:${color};border-radius:3px;padding:0 4px;margin:0 -4px;line-height:inherit">${num}</div>`
          : `<div style="line-height:inherit">${num}</div>`;
      }).join('');
    });

    // Legend
    const legend = document.getElementById('llFlowLegend');
    if (legend) {
      const pairs = Object.values(groups).filter(g=>g.length>=2).length;
      legend.textContent = pairs ? `${pairs} rimgruppe${pairs>1?'r':''} fargekodet` : 'Ingen rim funnet';
      legend.style.display = 'block';
    }
  };

  window.llClearFlow = function() {
    // Restore plain line numbers
    document.querySelectorAll('[id^="llnums-"]').forEach(el => {
      const count = el.textContent.replace(/\D/g,'').length > 0
        ? el.querySelectorAll('div').length || el.textContent.trim().split('\n').length
        : 0;
      const lines = el.querySelectorAll('div');
      lines.forEach((d, i) => { d.style.background=''; d.style.borderRadius=''; });
      // Re-render as plain text
      el.style.whiteSpace = 'pre';
      el.innerHTML = Array.from({length: lines.length}, (_,i)=>i+1).join('\n');
    });
    const legend = document.getElementById('llFlowLegend');
    if (legend) legend.style.display = 'none';
  };


  // ══════════════════════════════════════════════════════════════════════════
  // 3. VERSION HISTORY PER SECTION
  // ══════════════════════════════════════════════════════════════════════════
  function addVersionSnapshot(beat, secId) {
    const sec = getSections(beat).find(s => s.id === secId);
    if (!sec || !sec.text.trim()) return;
    if (!sec.history) sec.history = [];
    // Don't save if same as last
    if (sec.history.length && sec.history[sec.history.length-1].text === sec.text) return;
    sec.history.push({ text: sec.text, ts: Date.now() });
    if (sec.history.length > 20) sec.history.shift(); // max 20 versions
  }

  window.llSaveVersion = function(secId) {
    const beat = getBeat(window.currentLyricLabBeatId); if(!beat) return;
    addVersionSnapshot(beat, secId);
    if(typeof saveState==='function') saveState();
    if(typeof showToast==='function') showToast('✓ Versjon lagret');
  };

  window.llShowHistory = function(secId) {
    const beat = getBeat(window.currentLyricLabBeatId); if(!beat) return;
    const sec  = getSections(beat).find(s=>s.id===secId); if(!sec) return;
    const hist = sec.history || [];

    document.getElementById('llHistoryModal')?.remove();
    const modal = document.createElement('div');
    modal.id = 'llHistoryModal';
    modal.style.cssText = `position:fixed;inset:0;z-index:3000;background:rgba(0,0,0,.75);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;padding:20px`;
    modal.innerHTML = `<div style="background:#141210;border:1px solid rgba(255,255,255,.1);border-radius:18px;width:100%;max-width:580px;max-height:80vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 24px 80px rgba(0,0,0,.7)">
      <div style="display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-bottom:1px solid rgba(255,255,255,.07)">
        <span style="font-size:15px;font-weight:900">Versjonshistorikk — ${esc(sec.title)}</span>
        <button onclick="document.getElementById('llHistoryModal').remove()" style="background:none;border:none;color:rgba(255,255,255,.5);font-size:18px;cursor:pointer">✕</button>
      </div>
      <div style="overflow-y:auto;padding:8px">
        ${hist.length === 0 ? '<p style="padding:16px;color:rgba(255,255,255,.3);font-size:13px">Ingen lagrede versjoner ennå. Klikk ⌛ i seksjonmenyen for å lagre.</p>'
          : [...hist].reverse().map((v, i) => {
            const d = new Date(v.ts);
            const label = d.toLocaleString('no-NO',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
            const preview = v.text.slice(0,120).replace(/&/g,'&amp;').replace(/</g,'&lt;');
            return `<div style="padding:12px;border-bottom:1px solid rgba(255,255,255,.05)">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
                <span style="font-size:11px;color:rgba(255,255,255,.4);font-weight:700">${label}</span>
                <button onclick="llRestoreVersion('${secId}',${hist.length-1-i})" style="background:rgba(244,164,67,.12);border:1px solid rgba(244,164,67,.3);border-radius:7px;color:#f4a443;font-size:11px;font-weight:800;padding:3px 10px;cursor:pointer;font-family:inherit">Gjenopprett</button>
              </div>
              <pre style="font-size:12px;color:rgba(255,255,255,.55);font-family:Georgia,serif;margin:0;white-space:pre-wrap;max-height:80px;overflow:hidden">${preview}${v.text.length>120?'…':''}</pre>
            </div>`;
          }).join('')}
      </div>
    </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if(e.target===modal) modal.remove(); });
  };

  window.llRestoreVersion = function(secId, idx) {
    const beat = getBeat(window.currentLyricLabBeatId); if(!beat) return;
    const sec  = getSections(beat).find(s=>s.id===secId); if(!sec||!sec.history) return;
    addVersionSnapshot(beat, secId); // save current before restoring
    sec.text = sec.history[idx].text;
    if(typeof saveState==='function') saveState();
    document.getElementById('llHistoryModal')?.remove();
    renderLyricLab();
    if(typeof showToast==='function') showToast('↩ Versjon gjenopprettet');
  };

  // Auto-snapshot on every save (after debounce)
  const _origSaveSections = saveSections;
  function saveSections(beat) {
    // Snapshot each dirty section before saving
    if (beat?.lyricSections) {
      beat.lyricSections.forEach(s => { if(s.text?.trim()) addVersionSnapshot(beat, s.id); });
    }
    _origSaveSections(beat);
  }


  // ══════════════════════════════════════════════════════════════════════════
  // 4. INSPIRASJON-MODUS
  // ══════════════════════════════════════════════════════════════════════════
  window.llInspirasjon = async function() {
    const st = getState();
    // Pick a random beat that has lyrics (not the one currently open)
    const beats = (st?.beats||[]).filter(b => {
      if(b.archived || b.id === window.currentLyricLabBeatId) return false;
      const hasText = (b.lyricSections||[]).some(s=>s.text?.trim().length>20)
        || (b.lyrics||'').trim().length>20;
      return hasText;
    });

    const el = document.getElementById('llInspirasjonBox');
    if (!el) return;

    if (beats.length === 0) {
      el.innerHTML = '<p style="font-size:12px;color:rgba(255,255,255,.3);margin:0">Skriv tekst på andre sanger for å få inspirasjon her</p>';
      el.style.display = 'block';
      return;
    }

    // Pick a random beat and gather its text
    const beat = beats[Math.floor(Math.random() * beats.length)];
    const sections = (beat.lyricSections||[]).filter(s=>s.text?.trim());
    const lyrics = sections.length
      ? sections.map(s=>`[${s.title||s.type}]\n${s.text}`).join('\n\n')
      : (beat.lyrics||'').trim();

    // Show loading state
    el.style.display = 'block';
    el.innerHTML = `
      <div style="font-size:10px;font-weight:800;letter-spacing:.08em;color:rgba(255,255,255,.25);text-transform:uppercase;margin-bottom:8px">
        Genererer fra "${esc(beat.name)}"…
      </div>
      <div style="display:flex;align-items:center;gap:8px;color:rgba(255,255,255,.3);font-size:13px">
        <span style="animation:llSpin 1s linear infinite;display:inline-block">⟳</span>
        Spør Claude om inspirasjon…
      </div>`;

    // Inject spin keyframe once
    if(!document.getElementById('ll-spin-style')){
      const s=document.createElement('style');s.id='ll-spin-style';
      s.textContent='@keyframes llSpin{from{transform:rotate(0)}to{transform:rotate(360deg)}}';
      document.head.appendChild(s);
    }

    try {
      const workerUrl = window.R2_WORKER_URL || 'https://beat-vault.marcus-aas-mekiassen.workers.dev';

      const res = await fetch(`${workerUrl}/inspire`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ beatName: beat.name, lyrics: lyrics.slice(0, 800) })
      });

      const data = await res.json();
      const generated = (data.text || '').trim();

      if (!generated) throw new Error('Tom respons');

      el.innerHTML = `
        <div style="font-size:10px;font-weight:800;letter-spacing:.08em;color:rgba(255,255,255,.25);text-transform:uppercase;margin-bottom:8px">
          Inspirert av "${esc(beat.name)}"
        </div>
        <div style="font-size:15px;font-family:Georgia,serif;color:rgba(255,255,255,.82);font-style:italic;line-height:1.7;white-space:pre-wrap">${esc(generated)}</div>
        <div style="display:flex;gap:10px;margin-top:10px;align-items:center">
          <button onclick="llInspirasjon()" style="background:none;border:none;color:rgba(255,255,255,.35);font-size:11px;cursor:pointer;font-family:inherit;padding:0;font-weight:800;transition:color .15s" onmouseover="this.style.color='var(--text)'" onmouseout="this.style.color='rgba(255,255,255,.35)'">↻ Ny inspirasjon</button>
          <button onclick="navigator.clipboard.writeText(this.closest('[id]').querySelector('div:nth-child(2)').innerText).then(()=>{this.textContent='✓ Kopiert';setTimeout(()=>this.textContent='Kopier',1500)})" style="background:none;border:none;color:rgba(255,255,255,.25);font-size:11px;cursor:pointer;font-family:inherit;padding:0;font-weight:800;transition:color .15s" onmouseover="this.style.color='var(--text)'" onmouseout="this.style.color='rgba(255,255,255,.25)'">Kopier</button>
        </div>`;

    } catch(err) {
      console.error('[llInspirasjon] Feil:', err);
      el.innerHTML = `
        <div style="font-size:12px;color:rgba(255,113,113,.6);margin-bottom:6px">Kunne ikke generere inspirasjon — prøv igjen</div>
        <button onclick="llInspirasjon()" style="background:none;border:none;color:rgba(255,255,255,.3);font-size:11px;cursor:pointer;font-family:inherit;padding:0;font-weight:800">↻ Prøv igjen</button>`;
    }
  };


  // ══════════════════════════════════════════════════════════════════════════
  // 5. DELING — generer demo-side
  // ══════════════════════════════════════════════════════════════════════════
  window.llShare = function(beatId) {
    const beat = getBeat(beatId || window.currentLyricLabBeatId);
    if (!beat) return;
    const sections = getSections(beat);
    const audioUrl = beat.audio_url || beat.url || null;

    const html = `<!DOCTYPE html>
<html lang="no">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${beat.name}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:#0d0c0b;color:#f4ede4;font-family:'Georgia',serif;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:32px 16px}
  .card{max-width:640px;width:100%;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);border-radius:20px;overflow:hidden}
  .header{padding:28px 32px 20px;border-bottom:1px solid rgba(255,255,255,.07)}
  .label{font-size:10px;font-weight:800;letter-spacing:.15em;color:#f4a443;text-transform:uppercase;margin-bottom:8px;font-family:system-ui}
  h1{font-size:26px;font-weight:900;letter-spacing:-.04em;line-height:1.15}
  .meta{font-size:13px;color:rgba(255,255,255,.4);margin-top:6px;font-family:system-ui}
  audio{width:100%;height:44px;margin:16px 0 4px;filter:invert(1) sepia(1) saturate(2) hue-rotate(0deg)}
  .lyrics{padding:20px 32px 32px}
  .section{margin-bottom:24px}
  .section-label{font-size:9px;font-weight:900;letter-spacing:.12em;text-transform:uppercase;color:rgba(255,255,255,.3);margin-bottom:8px;font-family:system-ui}
  .text{font-size:15px;line-height:1.85;color:rgba(255,255,255,.85);white-space:pre-wrap}
  .footer{text-align:center;padding:16px;font-size:11px;color:rgba(255,255,255,.2);font-family:system-ui;border-top:1px solid rgba(255,255,255,.06)}
</style>
</head>
<body>
<div class="card">
  <div class="header">
    <div class="label">Demo</div>
    <h1>${beat.name}</h1>
    ${beat.source ? `<div class="meta">prod. ${beat.source}</div>` : ''}
    ${audioUrl ? `<audio controls src="${audioUrl}"></audio>` : ''}
  </div>
  <div class="lyrics">
    ${sections.filter(s=>s.text.trim()).map(s=>`
    <div class="section">
      <div class="section-label">${s.title}</div>
      <div class="text">${s.text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>
    </div>`).join('')}
  </div>
  <div class="footer">Laget med Music Vault</div>
</div>
</body>
</html>`;

    // Create blob URL and open in new tab
    const blob = new Blob([html], {type:'text/html'});
    const url  = URL.createObjectURL(blob);
    window.open(url, '_blank');
    if(typeof showToast==='function') showToast('✓ Demo-side åpnet i ny fane');
  };



  // ── Public entry point ────────────────────────────────────────────────────
  window.openInLyricLab = function(beatId) {
    window.currentLyricLabBeatId = beatId;
    const btn = document.querySelector('.tab-btn[data-tab="lyriclab"]');
    if (btn) btn.click();
    else renderLyricLab();
  };

  window.renderLyricLab = renderLyricLab;

  console.log('[LyricLab] Loaded ✓');
  // Fill any beat cards that rendered before lyriclab.js loaded
  if(typeof mountInlineEditors === 'function') mountInlineEditors();
})();
