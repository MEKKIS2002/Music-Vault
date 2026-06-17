// === admin-panel.js ===
// Admin-panel for Music Vault — KUN synlig for admin-brukere.
// Håndterer: brukeroversikt, brukerdetaljer (rediger konto + passord),
// pakkebytter, invitasjonskoder.
//
// SIKKERHET: Brukerinfo og redigering er låst bak en admin-sjekk (role==='admin').
// Endring av e-post/passord går via Edge Function `admin-update-user`, som
// verifiserer admin-rollen på nytt server-side og bruker service_role der.

(function(){
  'use strict';

  const SB_URL = 'https://ylvqkfdvijqnecuqznyr.supabase.co';
  const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlsdnFrZmR2aWpxbmVjdXF6bnlyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgzMzA4MzIsImV4cCI6MjA5MzkwNjgzMn0.bYPTaxQK8n7I7w5Ri2DVYW5_LbFHg2IXkuhHsLTDDqc';
  const FN_URL = `${SB_URL}/functions/v1/admin-update-user`;

  async function getToken(){
    const {data:{session}} = await window.supabaseClient.auth.getSession();
    return session?.access_token || SB_KEY;
  }
  function sbH(token){ return {'apikey':SB_KEY,'Authorization':'Bearer '+(token||SB_KEY),'Content-Type':'application/json'}; }

  // ── Hjelpere ────────────────────────────────────────────────────────────
  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function gv(id){ const el=document.getElementById(id); return el?el.value:undefined; }
  function curFilter(){ return (document.getElementById('adminSearch')?.value||'').toLowerCase(); }
  function isEmail(v){ return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }
  function toast(msg){ if(typeof window.showToast==='function') window.showToast(msg); }
  function setFb(el, msg, kind){ // kind: 'load' | 'ok' | 'error' | ''
    if(!el) return;
    el.textContent = msg||'';
    el.dataset.kind = kind||'';
  }

  async function adminCallFn(payload){
    const token = await getToken();
    let res, data = {};
    try{
      res = await fetch(FN_URL, {
        method:'POST',
        headers:{ 'apikey':SB_KEY, 'Authorization':'Bearer '+token, 'Content-Type':'application/json' },
        body: JSON.stringify(payload)
      });
      try{ data = await res.json(); }catch{}
    }catch(e){
      return { ok:false, error:'Nettverksfeil — fikk ikke kontakt med serveren.' };
    }
    return { ok: !!(res.ok && data.ok), status: res.status, error: data.error };
  }

  // ── Installer admin-tab ─────────────────────────────────────────────────
  function installAdminTab(){
    const role = sessionStorage.getItem('mv_package');
    if(role !== 'admin') return;

    const tabBtn = document.querySelector('.tab-btn[data-tab="adminpanel"]');
    if(tabBtn) tabBtn.style.display = '';

    const section = document.getElementById('adminPanelTab');
    if(section && !section.querySelector('.adm-wrap')){
      section.innerHTML = buildAdminShell();
    }

    installAdminStyles();
    console.log('[Admin Panel] Installert');
  }

  function buildAdminShell(){
    return `<div class="app"><div class="adm-wrap">
      <div class="adm-topbar">
        <div class="adm-topbar-l">
          <span class="adm-topbar-icon">🛠</span>
          <div>
            <div class="adm-title">Admin-panel</div>
            <div class="adm-subtitle">Brukere, tilganger og invitasjoner</div>
          </div>
        </div>
        <button class="adm-refresh-btn" onclick="window.adminRefresh()">↻ Oppdater</button>
      </div>

      <div class="adm-stats" id="adminStats">
        <div class="adm-stat"><div class="adm-stat-n" id="statUsers">—</div><div class="adm-stat-l">Brukere</div></div>
        <div class="adm-stat"><div class="adm-stat-n" id="statArtist">—</div><div class="adm-stat-l">Artist</div></div>
        <div class="adm-stat"><div class="adm-stat-n" id="statPro">—</div><div class="adm-stat-l">PRO</div></div>
        <div class="adm-stat"><div class="adm-stat-n" id="statLabel">—</div><div class="adm-stat-l">Label</div></div>
        <div class="adm-stat"><div class="adm-stat-n" id="statCodes">—</div><div class="adm-stat-l">Koder igjen</div></div>
      </div>

      <div class="adm-body">
        <!-- Kolonne 1: brukerliste -->
        <div class="adm-col">
          <div class="adm-section-hd">
            Brukere
            <input id="adminSearch" class="adm-search" placeholder="Søk…" oninput="window.adminSearch(this.value)">
          </div>
          <div id="adminUserList" class="adm-list"></div>
        </div>

        <!-- Kolonne 2: brukerdetalj (redesignet) -->
        <div class="adm-col adm-col-detail">
          <div class="adm-section-hd">Valgt bruker</div>
          <div id="adminUserDetail">
            <div class="adm-detail-empty">
              <div class="adm-empty-ico">👤</div>
              <div class="adm-empty-t">Ingen bruker valgt</div>
              <div class="adm-empty-s">Velg en bruker fra listen for å se og redigere kontoen.</div>
            </div>
          </div>
        </div>

        <!-- Kolonne 3: invitasjonskoder -->
        <div class="adm-col">
          <div class="adm-section-hd">
            Invitasjonskoder
            <button class="adm-mini-btn" onclick="window.adminGenCode()">+ Ny kode</button>
          </div>
          <div id="adminCodeList" class="adm-list"></div>
        </div>
      </div>
    </div></div>`;
  }

  function installAdminStyles(){
    if(document.getElementById('adm-css')) return;
    const s = document.createElement('style');
    s.id = 'adm-css';
    s.textContent = `
.adm-wrap { font-family:system-ui,-apple-system,sans-serif; --adm-accent:#f4a443; --adm-line:rgba(255,255,255,.08); --adm-card:rgba(255,255,255,.035); }
/* Topbar */
.adm-topbar { display:flex;align-items:center;justify-content:space-between;padding:0 0 16px;border-bottom:1px solid var(--adm-line);margin-bottom:20px }
.adm-topbar-l { display:flex;align-items:center;gap:13px }
.adm-topbar-icon { font-size:22px;width:42px;height:42px;display:grid;place-items:center;background:rgba(244,164,67,.12);border:1px solid rgba(244,164,67,.2);border-radius:12px }
.adm-title { font-size:18px;font-weight:900;color:#f4ede4;letter-spacing:-.03em;line-height:1.1 }
.adm-subtitle { font-size:12px;color:rgba(255,255,255,.4);margin-top:2px }
.adm-refresh-btn { font-size:12px;font-weight:700;padding:8px 14px;background:rgba(255,255,255,.05);border:1px solid var(--adm-line);color:#f4ede4;border-radius:9px;cursor:pointer;font-family:inherit;transition:background .14s }
.adm-refresh-btn:hover { background:rgba(255,255,255,.1) }
/* Stats */
.adm-stats { display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:22px }
.adm-stat { background:var(--adm-card);border:1px solid var(--adm-line);padding:14px;text-align:center;border-radius:12px }
.adm-stat-n { font-size:25px;font-weight:900;color:#f4ede4;letter-spacing:-.04em;line-height:1 }
.adm-stat-l { font-size:10px;color:rgba(255,255,255,.4);margin-top:5px;text-transform:uppercase;letter-spacing:.1em;font-weight:700 }
/* Body grid */
.adm-body { display:grid;grid-template-columns:1fr 1.25fr 1fr;gap:18px;align-items:start }
.adm-col { min-width:0 }
.adm-col:not(.adm-col-detail) { max-height:600px;overflow-y:auto }
.adm-section-hd { font-size:10px;font-weight:800;letter-spacing:.15em;text-transform:uppercase;color:rgba(255,255,255,.4);padding-bottom:9px;border-bottom:1px solid var(--adm-line);margin-bottom:10px;display:flex;align-items:center;gap:8px }
.adm-search { margin-left:auto;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);color:#f4ede4;padding:6px 11px;font-size:12px;font-family:inherit;outline:none;width:130px;border-radius:8px }
.adm-search:focus { border-color:rgba(244,164,67,.5) }
.adm-mini-btn { font-size:11px;font-weight:700;padding:5px 11px;margin-left:auto;background:rgba(244,164,67,.14);border:1px solid rgba(244,164,67,.25);color:var(--adm-accent);border-radius:8px;cursor:pointer;font-family:inherit }
.adm-mini-btn:hover { background:rgba(244,164,67,.22) }
.adm-loading { padding:16px;font-size:12px;color:rgba(255,255,255,.3);text-align:center }
/* Brukerliste */
#adminUserList { display:flex;flex-direction:column;gap:2px }
.adm-user-row { display:flex;align-items:center;gap:11px;padding:10px;cursor:pointer;transition:background .12s;border-radius:10px;border:1px solid transparent }
.adm-user-row:hover { background:rgba(255,255,255,.045) }
.adm-user-row.active { background:rgba(244,164,67,.1);border-color:rgba(244,164,67,.28) }
.adm-avatar { width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;flex-shrink:0 }
.adm-username { font-size:13px;font-weight:700;color:#f4ede4;white-space:nowrap;overflow:hidden;text-overflow:ellipsis }
.adm-useremail { font-size:11px;color:rgba(255,255,255,.38);white-space:nowrap;overflow:hidden;text-overflow:ellipsis }
.adm-pkg-badge { font-size:10px;font-weight:800;padding:3px 9px;border-radius:999px;flex-shrink:0;white-space:nowrap;text-transform:capitalize;letter-spacing:.02em }
.pkg-admin  { background:rgba(244,164,67,.18);color:#f4a443 }
.pkg-artist { background:rgba(96,165,250,.15);color:#60a5fa }
.pkg-pro    { background:rgba(168,85,247,.15);color:#a855f7 }
.pkg-label  { background:rgba(52,211,153,.15);color:#34d399 }
.pkg-viewer,.pkg-user { background:rgba(255,255,255,.08);color:rgba(255,255,255,.45) }
/* Tom-tilstand */
.adm-detail-empty { display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:48px 20px;background:var(--adm-card);border:1px dashed var(--adm-line);border-radius:14px;color:rgba(255,255,255,.4) }
.adm-empty-ico { font-size:34px;margin-bottom:12px;opacity:.6 }
.adm-empty-t { font-size:14px;font-weight:700;color:rgba(255,255,255,.6) }
.adm-empty-s { font-size:12px;margin-top:5px;max-width:220px;line-height:1.5 }
/* ── Detalj-kort (redesignet) ─────────────────────────────────── */
.adm-detail-card { background:var(--adm-card);border:1px solid var(--adm-line);border-radius:14px;overflow:hidden }
.adm-dc-head { display:flex;align-items:center;gap:13px;padding:16px;background:linear-gradient(180deg,rgba(255,255,255,.04),transparent);border-bottom:1px solid var(--adm-line) }
.adm-dc-avatar { width:50px;height:50px;border-radius:14px;display:grid;place-items:center;font-size:19px;font-weight:900;flex-shrink:0 }
.adm-dc-id { min-width:0;flex:1 }
.adm-dc-name { font-size:17px;font-weight:800;color:#f4ede4;letter-spacing:-.02em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis }
.adm-dc-email { font-size:12px;color:rgba(255,255,255,.45);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:1px }
/* Meta-stripe */
.adm-dc-meta { display:grid;grid-template-columns:1fr 1fr 1fr;gap:1px;background:var(--adm-line);border-bottom:1px solid var(--adm-line) }
.adm-meta-cell { background:#171310;padding:10px 12px;text-align:left }
.adm-meta-l { font-size:9px;text-transform:uppercase;letter-spacing:.1em;color:rgba(255,255,255,.38);font-weight:700 }
.adm-meta-v { font-size:12.5px;color:#f4ede4;font-weight:700;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis }
.adm-meta-v.mono { font-family:ui-monospace,monospace;font-size:11px;color:rgba(255,255,255,.55) }
/* Seksjoner */
.adm-dc-section { padding:14px 16px;border-bottom:1px solid var(--adm-line) }
.adm-dc-sect-title { font-size:10px;font-weight:800;letter-spacing:.13em;text-transform:uppercase;color:rgba(255,255,255,.42);margin-bottom:11px }
.adm-field { display:flex;align-items:center;gap:10px;margin-bottom:9px }
.adm-field > span { font-size:11.5px;color:rgba(255,255,255,.5);width:84px;flex-shrink:0;font-weight:600 }
.adm-field input, .adm-field select { flex:1;min-width:0;background:#100d0a;border:1px solid rgba(255,255,255,.12);color:#f4ede4;padding:8px 10px;font-size:12.5px;font-family:inherit;outline:none;border-radius:8px;transition:border-color .14s }
.adm-field input:focus, .adm-field select:focus { border-color:rgba(244,164,67,.55) }
.adm-field input::placeholder { color:rgba(255,255,255,.25) }
.adm-save-btn { width:100%;background:linear-gradient(135deg,#f4a443,#cb6e1a);border:none;color:#1a1208;font-size:12px;font-weight:800;padding:10px;cursor:pointer;font-family:inherit;letter-spacing:.04em;text-transform:uppercase;border-radius:9px;margin-top:4px;transition:filter .14s }
.adm-save-btn:hover { filter:brightness(1.08) }
.adm-save-btn.alt { background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.16);color:#f4ede4 }
.adm-save-btn.alt:hover { background:rgba(255,255,255,.12);filter:none }
.adm-feedback { font-size:11.5px;text-align:center;margin-top:9px;min-height:15px;font-weight:600;transition:color .14s }
.adm-feedback[data-kind="load"]  { color:rgba(255,255,255,.5) }
.adm-feedback[data-kind="ok"]    { color:#34d399 }
.adm-feedback[data-kind="error"] { color:#fb7185 }
.adm-hint { font-size:10.5px;color:rgba(255,255,255,.32);margin-top:8px;line-height:1.45 }
/* Faresone */
.adm-dc-danger { padding:13px 16px }
.adm-danger-btn { width:100%;background:none;border:1px solid rgba(251,113,133,.3);color:rgba(251,113,133,.75);font-size:11.5px;font-weight:700;padding:9px;cursor:pointer;font-family:inherit;border-radius:9px;transition:all .14s }
.adm-danger-btn:hover { background:rgba(251,113,133,.1);color:#fb7185;border-color:rgba(251,113,133,.5) }
/* Koder */
#adminCodeList { display:flex;flex-direction:column;gap:1px }
.adm-code-row { display:flex;align-items:center;gap:9px;padding:9px 6px;border-bottom:1px solid rgba(255,255,255,.05) }
.adm-code { font-family:ui-monospace,monospace;color:var(--adm-accent);font-size:11.5px;flex:1;letter-spacing:.04em }
.adm-code-used { color:rgba(255,255,255,.25)!important;text-decoration:line-through }
.adm-code-status { font-size:10px;color:rgba(255,255,255,.32);flex-shrink:0 }
.adm-del-btn { background:none;border:none;color:rgba(251,113,133,.4);cursor:pointer;font-size:13px;padding:2px 5px;line-height:1 }
.adm-del-btn:hover { color:#fb7185 }
/* Responsiv */
@media (max-width:980px){
  .adm-body { grid-template-columns:1fr;gap:24px }
  .adm-col:not(.adm-col-detail) { max-height:340px }
  .adm-stats { grid-template-columns:repeat(2,1fr) }
}
    `;
    document.head.appendChild(s);
  }

  // ── Hent data ───────────────────────────────────────────────────────────
  async function loadUsers(){
    const token = await getToken();
    const res = await fetch(
      `${SB_URL}/rest/v1/profiles?select=id,username,email,role,package,created_at&order=created_at.asc`,
      {headers: sbH(token)}
    );
    return res.ok ? await res.json() : [];
  }

  async function loadCodes(){
    const token = await getToken();
    const res = await fetch(
      `${SB_URL}/rest/v1/invite_codes?select=*&order=created_at.desc`,
      {headers: sbH(token)}
    );
    return res.ok ? await res.json() : [];
  }

  const PKG_COLORS = {
    admin:'pkg-admin', artist:'pkg-artist', pro:'pkg-pro',
    label:'pkg-label', viewer:'pkg-viewer', user:'pkg-user'
  };
  const AVATAR_COLORS = ['#f4a443','#60a5fa','#34d399','#a855f7','#fb7185','#f97316'];
  function avatarCol(i){ return AVATAR_COLORS[((i%AVATAR_COLORS.length)+AVATAR_COLORS.length)%AVATAR_COLORS.length]; }

  window._adminUsers = [];

  async function renderUsers(filter=''){
    const list = document.getElementById('adminUserList');
    if(!list) return;
    const users = window._adminUsers.filter(u =>
      !filter || (u.username||'').toLowerCase().includes(filter) || (u.email||'').toLowerCase().includes(filter)
    );

    if(!users.length){ list.innerHTML = '<div class="adm-loading">Ingen brukere funnet</div>'; return; }

    list.innerHTML = users.map((u) => {
      const realIdx = window._adminUsers.indexOf(u);
      const initials = (u.username||u.email||'?').slice(0,2).toUpperCase();
      const col = avatarCol(realIdx);
      const pkgKey = u.package || u.role || 'user';
      return `<div class="adm-user-row" data-id="${esc(u.id)}" onclick="window.adminSelectUser('${esc(u.id)}')">
        <div class="adm-avatar" style="background:${col}22;color:${col}">${esc(initials)}</div>
        <div style="flex:1;min-width:0">
          <div class="adm-username">${esc(u.username || '—')}</div>
          <div class="adm-useremail">${esc(u.email || '')}</div>
        </div>
        <span class="adm-pkg-badge ${PKG_COLORS[pkgKey]||'pkg-user'}">${esc(pkgKey)}</span>
      </div>`;
    }).join('');
  }

  async function renderStats(users, codes){
    const byPkg = (pkg) => users.filter(u => (u.package||u.role) === pkg).length;
    const set = (id,v)=>{ const el=document.getElementById(id); if(el) el.textContent=v; };
    set('statUsers',  users.length);
    set('statArtist', byPkg('artist'));
    set('statPro',    byPkg('pro'));
    set('statLabel',  byPkg('label'));
    set('statCodes',  codes.filter(c=>!c.used_by).length);
  }

  async function renderCodes(codes){
    const list = document.getElementById('adminCodeList');
    if(!list) return;
    if(!codes.length){ list.innerHTML = '<div class="adm-loading">Ingen koder</div>'; return; }
    list.innerHTML = codes.map(c => `
      <div class="adm-code-row">
        <span class="adm-code ${c.used_by?'adm-code-used':''}">${esc(c.code)}</span>
        <span class="adm-code-status">${c.used_by ? '✓ Brukt' : '○ Ledig'}</span>
        ${!c.used_by ? `<button class="adm-del-btn" onclick="window.adminDeleteCode('${esc(c.code)}')" title="Slett kode">✕</button>` : ''}
      </div>`).join('');
  }

  // ── Brukerdetalj (redesignet) ───────────────────────────────────────────
  window.adminSelectUser = function(userId){
    document.querySelectorAll('.adm-user-row').forEach(r =>
      r.classList.toggle('active', r.dataset.id === userId)
    );
    const user = window._adminUsers.find(u => u.id === userId);
    if(!user) return;

    const detail = document.getElementById('adminUserDetail');
    const initials = (user.username||user.email||'?').slice(0,2).toUpperCase();
    const idx = window._adminUsers.indexOf(user);
    const col = avatarCol(idx);
    const pkgKey = user.package || user.role || 'user';
    const joined = user.created_at
      ? new Date(user.created_at).toLocaleDateString('no-NO',{day:'2-digit',month:'short',year:'numeric'})
      : '—';
    const shortId = (user.id||'').slice(0,8) + '…';
    const pkgOptions = ['artist','pro','label','admin'].map(p =>
      `<option value="${p}" ${pkgKey===p?'selected':''}>${p}</option>`
    ).join('');

    detail.innerHTML = `
      <div class="adm-detail-card">
        <div class="adm-dc-head">
          <div class="adm-dc-avatar" style="background:${col}22;color:${col}">${esc(initials)}</div>
          <div class="adm-dc-id">
            <div class="adm-dc-name" id="admDcName">${esc(user.username || '—')}</div>
            <div class="adm-dc-email" id="admDcEmail">${esc(user.email || 'ingen e-post')}</div>
          </div>
          <span class="adm-pkg-badge ${PKG_COLORS[pkgKey]||'pkg-user'}" id="admDcBadge">${esc(pkgKey)}</span>
        </div>

        <div class="adm-dc-meta">
          <div class="adm-meta-cell">
            <div class="adm-meta-l">Registrert</div>
            <div class="adm-meta-v">${esc(joined)}</div>
          </div>
          <div class="adm-meta-cell">
            <div class="adm-meta-l">Rolle</div>
            <div class="adm-meta-v">${esc(user.role || '—')}</div>
          </div>
          <div class="adm-meta-cell">
            <div class="adm-meta-l">Bruker-ID</div>
            <div class="adm-meta-v mono" title="${esc(user.id)}">${esc(shortId)}</div>
          </div>
        </div>

        <div class="adm-dc-section">
          <div class="adm-dc-sect-title">Kontoinfo</div>
          <label class="adm-field"><span>Brukernavn</span>
            <input id="admField_username" value="${esc(user.username||'')}" placeholder="brukernavn" autocomplete="off"></label>
          <label class="adm-field"><span>E-post</span>
            <input id="admField_email" type="email" value="${esc(user.email||'')}" placeholder="navn@epost.no" autocomplete="off"></label>
          <label class="adm-field"><span>Pakke</span>
            <select id="admField_pkg">${pkgOptions}</select></label>
          <button class="adm-save-btn" onclick="window.adminSaveAccount('${esc(user.id)}')">Lagre kontoinfo</button>
          <div class="adm-feedback" id="admAccountStatus"></div>
        </div>

        <div class="adm-dc-section">
          <div class="adm-dc-sect-title">Tilbakestill passord</div>
          <label class="adm-field"><span>Nytt passord</span>
            <input id="admField_pw1" type="password" placeholder="minst 6 tegn" autocomplete="new-password"></label>
          <label class="adm-field"><span>Bekreft</span>
            <input id="admField_pw2" type="password" placeholder="gjenta passord" autocomplete="new-password"></label>
          <button class="adm-save-btn alt" onclick="window.adminSavePassword('${esc(user.id)}')">Lagre nytt passord</button>
          <div class="adm-feedback" id="admPwStatus"></div>
          <div class="adm-hint">Brukeren logges ut av aktive økter og må bruke det nye passordet ved neste innlogging.</div>
        </div>

        <div class="adm-dc-danger">
          <button class="adm-danger-btn"
            onclick="window.adminDeleteUser('${esc(user.id)}','${esc((user.username||user.email||'').replace(/'/g,''))}')">
            🗑 Slett bruker
          </button>
        </div>
      </div>`;
  };

  function refreshDetailHeader(user){
    const idx = window._adminUsers.indexOf(user);
    const pkgKey = user.package || user.role || 'user';
    const nameEl = document.getElementById('admDcName');
    const emailEl = document.getElementById('admDcEmail');
    const badgeEl = document.getElementById('admDcBadge');
    if(nameEl)  nameEl.textContent  = user.username || '—';
    if(emailEl) emailEl.textContent = user.email || 'ingen e-post';
    if(badgeEl){
      badgeEl.textContent = pkgKey;
      badgeEl.className = 'adm-pkg-badge ' + (PKG_COLORS[pkgKey]||'pkg-user');
    }
  }

  // Lagre kontoinfo: pakke → profiles direkte; e-post/brukernavn → Edge Function
  window.adminSaveAccount = async function(userId){
    const user = window._adminUsers.find(u=>u.id===userId);
    if(!user) return;
    const fb = document.getElementById('admAccountStatus');

    const username = (gv('admField_username')||'').trim();
    const email    = (gv('admField_email')||'').trim();
    const pkg      = gv('admField_pkg');

    if(!username){ setFb(fb,'Brukernavn kan ikke være tomt','error'); return; }
    if(email && !isEmail(email)){ setFb(fb,'Ugyldig e-postadresse','error'); return; }

    setFb(fb,'Lagrer…','load');
    try{
      // 1) Pakke → profiles-tabellen direkte
      if(pkg && pkg !== (user.package||user.role)){
        const token = await getToken();
        const r = await fetch(`${SB_URL}/rest/v1/profiles?id=eq.${userId}`, {
          method:'PATCH',
          headers:{...sbH(token),'Prefer':'return=minimal'},
          body: JSON.stringify({package: pkg})
        });
        if(!(r.ok || r.status===204)) throw new Error('Kunne ikke endre pakke (sjekk RLS).');
      }

      // 2) E-post/brukernavn → Edge Function (auth + profiles synk)
      const emailChanged = email && email !== (user.email||'');
      const nameChanged  = username !== (user.username||'');
      if(emailChanged || nameChanged){
        const payload = { target_id: userId };
        if(emailChanged) payload.email = email;
        if(nameChanged)  payload.username = username;
        const res = await adminCallFn(payload);
        if(!res.ok) throw new Error(res.error || ('Serverfeil ('+res.status+')'));
      }

      // 3) Oppdater lokal state + UI
      user.username = username;
      if(email) user.email = email;
      if(pkg)   user.package = pkg;
      renderUsers(curFilter());
      renderStats(window._adminUsers, window._adminCodes||[]);
      refreshDetailHeader(user);
      document.querySelector(`.adm-user-row[data-id="${userId}"]`)?.classList.add('active');

      setFb(fb,'✓ Kontoinfo lagret','ok');
      toast('✓ Kontoinfo oppdatert');
      setTimeout(()=>{ if(fb && fb.dataset.kind==='ok') setFb(fb,'',''); }, 2600);
    }catch(e){
      setFb(fb, e.message || 'Noe gikk galt ved lagring', 'error');
      console.error('adminSaveAccount:', e);
    }
  };

  // Lagre nytt passord → Edge Function
  window.adminSavePassword = async function(userId){
    const fb  = document.getElementById('admPwStatus');
    const pw1 = gv('admField_pw1') || '';
    const pw2 = gv('admField_pw2') || '';

    if(pw1.length < 6){ setFb(fb,'Passord må ha minst 6 tegn','error'); return; }
    if(pw1 !== pw2){ setFb(fb,'Passordene er ikke like','error'); return; }

    setFb(fb,'Lagrer nytt passord…','load');
    const res = await adminCallFn({ target_id: userId, password: pw1 });
    if(res.ok){
      const a=document.getElementById('admField_pw1'); const b=document.getElementById('admField_pw2');
      if(a) a.value=''; if(b) b.value='';
      setFb(fb,'✓ Nytt passord lagret','ok');
      toast('✓ Passord oppdatert');
      setTimeout(()=>{ if(fb && fb.dataset.kind==='ok') setFb(fb,'',''); }, 2600);
    } else {
      setFb(fb, res.error || ('Serverfeil ('+res.status+')'), 'error');
      console.error('adminSavePassword:', res);
    }
  };

  window.adminDeleteUser = async function(userId, name){
    if(!confirm(`Slette brukeren "${name}"?\n\nDette fjerner profilen og kan ikke angres.`)) return;
    const token = await getToken();
    await fetch(`${SB_URL}/rest/v1/profiles?id=eq.${userId}`,
      {method:'DELETE', headers:{...sbH(token),'Prefer':'return=minimal'}}
    );
    window._adminUsers = window._adminUsers.filter(u=>u.id!==userId);
    renderUsers(curFilter());
    renderStats(window._adminUsers, window._adminCodes||[]);
    document.getElementById('adminUserDetail').innerHTML = `
      <div class="adm-detail-empty">
        <div class="adm-empty-ico">✓</div>
        <div class="adm-empty-t">Bruker slettet</div>
        <div class="adm-empty-s">Velg en annen bruker fra listen.</div>
      </div>`;
    toast(`✓ ${name} slettet`);
  };

  // ── Invitasjonskoder ────────────────────────────────────────────────────
  window.adminGenCode = async function(){
    const token = await getToken();
    const uid   = window._mvCurrentUserId;
    const code  = 'LABEL-' + Math.random().toString(36).slice(2,10).toUpperCase();
    const res = await fetch(`${SB_URL}/rest/v1/invite_codes`, {
      method:'POST',
      headers:{...sbH(token),'Prefer':'return=minimal'},
      body: JSON.stringify({code, package:'label', created_by:uid})
    });
    if(res.ok){
      window._adminCodes = window._adminCodes || [];
      window._adminCodes.unshift({code, package:'label', used_by:null, created_at:new Date().toISOString()});
      renderCodes(window._adminCodes);
      renderStats(window._adminUsers, window._adminCodes);
      toast('✓ Ny kode: '+code);
    }
  };

  window.adminDeleteCode = async function(code){
    if(!confirm(`Slette koden ${code}?`)) return;
    const token = await getToken();
    await fetch(`${SB_URL}/rest/v1/invite_codes?code=eq.${code}`,
      {method:'DELETE', headers:{...sbH(token),'Prefer':'return=minimal'}}
    );
    window._adminCodes = (window._adminCodes||[]).filter(c=>c.code!==code);
    renderCodes(window._adminCodes);
    renderStats(window._adminUsers, window._adminCodes);
  };

  window.adminSearch = function(val){
    renderUsers((val||'').toLowerCase());
  };

  // ── Oppdater alt ────────────────────────────────────────────────────────
  window.adminRefresh = async function(){
    const list = document.getElementById('adminUserList');
    if(list) list.innerHTML = '<div class="adm-loading">Laster…</div>';
    const [users, codes] = await Promise.all([loadUsers(), loadCodes()]);
    window._adminUsers = users;
    window._adminCodes = codes;
    renderUsers();
    renderCodes(codes);
    renderStats(users, codes);
  };

  // ── Installer og kjør ved tab-klikk ────────────────────────────────────
  document.addEventListener('click', e => {
    if(e.target.closest('.tab-btn[data-tab="adminpanel"]')){
      setTimeout(window.adminRefresh, 80);
    }
  });

  // ── Installer ved oppstart ──────────────────────────────────────────────
  function tryInstall(){
    const pkg = sessionStorage.getItem('mv_package');
    if(pkg === 'admin') installAdminTab();
  }

  if(document.readyState !== 'loading') setTimeout(tryInstall, 700);
  else document.addEventListener('DOMContentLoaded', ()=>setTimeout(tryInstall, 700));

  window.installAdminPanel = installAdminTab;

})();
