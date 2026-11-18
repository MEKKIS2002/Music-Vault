// ════════════════════════════════════════════════════════════════════════════
// search.js — uskarpt søk (idé fra Koel, useFuzzySearch.ts / Fuse.js, MIT).
//
// 1. mvFuzzy.score(spørring, tekst) → 0..1. Tåler skrivefeil («surdegsbrød»
//    finner «surdeigsbrød»), ord i feil rekkefølge, manglende aksenter og
//    forkortelser («nsfd» → «noe som får deg …»).
// 2. Søkevindu (Ctrl+K eller F): låter, album, mixtapes og sider på ett sted.
//    Piltaster + Enter. Enter på en låt spiller den, Shift+Enter åpner i Lyric Lab.
// 3. Beats-søket bruker samme uskarpe treff når det vanlige søket gir få svar.
// ════════════════════════════════════════════════════════════════════════════
(function(){
  'use strict';
  // ── 1. Uskarp matching ───────────────────────────────────────────────────
  const norm = s => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/æ/g, 'ae').replace(/ø/g, 'o').replace(/[^a-z0-9]+/g, ' ').trim();
  function editDist(a, b, max){
    if (Math.abs(a.length - b.length) > max) return max + 1;
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i), prev2 = null;
    for (let i = 1; i <= a.length; i++){
      const cur = [i]; let best = i;
      for (let j = 1; j <= b.length; j++){
        let v = Math.min(prev[j] + 1, cur[j-1] + 1, prev[j-1] + (a[i-1] === b[j-1] ? 0 : 1));
        if (prev2 && i > 1 && j > 1 && a[i-1] === b[j-2] && a[i-2] === b[j-1]) v = Math.min(v, prev2[j-2] + 1);   // bytte om to bokstaver
        cur.push(v); if (v < best) best = v;
      }
      if (best > max) return max + 1;
      prev2 = prev; prev = cur;
    }
    return prev[b.length];
  }
  function isSubseq(q, t){ let i = 0; for (const c of t){ if (c === q[i]) i++; if (i === q.length) return true; } return false; }
  function wordScore(qw, words){
    let best = 0;
    for (const w of words){
      if (w === qw) return 1;
      if (w.startsWith(qw)) best = Math.max(best, .92);
      else if (w.includes(qw)) best = Math.max(best, .8);
      else if (qw.length >= 3){
        const max = qw.length <= 4 ? 1 : 2;
        const d = Math.min(editDist(qw, w, max), editDist(qw, w.slice(0, qw.length), max));
        if (d <= max) best = Math.max(best, .72 - d * .08);
      }
    }
    return best;
  }
  function score(query, text){
    const q = norm(query), t = norm(text);
    if (!q) return 1; if (!t) return 0;
    if (t === q) return 1;
    if (t.startsWith(q)) return .97;
    if (t.includes(q)) return .9;
    const words = t.split(' '), qws = q.split(' ');
    let sum = 0;
    for (const qw of qws){ const s = wordScore(qw, words); if (!s) { sum = -1; break; } sum += s; }
    if (sum > 0) return .85 * sum / qws.length;
    // Forkortelse: forbokstavene («nsfd») eller bokstavene i rekkefølge
    const q1 = q.replace(/ /g, '');
    if (q1.length >= 2 && words.map(w => w[0]).join('').startsWith(q1)) return .6;
    if (q1.length >= 3 && isSubseq(q1, t.replace(/ /g, ''))) return .35;
    return 0;
  }
  // Beste treff over flere felt (navn veier mest)
  function rank(items, query, fields, min = .3){
    return items.map(it => {
      let s = 0;
      fields.forEach(([get, w]) => { const v = get(it); if (v) s = Math.max(s, score(query, v) * w); });
      return { it, s };
    }).filter(x => x.s >= min).sort((a, b) => b.s - a.s);
  }
  window.mvFuzzy = { score, rank, norm };

  // ── 2. Søkevindu ─────────────────────────────────────────────────────────
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const st = () => (typeof state !== 'undefined' ? state : window.state) || {};
  const PAGES = [['hjem','Hjem','home'],['beats','Beats','music'],['docs','Docs','file'],['mixtapes','Mixtapes','cassette'],['albums','Albumer','disc'],
    ['pipeline','Pipeline','board'],['lyriclab','Lyric Lab','pen'],['archive','Arkivert','archive'],['label','Label','tag'],['adminpanel','Admin','user'],['integrations','Integrasjoner','plug']];
  let box = null, results = [], sel = 0;

  function build(){
    box = document.createElement('div'); box.id = 'mvSearch'; box.className = 'mv-search';
    box.innerHTML = `<div class="mv-search-card" role="dialog" aria-modal="true" aria-label="Søk">
      <div class="mv-search-field"><span class="ic ic-search" aria-hidden="true"></span>
        <input type="search" class="mv-search-input" placeholder="Søk i låter, album, mixtapes og sider …" aria-label="Søk" autocomplete="off" spellcheck="false">
        <kbd>Esc</kbd></div>
      <ul class="mv-search-list" role="listbox"></ul>
      <p class="mv-search-foot"><span><kbd>↑</kbd><kbd>↓</kbd> velg</span><span><kbd>Enter</kbd> åpne / spill</span><span><kbd>Shift</kbd>+<kbd>Enter</kbd> Lyric Lab</span></p>
    </div>`;
    document.body.appendChild(box);
    const input = box.querySelector('input');
    input.addEventListener('input', () => { sel = 0; draw(input.value); });
    input.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown'){ e.preventDefault(); move(1); }
      else if (e.key === 'ArrowUp'){ e.preventDefault(); move(-1); }
      else if (e.key === 'Enter'){ e.preventDefault(); go(results[sel], e.shiftKey); }
      else if (e.key === 'Escape'){ e.preventDefault(); e.stopPropagation(); close(); }
    });
    box.addEventListener('mousedown', e => { if (e.target === box) close(); });
    box.addEventListener('click', e => { const li = e.target.closest('[data-i]'); if (li) go(results[Number(li.dataset.i)], e.shiftKey); });
    box.addEventListener('mousemove', e => { const li = e.target.closest('[data-i]'); if (li && Number(li.dataset.i) !== sel){ sel = Number(li.dataset.i); mark(); } });
  }
  function collect(q){
    const s = st(), out = [];
    const beats = (s.beats || []).filter(b => !b.archived);
    const inColl = id => [...(s.albums || []), ...(s.mixtapes || [])].filter(c => (c.beatIds || []).includes(id)).map(c => c.name).join(' ');
    if (!q.trim()){
      // Tomt søk: sist spilte låter + sider
      const recent = (s.settings?.recentlyPlayed || []).map(id => beats.find(b => b.id === id)).filter(Boolean).slice(0, 5);
      recent.forEach(b => out.push({ kind:'song', b, group:'Nylig spilt' }));
      PAGES.filter(p => isVisibleTab(p[0])).forEach(p => out.push({ kind:'page', p, group:'Sider' }));
      return out;
    }
    rank(beats, q, [[b => b.name, 1], [b => inColl(b.id), .7], [b => b.bpm ? b.bpm + ' bpm' : '', .8], [b => b.key, .6]]).slice(0, 8)
      .forEach(x => out.push({ kind:'song', b:x.it, group:'Låter', s:x.s }));
    rank((s.albums || []).filter(a => !a.archived), q, [[a => a.name, 1]]).slice(0, 4).forEach(x => out.push({ kind:'album', c:x.it, group:'Album', s:x.s }));
    rank((s.mixtapes || []).filter(m => !m.archived), q, [[m => m.name, 1]]).slice(0, 4).forEach(x => out.push({ kind:'mixtape', c:x.it, group:'Mixtapes', s:x.s }));
    rank(PAGES.filter(p => isVisibleTab(p[0])), q, [[p => p[1], 1]], .5).slice(0, 3).forEach(x => out.push({ kind:'page', p:x.it, group:'Sider', s:x.s }));
    // Best treff først innenfor hver gruppe, grupper i fast rekkefølge
    return out;
  }
  function isVisibleTab(tab){ const b = document.querySelector(`.tab-btn[data-tab="${tab}"]`); return !!b && b.style.display !== 'none' && getComputedStyle(b).display !== 'none'; }
  function row(r, i){
    let icon, title, sub;
    if (r.kind === 'song'){ icon = 'music'; title = r.b.name || 'Uten navn'; sub = [r.b.bpm ? r.b.bpm + ' BPM' : '', r.b.key || ''].filter(Boolean).join(' · '); }
    else if (r.kind === 'album'){ icon = 'disc'; title = r.c.name || 'Uten navn'; sub = (r.c.beatIds || []).length + ' sanger'; }
    else if (r.kind === 'mixtape'){ icon = 'cassette'; title = r.c.name || 'Uten navn'; sub = (r.c.beatIds || []).length + ' sanger'; }
    else { icon = r.p[2]; title = r.p[1]; sub = 'Gå til siden'; }
    const cover = (r.kind === 'song' && r.b.cover) || (r.c && r.c.cover);
    return `<li role="option" data-i="${i}" aria-selected="${i === sel}">
      <span class="mv-search-ic">${cover ? `<img src="${esc(cover)}" alt="">` : `<span class="ic ic-${icon}" aria-hidden="true"></span>`}</span>
      <span class="mv-search-txt"><b>${esc(title)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</span>
      <span class="mv-search-act">${r.kind === 'song' ? 'Spill' : 'Åpne'}</span></li>`;
  }
  function draw(q){
    results = collect(q);
    const list = box.querySelector('.mv-search-list');
    if (!results.length){ list.innerHTML = `<li class="mv-search-empty">Ingen treff på «${esc(q)}».</li>`; return; }
    let html = '', g = null;
    results.forEach((r, i) => { if (r.group !== g){ g = r.group; html += `<li class="mv-search-group" role="presentation">${esc(g)}</li>`; } html += row(r, i); });
    list.innerHTML = html;
  }
  function mark(){ box.querySelectorAll('[data-i]').forEach(li => li.setAttribute('aria-selected', Number(li.dataset.i) === sel)); box.querySelector(`[data-i="${sel}"]`)?.scrollIntoView({ block:'nearest' }); }
  function move(d){ if (!results.length) return; sel = (sel + d + results.length) % results.length; mark(); }
  function go(r, alt){
    if (!r) return; close();
    if (r.kind === 'song'){
      if (alt && typeof window.openInLyricLab === 'function') window.openInLyricLab(r.b.id);
      else if (typeof window.playSingleBeat === 'function') window.playSingleBeat(r.b.id);
    } else if (r.kind === 'album' || r.kind === 'mixtape'){
      if (typeof window.dashOpenProject === 'function') window.dashOpenProject(r.c.id, r.kind);
    } else document.querySelector(`.tab-btn[data-tab="${r.p[0]}"]`)?.click();
  }
  let ret = null;
  function open(){
    const ls = document.getElementById('lockScreen'); if (ls && getComputedStyle(ls).display !== 'none') return;
    if (!box) build();
    ret = document.activeElement;
    box.classList.add('open'); sel = 0;
    const input = box.querySelector('input'); input.value = ''; draw(''); input.focus();
  }
  function close(){ if (!box || !box.classList.contains('open')) return; box.classList.remove('open'); try{ ret?.focus?.(); }catch(e){} }
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'k'){ e.preventDefault(); e.stopImmediatePropagation(); box?.classList.contains('open') ? close() : open(); }
  }, true);
  window.mvSearch = { open, close };
  // Søkeknapp øverst i sidemenyen (også i mobilmenyen)
  function addNavButton(){
    const nav = document.querySelector('.mv-tabs'); if (!nav || nav.querySelector('.mv-nav-search')) return;
    const b = document.createElement('button'); b.type = 'button'; b.className = 'mv-nav-search';
    b.innerHTML = '<span class="ic ic-search" aria-hidden="true"></span><span>Søk</span><kbd>Ctrl K</kbd>';
    b.addEventListener('click', () => { if (typeof window.mvToggleNavDrawer === 'function' && document.body.classList.contains('mv-nav-open')) window.mvToggleNavDrawer(false); open(); });
    nav.insertBefore(b, nav.firstElementChild);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', addNavButton); else addNavButton();

  // ── 3. Beats-søket: legg til uskarpe treff ───────────────────────────────
  window.mvFuzzyBeats = function(beats, q, collNames){
    // Brukes av beats-tab.js: vanlige treff først, deretter uskarpe treff
    const ranked = rank(beats, q, [[b => b.name, 1], [b => collNames(b.id), .7]], .45);
    return ranked.map(x => x.it);
  };
})();
