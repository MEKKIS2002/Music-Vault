// === lyriclab.js ===
// Lyric Lab — fullskjerm teksteditor med beat-info og skriveanalyse.
//
// DATAMODELL per beat:
//   beat.lyricSections: Array<{id, type, title, text, collapsed, order}>
//   beat.lyricLabStatus: eldre felt (utkast/skriver/…) — vises ikke lenger; låtens steg kommer fra js/stages.js
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


  // ── Section HTML ──────────────────────────────────────────────────────────

  // ── Høyrekolonnen: Skriv / Spill inn ────────────────────────────────────────
  function llRailPref(){ try { return localStorage.getItem('mv_ll_rail') === 'rec' ? 'rec' : 'write'; } catch(e){ return 'write'; } }
  function llSetRail(which, silent){
    which = which === 'rec' ? 'rec' : 'write';
    const tw = document.getElementById('llRailTabWrite'), tr = document.getElementById('llRailTabRec');
    const pw = document.getElementById('llRailWrite'),    pr = document.getElementById('llRailRec');
    if (!tw || !tr || !pw || !pr) return;
    tw.setAttribute('aria-selected', String(which === 'write')); tr.setAttribute('aria-selected', String(which === 'rec'));
    tw.tabIndex = which === 'write' ? 0 : -1; tr.tabIndex = which === 'rec' ? 0 : -1;
    pw.hidden = which !== 'write'; pr.hidden = which !== 'rec';
    if (!silent){ try { localStorage.setItem('mv_ll_rail', which); } catch(e){} }
  }
  function llRecCount(){
    const n = ['llTakeCount', 'llMemoCount'].reduce((s, id) => s + (parseInt((document.getElementById(id) || {}).textContent, 10) || 0), 0);
    const el = document.getElementById('llRecCount'); if (el) el.textContent = n ? String(n) : '';
  }
  window.llSetRail = llSetRail; window.llRecCount = llRecCount;
  // I Lyric Lab er dekket avspilleren: spilleren nederst blir en smal «spilles nå»-stripe (body.mv-in-lyriclab)
  (function(){
    const sync = () => document.body.classList.toggle('mv-in-lyriclab', document.querySelector('.tab-btn.active')?.dataset?.tab === 'lyriclab');
    const nav = document.querySelector('.mv-tabs') || document.body;
    new MutationObserver(sync).observe(nav, { subtree: true, attributes: true, attributeFilter: ['class'] });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', sync); else sync();
  })();
  // BPM/toneart redigeres i en liten boble rett ved knappene i dekket (før: i ⋯-menyen langt unna)
  window.llOpenSongInfo = function(field){
    const pop = document.getElementById('llKnobPop'); if (!pop) return;
    setTimeout(() => {                                  // etter klikket, så «klikk utenfor» ikke lukker den med en gang
      pop.hidden = false;
      pop.querySelector(field === 'bpm' ? '.ll-bpm-input' : '.ll-key-select')?.focus();
    }, 0);
  };
  window.llCloseSongInfo = function(){ const pop = document.getElementById('llKnobPop'); if (pop) pop.hidden = true; };
  document.addEventListener('click', e => {
    const pop = document.getElementById('llKnobPop'); if (!pop || pop.hidden) return;
    if (!e.target.closest('#llKnobPop') && !e.target.closest('.ll-knob')) pop.hidden = true;
  });
  document.addEventListener('keydown', e => {
    const pop = document.getElementById('llKnobPop'); if (e.key !== 'Escape' || !pop || pop.hidden) return;
    pop.hidden = true; document.getElementById('llKnobBpm')?.focus();
  });
  document.addEventListener('click', e => {
    const pop = document.getElementById('llColorPop'); if (!pop || !pop.open) return;
    if (e.target.closest('.ll-color-dot') || !pop.contains(e.target)) pop.open = false;
  });
  document.addEventListener('keydown', e => { if (e.key !== 'Escape') return; const pop = document.getElementById('llColorPop'); if (pop && pop.open){ pop.open = false; pop.querySelector('summary')?.focus(); } });
  // Piltaster mellom fanene (vanlig tablist-mønster)
  document.addEventListener('keydown', e => {
    const t = e.target.closest && e.target.closest('.ll-rail-tab'); if (!t || !/^Arrow(Left|Right)$/.test(e.key)) return;
    e.preventDefault(); const next = t.dataset.rail === 'write' ? 'rec' : 'write'; llSetRail(next); document.querySelector(`.ll-rail-tab[data-rail="${next}"]`)?.focus();
  });

  // Standard seksjonsnavn («Vers 1», «Bro» …) vises på valgt språk. Det lagrede navnet endres ikke,
  // og et navn brukeren har skrevet selv vises alltid som det er.
  const SEC_EN = { 'vers': 'Verse', 'bro': 'Bridge', 'refreng': 'Chorus', 'hook': 'Hook', 'outro': 'Outro', 'intro': 'Intro', 'pre-refreng': 'Pre-chorus', 'ny seksjon': 'New section' };
  function llSecTitle(t){
    if (!(window.mvI18n && mvI18n.lang === 'en')) return t;
    const m = String(t || '').match(/^(vers|bro|refreng|hook|outro|intro|pre-refreng|ny seksjon)(\s+\d+)?$/i);
    return m ? SEC_EN[m[1].toLowerCase()] + (m[2] || '') : t;
  }
  window.llSecTitle = llSecTitle;
  document.addEventListener('mv:lang', () => {
    document.querySelectorAll('#lyriclabTab .ll-section-title-input[data-orig]').forEach(inp => {
      if (document.activeElement !== inp) inp.value = llSecTitle(inp.dataset.orig);
    });
  });


  // ── Analog kanalstripe i låthodet (vintage-miksepult) ───────────────────────
  // VU-meteret leser bølgeformens ferdig utregnede topper ved avspillingstiden —
  // det kobler seg aldri på selve lyden, så avspillingen påvirkes ikke.
  const KEY_ORDER = ['C','C#','D','Eb','E','F','F#','G','Ab','A','Bb','B'];
  function knobRot(kind, beat){
    if (kind === 'bpm'){ const n = Number(beat.bpm); return n > 0 ? Math.round(-135 + 270 * Math.max(0, Math.min(1, (n - 60) / 140))) : -135; }
    const m = /^([A-G][#b]?)/.exec(String(beat.key || '')); const i = m ? KEY_ORDER.indexOf(m[1]) : -1;
    return i < 0 ? -135 : Math.round(-135 + 270 * (i / 11));
  }
  function vuScale(){
    const cx = 60, cy = 66, r = 46, out = [];
    for (let k = 0; k <= 10; k++){
      const a = (-50 + k * 10) * Math.PI / 180, long = k % 2 === 0, r2 = r - (long ? 8 : 5);
      out.push(`<line x1="${(cx + r * Math.sin(a)).toFixed(1)}" y1="${(cy - r * Math.cos(a)).toFixed(1)}" x2="${(cx + r2 * Math.sin(a)).toFixed(1)}" y2="${(cy - r2 * Math.cos(a)).toFixed(1)}" class="${k >= 8 ? 'is-red' : ''}"/>`);
    }
    const arc = (a0, a1) => { const p = a => [(cx + r * Math.sin(a * Math.PI / 180)).toFixed(1), (cy - r * Math.cos(a * Math.PI / 180)).toFixed(1)]; const [x0, y0] = p(a0), [x1, y1] = p(a1); return `M${x0} ${y0} A${r} ${r} 0 0 1 ${x1} ${y1}`; };
    return `<path d="${arc(-50, 30)}" class="ll-vu-arc"/><path d="${arc(30, 50)}" class="ll-vu-arc is-red"/>${out.join('')}`;
  }
  // Dekket: VU-meter til venstre og knapper til høyre i bølgeformpanelet — én enhet, ikke en løs boks
  function vuHTML(){
    return `<span class="ll-screw" aria-hidden="true"></span><span class="ll-screw" aria-hidden="true"></span><span class="ll-screw" aria-hidden="true"></span><span class="ll-screw" aria-hidden="true"></span>
      <div class="ll-vu" aria-hidden="true">
        <svg viewBox="0 0 120 74" class="ll-vu-face">${vuScale()}<text x="60" y="52" class="ll-vu-mark">VU</text>
          <g class="ll-vu-needle is-resting" id="llVuNeedle" transform="rotate(-48 60 66)"><line x1="60" y1="66" x2="60" y2="16"/></g><circle cx="60" cy="66" r="4.5" class="ll-vu-pivot"/></svg>
      </div>`;
  }
  function knobsHTML(beat){
    const bpm = Number(beat.bpm) > 0 ? String(beat.bpm) : '–';
    const key = beat.key ? llKeyLabel(beat.key) : '–';
    return `<div class="ll-knobs" role="group" aria-label="Låtinfo">
        <button type="button" class="ll-knob" id="llKnobBpm" onclick="llOpenSongInfo('bpm')" title="Endre BPM" aria-label="BPM: ${esc(bpm)} — endre">
          <span class="ll-knob-cap" style="--rot:${knobRot('bpm', beat)}deg"></span><span class="ll-knob-lbl">BPM</span><span class="ll-knob-val" data-no-i18n>${esc(bpm)}</span></button>
        <button type="button" class="ll-knob" id="llKnobKey" onclick="llOpenSongInfo('key')" title="Endre toneart" aria-label="Toneart: ${esc(key)} — endre">
          <span class="ll-knob-cap" style="--rot:${knobRot('key', beat)}deg"></span><span class="ll-knob-lbl">Toneart</span><span class="ll-knob-val">${esc(key)}</span></button>
      </div>`;
  }
  function refreshConsole(beat){
    if (!beat) return;
    [['bpm', 'llKnobBpm', Number(beat.bpm) > 0 ? String(beat.bpm) : '–'], ['key', 'llKnobKey', beat.key ? llKeyLabel(beat.key) : '–']].forEach(([k, id, v]) => {
      const b = document.getElementById(id); if (!b) return;
      b.querySelector('.ll-knob-cap').style.setProperty('--rot', knobRot(k, beat) + 'deg');
      b.querySelector('.ll-knob-val').textContent = v;
      b.setAttribute('aria-label', (k === 'bpm' ? 'BPM: ' : 'Toneart: ') + v + ' — endre');
    });
  }
  let _meterPeaks = null, _meterRaf = 0, _meterLevel = 0, _meterLast = 0;
  const REST = -48;
  function meterPeaks(){
    if (_meterPeaks || !_ws) return _meterPeaks;
    try { const p = _ws.exportPeaks({ maxLength: 1600, precision: 1000 }), d = _ws.getDuration(); if (p && p[0] && p[0].length && d > 0) _meterPeaks = { arr: p[0], d }; } catch(e){}
    return _meterPeaks;
  }
  function setNeedle(deg, smooth){
    const g = document.getElementById('llVuNeedle'); if (!g) return;
    g.classList.toggle('is-resting', !!smooth);
    g.setAttribute('transform', `rotate(${deg.toFixed(1)} 60 66)`);
  }
  function meterFrame(ts){
    _meterRaf = 0;
    if (!_ws || !_ws.isPlaying || !_ws.isPlaying() || document.hidden){ meterStop(); return; }
    const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!reduce || ts - _meterLast > 250){
      _meterLast = ts;
      const pk = meterPeaks(); let target = 0;
      if (pk){ const t = _ws.getCurrentTime(), i = Math.floor(t / pk.d * pk.arr.length), w = Math.max(2, Math.round(pk.arr.length * 0.12 / pk.d));
        for (let k = Math.max(0, i - w); k < Math.min(pk.arr.length, i + w); k++) target = Math.max(target, Math.abs(pk.arr[k])); }
      // VU-ballistikk: rask nok til å følge musikken, treg nok til å se analog ut
      _meterLevel = reduce ? target : _meterLevel + (target - _meterLevel) * (target > _meterLevel ? 0.35 : 0.12);
      setNeedle(REST + 96 * Math.pow(Math.min(1, _meterLevel), 0.7), false);
    }
    _meterRaf = requestAnimationFrame(meterFrame);
  }
  function meterStart(){ document.getElementById('llCd')?.classList.add('is-spinning'); if (!_meterRaf) _meterRaf = requestAnimationFrame(meterFrame); }
  function meterStop(){ document.getElementById('llCd')?.classList.remove('is-spinning'); if (_meterRaf){ cancelAnimationFrame(_meterRaf); _meterRaf = 0; } _meterLevel = 0; setNeedle(REST, true); }
  document.addEventListener('visibilitychange', () => { if (!document.hidden && _ws && _ws.isPlaying && _ws.isPlaying()) meterStart(); });

  function sectionHTML(sec, beat) {
    const typeClass = `ll-type-${sec.type}`;
    const lineNums  = sec.text.split('\n').map((_,i)=>i+1).join('\n');
    const lineCount = countLines(sec.text);
    return `
    <div class="ll-section${sec.collapsed?' collapsed':''}" data-section-id="${esc(sec.id)}" id="llsec-${esc(sec.id)}">
      <div class="ll-section-header" onclick="llToggleSection('${esc(sec.id)}')">
        <span class="ll-section-type ${typeClass}">${esc(TYPE_LABELS[sec.type]||sec.type)}</span>
        <input class="ll-section-title-input" value="${esc(llSecTitle(sec.title))}" data-orig="${esc(sec.title)}" title="Klikk for å gi seksjonen nytt navn" aria-label="Navn på seksjon: ${esc(llSecTitle(sec.title))}" spellcheck="false" onclick="event.stopPropagation()"
          onchange="llRenameSection('${esc(sec.id)}',this.value)">
        <span class="ll-section-line-count">${lineCount} ${lineCount===1?'linje':'linjer'}</span>
        <button class="ll-section-menu-btn" onclick="event.stopPropagation();llToggleSectionMenu('${esc(sec.id)}')" title="Valg for seksjonen" aria-label="Valg for seksjonen ${esc(llSecTitle(sec.title))}">⋯</button>
        <button class="ll-section-done-btn${sec.done?' done':''}" onclick="event.stopPropagation();llToggleSectionDone('${esc(sec.id)}')" title="${sec.done?'Ferdig':'Merk som ferdig'}">
          ${sec.done?'✓':'○'}
        </button>
        <button class="ll-section-toggle" title="${sec.collapsed?'Vis seksjonen':'Skjul seksjonen'}" aria-label="${sec.collapsed?'Vis seksjonen':'Skjul seksjonen'}" aria-expanded="${!sec.collapsed}">${sec.collapsed?'▸':'▾'}</button>
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
        <button onclick="llSaveVersion('${esc(sec.id)}')"><span class="ic ic-save" aria-hidden="true"></span> Lagre versjon</button>
        <button onclick="llShowHistory('${esc(sec.id)}')"><span class="ic ic-clock" aria-hidden="true"></span> Historikk</button>
        <button class="danger" onclick="llDeleteSection('${esc(sec.id)}')"><span class="ic ic-trash" aria-hidden="true"></span> Slett seksjon</button>
      </div>
    </div>`;
  }

  // ── Toneart + metadata i låthodet ─────────────────────────────────────────
  function llKeyLabel(k){ if(!k) return ''; const m=/^([A-G][#b]?)(m|min|moll)?$/i.exec(String(k).trim()); if(!m) return String(k); return m[1].charAt(0).toUpperCase()+m[1].slice(1)+(m[2]?'-moll':'-dur'); }
  window.llSetKey = function(beatId, val){
    const beat = getBeat(beatId); if(!beat) return;
    beat.key = val || '';
    beat.keySource = 'manuell';          // analysen (analysis.js) overskriver aldri dette
    if(typeof saveState==='function') saveState();
    llRefreshMeta();
  };
  window.llRefreshMeta = function(){
    const beat = getBeat(window.currentLyricLabBeatId); const el = document.getElementById('llSongMeta');
    try { refreshConsole(beat); } catch(e) {}
    if(!beat || !el) return;
    const bits = [beat.source ? 'prod. '+esc(beat.source) : '', Number(beat.bpm)>0 ? esc(String(beat.bpm))+' BPM' : '', beat.key ? esc(llKeyLabel(beat.key)) : '', (/\d/.test(fmtDur(beat.duration)||'') ? fmtDur(beat.duration) : ''), beat.mood ? esc(beat.mood) : ''].filter(Boolean);
    el.innerHTML = bits.map(b=>`<span>${b}</span>`).join('<span class="ll-dot" aria-hidden="true">·</span>');
  };
  // Spill/pause en take eller memo (én om gangen)
  window.llTakeToggle = function(btn){
    const row = btn.closest('.ll-take-row'); const a = row && row.querySelector('audio'); if(!a) return;
    document.querySelectorAll('.ll-take-row audio').forEach(o=>{ if(o!==a && !o.paused){ o.pause(); } });
    const sync = ()=>document.querySelectorAll('.ll-take-row').forEach(r=>{ const au=r.querySelector('audio'); const on=au&&!au.paused; r.classList.toggle('playing',on); const b=r.querySelector('.ll-take-play'); if(b) b.innerHTML = on?'<span class="ic ic-pause" aria-hidden="true"></span>':'<span class="ic ic-play" aria-hidden="true"></span>'; });
    if(!a._llBound){ a._llBound=true; a.addEventListener('play',sync); a.addEventListener('pause',sync); a.addEventListener('ended',sync); }
    if(a.paused) a.play().catch(()=>{}); else a.pause();
  };

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
    // Status = låtens steg i den felles modellen (js/stages.js), ikke et eget Lyric Lab-felt
    const stage    = window.mvStages ? mvStages.of(beat) : { key: 'idea', label: 'Idé' };
    const dur      = fmtDur(beat.duration);
    const coverEl  = beat.cover
      ? `<img class="ll-cover-img" src="${esc(beat.cover)}" alt="${esc(beat.name)}">`
      : `<div class="ll-cover-ph"><span class="ic ic-music" aria-hidden="true"></span></div>`;

    const keyOpts = (()=>{ const notes=['C','C#','D','Eb','E','F','F#','G','Ab','A','Bb','B']; const list=[]; notes.forEach(n=>{ list.push([n+'m', n+'-moll']); list.push([n, n+'-dur']); }); if(beat.key && !list.some(o=>o[0]===beat.key)) list.unshift([beat.key, beat.key]); return list; })();
    const metaBits = [beat.source ? 'prod. '+esc(beat.source) : '', Number(beat.bpm)>0 ? esc(String(beat.bpm))+' BPM' : '', beat.key ? esc(llKeyLabel(beat.key)) : '', /\d/.test(dur || '') ? dur : '', beat.mood ? esc(beat.mood) : ''].filter(Boolean);
    container.innerHTML = `
<div class="ll-wrap ll-v2">
<div class="ll-header">
  <h1 class="ll-page-title">Lyric Lab</h1>
  <span class="ll-header-spacer"></span>
  <button class="ll-back-btn" onclick="llGoBack()">← Tilbake</button>
  <button class="ll-change-beat-btn" onclick="llShowBeatPicker()" title="Velg annen låt">⇄ Bytt låt</button>
</div>
<div class="ll-layout">

  <!-- HOVEDKOLONNE: låt, bølgeform, tekst -->
  <div class="ll-main">
    <div class="ll-song-head">
      <div class="ll-cd-stage">
      <span class="mv-cd ll-cd" id="llCd" aria-hidden="true" style="${window.mvCdStyle ? mvCdStyle(beat.id) : ''}"></span>
      <div class="ll-cover-wrap">
        ${coverEl}
        <div class="ll-play-overlay" onclick="llWavePlay()">
          <button class="ll-play-overlay-btn" id="llPlayBtn" aria-label="Spill av / pause"><span class="ic ic-play" aria-hidden="true"></span></button>
        </div>
      </div>
      </div>
      <div class="ll-song-info">
        <h2 class="ll-beat-title">${esc(beat.name)}${window.mvIsSongPublic && window.mvIsSongPublic(beat.id) && (beat._shared || !window.mvSetSongPublic) ? ' <span class="mv-public-badge' + (window.mvBadgeAttrs ? mvBadgeAttrs(beat.id) : '') + '" title="Synlig for alle med Music Vault-konto i Explore"><span class="ic ic-globe" aria-hidden="true"></span> Offentlig</span>' : ''}</h2>
        <div class="ll-song-stage"><span class="ll-stage-lbl" aria-hidden="true">Steg</span>
          <span class="ll-stage-ctl" title="Låtens steg — samme som i Pipeline og album">
    <select class="ll-status-pill ll-stage-${stage.key}" aria-label="Låtens steg" onchange="llSetStatus(this.value)">
      ${(window.mvStages ? mvStages.list : []).map(s=>`<option value="${s.key}"${s.key===stage.key?' selected':''}>${s.label}</option>`).join('')}
    </select>
    <span class="ll-stage-pct" title="Låtens fremdrift (settes av deg) — tekstens fremdrift står over seksjonene"><span class="ll-stage-pct-lbl">Fremdrift</span> <span id="llStagePct">${window.mvStages ? mvStages.fmt(mvStages.pct(beat)) : '0 %'}</span></span>
  </span>
        </div>
        <div class="ll-song-meta" id="llSongMeta">${metaBits.map(b=>`<span>${b}</span>`).join('<span class="ll-dot" aria-hidden="true">·</span>')}</div>
        <div class="ll-song-controls">
          ${window.mvSetSongPublic && !beat._shared ? (() => { const on = window.mvIsSongPublic(beat.id); return `<button class="ll-ctrl-btn mv-public-toggle${on ? ' is-on' : ''}" role="switch" aria-checked="${on}" onclick="mvSetSongPublic('${esc(beat.id)}', !mvIsSongPublic('${esc(beat.id)}')).then(()=>window.renderLyricLab&&renderLyricLab())" title="Vis låten i Explore for alle med Music Vault-konto"><span class="ic ic-globe" aria-hidden="true"></span> ${on ? 'Offentlig: På' : 'Offentlig: Av'}</button>`; })() : ''}
          <details class="mv-proj-menu ll-more-menu">
            <summary class="ll-ctrl-btn ll-more-btn" aria-label="Flere valg for låten">⋯</summary>
            <div class="mv-proj-menu-panel">
              <button class="ghost-btn" onclick="llAnalyzeFlow()" title="Fargekod rimlinjer"><span class="ic ic-wave" aria-hidden="true"></span> Flow-analyse</button>
              <button class="ghost-btn" onclick="llInspirasjon()" title="Inspirasjon fra andre sanger"><span class="ic ic-pen" aria-hidden="true"></span> Inspirasjon</button>
              <button class="ghost-btn" onclick="llShare()" title="Åpner tekstarket i en ny fane. Kun lokalt — deles ikke."><span class="ic ic-file" aria-hidden="true"></span> Tekstark</button>
              <button class="ghost-btn" onclick="shareSong('${esc(beat.id)}','song')" title="Alle med lenken kan åpne låten — den vises ikke på Explore"><span class="ic ic-link" aria-hidden="true"></span> Lag delingslenke</button>
            </div>
          </details>
        </div>
      </div>
    </div>

    <div class="ll-player ll-wave-panel ll-deck">
      ${vuHTML()}
      <div class="ll-deck-transport">
        <button class="ll-play-main" id="llWavePlayBtn" onclick="llWavePlay()" aria-label="Spill av / pause" title="Spill av — fra starten av markeringen når loop er på"><span class="ic ic-play" aria-hidden="true"></span></button>
        <button class="ll-deck-btn" id="llWaveLoopBtn" onclick="llToggleLoop()" title="Loop av/på — dra over bølgeformen for å markere"><span class="ic ic-refresh" aria-hidden="true"></span> Loop</button>
      </div>
      <div class="ll-wave-col">
        <div id="llWaveSurfer" class="ll-wave"></div>
        <div class="ll-player-row">
          <span class="ll-time"><span id="llWaveCur">0:00</span><span class="ll-time-sep">/</span><span id="llWaveTot">${dur}</span></span>
          <div class="ll-loop-bar" id="llLoopBar" style="display:none">
            <span class="ll-loop-tag">LOOP</span>
            <span class="ll-loop-times"><b id="llLoopStart">0:00</b><span class="ll-loop-arrow">→</span><b id="llLoopEnd">0:00</b></span>
            <span class="ll-loop-dur" id="llLoopDur">0s</span>
            <button class="ll-loop-clear" onclick="llClearLoop()" title="Fjern loop" aria-label="Fjern loop">✕</button>
          </div>
          <span class="ll-player-hint" id="llPlayerHint">Dra over bølgeformen for å markere et loopområde</span>
          <span class="ll-player-spacer"></span>
          <span class="ll-zoom-row">
            <span class="ll-zoom-ico"><span class="ic ic-search" aria-hidden="true"></span></span>
            <input type="range" id="llWaveZoom" class="ll-zoom-slider" min="0" max="100" value="0" oninput="llZoomWave(this.value)" aria-label="Zoom i bølgeformen">
            <span class="ll-zoom-val" id="llWaveZoomVal">1×</span>
          </span>
        </div>
      </div>
      ${knobsHTML(beat)}
      <div class="ll-knob-pop" id="llKnobPop" role="dialog" aria-label="Låtinfo" hidden><span class="ll-more-lbl">Låtinfo</span><div class="ll-more-fields"><label class="ll-ctrl-field" title="${beat.bpmSource==='fil'?'Hentet fra lydfilen':beat.bpmSource==='filnavn'?'Hentet fra filnavnet':beat.bpmSource==='manuell'?'Satt for hånd':'Ikke funnet'} — skriv for å rette"><span>BPM</span><input class="ll-bpm-input" type="number" inputmode="numeric" min="40" max="300" step="1" value="${Number(beat.bpm)>0?esc(String(beat.bpm)):''}" placeholder="–" aria-label="BPM for ${esc(beat.name)}" onchange="if(window.mvSetBpm&&mvSetBpm('${esc(beat.id)}',this.value)===false){this.value='${Number(beat.bpm)>0?esc(String(beat.bpm)):''}'}else{llRefreshMeta()}"></label><label class="ll-ctrl-field"><span>Toneart</span><select class="ll-key-select" aria-label="Toneart for ${esc(beat.name)}" onchange="llSetKey('${esc(beat.id)}',this.value)"><option value=""${beat.key?'':' selected'}>–</option>${keyOpts.map(([v,l])=>`<option value="${esc(v)}"${v===beat.key?' selected':''}>${esc(l)}</option>`).join('')}</select></label></div></div>
    </div>

    <div class="ll-editor-header">
      <div class="ll-editor-progress" title="Hvor mange seksjoner som har tekst. Låtens fremdrift (det release ser på) står ved steget øverst.">
        <span class="ll-prog-lbl">Tekst skrevet</span>
        <div class="ll-progbar"><div class="ll-progbar-fill" id="llProgFill" style="width:${prog}%"></div></div>
        <span class="ll-prog-pct" id="llProgPct">${llSecCount(beat)}</span>
      </div>
      <details class="ll-color-tools ll-color-pop" id="llColorPop">
        <summary class="ll-tool-btn ll-color-sum" onmousedown="event.preventDefault()" aria-label="Fargemarkering av tekst"><span class="ll-color-sum-dot" aria-hidden="true"></span>Farge</summary>
        <div class="ll-color-row" role="group" aria-label="Velg farge for markert tekst">
          <button class="ll-color-dot ll-color-named" onmousedown="event.preventDefault()" onclick="llApplyColorActive('#d68155')" aria-label="Farge: Kobber"><i style="background:#d68155"></i>Kobber</button>
          <button class="ll-color-dot ll-color-named" onmousedown="event.preventDefault()" onclick="llApplyColorActive('#a6be8b')" aria-label="Farge: Grønn"><i style="background:#a6be8b"></i>Grønn</button>
          <button class="ll-color-dot ll-color-named" onmousedown="event.preventDefault()" onclick="llApplyColorActive('#bfb2a6')" aria-label="Farge: Grå"><i style="background:#bfb2a6"></i>Grå</button>
          <button class="ll-color-dot ll-color-named" onmousedown="event.preventDefault()" onclick="llApplyColorActive('#ec4899')" aria-label="Farge: Rosa"><i style="background:#ec4899"></i>Rosa</button>
          <button class="ll-color-dot ll-color-named" onmousedown="event.preventDefault()" onclick="llApplyColorActive('#ffaaa3')" aria-label="Farge: Rød"><i style="background:#ffaaa3"></i>Rød</button>
          <button class="ll-color-dot ll-color-named" onmousedown="event.preventDefault()" onclick="llApplyColorActive('#f0a579')" aria-label="Farge: Lys kobber"><i style="background:#f0a579"></i>Lys kobber</button>
          <button class="ll-color-dot ll-color-named ll-color-clear" onmousedown="event.preventDefault()" onclick="llApplyColorActive(null)" aria-label="Fjern farge"><i aria-hidden="true">✕</i>Ingen</button>
          <button type="button" class="ll-color-clearflow" onmousedown="event.preventDefault()" onclick="llClearFlow(true)" title="Fjerner fargene fra flow-analysen — kan angres">Fjern flow-farger</button>
          <span id="llColorHint" class="ll-color-hint">Marker tekst, velg så farge. Bruk dem som du vil — f.eks. rim, ad-libs eller det som skal kuttes.</span>
        </div>
      </details>
      <button class="ll-tool-btn primary" onclick="llAddSection()">+ Seksjon</button>
    </div>
    <div id="llInspirasjonBox" style="display:none;background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:12px 14px;margin-bottom:8px"></div>
    <div id="llFlowLegend" style="display:none;font-size:11px;font-weight:700;color:var(--muted);padding:4px 0 8px;text-align:right"></div>

    <div id="llSections">
      ${sections.sort((a,b)=>a.order-b.order).map(s=>sectionHTML(s,beat)).join('')}
    </div>

    <div class="ll-statusbar" id="llStatusBar">
      <div class="ll-statusbar-dot"></div>
      <span>Autosave aktiv</span>
      <span id="llLastSaved" style="color:var(--muted)">Alt er lagret</span>
      <span style="margin-left:auto">Ord: <strong id="llStatWords">${words}</strong></span>
      <span>Linjer: <strong id="llStatLines">${lines}</strong></span>
      <span>Est.: <strong id="llStatDur">${estimateDuration(words)}</strong></span>
    </div>
  </div>

  <!-- HØYRE: notater, takes, memoer, verktøy -->
  <div class="ll-right">
    <!-- To faner: Skriv (det du trenger mens du skriver) og Spill inn (takes, memoer, metronom, akkorder). Husker valget. -->
    <div class="ll-rail-tabs" role="tablist" aria-label="Verktøy i Lyric Lab">
      <button type="button" role="tab" class="ll-rail-tab" id="llRailTabWrite" data-rail="write" aria-controls="llRailWrite" onclick="llSetRail('write')">Skriv</button>
      <button type="button" role="tab" class="ll-rail-tab" id="llRailTabRec" data-rail="rec" aria-controls="llRailRec" onclick="llSetRail('rec')">Spill inn <span class="ll-count-badge" id="llRecCount"></span></button>
    </div>
    <div class="ll-rail-panel" id="llRailWrite" role="tabpanel" aria-labelledby="llRailTabWrite">
    <div class="ll-card ll-side-card">
      <div class="ll-side-hd"><h3 class="ll-side-title">Notater</h3><button class="ll-side-icon" onclick="document.getElementById('llNotes').focus()" title="Skriv notat" aria-label="Skriv notat"><span class="ic ic-pen" aria-hidden="true"></span></button></div>
      <textarea id="llNotes" class="ll-notes" placeholder="Idéer, tema, referanser, hva sangen handler om…" oninput="llSaveNotes(this.value)">${esc(beat.lyricNotes||'')}</textarea>
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
      <div class="ll-stat-title">Tags</div>
      <div class="ll-tags" id="llTagList"></div>
      <input id="llTagInput" class="ll-tag-input" placeholder="+ legg til tag (Enter)" onkeydown="if(event.key==='Enter'){llAddTag(this.value);this.value='';}">
    </div>

    ${repeated.length ? `
    <div class="ll-card ll-stat-card">
      <div class="ll-stat-title">Gjentagende ord</div>
      <div class="ll-repeated-list">
        ${repeated.map(([w,n])=>`<span class="ll-word-chip" data-no-i18n>${esc(w)} ×${n}</span>`).join('')}
      </div>
    </div>` : ''}
    </div>
    <div class="ll-rail-panel" id="llRailRec" role="tabpanel" aria-labelledby="llRailTabRec">
    <div class="ll-card ll-side-card">
      <div class="ll-side-hd"><h3 class="ll-side-title">Takes <span class="ll-count-badge" id="llTakeCount"></span></h3><button class="ll-side-btn" id="llTakeBtn" onclick="llRecordTake()" title="Spill inn vokal over beaten"><span class="ic ic-plus" aria-hidden="true"></span> Ny take</button></div>
      <div class="ll-mic">
        <label class="ll-mic-row"><span class="ic ic-mic" aria-hidden="true"></span>
          <select id="llMicSelect" aria-label="Mikrofon" onchange="llMicChanged(this)"><option value="">Standardmikrofon</option></select>
        </label>
        <button type="button" class="ll-mic-access" id="llMicAccess" onclick="llMicGrant()">Vis mikrofonene mine</button>
        <label class="ll-sync" title="Flytt vokalen i forhold til beaten. Høyere tall = vokalen trekkes tidligere.">
          <span>Synk</span>
          <input type="range" id="llSyncMs" min="-150" max="400" step="5" value="${Number((()=>{try{return localStorage.getItem('mv_rec_sync_ms')}catch(e){return 0}})())||0}" oninput="llSyncChanged(this)">
          <output id="llSyncVal">${(()=>{const v=Number((()=>{try{return localStorage.getItem('mv_rec_sync_ms')}catch(e){return 0}})())||0;return (v>0?'+':'')+v+' ms';})()}</output>
        </label>
        <p class="ll-mic-hint">Bruk hodetelefoner. Havner vokalen litt sent, dra «Synk» mot høyre (Bluetooth trenger ofte +150–250 ms).</p>
      </div>
      <div id="llTakeList" class="ll-take-list"></div>
    </div>

    <div class="ll-card ll-side-card">
      <div class="ll-side-hd"><h3 class="ll-side-title">Memoer <span class="ll-count-badge" id="llMemoCount"></span></h3><button class="ll-side-btn" id="llMemoBtn" onclick="llRecordMemo()" title="Rask idé-memo"><span class="ic ic-mic" aria-hidden="true"></span> Memo</button></div>
      <div id="llMemoList" class="ll-take-list"></div>
    </div>

      <div id="llRecTools"></div>
    </div>
  </div>

</div>
</div><!-- /.ll-wrap -->
`;
    _lastSaved = null;
    llSetRail(llRailPref(), true);
    setTimeout(()=>{ renderMemoList(); renderTakeList(); fillMicSelect(); renderTags(beat); initWaveSurfer(beat); updateRightPanel(beat); llRecCount(); }, 100);
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
  <div class="ll-empty-icon"><span class="ic ic-pen" aria-hidden="true"></span></div>
  <h2>Velg en låt å skrive på</h2>
  <div class="ll-empty-btns">
    <button class="primary-btn" onclick="llPickBeat()"><span class="ic ic-music" aria-hidden="true"></span> Velg en låt</button>
    ${last ? `<button class="ghost-btn" onclick="openInLyricLab('${esc(last.id)}')"><span class="ic ic-clock" aria-hidden="true"></span> Åpne siste: ${esc(last.name)}</button>` : ''}
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
        hint.style.color = '#d68155';
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
    if (!sec) return;
    if (title === llSecTitle(sec.title)) return;   // bare vist på et annet språk — ikke et nytt navn
    sec.title = title; saveSections(beat);
    const inp = document.querySelector(`#llsec-${CSS.escape(id)} .ll-section-title-input`); if (inp) inp.dataset.orig = title;
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
    openMic()
      .then(stream => {
        _memoChunks = [];
        const mime = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/ogg';
        _memoRecorder = new MediaRecorder(stream, { mimeType: mime });
        _memoRecorder.ondataavailable = e => { if(e.data.size>0) _memoChunks.push(e.data); };
        _memoRecorder.onstart = () => {
          const btn = document.getElementById('llMemoBtn');
          if(btn){ btn.textContent='Stopp memo'; btn.style.background='rgba(255,170,163,.2)'; btn.style.borderColor='rgba(255,170,163,.4)'; }
          let secs = 0;
          _memoInterval = setInterval(()=>{ secs++; const b=document.getElementById('llMemoBtn'); if(b) b.textContent=`Stopp (${secs}s)`; if(secs>=60) _memoRecorder?.stop(); }, 1000);
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
    queueMicrotask(()=>{ try{ llRecCount(); }catch(e){} });
    if (badge) badge.textContent = memos.length || '';
    el.innerHTML = memos.length
      ? memos.map((m,i) => `
          <div class="ll-memo-row ll-take-row">
            <button class="ll-take-play" onclick="llTakeToggle(this)" aria-label="Spill memo ${i+1}"><span class="ic ic-play" aria-hidden="true"></span></button>
            <span class="ll-take-name">Memo ${i+1}</span>
            <audio preload="none" src="${m.url}" hidden></audio>
            <span class="ll-memo-ts">${new Date(m.ts).toLocaleTimeString('no-NO',{hour:'2-digit',minute:'2-digit'})}</span>
            <button class="ll-memo-del" onclick="llDeleteMemo('${esc(beat.id)}',${i})" title="Slett memo" aria-label="Slett memo ${i+1}">✕</button>
          </div>`).join('')
      : '<p style="font-size:11px;color:var(--muted);margin:0">Ingen memoer ennå</p>';
  }

  // Sletting av opptak kan ikke gjøres om på annen måte — derfor «Angre» i 7 s
  // før slettingen lagres (en vokaltake kan ikke spilles inn på nytt likt).
  function softDelete(list, idx, label, rerender){
    const item = list[idx]; if (!item) return;
    list.splice(idx, 1); rerender();
    let undone = false;
    const commit = setTimeout(() => { if (!undone && typeof saveState === 'function') saveState(); }, 7600);
    if (typeof showToast === 'function') showToast(label + ' slettet', 'Angre', () => {
      undone = true; clearTimeout(commit);
      list.splice(Math.min(idx, list.length), 0, item);
      if (typeof saveState === 'function') saveState();          // i tilfelle noe annet lagret imens
      rerender();
    });
  }
  window.llDeleteMemo = function(beatId, idx) {
    const beat = getBeat(beatId); if(!beat||!beat.memos) return;
    softDelete(beat.memos, idx, 'Memo ' + (idx + 1), renderMemoList);
  };

  // Velg låtens steg (felles modell, js/stages.js): setter «Ferdig %» inn i stegets område
  window.llSetStatus = function(key) {
    const beat = getBeat(window.currentLyricLabBeatId);
    if (!beat || !window.mvStages) return;
    mvStages.set(beat, key);
    const s = mvStages.of(beat);
    const pill = document.querySelector('.ll-status-pill');
    if (pill) { pill.className = 'll-status-pill ll-stage-' + s.key; pill.value = s.key; void pill.offsetWidth; pill.classList.add('is-changed'); }
    const pct = document.getElementById('llStagePct'); if (pct) pct.textContent = mvStages.fmt(mvStages.pct(beat));
    if (typeof saveState === 'function') saveState();
    if (typeof showToast === 'function') showToast('✓ Steg: ' + s.label + ' (' + mvStages.pct(beat) + ' %)');
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

  // Gå til en bestemt seksjon (fra «Mangler tekst»)
  window.llGoSection = function(id) {
    const ta = document.getElementById(`lltxt-${id}`);
    if (ta) { ta.scrollIntoView({ behavior:'smooth', block:'center' }); ta.focus(); }
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


    function renderList(beats, emptyMsg) {
      if (!beats.length) return `<div class="ll-picker-empty">${emptyMsg}</div>`;
      return beats.map(b => `
        <div class="ll-picker-row" onclick="openInLyricLab('${esc(b.id)}');document.getElementById('llBeatPicker').remove()">
          ${b.cover ? `<img class="ll-picker-thumb" src="${esc(b.cover)}" alt="">` : '<div class="ll-picker-thumb ll-picker-ph"><span class="ic ic-music" aria-hidden="true"></span></div>'}
          <div class="ll-picker-info">
            <div class="ll-picker-name">${esc(b.name)}</div>
            <div class="ll-picker-meta">${window.mvStages ? mvStages.of(b).label : ''}${b.bpm ? ' · ' + b.bpm + ' bpm' : ''}</div>
          </div>
          ${b.favorite ? '<span style="color:var(--accent-ink);font-size:14px">★</span>' : ''}
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
          <button class="ll-picker-tab active" onclick="llPickerTab(this,'all')">Alle låter</button>
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
            ${b.cover ? `<img class="ll-picker-thumb" src="${esc(b.cover)}" alt="">` : '<div class="ll-picker-thumb ll-picker-ph"><span class="ic ic-music" aria-hidden="true"></span></div>'}
            <div class="ll-picker-info">
              <div class="ll-picker-name">${esc(b.name)}</div>
              <div class="ll-picker-meta">${window.mvStages ? mvStages.of(b).label : ''}${b.bpm ? ' · ' + b.bpm + ' bpm' : ''}</div>
            </div>
            ${b.favorite ? '<span style="color:var(--accent-ink);font-size:14px">★</span>' : ''}
          </div>`).join('')
      : `<div class="ll-picker-empty">Ingen treff for "${esc(query)}"</div>`;
  };

  window.llCreateNewBeat = function() {
    if (typeof showToast === 'function') showToast('Opprett en sang i Mixtapes eller Albumer først');
  };

  // «Tekst skrevet»: antall seksjoner med tekst (ikke prosent, så det ikke forveksles med låtens fremdrift)
  function llSecCount(beat) {
    const secs = (getSections(beat) || []).filter(Boolean);
    const n = secs.length, w = secs.filter(s => (s.text || '').trim()).length;
    return n ? `${w}/${n} seksjoner` : '0 seksjoner';
  }

  // ── Smart "Mangler"-panel ─────────────────────────────────────────────────
  function missingCardHTML(beat) {
    const missing = missingSections(beat);
    const anyEmpty = (getSections(beat) || []).some(s => !(s.text || '').trim());
    if (!missing.length && !anyEmpty) {
      return `<div class="ll-stat-title">Struktur</div>
        <div class="ll-struct-ok">✓ Alle hoveddeler er med</div>`;
    }
    // Skill «finnes ikke» fra «finnes, men er tom»: llAddMissing hopper allerede
    // til en tom seksjon av typen i stedet for å lage en duplikat.
    // To grupper, så kortet ikke motsier «Tekst 100 %»: tomme seksjoner du HAR («Mangler tekst»)
    // og vanlige deler låten ikke har ennå («Kan legges til»). llAddMissing hopper til en tom seksjon.
    const secs = getSections(beat) || [];
    const row = (t, empty) => { const name = esc(empty ? llSecTitle(empty.title) : (TYPE_LABELS[t]||t));
      return `<button class="ll-missing-item" onclick="llAddMissing('${t}')" aria-label="${empty ? `Gå til tom seksjon: ${name}` : `Legg til seksjon: ${name}`}">
          <span class="ll-missing-dot ll-type-${t}"></span>
          <span class="ll-missing-name">${name}</span>
          <span class="ll-missing-add">${empty ? 'Tom – gå til' : '+ Legg til'}</span>
        </button>`; };
    // Alle tomme seksjoner listes (også Vers 2, Outro osv.) — hver knapp går til akkurat den seksjonen
    const emptyRow = s => { const name = esc(llSecTitle(s.title)); return `<button class="ll-missing-item" onclick="llGoSection('${esc(s.id)}')" aria-label="Gå til tom seksjon: ${name}">
          <span class="ll-missing-dot ll-type-${esc(s.type)}"></span>
          <span class="ll-missing-name">${name}</span>
          <span class="ll-missing-add">Tom – gå til</span>
        </button>`; };
    const empties = secs.filter(s => !(s.text || '').trim()).map(emptyRow), absent = [];
    missing.forEach(t => { if (!secs.some(s => s.type === t)) absent.push(row(t, null)); });
    return (empties.length ? `<div class="ll-stat-title">Mangler tekst</div><div class="ll-missing-list">${empties.join('')}</div>` : '')
      + (absent.length ? `<div class="ll-stat-title"${empties.length ? ' style="margin-top:12px"' : ''}>Kan legges til</div><div class="ll-missing-list">${absent.join('')}</div>` : '')
      || `<div class="ll-stat-title">Struktur</div><div class="ll-struct-ok">✓ Alle hoveddeler er med</div>`;
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
    // tekstfremdrift (linja over seksjonene)
    setTxt('llProgPct', llSecCount(beat));
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
        <button class="ghost-btn" style="font-size:11px;padding:5px 10px" onclick="openInLyricLab('${esc(beatId)}')"><span class="ic ic-pen" aria-hidden="true"></span> Åpne i Lyric Lab</button>
      </div>
    </div>`;
  }

  function inlineSectionHTML(sec, beatId) {
    const typeClass = `ll-type-${sec.type}`;
    const lineCount = countLines(sec.text);
    return `<div class="ll-section${sec.collapsed?' collapsed':''}" id="llins-sec-${esc(beatId)}-${esc(sec.id)}" style="margin-bottom:8px">
      <div class="ll-section-header" onclick="llInlineToggle('${esc(beatId)}','${esc(sec.id)}')">
        <span class="ll-section-type ${typeClass}">${esc(TYPE_LABELS[sec.type]||sec.type)}</span>
        <input class="ll-section-title-input" value="${esc(llSecTitle(sec.title))}" data-orig="${esc(sec.title)}" title="Klikk for å gi seksjonen nytt navn" aria-label="Navn på seksjon: ${esc(llSecTitle(sec.title))}" spellcheck="false" onclick="event.stopPropagation()"
          onchange="llInlineRename('${esc(beatId)}','${esc(sec.id)}',this.value)">
        <span class="ll-section-line-count">${lineCount} ${lineCount===1?'linje':'linjer'}</span>
        <button class="ll-section-toggle" title="${sec.collapsed?'Vis seksjonen':'Skjul seksjonen'}" aria-label="${sec.collapsed?'Vis seksjonen':'Skjul seksjonen'}" aria-expanded="${!sec.collapsed}">${sec.collapsed?'▸':'▾'}</button>
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

  // ── Mikrofon (velger + innstillinger for musikk) ─────────────────────────
  // Nettleserens «telefon»-filtre (ekkofjerning, støydemping, auto-volum)
  // forsinker og ødelegger vokal over musikk — de slås av. Valgt mikrofon
  // huskes per enhet (localStorage mv_mic).
  const MIC_KEY = 'mv_mic', SYNC_KEY = 'mv_rec_sync_ms';
  const lsGet = k => { try { return localStorage.getItem(k); } catch(e){ return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch(e){} };
  function micConstraints(deviceId){
    const c = { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 };
    if (deviceId) c.deviceId = { exact: deviceId };
    return { audio: c, video: false };
  }
  async function openMic(){
    const id = lsGet(MIC_KEY) || '';
    try { return await navigator.mediaDevices.getUserMedia(micConstraints(id)); }
    catch(e){
      if (id && (e.name === 'OverconstrainedError' || e.name === 'NotFoundError' || e.name === 'NotReadableError')){
        lsSet(MIC_KEY, '');                                   // mikrofonen er borte — bruk standard
        return navigator.mediaDevices.getUserMedia(micConstraints(''));
      }
      throw e;
    }
  }
  window.llOpenMic = openMic;
  async function fillMicSelect(){
    const sel = document.getElementById('llMicSelect'); if (!sel || !navigator.mediaDevices?.enumerateDevices) return;
    let devs = [];
    try { devs = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'audioinput'); } catch(e){}
    const saved = lsGet(MIC_KEY) || '';
    const named = devs.some(d => d.label);
    sel.innerHTML = `<option value="">Standardmikrofon</option>` + devs.filter(d => d.deviceId && d.deviceId !== 'default')
      .map((d, i) => `<option value="${esc(d.deviceId)}" ${d.deviceId === saved ? 'selected' : ''}>${esc(d.label || 'Mikrofon ' + (i + 1))}</option>`).join('');
    const access = document.getElementById('llMicAccess');
    if (access) access.hidden = named;                       // navn vises først etter tilgang
  }
  window.llMicChanged = function(sel){ lsSet(MIC_KEY, sel.value); if (typeof showToast === 'function') showToast('✓ Mikrofon valgt'); };
  window.llMicGrant = async function(){
    try { const st = await openMic(); st.getTracks().forEach(t => t.stop()); }
    catch(e){ if (typeof showToast === 'function') showToast('Fikk ikke tilgang til mikrofonen: ' + e.message); }
    fillMicSelect();
  };
  window.llSyncChanged = function(inp){
    lsSet(SYNC_KEY, inp.value);
    const out = document.getElementById('llSyncVal'); if (out) out.textContent = (inp.value > 0 ? '+' : '') + inp.value + ' ms';
  };
  if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) navigator.mediaDevices.addEventListener('devicechange', fillMicSelect);
  window.llFillMicSelect = fillMicSelect;

  // ── Spill inn vokal over beaten ──────────────────────────────────────────
  // Hvorfor vokalen havnet for sent: du hører beaten etter utgangsforsinkelsen
  // (høyttaler/Bluetooth) og mikrofonen leverer lyden etter inngangsforsinkelsen.
  // Vokalen kommer altså L sekunder etter beaten den hører til. Løsning: i
  // OPPTAKET forsinkes beaten like mye (DelayNode), så de havner i takt.
  // L = målt forsinkelse (AudioContext + mikrofon) + manuell justering.
  window.llRecordTake = async function() {
    if (_takeRecorder && _takeRecorder.state === 'recording') { _takeRecorder.stop(); return; }
    if (_takeRecorder && _takeRecorder.state === 'preparing') return;
    if (!navigator.mediaDevices?.getUserMedia) { if (typeof showToast === 'function') showToast('Mikrofon ikke tilgjengelig'); return; }

    const beat = getBeat(window.currentLyricLabBeatId);
    if (!beat) { if (typeof showToast === 'function') showToast('Velg en sang først'); return; }
    const btn = document.getElementById('llTakeBtn');
    const setBtn = t => { if (btn) btn.textContent = t; };
    _takeRecorder = { state: 'preparing' };

    // 1) Mikrofon og beat gjøres klare FØR opptellingen (tilgangsspørsmål og
    //    nedlasting skal ikke forskyve starten).
    let micStream, beatBlobUrl = null;
    try {
      setBtn('Gjør klar …');
      micStream = await openMic();
      fillMicSelect();
      const beatUrl = beat.audio_url || beat.url || null;
      if (beatUrl){
        try { const r = await fetch(beatUrl); if (r.ok) beatBlobUrl = URL.createObjectURL(await r.blob()); } catch(e){}
      }
    } catch(err){
      _takeRecorder = null; setBtn('Ny take');
      if (typeof showToast === 'function') showToast('Mikrofon feil: ' + err.message);
      return;
    }

    const go = () => startRecording(micStream, beatBlobUrl, beat, btn, setBtn);
    if (window.mvMetronome && window.mvMetronome.countInEnabled() && Number(beat.bpm) > 0){
      setBtn('Teller opp …');
      window.mvMetronome.countIn(beat.bpm, n => setBtn(String(n)), go);
    } else {
      let count = 3; setBtn(`Starter om ${count}s...`);
      const cd = setInterval(() => { count--; if (count > 0) setBtn(`Starter om ${count}s...`); else { clearInterval(cd); go(); } }, 1000);
    }
  };

  function startRecording(micStream, beatBlobUrl, beat, btn, setBtn){
    _takeChunks = []; _takeSecs = 0;
    const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : (MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/ogg');
    const ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
    const dest = ctx.createMediaStreamDestination();

    // Vokal → opptak
    const micSrc = ctx.createMediaStreamSource(micStream);
    const micGain = ctx.createGain(); micGain.gain.value = 1.4;
    micSrc.connect(micGain).connect(dest);

    // Forsinkelse: utgang (baseLatency + outputLatency) + mikrofon (track.latency) + manuell justering
    const track = micStream.getAudioTracks()[0];
    const inLat = (track && track.getSettings && track.getSettings().latency) || 0;
    const manual = (Number(lsGet(SYNC_KEY)) || 0) / 1000;
    const measured = (ctx.baseLatency || 0) + (ctx.outputLatency || 0) + inLat;
    const L = Math.min(1.5, Math.max(0, measured + manual));

    // Beat → høyttaler (én gang) og → forsinket inn i opptaket
    let beatEl = null;
    if (beatBlobUrl){
      beatEl = new Audio(beatBlobUrl);
      const src = ctx.createMediaElementSource(beatEl);
      src.connect(ctx.destination);
      const delay = ctx.createDelay(2.0); delay.delayTime.value = L;
      src.connect(delay).connect(dest);
    }

    const rec = new MediaRecorder(dest.stream, { mimeType: mime });
    _takeRecorder = rec;
    rec.ondataavailable = e => { if (e.data.size > 0) _takeChunks.push(e.data); };
    rec.onstart = () => {
      setBtn('Stopp innspilling');
      _takeInterval = setInterval(() => { _takeSecs++; }, 1000);
      if (typeof showToast === 'function') showToast('Innspilling startet');
    };
    rec.onstop = () => {
      clearInterval(_takeInterval);
      micStream.getTracks().forEach(t => t.stop());
      if (beatEl) beatEl.pause();
      ctx.close().catch(() => {});
      if (beatBlobUrl) URL.revokeObjectURL(beatBlobUrl);
      setBtn('Ny take');
      // Den første biten (L sekunder) er bare vokal før beaten — klippes ikke, men er kort.
      const blob = new Blob(_takeChunks, { type: mime });
      const reader = new FileReader();
      reader.onload = ev => {
        if (!beat.takes) beat.takes = [];
        beat.takes.push({ id: uid(), url: ev.target.result, ts: Date.now(), dur: _takeSecs, mime, syncMs: Math.round(L * 1000) });
        if (typeof saveState === 'function') saveState();
        renderTakeList();
        if (typeof showToast === 'function') showToast(`✓ Take lagret (${_takeSecs}s)`);
      };
      reader.readAsDataURL(blob);
      _takeRecorder = null;
    };
    if (beatEl) beatEl.addEventListener('ended', () => { if (rec.state === 'recording') rec.stop(); }, { once: true });

    ctx.resume().then(() => {
      rec.start(500);
      if (beatEl) beatEl.play().catch(() => {});
    });
  }

  function renderTakeList() {
    const beat = getBeat(window.currentLyricLabBeatId);
    const el   = document.getElementById('llTakeList');
    if(!el || !beat) return;
    const takes = beat.takes || [];
    const badge = document.getElementById('llTakeCount');
    queueMicrotask(()=>{ try{ llRecCount(); }catch(e){} });
    if (badge) badge.textContent = takes.length || '';
    el.innerHTML = takes.length
      ? takes.map((t,i) => ({t,i})).reverse().map(({t,i}) => {
          const m = Math.floor((t.dur||0)/60), s = String((t.dur||0)%60).padStart(2,'0');
          return `<div class="ll-memo-row ll-take-row">
            <button class="ll-take-play" onclick="llTakeToggle(this)" aria-label="Spill Take ${i+1}"><span class="ic ic-play" aria-hidden="true"></span></button>
            <span class="ll-take-name">Take ${i+1} (vokal)</span>
            <audio preload="none" src="${t.url}" hidden></audio>
            <span class="ll-memo-ts">${m}:${s}</span>
            <button class="ll-memo-del" onclick="llDeleteTake('${esc(beat.id)}',${i})" title="Slett take" aria-label="Slett Take ${i+1}">✕</button>
          </div>`;
        }).join('')
      : '<p style="font-size:11px;color:var(--muted);margin:0">Ingen takes ennå</p>';
  }
  window.llDeleteTake = function(beatId, idx) {
    const beat = getBeat(beatId); if(!beat||!beat.takes) return;
    softDelete(beat.takes, idx, 'Take ' + (idx + 1), renderTakeList);
  };

  window.renderInlineSections = renderInlineSections;


  // ── Rimbank via Claude API ────────────────────────────────────────────────
  window.llFindRhymes = async function() {
    const input = document.getElementById('llRhymeInput');
    const results = document.getElementById('llRhymeResults');
    if(!input || !results) return;
    const word = input.value.trim();
    if(!word) return;

    results.innerHTML = '<p style="font-size:11px;color:rgb(var(--ink-rgb) / calc(.4 + (1 - .4) * var(--ink-boost)));margin:0">Søker...</p>';

    try {
      // Route through Cloudflare Worker (has ANTHROPIC_API_KEY as secret)
      const workerUrl = window.R2_WORKER_URL || window.MV_CONFIG.R2_WORKER_URL;
      const res = await fetch(`${workerUrl}/rhyme`, {
        method: 'POST',
        headers: await window.mvAuthHeaders({'Content-Type':'application/json'}),
        body: JSON.stringify({ word })
      });
      if (res.status === 429) { if (typeof showToast === 'function') showToast('Mange AI-forespørsler på kort tid — vent et minutt'); throw new Error('For mange forespørsler'); }
      const data = await res.json();
      const text = data.text || '';
      let parsed;
      try { parsed = JSON.parse(text.replace(/```json|```/g,'')); } catch(e) { throw new Error('Parse feil'); }

      const { perfekte = [], nesten = [] } = parsed;
      results.innerHTML = `
        ${perfekte.length ? `
          <div style="margin-bottom:8px">
            <div style="font-size:10px;font-weight:800;letter-spacing:.08em;color:rgb(var(--ink-rgb) / calc(.3 + (1 - .3) * var(--ink-boost)));text-transform:uppercase;margin-bottom:5px">Perfekte rim</div>
            <div style="display:flex;flex-wrap:wrap;gap:4px">
              ${perfekte.map(w => `<button class="ll-rhyme-chip" onclick="llInsertRhyme('${w.replace(/'/g,"\'")}')">
                ${w}
              </button>`).join('')}
            </div>
          </div>` : ''}
        ${nesten.length ? `
          <div>
            <div style="font-size:10px;font-weight:800;letter-spacing:.08em;color:rgb(var(--ink-rgb) / calc(.3 + (1 - .3) * var(--ink-boost)));text-transform:uppercase;margin-bottom:5px">Nesten-rim</div>
            <div style="display:flex;flex-wrap:wrap;gap:4px">
              ${nesten.map(w => `<button class="ll-rhyme-chip muted" onclick="llInsertRhyme('${w.replace(/'/g,"\'")}')">
                ${w}
              </button>`).join('')}
            </div>
          </div>` : ''}
      `;
    } catch(e) {
      results.innerHTML = `<p style="font-size:11px;color:var(--danger);margin:0">Feil: ${e.message}</p>`;
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
    const b = document.getElementById('llWavePlayBtn'); if (b) b.innerHTML = playing ? '<span class="ic ic-pause" aria-hidden="true"></span>' : '<span class="ic ic-play" aria-hidden="true"></span>';
    const o = document.getElementById('llPlayBtn');     if (o) o.innerHTML = playing ? '<span class="ic ic-pause" aria-hidden="true"></span>' : '<span class="ic ic-play" aria-hidden="true"></span>';
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
    meterStop(); _meterPeaks = null;

    const audioUrl = beat.audio_url || beat.url || null;
    if (!audioUrl) {
      container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:64px;color:rgb(var(--ink-rgb) / calc(.25 + (1 - .25) * var(--ink-boost)));font-size:12px">Ingen lydfil</div>';
      return;
    }

    // Bølgeformen spiller gjennom BUNNSPILLERENS lydelement (db.js mvCueBeat), så
    // det som spiller fortsetter uavbrutt inn i Lyric Lab, og posisjon/pause er
    // felles. Er src den samme, laster WaveSurfer ikke lyden på nytt.
    async function build() {
      let src = null, media = null;
      if (typeof window.mvCueBeat === 'function' && window.mvBottomAudio) {
        try { src = await window.mvCueBeat(beat.id); } catch(e) {}
        if (src) media = window.mvBottomAudio;
      }
      if (!document.body.contains(container)) return;      // view re-rendered meanwhile
      _buildWS(container, src || audioUrl, media, beat);
    }
    function load() {
      if (window.WaveSurfer && window.WaveSurfer.Regions) { build(); return; }
      if (!window.WaveSurfer) {
        const s = document.createElement('script'); s.src = WS_URL;
        s.onload = () => {
          const r = document.createElement('script'); r.src = REGIONS_URL;
          r.onload = build;
          document.head.appendChild(r);
        };
        document.head.appendChild(s);
      } else {
        const r = document.createElement('script'); r.src = REGIONS_URL;
        r.onload = build;
        document.head.appendChild(r);
      }
    }
    load();
  }

  // Ferdig utregnet bølgeform (idé fra wavesurfer.js «peaks»): lagres første gang
  // låten åpnes, så den tegnes med en gang neste gang uten å dekode hele lydfila.
  const PEAKS_IDX = 'mv_peaks_idx';
  function peaksKey(beat){ return 'mv_peaks:' + beat.id; }
  function peaksSig(beat){ return String(beat.audio_url || beat.url || '') + '|' + (beat.audioUpdatedAt || ''); }
  function loadPeaks(beat){
    try{ const p = JSON.parse(localStorage.getItem(peaksKey(beat)) || 'null'); return p && p.sig === peaksSig(beat) && p.duration > 0 ? p : null; }catch(e){ return null; }
  }
  function savePeaks(beat, ws){
    try{
      const peaks = ws.exportPeaks({ maxLength: 1200, precision: 1000 }), duration = ws.getDuration();
      if (!peaks || !peaks.length || !(duration > 0)) return;
      localStorage.setItem(peaksKey(beat), JSON.stringify({ sig: peaksSig(beat), duration, peaks }));
      let idx = []; try{ idx = JSON.parse(localStorage.getItem(PEAKS_IDX) || '[]'); }catch(e){}
      idx = idx.filter(id => id !== beat.id); idx.push(beat.id);
      while (idx.length > 80){ localStorage.removeItem('mv_peaks:' + idx.shift()); }          // maks 80 låter
      localStorage.setItem(PEAKS_IDX, JSON.stringify(idx));
    }catch(e){ /* fullt lager e.l. — ikke kritisk */ }
  }

  function _buildWS(container, audioUrl, media, beat) {
    const cached = beat ? loadPeaks(beat) : null;
    // WaveSurfer v7 UMD: plugin exposed as WaveSurfer.Regions
    const RegionsCtor = window.WaveSurfer?.Regions;
    let regions = null;
    try { regions = RegionsCtor ? RegionsCtor.create() : null; } catch(e) {}
    _wsRegions = regions;
    const plugins = regions ? [regions] : [];

    try {
      _ws = WaveSurfer.create({
        container,
        waveColor:      'rgba(214,129,85,.4)',
        progressColor:  'rgba(214,129,85,.95)',
        cursorColor:    '#fff',
        cursorWidth:    2,
        height: 72, barWidth: 2, barGap: 1, barRadius: 3,
        normalize: true, url: audioUrl,
        ...(cached ? { peaks: cached.peaks, duration: cached.duration } : {}),
        ...(media ? { media } : {}),
        plugins,
      });
      // Delt lydelement som allerede spiller: vis riktig knapp/tid med en gang.
      if (media) {
        _setPlayIcon(!media.paused);
        const cur = document.getElementById('llWaveCur'); if (cur) cur.textContent = fmtT(media.currentTime);
      }

      _ws.on('play',  () => _setPlayIcon(true));
      _ws.on('pause', () => _setPlayIcon(false));
      _ws.on('finish', () => {
        _setPlayIcon(false);
        if (_wsLooping && _wsRegion) setTimeout(() => { _ws.setTime(_wsRegion.start); _ws.play(); }, 20);
      });

      const setTot = () => { const t=document.getElementById('llWaveTot'); if(t) t.textContent = fmtT(_ws.getDuration()); };
      _ws.on('decode', setTot);
      _meterPeaks = null;
      _ws.on('play', meterStart); _ws.on('pause', meterStop); _ws.on('finish', meterStop);
      if (media && !media.paused) meterStart();
      if (beat && !cached) _ws.once('decode', () => savePeaks(beat, _ws));
      _ws.on('ready',  setTot);
      // Lydfila kan spilles, men ikke leses for bølgeform (typisk CORS: R2-workeren
      // tillater bare github.io, så lokalt blir boksen tom). Si det i stedet for en tom flate.
      _ws.on('error', () => {
        const hint = document.getElementById('llPlayerHint');
        if (hint) hint.textContent = 'Bølgeformen kan ikke vises fra denne adressen — avspilling virker. Den vises på mekkis2002.github.io.';
        container.classList.add('ll-wave-unavailable');
      });

      _ws.on('timeupdate', t => {
        const cur = document.getElementById('llWaveCur'); if (cur) cur.textContent = fmtT(t);
        if (_wsLooping && _wsRegion && t >= _wsRegion.end - 0.03) {
          _ws.setTime(_wsRegion.start);
          if (!_ws.isPlaying()) _ws.play();
        }
      });

      if (regions) {
        _ws.on('ready', () => {
          if (regions.enableDragSelection) regions.enableDragSelection({ color: 'rgba(214,129,85,.18)' });
        });
        regions.on('region-created', reg => {
          try { regions.getRegions().forEach(r => { if (r !== reg) r.remove(); }); } catch(e) {}
          try { reg.setOptions({ color: 'rgba(214,129,85,.18)', resize: true, drag: true }); } catch(e) {}
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
    d.style.background='rgba(214,129,85,.15)';d.style.borderLeft='2px solid #d68155';d.style.borderRight='2px solid #d68155';
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
      if (window.llSetRail) llSetRail('write');
      const inp = document.getElementById('llRhymeInput');
      if (inp) inp.value = word;

      // Build popover
      const pop = document.createElement('div');
      pop.id = 'llRhymePopover';
      pop.style.cssText = `position:fixed;z-index:9000;background:var(--surface-1);border:1px solid rgb(var(--ink-rgb) / .15);`
        + `border-radius:12px;padding:10px 12px;min-width:220px;max-width:300px;`
        + `box-shadow:0 12px 40px rgb(var(--shadow-rgb) / calc(.7 * var(--shadow-k)));font-family:inherit;`;
      pop.style.left = Math.min(e.clientX, window.innerWidth - 320) + 'px';
      pop.style.top  = (e.clientY + 8) + 'px';
      pop.innerHTML = `<div style="font-size:11px;font-weight:900;letter-spacing:.08em;color:rgb(var(--ink-rgb) / calc(.35 + (1 - .35) * var(--ink-boost)));text-transform:uppercase;margin-bottom:8px">Rim for "${word}"</div>
        <div id="llPopoverResults" style="font-size:12px;color:rgb(var(--ink-rgb) / calc(.4 + (1 - .4) * var(--ink-boost)))">Laster...</div>`;
      document.body.appendChild(pop);
      _popover = pop;

      document.addEventListener('click', closePopover, { once: true });

      // Fetch rhymes
      try {
        const workerUrl = window.R2_WORKER_URL || window.MV_CONFIG.R2_WORKER_URL;
        const res = await fetch(`${workerUrl}/rhyme`, {
          method:'POST', headers: await window.mvAuthHeaders({'Content-Type':'application/json'}),
          body: JSON.stringify({word})
        });
        if (res.status === 429) { if (typeof showToast === 'function') showToast('Mange AI-forespørsler på kort tid — vent et minutt'); throw new Error('For mange forespørsler'); }
        const data = await res.json();
        let parsed;
        try { parsed = JSON.parse((data.text||'{}').replace(/```json|```/g,'')); } catch(e) { parsed = {}; }
        const { perfekte=[], nesten=[] } = parsed;
        const r = document.getElementById('llPopoverResults');
        if (!r) return;
        if (!perfekte.length && !nesten.length) { r.textContent = 'Ingen rimord funnet'; return; }
        r.innerHTML = [
          perfekte.length ? `<div style="margin-bottom:6px"><div style="font-size:9px;font-weight:800;letter-spacing:.1em;color:rgb(var(--ink-rgb) / calc(.25 + (1 - .25) * var(--ink-boost)));text-transform:uppercase;margin-bottom:4px">Perfekte rim</div><div style="display:flex;flex-wrap:wrap;gap:4px">${perfekte.map(w=>`<button onclick="event.stopPropagation();llInsertRhyme('${w}');document.getElementById('llRhymePopover')?.remove()" style="background:rgb(var(--accent-rgb) / .12);border:1px solid rgb(var(--accent-rgb) / .28);border-radius:999px;color:var(--accent-ink);font-size:11px;font-weight:800;padding:2px 8px;cursor:pointer;font-family:inherit">${w}</button>`).join('')}</div></div>` : '',
          nesten.length ? `<div><div style="font-size:9px;font-weight:800;letter-spacing:.1em;color:rgb(var(--ink-rgb) / calc(.25 + (1 - .25) * var(--ink-boost)));text-transform:uppercase;margin-bottom:4px">Nesten</div><div style="display:flex;flex-wrap:wrap;gap:4px">${nesten.slice(0,6).map(w=>`<button onclick="event.stopPropagation();llInsertRhyme('${w}');document.getElementById('llRhymePopover')?.remove()" style="background:rgb(var(--ink-rgb) / .06);border:1px solid rgb(var(--ink-rgb) / .1);border-radius:999px;color:rgb(var(--ink-rgb) / calc(.6 + (1 - .6) * var(--ink-boost)));font-size:11px;font-weight:800;padding:2px 8px;cursor:pointer;font-family:inherit">${w}</button>`).join('')}</div></div>` : ''
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
    'rgba(214,129,85,.35)',  // amber
    'rgba(214,129,85,.35)',  // purple
    'rgba(166,190,139,.35)',  // green
    'rgba(191,178,166,.35)',  // blue
    'rgba(255,170,163,.35)', // pink
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

  window.llClearFlow = function(withUndo) {
    if (withUndo && typeof showToast === 'function') setTimeout(() => showToast('Flow-fargene er fjernet', 'Angre', () => window.llAnalyzeFlow && llAnalyzeFlow()), 0);
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
    modal.style.cssText = `position:fixed;inset:0;z-index:3000;background:rgb(var(--shade-rgb) / .75);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;padding:20px`;
    modal.innerHTML = `<div style="background:var(--surface-sunken);border:1px solid rgb(var(--ink-rgb) / .1);border-radius:18px;width:100%;max-width:580px;max-height:80vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 24px 80px rgb(var(--shadow-rgb) / calc(.7 * var(--shadow-k)))">
      <div style="display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-bottom:1px solid rgb(var(--ink-rgb) / .07)">
        <span style="font-size:15px;font-weight:900">Versjonshistorikk — ${esc(sec.title)}</span>
        <button onclick="document.getElementById('llHistoryModal').remove()" style="background:none;border:none;color:rgb(var(--ink-rgb) / calc(.5 + (1 - .5) * var(--ink-boost)));font-size:18px;cursor:pointer">✕</button>
      </div>
      <div style="overflow-y:auto;padding:8px">
        ${hist.length === 0 ? '<p style="padding:16px;color:rgb(var(--ink-rgb) / calc(.3 + (1 - .3) * var(--ink-boost)));font-size:13px">Ingen lagrede versjoner ennå. Klikk <span class="ic ic-clock" aria-hidden="true"></span> i seksjonmenyen for å lagre.</p>'
          : [...hist].reverse().map((v, i) => {
            const d = new Date(v.ts);
            const label = d.toLocaleString('no-NO',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
            const preview = v.text.slice(0,120).replace(/&/g,'&amp;').replace(/</g,'&lt;');
            return `<div style="padding:12px;border-bottom:1px solid rgb(var(--ink-rgb) / .05)">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
                <span style="font-size:11px;color:rgb(var(--ink-rgb) / calc(.4 + (1 - .4) * var(--ink-boost)));font-weight:700">${label}</span>
                <button onclick="llRestoreVersion('${secId}',${hist.length-1-i})" style="background:rgb(var(--accent-rgb) / .12);border:1px solid rgb(var(--accent-rgb) / .3);border-radius:7px;color:var(--accent-ink);font-size:11px;font-weight:800;padding:3px 10px;cursor:pointer;font-family:inherit">Gjenopprett</button>
              </div>
              <pre style="font-size:12px;color:rgb(var(--ink-rgb) / calc(.55 + (1 - .55) * var(--ink-boost)));font-family:Georgia,serif;margin:0;white-space:pre-wrap;max-height:80px;overflow:hidden">${preview}${v.text.length>120?'…':''}</pre>
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
    if(typeof showToast==='function') showToast('Versjon gjenopprettet');
  };

  // Auto-snapshot on every save (after debounce)
  // NB: MÅ være en tilordning, ikke «function saveSections(){}». En deklarasjon
  // løftes (hoistes) over den opprinnelige på linje ~116 i samme scope, slik at
  // _origSaveSections pekte på seg selv → uendelig rekursjon og teksten ble
  // aldri lagret.
  const _origSaveSections = saveSections;
  saveSections = function (beat) {
    // Snapshot each dirty section before saving
    if (beat?.lyricSections) {
      beat.lyricSections.forEach(s => { if(s.text?.trim()) addVersionSnapshot(beat, s.id); });
    }
    _origSaveSections(beat);
  };


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
      el.innerHTML = '<p style="font-size:12px;color:rgb(var(--ink-rgb) / calc(.3 + (1 - .3) * var(--ink-boost)));margin:0">Skriv tekst på andre sanger for å få inspirasjon her</p>';
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
      <div style="font-size:10px;font-weight:800;letter-spacing:.08em;color:rgb(var(--ink-rgb) / calc(.25 + (1 - .25) * var(--ink-boost)));text-transform:uppercase;margin-bottom:8px">
        Genererer fra "${esc(beat.name)}"…
      </div>
      <div style="display:flex;align-items:center;gap:8px;color:rgb(var(--ink-rgb) / calc(.3 + (1 - .3) * var(--ink-boost)));font-size:13px">
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
      const workerUrl = window.R2_WORKER_URL || window.MV_CONFIG.R2_WORKER_URL;

      const res = await fetch(`${workerUrl}/inspire`, {
        method: 'POST',
        headers: await window.mvAuthHeaders({'Content-Type':'application/json'}),
        body: JSON.stringify({ beatName: beat.name, lyrics: lyrics.slice(0, 800) })
      });
      if (res.status === 429) { if (typeof showToast === 'function') showToast('Mange AI-forespørsler på kort tid — vent et minutt'); throw new Error('For mange forespørsler'); }

      const data = await res.json();
      const generated = (data.text || '').trim();

      if (!generated) throw new Error('Tom respons');

      el.innerHTML = `
        <div style="font-size:10px;font-weight:800;letter-spacing:.08em;color:rgb(var(--ink-rgb) / calc(.25 + (1 - .25) * var(--ink-boost)));text-transform:uppercase;margin-bottom:8px">
          Inspirert av "${esc(beat.name)}"
        </div>
        <div style="font-size:15px;font-family:Georgia,serif;color:rgb(var(--ink-rgb) / calc(.82 + (1 - .82) * var(--ink-boost)));font-style:italic;line-height:1.7;white-space:pre-wrap">${esc(generated)}</div>
        <div style="display:flex;gap:10px;margin-top:10px;align-items:center">
          <button type="button" class="ll-insp-btn" onclick="llInspirasjon()">↻ Ny inspirasjon</button>
          <button onclick="navigator.clipboard.writeText(this.closest('[id]').querySelector('div:nth-child(2)').innerText).then(()=>{this.textContent='✓ Kopiert';setTimeout(()=>this.textContent='Kopier',1500)})" type="button" class="ll-insp-btn">Kopier</button>
        </div>`;

    } catch(err) {
      console.error('[llInspirasjon] Feil:', err);
      el.innerHTML = `
        <div style="font-size:12px;color:rgba(255,113,113,.6);margin-bottom:6px">Kunne ikke generere inspirasjon — prøv igjen</div>
        <button onclick="llInspirasjon()" style="background:none;border:none;color:rgb(var(--ink-rgb) / calc(.3 + (1 - .3) * var(--ink-boost)));font-size:11px;cursor:pointer;font-family:inherit;padding:0;font-weight:800">↻ Prøv igjen</button>`;
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
<title>${esc(beat.name)}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:#0d0c0b;color:#f4eadc;font-family:'Georgia',serif;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:32px 16px}
  .card{max-width:640px;width:100%;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);border-radius:20px;overflow:hidden}
  .header{padding:28px 32px 20px;border-bottom:1px solid rgba(255,255,255,.07)}
  .label{font-size:10px;font-weight:800;letter-spacing:.15em;color:#d68155;text-transform:uppercase;margin-bottom:8px;font-family:system-ui}
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
    <h1>${esc(beat.name)}</h1>
    ${beat.source ? `<div class="meta">prod. ${esc(beat.source)}</div>` : ''}
    ${audioUrl ? `<audio controls src="${esc(audioUrl)}"></audio>` : ''}
  </div>
  <div class="lyrics">
    ${sections.filter(s=>s.text.trim()).map(s=>`
    <div class="section">
      <div class="section-label">${esc(s.title)}</div>
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
    if(typeof showToast==='function') showToast('✓ Tekstark åpnet i ny fane');
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
