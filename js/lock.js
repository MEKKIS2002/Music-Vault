// === main-script-0 ===
if(history.scrollRestoration) history.scrollRestoration = 'manual';

// ── Username → Supabase email mapping ──────────────────────────────────────
// Legg til nye brukere her: { brukernavn: 'epost@example.com' }
const USERNAME_MAP = {
  'marcus':   'marcus.aas.mekiassen@gmail.com',
  'erik':     'erikalfsen11@gmail.com',
  // ── Testbrukere per pakke ─────────────────────────────────────
  'artist':   'artist@test.no',
  'producer': 'producer@test.no',
  'lyricist': 'lyricist@test.no',
  'label':    'label@test.no',
  'viewer':   'viewer@test.no',
};
// ───────────────────────────────────────────────────────────────────────────

function getUserRole(){return sessionStorage.getItem('mv_role')||'';}
function isProducerUser(){return getUserRole()==='producer';}
function isViewerUser(){return getUserRole()==='viewer';}

function applyRoleMode(){
  const role = getUserRole();
  const isViewer = role === 'viewer';
  const isProducer = role === 'producer';

  document.body.classList.toggle('producer-mode', isProducer);
  document.body.classList.toggle('viewer-mode', isViewer);

  const viewerBtn = document.getElementById('viewerLoginBtn');
  if(viewerBtn) viewerBtn.style.display = isViewer ? 'flex' : 'none';

  const badge = document.getElementById('roleBadge');
  if(badge) badge.style.display = isViewer ? 'none' : '';

  // Pakke-systemet håndterer tab-synlighet for innloggede pakke-brukere
  if(typeof window.applyPackage === 'function'){
    window.applyPackage();
    return;
  }

  // Fallback for viewer/producer uten pakke-system
  if(isViewer){
    document.querySelectorAll('.tab-btn').forEach(b=>{
      const tab = b.dataset.tab;
      b.style.display = (tab === 'beats' || tab === 'mixtapes') ? '' : 'none';
    });
    document.querySelectorAll('.tab-view').forEach(v=>v.classList.add('hidden'));
    const mix = document.getElementById('mixtapesTab');
    if(mix){ mix.classList.remove('hidden'); }
    document.querySelectorAll('.tab-btn').forEach(b=>b.classList.toggle('active', b.dataset.tab==='mixtapes'));
  } else if(isProducer){
    const active=document.querySelector('.tab-btn.active');
    const activeTab=active?.dataset?.tab||'mixtapes';
    const allowed=['mixtapes','pipeline','beats'];
    const target=allowed.includes(activeTab)?activeTab:'mixtapes';
    document.querySelectorAll('.tab-btn').forEach(b=>b.classList.toggle('active',b.dataset.tab===target));
    document.querySelectorAll('.tab-view').forEach(v=>v.classList.add('hidden'));
    const view=document.getElementById(`${target}Tab`);if(view)view.classList.remove('hidden');
  }
}

// ── Vedvarende innlogging (14 dager, rullerende) ───────────────────────
// Supabase-sesjonen ligger allerede i localStorage (persistSession er på som
// standard, js/supabase.js). Det som slo deg ut var appens egen lås: den bodde
// i sessionStorage, som tømmes når fanen lukkes — og mobilnettlesere dreper
// bakgrunnsfaner hele tiden. Her speiler vi låsen til localStorage med en
// utløpsdato, og gjenoppretter den ved oppstart hvis Supabase-sesjonen lever.
// Ingen passord lagres noe sted.
const MV_SESSION_DAYS = 14;
const MV_SESSION_MS   = MV_SESSION_DAYS * 24 * 60 * 60 * 1000;
const MV_PERSIST_KEYS = ['mv_role','mv_package','mv_username','mv_user_id'];

// Rullerende: kalles ved innlogging OG ved hver gjenoppretting/oppstart, så
// fristen skyves 14 dager fram hver gang appen brukes.
function mvSavePersistentSession(){
  try{
    MV_PERSIST_KEYS.forEach(k=>{
      const v = sessionStorage.getItem(k);
      if(v) localStorage.setItem(k, v); else localStorage.removeItem(k);
    });
    localStorage.setItem('mv_session_expires', String(Date.now() + MV_SESSION_MS));
  }catch(e){ console.warn('[Lock] Kunne ikke lagre vedvarende sesjon:', e); }
}

function mvClearPersistentSession(){
  try{
    MV_PERSIST_KEYS.forEach(k=>localStorage.removeItem(k));
    localStorage.removeItem('mv_session_expires');
  }catch(e){}
}

function mvPersistentSessionValid(){
  try{
    const exp = parseInt(localStorage.getItem('mv_session_expires')||'0',10);
    return exp > Date.now() && !!localStorage.getItem('mv_role');
  }catch(e){ return false; }
}

// lock.js lastes FØR supabase.js i index.html, så window.supabaseClient finnes
// ikke når initLock() kjører. Vent på den i stedet for å anta at den er der.
function mvWaitForSupabase(timeout = 6000){
  return new Promise(resolve=>{
    if(window.supabaseClient) return resolve(window.supabaseClient);
    const t0 = Date.now();
    const iv = setInterval(()=>{
      if(window.supabaseClient){ clearInterval(iv); resolve(window.supabaseClient); }
      else if(Date.now()-t0 > timeout){ clearInterval(iv); resolve(null); }
    }, 50);
  });
}

function mvOnReady(fn){
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, {once:true});
  else fn();
}

// Skjuler innloggingskortet mens vi gjenoppretter, så du ikke ser skjemaet
// blinke (og tastaturet ikke spretter opp på mobil).
function mvShowRestoring(on){
  const card = document.getElementById('lockCard');
  let el = document.getElementById('mvRestoreMsg');
  if(on){
    if(card) card.style.display = 'none';
    if(!el){
      el = document.createElement('div');
      el.id = 'mvRestoreMsg';
      el.style.cssText = 'position:relative;z-index:2;color:rgba(244,164,67,.85);font-family:system-ui;font-size:12px;font-weight:800;letter-spacing:.2em;text-transform:uppercase';
      el.textContent = 'Logger inn…';
      document.getElementById('lockScreen')?.appendChild(el);
    }
    el.style.display = 'block';
  } else {
    if(el) el.remove();
    if(card) card.style.display = 'grid';
  }
}

// Bruker-spesifikk state fra localStorage (delt av innlogging + gjenoppretting)
function mvLoadUserState(uid){
  if(!uid || !window.state) return;
  const userRaw = localStorage.getItem('musicVault.v4.' + uid);
  if(!userRaw) return;
  try{
    const userData = JSON.parse(userRaw);
    if((userData.beats||[]).length > 0){
      if(typeof migrate === 'function') Object.assign(window.state, migrate(userData));
      else Object.assign(window.state, userData);
      if(typeof renderAll === 'function') renderAll();
    }
  } catch(e){ console.warn('[Lock] State load feilet:', e); }
}

// Label-fanen må tvinges synlig etter packages.js — samme grep som innlogging.
function mvForceLabelTab(){
  [0, 100, 500].forEach(delay => setTimeout(()=>{
    const btn = document.querySelector('.tab-btn[data-tab="label"]');
    if(btn) btn.style.display = 'inline-flex';
  }, delay));
}

// Returnerer true hvis sesjonen ble gjenopprettet.
async function mvRestoreSession(){
  if(!mvPersistentSessionValid()){
    if(localStorage.getItem('mv_session_expires')){
      // Utløpt (eller halvveis ryddet) → logg ordentlig ut
      mvClearPersistentSession();
      const c = await mvWaitForSupabase(2000);
      try{ await c?.auth.signOut(); }catch(e){}
      console.log('[Lock] Vedvarende sesjon utløpt — logget ut.');
    }
    return false;
  }

  const client = await mvWaitForSupabase();
  if(!client){ console.warn('[Lock] Supabase-klienten kom aldri — viser låseskjerm.'); return false; }

  // getSession() fornyer access-tokenet selv hvis det er utløpt; returnerer
  // null hvis refresh-tokenet er ugyldig/trukket tilbake.
  let session = null;
  try{ session = (await client.auth.getSession())?.data?.session || null; }
  catch(e){ console.warn('[Lock] getSession feilet:', e); }
  if(!session){ mvClearPersistentSession(); return false; }

  const username = localStorage.getItem('mv_username') || '';
  const uid      = session.user?.id || localStorage.getItem('mv_user_id') || '';

  // Rolle/pakke hentes FERSKT fra profiles, akkurat som ved vanlig innlogging.
  // Uten dette ville en bruker som ble degradert i admin-panelet beholdt
  // admin-grensesnittet i opptil 14 dager. (Selve datatilgangen er uansett
  // RLS-styrt i Supabase, men UI-et skal ikke lyve om hvem du er.)
  // Faller tilbake på hurtiglageret hvis nettet er nede, så offline-bruk virker.
  let role = localStorage.getItem('mv_role') || 'user';
  let pkg  = localStorage.getItem('mv_package') || (role === 'admin' ? 'admin' : 'artist');
  try{
    const {data: profile} = await client
      .from('profiles').select('role, package').eq('id', uid).maybeSingle();
    if(profile){
      role = profile.role === 'admin' ? 'admin' : 'user';
      pkg  = profile.package || (role === 'admin' ? 'admin' : 'artist');
    }
  }catch(e){ console.warn('[Lock] Kunne ikke friske opp rolle — bruker hurtiglager:', e); }

  // MÅ settes før pull så owner_id-filteret virker
  window._mvCurrentUserId = uid;
  window.currentAdminUser = session.user;
  sessionStorage.setItem('mv_user_id', uid);
  sessionStorage.setItem('mv_username', username);
  sessionStorage.setItem('mv_package', pkg);

  mvLoadUserState(uid);
  unlockAs(role);                       // setter mv_unlocked + mv_role + isAdminMode

  if(typeof window.setPackage === 'function') window.setPackage(pkg);
  if(typeof window.installLabelDashboard === 'function') window.installLabelDashboard();
  if(typeof window.installAdminPanel === 'function') window.installAdminPanel();
  if(role === 'admin' && typeof window.updateAdminUi === 'function') window.updateAdminUi();
  if(pkg === 'label') mvForceLabelTab();

  setTimeout(()=>{
    if(typeof window.mvSupabaseSync?.pull === 'function') window.mvSupabaseSync.pull();
  }, 400);

  mvSavePersistentSession();            // rullerende: 14 nye dager
  console.log('[Lock] Sesjon gjenopprettet:', {username, role, pkg});
  return true;
}

function returnToPasswordScreen(){
  // Tilbake på låseskjermen = logget ut. Uten dette ville neste lasting
  // gjenopprette sesjonen og kaste deg rett inn igjen.
  mvClearPersistentSession();
  sessionStorage.removeItem('mv_unlocked');
  sessionStorage.removeItem('mv_role');
  sessionStorage.removeItem('mv_package');
  sessionStorage.removeItem('mv_username');
  sessionStorage.removeItem('mv_user_id');
  window._mvCurrentUserId = null;
  document.body.classList.remove('producer-mode','viewer-mode','admin-mode');
  Object.keys(window.MV_PACKAGES||{}).forEach(k=>document.body.classList.remove('pkg-'+k));
  document.querySelectorAll('.tab-btn').forEach(b=>b.style.display='');
  const vBtn = document.getElementById('viewerLoginBtn');
  if(vBtn) vBtn.style.display = 'none';
  const lock=document.getElementById('lockScreen');
  if(lock)lock.style.display='flex';
  setTimeout(()=>document.getElementById('adminUsername')?.focus(),60);
}

function unlockAs(role){
  sessionStorage.setItem('mv_unlocked','1');
  sessionStorage.setItem('mv_role',role);
  const lock = document.getElementById('lockScreen');
  if(lock) lock.style.display='none';
  if(role === 'admin'){
    window.isAdminMode = true;
    document.body.classList.add('admin-mode');
  } else {
    window.isAdminMode = false;
    document.body.classList.remove('admin-mode');
  }

  // ── Alltid-synlig brukerknapp ────────────────────────────────
  injectUserCorner(role);
  // Varsel-bjelle
  setTimeout(()=>{ if(typeof window.installNotificationBell==='function') window.installNotificationBell(); }, 1500);

  applyRoleMode();
}

function injectUserCorner(role){
  // Target the header right slot (no longer fixed-position overlay)
  const slot = document.getElementById('mvHeaderRight');
  if(!slot) return;
  slot.innerHTML = '';

  const username = sessionStorage.getItem('mv_username') || role;
  const pkg      = sessionStorage.getItem('mv_package')  || role;
  const isAdmin  = role === 'admin';
  const pkgLabels = {
    admin:'Admin', artist:'Artist', producer:'Produsent',
    lyricist:'Tekstforfatter', label:'Label', viewer:'Lytter', pro:'PRO', user:'Bruker'
  };
  const pkgLabel = pkgLabels[pkg] || pkg;

  // Notification bell slot — app.js will place the bell here directly
  const bellSlotDiv = document.createElement('div');
  bellSlotDiv.id = 'mvNotifBellSlot';
  // Don't add mv-hdr-icon-btn here — the bell button itself has that class
  bellSlotDiv.style.cssText = 'display:flex;align-items:center;';
  slot.appendChild(bellSlotDiv);

  // Gear/settings button with dropdown
  slot.insertAdjacentHTML('beforeend', `
    <div style="position:relative">
      <button id="mvGearBtn" class="mv-hdr-icon-btn" onclick="mvToggleGearMenu(event)" title="Innstillinger" aria-label="Innstillinger">⚙</button>
      <div id="mvGearMenu" class="mv-gear-dropdown" style="display:none">
        <div class="mv-gear-header">
          <div class="mv-gear-username">${username}</div>
          ${!isAdmin ? '<div class="mv-gear-pkg">'+pkgLabel+'</div>' : ''}
        </div>
        <div class="mv-gear-divider"></div>
        <div id="mvGearLabelItem" style="display:none">
          <button class="mv-gear-item mv-gear-danger" onclick="mvGearLeaveLabel()">👋 Forlat label</button>
        </div>
        <button class="mv-gear-item" onclick="mvLogout()">🚪 Logg ut</button>
      </div>
    </div>`);

  // Username + avatar
  slot.insertAdjacentHTML('beforeend', `
    <div class="mv-hdr-user">
      <div class="mv-hdr-username">${username}</div>
      <div class="mv-hdr-avatar">${(username||'?').slice(0,2).toUpperCase()}</div>
    </div>`);

  // Admin badge
  if(isAdmin){
    slot.insertAdjacentHTML('beforeend',
      '<div class="mv-hdr-admin-badge">&#9889; ADMIN</div>');
  }

  // Bell is placed by installNotificationBell() in app.js — no manual move needed

  // Close gear menu on outside click
  document.addEventListener('click', e => {
    const menu = document.getElementById('mvGearMenu');
    const btn  = document.getElementById('mvGearBtn');
    if(menu && !menu.contains(e.target) && e.target !== btn) menu.style.display='none';
  });

  if(!isAdmin){
    const panel = document.getElementById('supabaseDataSyncPanel');
    if(panel) panel.style.display = 'none';
    const adminLogout = document.getElementById('adminLogoutBox');
    if(adminLogout) adminLogout.style.display = 'none';
    const vBtn = document.getElementById('viewerLoginBtn');
    if(vBtn) vBtn.style.display = 'none';
  }
}

window.mvToggleGearMenu = function(e){
  e.stopPropagation();
  const menu = document.getElementById('mvGearMenu');
  if(!menu) return;
  menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
};

// Oppdater gear-menyen med "Forlat label" hvis artisten er i et label
window.mvUpdateGearMenu = function(labelId, labelName){
  const item = document.getElementById('mvGearLabelItem');
  if(!item) return;
  item.style.display = 'block';
  item.querySelector('button').onclick = () => window.leaveLabel(labelId, labelName);
};

window.mvGearLeaveLabel = function(){
  // Kalles fra gear-menyen — henter label-info fra banner-data
  if(window._mvCurrentLabelId) window.leaveLabel(window._mvCurrentLabelId, window._mvCurrentLabelName);
};

window.mvLogout = async function(){
  // Logg ut fra Supabase
  if(window.supabaseClient) await window.supabaseClient.auth.signOut().catch(()=>{});
  window.isAdminMode = false;
  window.currentAdminUser = null;
  document.getElementById('mvUserCorner')?.remove();
  returnToPasswordScreen();
};

function loginViewer(){
  unlockAs('viewer');
}

function switchLockTab(tab){
  const adminCard   = document.getElementById('lockCardAdmin');
  const viewerCard  = document.getElementById('lockCardViewer');
  const adminBtn    = document.getElementById('lockTabAdmin');
  const viewerBtn   = document.getElementById('lockTabViewer');
  const active = 'background:linear-gradient(135deg,#f4a443,#cb6e1a);color:#fff;';
  const inactive = 'background:transparent;color:#aaa4bd;';
  if(tab==='admin'){
    adminCard.style.display='grid';
    viewerCard.style.display='none';
    if(adminBtn) adminBtn.style.cssText += active;
    if(viewerBtn) viewerBtn.style.cssText += inactive;
    document.getElementById('adminUsername')?.focus();
  } else {
    adminCard.style.display='none';
    viewerCard.style.display='grid';
    if(viewerBtn) viewerBtn.style.cssText += active;
    if(adminBtn) adminBtn.style.cssText += inactive;
  }
}

// ── Innlogging med brukernavn ─────────────────────────────────────────────
async function loginWithUsername(){
  const username = (document.getElementById('adminUsername')?.value||'').trim().toLowerCase();
  const password = document.getElementById('adminPassword')?.value||'';
  const errEl = document.getElementById('lockError');
  const btn = document.getElementById('lockLoginBtn');

  if(!username || !password){
    if(errEl){errEl.textContent='Fyll inn brukernavn og passord.';errEl.style.display='block';}
    return;
  }

  const email = USERNAME_MAP[username];
  let loginEmail = email;

  if(!loginEmail){
    if(username.includes('@')){
      // Direkte e-post-innlogging
      loginEmail = username;
    } else {
      // Slå opp e-post fra profiles-tabellen
      if(errEl){errEl.textContent='Søker...';errEl.style.display='block';}
      try {
        const SB_URL = 'https://ylvqkfdvijqnecuqznyr.supabase.co';
        const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlsdnFrZmR2aWpxbmVjdXF6bnlyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgzMzA4MzIsImV4cCI6MjA5MzkwNjgzMn0.bYPTaxQK8n7I7w5Ri2DVYW5_LbFHg2IXkuhHsLTDDqc';
        // Sikker oppslag via RPC (anon kan ikke lenger dumpe alle eposter)
        const res = await fetch(
          `${SB_URL}/rest/v1/rpc/lookup_login_email`,
          {method:'POST',headers:{'apikey':SB_KEY,'Authorization':'Bearer '+SB_KEY,'Content-Type':'application/json'},body:JSON.stringify({p_username:username})}
        );
        const foundEmail = res.ok ? await res.json() : null;
        if(!foundEmail){
          if(errEl){errEl.textContent='Ukjent brukernavn.';errEl.style.display='block';}
          if(btn){btn.disabled=false;btn.textContent='Logg inn';}
          return;
        }
        loginEmail = foundEmail;
      } catch(e) {
        if(errEl){errEl.textContent='Kunne ikke koble til. Prøv igjen.';errEl.style.display='block';}
        if(btn){btn.disabled=false;btn.textContent='Logg inn';}
        return;
      }
    }
  }

  if(btn){btn.disabled=true;btn.textContent='Logger inn...';}
  if(errEl){errEl.style.display='none';}

  try {
    if(!window.supabaseClient){
      if(errEl){errEl.textContent='Supabase ikke konfigurert.';errEl.style.display='block';}
      return;
    }

    const {data, error} = await window.supabaseClient.auth.signInWithPassword({email: loginEmail, password});
    if(error) throw error;

    // Hent rolle OG pakke fra profiles
    const {data: profile} = await window.supabaseClient
      .from('profiles')
      .select('role, package')
      .eq('id', data.user.id)
      .maybeSingle();

    const role = profile?.role || 'user';
    const pkg  = profile?.package || (role === 'admin' ? 'admin' : 'artist');
    console.log('[Lock] Innlogget:', {role, pkg, profile});

    // Cache user ID — MÅ settes før pull så owner_id-filteret virker
    window._mvCurrentUserId = data.user.id;
    sessionStorage.setItem('mv_user_id', data.user.id);

    // Last bruker-spesifikk state fra localStorage
    mvLoadUserState(data.user.id);

    // Lagre i sessionStorage
    sessionStorage.setItem('mv_username', username);
    sessionStorage.setItem('mv_package', pkg);

    if(role === 'admin'){
      window.isAdminMode = true;
      window.currentAdminUser = data.user;
      document.body.classList.add('admin-mode');
      unlockAs('admin');
      if(typeof window.mvSupabaseSync?.pull === 'function') window.mvSupabaseSync.pull();
      if(typeof window.updateAdminUi === 'function') window.updateAdminUi();
    } else {
      window.isAdminMode = false;
      window.currentAdminUser = data.user;
      document.body.classList.remove('admin-mode');
      unlockAs('user');
      // Liten forsinkelse så Supabase-klienten registrerer ny session før pull
      setTimeout(()=>{
        if(typeof window.mvSupabaseSync?.pull === 'function') window.mvSupabaseSync.pull();
      }, 400);
    }

    // Husk innloggingen i 14 dager (rullerende) — må stå ETTER unlockAs(),
    // som er det som setter mv_role i sessionStorage.
    mvSavePersistentSession();

    // Anvend pakke-begrensninger
    if(typeof window.setPackage === 'function') window.setPackage(pkg);
    if(typeof window.installLabelDashboard === 'function') window.installLabelDashboard();
    if(typeof window.installAdminPanel === 'function') window.installAdminPanel();

    // Vis label-tab — sett med timeout for å overryde packages.js
    if(pkg === 'label'){
      [0, 100, 500].forEach(delay => setTimeout(()=>{
        const btn = document.querySelector('.tab-btn[data-tab="label"]');
        if(btn) btn.style.display = '';
        if(btn) btn.style.removeProperty('display'); // fjern inline style
        if(btn) btn.style.display = 'inline-flex';
      }, delay));
    }

  } catch(e) {
    if(errEl){errEl.textContent=e.message||'Innlogging feilet.';errEl.style.display='block';}
    // Logg ut hvis noe gikk galt
    window.supabaseClient?.auth.signOut().catch(()=>{});
  } finally {
    if(btn){btn.disabled=false;btn.textContent='Logg inn';}
  }
}

function loginProducer(){unlockAs('producer');}
async function checkPw(){}

function initLock(){
  // 1) Samme fane, vanlig reload — sessionStorage lever fortsatt.
  if(sessionStorage.getItem('mv_unlocked')==='1'){
    document.getElementById('lockScreen').style.display='none';
    const role = sessionStorage.getItem('mv_role') || '';
    if(role === 'admin'){
      window.isAdminMode = true;
      document.body.classList.add('admin-mode');
    }
    // Gjenopprett brukerknapp
    injectUserCorner(role);
    applyRoleMode();
    if(mvPersistentSessionValid()) mvSavePersistentSession();   // rullerende
    return;
  }

  // 2) Ny fane / lukket nettleser, men enheten er husket → gjenopprett.
  //    Må vente på supabase.js (lastes etter lock.js), derfor mvOnReady.
  if(mvPersistentSessionValid()){
    mvShowRestoring(true);
    mvOnReady(async ()=>{
      let ok = false;
      try{ ok = await mvRestoreSession(); }
      catch(e){ console.warn('[Lock] Gjenoppretting feilet:', e); }
      mvShowRestoring(false);
      if(!ok) setTimeout(()=>document.getElementById('adminUsername')?.focus(), 60);
    });
    return;
  }

  // 3) Utløpt frist → logg ut av Supabase i bakgrunnen.
  if(localStorage.getItem('mv_session_expires')) mvOnReady(()=>{ mvRestoreSession().catch(()=>{}); });

  setTimeout(()=>document.getElementById('adminUsername')?.focus(), 60);
}
initLock();

// ── Onboarding / registrering ─────────────────────────────────────────────
let _selectedPkg = 'artist';

window.selectPkg = function(el) {
  document.querySelectorAll('.pkg-card').forEach(c => {
    c.style.border = '1px solid rgba(255,255,255,.1)';
    c.style.background = 'rgba(255,255,255,.03)';
    c.querySelector('div').style.color = '#f4ede4';
  });
  el.style.border = '1px solid rgba(244,164,67,.5)';
  el.style.background = 'rgba(244,164,67,.08)';
  el.querySelector('div').style.color = '#f4a443';
  _selectedPkg = el.dataset.pkg;
  // Vis invitasjonskode-felt for label
  const inviteWrap = document.getElementById('regInviteWrap');
  if(inviteWrap) inviteWrap.style.display = _selectedPkg === 'label' ? 'block' : 'none';
};

window.showRegister = function() {
  document.getElementById('lockCard').style.display = 'none';
  const rc = document.getElementById('registerCard');
  rc.style.display = 'grid';
  rc.style.animation = 'lockCardEnter .4s cubic-bezier(.22,.68,0,1.2) both';
};

window.showLogin = function() {
  document.getElementById('registerCard').style.display = 'none';
  document.getElementById('lockCard').style.display = 'grid';
};

window.registerUser = async function() {
  const username = document.getElementById('regUsername')?.value?.trim().toLowerCase();
  const email    = document.getElementById('regEmail')?.value?.trim();
  const password = document.getElementById('regPassword')?.value;
  const invite   = document.getElementById('regInvite')?.value?.trim().toUpperCase();
  const errEl    = document.getElementById('regError');
  const btn      = document.getElementById('regBtn');

  if(errEl) errEl.style.display = 'none';

  // Validering
  if(!username || !email || !password) {
    if(errEl){ errEl.textContent='Fyll inn alle feltene.'; errEl.style.display='block'; }
    return;
  }
  if(username.length < 3) {
    if(errEl){ errEl.textContent='Brukernavnet må være minst 3 tegn.'; errEl.style.display='block'; }
    return;
  }
  if(password.length < 6) {
    if(errEl){ errEl.textContent='Passordet må være minst 6 tegn.'; errEl.style.display='block'; }
    return;
  }

  // Label krever invitasjonskode
  if(_selectedPkg === 'label') {
    if(!invite) {
      if(errEl){ errEl.textContent='Label-pakken krever en invitasjonskode.'; errEl.style.display='block'; }
      return;
    }
    // Valider koden mot Supabase
    const SB_URL = 'https://ylvqkfdvijqnecuqznyr.supabase.co';
    const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlsdnFrZmR2aWpxbmVjdXF6bnlyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgzMzA4MzIsImV4cCI6MjA5MzkwNjgzMn0.bYPTaxQK8n7I7w5Ri2DVYW5_LbFHg2IXkuhHsLTDDqc';
    const r = await fetch(`${SB_URL}/rest/v1/invite_codes?code=eq.${invite}&select=code,used_by`, {
      headers:{'apikey':SB_KEY,'Authorization':'Bearer '+SB_KEY}
    });
    const codes = await r.json();
    if(!codes.length) {
      if(errEl){ errEl.textContent='Ugyldig invitasjonskode.'; errEl.style.display='block'; }
      return;
    }
    if(codes[0].used_by) {
      if(errEl){ errEl.textContent='Denne koden er allerede brukt.'; errEl.style.display='block'; }
      return;
    }
  }

  if(btn){ btn.disabled=true; btn.textContent='Oppretter konto...'; }

  try {
    if(!window.supabaseClient) throw new Error('Supabase ikke konfigurert');

    // Registrer bruker med metadata
    const { data, error } = await window.supabaseClient.auth.signUp({
      email,
      password,
      options: { data: { username, package: _selectedPkg } }
    });

    if(error) throw error;

    // Opprett profil-rad manuelt (trigger er fjernet)
    if(data.user) {
      const SB_URL = 'https://ylvqkfdvijqnecuqznyr.supabase.co';
      const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlsdnFrZmR2aWpxbmVjdXF6bnlyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgzMzA4MzIsImV4cCI6MjA5MzkwNjgzMn0.bYPTaxQK8n7I7w5Ri2DVYW5_LbFHg2IXkuhHsLTDDqc';
      await fetch(`${SB_URL}/rest/v1/profiles`, {
        method: 'POST',
        headers: {
          'apikey': SB_KEY,
          'Authorization': `Bearer ${data.session?.access_token || SB_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'resolution=merge-duplicates'
        },
        body: JSON.stringify({
          id: data.user.id,
          username,
          email,
          role: 'user',
          package: _selectedPkg
        })
      });
    }

    if(error) throw error;

    // Merk invitasjonskode som brukt
    if(_selectedPkg === 'label' && data.user) {
      const SB_URL = 'https://ylvqkfdvijqnecuqznyr.supabase.co';
      const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlsdnFrZmR2aWpxbmVjdXF6bnlyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgzMzA4MzIsImV4cCI6MjA5MzkwNjgzMn0.bYPTaxQK8n7I7w5Ri2DVYW5_LbFHg2IXkuhHsLTDDqc';
      await fetch(`${SB_URL}/rest/v1/invite_codes?code=eq.${invite}`, {
        method:'PATCH',
        headers:{'apikey':SB_KEY,'Authorization':'Bearer '+SB_KEY,'Content-Type':'application/json','Prefer':'return=minimal'},
        body: JSON.stringify({ used_by: data.user.id, used_at: new Date().toISOString() })
      });
    }

    // Logg inn automatisk
    sessionStorage.setItem('mv_username', username);
    sessionStorage.setItem('mv_package', _selectedPkg);
    window._mvCurrentUserId = data.user?.id;
    sessionStorage.setItem('mv_user_id', data.user?.id || '');

    if(errEl){ errEl.style.color='#34d399'; errEl.textContent='✓ Konto opprettet! Logger inn...'; errEl.style.display='block'; }

    setTimeout(async () => {
      const { data: loginData, error: loginErr } = await window.supabaseClient.auth.signInWithPassword({ email, password });

      if(loginErr){
        // Sannsynligvis e-postbekreftelse påkrevd
        if(errEl){
          errEl.style.color='#60a5fa';
          errEl.textContent='✓ Konto opprettet! Sjekk e-posten din for å bekrefte kontoen, logg deretter inn.';
          errEl.style.display='block';
        }
        if(btn){ btn.disabled=false; btn.textContent='Opprett konto'; }
        // Bytt tilbake til innloggingsskjerm etter 3 sekunder
        setTimeout(()=>{
          showLogin();
          const u = document.getElementById('adminUsername');
          if(u) u.value = email;
        }, 3000);
        return;
      }

      // Sett userId før unlock
      window._mvCurrentUserId = loginData.user.id;
      sessionStorage.setItem('mv_user_id', loginData.user.id);
      sessionStorage.setItem('mv_username', username);
      sessionStorage.setItem('mv_package', _selectedPkg);
      localStorage.setItem('mv_last_user', username);

      window.isAdminMode = false;
      window.currentAdminUser = loginData.user;
      document.body.classList.remove('admin-mode');

      if(typeof window.setPackage === 'function') window.setPackage(_selectedPkg);

      // Marker som innlogget (uten unlockAs, så fade-animasjonen beholdes)
      sessionStorage.setItem('mv_unlocked','1');
      sessionStorage.setItem('mv_role','user');
      injectUserCorner('user');
      mvSavePersistentSession();

      // Skjul lock screen
      const lockScreen = document.getElementById('lockScreen');
      if(lockScreen){ lockScreen.style.transition='opacity .6s'; lockScreen.style.opacity='0'; setTimeout(()=>{ lockScreen.style.display='none'; }, 650); }

      setTimeout(()=>{
        if(typeof window.mvSupabaseSync?.pull === 'function') window.mvSupabaseSync.pull();
        if(typeof renderAll === 'function') renderAll();
      }, 500);

    }, 800);

  } catch(e) {
    if(errEl){ errEl.style.color='#fb7185'; errEl.textContent = e.message || 'Registrering feilet.'; errEl.style.display='block'; }
    if(btn){ btn.disabled=false; btn.textContent='Opprett konto'; }
  }
};

// Legg til USERNAME_MAP for nye brukere dynamisk
const _origLogin2 = window.loginWithUsername;
if(_origLogin2 && !window._usernameFallbackPatched) {
  window._usernameFallbackPatched = true;
  window.loginWithUsername = async function() {
    const username = (document.getElementById('adminUsername')?.value||'').trim().toLowerCase();
    // Hvis brukernavn ikke er i USERNAME_MAP, prøv å finne epost fra profiles
    if(username && !USERNAME_MAP[username] && window.supabaseClient) {
      const { data } = await window.supabaseClient
        .from('profiles')
        .select('id, username')
        .eq('username', username)
        .maybeSingle();
      if(data) {
        // Hent epost fra auth (kun mulig som anon via signin)
        // Fallback: vis "ukjent brukernavn" fra original
      }
    }
    return _origLogin2.apply(this, arguments);
  };
}
