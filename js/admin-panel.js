// === admin-panel.js ===
// Admin-panel for Music Vault — kun synlig for admin-brukere
// Håndterer: brukeroversikt, pakkebytter, invitasjonskoder

(function(){
  'use strict';

  const SB_URL = 'https://ylvqkfdvijqnecuqznyr.supabase.co';
  const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlsdnFrZmR2aWpxbmVjdXF6bnlyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgzMzA4MzIsImV4cCI6MjA5MzkwNjgzMn0.bYPTaxQK8n7I7w5Ri2DVYW5_LbFHg2IXkuhHsLTDDqc';

  async function getToken(){
    const {data:{session}} = await window.supabaseClient.auth.getSession();
    return session?.access_token || SB_KEY;
  }
  function sbH(token){ return {'apikey':SB_KEY,'Authorization':'Bearer '+(token||SB_KEY),'Content-Type':'application/json'}; }

  // ── Installer admin-tab ─────────────────────────────────────────────────
  function installAdminTab(){
    const role = sessionStorage.getItem('mv_package');
    if(role !== 'admin') return;

    // Vis tab-knappen
    const tabBtn = document.querySelector('.tab-btn[data-tab="adminpanel"]');
    if(tabBtn) tabBtn.style.display = '';

    // Fyll seksjonen med innhold
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
        <div style="display:flex;align-items:center;gap:10px">
          <span style="font-size:18px">🛠</span>
          <span class="adm-title">Admin-panel</span>
        </div>
        <button class="ghost-btn adm-refresh" onclick="window.adminRefresh()">↻ Oppdater</button>
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
            <input id="adminSearch" placeholder="Søk..." oninput="window.adminSearch(this.value)"
              style="margin-left:auto;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);color:#f4ede4;padding:5px 10px;font-size:12px;font-family:system-ui;outline:none;width:130px;border-radius:0">
          </div>
          <div id="adminUserList" class="adm-list"></div>
        </div>

        <!-- Kolonne 2: brukerdetalj -->
        <div class="adm-col">
          <div class="adm-section-hd">Detaljer</div>
          <div id="adminUserDetail" class="adm-detail-empty">
            <div style="font-size:28px;margin-bottom:8px">👆</div>
            <div>Velg en bruker</div>
          </div>
        </div>

        <!-- Kolonne 3: invitasjonskoder -->
        <div class="adm-col">
          <div class="adm-section-hd">
            Invitasjonskoder
            <button class="ghost-btn" style="font-size:11px;padding:4px 10px;margin-left:auto" onclick="window.adminGenCode()">+ Ny kode</button>
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
.adm-wrap { font-family:system-ui; }
.adm-topbar { display:flex;align-items:center;justify-content:space-between;padding:0 0 16px;border-bottom:1px solid rgba(255,255,255,.08);margin-bottom:20px }
.adm-title { font-size:18px;font-weight:900;color:#f4ede4;letter-spacing:-.03em }
.adm-refresh { font-size:12px!important;padding:6px 12px!important }
.adm-stats { display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-bottom:24px }
.adm-stat { background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.06);padding:14px;text-align:center }
.adm-stat-n { font-size:24px;font-weight:900;color:#f4ede4;letter-spacing:-.04em;line-height:1 }
.adm-stat-l { font-size:10px;color:rgba(255,255,255,.4);margin-top:4px;text-transform:uppercase;letter-spacing:.1em }
.adm-body { display:grid;grid-template-columns:1fr 1fr 1fr;gap:20px;align-items:start }
.adm-col { min-width:0;max-height:560px;overflow-y:auto }
.adm-section-hd { font-size:10px;font-weight:800;letter-spacing:.15em;text-transform:uppercase;color:rgba(255,255,255,.35);padding-bottom:8px;border-bottom:1px solid rgba(255,255,255,.08);margin-bottom:8px;display:flex;align-items:center }
#adminUserList { max-height:300px;overflow-y:auto }
#adminCodeList { max-height:400px;overflow-y:auto }
.adm-loading { padding:16px;font-size:12px;color:rgba(255,255,255,.3);text-align:center }
.adm-user-row { display:flex;align-items:center;gap:10px;padding:10px;cursor:pointer;transition:background .12s;border-bottom:1px solid rgba(255,255,255,.04) }
.adm-user-row:hover { background:rgba(255,255,255,.04) }
.adm-user-row.active { background:rgba(244,164,67,.08);border-left:3px solid #f4a443 }
.adm-avatar { width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;flex-shrink:0 }
.adm-username { font-size:13px;font-weight:700;color:#f4ede4 }
.adm-useremail { font-size:11px;color:rgba(255,255,255,.35);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:180px }
.adm-pkg-badge { font-size:10px;font-weight:800;padding:2px 8px;border-radius:999px;margin-left:auto;flex-shrink:0;white-space:nowrap }
.pkg-admin    { background:rgba(244,164,67,.18);color:#f4a443 }
.pkg-artist   { background:rgba(96,165,250,.15);color:#60a5fa }
.pkg-pro      { background:rgba(168,85,247,.15);color:#a855f7 }
.pkg-label    { background:rgba(52,211,153,.15);color:#34d399 }
.pkg-viewer   { background:rgba(255,255,255,.08);color:rgba(255,255,255,.4) }
.pkg-user     { background:rgba(255,255,255,.08);color:rgba(255,255,255,.4) }
.adm-detail-empty { display:flex;flex-direction:column;align-items:center;justify-content:center;height:120px;color:rgba(255,255,255,.3);font-size:13px;text-align:center;background:rgba(255,255,255,.02);border:1px solid rgba(255,255,255,.06) }
.adm-detail-card { background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);padding:16px;width:100%;box-sizing:border-box }
.adm-detail-name { font-size:16px;font-weight:800;color:#f4ede4;margin-bottom:2px }
.adm-detail-email { font-size:12px;color:rgba(255,255,255,.4);margin-bottom:14px }
.adm-detail-row { display:flex;align-items:center;gap:10px;margin-bottom:10px }
.adm-label { font-size:11px;color:rgba(255,255,255,.4);width:80px;flex-shrink:0 }
.adm-select { background:#1a1612;border:1px solid rgba(255,255,255,.12);color:#f4ede4;padding:6px 8px;font-size:12px;font-family:system-ui;outline:none;flex:1 }
.adm-input { background:#1a1612;border:1px solid rgba(255,255,255,.12);color:#f4ede4;padding:6px 8px;font-size:12px;font-family:system-ui;outline:none;flex:1 }
.adm-save-btn { width:100%;background:linear-gradient(135deg,#f4a443,#cb6e1a);border:none;color:#000;font-size:12px;font-weight:800;padding:10px;cursor:pointer;font-family:system-ui;letter-spacing:.06em;text-transform:uppercase;margin-top:10px }
.adm-code-row { display:flex;align-items:center;gap:8px;padding:8px 4px;border-bottom:1px solid rgba(255,255,255,.05) }
.adm-code { font-family:monospace;color:#f4a443;font-size:11px;flex:1;letter-spacing:.04em }
.adm-code-used { color:rgba(255,255,255,.25)!important;text-decoration:line-through }
.adm-code-status { font-size:10px;color:rgba(255,255,255,.3);flex-shrink:0 }
.adm-del-btn { background:none;border:none;color:rgba(251,113,133,.35);cursor:pointer;font-size:12px;padding:2px 4px;line-height:1 }
.adm-del-btn:hover { color:#fb7185 }
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
  const AVATAR_COLORS = [
    '#f4a443','#60a5fa','#34d399','#a855f7','#fb7185','#f97316'
  ];

  window._adminUsers = [];

  async function renderUsers(filter=''){
    const list = document.getElementById('adminUserList');
    if(!list) return;
    const users = window._adminUsers.filter(u =>
      !filter || (u.username||'').toLowerCase().includes(filter) || (u.email||'').toLowerCase().includes(filter)
    );

    if(!users.length){ list.innerHTML = '<div class="adm-loading">Ingen brukere funnet</div>'; return; }

    list.innerHTML = users.map((u,i) => {
      const initials = (u.username||u.email||'?').slice(0,2).toUpperCase();
      const col = AVATAR_COLORS[i % AVATAR_COLORS.length];
      const pkgKey = u.package || u.role || 'user';
      return `<div class="adm-user-row" data-id="${u.id}" onclick="window.adminSelectUser('${u.id}')">
        <div class="adm-avatar" style="background:${col}22;color:${col}">${initials}</div>
        <div style="flex:1;min-width:0">
          <div class="adm-username">${u.username || '—'}</div>
          <div style="font-size:11px;color:rgba(255,255,255,.35);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${u.email || ''}</div>
        </div>
        <span class="adm-pkg-badge ${PKG_COLORS[pkgKey]||'pkg-user'}">${pkgKey}</span>
      </div>`;
    }).join('');
  }

  async function renderStats(users, codes){
    const byPkg = (pkg) => users.filter(u => (u.package||u.role) === pkg).length;
    document.getElementById('statUsers').textContent  = users.length;
    document.getElementById('statArtist').textContent = byPkg('artist');
    document.getElementById('statPro').textContent    = byPkg('pro');
    document.getElementById('statLabel').textContent  = byPkg('label');
    document.getElementById('statCodes').textContent  = codes.filter(c=>!c.used_by).length;
  }

  async function renderCodes(codes){
    const list = document.getElementById('adminCodeList');
    if(!list) return;
    if(!codes.length){ list.innerHTML = '<div class="adm-loading">Ingen koder</div>'; return; }
    list.innerHTML = codes.map(c => `
      <div class="adm-code-row">
        <span class="adm-code ${c.used_by?'adm-code-used':''}">${c.code}</span>
        <span class="adm-code-status">${c.used_by ? '✓ Brukt' : '○ Ledig'}</span>
        ${!c.used_by ? `<button class="adm-del-btn" onclick="window.adminDeleteCode('${c.code}')" title="Slett kode">✕</button>` : ''}
      </div>`).join('');
  }

  // ── Brukerdetalj ────────────────────────────────────────────────────────
  window.adminSelectUser = function(userId){
    document.querySelectorAll('.adm-user-row').forEach(r =>
      r.classList.toggle('active', r.dataset.id === userId)
    );
    const user = window._adminUsers.find(u => u.id === userId);
    if(!user) return;

    const detail = document.getElementById('adminUserDetail');
    const initials = (user.username||user.email||'?').slice(0,2).toUpperCase();
    const idx = window._adminUsers.indexOf(user);
    const col = AVATAR_COLORS[idx % AVATAR_COLORS.length];
    const pkgKey = user.package || user.role || 'user';
    const joined = user.created_at ? new Date(user.created_at).toLocaleDateString('no-NO') : '—';

    detail.innerHTML = `
      <div class="adm-detail-card">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px">
          <div class="adm-avatar" style="width:44px;height:44px;font-size:17px;background:${col}22;color:${col}">${initials}</div>
          <div style="min-width:0;flex:1">
            <div class="adm-detail-name">${user.username || '—'}</div>
            <div class="adm-detail-email">${user.email || ''}</div>
          </div>
        </div>
        <div class="adm-detail-row">
          <span class="adm-label">Registrert</span>
          <span style="font-size:12px;color:rgba(255,255,255,.5)">${joined}</span>
        </div>
        <div class="adm-detail-row">
          <span class="adm-label">Pakke</span>
          <select class="adm-select" id="adminPkgSelect">
            ${['artist','pro','label','admin'].map(p =>
              `<option value="${p}" ${pkgKey===p?'selected':''}>${p}</option>`
            ).join('')}
          </select>
        </div>
        <div class="adm-detail-row">
          <span class="adm-label">Brukernavn</span>
          <input id="adminUsernameInput" class="adm-input" value="${user.username||''}">
        </div>
        <button class="adm-save-btn" onclick="window.adminSaveUser('${user.id}')">Lagre endringer</button>
        <div id="adminSaveStatus" style="font-size:11px;text-align:center;margin-top:8px;min-height:14px;color:rgba(255,255,255,.4)"></div>
        <div style="margin-top:12px;padding-top:10px;border-top:1px solid rgba(255,255,255,.07)">
          <button onclick="window.adminDeleteUser('${user.id}','${user.username||user.email}')"
            style="background:none;border:1px solid rgba(251,113,133,.3);color:rgba(251,113,133,.6);font-size:11px;font-weight:700;padding:6px 12px;cursor:pointer;font-family:system-ui;width:100%">
            🗑 Slett bruker
          </button>
        </div>
      </div>`;
  };

  window.adminSaveUser = async function(userId){
    const pkg      = document.getElementById('adminPkgSelect')?.value;
    const username = document.getElementById('adminUsernameInput')?.value?.trim();
    const status   = document.getElementById('adminSaveStatus');
    if(!pkg || !username){ if(status) status.textContent='Fyll inn alle felt'; return; }

    if(status){ status.style.color='rgba(255,255,255,.4)'; status.textContent='Lagrer...'; }

    const token = await getToken();
    const res = await fetch(`${SB_URL}/rest/v1/profiles?id=eq.${userId}`, {
      method: 'PATCH',
      headers: {...sbH(token), 'Prefer':'return=minimal'},
      body: JSON.stringify({package: pkg, username})
    });

    if(res.ok || res.status === 204){
      if(status){ status.style.color='#34d399'; status.textContent='✓ Lagret'; }
      const u = window._adminUsers.find(u=>u.id===userId);
      if(u){ u.package=pkg; u.username=username; }
      renderUsers(document.getElementById('adminSearch')?.value||'');
      renderStats(window._adminUsers, window._adminCodes||[]);
      setTimeout(()=>{ if(status) status.textContent=''; }, 2000);
    } else {
      const txt = await res.text();
      if(status){ status.style.color='#fb7185'; status.textContent=`Feil: ${res.status} — sjekk Supabase RLS`; }
      console.error('Save user error:', res.status, txt);
    }
  };

  window.adminDeleteUser = async function(userId, name){
    if(!confirm(`Slette brukeren "${name}"?\n\nDette kan ikke angres.`)) return;
    const token = await getToken();
    await fetch(`${SB_URL}/rest/v1/profiles?id=eq.${userId}`,
      {method:'DELETE', headers:{...sbH(token),'Prefer':'return=minimal'}}
    );
    window._adminUsers = window._adminUsers.filter(u=>u.id!==userId);
    renderUsers();
    renderStats(window._adminUsers, window._adminCodes||[]);
    document.getElementById('adminUserDetail').innerHTML = `
      <div class="adm-detail-empty"><div>Bruker slettet</div></div>`;
    if(typeof window.showToast==='function') window.showToast(`✓ ${name} slettet`);
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
      if(typeof window.showToast==='function') window.showToast('✓ Ny kode: '+code);
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
    renderUsers(val.toLowerCase());
  };

  // ── Oppdater alt ────────────────────────────────────────────────────────
  window.adminRefresh = async function(){
    const list = document.getElementById('adminUserList');
    if(list) list.innerHTML = '<div class="adm-loading">Laster...</div>';
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
