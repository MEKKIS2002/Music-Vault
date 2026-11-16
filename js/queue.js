// ════════════════════════════════════════════════════════════════════════════
// queue.js — kø-panel og systemets mediekontroller (Media Session).
//
// Bygger på bunnspilleren i db.js: bottomPlayer.queue (beat-objekter),
// bottomPlayer.index, playBottomIndex(), bottomNext/Prev/TogglePlay/Stop(),
// updateBottomUI() og playSingleBeat(). Lastes etter db.js.
//
//  • Kø-panel: «Spilles nå», «Neste» (dra eller ▲▼ for å endre rekkefølge,
//    ✕ for å fjerne, Tøm) og «Nylig spilt» (state.settings.recentlyPlayed).
//  • window.mvQueuePlayNext(id) / mvQueueAdd(id): brukes fra ⋯-menyene.
//  • Media Session: tittel/cover/kontroller på låseskjerm, i medietaster og
//    Bluetooth-hodetelefoner.
// ════════════════════════════════════════════════════════════════════════════
(function(){
  'use strict';
  const bp = () => (typeof bottomPlayer !== 'undefined' ? bottomPlayer : null);
  const st = () => (typeof state !== 'undefined' ? state : window.state);
  const E = v => String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const fmt = s => { s = Number(s)||0; return s>0 ? Math.floor(s/60)+':'+String(Math.floor(s%60)).padStart(2,'0') : ''; };
  const toast = m => { if (typeof showToast === 'function') showToast(m); };
  const refreshPlayer = () => { if (typeof updateBottomUI === 'function') updateBottomUI(); };
  const active = () => { const p = bp(); return !!(p && p.queue && p.queue.length && p.started); };
  const ICON = n => `<span class="ic ic-${n}" aria-hidden="true"></span>`;

  // ── Kø-operasjoner ──────────────────────────────────────────────────────
  function findBeat(id){ return (st()?.beats||[]).find(b=>b.id===id) || null; }
  window.mvQueuePlayNext = function(beatId){
    const b = findBeat(beatId); if (!b) return;
    if (!active()) { if (typeof playSingleBeat === 'function') playSingleBeat(beatId); return; }
    const p = bp();
    const existing = p.queue.findIndex((x,i)=>i>p.index && x.id===beatId);
    if (existing > -1) p.queue.splice(existing,1);
    p.queue.splice(p.index+1, 0, b);
    refreshPlayer(); render(); toast('Spilles neste: '+(b.name||'sang'));
  };
  window.mvQueueAdd = function(beatId){
    const b = findBeat(beatId); if (!b) return;
    if (!active()) { if (typeof playSingleBeat === 'function') playSingleBeat(beatId); return; }
    bp().queue.push(b);
    refreshPlayer(); render(); toast('Lagt i køen: '+(b.name||'sang'));
  };
  function move(from, to){
    const p = bp(); if (!p) return;
    if (from<=p.index || to<=p.index || from>=p.queue.length || to>=p.queue.length) return;
    const [x] = p.queue.splice(from,1); p.queue.splice(to,0,x);
    refreshPlayer(); render(); focusRow(to);
  }
  function removeAt(i){
    const p = bp(); if (!p || i===p.index || i<0 || i>=p.queue.length) return;
    p.queue.splice(i,1); if (i < p.index) p.index--;
    refreshPlayer(); render();
  }
  function clearUpcoming(){
    const p = bp(); if (!p) return;
    p.queue = p.queue.slice(0, p.index+1);
    refreshPlayer(); render();
  }

  // ── Panel ───────────────────────────────────────────────────────────────
  function ensurePanel(){
    let el = document.getElementById('mvQueue');
    if (el) return el;
    el = document.createElement('aside');
    el.id = 'mvQueue'; el.className = 'mv-queue'; el.hidden = true;
    el.setAttribute('role','dialog'); el.setAttribute('aria-label','Kø');
    el.innerHTML = `
      <div class="mv-queue-hd"><h2>Kø</h2><button class="mv-queue-icon" type="button" data-q="close" aria-label="Lukk køen">✕</button></div>
      <div class="mv-queue-body">
        <section><h3 class="mv-eyebrow">Spilles nå</h3><div id="mvQueueNow"></div></section>
        <section><div class="mv-queue-sec-hd"><h3 class="mv-eyebrow">Neste</h3><button class="mv-queue-link" type="button" data-q="clear">Tøm</button></div><ol id="mvQueueNext" class="mv-queue-list"></ol></section>
        <section><h3 class="mv-eyebrow">Nylig spilt</h3><div id="mvQueueRecent" class="mv-queue-list"></div></section>
      </div>`;
    document.body.appendChild(el);
    el.addEventListener('click', onPanelClick);
    el.addEventListener('keydown', e=>{ if (e.key==='Escape'){ close(); } });
    // Dra og slipp for «Neste»
    el.addEventListener('dragstart', e=>{ const r=e.target.closest('[data-qi]'); if(!r) return; e.dataTransfer.effectAllowed='move'; e.dataTransfer.setData('text/plain', r.dataset.qi); r.classList.add('dragging'); });
    el.addEventListener('dragend', e=>{ e.target.closest?.('[data-qi]')?.classList.remove('dragging'); el.querySelectorAll('.drop-before,.drop-after').forEach(x=>x.classList.remove('drop-before','drop-after')); });
    el.addEventListener('dragover', e=>{ const r=e.target.closest('#mvQueueNext [data-qi]'); if(!r) return; e.preventDefault();
      const after = e.clientY > r.getBoundingClientRect().top + r.offsetHeight/2;
      el.querySelectorAll('.drop-before,.drop-after').forEach(x=>x.classList.remove('drop-before','drop-after'));
      r.classList.add(after?'drop-after':'drop-before'); });
    el.addEventListener('drop', e=>{ const r=e.target.closest('#mvQueueNext [data-qi]'); if(!r) return; e.preventDefault();
      const from = Number(e.dataTransfer.getData('text/plain')); let to = Number(r.dataset.qi);
      const after = e.clientY > r.getBoundingClientRect().top + r.offsetHeight/2;
      if (after) to++; if (from < to) to--; move(from, to); });
    return el;
  }
  function onPanelClick(e){
    const btn = e.target.closest('[data-q]');
    if (btn){ e.stopPropagation(); const i = Number(btn.dataset.i);
      switch(btn.dataset.q){
        case 'close': close(); return;
        case 'clear': clearUpcoming(); return;
        case 'up': move(i, i-1); return;
        case 'down': move(i, i+1); return;
        case 'remove': removeAt(i); return;
        case 'play': if (typeof playBottomIndex==='function') playBottomIndex(i); return;
        case 'recent': if (typeof playSingleBeat==='function') playSingleBeat(btn.dataset.id); return;
      } }
  }
  function cover(b){ return b && b.cover ? `<img src="${E(b.cover)}" alt="">` : ICON('music'); }
  function row(b, i, kind){
    const p = bp(); const first = i===p.index+1, last = i===p.queue.length-1;
    return `<li class="mv-queue-row" data-qi="${i}" draggable="true" data-cm-beat="${E(b.id)}" data-cm-mode="queue">
      <button class="mv-queue-main" type="button" data-q="play" data-i="${i}" aria-label="Spill ${E(b.name)}">
        <span class="mv-queue-cover">${cover(b)}</span>
        <span class="mv-queue-text"><b>${E(b.name||'Uten tittel')}</b><span>${E(b.uploadedBy||p.context?.label||'')}</span></span>
        <span class="mv-queue-dur">${fmt(b.duration)}</span>
      </button>
      <span class="mv-queue-tools">
        <button class="mv-queue-icon" type="button" data-q="up" data-i="${i}" aria-label="Flytt opp" ${first?'disabled':''}>▲</button>
        <button class="mv-queue-icon" type="button" data-q="down" data-i="${i}" aria-label="Flytt ned" ${last?'disabled':''}>▼</button>
        <button class="mv-queue-icon" type="button" data-q="remove" data-i="${i}" aria-label="Fjern ${E(b.name)} fra køen">✕</button>
      </span>
    </li>`;
  }
  function render(){
    const el = document.getElementById('mvQueue'); if (!el || el.hidden) return;
    const p = bp(); const q = p?.queue || []; const now = q[p?.index];
    document.getElementById('mvQueueNow').innerHTML = now
      ? `<div class="mv-queue-row is-now"><span class="mv-queue-main"><span class="mv-queue-cover">${cover(now)}</span><span class="mv-queue-text"><b>${E(now.name||'Uten tittel')}</b><span>${E(p.context?.label||'')}</span></span><span class="mv-queue-dur">${fmt(now.duration)}</span></span></div>`
      : `<p class="mv-queue-empty">Ingenting spiller nå.</p>`;
    const upcoming = q.map((b,i)=>({b,i})).filter(x=>x.i>p.index);
    document.getElementById('mvQueueNext').innerHTML = upcoming.length
      ? upcoming.map(x=>row(x.b, x.i)).join('')
      : `<li class="mv-queue-empty">Køen er tom. Bruk «Spill neste» eller «Legg i kø» i ⋯-menyen på en sang.</li>`;
    el.querySelector('[data-q="clear"]').hidden = !upcoming.length;
    const recentIds = (st()?.settings?.recentlyPlayed||[]).filter(id=>id!==now?.id).slice(0,8);
    const recent = recentIds.map(findBeat).filter(Boolean);
    document.getElementById('mvQueueRecent').innerHTML = recent.length
      ? recent.map(b=>`<button class="mv-queue-main mv-queue-recent" type="button" data-q="recent" data-id="${E(b.id)}" aria-label="Spill ${E(b.name)}"><span class="mv-queue-cover">${cover(b)}</span><span class="mv-queue-text"><b>${E(b.name||'Uten tittel')}</b><span>${fmt(b.duration)}</span></span></button>`).join('')
      : `<p class="mv-queue-empty">Ingen nylig spilte sanger.</p>`;
  }
  function focusRow(i){ requestAnimationFrame(()=>document.querySelector(`#mvQueueNext [data-qi="${i}"] .mv-queue-main`)?.focus()); }
  let lastFocus = null;
  function open(){ const el = ensurePanel(); lastFocus = document.activeElement; el.hidden = false; render(); syncBtns(true); el.querySelector('[data-q="close"]').focus(); }
  function close(){ const el = document.getElementById('mvQueue'); if (!el || el.hidden) return; el.hidden = true; syncBtns(false); lastFocus?.focus?.(); }
  window.mvToggleQueue = function(){ const el = ensurePanel(); el.hidden ? open() : close(); };
  function syncBtns(on){ document.querySelectorAll('.mv-queue-btn').forEach(b=>{ b.setAttribute('aria-expanded', on?'true':'false'); b.classList.toggle('active', on); }); }
  document.addEventListener('click', e=>{
    const el = document.getElementById('mvQueue');
    if (!el || el.hidden) return;
    if (e.target.closest('#mvQueue, .mv-queue-btn, .mv-row-menu, .bt-dropdown')) return;
    close();
  });

  // Kø-knapper i spilleren (desktop: ved volum; mobil: ved spill-knappen)
  function installButtons(){
    const svg = '<svg class="bp-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h11M4 11h11M4 16h7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M16 14v6l5-3z"/></svg>';
    const mk = cls => { const b=document.createElement('button'); b.type='button'; b.className='bp-btn mv-queue-btn '+cls; b.title='Kø'; b.setAttribute('aria-label','Vis køen'); b.setAttribute('aria-expanded','false'); b.setAttribute('aria-controls','mvQueue'); b.innerHTML=svg; b.addEventListener('click', e=>{ e.stopPropagation(); window.mvToggleQueue(); }); return b; };
    const actions = document.querySelector('#bottomPlayer .bp-actions');
    if (actions && !actions.querySelector('.mv-queue-btn')) actions.prepend(mk('mv-queue-btn-d'));
    const ctrls = document.querySelector('#bottomPlayer .bp-controls');
    if (ctrls && !ctrls.querySelector('.mv-queue-btn')) ctrls.append(mk('mv-queue-btn-m'));
    // Den gamle, usynlige «Play queue»-skuffen fra app.js er erstattet av dette panelet
    document.getElementById('queueDrawer')?.remove(); document.getElementById('queueToggleBtn')?.remove();
  }

  // ── Media Session: låseskjerm, medietaster, hodetelefoner ──────────────
  const ms = ('mediaSession' in navigator) ? navigator.mediaSession : null;
  let lastMetaId = null, lastPos = 0;
  function updateSession(force){
    if (!ms) return;
    const p = bp(); const a = p?.audio; const b = p?.queue?.[p.index];
    if (!b || !p.started){ if (lastMetaId!==null){ ms.metadata = null; ms.playbackState = 'none'; lastMetaId = null; } return; }
    const key = b.id+'|'+(p.context?.label||'');
    if (force || key !== lastMetaId){
      const art = b.cover ? [{ src:b.cover, sizes:'512x512' }] : [{ src:new URL('assets/favicon.png', location.href).href, sizes:'256x256', type:'image/png' }];
      try { ms.metadata = new MediaMetadata({ title:b.name||'Uten tittel', artist:b.uploadedBy||'Music Vault', album:p.context?.label||'', artwork:art }); } catch(e){}
      lastMetaId = key;
    }
    ms.playbackState = a && !a.paused ? 'playing' : 'paused';
  }
  function updatePosition(){
    if (!ms || !ms.setPositionState) return;
    const a = bp()?.audio; if (!a || !isFinite(a.duration) || a.duration<=0) return;
    try { ms.setPositionState({ duration:a.duration, playbackRate:a.playbackRate||1, position:Math.min(a.currentTime, a.duration) }); } catch(e){}
  }
  function installSession(){
    if (!ms) return;
    const a = () => bp()?.audio;
    const set = (k, fn) => { try { ms.setActionHandler(k, fn); } catch(e){} };
    set('play', ()=>{ const au=a(); if (au && au.src) au.play().catch(()=>{}); else if (typeof bottomTogglePlay==='function') bottomTogglePlay(); });
    set('pause', ()=>{ a()?.pause(); });
    set('previoustrack', ()=>{ if (typeof bottomPrev==='function') bottomPrev(); });
    set('nexttrack', ()=>{ if (typeof bottomNext==='function') bottomNext(); });
    set('stop', ()=>{ if (typeof bottomStop==='function') bottomStop(); });
    set('seekbackward', d=>{ const au=a(); if (au) au.currentTime = Math.max(0, au.currentTime-(d?.seekOffset||10)); updatePosition(); });
    set('seekforward',  d=>{ const au=a(); if (au && isFinite(au.duration)) au.currentTime = Math.min(au.duration-0.2, au.currentTime+(d?.seekOffset||10)); updatePosition(); });
    set('seekto', d=>{ const au=a(); if (au && d && isFinite(d.seekTime)){ if (d.fastSeek && au.fastSeek) au.fastSeek(d.seekTime); else au.currentTime = d.seekTime; updatePosition(); } });
  }

  // ── Oppkobling ──────────────────────────────────────────────────────────
  function start(){
    const p = bp(); if (!p || !p.audio) { setTimeout(start, 300); return; }
    installButtons(); installSession();
    setTimeout(installButtons, 1500);   // app.js legger inn den gamle skuffen etter oppstart
    const au = p.audio;
    ['loadstart','play','pause','ended','emptied','loadedmetadata'].forEach(ev=>au.addEventListener(ev, ()=>{ updateSession(ev==='loadedmetadata'); updatePosition(); render(); }));
    // «Nylig spilt»: app.js prøvde å pakke inn playBottomIndex før db.js definerte den,
    // så listen ble aldri fylt. Registrer her når et spor faktisk starter.
    let lastRecent = null;
    au.addEventListener('playing', ()=>{ const b = p.queue?.[p.index]; const s = st(); if (!b || !s || b.id===lastRecent) return; lastRecent = b.id;
      s.settings = s.settings || {}; s.settings.recentlyPlayed = [b.id, ...(s.settings.recentlyPlayed||[]).filter(x=>x!==b.id)].slice(0,30);
      try { localStorage.setItem(typeof getUserSK==='function' ? getUserSK() : 'musicVault.v4', JSON.stringify(s)); } catch(e){} });
    au.addEventListener('timeupdate', ()=>{ if (Math.abs(au.currentTime-lastPos) >= 1){ lastPos = au.currentTime; updatePosition(); } });
    // Spillerens tittel/kontekst byttes av updateBottomUI — følg med for kø og metadata
    const title = document.getElementById('bpTitle');
    if (title) new MutationObserver(()=>{ updateSession(); render(); }).observe(title, { childList:true, characterData:true, subtree:true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
