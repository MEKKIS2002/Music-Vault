// ════════════════════════════════════════════════════════════════════════════
// touch-reorder.js — flytt låter i album/mixtapes med fingeren.
//
// Musa bruker fortsatt den opprinnelige dra-og-slipp-løsningen i db.js
// (startCollectionDrag / dragBeatOver / dropCollectionBeat) med de samme
// animasjonene. HTML5-dra virker ikke med berøring, så her oversettes
// berøring til de SAMME funksjonene:
//   hold på coveret ~0,25 s → kortet løftes og følger fingeren → den oransje
//   linjen viser hvor låten havner → slipp. Skjermen ruller ved kanten.
// Beveger du fingeren før kortet løftes, ruller siden som vanlig.
// ════════════════════════════════════════════════════════════════════════════
(function(){
  'use strict';
  const HOLD_MS = 250, SLOP = 10, EDGE = 90;
  let pending = null, active = null, blockClick = false;

  const fake = (x, y) => ({ clientX:x, clientY:y, preventDefault(){}, stopPropagation(){},
    dataTransfer:{ effectAllowed:'', dropEffect:'', setData(){}, getData(){ return ''; } } });
  const listOf = el => el.closest('#albumBeatList, #mixtapeBeatList');
  const modeOf = list => list.id === 'mixtapeBeatList' ? 'mixtape' : 'album';
  const scroller = () => {
    const m = document.querySelector('main.app');
    return m && m.scrollHeight > m.clientHeight + 4 && /(auto|scroll)/.test(getComputedStyle(m).overflowY) ? m : (document.scrollingElement || document.documentElement);
  };

  function begin(){
    const { handle, card, list, x, y } = pending; pending = null;
    const id = card.dataset.beatId, mode = modeOf(list);
    if (typeof startCollectionDrag !== 'function') return;
    startCollectionDrag(fake(x, y), id, mode);
    navigator.vibrate?.(12);
    // Løftet kopi som følger fingeren
    const r = card.getBoundingClientRect();
    const ghost = card.cloneNode(true);
    ghost.removeAttribute('id'); ghost.removeAttribute('data-beat-id'); ghost.classList.remove('dragging', 'drag-over'); ghost.classList.add('mv-touch-ghost');
    Object.assign(ghost.style, { position:'fixed', left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px', margin: 0, zIndex: 9999, pointerEvents: 'none' });
    list.appendChild(ghost);                 // inne i listen → samme stiler som de ekte radene
    // En forelder med transform/contain flytter «fixed» — mål og korriger så kopien ligger over originalen
    const g = ghost.getBoundingClientRect();
    ghost.style.left = (r.left + (r.left - g.left)) + 'px'; ghost.style.top = (r.top + (r.top - g.top)) + 'px';
    requestAnimationFrame(() => ghost.classList.add('lifted'));
    active = { id, mode, list, ghost, fx: x, fy: y, x, y, target: null, raf: 0 };
    document.body.classList.add('mv-touch-dragging');
    tick();
  }
  function move(x, y){
    const a = active; a.x = x; a.y = y;
    const lx = a.list.classList.contains('album-beat-listmode') ? 0 : x - a.fx;   // liste: bare opp/ned
    a.ghost.style.transform = `translate(${lx}px, ${y - a.fy}px) scale(1.02)`;
    const under = document.elementFromPoint(x, y)?.closest?.('.album-beat-card[data-beat-id]');
    const t = under && listOf(under) === a.list && under.dataset.beatId !== a.id ? under : null;
    if (a.target && a.target !== t){ a.target.classList.remove('drag-over'); delete a.target.dataset.dropAfter; }
    a.target = t;
    if (t && typeof dragBeatOver === 'function') dragBeatOver(fake(x, y), t.dataset.beatId);
  }
  // Rull automatisk når fingeren er nær toppen/bunnen
  function tick(){
    const a = active; if (!a) return;
    const playerH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--mv-player-space')) || 0;
    const bottom = innerHeight - playerH;
    let dy = 0;
    if (a.y < EDGE) dy = -Math.ceil((EDGE - a.y) / 6);
    else if (a.y > bottom - EDGE) dy = Math.ceil((a.y - (bottom - EDGE)) / 6);
    if (dy){ scroller().scrollBy(0, dy); move(a.x, a.y); }
    a.raf = requestAnimationFrame(tick);
  }
  function finish(drop){
    const a = active; active = null;
    cancelAnimationFrame(a.raf);
    document.body.classList.remove('mv-touch-dragging');
    a.ghost.classList.remove('lifted'); a.ghost.classList.add('dropping');
    setTimeout(() => a.ghost.remove(), 160);
    blockClick = true; setTimeout(() => { blockClick = false; }, 400);
    if (drop && a.target && typeof dropCollectionBeat === 'function') dropCollectionBeat(fake(a.x, a.y), a.target.dataset.beatId, a.mode);
    else if (typeof endCollectionDrag === 'function') endCollectionDrag();
  }

  document.addEventListener('touchstart', e => {
    if (e.touches.length !== 1 || active) return;
    const handle = e.target.closest('.ab-cover-wrap[draggable="true"]'); if (!handle) return;
    const card = handle.closest('.album-beat-card[data-beat-id]'), list = card && listOf(card); if (!list) return;
    const t = e.touches[0];
    pending = { handle, card, list, x: t.clientX, y: t.clientY, sx: t.clientX, sy: t.clientY, timer: setTimeout(() => { if (pending) begin(); }, HOLD_MS) };
  }, { passive: true });

  document.addEventListener('touchmove', e => {
    const t = e.touches[0];
    if (pending){
      pending.x = t.clientX; pending.y = t.clientY;
      if (Math.hypot(t.clientX - pending.sx, t.clientY - pending.sy) > SLOP){ clearTimeout(pending.timer); pending = null; }   // det er rulling
      return;
    }
    if (!active) return;
    e.preventDefault();                       // ikke rull siden mens vi drar
    move(t.clientX, t.clientY);
  }, { passive: false });

  const end = drop => () => {
    if (pending){ clearTimeout(pending.timer); pending = null; }
    if (active) finish(drop);
  };
  document.addEventListener('touchend', end(true));
  document.addEventListener('touchcancel', end(false));
  // Lang-trykk gir ellers nettleserens/vår høyreklikkmeny, og slipp gir et klikk som åpner låten
  document.addEventListener('contextmenu', e => { if (pending || active){ e.preventDefault(); e.stopImmediatePropagation(); } }, true);
  document.addEventListener('click', e => { if (blockClick){ e.preventDefault(); e.stopImmediatePropagation(); blockClick = false; } }, true);
})();
