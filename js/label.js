// === label.js ===
// Label dashboard — sidebar + detaljpanel (Versjon C)
// Kun synlig for brukere med package = 'label'

(function(){
  'use strict';

  const SB_URL = 'https://ylvqkfdvijqnecuqznyr.supabase.co';
  const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlsdnFrZmR2aWpxbmVjdXF6bnlyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgzMzA4MzIsImV4cCI6MjA5MzkwNjgzMn0.bYPTaxQK8n7I7w5Ri2DVYW5_LbFHg2IXkuhHsLTDDqc';

  function sbH(token){
    const t = token || SB_KEY;
    return {'apikey':SB_KEY,'Authorization':'Bearer '+t,'Content-Type':'application/json'};
  }

  async function getToken(){
    const {data:{session}} = await window.supabaseClient.auth.getSession();
    return session?.access_token || SB_KEY;
  }

  async function getUid(){
    return window._mvCurrentUserId || sessionStorage.getItem('mv_user_id');
  }

  // ── Installer label-tab ─────────────────────────────────────────────────
  function installLabelTab(){
    const pkg = sessionStorage.getItem('mv_package');
    if(pkg !== 'label' && pkg !== 'admin') return;

    // Vis tab-knappen
    const tabBtn = document.querySelector('.tab-btn[data-tab="label"]');
    if(tabBtn) tabBtn.style.display = '';

    // Fyll tab-seksjonen med innhold
    const section = document.getElementById('labelTab');
    if(section && !section.querySelector('.label-dashboard')){
      section.innerHTML = buildDashboardShell();
    }

    installLabelStyles();
    console.log('[Label] Dashboard installert for', pkg);
  }

  function buildDashboardShell(){
    return `<div class="app"><div class="label-dashboard">
      <div class="label-topbar">
        <div class="label-topbar-left">
          <span class="label-icon">🏷</span>
          <span id="labelName" class="label-title">Label</span>
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          <button class="ghost-btn label-invite-btn" onclick="window.labelShowOverview()" id="labelOverviewBtn">← Oversikt</button>
          <button class="ghost-btn label-invite-btn" onclick="window.labelShowFeed()">📋 Aktivitet</button>
          <button class="ghost-btn label-invite-btn" onclick="window.labelOpenInvite()">+ Inviter artist</button>
        </div>
      </div>

      <div class="label-body">
        <!-- Sidebar -->
        <div class="label-sidebar" id="labelSidebar">
          <div style="padding:10px 12px">
            <input id="labelArtistSearch" placeholder="Søk artist..." oninput="window.labelFilterArtists(this.value)"
              style="width:100%;box-sizing:border-box;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);color:#f4ede4;padding:7px 10px;font-size:12px;font-family:system-ui;outline:none;border-radius:0">
          </div>
          <div class="label-sidebar-hd" style="padding-top:4px">Artister</div>
          <div id="labelArtistList"><div class="label-loading">Laster...</div></div>
        </div>

        <!-- Main: oversikt eller artist-detalj -->
        <div class="label-detail" id="labelDetail">
          <!-- Oversikt -->
          <div id="labelOverviewPane">
            <div id="labelOverviewContent"><div class="label-loading">Laster oversikt...</div></div>
          </div>
          <!-- Artistdetalj -->
          <div id="labelArtistPane" style="display:none"></div>
        </div>
      </div>
    </div>

    <!-- Activity feed modal -->
    <div id="labelFeedModal" style="display:none;position:fixed;inset:0;z-index:9100;background:rgba(0,0,0,.75);align-items:flex-start;justify-content:center;backdrop-filter:blur(4px);padding-top:60px;overflow-y:auto">
      <div style="background:#1a1612;border:1px solid rgba(255,255,255,.12);width:min(600px,92vw);padding:0 0 24px">
        <div style="display:flex;justify-content:space-between;align-items:center;padding:20px 24px;border-bottom:1px solid rgba(255,255,255,.08)">
          <h2 style="font-size:16px;font-weight:800;margin:0">📋 Aktivitetsfeed</h2>
          <button onclick="document.getElementById('labelFeedModal').style.display='none'" style="background:none;border:none;color:rgba(255,255,255,.5);font-size:20px;cursor:pointer;line-height:1">×</button>
        </div>
        <div id="labelFeedContent" style="padding:0 24px"></div>
      </div>
    </div>

    <!-- Invite modal -->
    <div id="labelInviteModal" style="display:none;position:fixed;inset:0;z-index:9100;background:rgba(0,0,0,.75);align-items:center;justify-content:center;backdrop-filter:blur(4px)">
      <div style="background:#1a1612;border:1px solid rgba(255,255,255,.12);max-width:400px;width:90%;padding:28px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
          <h2 style="font-size:16px;font-weight:800;margin:0">Inviter artist</h2>
          <button onclick="window.labelCloseInvite()" style="background:none;border:none;color:rgba(255,255,255,.5);font-size:20px;cursor:pointer;line-height:1">×</button>
        </div>
        <input id="labelInviteUsername" placeholder="Brukernavn"
          style="width:100%;box-sizing:border-box;background:rgba(255,255,255,.06);border:none;border-bottom:2px solid rgba(244,164,67,.3);color:#f4ede4;padding:10px 12px;font-size:14px;font-family:system-ui;outline:none;margin-bottom:12px"
          onfocus="this.style.borderBottomColor='rgba(244,164,67,.8)'"
          onblur="this.style.borderBottomColor='rgba(244,164,67,.3)'"
        />
        <button onclick="window.labelSendInvite()" style="width:100%;background:linear-gradient(135deg,#f4a443,#cb6e1a);border:none;color:#000;font-size:14px;font-weight:900;padding:12px;cursor:pointer;font-family:system-ui;letter-spacing:.06em;text-transform:uppercase">Send invitasjon</button>
        <div id="labelInviteStatus" style="font-size:12px;text-align:center;margin-top:10px;min-height:16px;font-family:system-ui;color:rgba(255,255,255,.5)"></div>
      </div>
    </div></div>`;
  }

  function installLabelStyles(){
    if(document.getElementById('label-css')) return;
    const s = document.createElement('style');
    s.id = 'label-css';
    s.textContent = `
.label-dashboard { display:flex;flex-direction:column;min-height:600px;font-family:system-ui }
.label-topbar { display:flex;align-items:center;justify-content:space-between;padding:14px 20px;border-bottom:1px solid rgba(255,255,255,.08) }
.label-topbar-left { display:flex;align-items:center;gap:10px }
.label-icon { font-size:18px }
.label-title { font-size:16px;font-weight:800;color:#f4ede4;letter-spacing:-.02em }
.label-invite-btn { font-size:12px !important;padding:7px 14px !important }
.label-body { display:flex;flex:1;min-height:0 }

/* Sidebar */
.label-sidebar { width:210px;flex-shrink:0;border-right:1px solid rgba(255,255,255,.08);overflow-y:auto }
.label-sidebar-hd { font-size:10px;font-weight:800;letter-spacing:.15em;text-transform:uppercase;color:rgba(255,255,255,.35);padding:8px 16px 6px }
.label-artist-row { display:flex;align-items:center;gap:10px;padding:9px 14px;cursor:pointer;transition:background .12s;border-left:3px solid transparent }
.label-artist-row:hover { background:rgba(255,255,255,.04) }
.label-artist-row.active { background:rgba(244,164,67,.08);border-left-color:#f4a443 }
.label-avatar { width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;flex-shrink:0 }
.label-artist-name { font-size:13px;font-weight:700;color:#f4ede4;white-space:nowrap;overflow:hidden;text-overflow:ellipsis }
.label-artist-sub { font-size:10px;color:rgba(255,255,255,.4) }
.label-pending-row { display:flex;align-items:center;gap:10px;padding:9px 16px;opacity:.5 }

/* Detail pane */
.label-detail { flex:1;min-width:0;overflow-y:auto;padding:20px }
.label-detail-empty { display:flex;flex-direction:column;align-items:center;justify-content:center;height:300px;color:rgba(255,255,255,.3);font-size:13px;text-align:center }
.label-detail-header { display:flex;align-items:center;gap:14px;margin-bottom:20px;padding-bottom:16px;border-bottom:1px solid rgba(255,255,255,.08) }
.label-detail-avatar { width:52px;height:52px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:800;flex-shrink:0 }
.label-detail-name { font-size:18px;font-weight:900;color:#f4ede4;letter-spacing:-.03em;margin-bottom:2px }
.label-detail-meta { font-size:12px;color:rgba(255,255,255,.4) }
.label-stats { display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:20px }
.label-stat { background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.06);padding:12px;text-align:center }
.label-stat-n { font-size:22px;font-weight:900;color:#f4ede4;letter-spacing:-.04em;line-height:1 }
.label-stat-l { font-size:10px;color:rgba(255,255,255,.4);margin-top:3px;text-transform:uppercase;letter-spacing:.1em }
.label-section-hd { font-size:10px;font-weight:800;letter-spacing:.15em;text-transform:uppercase;color:rgba(255,255,255,.35);margin-bottom:10px }
.label-album-row { display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid rgba(255,255,255,.05) }
.label-album-row:last-child { border-bottom:none }
.label-album-cover { width:38px;height:38px;flex-shrink:0;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.08);display:flex;align-items:center;justify-content:center;font-size:16px;overflow:hidden }
.label-album-name { font-size:13px;font-weight:700;color:#f4ede4;flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis }
.label-album-meta { font-size:11px;color:rgba(255,255,255,.4);margin-top:1px }
.label-progress { height:3px;background:rgba(255,255,255,.1);overflow:hidden;min-width:60px }
.label-progress-fill { height:100%;background:#f4a443 }
.label-badge { display:inline-block;font-size:10px;font-weight:800;padding:2px 7px;letter-spacing:.04em }
.badge-master { background:rgba(244,164,67,.15);color:#f4a443 }
.badge-ferdig { background:rgba(52,211,153,.15);color:#34d399 }
.badge-skriving { background:rgba(96,165,250,.15);color:#60a5fa }
.badge-ide { background:rgba(168,85,247,.15);color:#a855f7 }
.badge-mixing { background:rgba(249,115,22,.15);color:#f97316 }
.label-loading { padding:20px 16px;font-size:12px;color:rgba(255,255,255,.4);text-align:center }
.label-empty { padding:20px 16px;font-size:12px;color:rgba(255,255,255,.4);text-align:center }

/* Oversiktskort */
.lov-grid { display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:24px }
.lov-card { background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07);padding:16px;text-align:center }
.lov-n { font-size:28px;font-weight:900;color:#f4ede4;letter-spacing:-.06em;line-height:1 }
.lov-l { font-size:10px;color:rgba(255,255,255,.4);text-transform:uppercase;letter-spacing:.12em;margin-top:4px }
.lov-artist-grid { display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px }
.lov-artist-card { background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07);padding:16px;cursor:pointer;transition:all .15s }
.lov-artist-card:hover { background:rgba(255,255,255,.07);border-color:rgba(244,164,67,.3) }
    `;
    document.head.appendChild(s);
  }

  // ── Vis oversikt (landing) ───────────────────────────────────────────────
  window.labelShowOverview = function(){
    document.getElementById('labelOverviewPane').style.display = 'block';
    document.getElementById('labelArtistPane').style.display  = 'none';
    document.querySelectorAll('.label-artist-row').forEach(r=>r.classList.remove('active'));
    const btn = document.getElementById('labelOverviewBtn');
    if(btn) btn.style.display = 'none';
  };

  async function renderOverview(artists){
    const el = document.getElementById('labelOverviewContent');
    if(!el) return;

    const token = await getToken();
    const accepted = artists.filter(a=>a.status==='accepted');
    const pending  = artists.filter(a=>a.status==='invited'||a.status==='pending');

    // Hent stats for alle artister parallelt
    const artistIds = accepted.map(a=>a.artist_id).filter(Boolean);
    let allAlbums=[], allBeats=[], allMixtapes=[];
    if(artistIds.length){
      const [ar,br,mr] = await Promise.all([
        fetch(`${SB_URL}/rest/v1/albums?owner_id=in.(${artistIds.join(',')})&archived=eq.false&select=id,owner_id,metadata,status`,{headers:sbH(token)}),
        fetch(`${SB_URL}/rest/v1/beats?owner_id=in.(${artistIds.join(',')})&archived=eq.false&select=id,owner_id,metadata`,{headers:sbH(token)}),
        fetch(`${SB_URL}/rest/v1/mixtapes?owner_id=in.(${artistIds.join(',')})&archived=eq.false&select=id,owner_id,metadata`,{headers:sbH(token)})
      ]);
      allAlbums   = ar.ok  ? await ar.json()  : [];
      allBeats    = br.ok  ? await br.json()  : [];
      allMixtapes = mr.ok  ? await mr.json()  : [];
    }

    // Globale stats
    const totalBeats   = allBeats.length;
    const totalAlbums  = allAlbums.length;
    const doneVals     = allBeats.map(b=>Number((b.metadata||{}).done||0));
    const avgDone      = doneVals.length ? Math.round(doneVals.reduce((a,b)=>a+b,0)/doneVals.length) : 0;
    const nearDone     = allAlbums.filter(a=>Number((a.metadata||{}).done||0)>=80).length;

    // Bygg profiler-map
    const profMap = {};
    accepted.forEach(a=>{ if(a.profile) profMap[a.artist_id]=a.profile; });

    // Artistkort
    const artistCards = accepted.map((a,i) => {
      const prof    = profMap[a.artist_id] || {};
      const name    = prof.username || a.artist_id?.slice(0,8) || '?';
      const initials= name.slice(0,2).toUpperCase();
      const col     = avatarColor(i);
      const aBeats  = allBeats.filter(b=>b.owner_id===a.artist_id);
      const aAlbums = allAlbums.filter(b=>b.owner_id===a.artist_id);
      const aMixes  = allMixtapes.filter(b=>b.owner_id===a.artist_id);
      const aDone   = aBeats.length ? Math.round(aBeats.reduce((s,b)=>s+Number((b.metadata||{}).done||0),0)/aBeats.length) : 0;
      return `<div class="lov-artist-card" onclick="window.labelSelectArtist('${a.artist_id}')">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">
          <div class="label-avatar" style="width:40px;height:40px;font-size:15px;background:${col.bg};color:${col.color};flex-shrink:0">${initials}</div>
          <div style="min-width:0">
            <div style="font-size:14px;font-weight:800;color:#f4ede4">${name}</div>
            <div style="font-size:11px;color:rgba(255,255,255,.35)">${prof.email||''}</div>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-bottom:10px">
          <div style="background:rgba(255,255,255,.04);padding:8px;text-align:center">
            <div style="font-size:16px;font-weight:800;color:#f4ede4">${aAlbums.length}</div>
            <div style="font-size:9px;color:rgba(255,255,255,.35);text-transform:uppercase;letter-spacing:.1em">Albumer</div>
          </div>
          <div style="background:rgba(255,255,255,.04);padding:8px;text-align:center">
            <div style="font-size:16px;font-weight:800;color:#f4ede4">${aMixes.length}</div>
            <div style="font-size:9px;color:rgba(255,255,255,.35);text-transform:uppercase;letter-spacing:.1em">Mixtapes</div>
          </div>
          <div style="background:rgba(255,255,255,.04);padding:8px;text-align:center">
            <div style="font-size:16px;font-weight:800;color:#f4ede4">${aBeats.length}</div>
            <div style="font-size:9px;color:rgba(255,255,255,.35);text-transform:uppercase;letter-spacing:.1em">Sanger</div>
          </div>
        </div>
        <div style="display:flex;justify-content:space-between;margin-bottom:4px">
          <span style="font-size:10px;color:rgba(255,255,255,.35)">Ferdigstillelse</span>
          <span style="font-size:10px;color:#f4a443;font-weight:800">${aDone}%</span>
        </div>
        <div class="label-progress" style="height:4px"><div class="label-progress-fill" style="width:${aDone}%"></div></div>
      </div>`;
    }).join('');

    el.innerHTML = `
      <div class="lov-grid">
        <div class="lov-card">
          <div class="lov-n">${accepted.length}</div>
          <div class="lov-l">Aktive artister</div>
        </div>
        <div class="lov-card">
          <div class="lov-n">${totalAlbums}</div>
          <div class="lov-l">Albumer totalt</div>
        </div>
        <div class="lov-card">
          <div class="lov-n" style="color:#f4a443">${avgDone}%</div>
          <div class="lov-l">Snitt ferdig</div>
        </div>
        <div class="lov-card">
          <div class="lov-n" style="color:#34d399">${nearDone}</div>
          <div class="lov-l">Nær ferdig (80%+)</div>
        </div>
      </div>

      ${pending.length ? `<div style="background:rgba(244,164,67,.06);border:1px solid rgba(244,164,67,.15);padding:10px 14px;margin-bottom:20px;font-size:12px;color:rgba(244,164,67,.8)">
        ⏳ ${pending.length} invitasjon${pending.length>1?'er':''} venter på svar
      </div>` : ''}

      <div class="label-section-hd" style="margin-bottom:12px">Artister</div>
      ${accepted.length ? `<div class="lov-artist-grid">${artistCards}</div>` :
        `<div style="font-size:13px;color:rgba(255,255,255,.3);padding:20px 0">Ingen artister ennå — inviter din første artist.</div>`}
    `;
  }

  // ── Søk/filter artister i sidebar ───────────────────────────────────────
  window.labelFilterArtists = function(val){
    const query = val.toLowerCase();
    document.querySelectorAll('.label-artist-row[data-id]').forEach(row => {
      const name = (row.dataset.name||'').toLowerCase();
      row.style.display = (!query || name.includes(query)) ? '' : 'none';
    });
    document.querySelectorAll('.label-pending-row').forEach(row => {
      const name = (row.dataset.name||'').toLowerCase();
      row.style.display = (!query || name.includes(query)) ? '' : 'none';
    });
    // Skjul seksjonsoverskrifter hvis alle under er skjult
    document.querySelectorAll('.label-sidebar-hd').forEach(hd => {
      const next = hd.nextElementSibling;
      if(next && next.id==='labelArtistList') return;
      hd.style.display = '';
    });
  };

  // ── Hent og render artistliste ──────────────────────────────────────────
  async function loadArtists(){
    const uid = await getUid();
    const token = await getToken();

    // Hent label_artists rader
    const res = await fetch(
      `${SB_URL}/rest/v1/label_artists?label_id=eq.${uid}&select=*&order=invited_at.desc`,
      {headers: sbH(token)}
    );
    if(!res.ok) return [];
    const rows = await res.json();

    // Hent profiler for alle artister
    const artistIds = rows.filter(r=>r.artist_id).map(r=>r.artist_id);
    let profiles = {};
    if(artistIds.length){
      const pr = await fetch(
        `${SB_URL}/rest/v1/profiles?id=in.(${artistIds.join(',')})&select=id,username,email,package`,
        {headers: sbH(token)}
      );
      if(pr.ok){
        const pdata = await pr.json();
        pdata.forEach(p => profiles[p.id] = p);
      }
    }

    return rows.map(r => ({...r, profile: profiles[r.artist_id] || null}));
  }

  const AVATAR_COLORS = [
    {bg:'rgba(244,164,67,.18)',color:'#f4a443'},
    {bg:'rgba(96,165,250,.18)',color:'#60a5fa'},
    {bg:'rgba(52,211,153,.18)',color:'#34d399'},
    {bg:'rgba(168,85,247,.18)',color:'#a855f7'},
    {bg:'rgba(249,115,22,.18)',color:'#f97316'},
  ];

  function avatarColor(i){ return AVATAR_COLORS[i % AVATAR_COLORS.length]; }

  async function renderArtistList(){
    const list = document.getElementById('labelArtistList');
    if(!list) return;
    list.innerHTML = '<div class="label-loading">Laster artister...</div>';

    const artists = await loadArtists();
    window._labelArtists = artists;

    // Hent label-navn
    const uid = await getUid();
    const token = await getToken();
    const lpRes = await fetch(`${SB_URL}/rest/v1/label_profiles?id=eq.${uid}&select=name`, {headers:sbH(token)});
    if(lpRes.ok){
      const lp = await lpRes.json();
      const nameEl = document.getElementById('labelName');
      if(nameEl && lp[0]?.name) nameEl.textContent = lp[0].name;
      else if(nameEl){
        const profile = window._labelProfile;
        if(!profile){
          const pRes = await fetch(`${SB_URL}/rest/v1/profiles?id=eq.${uid}&select=username`, {headers:sbH(token)});
          if(pRes.ok){ const pd = await pRes.json(); if(nameEl && pd[0]) nameEl.textContent = pd[0].username; }
        }
      }
    }

    if(!artists.length){
      list.innerHTML = '<div class="label-empty">Ingen artister ennå.<br>Inviter din første artist.</div>';
      return;
    }

    const accepted = artists.filter(a => a.status === 'accepted');
    const pending  = artists.filter(a => a.status === 'invited' || a.status === 'pending');
    const left     = artists.filter(a => a.status === 'left' && a.access_expires_at && new Date(a.access_expires_at) > new Date());

    let html = '';

    accepted.forEach((a, i) => {
      const name = a.profile?.username || a.artist_id?.slice(0,8) || '?';
      const initials = name.slice(0,2).toUpperCase();
      const col = avatarColor(i);
      html += `<div class="label-artist-row" data-id="${a.artist_id}" data-name="${name}" onclick="window.labelSelectArtist('${a.artist_id}')">
        <div class="label-avatar" style="background:${col.bg};color:${col.color}">${initials}</div>
        <div style="min-width:0">
          <div class="label-artist-name">${name}</div>
          <div class="label-artist-sub">Aktiv</div>
        </div>
      </div>`;
    });

    if(pending.length){
      html += `<div class="label-sidebar-hd" style="margin-top:8px">Venter</div>`;
      pending.forEach(a => {
        const name = a.profile?.username || 'Ukjent';
        html += `<div class="label-pending-row" data-name="${name}">
          <div class="label-avatar" style="background:rgba(255,255,255,.06);color:rgba(255,255,255,.4)">?</div>
          <div style="min-width:0">
            <div class="label-artist-name">${name}</div>
            <div class="label-artist-sub">Invitert</div>
          </div>
        </div>`;
      });
    }

    if(left.length){
      html += `<div class="label-sidebar-hd" style="margin-top:8px">Forlatt</div>`;
      left.forEach(a => {
        const name = a.profile?.username || 'Ukjent';
        const daysLeft = Math.ceil((new Date(a.access_expires_at) - new Date()) / (1000*60*60*24));
        html += `<div class="label-pending-row" style="opacity:.6">
          <div class="label-avatar" style="background:rgba(251,113,133,.1);color:rgba(251,113,133,.5)">✕</div>
          <div style="min-width:0">
            <div class="label-artist-name">${name}</div>
            <div class="label-artist-sub" style="color:rgba(251,113,133,.5)">${daysLeft}d tilgang igjen</div>
          </div>
        </div>`;
      });
    }

    list.innerHTML = html;

    // Vis oversikt ved første innlasting
    renderOverview(artists);
    window.labelShowOverview();
  }

  // ── Artistdetalj ────────────────────────────────────────────────────────
  window.labelSelectArtist = async function(artistId){
    // Bytt til artist-pane
    document.getElementById('labelOverviewPane').style.display = 'none';
    document.getElementById('labelArtistPane').style.display   = 'block';
    const btn = document.getElementById('labelOverviewBtn');
    if(btn) btn.style.display = '';

    // Marker aktiv i sidebar
    document.querySelectorAll('.label-artist-row').forEach(r => {
      r.classList.toggle('active', r.dataset.id === artistId);
    });

    const detail = document.getElementById('labelArtistPane');
    if(!detail) return;
    detail.innerHTML = '<div class="label-detail-empty"><div class="label-loading">Laster artistdata...</div></div>';

    const token = await getToken();

    // Hent beats, albums, mixtapes for artisten + label-data
    const uid = await getUid();
    const [beatsRes, albumsRes, mixtapesRes, profileRes, labAlbumRes, notesRes] = await Promise.all([
      fetch(`${SB_URL}/rest/v1/beats?owner_id=eq.${artistId}&archived=eq.false&select=id,title,metadata`, {headers:sbH(token)}),
      fetch(`${SB_URL}/rest/v1/albums?owner_id=eq.${artistId}&archived=eq.false&select=*`, {headers:sbH(token)}),
      fetch(`${SB_URL}/rest/v1/mixtapes?owner_id=eq.${artistId}&archived=eq.false&select=id,title,metadata`, {headers:sbH(token)}),
      fetch(`${SB_URL}/rest/v1/profiles?id=eq.${artistId}&select=id,username,email,package`, {headers:sbH(token)}),
      fetch(`${SB_URL}/rest/v1/label_album_data?label_id=eq.${uid}&select=*`, {headers:sbH(token)}),
      fetch(`${SB_URL}/rest/v1/label_artist_notes?label_id=eq.${uid}&artist_id=eq.${artistId}&select=notes`, {headers:sbH(token)})
    ]);

    const beats       = beatsRes.ok    ? await beatsRes.json()    : [];
    const albums      = albumsRes.ok   ? await albumsRes.json()   : [];
    const mixtapes    = mixtapesRes.ok ? await mixtapesRes.json() : [];
    const profiles    = profileRes.ok  ? await profileRes.json()  : [];
    const labAlbums   = labAlbumRes.ok ? await labAlbumRes.json() : [];
    const notesRows   = notesRes.ok    ? await notesRes.json()    : [];
    const profile     = profiles[0] || {};
    const artistNotes = notesRows[0]?.notes || '';

    // Map label album data by album_id
    const labAlbumMap = {};
    labAlbums.forEach(r => { labAlbumMap[r.album_id] = r; });

    const name = profile.username || artistId.slice(0,8);
    const initials = name.slice(0,2).toUpperCase();
    const idx = (window._labelArtists||[]).findIndex(a=>a.artist_id===artistId);
    const col = avatarColor(idx >= 0 ? idx : 0);

    // Hent album_beats for alle albumene
    const albumBeatMap = {};
    if(albums.length){
      const abRes = await fetch(
        `${SB_URL}/rest/v1/album_beats?album_id=in.(${albums.map(a=>a.id).join(',')})&select=album_id,beat_id`,
        {headers:sbH(token)}
      );
      if(abRes.ok){
        const abRows = await abRes.json();
        abRows.forEach(r=>{
          if(!albumBeatMap[r.album_id]) albumBeatMap[r.album_id] = [];
          albumBeatMap[r.album_id].push(r.beat_id);
        });
      }
    }

    // Hent mixtape_beats for alle mixtapene
    const mixtapeBeatMap = {};
    if(mixtapes.length){
      const mbRes = await fetch(
        `${SB_URL}/rest/v1/mixtape_beats?mixtape_id=in.(${mixtapes.map(m=>m.id).join(',')})&select=mixtape_id,beat_id`,
        {headers:sbH(token)}
      );
      if(mbRes.ok){
        const mbRows = await mbRes.json();
        mbRows.forEach(r=>{
          if(!mixtapeBeatMap[r.mixtape_id]) mixtapeBeatMap[r.mixtape_id] = [];
          mixtapeBeatMap[r.mixtape_id].push(r.beat_id);
        });
      }
    }

    // Hent alle beats som er i mixtapes (kan mangle i beats-lista)
    const allMixtapeBeatIds = [...new Set(Object.values(mixtapeBeatMap).flat())];
    const extraBeatIds = allMixtapeBeatIds.filter(id => !beats.find(b=>b.id===id));
    let extraBeats = [];
    if(extraBeatIds.length){
      const ebRes = await fetch(
        `${SB_URL}/rest/v1/beats?id=in.(${extraBeatIds.join(',')})&select=*`,
        {headers:sbH(token)}
      );
      if(ebRes.ok) extraBeats = await ebRes.json();
    }

    // Bygg komplett beats-map
    const beatMap = {};
    [...beats, ...extraBeats].forEach(b => { beatMap[b.id] = b; });

    // Beregn snitt ferdigstillelse
    const doneVals = beats.map(b => Number((b.metadata||{}).done || 0));
    const avgDone = doneVals.length ? Math.round(doneVals.reduce((a,b)=>a+b,0)/doneVals.length) : 0;

    const statusBadge = (status) => {
      const map = {'Master':'badge-master','Ferdig':'badge-ferdig','Mixing':'badge-mixing','Innspilling':'badge-mixing','Skriving':'badge-skriving','Idé':'badge-ide'};
      return `<span class="label-badge ${map[status]||'badge-ide'}">${status||'Idé'}</span>`;
    };

    const STATUSES = ['Idé','Skriving','Innspilling','Mixing','Master','Ferdig'];

    const albumRows = albums.map(a => {
      const meta = a.metadata || {};
      const status = meta.status || a.status || 'Idé';
      const cover = meta.cover || '';
      const albumBeatIds = albumBeatMap[a.id] || [];
      const albumBeats = albumBeatIds.map(id => beatMap[id] || beats.find(b=>b.id===id)).filter(Boolean);
      const beatCount = albumBeats.length;
      const safeId = a.id.replace(/-/g,'');
      const albumName = (a.title || meta.name || 'Untitled').replace(/'/g,"\'");
      const labData    = labAlbumMap[a.id] || {};
      const isPriority = !!labData.priority;
      const releaseDate= labData.release_date || '';

      const beatsWithAudio  = albumBeats.filter(b => (b.metadata?.audio_url||b.metadata?.url||b.audio_url));
      const beatsWithLyrics = albumBeats.filter(b => (b.metadata?.lyrics||(b.metadata?.lyricSections||[]).length > 0));
      const avgBeatDone = albumBeats.length ? Math.round(albumBeats.reduce((s,b)=>s+Number((b.metadata||{}).done||0),0)/albumBeats.length) : 0;
      const totalDur    = albumBeats.reduce((s,b)=>s+Number((b.metadata||{}).duration||b.duration||0),0);
      const durStr      = totalDur > 0 ? Math.floor(totalDur/60)+':'+String(Math.floor(totalDur%60)).padStart(2,'0') : null;
      const avgRating   = albumBeats.length ? (albumBeats.reduce((s,b)=>s+Number((b.metadata||{}).rating||0),0)/albumBeats.length).toFixed(1) : null;
      const beatsDone   = albumBeats.filter(b=>Number((b.metadata||{}).done||0)>=100).length;
      const relDateStr  = releaseDate ? new Date(releaseDate+'T00:00:00').toLocaleDateString('no-NO',{day:'numeric',month:'short',year:'numeric'}) : '';

      const trackRows = albumBeats.map((b,i) => {
        const bm = b.metadata || {};
        const bTitle = (b.title || bm.name || 'Untitled').replace(/`/g,'');
        const bDone = Number(bm.done || 0);
        const bRating = Number(bm.rating || 0);
        const stars = '★'.repeat(bRating) + '☆'.repeat(Math.max(0,5-bRating));
        const dur = Number(bm.duration||b.duration||0);
        const dStr = dur>0 ? Math.floor(dur/60)+':'+String(Math.floor(dur%60)).padStart(2,'0') : '';
        const hasAudio = !!(bm.audio_url||bm.url||b.audio_url);
        return '<div style="display:flex;align-items:center;gap:10px;padding:8px 12px;border-bottom:1px solid rgba(255,255,255,.04);background:rgba(0,0,0,.2)">'
          + '<span style="font-size:11px;color:rgba(255,255,255,.25);min-width:20px;font-family:system-ui">'+String(i+1).padStart(2,'0')+'</span>'
          + '<div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:700;color:#f4ede4;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+bTitle+'</div>'
          + '<div style="display:flex;align-items:center;gap:8px;margin-top:2px"><span style="font-size:11px;color:#f4a443">'+stars+'</span><span style="font-size:10px;color:rgba(255,255,255,.35)">'+bDone+'% ferdig</span>'+(dStr?'<span style="font-size:10px;color:rgba(255,255,255,.25)">'+dStr+'</span>':'')+'</div></div>'
          + (hasAudio ? '<button onclick="window.labelPlayBeat(\''+b.id+'\')" style="background:#f4a443;border:none;color:#000;font-size:11px;font-weight:900;width:26px;height:26px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;border-radius:50%">▶</button>' : '<div style="width:26px"></div>')
          + '</div>';
      }).join('');

      const statusOpts = STATUSES.map(s => '<option value="'+s+'"'+(s===status?' selected':'')+'>'+s+'</option>').join('');
      const borderCol  = isPriority ? 'rgba(244,164,67,.35)' : 'rgba(255,255,255,.06)';
      const bgStr      = isPriority ? ';background:rgba(244,164,67,.02)' : '';
      const priBtnBg   = isPriority ? 'rgba(244,164,67,.2)' : 'rgba(255,255,255,.06)';
      const priBtnBd   = isPriority ? 'rgba(244,164,67,.4)' : 'rgba(255,255,255,.1)';
      const priBtnCol  = isPriority ? '#f4a443' : 'rgba(255,255,255,.4)';
      const priLabel   = isPriority ? 'Prioritert' : 'Prioriter';
      const datCol     = releaseDate ? '#60a5fa' : 'rgba(255,255,255,.35)';
      const ratCol     = Number(avgRating)>=4 ? '#f4a443' : Number(avgRating)>=3 ? '#f4ede4' : 'rgba(255,255,255,.5)';

      return '<div style="border:1px solid '+borderCol+';margin-bottom:10px'+bgStr+'">'
        + '<div style="display:flex;align-items:center;gap:8px;padding:10px 12px;cursor:pointer" onclick="var t=document.getElementById(\'at'+safeId+'\');var ar=document.getElementById(\'arr'+safeId+'\');if(t.style.display===\'none\'){t.style.display=\'block\';ar.textContent=\'▲\';}else{t.style.display=\'none\';ar.textContent=\'▼\';}">'
          + '<div class="label-album-cover">'+(cover?'<img src="'+cover+'" style="width:100%;height:100%;object-fit:cover">':'🎵')+'</div>'
          + '<div style="flex:1;min-width:0"><div style="display:flex;align-items:center;gap:6px">'+(isPriority?'<span style="font-size:12px">🔥</span>':'')+'<div class="label-album-name">'+albumName+'</div></div>'
          + '<div style="display:flex;align-items:center;gap:8px;margin-top:2px"><span class="label-album-meta">'+beatCount+' sanger'+(durStr?' · '+durStr:'')+'</span>'+(releaseDate?'<span style="font-size:10px;color:#60a5fa">📅 '+relDateStr+'</span>':'')+'</div></div>'
          + '<div style="min-width:60px"><div class="label-progress"><div class="label-progress-fill" style="width:'+avgBeatDone+'%"></div></div><div style="font-size:10px;color:rgba(255,255,255,.4);margin-top:2px;text-align:right">'+avgBeatDone+'%</div></div>'
          + '<span id="arr'+safeId+'" style="color:rgba(255,255,255,.3);font-size:11px">▼</span>'
        + '</div>'
        + '<div style="display:flex;align-items:center;gap:8px;padding:6px 12px;border-top:1px solid rgba(255,255,255,.05);background:rgba(0,0,0,.15);flex-wrap:wrap" onclick="event.stopPropagation()">'
          + '<select onchange="window.labelSetAlbumStatus(\''+a.id+'\',\''+artistId+'\',this.value)" style="background:#1a1612;border:1px solid rgba(255,255,255,.12);color:#f4ede4;padding:4px 6px;font-size:11px;font-family:system-ui;outline:none;cursor:pointer">'+statusOpts+'</select>'
          + '<button onclick="window.labelTogglePriority(\''+a.id+'\',\''+artistId+'\','+(!isPriority)+')" style="background:'+priBtnBg+';border:1px solid '+priBtnBd+';color:'+priBtnCol+';font-size:11px;padding:4px 10px;cursor:pointer;font-family:system-ui">🔥 '+priLabel+'</button>'
          + '<input type="date" value="'+releaseDate+'" onchange="window.labelSetRelease(\''+a.id+'\',\''+artistId+'\',this.value)" style="background:#1a1612;border:1px solid rgba(255,255,255,.12);color:'+datCol+';padding:4px 6px;font-size:11px;font-family:system-ui;outline:none;cursor:pointer" title="Release-dato">'
          + '<button onclick="event.stopPropagation();window.labelOpenComments(\''+a.id+'\',\''+albumName+'\',\''+artistId+'\')" style="margin-left:auto;background:none;border:1px solid rgba(255,255,255,.1);color:rgba(255,255,255,.4);font-size:11px;padding:4px 8px;cursor:pointer;font-family:system-ui">💬</button>'
        + '</div>'
        + '<div id="at'+safeId+'" style="display:none">'
          + '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;padding:10px 12px;background:rgba(255,255,255,.02);border-bottom:1px solid rgba(255,255,255,.06)">'
            + '<div style="text-align:center"><div style="font-size:16px;font-weight:900;color:#f4ede4">'+beatsDone+'/'+beatCount+'</div><div style="font-size:9px;color:rgba(255,255,255,.35);text-transform:uppercase;letter-spacing:.1em;margin-top:2px">Ferdig</div></div>'
            + '<div style="text-align:center"><div style="font-size:16px;font-weight:900;color:#f4ede4">'+beatsWithAudio.length+'</div><div style="font-size:9px;color:rgba(255,255,255,.35);text-transform:uppercase;letter-spacing:.1em;margin-top:2px">Har lyd</div></div>'
            + '<div style="text-align:center"><div style="font-size:16px;font-weight:900;color:#f4ede4">'+beatsWithLyrics.length+'</div><div style="font-size:9px;color:rgba(255,255,255,.35);text-transform:uppercase;letter-spacing:.1em;margin-top:2px">Har tekst</div></div>'
            + '<div style="text-align:center"><div style="font-size:16px;font-weight:900;color:'+ratCol+'">'+( avgRating||'—')+'</div><div style="font-size:9px;color:rgba(255,255,255,.35);text-transform:uppercase;letter-spacing:.1em;margin-top:2px">Snitt ★</div></div>'
          + '</div>'
          + (trackRows || '<div style="padding:12px;font-size:12px;color:rgba(255,255,255,.3)">Ingen sanger ennå</div>')
        + '</div>'
      + '</div>';
    }).join('');


    detail.innerHTML = `
      <div class="label-detail-header">
        <div class="label-detail-avatar" style="background:${col.bg};color:${col.color}">${initials}</div>
        <div style="flex:1;min-width:0">
          <div class="label-detail-name">${name}</div>
          <div class="label-detail-meta">${profile.email || ''}</div>
        </div>
        <button class="ghost-btn" style="font-size:12px" onclick="window.labelPitchArtist('${artistId}')">📄 Pitch</button>
      </div>

      <div class="label-stats">
        <div class="label-stat"><div class="label-stat-n">${albums.length}</div><div class="label-stat-l">Albumer</div></div>
        <div class="label-stat"><div class="label-stat-n">${mixtapes.length}</div><div class="label-stat-l">Mixtapes</div></div>
        <div class="label-stat"><div class="label-stat-n">${beats.length}</div><div class="label-stat-l">Sanger</div></div>
      </div>

      ${avgDone > 0 ? `
      <div style="margin-bottom:20px">
        <div style="display:flex;justify-content:space-between;margin-bottom:5px">
          <span style="font-size:11px;color:rgba(255,255,255,.4);text-transform:uppercase;letter-spacing:.1em">Snitt ferdigstillelse</span>
          <span style="font-size:11px;color:#f4a443;font-weight:800">${avgDone}%</span>
        </div>
        <div class="label-progress" style="height:5px"><div class="label-progress-fill" style="width:${avgDone}%"></div></div>
      </div>` : ''}

      ${albums.length ? `
      <div class="label-section-hd">Albumer</div>
      <div style="margin-bottom:20px">${albumRows}</div>` : '<div style="font-size:12px;color:rgba(255,255,255,.4);margin-bottom:16px">Ingen albumer ennå.</div>'}

      ${mixtapes.length ? `
      <div class="label-section-hd">Mixtapes</div>
      <div style="margin-bottom:8px">${mixtapes.map(m => {
        const meta = m.metadata || {};
        const mBeats = (mixtapeBeatMap[m.id]||[]).map(id=>beatMap[id]).filter(Boolean);
        const safeId = m.id.replace(/-/g,'');
        const trackRows = mBeats.map((b,i) => {
          const bm = b.metadata || {};
          const bTitle = (b.title || bm.name || 'Untitled').replace(/`/g,'');
          const hasAudio = !!(bm.audio_url||bm.url||b.audio_url);
          return `<div style="display:flex;align-items:center;gap:10px;padding:7px 12px;border-bottom:1px solid rgba(255,255,255,.04);background:rgba(0,0,0,.2)">
            <span style="font-size:11px;color:rgba(255,255,255,.25);min-width:20px;font-family:system-ui">${String(i+1).padStart(2,'0')}</span>
            <div style="font-size:13px;font-weight:700;color:#f4ede4;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${bTitle}</div>
            ${hasAudio ? '<button onclick="window.labelPlayBeat(\'' + b.id + '\')" style="background:#f4a443;border:none;color:#000;font-size:11px;font-weight:900;width:24px;height:24px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;border-radius:50%">▶</button>' : '<div style="width:24px"></div>'}
          </div>`;
        }).join('');
        return `<div style="border:1px solid rgba(255,255,255,.06);margin-bottom:8px">
          <div style="display:flex;align-items:center;gap:10px;padding:10px 12px;cursor:pointer" onclick="var t=document.getElementById('mt${safeId}');var ar=document.getElementById('mrr${safeId}');if(t.style.display==='none'){t.style.display='block';ar.textContent='▲';}else{t.style.display='none';ar.textContent='▼';}">
            <div class="label-album-cover">📼</div>
            <div class="label-album-name" style="flex:1">${m.title||meta.name||'Untitled'}</div>
            <span style="font-size:11px;color:rgba(255,255,255,.35)">${mBeats.length} sanger</span>
            <span id="mrr${safeId}" style="color:rgba(255,255,255,.3);font-size:11px;margin-left:6px">▼</span>
          </div>
          <div id="mt${safeId}" style="display:none">
            ${trackRows || '<div style="padding:12px;font-size:12px;color:rgba(255,255,255,.3)">Ingen sanger</div>'}
          </div>
        </div>`;
      }).join('')}</div>` : ''}

      <!-- Interne notater (kun label ser dette) -->
      <div class="label-section-hd" style="margin-top:20px">🔒 Interne notater</div>
      <textarea id="labelNotesArea" placeholder="Private merknader om artisten — artisten ser ikke dette..." rows="4"
        style="width:100%;box-sizing:border-box;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);color:#f4ede4;padding:10px 12px;font-size:13px;font-family:Georgia,serif;outline:none;resize:vertical;margin-bottom:6px"
        oninput="window.labelNoteDirty=true">${artistNotes.replace(/</g,'&lt;')}</textarea>
      <div style="display:flex;gap:8px;align-items:center">
        <button onclick="window.labelSaveNotes('${artistId}')" style="background:#f4a443;border:none;color:#000;font-size:11px;font-weight:800;padding:6px 14px;cursor:pointer;font-family:system-ui;letter-spacing:.06em;text-transform:uppercase">Lagre notater</button>
        <span id="labelNoteStatus" style="font-size:11px;color:rgba(255,255,255,.35)"></span>
      </div>

      <!-- Verktøylinje -->
      <div style="display:flex;gap:8px;margin-top:20px;padding-top:16px;border-top:1px solid rgba(255,255,255,.07)">
        <button onclick="window.labelCompareArtist('${artistId}','${name}')" style="background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);color:rgba(255,255,255,.6);font-size:12px;padding:7px 14px;cursor:pointer;font-family:system-ui">⚖️ Sammenlign</button>
        <button onclick="window.labelExportArtist('${artistId}','${name}')" style="background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);color:rgba(255,255,255,.6);font-size:12px;padding:7px 14px;cursor:pointer;font-family:system-ui">📊 Eksporter CSV</button>
      </div>
    `;
  };

  // ── Album-kontroller ─────────────────────────────────────────────────────
  async function upsertLabelAlbumData(albumId, patch){
    const token = await getToken();
    const uid   = await getUid();
    await fetch(`${SB_URL}/rest/v1/label_album_data`, {
      method:'POST',
      headers:{...sbH(token),'Prefer':'resolution=merge-duplicates'},
      body: JSON.stringify({label_id:uid, album_id:albumId, ...patch})
    });
  }

  window.labelSetAlbumStatus = async function(albumId, artistId, status){
    const token = await getToken();
    // Oppdater albums-tabellen direkte
    await fetch(`${SB_URL}/rest/v1/albums?id=eq.${albumId}`, {
      method:'PATCH',
      headers:{...sbH(token),'Prefer':'return=minimal'},
      body: JSON.stringify({status})
    });
    if(typeof window.showToast==='function') window.showToast('Status oppdatert: '+status);
  };

  window.labelTogglePriority = async function(albumId, artistId, priority){
    await upsertLabelAlbumData(albumId, {priority});
    // Send varsel til artisten hvis prioritert
    if(priority){
      const token = await getToken();
      const uid   = await getUid();
      const prRes = await fetch(`${SB_URL}/rest/v1/profiles?id=eq.${uid}&select=username`,{headers:sbH(token)});
      const prData = prRes.ok ? await prRes.json() : [];
      const labelName = prData[0]?.username || 'Labelen';
      // Hent albumnavn
      const aRes = await fetch(`${SB_URL}/rest/v1/albums?id=eq.${albumId}&select=title`,{headers:sbH(token)});
      const aData = aRes.ok ? await aRes.json() : [];
      const aTitle = aData[0]?.title || 'album';
      await fetch(`${SB_URL}/rest/v1/notifications`,{
        method:'POST', headers:{...sbH(token),'Prefer':'return=minimal'},
        body:JSON.stringify({recipient_id:artistId,sender_id:uid,type:'label_comment',content_id:albumId,content_name:'🔥 '+labelName+' har prioritert: '+aTitle,role:'label',read:false})
      });
    }
    window.labelSelectArtist(artistId);
  };

  window.labelSetRelease = async function(albumId, artistId, date){
    await upsertLabelAlbumData(albumId, {release_date: date || null});
    if(typeof window.showToast==='function') window.showToast(date ? 'Release satt: '+date : 'Release-dato fjernet');
    window.labelSelectArtist(artistId);
  };

  // ── Notater ───────────────────────────────────────────────────────────────
  window.labelSaveNotes = async function(artistId){
    const text = document.getElementById('labelNotesArea')?.value || '';
    const status = document.getElementById('labelNoteStatus');
    const token = await getToken();
    const uid   = await getUid();
    await fetch(`${SB_URL}/rest/v1/label_artist_notes`, {
      method:'POST',
      headers:{...sbH(token),'Prefer':'resolution=merge-duplicates'},
      body: JSON.stringify({label_id:uid, artist_id:artistId, notes:text, updated_at:new Date().toISOString()})
    });
    if(status){ status.style.color='#34d399'; status.textContent='✓ Lagret'; setTimeout(()=>status.textContent='',2000); }
    window.labelNoteDirty = false;
  };

  // ── Sammenlign artister ───────────────────────────────────────────────────
  window.labelCompareArtist = async function(artistId, name){
    const artists = (window._labelArtists||[]).filter(a=>a.status==='accepted' && a.artist_id!==artistId);
    if(!artists.length){ if(typeof window.showToast==='function') window.showToast('Ingen andre artister å sammenligne med'); return; }

    let modal = document.getElementById('labelCompareModal');
    if(!modal){
      modal = document.createElement('div');
      modal.id = 'labelCompareModal';
      modal.style.cssText='display:none;position:fixed;inset:0;z-index:9300;background:rgba(0,0,0,.8);align-items:flex-start;justify-content:center;backdrop-filter:blur(4px);padding-top:40px;overflow-y:auto';
      modal.addEventListener('click',e=>{if(e.target===modal)modal.style.display='none';});
      document.body.appendChild(modal);
    }
    modal.style.display='flex';
    modal.innerHTML='<div style="background:#1a1612;border:1px solid rgba(255,255,255,.12);width:min(800px,96vw);padding:0 0 24px">'
      +'<div style="display:flex;justify-content:space-between;align-items:center;padding:20px 24px;border-bottom:1px solid rgba(255,255,255,.08)">'
        +'<h2 style="font-size:16px;font-weight:800;margin:0">⚖️ Sammenlign artist</h2>'
        +'<button onclick="document.getElementById(\'labelCompareModal\').style.display=\'none\'" style="background:none;border:none;color:rgba(255,255,255,.5);font-size:20px;cursor:pointer">×</button>'
      +'</div>'
      +'<div style="padding:20px 24px">'
        +'<p style="font-size:13px;color:rgba(255,255,255,.5);margin-bottom:16px">Velg artist å sammenligne med <strong style="color:#f4a443">'+name+'</strong>:</p>'
        +'<div style="display:flex;flex-wrap:wrap;gap:8px">'
        +artists.map(a=>'<button onclick="window.labelDoCompare(\''+artistId+'\',\''+a.artist_id+'\')" style="background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);color:#f4ede4;padding:8px 16px;cursor:pointer;font-family:system-ui;font-size:13px">'+(a.profile?.username||a.artist_id.slice(0,8))+'</button>').join('')
        +'</div>'
        +'<div id="labelCompareContent" style="margin-top:20px"></div>'
      +'</div>'
    +'</div>';
  };

  window.labelDoCompare = async function(idA, idB){
    const el = document.getElementById('labelCompareContent');
    if(el) el.innerHTML='<div class="label-loading">Henter data...</div>';
    const token = await getToken();

    const [bA,aA,mA,pA, bB,aB,mB,pB] = await Promise.all([
      fetch(`${SB_URL}/rest/v1/beats?owner_id=eq.${idA}&archived=eq.false&select=id,metadata`,{headers:sbH(token)}),
      fetch(`${SB_URL}/rest/v1/albums?owner_id=eq.${idA}&archived=eq.false&select=id`,{headers:sbH(token)}),
      fetch(`${SB_URL}/rest/v1/mixtapes?owner_id=eq.${idA}&archived=eq.false&select=id`,{headers:sbH(token)}),
      fetch(`${SB_URL}/rest/v1/profiles?id=eq.${idA}&select=username`,{headers:sbH(token)}),
      fetch(`${SB_URL}/rest/v1/beats?owner_id=eq.${idB}&archived=eq.false&select=id,metadata`,{headers:sbH(token)}),
      fetch(`${SB_URL}/rest/v1/albums?owner_id=eq.${idB}&archived=eq.false&select=id`,{headers:sbH(token)}),
      fetch(`${SB_URL}/rest/v1/mixtapes?owner_id=eq.${idB}&archived=eq.false&select=id`,{headers:sbH(token)}),
      fetch(`${SB_URL}/rest/v1/profiles?id=eq.${idB}&select=username`,{headers:sbH(token)}),
    ]);

    const beatsA = bA.ok?await bA.json():[], albumsA = aA.ok?await aA.json():[], mixA = mA.ok?await mA.json():[];
    const beatsB = bB.ok?await bB.json():[], albumsB = aB.ok?await aB.json():[], mixB = mB.ok?await mB.json():[];
    const profA = pA.ok?await pA.json():[], profB = pB.ok?await pB.json():[];
    const nameA = profA[0]?.username||idA.slice(0,8), nameB = profB[0]?.username||idB.slice(0,8);

    const avgDoneA = beatsA.length?Math.round(beatsA.reduce((s,b)=>s+Number((b.metadata||{}).done||0),0)/beatsA.length):0;
    const avgDoneB = beatsB.length?Math.round(beatsB.reduce((s,b)=>s+Number((b.metadata||{}).done||0),0)/beatsB.length):0;
    const avgRatA  = beatsA.length?(beatsA.reduce((s,b)=>s+Number((b.metadata||{}).rating||0),0)/beatsA.length).toFixed(1):0;
    const avgRatB  = beatsB.length?(beatsB.reduce((s,b)=>s+Number((b.metadata||{}).rating||0),0)/beatsB.length).toFixed(1):0;

    const row = (label,vA,vB,higherIsBetter=true) => {
      const aWins = higherIsBetter ? Number(vA)>Number(vB) : Number(vA)<Number(vB);
      const bWins = higherIsBetter ? Number(vB)>Number(vA) : Number(vB)<Number(vA);
      return '<div style="display:grid;grid-template-columns:1fr 120px 1fr;gap:8px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.05);align-items:center">'
        +'<div style="text-align:right;font-size:14px;font-weight:'+(aWins?'900':'400')+';color:'+(aWins?'#f4a443':'#f4ede4')+'">'+vA+'</div>'
        +'<div style="text-align:center;font-size:10px;color:rgba(255,255,255,.35);text-transform:uppercase;letter-spacing:.1em">'+label+'</div>'
        +'<div style="font-size:14px;font-weight:'+(bWins?'900':'400')+';color:'+(bWins?'#f4a443':'#f4ede4')+'">'+vB+'</div>'
      +'</div>';
    };

    if(el) el.innerHTML = '<div style="display:grid;grid-template-columns:1fr 120px 1fr;gap:8px;margin-bottom:12px">'
      +'<div style="font-size:13px;font-weight:800;color:#f4a443;text-align:right">'+nameA+'</div>'
      +'<div></div>'
      +'<div style="font-size:13px;font-weight:800;color:#60a5fa">'+nameB+'</div>'
    +'</div>'
    + row('Sanger',beatsA.length,beatsB.length)
    + row('Albumer',albumsA.length,albumsB.length)
    + row('Mixtapes',mixA.length,mixB.length)
    + row('Snitt ferdig',avgDoneA+'%',avgDoneB+'%')
    + row('Snitt ★',avgRatA,avgRatB);
  };

  // ── Eksporter CSV ─────────────────────────────────────────────────────────
  window.labelExportArtist = async function(artistId, name){
    const token = await getToken();
    const [bRes,aRes] = await Promise.all([
      fetch(`${SB_URL}/rest/v1/beats?owner_id=eq.${artistId}&archived=eq.false&select=id,title,metadata`,{headers:sbH(token)}),
      fetch(`${SB_URL}/rest/v1/albums?owner_id=eq.${artistId}&archived=eq.false&select=id,title,metadata,status`,{headers:sbH(token)}),
    ]);
    const beats  = bRes.ok?await bRes.json():[];
    const albums = aRes.ok?await aRes.json():[];

    let csv = 'Type,Navn,Status,Ferdig %,Rating\n';
    albums.forEach(a=>{
      const m=a.metadata||{};
      csv += 'Album,"'+(a.title||m.name||'Untitled').replace(/"/g,'""')+'","'+(m.status||a.status||'Idé')+'",'+Number(m.done||0)+'%,\n';
    });
    beats.forEach(b=>{
      const m=b.metadata||{};
      csv += 'Sang,"'+(b.title||m.name||'Untitled').replace(/"/g,'""')+'","'+(m.status||'')+'",'+Number(m.done||0)+'%,'+Number(m.rating||0)+'\n';
    });

    const blob = new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8;'});
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = name+'_rapport.csv';
    link.click();
    URL.revokeObjectURL(url);
    if(typeof window.showToast==='function') window.showToast('📊 CSV lastet ned');
  };

  // ── Inviter artist ──────────────────────────────────────────────────────
  window.labelOpenInvite = function(){
    const m = document.getElementById('labelInviteModal');
    if(m){ m.style.display='flex'; document.getElementById('labelInviteUsername')?.focus(); }
  };

  window.labelCloseInvite = function(){
    const m = document.getElementById('labelInviteModal');
    if(m) m.style.display='none';
    const st = document.getElementById('labelInviteStatus');
    if(st) st.textContent='';
  };

  window.labelSendInvite = async function(){
    const username = document.getElementById('labelInviteUsername')?.value?.trim().toLowerCase();
    const status   = document.getElementById('labelInviteStatus');
    if(!username){ if(status) status.textContent='Skriv inn et brukernavn.'; return; }

    const token = await getToken();
    const uid   = await getUid();

    // Finn artist via brukernavn
    const pr = await fetch(
      `${SB_URL}/rest/v1/profiles?username=eq.${encodeURIComponent(username)}&select=id,username`,
      {headers: sbH(token)}
    );
    const profiles = pr.ok ? await pr.json() : [];
    if(!profiles.length){ if(status){ status.style.color='#fb7185'; status.textContent=`Finner ingen bruker med brukernavn "${username}".`; } return; }
    const artistId = profiles[0].id;
    if(artistId === uid){ if(status){ status.style.color='#fb7185'; status.textContent='Du kan ikke invitere deg selv.'; } return; }

    // Hent label-navn
    const lnRes = await fetch(`${SB_URL}/rest/v1/profiles?id=eq.${uid}&select=username`, {headers:sbH(token)});
    const lnData = lnRes.ok ? await lnRes.json() : [];
    const labelName = lnData[0]?.username || 'Et label';

    // Opprett label_artists rad
    const ir = await fetch(`${SB_URL}/rest/v1/label_artists`, {
      method:'POST',
      headers:{...sbH(token),'Prefer':'resolution=merge-duplicates'},
      body: JSON.stringify({
        label_id: uid,
        artist_id: artistId,
        status: 'invited',
        invited_by: uid,
        label_name: labelName,
        invited_at: new Date().toISOString()
      })
    });
    if(!ir.ok){ if(status){ status.style.color='#fb7185'; status.textContent='Noe gikk galt. Prøv igjen.'; } return; }

    // Send varsel til artisten
    await fetch(`${SB_URL}/rest/v1/notifications`, {
      method:'POST',
      headers:{...sbH(token),'Prefer':'return=minimal'},
      body: JSON.stringify({
        recipient_id: artistId,
        sender_id: uid,
        type: 'label_invite',
        content_id: uid,
        content_name: labelName,
        role: 'artist',
        read: false
      })
    });

    if(status){ status.style.color='#34d399'; status.textContent=`✓ Invitasjon sendt til ${username}.`; }
    document.getElementById('labelInviteUsername').value = '';
    setTimeout(()=>{ window.labelCloseInvite(); renderArtistList(); }, 1500);
  };

  // ── Fjern artist ────────────────────────────────────────────────────────
  window.labelRemoveArtist = async function(artistId, name){
    if(!confirm(`Fjerne ${name} fra labelen?`)) return;
    const token = await getToken();
    const uid   = await getUid();
    await fetch(
      `${SB_URL}/rest/v1/label_artists?label_id=eq.${uid}&artist_id=eq.${artistId}`,
      {method:'DELETE', headers:{...sbH(token),'Prefer':'return=minimal'}}
    );
    if(typeof window.showToast==='function') window.showToast(`✓ ${name} fjernet fra labelen`);
    renderArtistList();
    const detail = document.getElementById('labelArtistPane');
    if(detail) detail.innerHTML = '<div class="label-detail-empty"><div>Velg en artist fra listen</div></div>';
  };

  // ── Pitch for artist ────────────────────────────────────────────────────
  window.labelPitchArtist = function(artistId){
    if(typeof window.showToast==='function') window.showToast('Pitch-funksjon kommer snart');
  };

  // ── Håndter label-invitasjon i varsel-panelet ───────────────────────────
  // Patch openNotifPanel til å vise aksepter/avslå på label_invite-varsler
  const _origOpenNotif = window.openNotifPanel;
  window.openNotifPanel = function(){
    if(_origOpenNotif) _origOpenNotif();
    // Gi litt tid til panelet å rendres, så patcher vi label_invite-varsler
    setTimeout(patchLabelInviteNotifs, 100);
  };

  function patchLabelInviteNotifs(){
    const panel = document.getElementById('mvNotifPanel');
    if(!panel) return;
    const notifs = window._mvNotifications || [];
    notifs.forEach((n, i) => {
      if(n.type !== 'label_invite' || n._patched) return;
      // Finn det i-te notif-kortet
      const cards = panel.querySelectorAll('[style*="padding:12px"]');
      const card = cards[i];
      if(!card) return;
      n._patched = true;
      if(!n.read) {
        const actDiv = document.createElement('div');
        actDiv.style.cssText = 'display:flex;gap:8px;margin-top:8px';
        actDiv.innerHTML = `
          <button onclick="window.labelRespondInvite('${n.content_id}','${n.id}',true)" style="background:rgba(52,211,153,.15);border:1px solid rgba(52,211,153,.3);color:#34d399;font-size:11px;font-weight:800;padding:4px 12px;cursor:pointer;font-family:system-ui">✓ Aksepter</button>
          <button onclick="window.labelRespondInvite('${n.content_id}','${n.id}',false)" style="background:rgba(251,113,133,.1);border:1px solid rgba(251,113,133,.3);color:#fb7185;font-size:11px;font-weight:800;padding:4px 12px;cursor:pointer;font-family:system-ui">✕ Avslå</button>
        `;
        card.appendChild(actDiv);
      }
    });
  }

  window.labelRespondInvite = async function(labelId, notifId, accept){
    const token = await getToken();
    const uid   = await getUid();

    if(accept){
      await fetch(
        `${SB_URL}/rest/v1/label_artists?label_id=eq.${labelId}&artist_id=eq.${uid}`,
        {method:'PATCH', headers:{...sbH(token),'Prefer':'return=minimal'},
         body: JSON.stringify({status:'accepted', accepted_at: new Date().toISOString()})}
      );

      // Del alt artistens innhold med label automatisk
      const [beatsRes, albumsRes, mixtapesRes] = await Promise.all([
        fetch(`${SB_URL}/rest/v1/beats?owner_id=eq.${uid}&archived=eq.false&select=id`, {headers:sbH(token)}),
        fetch(`${SB_URL}/rest/v1/albums?owner_id=eq.${uid}&archived=eq.false&select=id`, {headers:sbH(token)}),
        fetch(`${SB_URL}/rest/v1/mixtapes?owner_id=eq.${uid}&archived=eq.false&select=id`, {headers:sbH(token)})
      ]);
      const beats    = beatsRes.ok    ? await beatsRes.json()    : [];
      const albums   = albumsRes.ok   ? await albumsRes.json()   : [];
      const mixtapes = mixtapesRes.ok ? await mixtapesRes.json() : [];

      const accessRows = [
        ...beats.map(r    => ({content_type:'beat',    content_id:r.id, owner_id:uid, grantee_id:labelId, role:'viewer'})),
        ...albums.map(r   => ({content_type:'album',   content_id:r.id, owner_id:uid, grantee_id:labelId, role:'viewer'})),
        ...mixtapes.map(r => ({content_type:'mixtape', content_id:r.id, owner_id:uid, grantee_id:labelId, role:'viewer'}))
      ];

      if(accessRows.length){
        await fetch(`${SB_URL}/rest/v1/content_access`, {
          method:'POST',
          headers:{...sbH(token),'Prefer':'resolution=merge-duplicates'},
          body: JSON.stringify(accessRows)
        });
      }

      if(typeof window.showToast==='function') window.showToast('✓ Du er nå del av labelen!');
    } else {
      await fetch(
        `${SB_URL}/rest/v1/label_artists?label_id=eq.${labelId}&artist_id=eq.${uid}`,
        {method:'DELETE', headers:{...sbH(token),'Prefer':'return=minimal'}}
      );
      if(typeof window.showToast==='function') window.showToast('Invitasjon avslått.');
    }

    // Slett varselet etter svar
    await fetch(`${SB_URL}/rest/v1/notifications?id=eq.${notifId}&recipient_id=eq.${uid}`,
      {method:'DELETE', headers:{...sbH(token),'Prefer':'return=minimal'}}
    );

    // Oppdater lokal cache og lukk panel
    if(window._mvNotifications){
      window._mvNotifications = window._mvNotifications.filter(n=>n.id!=notifId);
    }
    const panel = document.getElementById('mvNotifPanel');
    if(panel) panel.style.display='none';
    if(typeof window.loadNotifications==='function') window.loadNotifications();

    // Vis "Del av label"-banner for artisten etter aksept
    if(accept) installLabelBanner(labelId);
  };

  // ── Oppdater varsel-typeLabels til å inkludere label_invite ─────────────
  // (label.js lastes etter app.js, så vi patcher direkte)
  const _origOpenNotif2 = window.openNotifPanel;

  // ── Aktivitetsfeed ───────────────────────────────────────────────────────
  window.labelShowFeed = async function(){
    const modal = document.getElementById('labelFeedModal');
    if(modal) modal.style.display = 'flex';
    const feedEl = document.getElementById('labelFeedContent');
    if(!feedEl) return;
    feedEl.innerHTML = '<div class="label-loading">Laster aktivitet...</div>';

    const token = await getToken();
    const uid   = await getUid();

    const laRes = await fetch(`${SB_URL}/rest/v1/label_artists?label_id=eq.${uid}&status=eq.accepted&select=artist_id`, {headers:sbH(token)});
    const laRows = laRes.ok ? await laRes.json() : [];
    const artistIds = laRows.map(r=>r.artist_id);

    if(!artistIds.length){
      feedEl.innerHTML = '<div style="padding:20px;font-size:13px;color:rgba(255,255,255,.3)">Ingen artister i labelen ennå.</div>';
      return;
    }

    const nRes = await fetch(
      `${SB_URL}/rest/v1/notifications?sender_id=in.(${artistIds.join(',')})&order=created_at.desc&limit=50&select=*`,
      {headers:sbH(token)}
    );
    const notifs = nRes.ok ? await nRes.json() : [];

    const typeLabels = {share_beat:'🎵 Ny sang', share_album:'💿 Nytt album', share_mixtape:'📼 Ny mixtape'};

    const senderIds = [...new Set(notifs.map(n=>n.sender_id).filter(Boolean))];
    let senderNames = {};
    if(senderIds.length){
      const pr = await fetch(`${SB_URL}/rest/v1/profiles?id=in.(${senderIds.join(',')})&select=id,username`, {headers:sbH(token)});
      if(pr.ok){ const pd = await pr.json(); pd.forEach(p=>senderNames[p.id]=p.username||p.id); }
    }

    if(!notifs.length){
      feedEl.innerHTML = '<div style="padding:20px;font-size:13px;color:rgba(255,255,255,.3)">Ingen aktivitet ennå.</div>';
      return;
    }

    feedEl.innerHTML = notifs.map(n => {
      const label = typeLabels[n.type] || '📌 Hendelse';
      const who = senderNames[n.sender_id] || 'Artist';
      const when = new Date(n.created_at).toLocaleDateString('no-NO', {day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
      return `<div style="padding:14px 0;border-bottom:1px solid rgba(255,255,255,.06);display:flex;gap:12px;align-items:flex-start">
        <div style="font-size:18px;flex-shrink:0;margin-top:2px">${label.split(' ')[0]}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:700;color:#f4ede4">${label.slice(2)} — ${n.content_name||''}</div>
          <div style="font-size:11px;color:rgba(255,255,255,.4);margin-top:2px">${who} · ${when}</div>
        </div>
      </div>`;
    }).join('');
  };

  // ── Avspilling fra label-tab ─────────────────────────────────────────────
  window.labelPlayBeat = function(beatId){
    if(typeof playSingleBeat === 'function') playSingleBeat(beatId);
    else if(typeof window.showToast==='function') window.showToast('Ingen avspiller tilgjengelig');
  };

  // ── Kommentarer på album ─────────────────────────────────────────────────
  window.labelOpenComments = async function(albumId, albumName, artistId){
    let modal = document.getElementById('labelCommentModal');
    if(!modal){
      modal = document.createElement('div');
      modal.id = 'labelCommentModal';
      modal.style.cssText = 'display:none;position:fixed;inset:0;z-index:9200;background:rgba(0,0,0,.75);align-items:flex-start;justify-content:center;backdrop-filter:blur(4px);padding-top:60px;overflow-y:auto';
      modal.addEventListener('click', e=>{ if(e.target===modal) modal.style.display='none'; });
      document.body.appendChild(modal);
    }
    modal.style.display = 'flex';
    modal.innerHTML = `<div style="background:#1a1612;border:1px solid rgba(255,255,255,.12);width:min(560px,92vw);padding:0 0 24px">
      <div style="display:flex;justify-content:space-between;align-items:center;padding:20px 24px;border-bottom:1px solid rgba(255,255,255,.08)">
        <div>
          <h2 style="font-size:16px;font-weight:800;margin:0">💬 Kommentarer</h2>
          <div style="font-size:12px;color:rgba(255,255,255,.4);margin-top:3px">${albumName}</div>
        </div>
        <button onclick="document.getElementById('labelCommentModal').style.display='none'" style="background:none;border:none;color:rgba(255,255,255,.5);font-size:20px;cursor:pointer;line-height:1">×</button>
      </div>
      <div id="labelCommentList" style="padding:16px 24px;max-height:280px;overflow-y:auto">
        <div class="label-loading">Laster...</div>
      </div>
      <div style="padding:0 24px">
        <textarea id="labelCommentText" placeholder="Skriv en tilbakemelding..." rows="3"
          style="width:100%;box-sizing:border-box;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:#f4ede4;padding:10px 12px;font-size:13px;font-family:Georgia,serif;outline:none;resize:vertical;margin-bottom:8px"></textarea>
        <button onclick="window.labelSubmitComment('${albumId}','${artistId}')" style="background:#f4a443;border:none;color:#000;font-size:12px;font-weight:800;padding:9px 20px;cursor:pointer;font-family:system-ui;letter-spacing:.06em;text-transform:uppercase">Send</button>
        <div id="labelCommentStatus" style="font-size:11px;color:rgba(255,255,255,.4);margin-top:8px;min-height:14px"></div>
      </div>
    </div>`;
    loadLabelComments(albumId);
  };

  async function loadLabelComments(albumId){
    const el = document.getElementById('labelCommentList');
    if(!el) return;
    const token = await getToken();
    const res = await fetch(`${SB_URL}/rest/v1/pitch_comments?album_id=eq.${albumId}&order=created_at.asc&select=*`, {headers:sbH(token)});
    const comments = res.ok ? await res.json() : [];
    if(!comments.length){ el.innerHTML = '<div style="font-size:12px;color:rgba(255,255,255,.3)">Ingen kommentarer ennå.</div>'; return; }
    el.innerHTML = comments.map(c=>`
      <div style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,.06)">
        <div style="display:flex;gap:8px;margin-bottom:4px">
          <span style="font-size:12px;font-weight:800;color:#f4a443">${c.author||'Anonym'}</span>
          <span style="font-size:10px;color:rgba(255,255,255,.3)">${new Date(c.created_at).toLocaleDateString('no-NO')}</span>
        </div>
        <div style="font-size:13px;color:rgba(255,255,255,.7);line-height:1.5;white-space:pre-wrap">${c.comment||''}</div>
      </div>`).join('');
    el.scrollTop = el.scrollHeight;
  }

  window.labelSubmitComment = async function(albumId, artistId){
    const text = document.getElementById('labelCommentText')?.value?.trim();
    const status = document.getElementById('labelCommentStatus');
    if(!text){ if(status) status.textContent='Skriv en kommentar'; return; }
    const token = await getToken();
    const uid   = await getUid();
    const prRes = await fetch(`${SB_URL}/rest/v1/profiles?id=eq.${uid}&select=username`, {headers:sbH(token)});
    const prData = prRes.ok ? await prRes.json() : [];
    const author = prData[0]?.username || 'Label';
    await fetch(`${SB_URL}/rest/v1/pitch_comments`, {
      method:'POST', headers:{...sbH(token),'Prefer':'return=minimal'},
      body: JSON.stringify({album_id:albumId, author, comment:text, created_at:new Date().toISOString()})
    });
    await fetch(`${SB_URL}/rest/v1/notifications`, {
      method:'POST', headers:{...sbH(token),'Prefer':'return=minimal'},
      body: JSON.stringify({recipient_id:artistId, sender_id:uid, type:'label_comment', content_id:albumId, content_name:author, role:'label', read:false})
    });
    document.getElementById('labelCommentText').value = '';
    if(status){ status.style.color='#34d399'; status.textContent='✓ Sendt'; setTimeout(()=>status.textContent='',2000); }
    loadLabelComments(albumId);
  };

  // ── Label-tilhørighet for artister ──────────────────────────────────────
  async function installLabelBanner(labelId){
    // Ikke vis banner — bruk gear-menyen istedenfor
    const token = await getToken();
    const res = await fetch(`${SB_URL}/rest/v1/profiles?id=eq.${labelId}&select=username`, {headers:sbH(token)});
    const data = res.ok ? await res.json() : [];
    const labelName = data[0]?.username || 'Et label';

    // Cache for gear-menyen
    window._mvCurrentLabelId   = labelId;
    window._mvCurrentLabelName = labelName;

    // Oppdater gear-meny
    if(typeof window.mvUpdateGearMenu === 'function') window.mvUpdateGearMenu(labelId, labelName);
    else setTimeout(()=>{ if(typeof window.mvUpdateGearMenu==='function') window.mvUpdateGearMenu(labelId, labelName); }, 1000);
  }

  window.leaveLabel = async function(labelId, labelName){
    if(!confirm(`Forlate ${labelName}?\n\nLabelen vil beholde visningstilgang til innholdet ditt i 14 dager.`)) return;

    const token = await getToken();
    const uid   = await getUid();
    const expiresAt = new Date(Date.now() + 14*24*60*60*1000).toISOString();

    // Oppdater label_artists
    await fetch(
      `${SB_URL}/rest/v1/label_artists?label_id=eq.${labelId}&artist_id=eq.${uid}`,
      {method:'PATCH', headers:{...sbH(token),'Prefer':'return=minimal'},
       body: JSON.stringify({
         status: 'left',
         ended_at: new Date().toISOString(),
         access_expires_at: expiresAt
       })
      }
    );

    // Send varsel til label
    const prRes = await fetch(`${SB_URL}/rest/v1/profiles?id=eq.${uid}&select=username`, {headers:sbH(token)});
    const prData = prRes.ok ? await prRes.json() : [];
    const artistName = prData[0]?.username || 'En artist';

    await fetch(`${SB_URL}/rest/v1/notifications`, {
      method:'POST',
      headers:{...sbH(token),'Prefer':'return=minimal'},
      body: JSON.stringify({
        recipient_id: labelId,
        sender_id: uid,
        type: 'label_left',
        content_id: uid,
        content_name: artistName,
        role: 'artist',
        read: false
      })
    });

    // Fjern "Forlat label" fra gear-menyen
    const item = document.getElementById('mvGearLabelItem');
    if(item) item.style.display = 'none';
    window._mvCurrentLabelId = null;
    window._mvCurrentLabelName = null;
    if(typeof window.showToast==='function') window.showToast(`Du har forlatt ${labelName}. De beholder visningstilgang i 14 dager.`);
  };

  // Sjekk om bruker allerede er i et label ved innlogging
  async function checkExistingLabelMembership(){
    const uid = await getUid();
    if(!uid) return;
    const pkg = sessionStorage.getItem('mv_package');
    if(pkg === 'label') return; // label-bruker trenger ikke banner

    const token = await getToken();
    const res = await fetch(
      `${SB_URL}/rest/v1/label_artists?artist_id=eq.${uid}&status=eq.accepted&select=label_id`,
      {headers:sbH(token)}
    );
    if(!res.ok) return;
    const rows = await res.json();
    if(rows.length) installLabelBanner(rows[0].label_id);
  }

  // ── Installer når label-tab åpnes ───────────────────────────────────────
  document.addEventListener('click', e => {
    if(e.target.closest('.tab-btn[data-tab="label"]')){
      setTimeout(renderArtistList, 80);
    }
  });

  // ── Installer ved oppstart ──────────────────────────────────────────────
  function tryInstall(){
    const pkg = sessionStorage.getItem('mv_package');
    if(pkg === 'label' || pkg === 'admin'){
      installLabelTab();
    }
  }

  if(document.readyState !== 'loading') setTimeout(tryInstall, 600);
  else document.addEventListener('DOMContentLoaded', ()=>setTimeout(tryInstall, 600));

  // Sjekk eksisterende label-medlemskap for artister
  setTimeout(checkExistingLabelMembership, 1500);

  // Eksponér for å trigges etter innlogging
  window.installLabelDashboard = installLabelTab;
  window.labelRenderArtistList = renderArtistList;

})();
