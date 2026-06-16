// === supabaseAdminLoginScript ===
/*
  Supabase admin-login for Music Vault
  1) Bytt ut SUPABASE_URL og SUPABASE_ANON_KEY med verdiene fra Supabase.
  2) Brukeren må finnes i Authentication -> Users.
  3) Brukeren må ha role = 'admin' i public.profiles.
*/
const SUPABASE_URL = "https://ylvqkfdvijqnecuqznyr.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlsdnFrZmR2aWpxbmVjdXF6bnlyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgzMzA4MzIsImV4cCI6MjA5MzkwNjgzMn0.bYPTaxQK8n7I7w5Ri2DVYW5_LbFHg2IXkuhHsLTDDqc";

const isSupabaseConfigured =
  SUPABASE_URL &&
  SUPABASE_ANON_KEY &&
  !SUPABASE_URL.includes("DIN_SUPABASE") &&
  !SUPABASE_ANON_KEY.includes("DIN_SUPABASE");

const supabaseClient = isSupabaseConfigured && window.supabase
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

window.supabaseClient = supabaseClient;
window.currentAdminUser = null;
window.isAdminMode = false;

function showAdminMessage(message, type = "info") {
  const el = document.getElementById("adminLoginMessage");
  if (!el) return;
  el.textContent = message;
  el.dataset.type = type;
}

function withTimeout(promise, ms = 15000, message = "Supabase bruker for lang tid på å svare.") {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(message)), ms))
  ]);
}

async function checkAdminRole(userId) {
  if (!supabaseClient || !userId) return false;

  const { data, error } = await withTimeout(
    supabaseClient
      .from("profiles")
      .select("role, package")
      .eq("id", userId)
      .maybeSingle(),
    15000,
    "Klarte ikke å sjekke admin-rollen. Sjekk RLS-policy på profiles."
  );

  if (error) {
    console.error("Kunne ikke sjekke admin-rolle:", error);
    showAdminMessage(`Kunne ikke sjekke admin-rolle: ${error.message}`, "error");
    return false;
  }

  // Set package from profiles (falls back to 'admin' if not set)
  const pkg = data?.package || (data?.role === 'admin' ? 'admin' : 'viewer');
  if (typeof window.setPackage === 'function') window.setPackage(pkg);
  else sessionStorage.setItem('mv_package', pkg);

  return data?.role === "admin";
}

async function updateAdminUi() {
  const statusEl = document.getElementById("adminLoginStatus");
  const loginBox = document.getElementById("adminLoginBox");
  const logoutBox = document.getElementById("adminLogoutBox");
  const emailEl = document.getElementById("adminLoggedInEmail");

  try {
    if (!supabaseClient) {
      if (statusEl) statusEl.textContent = "Supabase er ikke konfigurert ennå.";
      if (loginBox) loginBox.style.display = "grid";
      if (logoutBox) logoutBox.style.display = "none";
      showAdminMessage("Fyll inn SUPABASE_URL og SUPABASE_ANON_KEY i HTML-filen først.", "warning");
      return;
    }

    if (statusEl) statusEl.textContent = "Sjekker...";

    const { data, error } = await withTimeout(
      supabaseClient.auth.getSession(),
      15000,
      "Klarte ikke å hente Supabase-session. Sjekk URL/key og nettverk."
    );

    if (error) throw error;

    const user = data?.session?.user || null;
    window.currentAdminUser = user;
    window.isAdminMode = user ? await checkAdminRole(user.id) : false;

    if (window.isAdminMode) {
      if (statusEl) statusEl.textContent = "Admin-modus aktiv";
      if (emailEl) emailEl.textContent = sessionStorage.getItem('mv_username') || user.email || "admin";
      if (loginBox) loginBox.style.display = "none";
      if (logoutBox) logoutBox.style.display = "grid";
      showAdminMessage("Du er logget inn som admin.", "success");
      document.body.classList.add("admin-mode");
      // Cache user id for owner_id stamping
      window._mvCurrentUserId = user.id;
      sessionStorage.setItem('mv_user_id', user.id);
      if (typeof window.applyPackage === 'function') window.applyPackage();
    } else if (user) {
      if (statusEl) statusEl.textContent = "Innlogget, men ikke admin";
      if (emailEl) emailEl.textContent = user.email || "Innlogget bruker";
      if (loginBox) loginBox.style.display = "none";
      if (logoutBox) logoutBox.style.display = "none";
      showAdminMessage("Logget inn som pakke-bruker.", "success");
      document.body.classList.remove("admin-mode");
      window._mvCurrentUserId = user.id;
      sessionStorage.setItem('mv_user_id', user.id);
    } else {
      if (statusEl) statusEl.textContent = "Ikke innlogget";
      if (loginBox) loginBox.style.display = "grid";
      if (logoutBox) logoutBox.style.display = "none";
      showAdminMessage("Logg inn for å legge til, endre, arkivere eller slette innhold.", "info");
      document.body.classList.remove("admin-mode");
    }
  } catch (err) {
    console.error("Admin UI-feil:", err);
    if (statusEl) statusEl.textContent = "Feil ved sjekk";
    if (loginBox) loginBox.style.display = "grid";
    if (logoutBox) logoutBox.style.display = "none";
    showAdminMessage(err.message || "Noe gikk galt ved Supabase-sjekk.", "error");
  }
}

async function loginAdmin(email, password) {
  if (!supabaseClient) {
    showAdminMessage("Supabase er ikke konfigurert. Fyll inn URL og anon public key i HTML-filen.", "warning");
    return null;
  }

  const loginBtn = document.getElementById("adminLoginBtn");
  if (loginBtn) {
    loginBtn.disabled = true;
    loginBtn.textContent = "Logger inn...";
  }

  try {
    const { data, error } = await withTimeout(
      supabaseClient.auth.signInWithPassword({ email, password }),
      15000,
      "Innloggingen tok for lang tid. Sjekk Supabase URL, anon key og at Authentication er aktivert."
    );

    if (error) {
      console.error("Admin-login feilet:", error);
      showAdminMessage(`Login-feil: ${error.message}`, "error");
      return null;
    }

    await updateAdminUi();

    if (!window.isAdminMode) {
      showAdminMessage("Du er logget inn, men brukeren er ikke satt som admin i Supabase.", "warning");
    }

    return data.user;
  } catch (err) {
    console.error("Admin-login stoppet:", err);
    showAdminMessage(err.message || "Login stoppet. Åpne Console for mer info.", "error");
    return null;
  } finally {
    if (loginBtn) {
      loginBtn.disabled = false;
      loginBtn.textContent = "Logg inn som admin";
    }
  }
}

async function logoutAdmin() {
  if (!supabaseClient) return;
  await supabaseClient.auth.signOut();
  window.currentAdminUser = null;
  window.isAdminMode = false;
  await updateAdminUi();
}

function installAdminLoginPanel() {
  if (document.getElementById("supabaseAdminPanel")) return;

  const integrationsPanel = document.querySelector("#integrationsTab .content-panel") || document.querySelector("#integrationsTab") || document.body;

  integrationsPanel.insertAdjacentHTML("afterbegin", `
    <div id="supabaseAdminPanel" class="settings-card supabase-admin-card">
      <h2>🔐 Admin</h2>

      <div class="admin-status-row">
        <span id="adminLoginStatus">Sjekker...</span>
      </div>

      <div id="adminLoginBox" class="admin-login-box" style="display:none">
        <p class="hint">Logg inn fra låseskjermen for å få admin-tilgang.</p>
        <button class="primary-btn" onclick="returnToPasswordScreen()">Gå til innlogging</button>
      </div>

      <div id="adminLogoutBox" class="admin-login-box" style="display:none">
        <div style="display:flex;align-items:center;gap:12px;justify-content:space-between">
          <p class="hint" style="margin:0">Innlogget som <strong id="adminLoggedInEmail"></strong></p>
          <button class="ghost-btn" id="adminLogoutBtn" style="white-space:nowrap">Logg ut</button>
        </div>
      </div>

      <p id="adminLoginMessage" class="hint admin-login-message"></p>
    </div>
  `);

  const style = document.createElement("style");
  style.textContent = `
    .supabase-admin-card{margin-bottom:14px;border:1px solid rgba(52,211,153,.18)!important;background:rgba(52,211,153,.055)!important}
    .admin-status-row{display:flex;gap:8px;align-items:center;margin:10px 0 14px;font-size:13px;color:var(--muted)}
    .admin-status-row strong{color:var(--text)}
    .admin-login-box{display:grid;gap:10px;margin-top:10px}
    .admin-login-message{margin-top:10px;min-height:18px}
    .admin-login-message[data-type="success"]{color:#34d399}
    .admin-login-message[data-type="warning"]{color:#fbbf24}
    .admin-login-message[data-type="error"]{color:#fb7185}
    #adminLoginBtn:disabled{opacity:.65;cursor:not-allowed}
  `;
  document.head.appendChild(style);

  document.getElementById("adminLoginBtn")?.addEventListener("click", async () => {
    const email = document.getElementById("adminEmailInput")?.value.trim();
    const password = document.getElementById("adminPasswordInput")?.value;

    if (!email || !password) {
      showAdminMessage("Skriv inn e-post og passord.", "warning");
      return;
    }

    showAdminMessage("Logger inn...", "info");
    await loginAdmin(email, password);
  });

  document.getElementById("adminLogoutBtn")?.addEventListener("click", logoutAdmin);
}

window.loginAdmin = loginAdmin;
window.logoutAdmin = logoutAdmin;
window.updateAdminUi = updateAdminUi;

installAdminLoginPanel();

if (supabaseClient) {
  // Viktig: ikke kall Supabase-metoder direkte inne i onAuthStateChange-callbacken.
  // setTimeout hindrer at auth-callbacken låser seg.
  supabaseClient.auth.onAuthStateChange(() => {
    setTimeout(updateAdminUi, 0);
  });
}

setTimeout(updateAdminUi, 50);

// === supabaseDataSyncScript ===
/*
  Supabase datasynk for Music Vault
  - Leser metadata fra Supabase på tvers av alle enheter.
  - Skriver bare til Supabase når window.isAdminMode === true.
  - Lydfiler lagres i Cloudflare R2 (ikke Google Drive lenger).
    audio_url inneholder R2 Worker-URL: https://beat-vault.marcus-aas-mekiassen.workers.dev/file/...
  - saveState() kaller automatisk schedulePush() → push skjer 900ms etter siste endring.
  - pushToSupabase og pullFromSupabase er eksponert på window.

  Tabeller i Supabase: beats, albums, mixtapes, album_beats, mixtape_beats, profiles
  RLS: alle kan lese, kun auth.role()='authenticated' kan skrive.
*/
(function(){
  if (window.__musicVaultSupabaseSyncInstalled) return;
  window.__musicVaultSupabaseSyncInstalled = true;

  const SYNC_STATUS_ID = 'supabaseSyncStatus';
  let isPullingFromSupabase = false;
  let pushTimer = null;
  let lastPushAt = 0;
  let _pendingPush = false;  // dirty flag — set when changes exist but push hasn't run yet
  let _pushFailCount = 0;    // consecutive fail counter for backoff
  let _intervalId = null;

  function client(){ return window.supabaseClient || null; }
  function appState(){ try { return state; } catch { return null; } }
  function canWrite(){
    // isAdminMode may not be set on auto-login path — check sessionStorage too
    const isAdmin = window.isAdminMode || sessionStorage.getItem('mv_role')==='admin';
    return !!(client() && isAdmin);
  }
  function say(msg, type='info'){
    const el = document.getElementById(SYNC_STATUS_ID);
    if(el){ el.textContent = msg; el.dataset.type = type; }
    if(type === 'error') console.error(msg);
  }
  function toast(msg){ try { if(typeof showToast === 'function') showToast(msg); } catch{} }
  function safeDate(ms){
    const n = Number(ms || Date.now());
    const d = new Date(Number.isFinite(n) ? n : Date.now());
    return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
  }
  function fromIso(v){
    const t = v ? new Date(v).getTime() : Date.now();
    return Number.isFinite(t) ? t : Date.now();
  }
  function driveIdFromUrl(url){
    const str = String(url || '');
    return (str.match(/[?&]id=([^&#]+)/) || str.match(/\/d\/([^/?#]+)/) || [])[1] || '';
  }
  function uniq(arr){ return [...new Set((arr || []).filter(Boolean))]; }

  function packBeat(b){
    const meta = {...b};
    delete meta.id;
    const title = b.name || b.title || 'Untitled beat';
    return {
      id: b.id,
      title,
      bpm: Number.isFinite(Number(b.bpm)) ? Number(b.bpm) : null,
      tags: Array.isArray(b.tags) ? b.tags : [],
      audio_url: normalizeAudioUrl(b.audio_url) || normalizeAudioUrl(b.url) || '',
      drive_file_id: b.drive_file_id || driveIdFromUrl(b.audio_url || b.url),
      archived: !!b.archived,
      created_at: safeDate(b.createdAt),
      owner_id: window._mvCurrentUserId || null,
      metadata: meta
    };
  }
  function unpackBeat(row){
    const meta = row.metadata || {};
    return {
      ...meta,
      id: row.id,
      name: meta.name || row.title || 'Untitled beat',
      title: row.title || meta.name || 'Untitled beat',
      url: normalizeAudioUrl(row.audio_url) || normalizeAudioUrl(meta.url) || '',
      audio_url: normalizeAudioUrl(row.audio_url) || normalizeAudioUrl(meta.url) || '',
      drive_file_id: row.drive_file_id || meta.drive_file_id || '',
      source: meta.source || (row.drive_file_id ? 'Google Drive' : (row.audio_url ? 'URL' : '')),
      tags: Array.isArray(row.tags) ? row.tags : (meta.tags || []),
      bpm: row.bpm ?? meta.bpm ?? null,
      archived: !!row.archived,
      favorite: !!meta.favorite,
      lyrics: meta.lyrics || '',
      rating: Number(meta.rating || 0),
      cover: meta.cover || '',
      done: Number(meta.done || 0),
      createdAt: meta.createdAt || fromIso(row.created_at),
      owner_id: row.owner_id || meta.owner_id || null,
      _shared: row._shared || false,
      _sharedRole: row._sharedRole || null
    };
  }
  function packAlbum(a){
    const meta = {...a};
    delete meta.id;
    delete meta.beatIds;
    return {
      id: a.id,
      title: a.name || a.title || 'Untitled album',
      description: a.description || '',
      cover_url: a.cover || a.cover_url || '',
      archived: !!a.archived,
      created_at: safeDate(a.createdAt),
      owner_id: window._mvCurrentUserId || null,
      metadata: meta
    };
  }
  function unpackAlbum(row, beatIds){
    const meta = row.metadata || {};
    return {
      ...meta,
      id: row.id,
      name: meta.name || row.title || 'Untitled album',
      title: row.title || meta.name || 'Untitled album',
      description: row.description || meta.description || '',
      cover: meta.cover || row.cover_url || null,
      cover_url: row.cover_url || meta.cover || '',
      archived: !!row.archived,
      beatIds: beatIds || meta.beatIds || [],
      createdAt: meta.createdAt || fromIso(row.created_at),
      owner_id: row.owner_id || meta.owner_id || null,
      _shared: row._shared || false,
      _sharedRole: row._sharedRole || null
    };
  }
  function packMixtape(m){
    const meta = {...m};
    delete meta.id;
    delete meta.beatIds;
    return {
      id: m.id,
      title: m.name || m.title || 'Untitled mixtape',
      description: m.description || '',
      cover_url: m.cover || m.cover_url || '',
      archived: !!m.archived,
      created_at: safeDate(m.createdAt),
      owner_id: window._mvCurrentUserId || null,
      metadata: meta
    };
  }
  function unpackMixtape(row, beatIds){
    const meta = row.metadata || {};
    return {
      ...meta,
      id: row.id,
      name: meta.name || row.title || 'Untitled mixtape',
      title: row.title || meta.name || 'Untitled mixtape',
      description: row.description || meta.description || '',
      cover: meta.cover || row.cover_url || null,
      cover_url: row.cover_url || meta.cover || '',
      archived: !!row.archived,
      beatIds: beatIds || meta.beatIds || [],
      createdAt: meta.createdAt || fromIso(row.created_at),
      owner_id: row.owner_id || meta.owner_id || null,
      _shared: row._shared || false,
      _sharedRole: row._sharedRole || null
    };
  }

  async function selectAll(table){
    const { data, error } = await client().from(table).select('*');
    if(error) throw error;
    return data || [];
  }
  function idsFromRelations(rows, parentKey){
    const map = new Map();
    (rows || []).forEach(r => {
      const parent = r[parentKey];
      if(!parent) return;
      if(!map.has(parent)) map.set(parent, []);
      map.get(parent).push({ beatId: r.beat_id, position: Number(r.position || 0) });
    });
    for(const [k, list] of map.entries()){
      map.set(k, list.sort((a,b)=>a.position-b.position).map(x=>x.beatId));
    }
    return map;
  }

  async function pullFromSupabase({force=false}={}){
    const st = appState();
    if(!st || !client()) { say('Supabase er ikke konfigurert.', 'warning'); return false; }
    if(isPullingFromSupabase) return false;

    if(!window._mvCurrentUserId) window._mvCurrentUserId = sessionStorage.getItem('mv_user_id') || null;
    const uid = window._mvCurrentUserId;

    isPullingFromSupabase = true;
    say('Henter data fra Supabase...', 'info');
    try{
      // ── 1. Hent eget innhold ────────────────────────────────────
      const ownFilter = uid ? (q) => q.eq('owner_id', uid) : (q) => q;

      const [ownBeats, ownAlbums, ownMixtapes, albumBeatRows, mixtapeBeatRows] = await Promise.all([
        ownFilter(client().from('beats').select('*')).then(r=>{ if(r.error) throw r.error; return r.data||[]; }),
        ownFilter(client().from('albums').select('*')).then(r=>{ if(r.error) throw r.error; return r.data||[]; }),
        ownFilter(client().from('mixtapes').select('*')).then(r=>{ if(r.error) throw r.error; return r.data||[]; }),
        selectAll('album_beats'),
        selectAll('mixtape_beats')
      ]);

      // ── 2. Hent delt innhold via content_access ─────────────────
      let sharedBeats = [], sharedAlbums = [], sharedMixtapes = [];
      if(uid){
        const { data: accessRows } = await client()
          .from('content_access')
          .select('content_type, content_id, role, owner_id')
          .eq('grantee_id', uid);

        if(accessRows?.length){
          const byType = { beat: [], album: [], mixtape: [] };
          accessRows.forEach(r => byType[r.content_type]?.push(r.content_id));

          const [sb, sa, sm] = await Promise.all([
            byType.beat.length
              ? client().from('beats').select('*').in('id', byType.beat).then(r=>r.data||[])
              : Promise.resolve([]),
            byType.album.length
              ? client().from('albums').select('*').in('id', byType.album).then(r=>r.data||[])
              : Promise.resolve([]),
            byType.mixtape.length
              ? client().from('mixtapes').select('*').in('id', byType.mixtape).then(r=>r.data||[])
              : Promise.resolve([])
          ]);

          // Tag shared items with access role
          const roleMap = {};
          accessRows.forEach(r => { roleMap[r.content_id] = r.role; });
          sharedBeats    = sb.map(r => ({...r, _shared: true, _sharedRole: roleMap[r.id]}));
          sharedAlbums   = sa.map(r => ({...r, _shared: true, _sharedRole: roleMap[r.id]}));
          sharedMixtapes = sm.map(r => ({...r, _shared: true, _sharedRole: roleMap[r.id]}));
        }
      }

      // ── 3. Merge eget + delt ─────────────────────────────────────
      const allBeats    = [...ownBeats,    ...sharedBeats];
      const allAlbums   = [...ownAlbums,   ...sharedAlbums];
      const allMixtapes = [...ownMixtapes, ...sharedMixtapes];

      const remoteIsEmpty = !allBeats.length && !allAlbums.length && !allMixtapes.length;
      const localHasData  = st.beats?.length || st.albums?.length || st.mixtapes?.length;

      if(remoteIsEmpty && localHasData && !force && !uid){
        say('Supabase er tom. Trykk «Migrer lokale data til Supabase».', 'warning');
        return false;
      }

      if(remoteIsEmpty && uid){
        st.beats = []; st.albums = []; st.mixtapes = [];
        st.settings = st.settings || {}; st.demos = []; st.versions = [];
        const sk = `musicVault.v4.${uid}`;
        try { localStorage.setItem(sk, JSON.stringify(st)); } catch{}
        try { localStorage.setItem('musicVault.v4', JSON.stringify(st)); } catch{}
        if(typeof renderAll === 'function') renderAll();
        say('Tom profil — ingen innhold ennå.', 'info');
        return true;
      }

      const albumMap   = idsFromRelations(albumBeatRows,   'album_id');
      const mixtapeMap = idsFromRelations(mixtapeBeatRows, 'mixtape_id');

      st.beats    = allBeats.map(unpackBeat);
      st.albums   = allAlbums.map(r   => unpackAlbum(r,   albumMap.get(r.id)   || []));
      st.mixtapes = allMixtapes.map(r => unpackMixtape(r, mixtapeMap.get(r.id) || []));
      st.settings = st.settings || {};
      st.demos    = st.demos    || [];
      st.versions = st.versions || [];

      const sk = uid ? `musicVault.v4.${uid}` : 'musicVault.v4';
      try { localStorage.setItem(sk,              JSON.stringify(st)); } catch{}
      try { localStorage.setItem('musicVault.v4', JSON.stringify(st)); } catch{}

      if(typeof renderAll === 'function') renderAll();

      const sharedCount = sharedBeats.length + sharedAlbums.length + sharedMixtapes.length;
      say(`Synket: ${st.beats.length} beats, ${st.albums.length} albumer, ${st.mixtapes.length} mixtapes${sharedCount ? ` (${sharedCount} delt med deg)` : ''}.`, 'success');
      return true;
    }catch(err){
      console.error('Supabase pull-feil:', err);
      say(`Kunne ikke hente fra Supabase: ${err.message || err}.`, 'error');
      return false;
    }finally{
      isPullingFromSupabase = false;
    }
  }

  async function deleteMissingRows(table, currentIds){
    const uid = window._mvCurrentUserId;
    // Only delete own content — filter by owner_id
    let q = client().from(table).select('id');
    if(uid) q = q.eq('owner_id', uid);
    const { data, error } = await q;
    if(error) throw error;
    const keep = new Set(currentIds || []);
    const missing = (data || []).map(r=>r.id).filter(id=>!keep.has(id));
    for(const id of missing){
      const del = await client().from(table).delete().eq('id', id);
      if(del.error) throw del.error;
    }
  }
  async function syncRelations(table, parentKey, collections){
    const ids = (collections || []).map(c=>c.id).filter(Boolean);
    for(const id of ids){
      const del = await client().from(table).delete().eq(parentKey, id);
      if(del.error) throw del.error;
    }
    const rows = [];
    (collections || []).forEach(col => {
      uniq(col.beatIds || []).forEach((beatId, index) => rows.push({ [parentKey]: col.id, beat_id: beatId, position: index }));
    });
    if(rows.length){
      const ins = await client().from(table).insert(rows);
      if(ins.error) throw ins.error;
    }
  }

  async function pushToSupabase({manual=false}={}){
    const st = appState();
    if(!st || !client()) { say('Supabase er ikke konfigurert.', 'warning'); return false; }
    if(!window.isAdminMode){
      if(manual) say('Du må være innlogget som admin for å skrive til Supabase.', 'warning');
      return false;
    }
    if(isPullingFromSupabase) return false;

    say('Lagrer til Supabase...', 'info');
    try{
      const beats = (st.beats || []).map(packBeat);
      const albums = (st.albums || []).map(packAlbum);
      const mixtapes = (st.mixtapes || []).map(packMixtape);

      await deleteMissingRows('beats', beats.map(x=>x.id));
      await deleteMissingRows('albums', albums.map(x=>x.id));
      await deleteMissingRows('mixtapes', mixtapes.map(x=>x.id));

      if(beats.length){ const r = await client().from('beats').upsert(beats, { onConflict:'id' }); if(r.error) throw r.error; }
      if(albums.length){ const r = await client().from('albums').upsert(albums, { onConflict:'id' }); if(r.error) throw r.error; }
      if(mixtapes.length){ const r = await client().from('mixtapes').upsert(mixtapes, { onConflict:'id' }); if(r.error) throw r.error; }

      await syncRelations('album_beats', 'album_id', st.albums || []);
      await syncRelations('mixtape_beats', 'mixtape_id', st.mixtapes || []);

      lastPushAt = Date.now();
      _pendingPush = false;
      _pushFailCount = 0;
      say(`Lagret ${new Date(lastPushAt).toLocaleTimeString()}.`, 'success');
      _updateSyncIndicator(true);
      if(manual) toast('\u2713 Lokale data migrert til Supabase');
      return true;
    }catch(err){
      console.error('Supabase push-feil:', err);
      _pushFailCount++;
      _pendingPush = true; // still dirty — needs retry
      const hint = /metadata/i.test(err.message || '')
        ? ' Mangler metadata-kolonne.'
        : '';
      say(`Lagring feilet (fors\u00f8k ${_pushFailCount}): ${err.message || err}.${hint}`, 'error');
      _updateSyncIndicator(false);
      return false;
    }
  }

  function schedulePush(){
    _pendingPush = true;
    if(isPullingFromSupabase || !canWrite()) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(()=>pushToSupabase(), 900);
  }

  function installSyncPanel(){
    if(document.getElementById('supabaseDataSyncPanel')) return;
    const parent = document.getElementById('supabaseAdminPanel') || document.querySelector('#integrationsTab .content-panel') || document.body;
    parent.insertAdjacentHTML('afterend', `
      <div id="supabaseDataSyncPanel" class="settings-card supabase-sync-card">
        <h2>☁️ Supabase sync</h2>
        <p class="hint">Metadata, tekster og ratings synkes automatisk på tvers av alle enheter. Lydfiler lagres i Cloudflare R2.</p>
        <div class="sync-actions">
          <button class="primary-btn" id="pullSupabaseBtn">↓ Hent fra sky</button>
          <button class="ghost-btn" id="pushSupabaseBtn">↑ Push lokale data</button>
        </div>
        <p id="supabaseSyncStatus" class="hint sync-status">Ikke synket ennå.</p>
      </div>
    `);
    if(!document.getElementById('supabaseDataSyncStyle')){
      const style = document.createElement('style');
      style.id = 'supabaseDataSyncStyle';
      style.textContent = `
        .supabase-sync-card{margin-bottom:14px;border:1px solid rgba(96,165,250,.18)!important;background:rgba(96,165,250,.055)!important}
        .sync-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:10px}
        .sync-status{min-height:18px;margin-top:10px}
        .sync-status[data-type="success"]{color:#34d399}.sync-status[data-type="warning"]{color:#fbbf24}.sync-status[data-type="error"]{color:#fb7185}
      `;
      document.head.appendChild(style);
    }
    document.getElementById('pullSupabaseBtn')?.addEventListener('click',()=>pullFromSupabase({force:false}));
    document.getElementById('pushSupabaseBtn')?.addEventListener('click',()=>pushToSupabase({manual:true}));
  }

  // ── Sync indicator ────────────────────────────────────────────────────────
  function _updateSyncIndicator(ok) {
    const el = document.getElementById('mvSyncDot');
    if (!el) return;
    el.title = ok ? 'Synket ' + new Date().toLocaleTimeString() : 'Synkfeil — prøver igjen';
    el.style.background = ok ? '#34d399' : '#fb7185';
  }

  // ── Periodic heartbeat: push every 20s if dirty ──────────────────────────
  function _startHeartbeat() {
    if (_intervalId) return;
    _intervalId = setInterval(async () => {
      if (!_pendingPush || isPullingFromSupabase || !canWrite()) return;
      // Exponential backoff on repeated failure (max 5 min)
      if (_pushFailCount > 0) {
        const backoffMs = Math.min(_pushFailCount * 30000, 300000);
        if (Date.now() - lastPushAt < backoffMs) return;
      }
      await pushToSupabase();
    }, 20000);
  }

  // ── Push when tab becomes hidden (user switches away) ────────────────────
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && _pendingPush && canWrite()) {
      clearTimeout(pushTimer);
      pushToSupabase();
    }
  });

  // ── Push before page unload ───────────────────────────────────────────────
  window.addEventListener('beforeunload', () => {
    if (_pendingPush && canWrite()) {
      // Synchronous-style fire (best effort)
      pushToSupabase();
    }
  });

  // ── Push when network comes back online ───────────────────────────────────
  window.addEventListener('online', () => {
    if (_pendingPush && canWrite()) {
      setTimeout(() => pushToSupabase(), 1000);
    }
  });

  // ── Inject sync dot into topbar ───────────────────────────────────────────
  function _injectSyncDot() {
    if (document.getElementById('mvSyncDot')) return;
    // Find topbar gear button or notification bell as anchor
    const anchor = document.getElementById('mvGearBtn') || document.getElementById('mvNotifBell') || document.querySelector('.topbar-right, .top-bar, header');
    if (!anchor) return;
    const dot = document.createElement('span');
    dot.id = 'mvSyncDot';
    dot.title = 'Supabase sync';
    dot.style.cssText = 'width:8px;height:8px;border-radius:50%;background:#34d399;display:inline-block;margin-left:6px;flex-shrink:0;transition:background .3s;cursor:help';
    anchor.after(dot);
  }
  setTimeout(_injectSyncDot, 1500);
  setTimeout(_startHeartbeat, 2000);

  // ── Overstyr saveState ────────────────────────────────────────────────────
  const originalSaveState = saveState;
  saveState = function(){
    originalSaveState();
    schedulePush();
  };

  // Etter admin-sjekk: oppdater sync-panelet og aktiver push når admin er innlogget.
  if(typeof updateAdminUi === 'function'){
    const originalUpdateAdminUi = updateAdminUi;
    updateAdminUi = async function(){
      await originalUpdateAdminUi();
      installSyncPanel();
      const btn = document.getElementById('pushSupabaseBtn');
      if(btn) btn.disabled = !window.isAdminMode;
    };
    window.updateAdminUi = updateAdminUi;
  }

  window.mvSupabaseSync = {
    pull: pullFromSupabase,
    push: pushToSupabase,
    schedulePush,
    isReady: () => !!client()
  };

  // Expose directly so db.js and r2-storage.js can call it
  window.pushToSupabase = pushToSupabase;
  window.pullFromSupabase = pullFromSupabase;

  installSyncPanel();
  setTimeout(()=>pullFromSupabase(), 800);
})();
