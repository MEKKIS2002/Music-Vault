// ════════════════════════════════════════════════════════════════════════════
// context-menu.js — én felles meny for sanger, album og mixtapes.
//
// Brukes av ⋯-knappene (Beats: beatsTab.openDropdown, album/mixtape-rader:
// mvTrackMenu) OG ved høyreklikk. Kort hovedliste; lange lister (mixtaper,
// album, deling, sjeldne valg) ligger bak «›» og åpnes i menyen («‹ Tilbake»).
// Tastatur: ↑↓ flytter, → / Enter åpner undermeny, ← / Escape går tilbake/lukker.
// Lastes etter db.js og beats-tab.js.
// ════════════════════════════════════════════════════════════════════════════
(function(){
  'use strict';
  const st = () => (typeof state !== 'undefined' ? state : window.state);
  const isAdmin = () => (typeof window.isAdmin === 'function' ? window.isAdmin() : sessionStorage.getItem('mv_role') === 'admin');
  const E = v => String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const I = n => `<span class="ic ic-${n}" aria-hidden="true"></span>`;
  let menu = null, returnFocus = null, stack = [];

  // ── Felles motor ─────────────────────────────────────────────────────────
  function close(){
    if (!menu) return;
    menu.remove(); menu = null; stack = [];
    document.querySelectorAll('.bt-dropdown, .mv-row-menu').forEach(x=>x.remove());
    const f = returnFocus; returnFocus = null;
    if (f && document.contains(f)) f.focus({preventScroll:true});
  }
  window.mvCloseContextMenu = close;

  function render(page){
    const items = page.items.filter(Boolean);
    menu.innerHTML = (page.title ? `<button type="button" class="mv-cm-item mv-cm-back" role="menuitem" data-back>‹ ${E(page.title)}</button><div class="mv-cm-sep" role="separator"></div>` : '')
      + items.map((it,i)=> it === '-' ? '<div class="mv-cm-sep" role="separator"></div>'
        : it.label ? `<div class="mv-cm-label">${E(it.label)}</div>`
        : `<button type="button" class="mv-cm-item${it.danger?' is-danger':''}${it.checked?' is-checked':''}" role="menuitem" data-i="${i}" ${it.sub?'aria-haspopup="menu"':''} ${it.disabled?'disabled':''}>
            <span class="mv-cm-ico">${it.checked ? I('check') : (it.icon ? I(it.icon) : '')}</span><span class="mv-cm-text">${E(it.text)}</span>${it.sub?'<span class="mv-cm-chev" aria-hidden="true">›</span>':''}${it.hint?`<span class="mv-cm-hint">${E(it.hint)}</span>`:''}
          </button>`).join('');
    menu._items = items;
    requestAnimationFrame(()=>{ place(); menu?.querySelector('.mv-cm-item:not(:disabled)')?.focus({preventScroll:true}); });
  }
  function place(){
    if (!menu) return;
    const p = menu._pos, w = menu.offsetWidth, h = menu.offsetHeight, vw = innerWidth, vh = innerHeight;
    let x, y;
    if (p.anchor){ const r = p.anchor.getBoundingClientRect(); x = r.right - w; y = r.bottom + 6; if (y + h > vh - 8) y = Math.max(8, r.top - h - 6); }
    else { x = p.x; y = p.y; if (x + w > vw - 8) x = vw - w - 8; if (y + h > vh - 8) y = Math.max(8, vh - h - 8); }
    menu.style.left = Math.max(8, Math.min(x, vw - w - 8)) + 'px';
    menu.style.top = Math.max(8, y) + 'px';
  }
  function open(page, pos){
    close();
    returnFocus = pos.anchor || document.activeElement;
    menu = document.createElement('div');
    menu.className = 'mv-cm'; menu.setAttribute('role','menu'); menu._pos = pos; menu._t = performance.now();
    if (page.aria) menu.setAttribute('aria-label', page.aria);
    document.body.appendChild(menu);
    stack = [page]; render(page);
    menu.addEventListener('click', onClick);
    menu.addEventListener('keydown', onKey);
    menu.addEventListener('contextmenu', e=>e.preventDefault());
  }
  function onClick(e){
    e.stopPropagation();
    if (e.target.closest('[data-back]')){ back(); return; }
    const b = e.target.closest('.mv-cm-item[data-i]'); if (!b || b.disabled) return;
    const it = menu._items[Number(b.dataset.i)];
    if (it.sub){ const sub = it.sub(); stack.push(sub); render(sub); return; }
    close(); try { it.run && it.run(); } catch(err){ console.error('[meny]', err); }
  }
  function back(){ if (stack.length > 1){ stack.pop(); render(stack[stack.length-1]); } else close(); }
  function onKey(e){
    const list = [...menu.querySelectorAll('.mv-cm-item:not(:disabled)')];
    const i = list.indexOf(document.activeElement);
    if (e.key === 'ArrowDown'){ e.preventDefault(); list[(i+1)%list.length]?.focus(); }
    else if (e.key === 'ArrowUp'){ e.preventDefault(); list[(i-1+list.length)%list.length]?.focus(); }
    else if (e.key === 'Home'){ e.preventDefault(); list[0]?.focus(); }
    else if (e.key === 'End'){ e.preventDefault(); list[list.length-1]?.focus(); }
    else if (e.key === 'ArrowRight' && document.activeElement?.getAttribute('aria-haspopup')){ e.preventDefault(); document.activeElement.click(); }
    else if (e.key === 'ArrowLeft' || e.key === 'Escape'){ e.preventDefault(); if (e.key==='Escape' && stack.length<=1) close(); else back(); }
    else if (e.key === 'Tab'){ close(); }
  }
  document.addEventListener('click', e=>{ if (!menu || menu.contains(e.target)) return; const a = menu._pos.anchor; if (a && a.contains && a.contains(e.target) && performance.now() - menu._t < 400) return; close(); });
  window.addEventListener('resize', close);
  window.addEventListener('scroll', e=>{ if (menu && !menu.contains(e.target) && performance.now() - menu._t > 250) close(); }, true);

  // ── Sangmeny ─────────────────────────────────────────────────────────────
  function songPage(beatId, listMode){
    const s = st(); const b = s?.beats?.find(x=>x.id===beatId); if (!b) return null;
    const admin = isAdmin();
    const inCollection = listMode === 'album' || listMode === 'mixtape';
    const where = listMode === 'mixtape' ? 'mixtapen' : 'albumet';
    const mixtapes = (s.mixtapes||[]).filter(m=>!m.archived);
    const albums = (s.albums||[]).filter(a=>!a.archived);
    const addTo = (type, list) => () => ({ title: type==='mixtape' ? 'Legg til i mixtape' : 'Legg til i album', items: list.length
      ? list.map(c=>{ const inIt=(c.beatIds||[]).includes(beatId); return { text:c.name||'Uten navn', checked:inIt, disabled:inIt,
          run:()=>window.beatsTab?.addToCollection ? beatsTab.addToCollection(beatId, type, c.id) : null }; })
      : [{ text: type==='mixtape' ? 'Ingen mixtaper ennå' : 'Ingen album ennå', disabled:true }] });
    const shareUser = () => window.mvShare && window.mvShare({ dataset:{ share:`beat|${beatId}|${b.name||'Beat'}` }, disabled:false, textContent:'' });
    const sharePublic = () => inCollection ? (window.shareSong && shareSong(beatId)) : (window.beatsTab?.shareLink ? beatsTab.shareLink(beatId) : window.shareSong && shareSong(beatId));
    const rename = () => inCollection ? (window.renameBeatInline && renameBeatInline(beatId)) : (window.renameBeat && renameBeat(beatId));
    const fav = () => { if (typeof toggleFav === 'function'){ const btn=document.querySelector(`[data-fav-id="${CSS.escape(beatId)}"]`); toggleFav(beatId, btn); if (window.beatsTab?.renderBeatsTab && document.getElementById('beatsTab') && !document.getElementById('beatsTab').classList.contains('hidden')) beatsTab.renderBeatsTab(); } };
    const canShare = inCollection || admin;
    return {
      aria: 'Valg for ' + (b.name||'sang'),
      items: [
        { text:'Spill neste', icon:'list', run:()=>window.mvQueuePlayNext && mvQueuePlayNext(beatId) },
        { text:'Legg i kø', icon:'plus', run:()=>window.mvQueueAdd && mvQueueAdd(beatId) },
        '-',
        admin ? { text:'Legg til i mixtape', icon:'cassette', sub:addTo('mixtape', mixtapes) } : null,
        admin ? { text:'Legg til i album', icon:'disc', sub:addTo('album', albums) } : null,
        { text: b.favorite ? 'Fjern fra favoritter' : 'Legg til favoritt', icon:'star', run:fav },
        '-',
        { text:'Åpne i Lyric Lab', icon:'pen', run:()=>window.openInLyricLab && openInLyricLab(beatId) },
        canShare ? { text:'Del', icon:'link', sub:()=>({ title:'Del', items:[
            (admin && !b._shared) ? { text:'Del med bruker', icon:'user', run:shareUser } : null,
            { text:'Del offentlig lenke', icon:'globe', run:sharePublic } ] }) } : null,
        (admin || inCollection) ? { text:'Mer', icon:'more', sub:()=>({ title:'Mer', items:[
            { text:'Gi nytt navn', icon:'pen', run:rename },
            admin ? { text:'Bytt lydfil', icon:'music', run:()=>window.beatsTab?.swapAudio ? beatsTab.swapAudio(beatId) : null } : null,
            admin ? { text:'Last ned', icon:'download', run:()=>window.downloadBeat && downloadBeat(beatId) } : null,
            admin ? { text: b.archived ? 'Gjenopprett' : 'Arkiver sang', icon: b.archived ? 'restore' : 'archive', run:()=>window.beatsTab?.archiveBeat && beatsTab.archiveBeat(beatId) } : null ] }) } : null,
        (inCollection || (admin && listMode==='beats')) ? '-' : null,
        inCollection ? { text:'Fjern fra '+where, icon:'trash', danger:true, run:()=>typeof removeFromCollection==='function' && removeFromCollection(beatId, listMode) } : null,
        (listMode==='beats' && admin) ? { text:'Slett permanent', icon:'trash', danger:true, run:()=>window.beatsTab?.deleteBeat && beatsTab.deleteBeat(beatId) } : null,
      ].filter((x,i,a)=> x!==null && !(x==='-' && (i===0 || a[i-1]==='-')))
    };
  }
  window.mvSongMenu = function(beatId, pos, listMode){ const p = songPage(beatId, listMode||'beats'); if (p) open(p, pos); };

  // ── Album-/mixtape-meny ──────────────────────────────────────────────────
  function collectionPage(type, id){
    const s = st(); const arr = type==='album' ? s?.albums : s?.mixtapes; const c = (arr||[]).find(x=>x.id===id); if (!c) return null;
    const admin = isAdmin();
    return { aria:'Valg for '+(c.name||type), items:[
      { text:'Spill', icon:'play', run:()=> type==='album' ? (typeof playAlbumFromStart==='function' && playAlbumFromStart(id)) : (typeof playMixtapeFromStart==='function' && playMixtapeFromStart(id)) },
      { text:'Åpne', icon: type==='album' ? 'disc' : 'cassette', run:()=>{ document.querySelector(`.tab-btn[data-tab="${type==='album'?'albums':'mixtapes'}"]`)?.click(); setTimeout(()=> type==='album' ? window.openAlbum?.(id) : window.openMixtape?.(id), 60); } },
      '-',
      type==='album' && admin ? { text:'Pitch-side', icon:'file', run:()=>window.albumPitchMode && albumPitchMode(id) } : null,
      type==='mixtape' ? { text:'Del lenke', icon:'globe', run:()=>window.mixtapeShareMode && mixtapeShareMode(id) } : null,
      !c._shared ? { text:'Del med bruker', icon:'user', run:()=>window.mvShare && window.mvShare({ dataset:{ share:`${type}|${id}|${c.name||''}` }, disabled:false, textContent:'' }) } : null,
      admin ? '-' : null,
      admin ? { text: c.archived ? 'Gjenopprett' : 'Arkiver', icon: c.archived ? 'restore' : 'archive', run:()=>window.toggleArchiveItem && toggleArchiveItem(type, id) } : null,
    ].filter(Boolean) };
  }
  window.mvCollectionMenu = function(type, id, pos){ const p = collectionPage(type, id); if (p) open(p, pos); };

  // ── Koble ⋯-knappene til den nye menyen ──────────────────────────────────
  function hook(){
    if (window.beatsTab && !window.beatsTab._cmHooked){
      window.beatsTab.openDropdown = function(beatId, btn){
        if (menu && menu._pos.anchor === btn){ close(); return; }   // andre trykk lukker
        window.mvSongMenu(beatId, { anchor:btn }, 'beats');
      };
      window.beatsTab._cmHooked = true;
    }
    window.mvTrackMenu = function(btn, beatId, listMode){
      if (menu && menu._pos.anchor === btn){ close(); return; }
      window.mvSongMenu(beatId, { anchor:btn }, listMode);
    };
  }

  // ── Høyreklikk (og Shift+F10 / Kontekstmeny-tasten) ──────────────────────
  function modeOf(el){
    if (el.closest('#mixtapeBeatList')) return 'mixtape';
    if (el.closest('#albumBeatList')) return 'album';
    return 'beats';
  }
  document.addEventListener('contextmenu', e=>{
    const t = e.target;
    if (t.closest('input, textarea, select, [contenteditable="true"], .ll-textarea, .docs-ed-body, a[href]')) return;   // behold nettleserens meny for tekst og lenker
    const pos = e.type === 'contextmenu' && (e.clientX || e.clientY) ? { x:e.clientX, y:e.clientY } : null;
    const song = t.closest('.bl-row[data-beat-id], .album-beat-card[data-beat-id], [data-cm-beat]');
    if (song){
      e.preventDefault();
      const id = song.dataset.beatId || song.dataset.cmBeat;
      window.mvSongMenu(id, pos || { anchor:song }, song.dataset.cmMode || modeOf(song));
      return;
    }
    const album = t.closest('.album-card[data-id]');
    if (album){ e.preventDefault(); window.mvCollectionMenu('album', album.dataset.id, pos || { anchor:album }); return; }
    const mt = t.closest('.cassette-card[data-id]');
    if (mt){ e.preventDefault(); window.mvCollectionMenu('mixtape', mt.dataset.id, pos || { anchor:mt }); return; }
    const proj = t.closest('.dash-proj-card[data-cm-type]');
    if (proj){ e.preventDefault(); window.mvCollectionMenu(proj.dataset.cmType, proj.dataset.cmId, pos || { anchor:proj }); }
  });

  hook();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', hook);
  setTimeout(hook, 1000);
})();
