// ════════════════════════════════════════════════════════════════════════════
// sortable-lists.js — dra og slipp for å endre rekkefølgen i album og mixtapes
// med SortableJS (github.com/SortableJS/Sortable, MIT).
//
// Erstatter den gamle HTML5-dra-og-slipp-løsningen, som ikke virket med
// berøring. Draget starter fortsatt fra coverbildet (så slidere og knapper i
// raden aldri setter i gang en flytting). På mobil: hold på coveret et øyeblikk.
// ════════════════════════════════════════════════════════════════════════════
(function(){
  'use strict';
  const URL_ = 'https://cdn.jsdelivr.net/npm/sortablejs@1.15.7/Sortable.min.js';
  const LISTS = [['albumBeatList', 'album'], ['mixtapeBeatList', 'mixtape']];
  let loading = null;
  const load = () => window.Sortable ? Promise.resolve(window.Sortable) : (loading ||= new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = URL_; s.async = true;
    s.onload = () => res(window.Sortable); s.onerror = () => { loading = null; rej(new Error('SortableJS')); };
    document.head.appendChild(s);
  }));

  function onEnd(mode, list){
    const col = typeof activeCollectionForMode === 'function' ? activeCollectionForMode(mode) : null;
    if (!col || !Array.isArray(col.beatIds)) return;
    const order = [...list.querySelectorAll('.album-beat-card[data-beat-id]')].map(el => el.dataset.beatId);
    const rest = col.beatIds.filter(id => !order.includes(id));        // f.eks. skjulte/filtrerte — behold bakerst
    const ids = order.filter(id => col.beatIds.includes(id)).concat(rest);
    if (ids.join() === col.beatIds.join()) return;
    col.beatIds = ids;
    if (typeof saveState === 'function') saveState();
    // Spiller vi fra denne samlingen? Hold køen i takt med ny rekkefølge.
    try{
      if (bottomPlayer.context && bottomPlayer.context.type === mode && bottomPlayer.context.id === col.id){
        const cur = bottomPlayer.queue[bottomPlayer.index];
        bottomPlayer.queue = beatsFromIds(col.beatIds);
        bottomPlayer.index = Math.max(0, bottomPlayer.queue.findIndex(b => cur && b.id === cur.id));
      }
    }catch(e){}
    (mode === 'mixtape' ? window.renderMixtapeDetail : window.renderAlbumDetail)?.();
    if (typeof showToast === 'function') showToast('✓ Rekkefølge oppdatert');
  }

  async function setup(id, mode){
    const list = document.getElementById(id); if (!list) return;
    // Bare når den gamle koden har sagt at listen kan sorteres (cover med draggable)
    const handles = list.querySelectorAll('.ab-cover-wrap[draggable="true"]');
    if (!handles.length){ list._mvSortable?.option('disabled', true); return; }
    // Slå av den gamle HTML5-løsningen så de ikke går i beina på hverandre
    handles.forEach(h => { h.removeAttribute('draggable'); h.removeAttribute('ondragstart'); h.removeAttribute('ondragend'); h.classList.add('mv-sort-handle'); });
    list.querySelectorAll('.album-beat-card').forEach(c => { c.removeAttribute('ondragover'); c.removeAttribute('ondragleave'); c.removeAttribute('ondrop'); });
    let S; try{ S = await load(); }catch(e){ return; }
    if (list._mvSortable){ list._mvSortable.option('disabled', false); return; }
    list._mvSortable = S.create(list, {
      draggable: '.album-beat-card', handle: '.mv-sort-handle',
      animation: 180, easing: 'cubic-bezier(.2,.8,.2,1)',
      delay: 160, delayOnTouchOnly: true, touchStartThreshold: 6,
      ghostClass: 'mv-sort-ghost', chosenClass: 'mv-sort-chosen', dragClass: 'mv-sort-drag',
      scroll: true, bubbleScroll: true,
      onEnd: () => onEnd(mode, list),
    });
  }
  let t = null;
  function scan(){ LISTS.forEach(([id, mode]) => setup(id, mode)); }
  function init(){
    LISTS.forEach(([id]) => {
      const el = document.getElementById(id);
      if (el) new MutationObserver(() => { clearTimeout(t); t = setTimeout(scan, 30); }).observe(el, { childList:true });
    });
    scan();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
