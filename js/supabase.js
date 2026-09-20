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
    // ⚠️ HOVEDÅRSAKEN til at endringer stille sluttet å lagre:
    // "klarte ikke å sjekke rollen" er IKKE det samme som "ikke admin".
    // Returnerte vi false her, ble skrivetilgangen slått av ved hver
    // nettverksglipp — og updateAdminUi() kjøres fra onAuthStateChange,
    // altså hver gang tokenet fornyes (~1 t) og når fanen får fokus igjen
    // på mobil. Etter det returnerte pushToSupabase() stille false for
    // alltid, mens synk-prikken fortsatt lyste grønt.
    console.error("Kunne ikke sjekke admin-rolle:", error);
    showAdminMessage(`Kunne ikke sjekke admin-rolle: ${error.message}`, "error");
    return null;                      // ukjent — ikke "nei"
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
    // null = kunne ikke sjekke → behold forrige status i stedet for å
    // degradere. Se kommentaren i checkAdminRole.
    const verdict = user ? await checkAdminRole(user.id) : false;
    if (verdict === null) {
      window.isAdminMode = !!window.isAdminMode || sessionStorage.getItem('mv_role') === 'admin';
      console.warn('[Sync] Rollesjekk feilet — beholder forrige skrivetilgang:', window.isAdminMode);
    } else {
      window.isAdminMode = verdict;
    }

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
  let _hasPulledOk = false;      // har vi sett skyens innhold denne økta?
  let _pushingBeforePull = false;// vakt mot rekursjon push↔pull
  let _pendingSince = 0;         // når noe først ble ulagret (for varsling)

  // Dirty-flagget lagres i localStorage så en ulagret endring overlever at
  // mobilnettleseren dreper fanen — da pushes den ved neste oppstart i
  // stedet for å bli overskrevet av neste pull.
  const PENDING_KEY = 'mv_sync_pending';
  function _setPending(on){
    _pendingPush = on;
    if(on && !_pendingSince) _pendingSince = Date.now();
    if(!on) _pendingSince = 0;
    try{ on ? localStorage.setItem(PENDING_KEY,'1') : localStorage.removeItem(PENDING_KEY); }catch(e){}
  }
  function _hasPendingFlag(){ try{ return localStorage.getItem(PENDING_KEY)==='1'; }catch(e){ return false; } }

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

    // ⚠️ Pull er en HARD overskriving av lokal state (st.beats = ...). Har vi
    // ulagrede endringer — også fra en tidligere økt der fanen ble drept —
    // må de opp FØRST, ellers sletter skyens eldre versjon dem. Dette er den
    // andre halvdelen av "endringene mine forsvant".
    if((_pendingPush || _hasPendingFlag()) && !_pushingBeforePull){
      _pendingPush = true;
      if(canWrite()){
        _pushingBeforePull = true;
        console.warn('[Sync] Ulagrede endringer funnet — pusher før pull.');
        try{ await pushToSupabase(); }
        catch(e){ console.error('[Sync] Push før pull feilet:', e); }
        finally{ _pushingBeforePull = false; }
      }
      // Kom de fortsatt ikke opp (offline/blokkert)? Da nekter vi å hente —
      // bedre å stå på lokale data enn å få dem overskrevet.
      if(_pendingPush){
        console.warn('[Sync] Avbryter pull: ulagrede endringer ville blitt overskrevet.');
        say('Ulagrede endringer — henter ikke fra skyen før de er lagret.', 'warning');
        _updateSyncIndicator('error');
        return false;
      }
    }

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

      if(remoteIsEmpty && uid && localHasData){
        // Skyen er tom mens vi HAR lokale data. Det er nesten alltid en
        // mislykket første push — ikke en reelt tom profil. Slett aldri
        // lokalt i det tilfellet; last opp i stedet.
        console.warn('[Sync] Skyen er tom men lokalt har data — laster opp i stedet for å slette.');
        say('Skyen er tom, men du har lokale data — laster opp i stedet.', 'warning');
        isPullingFromSupabase = false;
        if(canWrite()) await pushToSupabase();
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

      _hasPulledOk = true;   // nå vet vi hva skyen inneholder → sletting er trygt
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
    // Samme predikat som schedulePush()/heartbeat bruker. Før sjekket denne
    // window.isAdminMode direkte mens de andre brukte canWrite() — de
    // planla altså pusher som denne stille nektet å utføre.
    if(!canWrite()){
      _updateSyncIndicator('blocked');
      console.warn('[Sync] Push blokkert — mangler skrivetilgang.');
      if(manual) say('Du må være innlogget som admin for å skrive til Supabase.', 'warning');
      return false;
    }
    if(isPullingFromSupabase) return false;

    _updateSyncIndicator('saving');
    say('Lagrer til Supabase...', 'info');
    try{
      const beats = (st.beats || []).map(packBeat);
      const albums = (st.albums || []).map(packAlbum);
      const mixtapes = (st.mixtapes || []).map(packMixtape);

      // ⚠️ deleteMissingRows sletter ALT i skyen som ikke finnes lokalt. Med
      // tom eller halvlastet state ville den tømt hele biblioteket. Invariant:
      // vi sletter bare hvis vi FAKTISK har sett skyens innhold denne økta
      // (vellykket pull) OG har noe lokalt. Ellers kun upsert — da kan en
      // sletting bli hengende igjen til neste økt, men ingenting går tapt.
      const totalLocal = beats.length + albums.length + mixtapes.length;
      if(_hasPulledOk && totalLocal > 0){
        await deleteMissingRows('beats', beats.map(x=>x.id));
        await deleteMissingRows('albums', albums.map(x=>x.id));
        await deleteMissingRows('mixtapes', mixtapes.map(x=>x.id));
      } else {
        console.warn('[Sync] Hopper over sletting (ingen fullført pull / tom state) — kun upsert.',
          { hasPulledOk: _hasPulledOk, totalLocal });
      }

      if(beats.length){ const r = await client().from('beats').upsert(beats, { onConflict:'id' }); if(r.error) throw r.error; }
      if(albums.length){ const r = await client().from('albums').upsert(albums, { onConflict:'id' }); if(r.error) throw r.error; }
      if(mixtapes.length){ const r = await client().from('mixtapes').upsert(mixtapes, { onConflict:'id' }); if(r.error) throw r.error; }

      await syncRelations('album_beats', 'album_id', st.albums || []);
      await syncRelations('mixtape_beats', 'mixtape_id', st.mixtapes || []);

      lastPushAt = Date.now();
      _setPending(false);
      _pushFailCount = 0;
      say(`Lagret ${new Date(lastPushAt).toLocaleTimeString()}.`, 'success');
      _updateSyncIndicator('saved');
      if(manual) toast('\u2713 Lokale data migrert til Supabase');
      return true;
    }catch(err){
      console.error('Supabase push-feil:', err);
      _pushFailCount++;
      _setPending(true); // still dirty — needs retry
      const hint = /metadata/i.test(err.message || '')
        ? ' Mangler metadata-kolonne.'
        : '';
      say(`Lagring feilet (fors\u00f8k ${_pushFailCount}): ${err.message || err}.${hint}`, 'error');
      _updateSyncIndicator('error');
      return false;
    }
  }

  function schedulePush(){
    _setPending(true);
    _updateSyncIndicator('pending');
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
  // Prikken skal fortelle SANNHETEN. Før lyste den grønt også når pushen
  // stille ble nektet, fordi den bare ble oppdatert inne i push-funksjonen.
  const SYNC_STATES = {
    saved:   { color:'#34d399', text:()=>'Lagret i skyen ' + new Date(lastPushAt||Date.now()).toLocaleTimeString() },
    saving:  { color:'#60a5fa', text:()=>'Lagrer…' },
    pending: { color:'#fbbf24', text:()=>'Ulagrede endringer — lagrer straks' },
    blocked: { color:'#fb7185', text:()=>'IKKE lagret i skyen — mangler skrivetilgang. Klikk for å prøve igjen.' },
    error:   { color:'#fb7185', text:()=>'Lagring feilet — klikk for å prøve igjen' },
  };
  let _syncState = 'saved';
  function _updateSyncIndicator(stateOrOk) {
    // Bakoverkompatibelt: gamle kall sendte true/false.
    const state = stateOrOk === true ? 'saved' : stateOrOk === false ? 'error' : stateOrOk;
    _syncState = state;
    const el = document.getElementById('mvSyncDot');
    if (!el) return;
    const s = SYNC_STATES[state] || SYNC_STATES.saved;
    el.style.background = s.color;
    el.title = s.text();
    el.style.cursor = (state === 'error' || state === 'blocked') ? 'pointer' : 'help';
  }

  // ── Periodic heartbeat: push every 20s if dirty ──────────────────────────
  let _staleWarned = false;
  function _startHeartbeat() {
    if (_intervalId) return;
    _intervalId = setInterval(async () => {
      if (!_pendingPush) { if(_syncState === 'pending') _updateSyncIndicator('saved'); return; }

      // Har noe stått ulagret i over ett minutt, skal brukeren FÅ VITE DET.
      if (_pendingSince && Date.now() - _pendingSince > 60000) {
        _updateSyncIndicator(canWrite() ? 'error' : 'blocked');
        if (!_staleWarned) {
          _staleWarned = true;
          console.error('[Sync] Endringer har stått ulagret i over 60 s.');
          toast('⚠ Endringer er ikke lagret i skyen — sjekk nett/innlogging');
        }
      }
      if (isPullingFromSupabase || !canWrite()) return;
      // Exponential backoff on repeated failure (max 5 min)
      if (_pushFailCount > 0) {
        const backoffMs = Math.min(_pushFailCount * 30000, 300000);
        if (Date.now() - lastPushAt < backoffMs) return;
      }
      const ok = await pushToSupabase();
      if (ok) _staleWarned = false;
    }, 20000);
  }

  // ── Push when tab becomes hidden (user switches away) ────────────────────
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && _pendingPush && canWrite()) {
      clearTimeout(pushTimer);
      pushToSupabase();
    }
  });

  // ── Push når siden legges bort ────────────────────────────────────────────
  // iOS Safari fyrer IKKE beforeunload pålitelig — 'pagehide' er det som
  // faktisk kommer når du bytter app eller lukker fanen på telefon. Pushen er
  // async og rekker ofte ikke å fullføre; derfor er det varige dirty-flagget
  // (PENDING_KEY) den egentlige garantien — det overlever at fanen drepes og
  // pushes ved neste oppstart, før pull får overskrive noe.
  window.addEventListener('pagehide', () => {
    if (_pendingPush && canWrite()) { clearTimeout(pushTimer); pushToSupabase(); }
  });
  window.addEventListener('beforeunload', () => {
    if (_pendingPush && canWrite()) pushToSupabase();
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
    dot.addEventListener('click', () => {
      if (_syncState === 'error' || _syncState === 'blocked') { _staleWarned = false; pushToSupabase({manual:true}); }
    });
    anchor.after(dot);
    _updateSyncIndicator(_pendingPush ? 'pending' : 'saved');
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
  // Lå det ulagrede endringer igjen fra forrige økt (fanen ble drept før
  // pushen rakk å kjøre)? pullFromSupabase() oppdager flagget selv og pusher
  // dem opp før den henter — se vakten øverst i den funksjonen.
  if(_hasPendingFlag()){
    _pendingPush = true;
    _pendingSince = Date.now();
    console.warn('[Sync] Ulagrede endringer fra forrige økt funnet.');
  }
  setTimeout(()=>pullFromSupabase(), 800);
})();
