// ════════════════════════════════════════════════════════════════════════════
// theme.js — lys/mørk modus og aksentfarge (PRO).
//
// - Tema og aksent lagres per enhet i localStorage (mv_theme, mv_accent).
// - Selve fargene bor i css/tokens.css ([data-theme], [data-accent]); her settes
//   bare attributtene på <html>. Et lite skript i <head> i index.html setter dem
//   før første maling, så siden ikke blinker.
// - Aksentfarge krever PRO (eller admin). Uten PRO brukes alltid oransje, men
//   valget huskes, så det kommer tilbake hvis brukeren oppgraderer.
// ════════════════════════════════════════════════════════════════════════════
(function(){
  'use strict';

  const ACCENTS = [
    { id:'oransje', name:'Oransje', color:'#d68155' },
    { id:'rosa',    name:'Rosa',    color:'#e07a9b' },
    { id:'bla',     name:'Blå',     color:'#6f9fd8' },
    { id:'gronn',   name:'Grønn',   color:'#7fb069' },
    { id:'lilla',   name:'Lilla',   color:'#a785d6' },
    { id:'gul',     name:'Gul',     color:'#d9b44a' },
  ];
  const ACCENT_IDS = ACCENTS.map(a => a.id);

  const read  = k => { try { return localStorage.getItem(k); } catch(e) { return null; } };
  const write = (k, v) => { try { localStorage.setItem(k, v); } catch(e) {} };

  function getTheme(){ return read('mv_theme') === 'light' ? 'light' : 'dark'; }
  function getAccent(){ const a = read('mv_accent'); return ACCENT_IDS.includes(a) ? a : 'oransje'; }

  // PRO-tilgang: pakke 'pro' eller admin (admin har alle funksjoner).
  function canChooseAccent(){
    let pkg = null, role = null;
    try { pkg = sessionStorage.getItem('mv_package'); role = sessionStorage.getItem('mv_role'); } catch(e) {}
    return pkg === 'pro' || pkg === 'admin' || role === 'admin';
  }

  function apply(){
    const root = document.documentElement;
    if (getTheme() === 'light') root.setAttribute('data-theme', 'light');
    else root.removeAttribute('data-theme');

    const accent = getAccent();
    if (accent !== 'oransje' && canChooseAccent()) root.setAttribute('data-accent', accent);
    else root.removeAttribute('data-accent');

    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', getTheme() === 'light' ? '#f5efe4' : '#0d0c0b');

    renderControls();
    updateFavicon();
    // Canvas-tegninger (bølgeformer) leser fargene ved tegning — be dem tegne på nytt.
    window.dispatchEvent(new CustomEvent('mv:themechange', { detail: { theme: getTheme(), accent } }));
  }

  // ── Favicon i aksentfargen ────────────────────────────────────────────────
  // assets/favicon.png er en vinylplate i gråtoner med farget etikett. Vi tegner
  // den i et canvas og gir de fargede pikslene (etiketten) aksentens fargetone og
  // metning, men beholder lysstyrken — så skygge og glans blir med.
  const FAVICON_SRC = 'assets/favicon.png';
  let faviconImg = null, faviconFor = null;

  function hexToRgb(hex){
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
    if (!m) return null;
    const n = parseInt(m[1], 16);
    return [n >> 16 & 255, n >> 8 & 255, n & 255];
  }
  function rgbToHsl(r, g, b){
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
    if (max === min) return [0, 0, l];
    const d = max - min, s = l > .5 ? d / (2 - max - min) : d / (max + min);
    const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [h / 6, s, l];
  }
  function hslToRgb(h, s, l){
    if (s === 0) { const v = Math.round(l * 255); return [v, v, v]; }
    const q = l < .5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    const f = t => { t = (t + 1) % 1; return t < 1/6 ? p + (q - p) * 6 * t : t < 1/2 ? q : t < 2/3 ? p + (q - p) * (2/3 - t) * 6 : p; };
    return [f(h + 1/3), f(h), f(h - 1/3)].map(v => Math.round(v * 255));
  }

  function updateFavicon(){
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
    const rgb = hexToRgb(accent);
    if (!rgb || accent === faviconFor) return;
    const draw = () => {
      try {
        const size = 64, c = document.createElement('canvas');
        c.width = c.height = size;
        const ctx = c.getContext('2d');
        ctx.drawImage(faviconImg, 0, 0, size, size);
        const img = ctx.getImageData(0, 0, size, size), px = img.data;
        const [th, ts, tl] = rgbToHsl(...rgb);
        // 1) finn etikettens gjennomsnittlige lysstyrke (fargede piksler)
        let sumL = 0, count = 0;
        for (let i = 0; i < px.length; i += 4) {
          if (px[i + 3] === 0) continue;
          const [, s, l] = rgbToHsl(px[i], px[i + 1], px[i + 2]);
          if (s >= .15) { sumL += l; count++; }
        }
        const k = count ? tl / (sumL / count) : 1;   // skaler så snittet = aksentens lysstyrke
        // 2) farg etiketten: aksentens tone/metning, original lysstyrke-variasjon
        for (let i = 0; i < px.length; i += 4) {
          if (px[i + 3] === 0) continue;
          const [, s, l] = rgbToHsl(px[i], px[i + 1], px[i + 2]);
          if (s < .15) continue;                          // gråtoner = selve platen
          const [r, g, b] = hslToRgb(th, ts * Math.min(1, s / .5), Math.min(.96, l * k));
          px[i] = r; px[i + 1] = g; px[i + 2] = b;
        }
        ctx.putImageData(img, 0, 0);
        let link = document.querySelector('link[rel="icon"]');
        if (!link) { link = document.createElement('link'); link.rel = 'icon'; document.head.appendChild(link); }
        link.type = 'image/png';
        link.href = c.toDataURL('image/png');
        faviconFor = accent;
      } catch (e) { /* canvas utilgjengelig — behold original favicon */ }
    };
    if (faviconImg && faviconImg.complete && faviconImg.naturalWidth) return draw();
    if (!faviconImg) { faviconImg = new Image(); faviconImg.src = FAVICON_SRC; }
    faviconImg.addEventListener('load', draw, { once: true });
  }

  function setTheme(theme){ write('mv_theme', theme === 'light' ? 'light' : 'dark'); apply(); saveToAccount(); }
  function setAccent(id){
    if (!ACCENT_IDS.includes(id) || !canChooseAccent()) return;
    write('mv_accent', id); apply(); saveToAccount();
  }

  // ── Lagret på kontoen (tabellen user_settings) — følger deg til alle enheter ──
  // Lokalt (localStorage) brukes fortsatt for å sette tema før første maling;
  // kontoen er fasiten etter innlogging.
  async function uid(){
    try { const { data } = await window.supabaseClient.auth.getSession(); return data?.session?.user?.id || null; }
    catch(e){ return null; }
  }
  let _saveTimer = null;
  function saveToAccount(){
    clearTimeout(_saveTimer);
    _saveTimer = setTimeout(async () => {
      const id = await uid(); if (!id) return;
      const { error } = await window.supabaseClient.from('user_settings')
        .upsert({ user_id: id, theme: getTheme(), accent: getAccent(), updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
      if (error) console.warn('[Tema] Kunne ikke lagre på kontoen:', error.message);
    }, 400);
  }
  let _synced = false;
  async function syncFromAccount(){
    if (_synced || !window.supabaseClient) return;
    const id = await uid(); if (!id) return;
    _synced = true;
    const { data, error } = await window.supabaseClient.from('user_settings').select('theme, accent').eq('user_id', id).maybeSingle();
    if (error){ _synced = false; return; }
    if (!data){ saveToAccount(); return; }                 // første gang: lagre det lokale valget
    if (data.theme !== getTheme() || data.accent !== getAccent()){
      write('mv_theme', data.theme); write('mv_accent', data.accent); apply();
    }
  }

  // ── Kontrollene i tannhjulmenyen (#mvGearAppearance, lages av lock.js) ──
  function renderControls(){
    const box = document.getElementById('mvGearAppearance');
    if (!box) return;
    const theme = getTheme(), accent = getAccent(), pro = canChooseAccent();
    box.innerHTML = `
      <div class="mv-gear-section-label">Utseende</div>
      <div class="mv-theme-toggle" role="radiogroup" aria-label="Tema">
        <button type="button" role="radio" aria-checked="${theme==='dark'}" class="${theme==='dark'?'is-on':''}" onclick="mvTheme.setTheme('dark')">Mørk</button>
        <button type="button" role="radio" aria-checked="${theme==='light'}" class="${theme==='light'?'is-on':''}" onclick="mvTheme.setTheme('light')">Lys</button>
      </div>
      <div class="mv-gear-section-label">Aksentfarge${pro ? '' : ' <span class="mv-pro-chip">PRO</span>'}</div>
      <div class="mv-accent-row${pro ? '' : ' is-locked'}" role="radiogroup" aria-label="Aksentfarge">
        ${ACCENTS.map(a => {
          const on = pro ? a.id === accent : a.id === 'oransje';
          return `<button type="button" role="radio" class="mv-accent-swatch${on?' is-on':''}"
            style="--swatch:${a.color}" title="${a.name}${pro?'':' — krever PRO'}" aria-label="${a.name}"
            aria-checked="${on}" ${pro ? `onclick="mvTheme.setAccent('${a.id}')"` : 'disabled'}></button>`;
        }).join('')}
      </div>
      ${pro ? '' : '<div class="mv-gear-hint">Velg egen aksentfarge med PRO.</div>'}`;
  }

  window.mvTheme = { ACCENTS, getTheme, getAccent, canChooseAccent, setTheme, setAccent, apply, renderControls, syncFromAccount };

  // Pakken (PRO?) blir kjent først etter innlogging — lock.js kaller apply() igjen da.
  apply();
  document.addEventListener('DOMContentLoaded', apply);
})();
