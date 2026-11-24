// ════════════════════════════════════════════════════════════════════════════
// explore.js — Explore-seksjonen på Hjem (#homeExplore): nye offentlige låter
// og artistsider fra andre brukere. Profiler åpnes inne i appen (ikke i nytt vindu), tegnet av
// js/artist-render.js — samme utseende som den offentlige artistsiden.
//
// Data (kun innloggede):
//   rpc explore_profiles()            → publiserte artistsider
//   rpc explore_feed(p_limit, p_slug) → offentlige låter (song_shares.is_public)
//   rpc get_artist_page(p_slug)       → én profil
// En låt blir offentlig via «Gjør offentlig på Explore» (js/share-song.js).
// ════════════════════════════════════════════════════════════════════════════
(function(){
  'use strict';
  const R = () => window.mvArtistRender;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const img = u => /^https:\/\//i.test(u || '') || /^data:image\//.test(u || '') ? u : '';
  const client = () => window.supabaseClient;
  const root = () => document.getElementById('homeExplore');
  const home = () => document.getElementById('hjemTab');

  let cache = null;            // { profiles, feed, at }
  let view = { slug: null };   // null = oversikt
  let audio = null, current = null, bound = false;

  function ago(iso){
    const s = (Date.now() - new Date(iso).getTime()) / 1000;
    if (!isFinite(s)) return '';
    if (s < 3600) return Math.max(1, Math.round(s / 60)) + ' min siden';
    if (s < 86400) return Math.round(s / 3600) + ' t siden';
    if (s < 86400 * 30) return Math.round(s / 86400) + ' d siden';
    return new Date(iso).toLocaleDateString('no-NO', { day: 'numeric', month: 'short' });
  }

  async function rpc(name, args){
    const { data, error } = await client().rpc(name, args || {});
    if (error) throw error;
    return data;
  }

  async function open(){
    const el = root(); if (!el) return;
    if (!client() || !sessionStorage.getItem('mv_package')){ el.hidden = true; return; }
    bind(el);
    if (view.slug) return openProfile(view.slug, true);
    if (!cache || Date.now() - cache.at > 60000){
      el.hidden = false;
      if (!cache) el.innerHTML = '<div class="dash-sec-hd"><div class="dash-section-label">Explore</div></div><div class="ex-empty">Laster …</div>';
      try {
        const [profiles, feed] = await Promise.all([rpc('explore_profiles'), rpc('explore_feed', { p_limit: 60 })]);
        cache = { profiles: profiles || [], feed: feed || [], at: Date.now() };
      } catch(e){ el.hidden = true; console.warn('[Explore]', e.message); return; }
    }
    if (!view.slug) drawOverview(el);
  }

  // ── Oversikt: to kompakte kolonner (Nye låter | Artister) ───────────────
  const PREVIEW = 5;                      // rader før «Se mer»
  const open_ = { tracks: false, artists: false };

  function column(key, title, items, row, empty){
    const more = items.length > PREVIEW, expanded = open_[key];
    const shown = expanded ? items : items.slice(0, PREVIEW);
    return `
      <div class="ex-col">
        <div class="ex-col-head"><h3 class="ex-h">${title}</h3><span class="ex-count">${items.length}</span></div>
        ${items.length ? `<ul class="ex-list">${shown.map(row).join('')}</ul>
          ${more ? `<button class="ex-more" type="button" data-act="more" data-key="${key}" aria-expanded="${expanded}">
            ${expanded ? 'Se mindre' : `Se mer (${items.length - PREVIEW})`}<span class="ex-chev" aria-hidden="true">▾</span></button>` : ''}`
          : `<p class="ex-hint">${empty}</p>`}
      </div>`;
  }

  function drawOverview(el){
    const { profiles, feed } = cache;
    home()?.classList.remove('is-ex-profile');
    el.hidden = false;
    el.innerHTML = `
      <div class="dash-sec-hd ex-top"><div class="dash-section-label">Explore</div><span class="ex-sub">Offentlig på Music Vault</span></div>
      <div class="ex-cols">
        ${column('tracks', 'Nye låter', feed, trackRow, 'Ingen offentlige låter ennå. Åpne menyen på en låt og velg «Gjør offentlig på Explore».')}
        ${column('artists', 'Artister', profiles, profileRow, 'Ingen publiserte artistsider ennå. Lag din egen under «Artistside».')}
      </div>`;
    paintPlaying();
  }

  function profileRow(p){
    const accent = /^#[0-9a-f]{6}$/i.test(p.accent || '') ? p.accent : '#d68155';
    const photo = img(p.photo_url), name = p.display_name || p.slug;
    return `
      <li><button class="ex-row ex-profile" type="button" data-slug="${esc(p.slug)}" style="--ex-accent:${accent}" aria-label="Åpne profilen til ${esc(name)}">
        ${photo ? `<img class="ex-avatar" src="${esc(photo)}" alt="" loading="lazy">` : `<span class="ex-avatar is-empty" aria-hidden="true">${esc(name.slice(0, 1).toUpperCase())}</span>`}
        <span class="ex-main"><span class="ex-title">${esc(name)}</span>
          <span class="ex-meta">${p.public_tracks ? p.public_tracks + (p.public_tracks === 1 ? ' offentlig låt' : ' offentlige låter') : 'Artist'}</span></span>
        <span class="ex-go" aria-hidden="true">›</span>
      </button></li>`;
  }

  function trackRow(t){
    const d = t.data || {}, cover = img(d.cover), pr = t.profile;
    const artist = pr ? `<button class="ex-artist-link" type="button" data-slug="${esc(pr.slug)}">${esc(pr.display_name || pr.slug)}</button>`
                      : `<span>${esc(d.artist || 'Ukjent artist')}</span>`;
    return `
      <li class="ex-row ex-track" data-token="${esc(t.token)}">
        <span class="ex-cover">${cover ? `<img src="${esc(cover)}" alt="" loading="lazy">` : '<span class="ic ic-music" aria-hidden="true"></span>'}</span>
        <span class="ex-main"><span class="ex-title" title="${esc(d.title || '')}">${esc(d.title || 'Uten tittel')}</span>
          <span class="ex-meta">${artist}<span aria-hidden="true"> · </span>${esc(ago(t.published_at))}</span></span>
        <span class="mv-eq" aria-hidden="true"><i></i><i></i><i></i></span>
        <button class="ex-play" type="button" data-token="${esc(t.token)}" aria-label="Spill ${esc(d.title || '')}"><span class="ic ic-play" aria-hidden="true"></span></button>
      </li>`;
  }

  // ── Profil inne i appen ──────────────────────────────────────────────────
  async function openProfile(slug){
    const el = root(); if (!el) return;
    stopProfileAudio();
    view.slug = slug;
    el.hidden = false;
    home()?.classList.add('is-ex-profile');
    el.innerHTML = `<div class="ex-wrap"><button class="ex-back" type="button" data-act="back">← Hjem</button><div class="ex-empty">Laster profil …</div></div>`;
    window.scrollTo({ top: 0 });
    let page = null;
    try { page = await rpc('get_artist_page', { p_slug: slug }); }
    catch(e){ page = null; }
    if (view.slug !== slug) return;            // brukeren gikk videre
    if (!page){ const m = el.querySelector('.ex-empty'); if (m) m.textContent = 'Denne profilen finnes ikke lenger eller er ikke publisert.'; return; }
    // Profilen viser artistens eget utvalg av offentlige låter (get_artist_page
    // filtrerer bort alt som ikke er offentlig) — ingen ekstra låter legges til.
    const full = page;
    el.innerHTML = `
      <div class="ex-wrap ex-profile-view">
        <div class="ex-profile-bar">
          <button class="ex-back" type="button" data-act="back">← Hjem</button>
          <button class="ex-chip" type="button" data-act="copy" data-copy="${esc(slug)}"><span class="ic ic-link" aria-hidden="true"></span> Kopier lenke</button>
        </div>
        <div class="ap-page ex-ap" id="exAp"><div id="exApBody"></div></div>
      </div>`;
    const host = el.querySelector('#exAp');
    R().applyAccent(host, page.accent);
    host.querySelector('#exApBody').innerHTML = R().html(full);
    host.querySelectorAll('.ap-links a, .ap-contact a').forEach(a => { a.target = '_blank'; a.rel = 'noopener'; });
    R().bind(host, full);
  }

  function back(){
    stopProfileAudio();
    view.slug = null; home()?.classList.remove('is-ex-profile');
    open().then(() => root()?.scrollIntoView({ block: 'start' }));
  }
  // Forlater man Hjem midt i en profil, starter Hjem på oversikten neste gang.
  function reset(){ if (view.slug){ stopProfileAudio(); view.slug = null; home()?.classList.remove('is-ex-profile'); } }

  // ── Avspilling i oversikten ──────────────────────────────────────────────
  function play(token){
    const t = (cache?.feed || []).find(x => x.token === token); if (!t || !/^https?:\/\//.test(t.data?.audio_url || '')) return;
    if (!audio){
      audio = new Audio(); audio.preload = 'none'; exclusive(audio);
      ['play', 'pause', 'ended'].forEach(ev => audio.addEventListener(ev, paintPlaying));
    }
    if (current === token && !audio.paused){ audio.pause(); return; }
    if (current !== token){ audio.src = t.data.audio_url; current = token; }
    audio.play().catch(() => {});
  }
  function paintPlaying(){
    document.querySelectorAll('#homeExplore .ex-track').forEach(c => {
      const isCur = c.dataset.token === current && !!audio, on = isCur && !audio.paused;
      c.classList.toggle('is-playing', isCur);
      c.classList.toggle('is-paused', isCur && audio.paused);
      const ic = c.querySelector('.ex-play .ic'); if (ic) ic.className = 'ic ' + (on ? 'ic-pause' : 'ic-play');
    });
  }

  // ── Bare én lyd om gangen i hele appen ───────────────────────────────────
  // Appens spiller (bottomPlayer.audio i db.js) og Explore bruker lydelementer
  // UTENFOR DOM-en — «play» fra dem når aldri document. Derfor registreres de
  // her (mvExclusiveAudio) og får sin egen lytter; lydelementer i DOM-en
  // (profiler, Lyric Lab o.l.) fanges av lytteren på document.
  const players = new Set();
  function stopOthers(a){
    players.forEach(o => { if (o !== a && !o.paused) o.pause(); });
    document.querySelectorAll('audio').forEach(o => { if (o !== a && !o.paused) o.pause(); });
  }
  function exclusive(a){
    if (!a || players.has(a)) return;
    players.add(a);
    if (!a.isConnected) a.addEventListener('play', () => stopOthers(a));
  }
  window.mvExclusiveAudio = exclusive;
  document.addEventListener('play', e => { if (e.target && e.target.tagName === 'AUDIO') stopOthers(e.target); }, true);
  try { if (typeof bottomPlayer !== 'undefined' && bottomPlayer.audio) exclusive(bottomPlayer.audio); } catch(_){}

  // Profilens lyd stopper når profilen lukkes (eller byttes).
  function stopProfileAudio(){ root()?.querySelectorAll('audio').forEach(a => { a.pause(); a.removeAttribute('src'); a.load(); }); }

  function bind(el){
    if (bound) return; bound = true;
    el.addEventListener('click', e => {
      const t = e.target.closest('button'); if (!t) return;
      if (t.classList.contains('ex-play')) return play(t.dataset.token);
      if (t.dataset.act === 'back') return back();
      if (t.dataset.act === 'more'){ open_[t.dataset.key] = !open_[t.dataset.key]; return drawOverview(root()); }
      if (t.dataset.act === 'copy'){
        const url = new URL('artist.html?u=' + encodeURIComponent(t.dataset.copy), document.baseURI).href;
        return navigator.clipboard.writeText(url).then(() => window.showToast && showToast('✓ Lenke kopiert'));
      }
      if (t.dataset.slug){ if (audio) audio.pause(); return openProfile(t.dataset.slug); }
    });
  }

  function stopAll(){ if (audio){ audio.pause(); } stopProfileAudio(); paintPlaying(); }
  window.mvExplore = { open, openProfile, reset, stopAll, refresh: () => { cache = null; return open(); } };
  // Andre faner enn Hjem: lukk en åpen profil så Hjem er normal ved retur.
  document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('.tab-btn[data-tab]'); if (b && b.dataset.tab !== 'hjem') reset(); });
  setTimeout(() => { if (!document.getElementById('hjemTab')?.classList.contains('hidden')) open(); }, 2500);
})();
