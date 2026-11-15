// ════════════════════════════════════════════════════════════════════════════
// mini-player.js — gir bunnspilleren en mørk bakgrunnstone hentet fra coveret,
// slik Spotifys minispiller gjør. Brukes av mobile.css (var(--bp-tint)).
//
// Lytter på #bpCover (db.js updateBottomUI bytter bildet der). Coveret leses
// via et lite canvas; bilder fra andre domener uten CORS kan ikke leses — da
// beholdes standardtonen. Lastes etter db.js.
// ════════════════════════════════════════════════════════════════════════════
(function(){
  'use strict';
  const FALLBACK = '#2a1d12';          // varm mørkebrun, matcher temaet
  const cache = new Map();             // src → farge, så samme cover ikke regnes ut på nytt

  function tintFrom(img){
    try {
      const c = document.createElement('canvas'); c.width = c.height = 24;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, 24, 24);
      const d = ctx.getImageData(0, 0, 24, 24).data;
      let r = 0, g = 0, b = 0, n = 0;
      for (let i = 0; i < d.length; i += 4){
        const R = d[i], G = d[i+1], B = d[i+2], max = Math.max(R,G,B), min = Math.min(R,G,B);
        if (max < 24 || min > 232) continue;                 // hopp over nær svart/hvitt
        const w = 1 + (max - min) / 64;                        // vekt mettede piksler (fargen «sitter» der)
        r += R*w; g += G*w; b += B*w; n += w;
      }
      if (!n) return null;
      // Mørkt nok til at hvit tekst leses godt (mål: luminans ≲ 0.12)
      const k = 0.42;
      return `rgb(${Math.round(r/n*k)},${Math.round(g/n*k)},${Math.round(b/n*k)})`;
    } catch(e) { return null; }                               // CORS-«tainted» canvas
  }

  function apply(){
    const bar = document.getElementById('bottomPlayer');
    const img = document.querySelector('#bpCover img');
    if (!bar) return;
    if (!img){ bar.style.setProperty('--bp-tint', FALLBACK); return; }
    const src = img.currentSrc || img.src;
    if (cache.has(src)){ bar.style.setProperty('--bp-tint', cache.get(src)); return; }
    const done = () => { const t = tintFrom(img) || FALLBACK; cache.set(src, t); bar.style.setProperty('--bp-tint', t); };
    if (img.complete && img.naturalWidth) done(); else img.addEventListener('load', done, { once:true });
  }

  function start(){
    const cover = document.getElementById('bpCover');
    if (!cover) return;
    new MutationObserver(apply).observe(cover, { childList:true, subtree:true, attributes:true, attributeFilter:['src'] });
    apply();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
