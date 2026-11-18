// ════════════════════════════════════════════════════════════════════════════
// player-extras.js — to ting lånt fra Koel (github.com/koel/koel, MIT-lisens,
// © Phan An og bidragsytere):
//
// 1. Hurtigtaster for spilleren (Koels useKeyboardShortcuts.ts). Enkle taster
//    uten Ctrl/Alt, og de virker aldri mens du skriver i et felt eller en editor:
//      Mellomrom spill/pause · J neste · K forrige · ←/→ ±10 s · 0–9 hopp til 0–90 %
//      ↑/↓ volum · M lyd av/på · L favoritt · Q kø · H hjem · ? vis alle
//
// 2. Farge fra coverbildet (Koels coverColor.ts / «Kameleon»-temaet): den mest
//    fremtredende klare fargen i coveret til låten som spilles tones inn i
//    spilleren. Grå, nesten svarte og nesten hvite piksler ignoreres, så et
//    mørkt eller svart-hvitt cover gir ingen farge (da brukes standard).
// ════════════════════════════════════════════════════════════════════════════
(function(){
  'use strict';
  const $ = id => document.getElementById(id);
  const audio = () => (typeof bottomPlayer !== 'undefined' ? bottomPlayer.audio : null);
  const current = () => (typeof bottomPlayer !== 'undefined' ? bottomPlayer.queue[bottomPlayer.index] : null);
  const toast = m => { if (typeof window.showToast === 'function') window.showToast(m); };

  // ── 1. Hurtigtaster ──────────────────────────────────────────────────────
  const isTyping = t => !!t && (t.isContentEditable ||
    (t.matches && t.matches('input, select, textarea, button, [role="button"], [role="checkbox"], [contenteditable]')) ||
    !!(t.closest && t.closest('dialog, .modal.open, .mv-cm, #mvKeysHelp.open')));
  const unlocked = () => { const ls = $('lockScreen'); return !ls || getComputedStyle(ls).display === 'none'; };

  let lastVol = 1;
  // Brukerens eget volum (audio-tools.js demper høye låter oppå dette)
  const uVol = () => window.mvAudioTools?.userVolume ? window.mvAudioTools.userVolume() : (audio()?.volume ?? 1);
  function setVol(v){
    const a = audio(); if (!a) return;
    v = Math.max(0, Math.min(1, Math.round(v * 100) / 100));
    if (typeof window.bottomSetVolume === 'function') window.bottomSetVolume(v); else a.volume = v;
    const r = $('bpVolume'); if (r){ r.value = v; if (typeof window.bpSetRangeFill === 'function') window.bpSetRangeFill(r); }
  }
  const SHORTCUTS = [
    { keys:['Mellomrom'], label:'Spill av / pause', needsTrack:true, test:e=>e.key===' ', run:()=>{ if (current() || audio()?.src) window.bottomTogglePlay?.(); } },
    { keys:['J'], label:'Neste spor', test:e=>e.key.toLowerCase()==='j' && !e.shiftKey, run:()=>window.bottomNext?.() },
    { keys:['K'], label:'Forrige spor', test:e=>e.key.toLowerCase()==='k' && !e.shiftKey, run:()=>window.bottomPrev?.() },
    { keys:['→','←'], label:'Spol 10 sekunder fram / tilbake', needsTrack:true, test:e=>e.key==='ArrowRight'||e.key==='ArrowLeft',
      run:e=>{ const a = audio(); if (!a || !a.duration) return; a.currentTime = Math.max(0, Math.min(a.duration - .2, a.currentTime + (e.key==='ArrowRight'?10:-10))); } },
    { keys:['0','9'], range:true, needsTrack:true, label:'Hopp til 0–90 % av sporet', test:e=>/^\d$/.test(e.key) && !e.shiftKey,
      run:e=>{ const a = audio(); if (a && a.duration) a.currentTime = a.duration * Number(e.key) / 10; } },
    { keys:['↑','↓'], label:'Volum opp / ned', needsTrack:true, test:e=>e.key==='ArrowUp'||e.key==='ArrowDown',
      run:e=>{ if (audio()) setVol(uVol() + (e.key==='ArrowUp'?.1:-.1)); } },
    { keys:['M'], label:'Lyd av / på', test:e=>e.key.toLowerCase()==='m' && !e.shiftKey,
      run:()=>{ if (!audio()) return; if (uVol() > 0){ lastVol = uVol(); setVol(0); toast('Lyd av'); } else { setVol(lastVol || 1); toast('Lyd på'); } } },
    { keys:['L'], label:'Favoritt på sporet som spilles', test:e=>e.key.toLowerCase()==='l' && !e.shiftKey,
      run:()=>{ const b = current(); if (!b || typeof window.toggleFav !== 'function') return; window.toggleFav(b.id); toast(b.favorite ? 'Lagt til i favoritter' : 'Fjernet fra favoritter'); } },
    { keys:['Q'], label:'Vis / skjul køen', test:e=>e.key.toLowerCase()==='q' && !e.shiftKey, run:()=>window.mvToggleQueue?.() },
    { keys:['H'], label:'Gå til Hjem', test:e=>e.key.toLowerCase()==='h' && !e.shiftKey, run:()=>document.querySelector('.tab-btn[data-tab="hjem"]')?.click() },
    { keys:['F'], label:'Søk (også Ctrl+K)', test:e=>e.key.toLowerCase()==='f' && !e.shiftKey, run:()=>window.mvSearch?.open() },
    { keys:['N'], label:'Jevn lydstyrke av / på', test:e=>e.key.toLowerCase()==='n' && !e.shiftKey, run:()=>window.mvAudioTools?.toggleNormalize() },
    { keys:['?'], label:'Vis hurtigtaster', test:e=>e.key==='?', run:()=>window.mvWritingTools?.showHelp?.('player') },
  ];
  document.addEventListener('keydown', e=>{
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    if (isTyping(e.target) || !unlocked()) return;
    const s = SHORTCUTS.find(x => x.test(e)); if (!s) return;
    // Mellomrom/piler/tall tas bare når noe er lastet i spilleren — ellers skroller siden som vanlig
    if (s.needsTrack && !current()) return;
    e.preventDefault(); s.run(e);
  });
  // Legg listen inn i den felles hurtigtast-dialogen (writing-tools.js)
  function registerHelp(){
    const rows = [['Avspilling', '']].concat(SHORTCUTS.map(s => [s.keys.join(s.range ? '–' : ' / '), s.label]))
      .concat([['Skriving', ''], ['Ctrl+/ i Docs eller Lyric Lab', 'Hurtigtaster for skriving']]);
    window.mvWritingTools?.addHelp?.('player', rows);
  }

  // ── 2. Farge fra coverbildet ─────────────────────────────────────────────
  const SAMPLE = 32, BUCKETS = 24;
  function rgbToHsl([r, g, b]){
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
    if (max === min) return { h:0, s:0, l };
    const d = max - min, s = l > .5 ? d / (2 - max - min) : d / (max + min);
    let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return { h: h * 60, s, l };
  }
  // Klareste fremtredende farge: grupper piksler etter fargetone, vekt etter metning og lyshet
  function pickVivid(px){
    const b = Array.from({ length: BUCKETS }, () => ({ w:0, r:0, g:0, b:0 }));
    for (let i = 0; i < px.length; i += 4){
      if (px[i+3] < 128) continue;
      const { h, s, l } = rgbToHsl([px[i], px[i+1], px[i+2]]);
      if (s < .25 || l < .15 || l > .92) continue;
      const k = b[Math.floor(h / (360 / BUCKETS)) % BUCKETS], w = s * (1 - Math.abs(2 * l - 1));
      k.w += w; k.r += px[i] * w; k.g += px[i+1] * w; k.b += px[i+2] * w;
    }
    const top = b.reduce((x, y) => y.w > x.w ? y : x);
    return top.w ? [top.r / top.w, top.g / top.w, top.b / top.w] : null;
  }
  const cache = new Map();
  function coverRgb(url){
    if (!cache.has(url)) cache.set(url, new Promise(res=>{
      const img = new Image(); img.crossOrigin = 'anonymous';
      img.onload = ()=>{ try{
        const c = document.createElement('canvas'); c.width = c.height = SAMPLE;
        const x = c.getContext('2d', { willReadFrequently:true }); x.drawImage(img, 0, 0, SAMPLE, SAMPLE);
        res(pickVivid(x.getImageData(0, 0, SAMPLE, SAMPLE).data));
      }catch(e){ res(null); } };                       // f.eks. cover uten CORS → kan ikke leses
      img.onerror = ()=>res(null); img.src = url;
    }));
    return cache.get(url);
  }
  const hsl = (h, s, l, a) => `hsl(${Math.round(h)} ${Math.round(s*100)}% ${Math.round(l*100)}%${a != null ? ' / ' + a : ''})`;
  let tintFor = null;
  async function tint(){
    const bar = $('bottomPlayer'); if (!bar) return;
    const url = $('bpCover')?.querySelector('img')?.getAttribute('src') || '';
    if (url === tintFor) return; tintFor = url;
    const rgb = url ? await coverRgb(url) : null;
    if (url !== tintFor) return;                       // låten byttet mens vi regnet
    if (!rgb){ bar.classList.remove('bp-tinted'); bar.style.removeProperty('--bp-tint'); bar.style.removeProperty('--bp-hl'); return; }
    const { h, s, l } = rgbToHsl(rgb);
    bar.style.setProperty('--bp-tint', hsl(h, Math.min(s, .45), .22, .55));
    bar.style.setProperty('--bp-hl', hsl(h, s, Math.min(Math.max(l, .55), .68)));
    bar.classList.add('bp-tinted');
  }

  function init(){
    registerHelp();
    const c = $('bpCover');
    if (c) new MutationObserver(tint).observe(c, { childList:true, subtree:true, attributes:true, attributeFilter:['src'] });
    tint();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  window.mvPlayerExtras = { pickVivid, shortcuts: SHORTCUTS };
})();
