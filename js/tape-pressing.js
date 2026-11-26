// ════════════════════════════════════════════════════════════════════════════
// tape-pressing.js — masterbånd i Pipeline (som vinyl, kassett og CD andre steder):
//   albumets fremdrift som bånd spolt fra venstre til høyre spole på en
//   spolebåndopptaker, med telleverk (i stedet for en ring).
// Kan fjernes helt: slett denne fila, css/tape-pressing.css og de to linjene i
// index.html — ingenting annet avhenger av den.
// ════════════════════════════════════════════════════════════════════════════
(function(){
  'use strict';
  const en = () => !!(window.mvI18n && mvI18n.lang === 'en');

  // ── Masterbånd ────────────────────────────────────────────────────────────
  // Spolebåndopptaker sett ovenfra: to NAB-spoler i børstet aluminium med tre vinduer
  // (båndpakken syns gjennom dem), bånd via føringsruller og tonehode, telleverk under.
  function reelsSVG(p){
    const k = Math.max(0, Math.min(1, p / 100));
    const L = 38, Rx = 122, cy = 34, F = 30, rHub = 9, rMax = 27;
    const rL = rHub + 1.5 + (rMax - rHub - 1.5) * (1 - k), rR = rHub + 1.5 + (rMax - rHub - 1.5) * k;
    // Tre vinduer (ringsektorer) i hver spole
    const win = (cx, a0) => { const r1 = 12.5, r2 = 25.5, s = 34 * Math.PI / 180, a = a0 * Math.PI / 180;
      const P = (r, t) => `${(cx + r * Math.cos(t)).toFixed(2)} ${(cy + r * Math.sin(t)).toFixed(2)}`;
      return `M${P(r1, a - s)} L${P(r2, a - s)} A${r2} ${r2} 0 0 1 ${P(r2, a + s)} L${P(r1, a + s)} A${r1} ${r1} 0 0 0 ${P(r1, a - s)}Z`; };
    const reel = (cx, r, spin) => `
      <circle cx="${cx}" cy="${cy}" r="${F}" class="mt-shadow"/>
      <circle cx="${cx}" cy="${cy}" r="${r.toFixed(2)}" class="mt-pack"/>
      <circle cx="${cx}" cy="${cy}" r="${(r * .82).toFixed(2)}" class="mt-pack-sheen"/>
      <path d="M${cx - F} ${cy}a${F} ${F} 0 1 0 ${2 * F} 0a${F} ${F} 0 1 0 ${-2 * F} 0Z ${[0, 120, 240].map(a => win(cx, a + spin)).join(' ')}" class="mt-flange" fill-rule="evenodd"/>
      <circle cx="${cx}" cy="${cy}" r="${F - .6}" class="mt-rim"/>
      <circle cx="${cx}" cy="${cy}" r="${rHub}" class="mt-hub"/>
      <path d="M${cx} ${cy - 4.2}l1.6 2.8h-3.2zM${(cx + 3.64).toFixed(2)} ${(cy + 2.1).toFixed(2)}l-3.2 0 1.6-2.8zM${(cx - 3.64).toFixed(2)} ${(cy + 2.1).toFixed(2)}l1.6-2.8 1.6 2.8z" class="mt-key"/>`;
    // Båndbane: spolepakkens underkant → føringsrull → tonehode → føringsrull → spolepakkens underkant
    const gy = 70, g1 = 64, g2 = 96;
    return `<svg viewBox="0 0 160 80" class="mt-reels" aria-hidden="true">
      <defs><linearGradient id="mtAlu" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#eef0f2"/><stop offset=".45" stop-color="#b9bfc5"/><stop offset=".55" stop-color="#d8dce0"/><stop offset="1" stop-color="#8d949b"/></linearGradient></defs>
      <path d="M${L - 3} ${(cy + rL).toFixed(2)} Q${g1 - 8} ${gy} ${g1} ${gy} L${g2} ${gy} Q${g2 + 8} ${gy} ${Rx + 3} ${(cy + rR).toFixed(2)}" class="mt-path"/>
      <circle cx="${g1}" cy="${gy}" r="3.4" class="mt-guide"/><circle cx="${g2}" cy="${gy}" r="3.4" class="mt-guide"/>
      <rect x="73" y="${gy - 5}" width="14" height="9" rx="2" class="mt-head"/><rect x="79.4" y="${gy - 5}" width="1.2" height="9" class="mt-gap"/>
      ${reel(L, rL, 8)}${reel(Rx, rR, -22)}
    </svg>`;
  }
  // Telleverk: tre siffer i hvert sitt vindu (000–100)
  function counter(p){ return String(Math.round(p)).padStart(3, '0').split('').map(d => `<span>${d}</span>`).join(''); }
  function decoratePipeline(){
    const metric = document.querySelector('#pipelineTab .pl3-hero-metrics .pl3-metric');
    const ring = metric && metric.querySelector('.pl3-ring'); if (!ring) return;
    const pct = parseInt((ring.querySelector('b') || {}).textContent, 10) || 0;
    const existing = metric.querySelector('.mt-tape-wrap');
    if (existing && existing.dataset.pct === String(pct)) return;
    if (existing) existing.remove();
    ring.hidden = true;
    ring.insertAdjacentHTML('afterend', `<div class="mt-tape-wrap" data-pct="${pct}" title="${en() ? 'Master tape — the album’s progress as tape wound onto the take-up reel' : 'Masterbånd — albumets fremdrift som bånd spolt over på høyre spole'}">${reelsSVG(pct)}<span class="mt-counter" aria-label="${pct}%">${counter(pct)}<i>%</i></span></div>`);
  }

  // Tegn på nytt når Pipeline eller artistsiden endres (samlet til én gang per bilde)
  let queued = false;
  const run = () => { queued = false; try { decoratePipeline(); } catch(e) {} };
  new MutationObserver(() => { if (!queued){ queued = true; requestAnimationFrame(run); } })
    .observe(document.body, { childList: true, subtree: true });

})();
