// ════════════════════════════════════════════════════════════════════════════
// now-playing.js — «Spilles nå», som i Spotify.
//
// PC:     klikk coveret eller tittelen i spilleren → panel på høyre side med
//         stort cover, tittel, favoritt, tekst, neste i køen og snarveier.
// Mobil:  trykk på minispilleren → fullskjerm «Spilles nå» med stort cover,
//         tidslinje du kan DRA i for å spole, kontroller, tilfeldig/gjenta og
//         «Tekst» som trekkes opp nederst. Lukk med pil ned, sveip ned eller
//         telefonens tilbakeknapp.
// ════════════════════════════════════════════════════════════════════════════
(function(){
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const P = () => (typeof bottomPlayer !== 'undefined' ? bottomPlayer : null);
  const cur = () => { const p = P(); return p ? p.queue[p.index] : null; };
  const st = () => (typeof state !== 'undefined' ? state : window.state) || {};
  const isMobile = () => matchMedia('(max-width: 768px)').matches;
  const fmt = s => { s = Math.max(0, Math.floor(Number(s) || 0)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  const keyLabel = k => { const m = /^([A-G][#b]?)(m?)$/.exec(k || ''); return m ? m[1] + (m[2] ? '-moll' : '-dur') : (k || ''); };
  const ICON = {
    heart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 7.5 2.7c0 5.6-7.5 10.2-7.5 10.2Z" fill="var(--fill,none)" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
    down: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    more: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.8" fill="currentColor"/><circle cx="12" cy="12" r="1.8" fill="currentColor"/><circle cx="19" cy="12" r="1.8" fill="currentColor"/></svg>',
    prev: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5v14M18 5.5v13a1 1 0 0 1-1.5.9L8.5 12.9a1 1 0 0 1 0-1.8l8-6.5a1 1 0 0 1 1.5.9Z" fill="currentColor" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
    next: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17 5v14M6 5.5v13a1 1 0 0 0 1.5.9l8-6.5a1 1 0 0 0 0-1.8l-8-6.5A1 1 0 0 0 6 5.5Z" fill="currentColor" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
    play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.6v12.8a1 1 0 0 0 1.5.9l10-6.4a1 1 0 0 0 0-1.7l-10-6.4A1 1 0 0 0 8 5.6Z" fill="currentColor"/></svg>',
    pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6.5" y="5" width="4" height="14" rx="1.2" fill="currentColor"/><rect x="13.5" y="5" width="4" height="14" rx="1.2" fill="currentColor"/></svg>',
    shuffle: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7h3.5c2 0 3.2 1 4.3 2.6l2.4 3.8c1.1 1.6 2.3 2.6 4.3 2.6H21M3 17h3.5c1.3 0 2.2-.4 3-1.2M14.5 8.2c.8-.8 1.7-1.2 3-1.2H21M18.5 4.5 21 7l-2.5 2.5M18.5 14.5 21 17l-2.5 2.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    repeat: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 11V9a3 3 0 0 1 3-3h12M16.5 3.5 19 6l-2.5 2.5M20 13v2a3 3 0 0 1-3 3H5M7.5 20.5 5 18l2.5-2.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    note: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 17.5V6.2a1 1 0 0 1 .76-.97l9-2.25A1 1 0 0 1 20 4v11.5M9 17.5a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0Zm11-2a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0Z" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
    up: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 15 6-6 6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  };

  // ── Data om låten som spilles ────────────────────────────────────────────
  function collection(){
    const p = P(), c = p && p.context; if (!c || !c.id) return null;
    const list = c.type === 'album' ? st().albums : c.type === 'mixtape' ? st().mixtapes : null;
    const col = (list || []).find(x => x.id === c.id);
    return col ? { type: c.type, id: c.id, name: col.name || '', cover: col.cover || '' } : null;
  }
  function lyricsOf(b){
    const clean = t => String(t || '').replace(/%%COLOR:[^%]+%%|%%ENDCOLOR%%/g, '');
    const secs = (b.lyricSections || []).filter(s => clean(s.text).trim());
    if (secs.length) return secs.map(s => ({ title: s.title || '', lines: clean(s.text).split('\n') }));
    if (String(b.lyrics || '').trim()) return [{ title: '', lines: clean(b.lyrics).replace(/<[^>]+>/g, '').split('\n') }];
    return [];
  }
  const sub = b => [b.bpm ? b.bpm + ' BPM' : '', keyLabel(b.key), b.uploadedBy || ''].filter(Boolean).join(' · ');
  const coverHTML = (b, cls) => {
    const src = b.cover || collection()?.cover || '';
    return src ? `<img class="${cls}" src="${esc(src)}" alt="">` : `<div class="${cls} np-cover-ph">${ICON.note}</div>`;
  };
  const lyricsHTML = (b, max) => {
    const L = lyricsOf(b); if (!L.length) return '';
    let n = 0, out = '';
    for (const s of L){
      if (max && n >= max) break;
      if (s.title) out += `<p class="np-lyr-sec">${esc(s.title)}</p>`;
      for (const line of s.lines){ if (max && n >= max) break; out += line.trim() ? `<p>${esc(line)}</p>` : '<br>'; n++; }
    }
    return out;
  };
  function nextUp(){ const p = P(); if (!p) return []; return p.queue.slice(p.index + 1, p.index + 4).map((b, i) => ({ b, i: p.index + 1 + i })); }

  // ═════════════════════════════ PC-PANEL ═════════════════════════════════
  let panelOpen = false;
  function renderPanel(){
    const el = $('mvNowPanel'); if (!el) return;
    const b = cur();
    if (!b){ el.querySelector('.np-body').innerHTML = '<p class="np-empty">Ingenting spilles akkurat nå.</p>'; return; }
    const col = collection(), lyr = lyricsHTML(b, 14), next = nextUp();
    el.querySelector('.np-head-title').textContent = col ? col.name : 'Spilles nå';
    el.querySelector('.np-body').innerHTML = `
      <div class="np-cover-wrap">${coverHTML(b, 'np-cover')}</div>
      <div class="np-title-row">
        <div class="np-titles"><h2 class="np-title">${esc(b.name || 'Uten navn')}</h2><p class="np-sub">${esc(sub(b) || (col ? (col.type === 'album' ? 'Album' : 'Mixtape') : 'Beat'))}</p></div>
        <button type="button" class="np-heart ${b.favorite ? 'on' : ''}" data-act="fav" aria-pressed="${!!b.favorite}" aria-label="${b.favorite ? 'Fjern fra favoritter' : 'Legg til favoritt'}">${ICON.heart}</button>
      </div>
      <section class="np-card np-lyrics-card">
        <div class="np-card-hd"><h3>Tekst</h3><button type="button" class="np-link" data-act="lab">Åpne i Lyric Lab</button></div>
        ${lyr ? `<div class="np-lyrics">${lyr}</div>` : '<p class="np-muted">Ingen tekst ennå.</p>'}
      </section>
      <section class="np-card">
        <div class="np-card-hd"><h3>Neste i køen</h3><button type="button" class="np-link" data-act="queue">Åpne kø</button></div>
        ${next.length ? next.map(x => `<button type="button" class="np-next" data-act="play" data-i="${x.i}">${coverHTML(x.b, 'np-next-cover')}<span><b>${esc(x.b.name || '')}</b><small>${esc(sub(x.b))}</small></span></button>`).join('') : '<p class="np-muted">Køen er tom etter denne låten.</p>'}
      </section>
      ${col ? `<button type="button" class="np-open-col" data-act="col"><span class="ic ic-${col.type === 'album' ? 'disc' : 'cassette'}" aria-hidden="true"></span> Gå til ${col.type === 'album' ? 'albumet' : 'mixtapen'} «${esc(col.name)}»</button>` : ''}`;
  }
  function buildPanel(){
    const el = document.createElement('aside'); el.id = 'mvNowPanel'; el.className = 'np-panel'; el.setAttribute('aria-label', 'Spilles nå');
    el.innerHTML = `<div class="np-head"><span class="np-head-title">Spilles nå</span><button type="button" class="np-icon" data-act="close" aria-label="Lukk">${ICON.close}</button></div><div class="np-body"></div>`;
    el.addEventListener('click', onAction);
    document.body.appendChild(el);
    return el;
  }
  function togglePanel(force){
    panelOpen = typeof force === 'boolean' ? force : !panelOpen;
    const el = $('mvNowPanel') || buildPanel();
    document.body.classList.toggle('mv-now-open', panelOpen);
    el.classList.toggle('open', panelOpen);
    if (panelOpen){ renderPanel(); window.mvToggleQueue && $('mvQueue') && !$('mvQueue').hidden && window.mvToggleQueue(); }
  }

  // ═════════════════════════════ MOBIL ════════════════════════════════════
  // Fullskjerm: coveret fyller bakgrunnen, teksten ligger over og kan rulles
  // og SKRIVES i direkte (samme lagring som Lyric Lab: beat.lyricSections).
  // Nederst: lite cover + tittel + favoritt, tidslinje du kan dra i, kontroller.
  let sheetOpen = false, seeking = false, sheetBeatId = null;

  // Tekst ↔ redigerbar HTML (samme format som Lyric Lab: %%COLOR:x%%tekst%%ENDCOLOR%%)
  const toHtml = t => esc(t || '').replace(/%%COLOR:([^%]+)%%([\s\S]*?)%%ENDCOLOR%%/g,
    (_, c, x) => `<mark style="background:${esc(c)};border-radius:3px;padding:0 1px">${x}</mark>`);
  function toText(el){
    let h = el.innerHTML
      .replace(/<mark[^>]*style="[^"]*background:\s*([^";]+)[^"]*"[^>]*>([\s\S]*?)<\/mark>/gi, (_, c, x) => `%%COLOR:${c.trim()}%%${x}%%ENDCOLOR%%`)
      // Enter i nettleseren lager <div>…</div> (med <br> når linjen er tom): hver <div> = ny linje
      .replace(/<br\s*\/?>(?=<\/(div|p)>)/gi, '')
      .replace(/<(div|p)[^>]*>/gi, '\n').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(div|p)>/gi, '').replace(/<[^>]+>/g, '');
    const d = document.createElement('textarea'); d.innerHTML = h; return d.value.replace(/\n{3,}/g, '\n\n');
  }
  function sectionsFor(b, create){
    if (Array.isArray(b.lyricSections) && b.lyricSections.length) return b.lyricSections;
    const legacy = String(b.lyrics || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').trim();
    if (!create && !legacy) return [];
    const id = typeof window.uid === 'function' ? window.uid() : String(Date.now());
    const secs = [{ id, type: 'verse', title: 'Tekst', text: legacy, collapsed: false, order: 0 }];
    if (create) b.lyricSections = secs;
    return secs;
  }
  let saveT = null;
  function saveSoon(){ clearTimeout(saveT); saveT = setTimeout(() => { if (typeof window.saveState === 'function') window.saveState(); }, 500); }

  function buildSheet(){
    const el = document.createElement('div'); el.id = 'mvNowSheet'; el.className = 'np-sheet'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'Spilles nå');
    el.innerHTML = `
      <div class="nps-bg" aria-hidden="true"></div>
      <div class="nps-top"><button type="button" class="np-icon" data-act="sheet-close" aria-label="Lukk">${ICON.down}</button><b class="nps-top-title"></b><button type="button" class="np-icon" data-act="menu" aria-label="Flere valg">${ICON.more}</button></div>
      <div class="nps-lyr" tabindex="-1"></div>
      <div class="nps-dock">
        <div class="nps-info">${'<div class="nps-mini"></div>'}<div class="np-titles"><h2 class="np-title"></h2><p class="np-sub"></p></div><button type="button" class="np-heart" data-act="fav">${ICON.heart}</button></div>
        <div class="nps-seek"><input type="range" class="nps-range" min="0" max="1000" value="0" step="1" aria-label="Spol i låten"><div class="nps-times"><span class="nps-cur">0:00</span><span class="nps-dur">0:00</span></div></div>
        <div class="nps-ctrl">
          <button type="button" class="np-icon nps-mode" data-act="repeat" aria-label="Gjenta låten" aria-pressed="false">${ICON.repeat}</button>
          <button type="button" class="np-icon nps-big" data-act="prev" aria-label="Forrige">${ICON.prev}</button>
          <button type="button" class="nps-play" data-act="toggle" aria-label="Spill av / pause"></button>
          <button type="button" class="np-icon nps-big" data-act="next" aria-label="Neste">${ICON.next}</button>
          <button type="button" class="np-icon nps-mode" data-act="shuffle" aria-label="Tilfeldig rekkefølge" aria-pressed="false">${ICON.shuffle}</button>
        </div>
      </div>`;
    el.addEventListener('click', onAction);
    // Tidslinje: dra med fingeren for å spole
    const r = el.querySelector('.nps-range');
    const startSeek = () => { seeking = true; };
    r.addEventListener('pointerdown', startSeek); r.addEventListener('touchstart', startSeek, { passive: true });
    r.addEventListener('input', () => {
      seeking = true; const a = P()?.audio; paintRange(r);
      if (a && a.duration > 0) el.querySelector('.nps-cur').textContent = fmt(a.duration * r.value / 1000);
    });
    const commit = () => { const a = P()?.audio; if (seeking && a && a.duration > 0) a.currentTime = a.duration * r.value / 1000; seeking = false; };
    r.addEventListener('change', commit); r.addEventListener('pointerup', commit); r.addEventListener('touchend', commit); r.addEventListener('touchcancel', () => { seeking = false; });
    // Skriving i teksten
    const lyr = el.querySelector('.nps-lyr');
    lyr.addEventListener('input', e => {
      const ed = e.target.closest('.nps-sec-text'); if (!ed) return;
      const b = beatById(sheetBeatId); if (!b) return;
      const secs = sectionsFor(b, true);
      const sec = secs.find(s => s.id === ed.dataset.sec) || secs[0];
      if (!ed.dataset.sec) ed.dataset.sec = sec.id;
      sec.text = toText(ed);
      ed.classList.toggle('is-empty', !sec.text.trim());
      saveSoon();
    });
    lyr.addEventListener('focusin', () => el.classList.add('editing'));
    lyr.addEventListener('focusout', () => setTimeout(() => { if (!lyr.contains(document.activeElement)) el.classList.remove('editing'); }, 50));
    document.body.appendChild(el);
    return el;
  }
  const beatById = id => (st().beats || []).find(b => b.id === id);
  function paintRange(r){ r.style.setProperty('--pct', (r.value / 10) + '%'); }
  function renderLyrics(el, b){
    const lyr = el.querySelector('.nps-lyr');
    if (lyr.contains(document.activeElement)) return;              // ikke tegn på nytt mens du skriver
    const secs = sectionsFor(b, false);
    const list = secs.length ? secs : [{ id: '', title: '', text: '' }];
    lyr.innerHTML = list.map(s => `
      <section class="nps-sec">${s.title ? `<p class="nps-sec-title">[${esc(s.title)}]</p>` : ''}
        <div class="nps-sec-text${String(s.text || '').trim() ? '' : ' is-empty'}" contenteditable="true" spellcheck="false" data-sec="${esc(s.id)}" data-ph="${secs.length ? 'Skriv ' + esc((s.title || 'tekst').toLowerCase()) + ' …' : 'Trykk her for å skrive tekst …'}">${toHtml(s.text)}</div>
      </section>`).join('') + `<button type="button" class="nps-add-sec" data-act="add-sec">+ Ny seksjon</button>`;
  }
  function renderSheet(){
    const el = $('mvNowSheet'); if (!el) return;
    const b = beatById(sheetBeatId) || cur(); if (!b){ closeSheet(); return; }
    const changed = b.id !== el.dataset.beat; el.dataset.beat = b.id;
    const src = b.cover || collection()?.cover || '';
    const bgUrl = src ? `url("${src.replace(/"/g, '%22')}")` : '';
    el.querySelector('.nps-bg').style.backgroundImage = bgUrl;
    el.style.setProperty('--np-cover', bgUrl || 'none');   // brukes av det uskarpe laget (samme farger som coveret)
    el.classList.toggle('no-cover', !src);
    el.querySelector('.nps-top-title').textContent = b.name || 'Uten navn';
    el.querySelector('.nps-mini').innerHTML = coverHTML(b, 'nps-mini-img');
    el.querySelector('.np-title').textContent = b.name || 'Uten navn';
    el.querySelector('.np-sub').textContent = sub(b) || (collection()?.name || 'Beat');
    const h = el.querySelector('.np-heart'); h.classList.toggle('on', !!b.favorite); h.setAttribute('aria-pressed', !!b.favorite); h.setAttribute('aria-label', b.favorite ? 'Fjern fra favoritter' : 'Legg til favoritt');
    el.style.setProperty('--np-bg', darkTone(getComputedStyle($('bottomPlayer') || document.body).getPropertyValue('--bp-tint').trim() || '#2a1d12'));
    if (sheetOpen){ setThemeColor(true); setPageBackdrop(true); }
    el.style.setProperty('--np-tint', getComputedStyle($('bottomPlayer') || document.body).getPropertyValue('--bp-tint').trim() || '#2a1d12');
    if (changed) renderLyrics(el, b);
    syncModes(); tickSheet();
  }
  function tickSheet(){
    const el = $('mvNowSheet'); if (!el || !sheetOpen) return;
    const a = P()?.audio; if (!a) return;
    const playing = cur()?.id === sheetBeatId;
    const btn = el.querySelector('.nps-play');
    const paused = !playing || a.paused;
    if (btn.dataset.s !== String(paused)){ btn.dataset.s = paused; btn.innerHTML = paused ? ICON.play : ICON.pause; btn.setAttribute('aria-label', paused ? 'Spill av' : 'Pause'); }
    if (seeking) return;
    const d = playing && a.duration > 0 ? a.duration : 0;
    const r = el.querySelector('.nps-range'); r.value = d ? Math.round(a.currentTime / d * 1000) : 0; paintRange(r);
    el.querySelector('.nps-cur').textContent = fmt(d ? a.currentTime : 0);
    el.querySelector('.nps-dur').textContent = d ? fmt(d) : '0:00';
  }
  // Siden bak skal ikke kunne rulles mens visningen er åpen. overflow:hidden på
  // body alene holder ikke på iPhone, og appens innhold ruller i main.app —
  // så vi fryser begge og legger rulleposisjonen tilbake etterpå.
  // 35 % coverfarge + 65 % nesten svart, som #rrggbb (theme-color forstår ikke alle fargeformater)
  function darkTone(color){
    try{
      const c = document.createElement('canvas').getContext('2d');
      c.fillStyle = '#2a1d12'; c.fillStyle = color;
      const v = c.fillStyle; let r, g, b;
      if (v[0] === '#'){ r = parseInt(v.slice(1, 3), 16); g = parseInt(v.slice(3, 5), 16); b = parseInt(v.slice(5, 7), 16); }
      else { [r, g, b] = v.match(/[\d.]+/g).map(Number); }
      const mix = (x, y) => Math.round(x * .35 + y * .65).toString(16).padStart(2, '0');
      return '#' + mix(r, 7) + mix(g, 6) + mix(b, 5);
    }catch(e){ return '#110d0b'; }
  }
  // Nettleserens statuslinje/adresselinje (theme-color) i samme mørke tone som visningen
  let prevTheme = null;
  function setThemeColor(on){
    const meta = document.querySelector('meta[name="theme-color"]'); if (!meta) return;
    if (on){
      if (prevTheme == null) prevTheme = meta.getAttribute('content');
      const sheet = document.getElementById('mvNowSheet');
      const bg = sheet && sheet.style.getPropertyValue('--np-bg');
      if (bg) meta.setAttribute('content', bg);
    } else if (prevTheme != null){ meta.setAttribute('content', prevTheme); prevTheme = null; }
  }
  // Safari (iPhone) tegner ikke faste elementer under statuslinjen — der vises
  // SIDENS bakgrunn. Mens visningen er åpen gjør vi derfor sidebakgrunnen til en
  // uskarp, mørk versjon av coveret, så bildet ser ut til å gå helt opp.
  // Uskarpheten lages ved å skalere coveret ned til 16×16 og la nettleseren
  // strekke det opp igjen (glatt), og fargene dempes i samme slengen.
  const backdropCache = new Map();
  function blurredBackdrop(src){
    if (!src) return Promise.resolve(null);
    if (backdropCache.has(src)) return backdropCache.get(src);
    const p = new Promise(res => {
      const img = new Image(); img.crossOrigin = 'anonymous';
      img.onload = () => {
        try{
          const n = 16, c = document.createElement('canvas'); c.width = c.height = n;
          const x = c.getContext('2d'); x.drawImage(img, 0, 0, n, n);
          const d = x.getImageData(0, 0, n, n), px = d.data;
          for (let i = 0; i < px.length; i += 4){
            const avg = (px[i] + px[i+1] + px[i+2]) / 3;
            for (let k = 0; k < 3; k++){ const v = avg + (px[i+k] - avg) * 1.3; px[i+k] = Math.max(0, Math.min(255, v * .42)); }   // mer farge, mørkere
          }
          x.putImageData(d, 0, 0);
          res(c.toDataURL('image/png'));
        }catch(e){ res(null); }                               // cover uten CORS: bruk bare fargen
      };
      img.onerror = () => res(null);
      img.src = src;
    });
    backdropCache.set(src, p);
    return p;
  }
  let backdropOn = false, backdropFor = null;
  async function setPageBackdrop(on){
    const html = document.documentElement, body = document.body;
    if (!on){
      backdropOn = false; backdropFor = null;
      ['background', 'background-color'].forEach(p => { html.style.removeProperty(p); body.style.removeProperty(p); });
      return;
    }
    backdropOn = true;
    const b = beatById(sheetBeatId) || cur();
    const src = (b && (b.cover || collection()?.cover)) || '';
    const color = $('mvNowSheet')?.style.getPropertyValue('--np-bg') || '#110d0b';
    backdropFor = src;
    body.style.setProperty('background', 'transparent', 'important');
    html.style.setProperty('background', color, 'important');
    const url = await blurredBackdrop(src);
    if (!backdropOn || backdropFor !== src) return;            // lukket eller byttet låt imens
    if (url) html.style.setProperty('background', `${color} url("${url}") center / cover no-repeat`, 'important');
  }
  let locked = null;
  function lockPage(on){
    const main = document.querySelector('main.app'), se = document.scrollingElement || document.documentElement;
    if (on && !locked){
      locked = { y: se.scrollTop, my: main ? main.scrollTop : 0 };
      document.body.classList.add('mv-now-sheet');
      document.body.style.top = -locked.y + 'px';
    } else if (!on && locked){
      const l = locked; locked = null;
      document.body.classList.remove('mv-now-sheet');
      document.body.style.top = '';
      se.scrollTop = l.y; if (main) main.scrollTop = l.my;
    }
  }
  // Byttes siden (f.eks. «Åpne i Lyric Lab» fra menyen), lukkes visningen
  let navWatch = null;
  function watchNav(){
    if (navWatch) return;
    const nav = document.querySelector('.mv-tabs'); if (!nav) return;
    navWatch = new MutationObserver(() => { if (sheetOpen && document.querySelector('.tab-btn.active')?.dataset.tab !== sheetTab) closeSheet(); });
    navWatch.observe(nav, { subtree: true, attributes: true, attributeFilter: ['class'] });
  }
  let sheetTab = null;
  function openSheet(beatId){
    sheetBeatId = beatId || cur()?.id; if (!sheetBeatId) return;
    const el = $('mvNowSheet') || buildSheet();
    delete el.dataset.beat;
    const wasOpen = sheetOpen;
    sheetTab = document.querySelector('.tab-btn.active')?.dataset.tab || null; watchNav();
    sheetOpen = true; renderSheet();
    el.classList.add('open'); lockPage(true); setThemeColor(true); setPageBackdrop(true);
    el.querySelector('.nps-lyr').scrollTop = 0;
    if (!wasOpen) history.pushState({ mvNow: 1 }, '', location.href);    // telefonens tilbakeknapp lukker
  }
  function closeSheet(fromPop){
    const el = $('mvNowSheet'); if (!el || !sheetOpen) return;
    if (el.querySelector('.nps-lyr').contains(document.activeElement)) document.activeElement.blur();
    clearTimeout(saveT); if (typeof window.saveState === 'function') window.saveState();
    sheetOpen = false;
    el.classList.remove('open', 'editing'); lockPage(false); setThemeColor(false); setPageBackdrop(false);
    if (!fromPop && history.state && history.state.mvNow) history.back();
  }
  window.addEventListener('popstate', () => { if (sheetOpen) closeSheet(true); });

  // Åpne en låt fra album/mixtape: legg albumet i køen (uten å spille) og vis visningen
  async function openFromCollection(beatId, mode){
    const p = P(); if (!p) return;
    const playingThis = cur()?.id === beatId && p.audio.src;
    if (!playingThis){
      try{
        const col = typeof activeCollectionForMode === 'function' ? activeCollectionForMode(mode) : null;
        const queue = col ? (mode === 'mixtape' && typeof getSortedMixtapeBeats === 'function' ? getSortedMixtapeBeats(col) : beatsFromIds(col.beatIds)) : [beatById(beatId)].filter(Boolean);
        const idx = Math.max(0, queue.findIndex(b => b.id === beatId));
        const url = await getPlayableAudioUrl(queue[idx]);
        if (url){
          if (p.objectUrl) URL.revokeObjectURL(p.objectUrl);
          p.objectUrl = url.startsWith('blob:') ? url : null;
          p.queue = queue; p.index = idx;
          p.context = col ? { type: mode, id: col.id, label: col.name || '' } : { type: 'beat', id: beatId, label: 'Beat' };
          p.started = true; p.playCounted = false;
          p.audio.pause(); p.audio.src = url; p.audio.load();
          if (typeof updateBottomUI === 'function') updateBottomUI();
        }
      }catch(e){ console.warn('[Spilles nå]', e); }
    }
    openSheet(beatId);
  }

  // ── Tilfeldig og gjenta ──────────────────────────────────────────────────
  let shuffled = false;
  function toggleShuffle(){
    const p = P(); if (!p) return;
    shuffled = !shuffled;
    if (shuffled){
      p._origQueue = p.queue.slice();
      const rest = p.queue.slice(p.index + 1);
      for (let i = rest.length - 1; i > 0; i--){ const j = Math.floor(Math.random() * (i + 1)); [rest[i], rest[j]] = [rest[j], rest[i]]; }
      p.queue = p.queue.slice(0, p.index + 1).concat(rest);
    } else if (p._origQueue){
      const c = cur(); p.queue = p._origQueue; p.index = Math.max(0, p.queue.findIndex(b => c && b.id === c.id)); p._origQueue = null;
    }
    syncModes(); if (panelOpen) renderPanel();
    if (typeof window.showToast === 'function') window.showToast(shuffled ? 'Tilfeldig rekkefølge på' : 'Tilfeldig rekkefølge av');
  }
  function toggleRepeat(){
    const a = P()?.audio; if (!a) return; a.loop = !a.loop; syncModes();
    if (typeof window.showToast === 'function') window.showToast(a.loop ? 'Gjentar låten' : 'Gjenta av');
  }
  function syncModes(){
    const el = $('mvNowSheet'); if (!el) return;
    const sh = el.querySelector('[data-act="shuffle"]'), rp = el.querySelector('[data-act="repeat"]');
    sh.classList.toggle('on', shuffled); sh.setAttribute('aria-pressed', shuffled);
    const loop = !!P()?.audio.loop; rp.classList.toggle('on', loop); rp.setAttribute('aria-pressed', loop);
  }

  // ── Felles handlinger ────────────────────────────────────────────────────
  function onAction(e){
    const t = e.target.closest('[data-act]'); if (!t) return;
    const b = (sheetOpen && beatById(sheetBeatId)) || cur(), act = t.dataset.act;
    if (act === 'close') return togglePanel(false);
    if (act === 'sheet-close') return closeSheet();
    if (act === 'toggle'){ if (sheetOpen && b && cur()?.id !== b.id) return window.playSingleBeat?.(b.id); return window.bottomTogglePlay?.(); }
    if (act === 'prev') return window.bottomPrev?.();
    if (act === 'next') return window.bottomNext?.();
    if (act === 'shuffle') return toggleShuffle();
    if (act === 'repeat') return toggleRepeat();
    if (act === 'play') return window.playBottomIndex?.(Number(t.dataset.i));
    if (act === 'queue') return window.mvToggleQueue?.();
    if (act === 'menu' && b) return window.mvSongMenu?.(b.id, { anchor: t }, 'beats');
    if (act === 'add-sec' && b){
      const secs = sectionsFor(b, true);
      const n = secs.filter(x => /^Vers/.test(x.title || '')).length + 1;
      secs.push({ id: typeof window.uid === 'function' ? window.uid() : String(Date.now()), type: 'verse', title: 'Vers ' + n, text: '', collapsed: false, order: secs.length });
      if (typeof window.saveState === 'function') window.saveState();
      const el = $('mvNowSheet'); delete el.dataset.beat; document.activeElement?.blur?.(); renderSheet();
      const eds = el.querySelectorAll('.nps-sec-text'); const last = eds[eds.length - 1];
      last?.scrollIntoView({ block: 'center' }); last?.focus();
      return;
    }
    if (!b) return;
    if (act === 'fav'){
      window.toggleFav?.(b.id);
      setTimeout(() => { panelOpen && renderPanel(); if (sheetOpen){ const el = $('mvNowSheet'); renderSheet(); } }, 30);
      return;
    }
    if (act === 'lab'){ closeSheet(); return window.openInLyricLab?.(b.id); }
    if (act === 'col'){ const c = collection(); if (c) window.dashOpenProject?.(c.id, c.type); }
  }

  // ── Koble til spilleren ──────────────────────────────────────────────────
  function onPlayerClick(e){
    const bar = $('bottomPlayer'); if (!bar || !bar.contains(e.target)) return;
    if (isMobile()){
      // Hele minispilleren åpner «Spilles nå», unntatt play-knappen
      if (e.target.closest('.bp-play, .bp-btn, button, input')) return;
      e.preventDefault(); openSheet(cur()?.id); return;
    }
    if (e.target.closest('#bpCover, .bp-meta')){ e.preventDefault(); togglePanel(); }
  }
  // På telefon erstatter visningen skriveboksen som åpnet seg under låten i album/mixtapes
  function hookCollectionCovers(){
    const orig = window.toggleAlbumBeat;
    if (typeof orig !== 'function' || orig._np) return;
    const wrapped = function(id){
      if (!isMobile()) return orig.apply(this, arguments);
      const card = document.getElementById('abi-' + id);
      const mode = card && card.closest('#mixtapeBeatList') ? 'mixtape' : 'album';
      // Trykk på coveret spiller låten (resten av samlingen følger etter).
      // «Spilles nå» åpnes bare fra spilleren nederst.
      if (typeof window.playCollectionFromBeat === 'function') window.playCollectionFromBeat(id, mode);
      else window.playSingleBeat?.(id);
    };
    wrapped._np = true; window.toggleAlbumBeat = wrapped;
  }
  function init(){
    hookCollectionCovers(); setTimeout(hookCollectionCovers, 1500);
    document.addEventListener('click', onPlayerClick);
    const bar = $('bottomPlayer');
    bar?.querySelector('#bpCover')?.setAttribute('title', 'Vis «Spilles nå»');
    const p = P();
    if (p){
      ['timeupdate', 'durationchange', 'play', 'pause'].forEach(ev => p.audio.addEventListener(ev, tickSheet));
      ['play', 'loadedmetadata'].forEach(ev => p.audio.addEventListener(ev, () => { panelOpen && renderPanel(); if (sheetOpen && cur()){ sheetBeatId = cur().id; renderSheet(); } }));
    }
    // Tittelen byttes av db.js updateBottomUI → oppdater (dekker også stopp/neste)
    const title = $('bpTitle');
    if (title) new MutationObserver(() => { panelOpen && renderPanel(); if (sheetOpen && cur()){ sheetBeatId = cur().id; renderSheet(); } if (panelOpen && !cur()) togglePanel(false); }).observe(title, { childList: true, characterData: true, subtree: true });
    document.addEventListener('keydown', e => { if (e.key === 'Escape'){ if (sheetOpen){ e.preventDefault(); closeSheet(); } else if (panelOpen && !document.querySelector('.mv-cm, .modal.open')) togglePanel(false); } });
    window.addEventListener('resize', () => { if (!isMobile() && sheetOpen) closeSheet(); if (isMobile() && panelOpen) togglePanel(false); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  window.mvNowPlaying = { togglePanel, openSheet, closeSheet, openFromCollection, toggleShuffle, toggleRepeat };
})();
