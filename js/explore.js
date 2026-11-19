// ════════════════════════════════════════════════════════════════════════════
// explore.js — fanen «Explore»: nye offentlige låter og artistsider fra andre
// brukere. Profiler åpnes inne i appen (ikke i nytt vindu), tegnet av
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
  const root = () => document.getElementById('exploreTab');

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
    const el = root(); if (!el || !client()) return;
    bind(el);
    if (view.slug) return openProfile(view.slug, true);
    if (!cache || Date.now() - cache.at > 60000){
      if (!cache) el.innerHTML = '<div class="ex-empty">Laster Explore …</div>';
      try {
        const [profiles, feed] = await Promise.all([rpc('explore_profiles'), rpc('explore_feed', { p_limit: 60 })]);
        cache = { profiles: profiles || [], feed: feed || [], at: Date.now() };
      } catch(e){ el.innerHTML = `<div class="ex-empty">Kunne ikke laste Explore: ${esc(e.message)}</div>`; return; }
    }
    if (!view.slug) drawOverview(el);
  }

  // ── Oversikt ─────────────────────────────────────────────────────────────
  function drawOverview(el){
    const { profiles, feed } = cache;
    el.innerHTML = `
      <div class="ex-wrap">
        <header class="ex-head">
          <h1>Explore</h1>
          <p>Nye offentlige låter og artister på Music Vault.</p>
        </header>
        <section class="ex-sec">
          <div class="ex-sec-head"><h2 class="ex-h">Artister</h2><span class="ex-count">${profiles.length}</span></div>
          ${profiles.length ? `<div class="ex-profiles">${profiles.map(profileCard).join('')}</div>`
            : '<p class="ex-hint">Ingen har publisert en artistside ennå. Lag din egen under «Artistside».</p>'}
        </section>
        <section class="ex-sec">
          <div class="ex-sec-head"><h2 class="ex-h">Nye låter</h2><span class="ex-count">${feed.length}</span></div>
          ${feed.length ? `<div class="ex-tracks">${feed.map(trackCard).join('')}</div>`
            : '<p class="ex-hint">Ingen offentlige låter ennå. Åpne menyen på en låt og velg «Gjør offentlig på Explore».</p>'}
        </section>
      </div>`;
    paintPlaying();
  }

  function profileCard(p){
    const accent = /^#[0-9a-f]{6}$/i.test(p.accent || '') ? p.accent : '#d68155';
    const banner = img(p.banner_url), photo = img(p.photo_url), name = p.display_name || p.slug;
    return `
      <button class="ex-profile" type="button" data-slug="${esc(p.slug)}" style="--ex-accent:${accent}" aria-label="Åpne profilen til ${esc(name)}">
        <span class="ex-profile-banner" ${banner ? `style="background-image:url('${esc(banner)}')"` : ''}></span>
        ${photo ? `<img class="ex-profile-avatar" src="${esc(photo)}" alt="">` : `<span class="ex-profile-avatar is-empty" aria-hidden="true">${esc(name.slice(0, 1).toUpperCase())}</span>`}
        <span class="ex-profile-name">${esc(name)}</span>
        <span class="ex-profile-meta">${p.public_tracks ? p.public_tracks + (p.public_tracks === 1 ? ' låt' : ' låter') : 'Artist'}</span>
      </button>`;
  }

  function trackCard(t){
    const d = t.data || {}, cover = img(d.cover), pr = t.profile;
    const artist = pr ? `<button class="ex-artist-link" type="button" data-slug="${esc(pr.slug)}">${esc(pr.display_name || pr.slug)}</button>`
                      : `<span>${esc(d.artist || 'Ukjent artist')}</span>`;
    return `
      <article class="ex-track" data-token="${esc(t.token)}">
        <div class="ex-cover">
          ${cover ? `<img src="${esc(cover)}" alt="" loading="lazy">` : '<span class="ex-cover-ph"><span class="ic ic-music" aria-hidden="true"></span></span>'}
          <button class="ex-play" type="button" data-token="${esc(t.token)}" aria-label="Spill ${esc(d.title || '')}"><span class="ic ic-play" aria-hidden="true"></span></button>
        </div>
        <div class="ex-track-title" title="${esc(d.title || '')}">${esc(d.title || 'Uten tittel')}</div>
        <div class="ex-track-meta">${artist}<span aria-hidden="true"> · </span><span>${esc(ago(t.published_at))}</span></div>
      </article>`;
  }

  // ── Profil inne i appen ──────────────────────────────────────────────────
  async function openProfile(slug){
    const el = root(); if (!el) return;
    view.slug = slug;
    el.innerHTML = `<div class="ex-wrap"><button class="ex-back" type="button" data-act="back">← Explore</button><div class="ex-empty">Laster profil …</div></div>`;
    window.scrollTo({ top: 0 });
    let page = null, pub = [];
    try { [page, pub] = await Promise.all([rpc('get_artist_page', { p_slug: slug }), rpc('explore_feed', { p_limit: 100, p_slug: slug })]); }
    catch(e){ page = null; }
    if (view.slug !== slug) return;            // brukeren gikk videre
    if (!page){ const m = el.querySelector('.ex-empty'); if (m) m.textContent = 'Denne profilen finnes ikke lenger eller er ikke publisert.'; return; }
    const tracks = { ...(page.tracks || {}) };
    (pub || []).forEach(t => { if (!tracks[t.token]) tracks[t.token] = t.data; });
    const base = Array.isArray(page.blocks) && page.blocks.length ? page.blocks : R().defaultBlocks(page);
    const shown = new Set(base.filter(b => b.type === 'tracks' && !b.hidden).flatMap(b => b.tokens || []));
    const extra = (pub || []).map(t => t.token).filter(t => !shown.has(t));
    const blocks = extra.length ? [...base, { id: 'ex-public', type: 'tracks', title: 'Offentlige låter', tokens: extra }] : base;
    const full = { ...page, blocks, tracks };
    el.innerHTML = `
      <div class="ex-wrap ex-profile-view">
        <div class="ex-profile-bar">
          <button class="ex-back" type="button" data-act="back">← Explore</button>
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

  function back(){ view.slug = null; open(); }

  // ── Avspilling i oversikten ──────────────────────────────────────────────
  function play(token){
    const t = (cache?.feed || []).find(x => x.token === token); if (!t || !/^https?:\/\//.test(t.data?.audio_url || '')) return;
    if (!audio){
      audio = new Audio(); audio.preload = 'none';
      ['play', 'pause', 'ended'].forEach(ev => audio.addEventListener(ev, paintPlaying));
    }
    if (current === token && !audio.paused){ audio.pause(); return; }
    if (current !== token){ audio.src = t.data.audio_url; current = token; }
    audio.play().catch(() => {});
  }
  function paintPlaying(){
    document.querySelectorAll('#exploreTab .ex-track').forEach(c => {
      const on = c.dataset.token === current && audio && !audio.paused;
      c.classList.toggle('is-playing', !!on);
      const ic = c.querySelector('.ex-play .ic'); if (ic) ic.className = 'ic ' + (on ? 'ic-pause' : 'ic-play');
    });
  }

  // Bare én lyd om gangen mellom Explore og resten av appen.
  const isMine = a => a === audio || !!(a.closest && a.closest('#exploreTab'));
  document.addEventListener('play', e => {
    const a = e.target; if (!a || a.tagName !== 'AUDIO') return;
    const mine = isMine(a);
    document.querySelectorAll('audio').forEach(o => { if (o !== a && !o.paused && isMine(o) !== mine) o.pause(); });
    if (!mine && audio && !audio.paused) audio.pause();
    if (mine) document.querySelectorAll('audio').forEach(o => { if (o !== a && isMine(o) && !o.paused) o.pause(); });
  }, true);

  function bind(el){
    if (bound) return; bound = true;
    el.addEventListener('click', e => {
      const t = e.target.closest('button'); if (!t) return;
      if (t.classList.contains('ex-play')) return play(t.dataset.token);
      if (t.dataset.act === 'back') return back();
      if (t.dataset.act === 'copy'){
        const url = new URL('artist.html?u=' + encodeURIComponent(t.dataset.copy), document.baseURI).href;
        return navigator.clipboard.writeText(url).then(() => window.showToast && showToast('✓ Lenke kopiert'));
      }
      if (t.dataset.slug){ if (audio) audio.pause(); return openProfile(t.dataset.slug); }
    });
  }

  window.mvExplore = { open, openProfile, refresh: () => { cache = null; return open(); } };
})();
