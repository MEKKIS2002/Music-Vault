// === label.js ===
// Label dashboard — sidebar + detaljpanel (Versjon C)
// Kun synlig for brukere med package = 'label'

(function(){
  'use strict';

  const SB_URL = window.MV_CONFIG.SUPABASE_URL;
  const SB_KEY = window.MV_CONFIG.SUPABASE_ANON_KEY;

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
    return `<div class="app"><div class="label-dashboard lbl-v2">
      <div class="label-topbar">
        <div class="lbl-top-actions">
          <button class="ghost-btn label-invite-btn" onclick="window.labelShowOverview()" id="labelOverviewBtn">← Oversikt</button>
        </div>
      </div>

      <!-- Skjult kompatibilitet: renderArtistList() skriver hit; oversikten viser egen artistliste -->
      <div id="labelArtistList" hidden></div>

      <div class="label-detail" id="labelDetail">
        <div id="labelOverviewPane">
          <div id="labelOverviewContent"><div class="label-loading">Laster oversikt...</div></div>
        </div>
        <div id="labelArtistPane" style="display:none"></div>
      </div>
    </div>

    <!-- Activity feed modal -->
    <div id="labelFeedModal" style="display:none;position:fixed;inset:0;z-index:9100;background:rgb(var(--shade-rgb) / .75);align-items:flex-start;justify-content:center;backdrop-filter:blur(4px);padding-top:60px;overflow-y:auto">
      <div style="background:var(--surface-1);border:1px solid rgb(var(--ink-rgb) / .12);width:min(600px,92vw);padding:0 0 24px">
        <div style="display:flex;justify-content:space-between;align-items:center;padding:20px 24px;border-bottom:1px solid rgb(var(--ink-rgb) / .08)">
          <h2 style="font-size:16px;font-weight:800;margin:0"><span class="ic ic-clipboard" aria-hidden="true"></span> Aktivitetsfeed</h2>
          <button onclick="document.getElementById('labelFeedModal').style.display='none'" style="background:none;border:none;color:rgb(var(--ink-rgb) / calc(.5 + (1 - .5) * var(--ink-boost)));font-size:20px;cursor:pointer;line-height:1">×</button>
        </div>
        <div id="labelFeedContent" style="padding:0 24px"></div>
      </div>
    </div>

    <!-- Invite modal -->
    <div id="labelInviteModal" style="display:none;position:fixed;inset:0;z-index:9100;background:rgb(var(--shade-rgb) / .75);align-items:center;justify-content:center;backdrop-filter:blur(4px)">
      <div style="background:var(--surface-1);border:1px solid rgb(var(--ink-rgb) / .12);max-width:400px;width:90%;padding:28px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
          <h2 style="font-size:16px;font-weight:800;margin:0">Inviter artist</h2>
          <button onclick="window.labelCloseInvite()" style="background:none;border:none;color:rgb(var(--ink-rgb) / calc(.5 + (1 - .5) * var(--ink-boost)));font-size:20px;cursor:pointer;line-height:1">×</button>
        </div>
        <input id="labelInviteUsername" placeholder="Brukernavn"
          style="width:100%;box-sizing:border-box;background:rgb(var(--ink-rgb) / .06);border:none;border-bottom:2px solid rgb(var(--accent-rgb) / .3);color:var(--text);padding:10px 12px;font-size:14px;font-family:system-ui;outline:none;margin-bottom:12px"
          onfocus="this.style.borderBottomColor='rgba(214,129,85,.8)'"
          onblur="this.style.borderBottomColor='rgba(214,129,85,.3)'"
        />
        <button onclick="window.labelSendInvite()" style="width:100%;background:linear-gradient(135deg,var(--accent),var(--accent-deep));border:none;color:#000;font-size:14px;font-weight:900;padding:12px;cursor:pointer;font-family:system-ui;letter-spacing:.06em;text-transform:uppercase">Send invitasjon</button>
        <div id="labelInviteStatus" style="font-size:12px;text-align:center;margin-top:10px;min-height:16px;font-family:system-ui;color:rgb(var(--ink-rgb) / calc(.5 + (1 - .5) * var(--ink-boost)))"></div>
      </div>
    </div></div>`;
  }

  function installLabelStyles(){
    if(document.getElementById('label-css')) return;
    const s = document.createElement('style');
    s.id = 'label-css';
    s.textContent = `
.label-dashboard { display:flex;flex-direction:column;min-height:600px;font-family:system-ui }
.label-topbar { display:flex;align-items:center;justify-content:space-between;padding:14px 20px;border-bottom:1px solid rgb(var(--ink-rgb) / .08) }
.label-topbar-left { display:flex;align-items:center;gap:10px }
.label-icon { font-size:18px }
.label-title { font-size:16px;font-weight:800;color:var(--text);letter-spacing:-.02em }
.label-invite-btn { font-size:12px !important;padding:7px 14px !important }
.label-body { display:flex;flex:1;min-height:0 }

/* Sidebar */
.label-sidebar { width:210px;flex-shrink:0;border-right:1px solid rgb(var(--ink-rgb) / .08);overflow-y:auto }
.label-sidebar-hd { font-size:10px;font-weight:800;letter-spacing:.15em;text-transform:uppercase;color:rgb(var(--ink-rgb) / calc(.35 + (1 - .35) * var(--ink-boost)));padding:8px 16px 6px }
.label-artist-row { display:flex;align-items:center;gap:10px;padding:9px 14px;cursor:pointer;transition:background .12s;border-left:3px solid transparent }
.label-artist-row:hover { background:rgb(var(--ink-rgb) / .04) }
.label-artist-row.active { background:rgb(var(--accent-rgb) / .08);border-left-color:var(--accent) }
.label-avatar { width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;flex-shrink:0 }
.label-artist-name { font-size:13px;font-weight:700;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis }
.label-artist-sub { font-size:10px;color:rgb(var(--ink-rgb) / calc(.4 + (1 - .4) * var(--ink-boost))) }
.label-pending-row { display:flex;align-items:center;gap:10px;padding:9px 16px;opacity:.5 }

/* Detail pane */
.label-detail { flex:1;min-width:0;overflow-y:auto;padding:20px }
.label-detail-empty { display:flex;flex-direction:column;align-items:center;justify-content:center;height:300px;color:rgb(var(--ink-rgb) / calc(.3 + (1 - .3) * var(--ink-boost)));font-size:13px;text-align:center }
.label-detail-header { display:flex;align-items:center;gap:14px;margin-bottom:20px;padding-bottom:16px;border-bottom:1px solid rgb(var(--ink-rgb) / .08) }
.label-detail-avatar { width:52px;height:52px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:800;flex-shrink:0 }
.label-detail-name { font-size:18px;font-weight:900;color:var(--text);letter-spacing:-.03em;margin-bottom:2px }
.label-detail-meta { font-size:12px;color:rgb(var(--ink-rgb) / calc(.4 + (1 - .4) * var(--ink-boost))) }
.label-stats { display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:20px }
.label-stat { background:rgb(var(--ink-rgb) / .04);border:1px solid rgb(var(--ink-rgb) / .06);padding:12px;text-align:center }
.label-stat-n { font-size:22px;font-weight:900;color:var(--text);letter-spacing:-.04em;line-height:1 }
.label-stat-l { font-size:10px;color:rgb(var(--ink-rgb) / calc(.4 + (1 - .4) * var(--ink-boost)));margin-top:3px;text-transform:uppercase;letter-spacing:.1em }
.label-section-hd { font-size:10px;font-weight:800;letter-spacing:.15em;text-transform:uppercase;color:rgb(var(--ink-rgb) / calc(.35 + (1 - .35) * var(--ink-boost)));margin-bottom:10px }
.label-album-row { display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid rgb(var(--ink-rgb) / .05) }
.label-album-row:last-child { border-bottom:none }
.label-album-cover { width:38px;height:38px;flex-shrink:0;background:rgb(var(--ink-rgb) / .06);border:1px solid rgb(var(--ink-rgb) / .08);display:flex;align-items:center;justify-content:center;font-size:16px;overflow:hidden }
.label-album-name { font-size:13px;font-weight:700;color:var(--text);flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis }
.label-album-meta { font-size:11px;color:rgb(var(--ink-rgb) / calc(.4 + (1 - .4) * var(--ink-boost)));margin-top:1px }
.label-progress { height:3px;background:rgb(var(--ink-rgb) / .1);overflow:hidden;min-width:60px }
.label-progress-fill { height:100%;background:var(--accent) }
.label-badge { display:inline-block;font-size:10px;font-weight:800;padding:2px 7px;letter-spacing:.04em }
.badge-master { background:rgb(var(--accent-rgb) / .15);color:var(--accent-ink) }
.badge-ferdig { background:rgb(var(--ok-rgb) / .15);color:var(--ok) }
.badge-skriving { background:rgb(var(--muted-rgb) / .15);color:var(--muted) }
.badge-ide { background:rgb(var(--accent-rgb) / .15);color:var(--accent2) }
.badge-mixing { background:rgb(var(--accent-rgb) / .15);color:var(--accent-ink) }
.label-loading { padding:20px 16px;font-size:12px;color:rgb(var(--ink-rgb) / calc(.4 + (1 - .4) * var(--ink-boost)));text-align:center }
.label-empty { padding:20px 16px;font-size:12px;color:rgb(var(--ink-rgb) / calc(.4 + (1 - .4) * var(--ink-boost)));text-align:center }

/* Oversiktskort */
.lov-grid { display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:24px }
.lov-card { background:rgb(var(--ink-rgb) / .04);border:1px solid rgb(var(--ink-rgb) / .07);padding:16px;text-align:center }
.lov-n { font-size:28px;font-weight:900;color:var(--text);letter-spacing:-.06em;line-height:1 }
.lov-l { font-size:10px;color:rgb(var(--ink-rgb) / calc(.4 + (1 - .4) * var(--ink-boost)));text-transform:uppercase;letter-spacing:.12em;margin-top:4px }
.lov-artist-grid { display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px }
.lov-artist-card { background:rgb(var(--ink-rgb) / .04);border:1px solid rgb(var(--ink-rgb) / .07);padding:16px;cursor:pointer;transition:all .15s }
.lov-artist-card:hover { background:rgb(var(--ink-rgb) / .07);border-color:rgb(var(--accent-rgb) / .3) }
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

  // ── Oversikt (Label v2): hode med tall, utgivelser, kommende, artister ────
  const LBL_STATUSES = ['Idé','Skriving','Innspilling','Mixing','Master','Ferdig'];
  function lblEsc(v){ return String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
  function lblJs(v){ const B=String.fromCharCode(92); return lblEsc(String(v==null?'':v).split(B).join(B+B).split("'").join(B+"'")); }
  function lblDate(d){ return d ? new Date(d+'T00:00:00').toLocaleDateString('no-NO',{day:'numeric',month:'short',year:'numeric'}) : ''; }
  function lblStatusClass(st){ return st==='Ferdig'||st==='Master' ? 'is-done' : (st==='Idé' ? 'is-idea' : 'is-working'); }
  function lblCover(r, size){
    return r.cover ? `<img src="${lblEsc(r.cover)}" alt="" loading="lazy">` : `<span class="lbl-cover-ph"><span class="ic ic-disc" aria-hidden="true"></span></span>`;
  }

  async function renderOverview(artists){
    const el = document.getElementById('labelOverviewContent');
    if(!el) return;

    const token = await getToken();
    const uid   = await getUid();
    const accepted = artists.filter(a=>a.status==='accepted');
    const pending  = artists.filter(a=>a.status==='invited'||a.status==='pending');
    const left     = artists.filter(a=>a.status==='left' && a.access_expires_at && new Date(a.access_expires_at) > new Date());

    const artistIds = accepted.map(a=>a.artist_id).filter(Boolean);
    let albums=[], labData=[], albumBeats=[];
    if(artistIds.length){
      const [ar, lr] = await Promise.all([
        fetch(`${SB_URL}/rest/v1/albums?owner_id=in.(${artistIds.join(',')})&archived=eq.false&select=*`,{headers:sbH(token)}),
        fetch(`${SB_URL}/rest/v1/label_album_data?label_id=eq.${uid}&select=*`,{headers:sbH(token)})
      ]);
      albums  = ar.ok ? await ar.json() : [];
      labData = lr.ok ? await lr.json() : [];
      if(albums.length){
        const abr = await fetch(`${SB_URL}/rest/v1/album_beats?album_id=in.(${albums.map(a=>a.id).join(',')})&select=album_id,beat_id`,{headers:sbH(token)});
        albumBeats = abr.ok ? await abr.json() : [];
      }
    }
    const labMap = {}; labData.forEach(r=>{ labMap[r.album_id]=r; });
    const countMap = {}; albumBeats.forEach(r=>{ countMap[r.album_id]=(countMap[r.album_id]||0)+1; });
    const nameOf = id => { const a=accepted.find(x=>x.artist_id===id); return a?.profile?.username || (id||'').slice(0,8) || 'Ukjent'; };
    const today = new Date().toISOString().slice(0,10);

    const releases = albums.map(a=>{
      const meta=a.metadata||{}; const lab=labMap[a.id]||{};
      return { id:a.id, artistId:a.owner_id, artist:nameOf(a.owner_id), title:a.title||meta.name||'Uten tittel',
        cover:meta.cover||'', status:meta.status||a.status||'Idé', tracks:countMap[a.id]||(meta.beatIds||[]).length||0,
        release:lab.release_date||'', priority:!!lab.priority, created:a.created_at||'' };
    });
    window._lblReleases = releases;
    const upcoming = releases.filter(r=>r.release && r.release>=today).sort((x,y)=>x.release.localeCompare(y.release));
    const next = upcoming[0] || null;

    const prof = window._labelProfileData || {};
    const labelName = window._labelDisplayName || 'Ditt label';
    const heroCover = prof.cover || '';

    const artistRows = accepted.map((a,i)=>{
      const nm = a.profile?.username || a.artist_id?.slice(0,8) || '?';
      const col = avatarColor(i);
      const n = releases.filter(r=>r.artistId===a.artist_id).length;
      return `<button class="label-artist-row lbl-artist" data-id="${lblEsc(a.artist_id)}" data-name="${lblEsc(nm)}" onclick="window.labelSelectArtist('${lblEsc(a.artist_id)}')">
        <span class="label-avatar" style="background:${col.bg};color:${col.color}">${lblEsc(nm.slice(0,2).toUpperCase())}</span>
        <span class="lbl-artist-main"><span class="label-artist-name">${lblEsc(nm)}</span><span class="label-artist-sub">${n} ${n===1?'utgivelse':'utgivelser'}</span></span>
        <span class="lbl-chev" aria-hidden="true">›</span>
      </button>`;
    }).join('');
    const pendingRows = pending.map(a=>{ const nm=a.profile?.username||'Ukjent';
      return `<div class="label-pending-row lbl-artist is-pending" data-name="${lblEsc(nm)}"><span class="label-avatar">?</span><span class="lbl-artist-main"><span class="label-artist-name">${lblEsc(nm)}</span><span class="label-artist-sub">Invitert – venter på svar</span></span></div>`; }).join('');
    const leftRows = left.map(a=>{ const nm=a.profile?.username||'Ukjent'; const d=Math.ceil((new Date(a.access_expires_at)-new Date())/864e5);
      return `<div class="label-pending-row lbl-artist is-left" data-name="${lblEsc(nm)}"><span class="label-avatar">✕</span><span class="lbl-artist-main"><span class="label-artist-name">${lblEsc(nm)}</span><span class="label-artist-sub">Forlot labelen · ${d}d tilgang igjen</span></span></div>`; }).join('');

    el.innerHTML = `
      <section class="lbl-hero">
        <button class="lbl-hero-cover" onclick="window.labelOpenProfileEdit()" title="Endre bilde og navn" aria-label="Endre labelbilde">${heroCover ? `<img src="${lblEsc(heroCover)}" alt="">` : ''}<span class="lbl-hero-mark">${lblEsc(labelName)}</span><span class="lbl-cover-edit"><span class="ic ic-image" aria-hidden="true"></span> Endre bilde</span></button>
        <div class="lbl-hero-info">
          <p class="mv-eyebrow">Label</p>
          <h2 class="lbl-hero-name">${lblEsc(labelName)}</h2>
          <p class="lbl-hero-sub">${prof.bio ? lblEsc(prof.bio) : (accepted.length ? 'Utgivelser og status for artistene på labelen.' : 'Inviter artister for å følge utgivelsene deres her.')}</p>
          <div class="lbl-stats">
            <div class="lbl-stat"><span class="ic ic-disc" aria-hidden="true"></span><div><b>${releases.length}</b><span>Utgivelser</span></div></div>
            <div class="lbl-stat"><span class="ic ic-user" aria-hidden="true"></span><div><b>${accepted.length}</b><span>Artister</span></div></div>
            <div class="lbl-stat"><span class="ic ic-calendar" aria-hidden="true"></span><div><b>${upcoming.length}</b><span>Kommende</span></div></div>
          </div>
          <div class="lbl-hero-actions">
            <button class="primary-btn" onclick="window.labelOpenInvite()"><span class="ic ic-plus" aria-hidden="true"></span> Inviter artist</button>
            <button class="ghost-btn" onclick="window.labelShowFeed()"><span class="ic ic-clipboard" aria-hidden="true"></span> Aktivitet</button>
            <button class="ghost-btn" onclick="window.labelOpenProfileEdit()"><span class="ic ic-pen" aria-hidden="true"></span> Rediger profil</button>
          </div>
        </div>
      </section>

      <div class="lbl-grid">
        <section class="lbl-panel lbl-releases">
          <div class="lbl-panel-hd">
            <h3 class="lbl-panel-title">Utgivelser</h3>
            <div class="lbl-filters">
              <select id="lblStatusFilter" aria-label="Filtrer på status" onchange="window.labelRenderReleases()">
                <option value="">Alle statuser</option>${LBL_STATUSES.map(s=>`<option value="${s}">${s}</option>`).join('')}
              </select>
              <select id="lblSort" aria-label="Sorter utgivelser" onchange="window.labelRenderReleases()">
                <option value="new">Nyeste først</option><option value="release">Release-dato</option><option value="az">A–Å</option>
              </select>
            </div>
          </div>
          <div id="lblReleaseList" class="lbl-release-list"></div>
        </section>

        <div class="lbl-side">
          <section class="lbl-panel lbl-next">
            <h3 class="lbl-panel-title">Kommende utgivelse</h3>
            ${next ? `<div class="lbl-next-body">
                <div class="lbl-next-cover">${lblCover(next)}</div>
                <div class="lbl-next-info">
                  <div class="lbl-next-top"><b class="lbl-next-title">${lblEsc(next.title)}</b><span class="badge-kommende">Kommende</span></div>
                  <span class="lbl-next-artist">${lblEsc(next.artist)}</span>
                  <span class="lbl-next-meta"><span class="ic ic-calendar" aria-hidden="true"></span> Planlagt: ${lblDate(next.release)}</span>
                  <span class="lbl-next-meta"><span class="ic ic-disc" aria-hidden="true"></span> Album · ${next.tracks} spor</span>
                  <button class="ghost-btn lbl-next-open" onclick="window.labelSelectArtist('${lblEsc(next.artistId)}')">Åpne artist</button>
                </div>
              </div>`
            : `<p class="lbl-muted">Ingen planlagt utgivelse. Sett en release-dato på et album hos en artist.</p>`}
          </section>

          <section class="lbl-panel lbl-artists">
            <div class="lbl-panel-hd"><h3 class="lbl-panel-title">Artister</h3><button class="lbl-icon-btn" onclick="window.labelOpenInvite()" title="Inviter artist" aria-label="Inviter artist"><span class="ic ic-plus" aria-hidden="true"></span></button></div>
            ${accepted.length>4 ? `<label class="lbl-search"><span class="ic ic-search" aria-hidden="true"></span><input id="labelArtistSearch" type="search" placeholder="Søk artist" aria-label="Søk artist" oninput="window.labelFilterArtists(this.value)"></label>` : ''}
            <div class="lbl-artist-list">${artistRows || '<p class="lbl-muted">Ingen artister ennå — inviter din første artist.</p>'}${pendingRows}${leftRows}</div>
          </section>
        </div>
      </div>`;
    window.labelRenderReleases();
  }

  window.labelRenderReleases = function(){
    const list = document.getElementById('lblReleaseList'); if(!list) return;
    const st = document.getElementById('lblStatusFilter')?.value || '';
    const sort = document.getElementById('lblSort')?.value || 'new';
    let rows = (window._lblReleases||[]).filter(r=>!st || r.status===st);
    rows = rows.slice().sort((a,b)=> sort==='az' ? a.title.localeCompare(b.title,'nb')
      : sort==='release' ? ((a.release||'9999').localeCompare(b.release||'9999'))
      : String(b.created).localeCompare(String(a.created)));
    if(!rows.length){ list.innerHTML = `<p class="lbl-muted">${(window._lblReleases||[]).length ? 'Ingen utgivelser med denne statusen.' : 'Ingen utgivelser ennå. Album fra artistene dine dukker opp her.'}</p>`; return; }
    list.innerHTML = rows.map(r=>`
      <div class="lbl-release" onclick="window.labelSelectArtist('${lblEsc(r.artistId)}')" role="button" tabindex="0" onkeydown="if(event.key==='Enter'){window.labelSelectArtist('${lblEsc(r.artistId)}')}">
        <span class="lbl-rel-cover">${lblCover(r)}</span>
        <span class="lbl-rel-main"><b>${lblEsc(r.title)}${r.priority?' <span class="lbl-prio" title="Prioritert"><span class="ic ic-flame" aria-hidden="true"></span></span>':''}</b><span>${lblEsc(r.artist)}</span></span>
        <span class="lbl-status ${lblStatusClass(r.status)}">${lblEsc(r.status)}</span>
        <span class="lbl-rel-type">Album · ${r.tracks} spor</span>
        <span class="lbl-rel-date">${r.release ? lblDate(r.release) : '–'}</span>
        <button class="lbl-icon-btn" onclick="event.stopPropagation();window.labelOpenComments('${lblEsc(r.id)}','${lblJs(r.title)}','${lblEsc(r.artistId)}')" title="Kommentarer" aria-label="Kommentarer til ${lblEsc(r.title)}"><span class="ic ic-chat" aria-hidden="true"></span></button>
      </div>`).join('');
  };

  // ── Rediger labelprofil (navn, beskrivelse, bilde) ─────────────────────────
  // Lagres i label_profiles (id = label-brukerens id). Bildet skaleres ned til
  // maks 600 px JPEG i nettleseren og lagres som data-URL i «cover».
  function lblResizeImage(file, max){
    return new Promise((res, rej)=>{
      const r = new FileReader();
      r.onerror = ()=>rej(new Error('Kunne ikke lese bildet'));
      r.onload = ()=>{ const img = new Image(); img.onerror = ()=>rej(new Error('Ugyldig bilde'));
        img.onload = ()=>{ const s = Math.min(1, max/Math.max(img.width, img.height)); const c = document.createElement('canvas');
          c.width = Math.round(img.width*s); c.height = Math.round(img.height*s); c.getContext('2d').drawImage(img,0,0,c.width,c.height);
          res(c.toDataURL('image/jpeg', .85)); };
        img.src = r.result; };
      r.readAsDataURL(file);
    });
  }
  window.labelOpenProfileEdit = function(){
    const p = window._labelProfileData || {name:'',bio:'',cover:''};
    let m = document.getElementById('lblProfileModal');
    if(!m){ m = document.createElement('div'); m.id = 'lblProfileModal'; m.className = 'lbl-modal'; document.body.appendChild(m);
      m.addEventListener('click', e=>{ if(e.target===m) window.labelCloseProfileEdit(); });
      document.addEventListener('keydown', e=>{ if(e.key==='Escape' && m.classList.contains('open')) window.labelCloseProfileEdit(); }); }
    m.dataset.cover = p.cover || '';
    m.innerHTML = `<div class="lbl-modal-card" role="dialog" aria-modal="true" aria-labelledby="lblProfileTitle">
        <div class="lbl-modal-hd"><h2 id="lblProfileTitle">Rediger label</h2><button class="lbl-icon-btn" onclick="window.labelCloseProfileEdit()" aria-label="Lukk">✕</button></div>
        <div class="lbl-profile-form">
          <div class="lbl-profile-pic">
            <div class="lbl-profile-preview" id="lblProfilePreview">${p.cover?`<img src="${lblEsc(p.cover)}" alt="">`:`<span>${lblEsc((window._labelDisplayName||'?').slice(0,2).toUpperCase())}</span>`}</div>
            <label class="ghost-btn lbl-pic-btn"><span class="ic ic-image" aria-hidden="true"></span> Velg bilde<input type="file" accept="image/*" hidden onchange="window.labelPickProfileImage(this)"></label>
            <button class="lbl-link-btn" type="button" onclick="window.labelPickProfileImage(null)">Fjern bilde</button>
          </div>
          <label class="lbl-field">Navn på labelet<input id="lblProfileName" type="text" maxlength="60" value="${lblEsc(p.name||window._labelDisplayName||'')}" placeholder="F.eks. Soul Peak Records"></label>
          <label class="lbl-field">Beskrivelse<textarea id="lblProfileBio" rows="3" maxlength="240" placeholder="Kort om labelet — sjanger, lyd og retning">${lblEsc(p.bio||'')}</textarea></label>
          <div class="lbl-modal-actions"><span id="lblProfileStatus" class="lbl-muted"></span><button class="ghost-btn" onclick="window.labelCloseProfileEdit()">Avbryt</button><button class="primary-btn" onclick="window.labelSaveProfile()">Lagre</button></div>
        </div>
      </div>`;
    m.classList.add('open');
    setTimeout(()=>document.getElementById('lblProfileName')?.focus(), 30);
  };
  window.labelCloseProfileEdit = function(){ document.getElementById('lblProfileModal')?.classList.remove('open'); };
  window.labelPickProfileImage = async function(input){
    const m = document.getElementById('lblProfileModal'); const prev = document.getElementById('lblProfilePreview'); if(!m||!prev) return;
    if(!input){ m.dataset.cover=''; prev.innerHTML = `<span>${lblEsc((window._labelDisplayName||'?').slice(0,2).toUpperCase())}</span>`; return; }
    const f = input.files && input.files[0]; if(!f) return;
    try{ const url = await lblResizeImage(f, 600); m.dataset.cover = url; prev.innerHTML = `<img src="${url}" alt="">`; }
    catch(e){ const s=document.getElementById('lblProfileStatus'); if(s) s.textContent = e.message; }
  };
  window.labelSaveProfile = async function(){
    const m = document.getElementById('lblProfileModal'); const st = document.getElementById('lblProfileStatus');
    const name = (document.getElementById('lblProfileName')?.value||'').trim();
    const bio  = (document.getElementById('lblProfileBio')?.value||'').trim();
    const cover = m?.dataset.cover || null;
    if(!name){ if(st) st.textContent = 'Labelet trenger et navn.'; return; }
    if(st) st.textContent = 'Lagrer…';
    try{
      const token = await getToken(); const uid = await getUid();
      const r = await fetch(`${SB_URL}/rest/v1/label_profiles?on_conflict=id`, { method:'POST',
        headers:{...sbH(token),'Prefer':'resolution=merge-duplicates,return=minimal'},
        body: JSON.stringify({ id:uid, name, bio:bio||null, cover }) });
      if(!r.ok) throw new Error('HTTP '+r.status);
      window._labelProfileData = { name, bio, cover:cover||'' }; window._labelDisplayName = name;
      window._mvCurrentLabelName = name;
      window.labelCloseProfileEdit();
      if(typeof window.showToast==='function') window.showToast('Labelprofilen er lagret');
      renderOverview(window._labelArtists||[]);
    }catch(e){ if(st) st.textContent = 'Kunne ikke lagre ('+e.message+').'; }
  };

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
    {bg:'rgba(214,129,85,.18)',color:'#d68155'},
    {bg:'rgba(191,178,166,.18)',color:'#bfb2a6'},
    {bg:'rgba(166,190,139,.18)',color:'#a6be8b'},
    {bg:'rgba(214,129,85,.18)',color:'#f0a579'},
    {bg:'rgba(214,129,85,.18)',color:'#d68155'},
  ];

  function avatarColor(i){ return AVATAR_COLORS[i % AVATAR_COLORS.length]; }

  async function renderArtistList(){
    const list = document.getElementById('labelArtistList');
    if(!list) return;
    list.innerHTML = '<div class="label-loading">Laster artister...</div>';

    const artists = await loadArtists();
    window._labelArtists = artists;

    // Hent labelprofil (navn, beskrivelse, bilde). Uten eget navn: bruk brukernavnet.
    const uid = await getUid();
    const token = await getToken();
    window._labelProfileData = { name:'', bio:'', cover:'' };
    try{
      const lpRes = await fetch(`${SB_URL}/rest/v1/label_profiles?id=eq.${uid}&select=name,bio,cover`, {headers:sbH(token)});
      const lp = lpRes.ok ? await lpRes.json() : [];
      if(lp[0]) window._labelProfileData = { name:lp[0].name||'', bio:lp[0].bio||'', cover:lp[0].cover||'' };
    }catch(e){}
    window._labelDisplayName = window._labelProfileData.name;
    if(!window._labelDisplayName){
      try{
        const pRes = await fetch(`${SB_URL}/rest/v1/profiles?id=eq.${uid}&select=username`, {headers:sbH(token)});
        const pd = pRes.ok ? await pRes.json() : [];
        if(pd[0]?.username) window._labelDisplayName = pd[0].username;
      }catch(e){}
    }

    if(!artists.length){
      list.innerHTML = '<div class="label-empty">Ingen artister ennå.<br>Inviter din første artist.</div>';
      renderOverview(artists);
      window.labelShowOverview();
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
          <div class="label-avatar" style="background:rgb(var(--ink-rgb) / .06);color:rgb(var(--ink-rgb) / calc(.4 + (1 - .4) * var(--ink-boost)))">?</div>
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
          <div class="label-avatar" style="background:rgb(var(--danger-rgb) / .1);color:rgb(var(--danger-rgb) / .5)">✕</div>
          <div style="min-width:0">
            <div class="label-artist-name">${name}</div>
            <div class="label-artist-sub" style="color:rgb(var(--danger-rgb) / .5)">${daysLeft}d tilgang igjen</div>
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

    const STATUSES = ['Idé','Skriving','Innspilling','Mixing','Master','Ferdig'];
    const fmtDur = sec => sec>0 ? Math.floor(sec/60)+':'+String(Math.floor(sec%60)).padStart(2,'0') : '';
    const trackRow = (b, i) => {
      const bm = b.metadata || {};
      const bTitle = b.title || bm.name || 'Uten tittel';
      const bDone = Number(bm.done || 0), bRating = Number(bm.rating || 0);
      const dStr = fmtDur(Number(bm.duration||b.duration||0));
      const hasAudio = !!(bm.audio_url||bm.url||b.audio_url);
      return `<div class="lbl-track">
        <span class="lbl-track-n">${String(i+1).padStart(2,'0')}</span>
        <span class="lbl-track-main"><b>${lblEsc(bTitle)}</b><span>${bRating?'<span class="lbl-stars">'+'★'.repeat(Math.min(bRating,10))+'</span> · ':''}${bDone}% ferdig${dStr?' · '+dStr:''}</span></span>
        ${hasAudio ? `<button class="lbl-play" onclick="window.labelPlayBeat('${lblEsc(b.id)}')" aria-label="Spill ${lblEsc(bTitle)}"><span class="ic ic-play" aria-hidden="true"></span></button>` : '<span class="lbl-play is-empty" title="Ingen lydfil">–</span>'}
      </div>`;
    };

    const albumCards = albums.map(a => {
      const meta = a.metadata || {};
      const status = meta.status || a.status || 'Idé';
      const cover = meta.cover || '';
      const albumBeats = (albumBeatMap[a.id] || []).map(id => beatMap[id] || beats.find(b=>b.id===id)).filter(Boolean);
      const labData = labAlbumMap[a.id] || {};
      const isPriority = !!labData.priority;
      const releaseDate = labData.release_date || '';
      const albumName = a.title || meta.name || 'Uten tittel';
      const avgBeatDone = albumBeats.length ? Math.round(albumBeats.reduce((s,b)=>s+Number((b.metadata||{}).done||0),0)/albumBeats.length) : 0;
      const durStr = fmtDur(albumBeats.reduce((s,b)=>s+Number((b.metadata||{}).duration||b.duration||0),0));
      const withAudio = albumBeats.filter(b => (b.metadata?.audio_url||b.metadata?.url||b.audio_url)).length;
      const withLyrics = albumBeats.filter(b => (b.metadata?.lyrics||(b.metadata?.lyricSections||[]).length > 0)).length;
      const done100 = albumBeats.filter(b=>Number((b.metadata||{}).done||0)>=100).length;
      const avgRating = albumBeats.length ? (albumBeats.reduce((s,b)=>s+Number((b.metadata||{}).rating||0),0)/albumBeats.length).toFixed(1) : '–';
      return `<article class="lbl-album${isPriority?' is-priority':''}">
        <div class="lbl-album-top">
          <span class="lbl-album-cover">${cover?`<img src="${lblEsc(cover)}" alt="">`:'<span class="lbl-cover-ph"><span class="ic ic-disc" aria-hidden="true"></span></span>'}</span>
          <div class="lbl-album-info">
            <div class="lbl-album-title"><b>${lblEsc(albumName)}</b>${isPriority?'<span class="lbl-prio-badge"><span class="ic ic-flame" aria-hidden="true"></span> Prioritert</span>':''}</div>
            <span class="lbl-album-meta">${albumBeats.length} spor${durStr?' · '+durStr:''}${releaseDate?' · Release '+lblDate(releaseDate):''}</span>
            <div class="lbl-album-prog"><span class="lbl-bar"><span style="width:${avgBeatDone}%"></span></span><span>${avgBeatDone}%</span></div>
          </div>
          <span class="lbl-status ${lblStatusClass(status)}">${lblEsc(status)}</span>
        </div>
        <div class="lbl-album-controls">
          <label class="lbl-ctl">Status<select onchange="window.labelSetAlbumStatus('${lblEsc(a.id)}','${lblEsc(artistId)}',this.value)">${STATUSES.map(s=>`<option value="${s}"${s===status?' selected':''}>${s}</option>`).join('')}</select></label>
          <label class="lbl-ctl">Release<input type="date" value="${lblEsc(releaseDate)}" onchange="window.labelSetRelease('${lblEsc(a.id)}','${lblEsc(artistId)}',this.value)"></label>
          <button class="ghost-btn lbl-ctl-btn${isPriority?' active':''}" aria-pressed="${isPriority}" onclick="window.labelTogglePriority('${lblEsc(a.id)}','${lblEsc(artistId)}',${!isPriority})"><span class="ic ic-flame" aria-hidden="true"></span> ${isPriority?'Prioritert':'Prioriter'}</button>
          <button class="ghost-btn lbl-ctl-btn" onclick="window.labelOpenComments('${lblEsc(a.id)}','${lblJs(albumName)}','${lblEsc(artistId)}')"><span class="ic ic-chat" aria-hidden="true"></span> Kommentarer</button>
        </div>
        <details class="lbl-tracks">
          <summary>Spor og status <span class="lbl-muted">${done100}/${albumBeats.length} ferdig · ${withAudio} har lyd · ${withLyrics} har tekst · snitt ★ ${avgRating}</span></summary>
          <div class="lbl-track-list">${albumBeats.length ? albumBeats.map(trackRow).join('') : '<p class="lbl-muted">Ingen sanger ennå.</p>'}</div>
        </details>
      </article>`;
    }).join('');

    const mixtapeRows = mixtapes.map(m => {
      const meta = m.metadata || {};
      const mBeats = (mixtapeBeatMap[m.id]||[]).map(id=>beatMap[id]).filter(Boolean);
      return `<details class="lbl-mixtape">
        <summary><span class="lbl-album-cover is-small"><span class="lbl-cover-ph"><span class="ic ic-cassette" aria-hidden="true"></span></span></span><b>${lblEsc(m.title||meta.name||'Uten tittel')}</b><span class="lbl-muted">${mBeats.length} spor</span></summary>
        <div class="lbl-track-list">${mBeats.length ? mBeats.map(trackRow).join('') : '<p class="lbl-muted">Ingen sanger.</p>'}</div>
      </details>`;
    }).join('');

    detail.innerHTML = `
      <section class="lbl-artist-hero">
        <span class="lbl-artist-avatar" style="background:${col.bg};color:${col.color}">${lblEsc(initials)}</span>
        <div class="lbl-artist-head">
          <p class="mv-eyebrow">Artist</p>
          <h2 class="lbl-hero-name">${lblEsc(name)}</h2>
          ${profile.email ? `<p class="lbl-muted">${lblEsc(profile.email)}</p>` : ''}
        </div>
        <div class="lbl-artist-actions">
          <button class="ghost-btn" onclick="window.labelPitchArtist('${lblEsc(artistId)}')"><span class="ic ic-file" aria-hidden="true"></span> Pitch</button>
          <button class="ghost-btn" onclick="window.labelCompareArtist('${lblEsc(artistId)}','${lblJs(name)}')">Sammenlign</button>
          <button class="ghost-btn" onclick="window.labelExportArtist('${lblEsc(artistId)}','${lblJs(name)}')"><span class="ic ic-download" aria-hidden="true"></span> Eksporter CSV</button>
          <button class="ghost-btn mv-gear-danger" onclick="window.labelRemoveArtist('${lblEsc(artistId)}','${lblJs(name)}')">Fjern fra label</button>
        </div>
      </section>

      <div class="lbl-stats lbl-artist-stats">
        <div class="lbl-stat"><span class="ic ic-disc" aria-hidden="true"></span><div><b>${albums.length}</b><span>Albumer</span></div></div>
        <div class="lbl-stat"><span class="ic ic-cassette" aria-hidden="true"></span><div><b>${mixtapes.length}</b><span>Mixtapes</span></div></div>
        <div class="lbl-stat"><span class="ic ic-music" aria-hidden="true"></span><div><b>${beats.length}</b><span>Sanger</span></div></div>
        <div class="lbl-stat lbl-stat-prog"><div><b>${avgDone}%</b><span>Snitt ferdig</span><span class="lbl-bar"><span style="width:${avgDone}%"></span></span></div></div>
      </div>

      <div class="lbl-grid">
        <div class="lbl-main-col">
          <section class="lbl-panel">
            <h3 class="lbl-panel-title">Albumer</h3>
            ${albums.length ? `<div class="lbl-album-list">${albumCards}</div>` : '<p class="lbl-muted">Ingen albumer ennå.</p>'}
          </section>
          ${mixtapes.length ? `<section class="lbl-panel">
            <h3 class="lbl-panel-title">Mixtapes</h3>
            <div class="lbl-mixtape-list">${mixtapeRows}</div>
          </section>` : ''}
        </div>
        <div class="lbl-side">
          <section class="lbl-panel">
            <div class="lbl-panel-hd"><h3 class="lbl-panel-title">Interne notater</h3><span class="lbl-private" title="Bare labelet ser dette"><span class="ic ic-lock" aria-hidden="true"></span> Privat</span></div>
            <textarea id="labelNotesArea" class="lbl-notes" placeholder="Private merknader om artisten — artisten ser ikke dette…" rows="7" oninput="window.labelNoteDirty=true">${artistNotes.replace(/</g,'&lt;')}</textarea>
            <div class="lbl-notes-actions"><span id="labelNoteStatus" class="lbl-muted"></span><button class="primary-btn" onclick="window.labelSaveNotes('${lblEsc(artistId)}')">Lagre notater</button></div>
          </section>
        </div>
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
        body:JSON.stringify({recipient_id:artistId,sender_id:uid,type:'label_comment',content_id:albumId,content_name:''+labelName+' har prioritert: '+aTitle,role:'label',read:false})
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
    if(status){ status.style.color='#a6be8b'; status.textContent='✓ Lagret'; setTimeout(()=>status.textContent='',2000); }
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
      modal.style.cssText='display:none;position:fixed;inset:0;z-index:9300;background:rgb(var(--shade-rgb) / .8);align-items:flex-start;justify-content:center;backdrop-filter:blur(4px);padding-top:40px;overflow-y:auto';
      modal.addEventListener('click',e=>{if(e.target===modal)modal.style.display='none';});
      document.body.appendChild(modal);
    }
    modal.style.display='flex';
    modal.innerHTML='<div style="background:var(--surface-1);border:1px solid rgb(var(--ink-rgb) / .12);width:min(800px,96vw);padding:0 0 24px">'
      +'<div style="display:flex;justify-content:space-between;align-items:center;padding:20px 24px;border-bottom:1px solid rgb(var(--ink-rgb) / .08)">'
        +'<h2 style="font-size:16px;font-weight:800;margin:0">Sammenlign artist</h2>'
        +'<button onclick="document.getElementById(\'labelCompareModal\').style.display=\'none\'" style="background:none;border:none;color:rgb(var(--ink-rgb) / calc(.5 + (1 - .5) * var(--ink-boost)));font-size:20px;cursor:pointer">×</button>'
      +'</div>'
      +'<div style="padding:20px 24px">'
        +'<p style="font-size:13px;color:rgb(var(--ink-rgb) / calc(.5 + (1 - .5) * var(--ink-boost)));margin-bottom:16px">Velg artist å sammenligne med <strong style="color:var(--accent-ink)">'+name+'</strong>:</p>'
        +'<div style="display:flex;flex-wrap:wrap;gap:8px">'
        +artists.map(a=>'<button onclick="window.labelDoCompare(\''+artistId+'\',\''+a.artist_id+'\')" style="background:rgb(var(--ink-rgb) / .06);border:1px solid rgb(var(--ink-rgb) / .1);color:var(--text);padding:8px 16px;cursor:pointer;font-family:system-ui;font-size:13px">'+(a.profile?.username||a.artist_id.slice(0,8))+'</button>').join('')
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
      return '<div style="display:grid;grid-template-columns:1fr 120px 1fr;gap:8px;padding:8px 0;border-bottom:1px solid rgb(var(--ink-rgb) / .05);align-items:center">'
        +'<div style="text-align:right;font-size:14px;font-weight:'+(aWins?'900':'400')+';color:'+(aWins?'#d68155':'#f4eadc')+'">'+vA+'</div>'
        +'<div style="text-align:center;font-size:10px;color:rgb(var(--ink-rgb) / calc(.35 + (1 - .35) * var(--ink-boost)));text-transform:uppercase;letter-spacing:.1em">'+label+'</div>'
        +'<div style="font-size:14px;font-weight:'+(bWins?'900':'400')+';color:'+(bWins?'#d68155':'#f4eadc')+'">'+vB+'</div>'
      +'</div>';
    };

    if(el) el.innerHTML = '<div style="display:grid;grid-template-columns:1fr 120px 1fr;gap:8px;margin-bottom:12px">'
      +'<div style="font-size:13px;font-weight:800;color:var(--accent-ink);text-align:right">'+nameA+'</div>'
      +'<div></div>'
      +'<div style="font-size:13px;font-weight:800;color:var(--muted)">'+nameB+'</div>'
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
    if(typeof window.showToast==='function') window.showToast('CSV lastet ned');
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

    // Finn artist via brukernavn (sikker RPC)
    const pr = await fetch(
      `${SB_URL}/rest/v1/rpc/get_user_id_by_username`,
      {method:'POST', headers: sbH(token), body: JSON.stringify({p_username: username})}
    );
    const profiles = pr.ok ? await pr.json() : [];
    if(!profiles.length){ if(status){ status.style.color='#ffaaa3'; status.textContent=`Finner ingen bruker med brukernavn "${username}".`; } return; }
    const artistId = profiles[0].id;
    if(artistId === uid){ if(status){ status.style.color='#ffaaa3'; status.textContent='Du kan ikke invitere deg selv.'; } return; }

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
    if(!ir.ok){ if(status){ status.style.color='#ffaaa3'; status.textContent='Noe gikk galt. Prøv igjen.'; } return; }

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

    if(status){ status.style.color='#a6be8b'; status.textContent=`✓ Invitasjon sendt til ${username}.`; }
    document.getElementById('labelInviteUsername').value = '';
    setTimeout(()=>{ window.labelCloseInvite(); renderArtistList(); }, 1500);
  };

  // ── Fjern artist ────────────────────────────────────────────────────────
  window.labelRemoveArtist = async function(artistId, name){
    if(!confirm(`Fjerne ${name} fra labelen?`)) return;
    const token = await getToken();
    const uid   = await getUid();
    const res = await fetch(
      `${SB_URL}/rest/v1/label_artists?label_id=eq.${encodeURIComponent(uid)}&artist_id=eq.${encodeURIComponent(artistId)}`,
      {method:'DELETE', headers:{...sbH(token),'Prefer':'return=minimal'}}
    ).catch(() => null);
    if(!res || !res.ok){
      if(typeof window.showToast==='function') window.showToast(`Kunne ikke fjerne ${name} — prøv igjen`);
      return;
    }
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
          <button onclick="window.labelRespondInvite('${n.content_id}','${n.id}',true)" style="background:rgb(var(--ok-rgb) / .15);border:1px solid rgb(var(--ok-rgb) / .3);color:var(--ok);font-size:11px;font-weight:800;padding:4px 12px;cursor:pointer;font-family:system-ui">✓ Aksepter</button>
          <button onclick="window.labelRespondInvite('${n.content_id}','${n.id}',false)" style="background:rgb(var(--danger-rgb) / .1);border:1px solid rgb(var(--danger-rgb) / .3);color:var(--danger);font-size:11px;font-weight:800;padding:4px 12px;cursor:pointer;font-family:system-ui">✕ Avslå</button>
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
      feedEl.innerHTML = '<div style="padding:20px;font-size:13px;color:rgb(var(--ink-rgb) / calc(.3 + (1 - .3) * var(--ink-boost)))">Ingen artister i labelen ennå.</div>';
      return;
    }

    const nRes = await fetch(
      `${SB_URL}/rest/v1/notifications?sender_id=in.(${artistIds.join(',')})&order=created_at.desc&limit=50&select=*`,
      {headers:sbH(token)}
    );
    const notifs = nRes.ok ? await nRes.json() : [];

    const typeLabels = {share_beat:'Ny sang', share_album:'Nytt album', share_mixtape:'Ny mixtape'};

    const senderIds = [...new Set(notifs.map(n=>n.sender_id).filter(Boolean))];
    let senderNames = {};
    if(senderIds.length){
      const pr = await fetch(`${SB_URL}/rest/v1/rpc/get_usernames`, {method:'POST', headers:sbH(token), body: JSON.stringify({p_ids: senderIds})});
      if(pr.ok){ const pd = await pr.json(); pd.forEach(p=>senderNames[p.id]=p.username||p.id); }
    }

    if(!notifs.length){
      feedEl.innerHTML = '<div style="padding:20px;font-size:13px;color:rgb(var(--ink-rgb) / calc(.3 + (1 - .3) * var(--ink-boost)))">Ingen aktivitet ennå.</div>';
      return;
    }

    feedEl.innerHTML = notifs.map(n => {
      const label = typeLabels[n.type] || 'Hendelse';
      const who = senderNames[n.sender_id] || 'Artist';
      const when = new Date(n.created_at).toLocaleDateString('no-NO', {day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
      return `<div style="padding:14px 0;border-bottom:1px solid rgb(var(--ink-rgb) / .06);display:flex;gap:12px;align-items:flex-start">
        <div style="font-size:18px;flex-shrink:0;margin-top:2px">${label.split(' ')[0]}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:700;color:var(--text)">${label.slice(2)} — ${n.content_name||''}</div>
          <div style="font-size:11px;color:rgb(var(--ink-rgb) / calc(.4 + (1 - .4) * var(--ink-boost)));margin-top:2px">${who} · ${when}</div>
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
      modal.style.cssText = 'display:none;position:fixed;inset:0;z-index:9200;background:rgb(var(--shade-rgb) / .75);align-items:flex-start;justify-content:center;backdrop-filter:blur(4px);padding-top:60px;overflow-y:auto';
      modal.addEventListener('click', e=>{ if(e.target===modal) modal.style.display='none'; });
      document.body.appendChild(modal);
    }
    modal.style.display = 'flex';
    modal.innerHTML = `<div style="background:var(--surface-1);border:1px solid rgb(var(--ink-rgb) / .12);width:min(560px,92vw);padding:0 0 24px">
      <div style="display:flex;justify-content:space-between;align-items:center;padding:20px 24px;border-bottom:1px solid rgb(var(--ink-rgb) / .08)">
        <div>
          <h2 style="font-size:16px;font-weight:800;margin:0"><span class="ic ic-chat" aria-hidden="true"></span> Kommentarer</h2>
          <div style="font-size:12px;color:rgb(var(--ink-rgb) / calc(.4 + (1 - .4) * var(--ink-boost)));margin-top:3px">${albumName}</div>
        </div>
        <button onclick="document.getElementById('labelCommentModal').style.display='none'" style="background:none;border:none;color:rgb(var(--ink-rgb) / calc(.5 + (1 - .5) * var(--ink-boost)));font-size:20px;cursor:pointer;line-height:1">×</button>
      </div>
      <div id="labelCommentList" style="padding:16px 24px;max-height:280px;overflow-y:auto">
        <div class="label-loading">Laster...</div>
      </div>
      <div style="padding:0 24px">
        <textarea id="labelCommentText" placeholder="Skriv en tilbakemelding..." rows="3"
          style="width:100%;box-sizing:border-box;background:rgb(var(--ink-rgb) / .05);border:1px solid rgb(var(--ink-rgb) / .1);color:var(--text);padding:10px 12px;font-size:13px;font-family:Georgia,serif;outline:none;resize:vertical;margin-bottom:8px"></textarea>
        <button onclick="window.labelSubmitComment('${albumId}','${artistId}')" style="background:var(--accent);border:none;color:#000;font-size:12px;font-weight:800;padding:9px 20px;cursor:pointer;font-family:system-ui;letter-spacing:.06em;text-transform:uppercase">Send</button>
        <div id="labelCommentStatus" style="font-size:11px;color:rgb(var(--ink-rgb) / calc(.4 + (1 - .4) * var(--ink-boost)));margin-top:8px;min-height:14px"></div>
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
    if(!comments.length){ el.innerHTML = '<div style="font-size:12px;color:rgb(var(--ink-rgb) / calc(.3 + (1 - .3) * var(--ink-boost)))">Ingen kommentarer ennå.</div>'; return; }
    el.innerHTML = comments.map(c=>`
      <div style="padding:10px 0;border-bottom:1px solid rgb(var(--ink-rgb) / .06)">
        <div style="display:flex;gap:8px;margin-bottom:4px">
          <span style="font-size:12px;font-weight:800;color:var(--accent-ink)">${c.author||'Anonym'}</span>
          <span style="font-size:10px;color:rgb(var(--ink-rgb) / calc(.3 + (1 - .3) * var(--ink-boost)))">${new Date(c.created_at).toLocaleDateString('no-NO')}</span>
        </div>
        <div style="font-size:13px;color:rgb(var(--ink-rgb) / calc(.7 + (1 - .7) * var(--ink-boost)));line-height:1.5;white-space:pre-wrap">${c.comment||''}</div>
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
    if(status){ status.style.color='#a6be8b'; status.textContent='✓ Sendt'; setTimeout(()=>status.textContent='',2000); }
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
