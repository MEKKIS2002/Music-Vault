// === track-cards.js ===
// Enkel, clean implementasjon av view mode + beat-kort for mixtape/album.
//
// VIEW MODE:
//   localStorage key: 'musicVaultTrackViewMode'
//   Verdier: 'list' | 'cards' | 'studio'
//   Standard: 'list'
//   setTrackViewMode(mode) og advancedSetTrackViewMode(mode) er eksponert på window.
//   Én click-lytter (bubbling, ikke capture) håndterer [data-track-view]-knapper.
//
// BEAT-KORT VISNING:
//   list   → .album-beat-listmode  — kompakte 44px Spotify-stil rader
//   cards  → .album-beat-grid      — grid med cover til venstre
//   studio → .album-beat-studio    — kanban-board sortert etter fremdrift
//
// TOGGLE-KNAPPER:
//   <button data-track-view="list|cards|studio"> i mixtape/album toolbar (index.html)
//   Aktiv-klasse synkroniseres via syncBtns() etter hver render.

'use strict';

// ── 1. MIXED-UI CLASS ────────────────────────────────────────────────────────
document.documentElement.classList.remove('mv-angular-ui');
document.documentElement.classList.add('mv-mixed-ui');

// ── 2. VIEW MODE ─────────────────────────────────────────────────────────────
(function(){
  const KEY = 'musicVaultTrackViewMode';

  function getView(){
    const v = localStorage.getItem(KEY);
    return ['list','cards','studio'].includes(v) ? v : 'list';
  }

  function applyViewClass(){
    const v = getView();
    ['mixtapeBeatList','albumBeatList'].forEach(id => {
      const el = document.getElementById(id);
      if(!el) return;
      el.classList.remove('album-beat-grid','album-beat-listmode','album-beat-studio');
      if(v === 'list')        el.classList.add('album-beat-listmode');
      else if(v === 'studio') el.classList.add('album-beat-studio');
      else                    el.classList.add('album-beat-grid');
    });
  }

  function syncBtns(){
    const v = getView();
    document.querySelectorAll('[data-track-view]').forEach(b =>
      b.classList.toggle('active', b.dataset.trackView === v)
    );
  }

  function activeType(){
    const mix = document.getElementById('mixtapeDetailView');
    const alb = document.getElementById('albumDetailView');
    if(mix && !mix.classList.contains('hidden')) return 'mixtape';
    if(alb && !alb.classList.contains('hidden')) return 'album';
    if(typeof currentMixtapeId !== 'undefined' && currentMixtapeId) return 'mixtape';
    if(typeof currentAlbumId   !== 'undefined' && currentAlbumId)   return 'album';
    return null;
  }

  function setView(mode){
    if(!['list','cards','studio'].includes(mode)) mode = 'list';
    try{ localStorage.setItem(KEY, mode); } catch(e){}
    applyViewClass();
    syncBtns();
    // Re-render so card HTML matches new mode
    const t = activeType();
    if(t === 'mixtape' && typeof renderMixtapeDetail === 'function') renderMixtapeDetail();
    else if(t === 'album' && typeof renderAlbumDetail === 'function') renderAlbumDetail();
  }

  // Single non-capture listener — no stopImmediatePropagation conflicts
  document.addEventListener('click', function(e){
    const btn = e.target.closest('[data-track-view]');
    if(!btn) return;
    setView(btn.dataset.trackView);
  });

  window.setTrackViewMode      = setView;
  window.advancedSetTrackViewMode = setView;

  // Apply on load and after each render
  function boot(){ applyViewClass(); syncBtns(); }
  document.addEventListener('DOMContentLoaded', boot);
  if(document.readyState !== 'loading') setTimeout(boot, 100);
})();


// ── 3. renderAlbumBeats HOOK — apply view class + enhance cards ───────────────
(function(){
  const KEY = 'musicVaultTrackViewMode';
  function getView(){ const v=localStorage.getItem(KEY); return ['list','cards','studio'].includes(v)?v:'list'; }

  function safe(s){ return (window.esc ? esc : String)(s || ''); }
  function getBeat(id){ return ((typeof state!=='undefined'?state:window.state)?.beats||[]).find(b=>b.id===id); }
  function hasAudio(b){ return !!(b.audio_url||b.url||b.driveUrl||b.drive_url); }
  function hasLyrics(b){ return !!(b.lyrics&&b.lyrics.trim()); }
  function coverForBeat(b, mode){
    if(b.cover) return b.cover;
    const coll = mode==='mixtape'
      ? (typeof state!=='undefined'?state:window.state)?.mixtapes?.find(m=>m.beatIds?.includes(b.id))
      : (typeof state!=='undefined'?state:window.state)?.albums?.find(a=>a.beatIds?.includes(b.id));
    return coll?.cover||'';
  }
  function fmtDur(sec){
    sec=Number(sec||0); if(!isFinite(sec)||sec<=0) return '';
    return Math.floor(sec/60)+':'+String(Math.floor(sec%60)).padStart(2,'0');
  }

  function enhanceCards(el, mode){
    if(!el) return;
    el.querySelectorAll('.album-beat-card:not(.abi-list-row)').forEach(card => {
      const b = getBeat(card.dataset.beatId);
      if(!b) return;
      // Cover
      const cover = coverForBeat(b, mode);
      if(cover && !card.querySelector('.ab-cover')){
        const ph = card.querySelector('.ab-cover-ph');
        if(ph) ph.outerHTML = `<img class="ab-cover" src="${safe(cover)}" alt="${safe(b.name)}">`;
      }
      // Quick play button + move star into actions group
      const titleRow = card.querySelector('.ab-body > div:first-child');
      if(titleRow && !titleRow.querySelector('.quick-play-btn')){
        const btn = document.createElement('button');
        btn.type='button'; btn.className='quick-play-btn'; btn.title='Spill sang';
        btn.textContent = '▶';
        btn.onclick = e => { e.stopPropagation(); if(typeof playCollectionFromBeat==='function') playCollectionFromBeat(b.id, mode); else if(typeof playSingleBeat==='function') playSingleBeat(b.id); };
        let actions = titleRow.querySelector('.track-card-actions');
        if(!actions){ actions=document.createElement('div'); actions.className='track-card-actions'; titleRow.appendChild(actions); }
        actions.prepend(btn);
        // Move the star-btn into actions so it's right next to play
        const starBtn = titleRow.querySelector('.star-btn');
        if(starBtn && !actions.querySelector('.star-btn')){
          actions.appendChild(starBtn);
        }
        // Move status dot (no audio / no lyric) next to play button
        const statusDot = titleRow.querySelector('.ab-status-dot');
        if(statusDot && !actions.querySelector('.ab-status-dot')){
          const star = actions.querySelector('.star-btn');
          if(star) actions.insertBefore(statusDot, star);
          else actions.appendChild(statusDot);
        }
      }
      // Duration in list mode
      if(getView()==='list' && b.duration){
        const titleRow2 = card.querySelector('.ab-body > div:first-child');
        let actions2 = titleRow2?.querySelector('.track-card-actions');
        if(actions2 && !actions2.querySelector('.track-duration')){
          const dur = document.createElement('span');
          dur.className='track-duration'; dur.textContent=fmtDur(b.duration);
          actions2.prepend(dur);
        }
      }
      // Status chips (only in cards/studio)
      if(getView()!=='list' && !card.querySelector('.beat-chip-row')){
        const body = card.querySelector('.ab-body');
        if(body){
          const chips = document.createElement('div'); chips.className='beat-chip-row';
          const status = Number(b.done||0)>=100?'Ferdig':(Number(b.done||0)>0?'Pågår':'Idé');
          chips.innerHTML = `<span class="pill">${status}</span>${hasAudio(b)?'<span class="pill">Lyd</span>':'<span class="pill muted">Mangler lyd</span>'}${hasLyrics(b)?'<span class="pill">Tekst</span>':''}`;
          body.appendChild(chips);
        }
      }
    });
    markPlayingCard();
  }

  // Studio kanban board
  function studioCol(b){ const d=Number(b.done||0); if(d>=100)return 'Ferdig'; if(d>=70)return 'Miks/Master'; if(d>=30)return 'Spilt inn'; return 'Idé/Skriver'; }
  function renderStudioBoard(el, mode){
    if(!el) return;
    let beats = Array.from(el.querySelectorAll('.album-beat-card')).map(c=>getBeat(c.dataset.beatId)).filter(Boolean);
    // F2: studio has its OWN order (col.studioOrder), independent of album/mixtape beatIds.
    // Order by studioOrder when present; any beat not yet in it falls back to album order.
    const _scol = (typeof activeCollectionForMode==='function') ? activeCollectionForMode(mode) : null;
    if(_scol && Array.isArray(_scol.studioOrder) && _scol.studioOrder.length){
      const byId = Object.fromEntries(beats.map(b=>[b.id,b]));
      const seen = new Set(); const ordered = [];
      _scol.studioOrder.forEach(id=>{ if(byId[id]&&!seen.has(id)){ ordered.push(byId[id]); seen.add(id); } });
      beats.forEach(b=>{ if(!seen.has(b.id)){ ordered.push(b); seen.add(b.id); } });
      beats = ordered;
    }
    const cols = [
      {key:'Idé/Skriver', label:'Idé / Skriver', cls:'s-idea'},
      {key:'Spilt inn',   label:'Spilt inn',     cls:'s-rec'},
      {key:'Miks/Master', label:'Miks / Master', cls:'s-mix'},
      {key:'Ferdig',      label:'Ferdig',        cls:'s-done'}
    ];
    const by = Object.fromEntries(cols.map(c=>[c.key,[]]));
    beats.forEach(b=>by[studioCol(b)].push(b));
    el.innerHTML = `<div class="studio-board">${cols.map(c=>`
      <div class="studio-col ${c.cls}">
        <div class="studio-col-head"><span class="studio-col-name">${c.label}</span><span class="studio-col-count">${by[c.key].length}</span></div>
        <div class="studio-col-body">${by[c.key].map(b=>{
          const cov=coverForBeat(b,mode);
          const pct=Math.max(0,Math.min(100,Number(b.done||0)));
          return `<div class="studio-track" data-beat-id="${safe(b.id)}" title="Åpne i Lyric Lab" onclick="if(typeof openInLyricLab==='function')openInLyricLab('${safe(b.id)}')">
            <div class="studio-thumb">${cov?`<img src="${safe(cov)}" alt="">`:'🎵'}</div>
            <div class="studio-main">
              <div class="studio-title">${safe(b.name)}</div>
              <div class="studio-prog"><span style="width:${pct}%"></span></div>
              <div class="studio-sub">${b.favorite?'★ ':''}${pct}% · ${hasAudio(b)?'Lyd':'<em>Mangler lyd</em>'}</div>
            </div>
            <button class="studio-play" title="Spill" onclick="event.stopPropagation();if(typeof playCollectionFromBeat==='function')playCollectionFromBeat('${safe(b.id)}','${mode||'album'}');else if(typeof playSingleBeat==='function')playSingleBeat('${safe(b.id)}')">▶</button>
          </div>`;
        }).join('')||'<div class="studio-empty">Ingen sanger her</div>'}</div>
      </div>`).join('')}</div>`;
    wireStudioDnD(el, mode);
  }

  // ── Studio drag-and-drop: move a song between stage columns ──────────────────
  // Dropping into another column snaps the song's `done%` into that stage's range;
  // dropping within the same column just reorders. A gold drop-line shows the target.
  let studioDrag = null;
  const STAGE_VAL = { 's-idea':10, 's-rec':40, 's-mix':80, 's-done':100 };
  const STAGE_KEY = { 's-idea':'Idé/Skriver', 's-rec':'Spilt inn', 's-mix':'Miks/Master', 's-done':'Ferdig' };
  const STAGE_LBL = { 's-idea':'Idé / Skriver', 's-rec':'Spilt inn', 's-mix':'Miks / Master', 's-done':'Ferdig' };
  function colClass(col){ return ['s-idea','s-rec','s-mix','s-done'].find(c=>col.classList.contains(c)); }
  function clearStudioDnD(board){
    if(!board) return;
    board.querySelectorAll('.studio-col-over').forEach(c=>c.classList.remove('studio-col-over'));
    board.querySelectorAll('.studio-drop-line').forEach(l=>l.remove());
    board.querySelectorAll('.studio-track.dragging').forEach(t=>t.classList.remove('dragging'));
  }
  function showStudioDropLine(col, clientY){
    const board = col.closest('.studio-board'); if(!board) return;
    board.querySelectorAll('.studio-col-over').forEach(c=>{ if(c!==col) c.classList.remove('studio-col-over'); });
    board.querySelectorAll('.studio-drop-line').forEach(l=>l.remove());
    col.classList.add('studio-col-over');
    const body = col.querySelector('.studio-col-body'); if(!body) return;
    const empty = body.querySelector('.studio-empty'); if(empty) empty.remove();
    const line = document.createElement('div'); line.className='studio-drop-line';
    const tracks = Array.from(body.querySelectorAll('.studio-track:not(.dragging)'));
    const ref = tracks.find(t=>{ const r=t.getBoundingClientRect(); return clientY < r.top + r.height/2; });
    if(ref) body.insertBefore(line, ref); else body.appendChild(line);
  }
  function wireStudioDnD(el, mode){
    const board = el.querySelector('.studio-board'); if(!board) return;
    board.querySelectorAll('.studio-track').forEach(t=>{
      t.setAttribute('draggable','true');
      t.addEventListener('dragstart', e=>{
        studioDrag = { beatId:t.dataset.beatId, mode };
        e.dataTransfer.effectAllowed='move';
        try{ e.dataTransfer.setData('text/plain', t.dataset.beatId); }catch(_){}
        setTimeout(()=>t.classList.add('dragging'),0);
      });
      t.addEventListener('dragend', ()=>{ clearStudioDnD(board); studioDrag=null; });
    });
    board.querySelectorAll('.studio-col').forEach(col=>{
      col.addEventListener('dragover', e=>{ if(!studioDrag) return; e.preventDefault(); e.dataTransfer.dropEffect='move'; showStudioDropLine(col, e.clientY); });
      col.addEventListener('dragleave', e=>{ if(!col.contains(e.relatedTarget)){ col.classList.remove('studio-col-over'); board.querySelectorAll('.studio-drop-line').forEach(l=>l.remove()); } });
      col.addEventListener('drop', e=>{ e.preventDefault(); handleStudioDrop(col, e.clientY, mode); });
    });
  }
  function handleStudioDrop(col, clientY, mode){
    const board = col.closest('.studio-board');
    const drag = studioDrag;
    // figure out where it lands BEFORE we wipe the indicators
    const body = col.querySelector('.studio-col-body');
    const others = body ? Array.from(body.querySelectorAll('.studio-track')).filter(t=>!drag||t.dataset.beatId!==drag.beatId) : [];
    const refTrack = others.find(t=>{ const r=t.getBoundingClientRect(); return clientY < r.top + r.height/2; });
    const insertBeforeId = refTrack ? refTrack.dataset.beatId : null;
    clearStudioDnD(board); studioDrag = null;
    if(!drag) return;
    const beat = getBeat(drag.beatId); if(!beat) return;
    const cls = colClass(col); if(!cls) return;

    // 1) Change stage only when crossing into a different column (preserve % on reorder).
    if(studioCol(beat) !== STAGE_KEY[cls]) beat.done = STAGE_VAL[cls];

    // 2) Reorder ONLY the studio-specific order (col.studioOrder). The album/mixtape
    //    beatIds is left untouched so studio order is independent of the track order (F2).
    const col2 = (typeof activeCollectionForMode==='function') ? activeCollectionForMode(mode) : null;
    if(col2 && Array.isArray(col2.beatIds)){
      // Seed from the album order the first time, then keep membership in sync.
      let order = (Array.isArray(col2.studioOrder) && col2.studioOrder.length) ? col2.studioOrder.slice() : col2.beatIds.slice();
      col2.beatIds.forEach(id=>{ if(!order.includes(id)) order.push(id); });
      order = order.filter(id=>col2.beatIds.includes(id));
      const from = order.indexOf(drag.beatId);
      if(from>=0) order.splice(from,1);
      let at = insertBeforeId ? order.indexOf(insertBeforeId) : -1;
      if(at<0) at = order.length;
      order.splice(at,0,drag.beatId);
      col2.studioOrder = order;
    }
    if(typeof saveState==='function') saveState();
    if(mode==='mixtape' && typeof renderMixtapeDetail==='function') renderMixtapeDetail();
    else if(typeof renderAlbumDetail==='function') renderAlbumDetail();
    if(typeof showToast==='function') showToast(`✓ «${beat.name}» → ${STAGE_LBL[cls]}`);
  }

  function markPlayingCard(){
    const bp = (typeof bottomPlayer!=='undefined')?bottomPlayer:window.bottomPlayer;
    const id = bp?.queue?.[bp.index]?.id;
    const playing = id && bp.audio && !bp.audio.paused;
    document.querySelectorAll('.quick-play-btn.playing').forEach(b=>{b.classList.remove('playing');b.textContent='▶';});
    if(playing) document.querySelectorAll(`[data-beat-id="${CSS.escape(id)}"] .quick-play-btn`).forEach(b=>{b.classList.add('playing');b.textContent='⏸';});
  }
  // Expose so db.js's updateBottomUI (loaded AFTER this file) can call it live on play/pause.
  window.markPlayingCard = markPlayingCard;

  // db.js OWNS renderAlbumBeats and loads AFTER this file, so wrapping window.renderAlbumBeats
  // here fails: origRender is undefined at load (guard skips), and db.js's function declaration
  // clobbers any wrapper anyway (FINDINGS §0). Instead we expose a hook that db.js calls at the
  // END of renderAlbumBeats — that's what actually makes the studio board render.
  function afterRenderAlbumBeats(el, mode){
    if(!el) return;
    const v = getView();
    el.classList.remove('album-beat-grid','album-beat-listmode','album-beat-studio');
    el.classList.add(v==='list' ? 'album-beat-listmode' : v==='studio' ? 'album-beat-studio' : 'album-beat-grid');
    if(v==='studio') renderStudioBoard(el, mode);   // cards/list left as db.js rendered them
    document.querySelectorAll('[data-track-view]').forEach(b =>
      b.classList.toggle('active', b.dataset.trackView === v)
    );
  }
  window.afterRenderAlbumBeats = afterRenderAlbumBeats;

  // Hook into updateBottomUI to mark playing card
  const origUpdateBottomUI = window.updateBottomUI;
  if(typeof origUpdateBottomUI === 'function'){
    window.updateBottomUI = function(){
      origUpdateBottomUI();
      markPlayingCard();
    };
  }
})();


// ── 4. CARD INTERACTION ───────────────────────────────────────────────────────
(function(){
  function safe(s){ return (window.esc?esc:String)(s||''); }
  function cssId(id){ return (window.CSS&&CSS.escape)?CSS.escape(String(id)):String(id).replace(/[^a-zA-Z0-9_-]/g,'\\$&'); }
  function getState(){ return typeof state!=='undefined'?state:window.state; }

  // Determine active collection mode from event context
  function clickedMode(){
    const ev = window.event;
    const card = ev?.target?.closest?.('.album-beat-card');
    const list = card?.closest?.('#albumBeatList,#mixtapeBeatList');
    if(list?.id==='mixtapeBeatList') return 'mixtape';
    if(list?.id==='albumBeatList')   return 'album';
    const mix = document.getElementById('mixtapeDetailView');
    const alb = document.getElementById('albumDetailView');
    if(mix && !mix.classList.contains('hidden')) return 'mixtape';
    if(alb && !alb.classList.contains('hidden')) return 'album';
    const st = getState();
    if(typeof currentMixtapeId!=='undefined' && currentMixtapeId) return 'mixtape';
    return 'album';
  }
  function rerenderMode(mode){
    if(mode==='mixtape'&&typeof renderMixtapeDetail==='function') renderMixtapeDetail();
    else if(typeof renderAlbumDetail==='function') renderAlbumDetail();
  }

  // Title click toggles card (cover click uses onclick in HTML)
  document.addEventListener('click', function(e){
    const title = e.target.closest('.album-beat-card .ab-title');
    if(!title) return;
    if(e.target.closest('button,input,textarea,label,select,a')) return;
    const card = title.closest('.album-beat-card');
    const id   = card?.dataset?.beatId;
    if(id && typeof window.toggleAlbumBeat==='function'){
      e.preventDefault(); e.stopPropagation();
      window.toggleAlbumBeat(id);
    }
  }, true);

  // Rating — no card toggle
  window.setAlbumBeatRating = function(id, r){
    const b = getState()?.beats?.find(x=>x.id===id);
    if(b){ b.rating=r; if(typeof saveState==='function') saveState(); }
    document.querySelectorAll(`#abi-${cssId(id)} .ab-stars button, [data-beat-id="${String(id).replace(/"/g,'\\"')}"] .ab-stars button`)
      .forEach((s,i) => s.classList.toggle('on', i < r));
  };

  // Done % — no card toggle
  window.setAlbumBeatDone = function(id, val){
    const done = Math.max(0, Math.min(100, Number(val)||0));
    const b = getState()?.beats?.find(x=>x.id===id);
    if(b){ b.done=done; if(typeof saveState==='function') saveState(); }
    document.querySelectorAll(`#abirange-${cssId(id)}`).forEach(rng => { rng.value = done; rng.style.setProperty('--pct', done+'%'); });
    document.querySelectorAll(`#abidone-${cssId(id)}`).forEach(lbl => lbl.textContent = done+'%');
  };

  // Cover upload
  window.setAlbumBeatCover = function(id, input){
    const mode = clickedMode();
    const f = input?.files?.[0];
    if(!f) return;
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        const sz=600, canvas=document.createElement('canvas');
        canvas.width=sz; canvas.height=sz;
        const ctx = canvas.getContext('2d');
        const side = Math.min(img.width,img.height);
        ctx.drawImage(img,(img.width-side)/2,(img.height-side)/2,side,side,0,0,sz,sz);
        const b = getState()?.beats?.find(x=>x.id===id);
        if(!b) return;
        b.cover = canvas.toDataURL('image/jpeg',.86);
        if(typeof saveState==='function') saveState();
        rerenderMode(mode);
        if(typeof showToast==='function') showToast('✓ Coverbilde oppdatert');
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(f);
  };

  window.removeFromAlbum = function(beatId){
    const mode = clickedMode();
    if(typeof removeFromCollection==='function') removeFromCollection(beatId, mode);
  };

  // Remove extra meta fields
  function removeMeta(){
    document.querySelectorAll('.ux-extra-fields,.full-meta-extra,.meta-mini-grid,.structure-tags,.loop-controls,.waveform').forEach(el=>el.remove());
  }
  document.addEventListener('DOMContentLoaded', removeMeta);
  if(document.readyState !== 'loading') removeMeta();
})();


// ── 5. OPEN/CLOSE COLLECTION HELPERS ─────────────────────────────────────────
(function(){
  const oldOpenAlbum = window.openAlbum;
  window.openAlbum = function(id){
    try{ if(typeof currentMixtapeId!=='undefined') currentMixtapeId=null; }catch(e){}
    if(typeof oldOpenAlbum==='function') return oldOpenAlbum.apply(this,arguments);
    try{ currentAlbumId=id; }catch(e){}
    if(typeof renderAlbumDetail==='function') renderAlbumDetail();
  };

  const oldOpenMixtape = window.openMixtape;
  window.openMixtape = function(id){
    try{ if(typeof currentAlbumId!=='undefined') currentAlbumId=null; }catch(e){}
    if(typeof oldOpenMixtape==='function') return oldOpenMixtape.apply(this,arguments);
    try{ currentMixtapeId=id; }catch(e){}
    if(typeof renderMixtapeDetail==='function') renderMixtapeDetail();
  };
})();


// ── 6. PIPELINE FIX ──────────────────────────────────────────────────────────
(function(){
  const old = window.renderPipeline;
  if(typeof old !== 'function') return;
  window.renderPipeline = function(){
    const orig = Array.isArray(state?.albums) ? state.albums : [];
    try{
      state.albums = orig.filter(a=>!a?.archived).map(a=>({
        ...a,
        beatIds: (a.beatIds||[]).filter(id=>{
          const b=(state?.beats||[]).find(x=>x.id===id);
          return !!b && !b.archived;
        })
      }));
      old();
      const board = document.getElementById('pipelineBoard');
      if(board && !state.albums.length){
        board.innerHTML='<div class="empty upgraded-empty"><strong>Pipeline er tom</strong><span>Arkiverte albumer vises ikke her.</span></div>';
      }
    } finally { state.albums = orig; }
  };
  const tab = document.getElementById('pipelineTab');
  if(tab && !tab.classList.contains('hidden')) window.renderPipeline();
})();


// ── 7. ARCHIVE TOOLBAR DEDUP ─────────────────────────────────────────────────
(function(){
  function cleanup(){
    ['albumDetailHd','mixtapeDetailHd'].forEach(hid=>{
      const hd = document.getElementById(hid);
      if(!hd) return;
      const parent = hd.parentElement;
      if(!parent) return;
      const bars = Array.from(parent.children).filter(el=>el.classList?.contains('archive-toolbar'));
      if(bars.length <= 1) return;
      const keep = bars[0];
      bars.forEach(bar=>{ if(bar !== keep) bar.remove(); });
    });
  }
  const mo = new MutationObserver(()=>requestAnimationFrame(cleanup));
  document.addEventListener('DOMContentLoaded',()=>{
    mo.observe(document.body, {childList:true, subtree:true});
    cleanup();
  });
  if(document.readyState!=='loading'){ mo.observe(document.body,{childList:true,subtree:true}); cleanup(); }
})();
