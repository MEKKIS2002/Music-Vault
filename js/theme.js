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
    // Canvas-tegninger (bølgeformer) leser fargene ved tegning — be dem tegne på nytt.
    window.dispatchEvent(new CustomEvent('mv:themechange', { detail: { theme: getTheme(), accent } }));
  }

  function setTheme(theme){ write('mv_theme', theme === 'light' ? 'light' : 'dark'); apply(); }
  function setAccent(id){
    if (!ACCENT_IDS.includes(id) || !canChooseAccent()) return;
    write('mv_accent', id); apply();
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

  window.mvTheme = { ACCENTS, getTheme, getAccent, canChooseAccent, setTheme, setAccent, apply, renderControls };

  // Pakken (PRO?) blir kjent først etter innlogging — lock.js kaller apply() igjen da.
  apply();
  document.addEventListener('DOMContentLoaded', apply);
})();
