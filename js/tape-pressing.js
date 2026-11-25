// ════════════════════════════════════════════════════════════════════════════
// tape-pressing.js — to små fysiske gjenstander (som vinyl, kassett og CD):
//   • Masterbånd i Pipeline: fremdriften vises som bånd spolt fra venstre til
//     høyre spole (i stedet for en ring).
//   • Prøvepressing på artistsiden: en liten vinyl ved tittelen — hvit etikett
//     («TP») som utkast, etikett i sidens aksentfarge når siden er publisert.
// Kan fjernes helt: slett denne fila, css/tape-pressing.css og de to linjene i
// index.html — ingenting annet avhenger av den.
// ════════════════════════════════════════════════════════════════════════════
(function(){
  'use strict';
  const en = () => !!(window.mvI18n && mvI18n.lang === 'en');

  // ── Masterbånd ────────────────────────────────────────────────────────────
  function reelsSVG(p){
    const k = Math.max(0, Math.min(1, p / 100));
    const rL = 9 + 13 * (1 - k), rR = 9 + 13 * k;          // båndet ligger på venstre spole før, høyre etter
    const hub = (cx) => `<circle cx="${cx}" cy="30" r="6.5" class="mt-hub"/>` +
      [0, 120, 240].map(a => { const t = a * Math.PI / 180; return `<circle cx="${(cx + 3.6 * Math.cos(t)).toFixed(1)}" cy="${(30 + 3.6 * Math.sin(t)).toFixed(1)}" r="1.2" class="mt-hole"/>`; }).join('');
    return `<svg viewBox="0 0 100 60" class="mt-reels" aria-hidden="true">
      <circle cx="27" cy="30" r="24" class="mt-flange"/><circle cx="73" cy="30" r="24" class="mt-flange"/>
      <circle cx="27" cy="30" r="${rL.toFixed(1)}" class="mt-tape"/><circle cx="73" cy="30" r="${rR.toFixed(1)}" class="mt-tape"/>
      <path d="M${(27).toFixed(1)} ${(30 + rL).toFixed(1)} L44 57 L56 57 L73 ${(30 + rR).toFixed(1)}" class="mt-path"/>
      ${hub(27)}${hub(73)}</svg>`;
  }
  function decoratePipeline(){
    const metric = document.querySelector('#pipelineTab .pl3-hero-metrics .pl3-metric');
    const ring = metric && metric.querySelector('.pl3-ring'); if (!ring) return;
    const pct = parseInt((ring.querySelector('b') || {}).textContent, 10) || 0;
    const existing = metric.querySelector('.mt-tape-wrap');
    if (existing && existing.dataset.pct === String(pct)) return;
    if (existing) existing.remove();
    ring.hidden = true;
    ring.insertAdjacentHTML('afterend', `<div class="mt-tape-wrap" data-pct="${pct}" title="${en() ? 'Master tape — the album’s progress as tape wound onto the take-up reel' : 'Masterbånd — albumets fremdrift som bånd spolt over på høyre spole'}">${reelsSVG(pct)}<b class="mt-pct">${pct}%</b></div>`);
  }

  // ── Prøvepressing ─────────────────────────────────────────────────────────
  function decorateArtist(){
    const title = document.querySelector('#artistpageTab .as-title'); if (!title) return;
    const cb = document.getElementById('asPublished'); const pub = !!(cb && cb.checked);
    const name = (document.querySelector('#artistpageTab [data-f="display_name"]') || {}).value || '';
    let disc = title.querySelector('.tp-disc');
    if (!disc){ title.insertAdjacentHTML('beforeend', ' <span class="tp-disc" aria-hidden="true"><span class="tp-label"></span></span>'); disc = title.querySelector('.tp-disc'); }
    const label = pub ? (name.trim().charAt(0).toUpperCase() || '★') : 'TP';
    if (disc.dataset.state === (pub ? 'pub' : 'tp') && disc.dataset.label === label) return;
    disc.dataset.state = pub ? 'pub' : 'tp'; disc.dataset.label = label;
    disc.classList.toggle('is-published', pub);
    disc.querySelector('.tp-label').textContent = label;
    disc.title = pub ? (en() ? 'Published — the finished pressing' : 'Publisert — den ferdige pressingen')
                     : (en() ? 'Test pressing — the page isn’t published yet' : 'Prøvepressing — siden er ikke publisert ennå');
  }

  // Tegn på nytt når Pipeline eller artistsiden endres (samlet til én gang per bilde)
  let queued = false;
  const run = () => { queued = false; try { decoratePipeline(); decorateArtist(); } catch(e) {} };
  new MutationObserver(() => { if (!queued){ queued = true; requestAnimationFrame(run); } })
    .observe(document.body, { childList: true, subtree: true });
  document.addEventListener('change', e => { if (e.target && (e.target.id === 'asPublished' || e.target.matches?.('[data-f="display_name"]'))) run(); });
  document.addEventListener('input', e => { if (e.target && e.target.matches?.('#artistpageTab [data-f="display_name"]')) run(); });
})();
