// ════════════════════════════════════════════════════════════════════════════
// home-comments.js — «Kommentarer» på Hjem: de siste tilbakemeldingene på delte
// album- og mixtape-lenker (pitch_comments, samme kilde som albumsiden).
// Tre tilstander i tillegg til lista: laster, tom og feil med «Prøv igjen» —
// aldri en evig «Laster…». Henter på nytt høyst hvert minutt.
// ════════════════════════════════════════════════════════════════════════════
(function(){
  'use strict';
  const LIMIT = 5, TTL = 60000, TIMEOUT = 10000;
  let cache = null, cacheAt = 0, inflight = null;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const en = () => !!(window.mvI18n && mvI18n.lang === 'en');

  function ago(iso){
    const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000), E = en();
    if (s < 60)     return E ? 'just now' : 'nå nettopp';
    const m = Math.floor(s / 60), h = Math.floor(m / 60), d = Math.floor(h / 24);
    if (m < 60) return E ? `${m} min ago` : `for ${m} min siden`;
    if (h < 24) return E ? `${h} h ago` : `for ${h} t siden`;
    if (d < 7)  return E ? `${d} ${d === 1 ? 'day' : 'days'} ago` : `for ${d} ${d === 1 ? 'dag' : 'dager'} siden`;
    return new Date(iso).toLocaleDateString(E ? 'en-GB' : 'nb-NO', { day: 'numeric', month: 'short' });
  }

  function collections(){
    const st = window.state || {};
    const m = new Map();
    (st.albums || []).filter(a => !a.archived).forEach(a => m.set(String(a.id), { type: 'album', name: a.name || '', cover: a.cover || '' }));
    (st.mixtapes || []).filter(x => !x.archived).forEach(x => m.set(String(x.id), { type: 'mixtape', name: x.name || '', cover: x.cover || '' }));
    return m;
  }

  async function fetchComments(ids){
    const cfg = window.MV_CONFIG || {}; const SBU = cfg.SUPABASE_URL, SBK = cfg.SUPABASE_ANON_KEY;
    if (!SBU || !SBK) throw new Error('config');
    let token = SBK;
    try { const { data: { session } } = await window.supabaseClient.auth.getSession(); if (session && session.access_token) token = session.access_token; } catch(e){}
    const list = ids.map(id => '"' + String(id).replace(/"/g, '') + '"').join(',');
    const url = `${SBU}/rest/v1/pitch_comments?album_id=in.(${encodeURIComponent(list)})&order=created_at.desc&limit=${LIMIT}&select=id,album_id,author,comment,created_at`;
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), TIMEOUT);
    try {
      const r = await fetch(url, { headers: { apikey: SBK, Authorization: 'Bearer ' + token }, signal: ctrl.signal });
      if (!r.ok) throw new Error('http ' + r.status);
      return await r.json();
    } finally { clearTimeout(t); }
  }

  function paint(el, rows, cols){
    if (!rows.length){
      el.innerHTML = `<div class="cf-empty">${en() ? 'No comments yet. When someone comments on a shared album or mixtape link, it shows up here.' : 'Ingen kommentarer ennå. Når noen kommenterer på en delt album- eller mixtape-lenke, dukker det opp her.'}</div>`;
      return;
    }
    el.innerHTML = rows.map(c => {
      const col = cols.get(String(c.album_id)) || { type: 'album', name: '' };
      const author = c.author || (en() ? 'Anonymous' : 'Anonym');
      return `<button type="button" class="cf-item" data-type="${col.type}" data-id="${esc(c.album_id)}">
        <span class="cf-avatar" aria-hidden="true">${esc(author.slice(0, 2).toUpperCase())}</span>
        <span class="cf-body"><span class="cf-header"><span class="cf-author">${esc(author)}</span><span class="cf-on">${en() ? 'on' : 'på'}</span><span class="cf-proj" data-no-i18n>${esc(col.name)}</span><span class="cf-time">${esc(ago(c.created_at))}</span></span>
        <span class="cf-text" data-no-i18n>${esc(c.comment || '')}</span></span></button>`;
    }).join('');
  }

  function fail(el){
    el.innerHTML = `<div class="cf-empty cf-error" role="status">${en() ? 'Couldn’t load comments.' : 'Kunne ikke hente kommentarene.'} <button type="button" class="cf-retry">${en() ? 'Try again' : 'Prøv igjen'}</button></div>`;
  }

  async function render(force){
    const el = document.getElementById('dashCommentFeed'); if (!el) return;
    const cols = collections(); const ids = [...cols.keys()].slice(0, 150);
    if (!ids.length){ paint(el, [], cols); return; }
    if (!force && cache && Date.now() - cacheAt < TTL){ paint(el, cache, cols); return; }
    if (!cache) el.innerHTML = `<div class="cf-loading">${en() ? 'Loading comments…' : 'Laster kommentarer…'}</div>`;
    try {
      inflight = inflight || fetchComments(ids);
      cache = await inflight; cacheAt = Date.now();
      paint(el, cache, cols);
    } catch(e){ if (cache) paint(el, cache, cols); else fail(el); }
    finally { inflight = null; }
  }

  document.addEventListener('click', e => {
    if (e.target.closest('#dashCommentFeed .cf-retry')){ render(true); return; }
    const it = e.target.closest('#dashCommentFeed .cf-item'); if (!it) return;
    const tab = it.dataset.type === 'mixtape' ? 'mixtapes' : 'albums';
    document.querySelector(`.tab-btn[data-tab="${tab}"]`)?.click();
    setTimeout(() => (it.dataset.type === 'mixtape' ? window.openMixtape : window.openAlbum)?.(it.dataset.id), 80);
  });

  // Følg renderDashboard (som kjøres ved oppstart, synk og språkbytte)
  const hook = () => {
    if (typeof window.renderDashboard !== 'function' || window.renderDashboard.__cf) return false;
    const orig = window.renderDashboard;
    window.renderDashboard = function(){ const r = orig.apply(this, arguments); try { render(false); } catch(e){} return r; };
    window.renderDashboard.__cf = true; return true;
  };
  if (!hook()) document.addEventListener('DOMContentLoaded', hook);
  window.mvRenderHomeComments = render;
})();
