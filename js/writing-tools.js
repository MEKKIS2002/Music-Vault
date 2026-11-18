// ════════════════════════════════════════════════════════════════════════════
// writing-tools.js — skriveverktøy inspirert av Google Docs / Word.
//
// DOCS (#docsBody i docs.js):
//   D1 Autoformat: «# » → H1, «## » → H2, «- »/«* » → punktliste, «1. » →
//      nummerert liste, «[] » → sjekkliste (klikk på boksen huker av).
//   D2 Hurtigtaster: Ctrl+Alt+1/2/0 (H1/H2/vanlig), Ctrl+Shift+7/8/9
//      (nummerert/punkt/sjekkliste), Ctrl+/ viser alle hurtigtaster.
//   D3 Dokumentoversikt: overskriftene i en kolonne ved siden av arket.
//   D4 Ordtelling og lesetid i verktøylinja.
// LYRIC LAB (.ll-textarea i lyriclab.js — tekst med «\n» mellom linjene):
//   L1 Stavelser per linje (≈, teller vokalgrupper — virker for norsk og engelsk).
//   L2 Fokusmodus: skjul alt unntatt teksten (Ctrl+Shift+F, Escape avslutter).
//   L5 Hurtigtaster: Ctrl+Enter ny seksjon, Alt+↑/↓ flytt linje,
//      Ctrl+Alt+↑/↓ forrige/neste seksjon, Ctrl+/ hjelp.
//   L6 Stavekontroll av/på (huskes i nettleseren).
// Endringer i editorene går gjennom de eksisterende input-hendelsene, så
// lagring skjer som før (docs.js scheduleSave / lyriclab.js llHighlightInput).
// ════════════════════════════════════════════════════════════════════════════
(function(){
  'use strict';
  const LS = { get:(k,d)=>{ try{ const v=localStorage.getItem(k); return v==null?d:v; }catch(e){ return d; } }, set:(k,v)=>{ try{ localStorage.setItem(k,v); }catch(e){} } };
  const fire = el => el.dispatchEvent(new Event('input', { bubbles:true }));
  const isMac = /Mac|iPhone|iPad/.test(navigator.platform||'');
  const MOD = isMac ? '⌘' : 'Ctrl';

  // ── Felles: hurtigtast-oversikt (Ctrl+/) ─────────────────────────────────
  const HELP = {
    docs: [
      ['Formatering mens du skriver', ''],
      ['# + mellomrom', 'Overskrift 1'], ['## + mellomrom', 'Overskrift 2'],
      ['- + mellomrom', 'Punktliste'], ['1. + mellomrom', 'Nummerert liste'], ['[] + mellomrom', 'Sjekkliste'],
      ['Hurtigtaster', ''],
      [MOD+'+B / '+MOD+'+I', 'Fet / kursiv'], [MOD+'+Alt+1 / 2', 'Overskrift 1 / 2'], [MOD+'+Alt+0', 'Vanlig tekst'],
      [MOD+'+Shift+7', 'Nummerert liste'], [MOD+'+Shift+8', 'Punktliste'], [MOD+'+Shift+9', 'Sjekkliste'],
      [MOD+'+/', 'Vis hurtigtaster'] ],
    lyric: [
      ['Skriving', ''],
      [MOD+'+Enter', 'Ny seksjon'], ['Alt+↑ / Alt+↓', 'Flytt linjen opp / ned'],
      [MOD+'+Alt+↑ / ↓', 'Forrige / neste seksjon'],
      ['Visning', ''],
      [MOD+'+Shift+F', 'Fokusmodus av/på'], ['Escape', 'Avslutt fokusmodus'],
      [MOD+'+/', 'Vis hurtigtaster'] ]
  };
  function showHelp(kind){
    let d = document.getElementById('mvKeysHelp');
    if (!d){ d = document.createElement('div'); d.id = 'mvKeysHelp'; d.className = 'mv-keys';
      d.addEventListener('click', e=>{ if (e.target === d || e.target.closest('[data-close]')) closeHelp(); });
      d.addEventListener('keydown', e=>{ if (e.key === 'Escape'){ e.stopPropagation(); closeHelp(); } });
      document.body.appendChild(d); }
    d._ret = document.activeElement;
    d.innerHTML = `<div class="mv-keys-card" role="dialog" aria-modal="true" aria-labelledby="mvKeysTitle">
      <div class="mv-keys-hd"><h2 id="mvKeysTitle">Hurtigtaster</h2><button type="button" data-close aria-label="Lukk">✕</button></div>
      <dl>${HELP[kind].map(([k,v])=> v ? `<div><dt>${k.split(' / ').map(x=>`<kbd>${x}</kbd>`).join(' / ')}</dt><dd>${v}</dd></div>` : `<p class="mv-keys-sec">${k}</p>`).join('')}</dl>
    </div>`;
    d.classList.add('open'); d.querySelector('[data-close]').focus();
  }
  function closeHelp(){ const d = document.getElementById('mvKeysHelp'); if (!d) return; d.classList.remove('open'); d._ret?.focus?.(); }

  // ── Hjelpere for markør og blokker ───────────────────────────────────────
  function caretRange(){ const s = getSelection(); return s && s.rangeCount ? s.getRangeAt(0) : null; }
  function blockOf(node, root){
    while (node && node !== root){ if (node.nodeType === 1 && /^(P|DIV|H1|H2|H3|LI|BLOCKQUOTE)$/.test(node.nodeName)) return node; node = node.parentNode; }
    return root;
  }

  // ════════════════════════════ DOCS ════════════════════════════════════════
  function docsInit(body){
    if (body._wt) return; body._wt = true;
    body.addEventListener('keydown', docsKeydown);
    body.addEventListener('click', docsChecklistClick);
    body.addEventListener('input', ()=>{ docsSoon(body); });
    docsUpdate(body);
  }
  function docsKeydown(e){
    const body = e.currentTarget;
    const mod = e.ctrlKey || e.metaKey;
    // D2 hurtigtaster
    if (mod && e.key === '/'){ e.preventDefault(); showHelp('docs'); return; }
    if (mod && e.altKey && !e.shiftKey && /^[012]$/.test(e.key)){ e.preventDefault(); document.execCommand('formatBlock', false, e.key==='0'?'p':'h'+e.key); return; }
    if (mod && e.shiftKey && !e.altKey && (e.code === 'Digit7' || e.code === 'Digit8' || e.code === 'Digit9')){
      e.preventDefault();
      if (e.code === 'Digit7') document.execCommand('insertOrderedList');
      else if (e.code === 'Digit8') document.execCommand('insertUnorderedList');
      else makeChecklist(body);
      return;
    }
    // D1 autoformat ved mellomrom i starten av en blokk
    if (e.key === ' ' && !mod && !e.altKey){
      const r = caretRange(); if (!r || !r.collapsed) return;
      const block = blockOf(r.startContainer, body);
      if (/^(LI|H1|H2)$/.test(block.nodeName)) return;
      const pre = document.createRange(); pre.setStart(block, 0); pre.setEnd(r.startContainer, r.startOffset);
      const typed = pre.toString();
      const rule = { '#':['h1'], '##':['h2'], '-':['ul'], '*':['ul'], '1.':['ol'], '[]':['check'], '[ ]':['check'] }[typed];
      if (!rule) return;
      e.preventDefault();
      const sel = getSelection(); sel.removeAllRanges(); sel.addRange(pre); document.execCommand('delete');
      const kind = rule[0];
      if (kind === 'h1' || kind === 'h2') document.execCommand('formatBlock', false, kind);
      else if (kind === 'ul') document.execCommand('insertUnorderedList');
      else if (kind === 'ol') document.execCommand('insertOrderedList');
      else makeChecklist(body);
    }
  }
  function makeChecklist(body){
    let r = caretRange(); if (!r) return;
    let li = blockOf(r.startContainer, body);
    if (li.nodeName !== 'LI'){ document.execCommand('insertUnorderedList'); r = caretRange(); li = r && blockOf(r.startContainer, body); }
    const ul = li && li.closest && li.closest('ul');
    if (ul){ ul.classList.toggle('docs-checklist'); fire(body); }
  }
  function docsChecklistClick(e){
    const li = e.target.closest('ul.docs-checklist > li'); if (!li) return;
    const box = li.getBoundingClientRect();
    if (e.clientX - box.left > 26) return;          // bare klikk på selve boksen
    e.preventDefault(); li.classList.toggle('is-done'); fire(e.currentTarget);
  }
  let docsTimer = null;
  function docsSoon(body){ clearTimeout(docsTimer); docsTimer = setTimeout(()=>docsUpdate(body), 250); }
  function docsUpdate(body){
    if (!document.contains(body)) return;
    // D4 ordtelling + lesetid
    const bar = document.querySelector('.docs-ed-bar');
    if (bar){
      let c = bar.querySelector('.docs-count');
      if (!c){ c = document.createElement('span'); c.className = 'docs-count'; c.setAttribute('aria-live','polite'); const save = bar.querySelector('#docsSaveState'); bar.insertBefore(c, save || null); }
      const words = (body.innerText || '').trim().split(/\s+/).filter(Boolean).length;
      c.textContent = words ? `${words} ${words===1?'ord':'ord'} · ${Math.max(1, Math.round(words/200))} min lesing` : '0 ord';
      if (!bar.querySelector('.docs-help-btn')){
        const h = document.createElement('button'); h.type='button'; h.className='docs-help-btn'; h.title='Hurtigtaster ('+MOD+'+/)'; h.setAttribute('aria-label','Vis hurtigtaster'); h.textContent='?';
        h.addEventListener('click', ()=>showHelp('docs')); bar.insertBefore(h, bar.querySelector('.docs-del-btn'));
      }
    }
    // D3 dokumentoversikt
    const editor = body.closest('.docs-editor'); if (!editor) return;
    let out = editor.querySelector('.docs-outline');
    const heads = [...body.querySelectorAll('h1, h2')].filter(h=>h.textContent.trim());
    if (!out){ out = document.createElement('nav'); out.className = 'docs-outline'; out.setAttribute('aria-label','Dokumentoversikt'); editor.appendChild(out);
      out.addEventListener('click', ev=>{ const b = ev.target.closest('[data-h]'); if (!b) return; const h = body.querySelectorAll('h1, h2')[Number(b.dataset.h)]; if (!h) return;
        h.scrollIntoView({ behavior:'smooth', block:'start' }); const rr = document.createRange(); rr.selectNodeContents(h); rr.collapse(false); const s = getSelection(); s.removeAllRanges(); s.addRange(rr); body.focus({preventScroll:true}); }); }
    const all = [...body.querySelectorAll('h1, h2')];
    out.innerHTML = `<p class="docs-outline-title">Oversikt</p>` + (heads.length
      ? `<ul>${heads.map(h=>`<li class="lvl-${h.nodeName[1]}"><button type="button" data-h="${all.indexOf(h)}">${h.textContent.trim().replace(/</g,'&lt;')}</button></li>`).join('')}</ul>`
      : `<p class="docs-outline-empty">Overskrifter du lager med «#» eller ${MOD}+Alt+1 vises her.</p>`);
    editor.classList.toggle('has-outline', true);
  }

  // ═════════════════════════ LYRIC LAB ══════════════════════════════════════
  // L1 stavelser: tell vokalgrupper per ord (min. 1 per ord med bokstaver)
  function syllables(line){
    const clean = line.replace(/%%COLOR:[^%]+%%|%%ENDCOLOR%%/g,'').toLowerCase();
    let n = 0;
    clean.split(/[^a-zæøåäöüéèêáàóòúùíì']+/).forEach(w=>{ if (!w) return; const g = w.match(/[aeiouyæøåäöüéèêáàóòúùíì]+/g); n += g ? g.length : (/[a-z]/.test(w) ? 1 : 0); });
    return n;
  }
  const llPrefs = { syl: LS.get('mv_ll_syl','0') === '1', spell: LS.get('mv_ll_spell','0') === '1' };
  function llEditors(){ return [...document.querySelectorAll('#lyriclabTab .ll-textarea[data-section-id]')]; }
  function lineStarts(ed){
    // Finn (tekstnode, offset) for starten av hver logiske linje (tekst skilt med «\n»)
    const starts = [], walker = document.createTreeWalker(ed, NodeFilter.SHOW_TEXT);
    let atStart = true, n;
    while ((n = walker.nextNode())){
      const v = n.nodeValue;
      for (let i = 0; i < v.length; i++){
        if (atStart){ starts.push({ node:n, off:i, ch:v[i] }); atStart = false; }
        if (v[i] === '\n'){ atStart = true; }
      }
    }
    return starts;
  }
  function drawSyllables(ed){
    const body = ed.closest('.ll-section-body'); if (!body) return;
    let g = body.querySelector('.ll-syl');
    if (!llPrefs.syl){ g?.remove(); return; }
    if (!g){ g = document.createElement('div'); g.className = 'll-syl'; g.setAttribute('aria-hidden','true'); body.appendChild(g); }
    const lines = (ed.innerText || '').replace(/\n$/,'').split('\n');
    const starts = lineStarts(ed); const top0 = body.getBoundingClientRect().top;
    let html = '', li = 0;
    for (const s of starts){
      const text = lines[li++] || '';
      if (s.ch === '\n' || !text.trim()) continue;
      const r = document.createRange(); r.setStart(s.node, s.off); r.setEnd(s.node, Math.min(s.off+1, s.node.nodeValue.length));
      const rc = r.getClientRects()[0]; if (!rc) continue;
      html += `<span style="top:${Math.round(rc.top - top0)}px;height:${Math.round(rc.height)}px">${syllables(text)}</span>`;
    }
    g.innerHTML = html;
  }
  function drawAllSyllables(){ llEditors().forEach(drawSyllables); }
  function applySpell(){ llEditors().forEach(ed=>{ ed.spellcheck = llPrefs.spell; if (llPrefs.spell) ed.setAttribute('lang','nb'); }); }

  function llToolbar(){
    const hd = document.querySelector('#lyriclabTab .ll-editor-header'); if (!hd || hd.querySelector('.ll-view-tools')) return;
    const t = document.createElement('div'); t.className = 'll-view-tools'; t.setAttribute('role','group'); t.setAttribute('aria-label','Visning');
    t.innerHTML = `
      <button type="button" class="ll-view-btn" data-v="syl" aria-pressed="${llPrefs.syl}" title="Vis omtrentlig antall stavelser per linje">Stavelser</button>
      <button type="button" class="ll-view-btn" data-v="spell" aria-pressed="${llPrefs.spell}" title="Stavekontroll av/på">Stavekontroll</button>
      <button type="button" class="ll-view-btn" data-v="focus" aria-pressed="${document.body.classList.contains('ll-focus')}" title="Fokusmodus (${MOD}+Shift+F)">Fokus</button>
      <button type="button" class="ll-view-btn ll-view-help" data-v="help" title="Hurtigtaster (${MOD}+/)" aria-label="Vis hurtigtaster">?</button>`;
    const add = hd.querySelector('.ll-tool-btn.primary');
    hd.insertBefore(t, add || null);
    t.addEventListener('click', e=>{ const b = e.target.closest('[data-v]'); if (!b) return;
      const v = b.dataset.v;
      if (v === 'syl'){ llPrefs.syl = !llPrefs.syl; LS.set('mv_ll_syl', llPrefs.syl?'1':'0'); drawAllSyllables(); }
      else if (v === 'spell'){ llPrefs.spell = !llPrefs.spell; LS.set('mv_ll_spell', llPrefs.spell?'1':'0'); applySpell(); }
      else if (v === 'focus'){ toggleFocus(); }
      else if (v === 'help'){ showHelp('lyric'); return; }
      syncToolbar(); });
  }
  function syncToolbar(){
    document.querySelectorAll('.ll-view-btn[data-v]').forEach(b=>{
      const v = b.dataset.v; if (v === 'help') return;
      const on = v === 'syl' ? llPrefs.syl : v === 'spell' ? llPrefs.spell : document.body.classList.contains('ll-focus');
      b.setAttribute('aria-pressed', on ? 'true' : 'false'); b.classList.toggle('is-on', on);
    });
  }
  function toggleFocus(force){
    const on = typeof force === 'boolean' ? force : !document.body.classList.contains('ll-focus');
    document.body.classList.toggle('ll-focus', on); syncToolbar();
    setTimeout(drawAllSyllables, 60);
    if (on && typeof showToast === 'function') showToast('Fokusmodus — trykk Escape for å avslutte');
  }

  // L5 hurtigtaster i Lyric Lab
  function caretLineInfo(ed){
    const r = caretRange(); if (!r || !ed.contains(r.startContainer)) return null;
    const pre = document.createRange(); pre.selectNodeContents(ed); pre.setEnd(r.startContainer, r.startOffset);
    const before = pre.toString();
    const line = (before.match(/\n/g)||[]).length; const col = before.length - (before.lastIndexOf('\n') + 1);
    return { line, col };
  }
  function placeCaret(ed, line, col){
    const starts = lineStarts(ed);
    // Finn posisjon via tegn-offset i hele teksten
    const text = ed.textContent; let pos = 0;
    for (let i = 0; i < line; i++){ const nx = text.indexOf('\n', pos); if (nx < 0) break; pos = nx + 1; }
    const end = text.indexOf('\n', pos); pos = Math.min(pos + col, end < 0 ? text.length : end);
    const walker = document.createTreeWalker(ed, NodeFilter.SHOW_TEXT); let n, acc = 0;
    while ((n = walker.nextNode())){ if (acc + n.nodeValue.length >= pos){ const r = document.createRange(); r.setStart(n, pos - acc); r.collapse(true); const s = getSelection(); s.removeAllRanges(); s.addRange(r); return; } acc += n.nodeValue.length; }
    void starts;
  }
  function moveLine(ed, dir){
    const info = caretLineInfo(ed); if (!info) return;
    const parts = ed.innerHTML.split('\n');
    const j = info.line + dir; if (j < 0 || j >= parts.length) return;
    // Ikke flytt hvis en fargemarkering går over flere linjer (ville ødelagt markeringen)
    if (/<mark[^>]*>[^<]*$/.test(parts[info.line]) || /<mark[^>]*>[^<]*$/.test(parts[j])) return;
    [parts[info.line], parts[j]] = [parts[j], parts[info.line]];
    ed.innerHTML = parts.join('\n');
    placeCaret(ed, j, info.col);
    fire(ed);
  }
  function llKeydown(e){
    const ed = e.target.closest && e.target.closest('#lyriclabTab .ll-textarea');
    const inLL = !!document.querySelector('#lyriclabTab:not(.hidden) .ll-v2, #lyriclabTab:not(.hidden) .ll-wrap');
    const mod = e.ctrlKey || e.metaKey;
    if (inLL && mod && e.shiftKey && (e.key === 'F' || e.key === 'f')){ e.preventDefault(); toggleFocus(); return; }
    if (inLL && e.key === 'Escape' && document.body.classList.contains('ll-focus') && !document.querySelector('.mv-cm, #mvKeysHelp.open')){ toggleFocus(false); return; }
    if (!ed) return;
    if (mod && e.key === '/'){ e.preventDefault(); showHelp('lyric'); return; }
    if (mod && e.key === 'Enter'){ e.preventDefault(); if (typeof window.llAddSection === 'function') window.llAddSection(); return; }
    if (e.altKey && !mod && (e.key === 'ArrowUp' || e.key === 'ArrowDown')){ e.preventDefault(); moveLine(ed, e.key === 'ArrowUp' ? -1 : 1); return; }
    if (mod && e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')){
      e.preventDefault(); const eds = llEditors(); const i = eds.indexOf(ed); const t = eds[i + (e.key === 'ArrowUp' ? -1 : 1)];
      if (t){ t.focus(); const r = document.createRange(); r.selectNodeContents(t); r.collapse(false); const s = getSelection(); s.removeAllRanges(); s.addRange(r); t.scrollIntoView({ block:'center', behavior:'smooth' }); }
    }
  }
  document.addEventListener('keydown', llKeydown);
  let sylTimer = null;
  document.addEventListener('input', e=>{ const ed = e.target.closest && e.target.closest('#lyriclabTab .ll-textarea'); if (!ed || !llPrefs.syl) return; clearTimeout(sylTimer); sylTimer = setTimeout(()=>drawSyllables(ed), 120); });
  window.addEventListener('resize', ()=>{ clearTimeout(sylTimer); sylTimer = setTimeout(drawAllSyllables, 150); });

  // ── Oppkobling: følg med når Docs/Lyric Lab tegnes på nytt ───────────────
  function scan(){
    const db = document.getElementById('docsBody'); if (db) docsInit(db);
    if (document.querySelector('#lyriclabTab .ll-editor-header')){ llToolbar(); syncToolbar(); applySpell(); drawAllSyllables(); }
    else if (document.body.classList.contains('ll-focus') && document.getElementById('lyriclabTab')?.classList.contains('hidden')) toggleFocus(false);
  }
  let scanTimer = null;
  function start(){
    // Reager bare når editorene faktisk tegnes på nytt — ikke på egne endringer
    // (stavelser, oversikt) eller spillerens tidsvisning, ellers går det i loop.
    const relevant = n => n.nodeType === 1 && (n.matches?.('#docsBody, .ll-editor-header, .ll-section, .docs-editor, #lyricLabContent > *, .tab-view') || n.querySelector?.('#docsBody, .ll-editor-header'));
    new MutationObserver(recs=>{ if (!recs.some(r=>[...r.addedNodes].some(relevant))) return; clearTimeout(scanTimer); scanTimer = setTimeout(scan, 60); })
      .observe(document.body, { childList:true, subtree:true });
    scan();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
  window.mvWritingTools = { syllables, showHelp, addHelp: (kind, rows) => { HELP[kind] = rows; } };
})();
