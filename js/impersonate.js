// ════════════════════════════════════════════════════════════════════════════
// impersonate.js — «Bytt bruker» for admin (som WordPress User Switching).
//
// Admin kan se appen nøyaktig slik en annen bruker ser den, og hoppe tilbake.
// - Serverdelen er Edge Function «impersonate» (sjekker at du er admin,
//   lager en sesjon for målbrukeren og logger byttet).
// - Mens du ser som en annen bruker er appen SKRIVEBESKYTTET: alle kall som
//   endrer data (POST/PATCH/PUT/DELETE mot Supabase og R2) blokkeres her.
//   Derfor MÅ denne filen lastes FØR supabase-js — biblioteket tar en kopi av
//   fetch når klienten opprettes.
// - Adminens egen innlogging (refresh-token) gjemmes i localStorage under
//   «mv_impersonator» og brukes for å bytte videre / tilbake.
// ════════════════════════════════════════════════════════════════════════════
(function(){
  'use strict';
  const SB_URL = 'https://ylvqkfdvijqnecuqznyr.supabase.co';
  const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlsdnFrZmR2aWpxbmVjdXF6bnlyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgzMzA4MzIsImV4cCI6MjA5MzkwNjgzMn0.bYPTaxQK8n7I7w5Ri2DVYW5_LbFHg2IXkuhHsLTDDqc';
  const KEY = 'mv_impersonator';
  const DAY = 24*60*60*1000;

  const load = () => { try{ return JSON.parse(localStorage.getItem(KEY) || 'null'); }catch(e){ return null; } };
  const save = v => { try{ v ? localStorage.setItem(KEY, JSON.stringify(v)) : localStorage.removeItem(KEY); }catch(e){} };
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let imp = load();

  // ── 1. Skrivesperre (installeres umiddelbart) ─────────────────────────────
  const READ_RPC = /\/rest\/v1\/rpc\/(get_usernames|get_user_id_by_username|get_mixtape_share)\b/;
  const realFetch = window.fetch.bind(window);
  let lastWarn = 0;
  function isBlocked(url, method){
    if (!imp) return false;
    method = (method || 'GET').toUpperCase();
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return false;
    if (!/supabase\.co|workers\.dev|r2\.dev/.test(url)) return false;
    if (/\/auth\/v1\//.test(url)) return false;                  // token-fornyelse
    if (/\/functions\/v1\/impersonate\b/.test(url)) return false;
    if (READ_RPC.test(url)) return false;
    return true;
  }
  window.fetch = function(input, init){
    const url = typeof input === 'string' ? input : (input && input.url) || String(input);
    const method = (init && init.method) || (input && input.method) || 'GET';
    if (isBlocked(url, method)){
      console.warn('[Bytt bruker] Blokkert (skrivebeskyttet):', method, url.replace(/\?.*$/, ''));
      if (Date.now() - lastWarn > 4000 && typeof window.showToast === 'function'){
        lastWarn = Date.now();
        window.showToast('Skrivebeskyttet — du ser appen som ' + (imp.target?.username || 'en annen bruker'));
      }
      const body = JSON.stringify({ message: 'Skrivebeskyttet visning (Bytt bruker)', error: 'read_only' });
      return Promise.resolve(new Response(body, { status: 403, headers: { 'Content-Type': 'application/json' } }));
    }
    return realFetch(input, init);
  };

  // ── 2. Hjelpere ───────────────────────────────────────────────────────────
  async function api(action, token, extra){
    const r = await realFetch(SB_URL + '/functions/v1/impersonate', {
      method: 'POST',
      headers: { apikey: SB_KEY, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({ action }, extra || {}))
    });
    const b = await r.json().catch(()=>({}));
    if (!r.ok) throw new Error(b.error || b.message || ('Feil ' + r.status));
    return b;
  }
  // Adminens access-token mens vi ser som en annen: forny med lagret refresh-token
  async function adminSession(){
    const r = await realFetch(SB_URL + '/auth/v1/token?grant_type=refresh_token', {
      method: 'POST', headers: { apikey: SB_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: imp.refresh_token })
    });
    const s = await r.json().catch(()=>({}));
    if (!r.ok || !s.access_token) throw new Error('Admin-innloggingen din har utløpt. Logg inn på nytt.');
    imp.refresh_token = s.refresh_token; save(imp);
    return s;
  }
  async function adminToken(){
    if (imp) return (await adminSession()).access_token;
    const s = (await window.supabaseClient.auth.getSession())?.data?.session;
    if (!s) throw new Error('Ikke innlogget.');
    return s.access_token;
  }
  function applyIdentity(u){
    try{
      localStorage.setItem('mv_role', u.role === 'admin' ? 'admin' : 'user');
      localStorage.setItem('mv_package', u.package || (u.role === 'admin' ? 'admin' : 'artist'));
      localStorage.setItem('mv_username', u.username || '');
      localStorage.setItem('mv_user_id', u.id);
      localStorage.setItem('mv_session_expires', String(Date.now() + 14*DAY));
      localStorage.removeItem('mv_sync_pending');                 // aldri ta med ulagret fra forrige bruker
      ['mv_unlocked','mv_role','mv_package','mv_username','mv_user_id'].forEach(k=>sessionStorage.removeItem(k));
    }catch(e){}
  }
  const reloadHome = () => { location.replace(location.pathname + location.search + '#hjem'); location.reload(); };

  // ── 3. Bytt til / tilbake ─────────────────────────────────────────────────
  async function switchTo(user){
    const client = window.supabaseClient; if (!client) throw new Error('Supabase er ikke klar.');
    if (!imp){
      // Ta vare på adminens egen sesjon FØR vi bytter. Stopp automatisk
      // fornyelse så refresh-tokenet vi lagrer ikke blir brukt opp i mellomtiden.
      try{ client.auth.stopAutoRefresh(); }catch(e){}
      const s = (await client.auth.getSession())?.data?.session;
      if (!s) throw new Error('Ikke innlogget.');
      let res;
      try{ res = await api('switch', s.access_token, { target_id: user.id }); }
      catch(e){ try{ client.auth.startAutoRefresh(); }catch(_){} throw e; }
      imp = {
        refresh_token: s.refresh_token,
        id: s.user.id,
        username: sessionStorage.getItem('mv_username') || localStorage.getItem('mv_username') || '',
        role: sessionStorage.getItem('mv_role') || localStorage.getItem('mv_role') || 'admin',
        package: sessionStorage.getItem('mv_package') || localStorage.getItem('mv_package') || 'admin',
        target: res.user
      };
      save(imp);
      await client.auth.setSession({ access_token: res.access_token, refresh_token: res.refresh_token });
      applyIdentity(res.user);
    } else {
      const res = await api('switch', await adminToken(), { target_id: user.id });
      imp.target = res.user; save(imp);
      await client.auth.setSession({ access_token: res.access_token, refresh_token: res.refresh_token });
      applyIdentity(res.user);
    }
    reloadHome();
  }
  async function switchBack(){
    if (!imp) return;
    let s;
    try{ s = await adminSession(); }
    catch(e){
      alertMsg(e.message);
      save(null); imp = null;
      if (typeof window.mvHardLogout === 'function') window.mvHardLogout(); else location.reload();
      return;
    }
    const me = { id: imp.id, username: imp.username, role: imp.role, package: imp.package };
    try{ await window.supabaseClient.auth.setSession({ access_token: s.access_token, refresh_token: s.refresh_token }); }catch(e){}
    save(null); imp = null;
    applyIdentity(me);
    reloadHome();
  }
  function alertMsg(m){ if (typeof window.showToast === 'function') window.showToast(m); else console.warn(m); }

  // ── 4. Panel ──────────────────────────────────────────────────────────────
  const unlocked = () => { const ls = document.getElementById('lockScreen'); return !ls || getComputedStyle(ls).display === 'none'; };
  const isAdmin = () => (sessionStorage.getItem('mv_role') || localStorage.getItem('mv_role')) === 'admin';
  let users = null, el = null;

  function render(){
    const show = unlocked() && (imp || isAdmin());
    document.body.classList.toggle('mv-impersonating', !!imp && unlocked());
    if (!show){ el?.remove(); el = null; return; }
    if (!el){
      el = document.createElement('div'); el.id = 'mvSwitch'; el.className = 'mv-switch';
      el.addEventListener('click', onClick);
      el.addEventListener('input', e=>{ if (e.target.matches('.mv-switch-search')) drawList(e.target.value); });
      el.addEventListener('keydown', e=>{ if (e.key === 'Escape'){ e.stopPropagation(); closePop(); } });
      document.body.appendChild(el);
      document.addEventListener('click', e=>{ if (el && !e.composedPath().includes(el)) closePop(); });
    }
    const open = el.classList.contains('open');
    el.innerHTML = imp
      ? `<div class="mv-switch-bar" role="status">
           <span class="ic ic-eye" aria-hidden="true"></span>
           <span class="mv-switch-txt">Viser som <b>${esc(imp.target?.username || '?')}</b><span class="mv-switch-ro">Skrivebeskyttet</span></span>
           <button type="button" class="mv-switch-btn" data-act="pick" aria-expanded="${open}">Bytt bruker</button>
           <button type="button" class="mv-switch-btn is-primary" data-act="back">Tilbake til ${esc(imp.username || 'meg')}</button>
         </div>`
      : `<button type="button" class="mv-switch-fab" data-act="pick" aria-expanded="${open}" title="Bytt bruker — se appen som en annen bruker"><span class="ic ic-user" aria-hidden="true"></span><span class="mv-switch-fab-txt">Bytt bruker</span></button>`;
    el.insertAdjacentHTML('beforeend', `<div class="mv-switch-pop" role="dialog" aria-label="Bytt bruker" ${open ? '' : 'hidden'}>
        <p class="mv-switch-pop-title">Se appen som</p>
        <input class="mv-switch-search" type="search" placeholder="Søk etter bruker" aria-label="Søk etter bruker">
        <ul class="mv-switch-list"><li class="mv-switch-empty">Henter brukere…</li></ul>
        <p class="mv-switch-note">Du ser appen som brukeren, men kan ikke endre noe. Byttet logges.</p>
      </div>`);
    if (open) drawList('');
  }
  function closePop(){ if (el?.classList.contains('open')){ el.classList.remove('open'); render(); } }
  async function openPop(){
    el.classList.add('open'); render();
    el.querySelector('.mv-switch-search')?.focus();
    if (!users){
      try{ users = (await api('list', await adminToken())).users || []; }
      catch(e){ users = null; const l = el?.querySelector('.mv-switch-list'); if (l) l.innerHTML = `<li class="mv-switch-empty">${esc(e.message)}</li>`; return; }
      drawList(el.querySelector('.mv-switch-search')?.value || '');
    }
  }
  function drawList(q){
    const l = el?.querySelector('.mv-switch-list'); if (!l || !users) return;
    const me = imp ? imp.id : (sessionStorage.getItem('mv_user_id') || localStorage.getItem('mv_user_id'));
    const cur = imp ? imp.target?.id : me;
    q = (q || '').trim().toLowerCase();
    const list = users.filter(u => u.id !== me && (!q || (u.username || '').toLowerCase().includes(q)));
    l.innerHTML = list.length ? list.map(u => `<li><button type="button" data-act="to" data-id="${esc(u.id)}" ${u.id === cur ? 'aria-current="true"' : ''}>
        <span class="mv-switch-av">${esc((u.username || '?').slice(0,2).toUpperCase())}</span>
        <span class="mv-switch-name">${esc(u.username || '(uten navn)')}</span>
        <span class="mv-switch-tag">${esc(u.role === 'admin' ? 'admin' : (u.package || 'bruker'))}</span>
        ${u.id === cur ? '<span class="ic ic-check" aria-hidden="true"></span>' : ''}
      </button></li>`).join('') : `<li class="mv-switch-empty">Ingen andre brukere${q ? ' som passer søket' : ''}.</li>`;
  }
  async function onClick(e){
    const b = e.target.closest('[data-act]'); if (!b) return;
    const act = b.dataset.act;
    if (act === 'pick'){ el.classList.contains('open') ? closePop() : openPop(); return; }
    if (act === 'back'){ b.disabled = true; b.textContent = 'Bytter…'; await switchBack(); return; }
    if (act === 'to'){
      const u = (users || []).find(x => x.id === b.dataset.id); if (!u || u.id === imp?.target?.id) return;
      b.disabled = true; b.querySelector('.mv-switch-name').textContent = 'Bytter til ' + (u.username || '') + '…';
      try{ await switchTo(u); }
      catch(err){ b.disabled = false; alertMsg('Kunne ikke bytte: ' + err.message); drawList(''); }
    }
  }

  function init(){
    render();
    const ls = document.getElementById('lockScreen');
    if (ls) new MutationObserver(render).observe(ls, { attributes:true, attributeFilter:['style','class'] });
    window.addEventListener('storage', e=>{ if (e.key === KEY){ imp = load(); render(); } });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();

  window.mvSwitchUser = { switchTo, switchBack, active: () => !!imp, render };
})();
