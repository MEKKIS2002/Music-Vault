// === main-script-0 ===
if(history.scrollRestoration) history.scrollRestoration = 'manual';

// Innlogging med brukernavn går via Edge Function «login-username» — e-postadressen
// bak et brukernavn sendes aldri til nettleseren.

function getUserRole(){return sessionStorage.getItem('mv_role')||'';}
function isProducerUser(){return getUserRole()==='producer';}

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
    localStorage.removeItem('mv_impersonator');   // utlogging avslutter også «Bytt bruker»
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
      el.style.cssText = 'position:relative;z-index:2;color:rgb(var(--accent-ink-rgb) / calc(.85 + (1 - .85) * var(--ink-boost)));font-family:system-ui;font-size:12px;font-weight:800;letter-spacing:.2em;text-transform:uppercase';
      el.innerHTML = '<div class="mv-restore-txt">Logger inn…</div>'
        + '<div class="mv-restore-slow" hidden>'
        +   '<p>Det tar lengre tid enn vanlig.</p>'
        +   '<div class="mv-restore-btns">'
        +     '<button type="button" data-act="retry">Prøv igjen</button>'
        +     '<button type="button" data-act="logout">Logg ut</button>'
        +   '</div>'
        + '</div>';
      el.addEventListener('click', e=>{
        const b = e.target.closest('[data-act]'); if(!b) return;
        if(b.dataset.act === 'retry') location.reload();
        else mvHardLogout();
      });
      document.getElementById('lockScreen')?.appendChild(el);
    }
    el.style.display = 'block';
    clearTimeout(window._mvSlowTimer);
    // Etter 6 s: vis «Prøv igjen» / «Logg ut» så man aldri sitter fast
    window._mvSlowTimer = setTimeout(()=>{ const s = el.querySelector('.mv-restore-slow'); if(s) s.hidden = false; }, 6000);
  } else {
    clearTimeout(window._mvSlowTimer);
    if(el) el.remove();
    if(card) card.style.display = 'grid';
  }
}

// Promise med tidsfrist: gir `fallback` hvis kallet ikke svarer i tide.
function mvWithTimeout(p, ms, fallback){
  return Promise.race([
    Promise.resolve(p).catch(()=>fallback),
    new Promise(r=>setTimeout(()=>r(fallback), ms))
  ]);
}

// Nødutgang: rydd ALL lokal innlogging (også Supabase-tokenet) uten å vente
// på nettet, og last siden på nytt med innloggingsskjemaet.
function mvHardLogout(){
  mvStopAllAudio();
  try{
    mvClearPersistentSession();
    Object.keys(localStorage).filter(k=>/^sb-.*-auth-token/.test(k)).forEach(k=>localStorage.removeItem(k));
    ['mv_unlocked','mv_role','mv_package','mv_username','mv_user_id'].forEach(k=>sessionStorage.removeItem(k));
  }catch(e){}
  try{ window.supabaseClient?.auth.signOut({ scope:'local' }).catch(()=>{}); }catch(e){}
  setTimeout(()=>location.reload(), 150);
}
window.mvHardLogout = mvHardLogout;

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

// Uten nett: åpne med det som er husket lokalt (ingen skriving skjer før nettet er tilbake,
// og synk/pull feiler stille). Laster siden på nytt når nettet kommer, så alt friskes opp.
function mvRestoreOffline(){
  const uid = localStorage.getItem('mv_user_id'), role = localStorage.getItem('mv_role');
  if(!uid || !role) return false;
  const pkg = localStorage.getItem('mv_package') || (role === 'admin' ? 'admin' : 'artist');
  window._mvCurrentUserId = uid;
  sessionStorage.setItem('mv_user_id', uid);
  sessionStorage.setItem('mv_username', localStorage.getItem('mv_username') || '');
  sessionStorage.setItem('mv_package', pkg);
  mvLoadUserState(uid);
  unlockAs(role);
  if(typeof window.setPackage === 'function') window.setPackage(pkg);
  if(pkg === 'label') mvForceLabelTab();
  window.addEventListener('online', ()=>location.reload(), { once:true });
  console.log('[Lock] Uten nett — åpnet med lokale data.');
  return true;
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
  let session = null, authErr = null;
  // Tidsfrist: getSession kan henge hvis token-fornyelsen henger. Da beholder
  // vi den lagrede innloggingen (ikke slett) og viser skjemaet/nødutgangen.
  const TIMEOUT = {};
  try{
    const r = await mvWithTimeout(client.auth.getSession(), navigator.onLine ? 10000 : 2500, TIMEOUT);
    if(r === TIMEOUT){
      if(!navigator.onLine && mvRestoreOffline()) return true;   // uten nett: åpne med lokale data
      console.warn('[Lock] getSession svarte ikke i tide'); return false;
    }
    session = r?.data?.session || null;
    authErr = r?.error || null;
  }
  catch(e){ console.warn('[Lock] getSession feilet:', e); authErr = e; }
  if(!session){
    // Uten nett kan ikke tokenet fornyes — det er IKKE en utlogging. Åpne appen
    // med lokale data (lyd lagret offline kan spilles), og prøv igjen når nettet kommer.
    const netDown = !navigator.onLine || /fetch|network|Failed/i.test(String(authErr?.name || '') + ' ' + String(authErr?.message || ''));
    if(netDown && mvRestoreOffline()) return true;
    mvClearPersistentSession(); return false;
  }

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
    // Maks 4 s — ellers brukes hurtiglageret, og rollen friskes opp ved neste lasting
    const {data: profile} = await mvWithTimeout(
      client.from('profiles').select('role, package').eq('id', uid).maybeSingle(), 4000, {data:null});
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

// Utlogging: all avspilling stopper (appens spiller, Explore/profiler og
// alle andre lydelementer) — musikk skal ikke fortsette bak låseskjermen.
function mvStopAllAudio(){
  try{ if(typeof bottomStop==='function') bottomStop(true); }catch(e){}
  try{ window.mvExplore?.stopAll?.(); }catch(e){}
  try{ document.querySelectorAll('audio,video').forEach(a=>{ try{ a.pause(); }catch(_){} }); }catch(e){}
}
window.mvStopAllAudio = mvStopAllAudio;

function returnToPasswordScreen(){
  mvStopAllAudio();
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

  // Gear/settings button with dropdown (en gammel meny kan ligge i <body> etter forrige åpning)
  document.querySelectorAll('body > #mvGearMenu').forEach(m => m.remove());
  slot.insertAdjacentHTML('beforeend', `
    <div style="position:relative">
      <button id="mvGearBtn" class="mv-hdr-icon-btn" onclick="mvToggleGearMenu(event)" title="Innstillinger" aria-label="Innstillinger"><span class="ic ic-sliders" aria-hidden="true"></span></button>
      <div id="mvGearMenu" class="mv-gear-dropdown" style="display:none">
        <div class="mv-gear-header">
          <div class="mv-gear-username">${username}</div>
          ${!isAdmin ? '<div class="mv-gear-pkg">'+pkgLabel+'</div>' : ''}
        </div>
        <div class="mv-gear-divider"></div>
        <div id="mvGearAppearance" class="mv-gear-appearance"></div>
        <div class="mv-gear-divider"></div>
        <div id="mvGearLabelItem" style="display:none">
          <button class="mv-gear-item mv-gear-danger" onclick="mvGearLeaveLabel()">Forlat label</button>
        </div>
        <button class="mv-gear-item" onclick="mvLogout()"><span class="ic ic-logout" aria-hidden="true"></span> Logg ut</button>
      </div>
    </div>`);

  // Tema/aksent: pakken (PRO?) er kjent nå — bruk valget og fyll Utseende-seksjonen.
  if (window.mvTheme){ window.mvTheme.apply(); window.mvTheme.syncFromAccount(); }
  if (window.mvI18n) window.mvI18n.syncFromAccount();

  // Avatar — navnet ligger i tooltip, ikke som egen tekst ved siden av initialene
  slot.insertAdjacentHTML('beforeend', `
    <div class="mv-hdr-user">
      <div class="mv-hdr-avatar" title="${String(username||'').replace(/"/g,'&quot;')}">${(username||'?').slice(0,2).toUpperCase()}</div>
    </div>`);

  // Admin badge
  if(isAdmin){
    slot.insertAdjacentHTML('beforeend',
      '<div class="mv-hdr-admin-badge" title="Admin"><span class="ic ic-bolt" aria-hidden="true"></span> ADMIN</div>');
  }

  // Bell is placed by installNotificationBell() in app.js — no manual move needed

  // Close gear menu on outside click
  document.addEventListener('click', e => {
    const menu = document.getElementById('mvGearMenu');
    const btn  = document.getElementById('mvGearBtn');
    // isConnected: klikk på Mørk/Lys tegner kontrollene på nytt, så målet er borte fra
    // DOM-en — det er fortsatt et klikk INNE i menyen.
    if(menu && e.target.isConnected && !menu.contains(e.target) && !(btn && btn.contains(e.target))) menu.style.display='none';
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
  const btn  = document.getElementById('mvGearBtn');
  if(!menu) return;
  if(menu.style.display !== 'none'){ menu.style.display = 'none'; return; }
  // Sidefeltet har overflow:hidden og spilleren ligger over bunnen — menyen ble
  // klippet bort. Flytt den til <body> og plasser den fast rett over knappen.
  if(menu.parentElement !== document.body) document.body.appendChild(menu);
  menu.style.display = 'block';
  const r = btn ? btn.getBoundingClientRect() : { left: 16, top: window.innerHeight - 16 };
  const w = menu.offsetWidth || 240;
  const set = (k, v) => menu.style.setProperty(k, v, 'important');
  set('position', 'fixed');
  set('z-index', '10050');
  set('left', Math.max(8, Math.min(r.left, window.innerWidth - w - 8)) + 'px');
  set('right', 'auto');
  const below = r.top < window.innerHeight / 2;          // knapp øverst (mobil): åpne nedover
  if(below){
    set('top', (r.bottom + 8) + 'px'); set('bottom', 'auto');
    set('max-height', (window.innerHeight - r.bottom - 16) + 'px');
  } else {
    set('top', 'auto'); set('bottom', (window.innerHeight - r.top + 8) + 'px');
    set('max-height', (r.top - 16) + 'px');
  }
  set('overflow-y', 'auto');
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

  if(btn){btn.disabled=true;btn.textContent='Logger inn...';}
  if(errEl){errEl.style.display='none';}

  try {
    if(!window.supabaseClient){
      if(errEl){errEl.textContent='Supabase ikke konfigurert.';errEl.style.display='block';}
      return;
    }

    let data, error;
    if(username.includes('@')){
      // Direkte e-post-innlogging
      ({data, error} = await window.supabaseClient.auth.signInWithPassword({email: username, password}));
    } else {
      // Brukernavn: serveren slår opp e-posten og logger inn; vi får bare sesjonen tilbake
      const SB_URL = window.MV_CONFIG.SUPABASE_URL;
      const SB_KEY = window.MV_CONFIG.SUPABASE_ANON_KEY;
      let res, body;
      try {
        res = await fetch(`${SB_URL}/functions/v1/login-username`, {
          method:'POST',
          headers:{'apikey':SB_KEY,'Authorization':'Bearer '+SB_KEY,'Content-Type':'application/json'},
          body:JSON.stringify({username, password})
        });
        body = await res.json().catch(()=>({}));
      } catch(e) { throw new Error('Kunne ikke koble til. Prøv igjen.'); }
      if(!res.ok || !body.access_token) throw new Error(body.error || 'Feil brukernavn eller passord.');
      ({data, error} = await window.supabaseClient.auth.setSession({access_token: body.access_token, refresh_token: body.refresh_token}));
    }
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
  // Utseendet styres av klassen is-on (stilene ligger ved #lockScreen i index.html)
  document.querySelectorAll('.pkg-card').forEach(c => { c.classList.remove('is-on'); c.setAttribute('aria-checked', 'false'); });
  el.classList.add('is-on'); el.setAttribute('aria-checked', 'true');
  _selectedPkg = el.dataset.pkg;
  // Vis invitasjonskode-felt for label
  const inviteWrap = document.getElementById('regInviteWrap');
  if(inviteWrap) inviteWrap.style.display = _selectedPkg === 'label' ? 'block' : 'none';
};

document.addEventListener('keydown', e => {
  const c = e.target && e.target.closest && e.target.closest('#lockScreen .pkg-card');
  if (c && (e.key === 'Enter' || e.key === ' ')){ e.preventDefault(); window.selectPkg(c); }
});

window.showRegister = function() {
  document.getElementById('lockCard').style.display = 'none';
  const rc = document.getElementById('registerCard');
  rc.style.display = 'grid';
  rc.style.animation = 'lockCardEnter .4s cubic-bezier(.22,1,.36,1) both';
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
    const SB_URL = window.MV_CONFIG.SUPABASE_URL;
    const SB_KEY = window.MV_CONFIG.SUPABASE_ANON_KEY;
    // invite_codes er admin-only (RLS) — sjekk via RPC som bare svarer ja/nei.
    const r = await fetch(`${SB_URL}/rest/v1/rpc/check_invite_code`, {
      method:'POST',
      headers:{'apikey':SB_KEY,'Authorization':'Bearer '+SB_KEY,'Content-Type':'application/json'},
      body: JSON.stringify({ p_code: invite })
    });
    const ok = r.ok ? await r.json() : false;
    if(ok !== true) {
      if(errEl){ errEl.textContent='Ugyldig eller allerede brukt invitasjonskode.'; errEl.style.display='block'; }
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

    // Profilen lages server-side av triggeren on_auth_user_created (også uten sesjon,
    // f.eks. med e-postbekreftelse). Dette er bare en reserve hvis triggeren feilet;
    // ignore-duplicates = ON CONFLICT DO NOTHING, så den rører aldri en eksisterende rad.
    if(data.user && data.session) {
      const SB_URL = window.MV_CONFIG.SUPABASE_URL;
      const SB_KEY = window.MV_CONFIG.SUPABASE_ANON_KEY;
      await fetch(`${SB_URL}/rest/v1/profiles`, {
        method: 'POST',
        headers: {
          'apikey': SB_KEY,
          'Authorization': `Bearer ${data.session.access_token}`,
          'Content-Type': 'application/json',
          'Prefer': 'resolution=ignore-duplicates,return=minimal'
        },
        body: JSON.stringify({
          id: data.user.id,
          username,
          email,
          role: 'user',
          // Label settes server-side av redeem_invite_code (RLS tillater bare artist/pro her)
          package: _selectedPkg === 'label' ? 'artist' : _selectedPkg
        })
      });
    }

    if(error) throw error;

    // Uten sesjon (e-postbekreftelse påkrevd) kan koden ikke løses inn nå — ikke lat som
    // kontoen er label; koden forblir ubrukt og kan løses inn senere.
    if(_selectedPkg === 'label' && data.user && !data.session) {
      console.warn('[Lock] Ingen sesjon etter registrering — invitasjonskoden er ikke løst inn.');
      if(errEl){ errEl.textContent='Kontoen er opprettet. Bekreft e-posten og logg inn — label-tilgang må aktiveres med koden etterpå.'; errEl.style.display='block'; }
      _selectedPkg = 'artist';
    }

    // Løs inn invitasjonskoden (merker den brukt + setter package='label' atomisk)
    if(_selectedPkg === 'label' && data.user && data.session) {
      const SB_URL = window.MV_CONFIG.SUPABASE_URL;
      const SB_KEY = window.MV_CONFIG.SUPABASE_ANON_KEY;
      const rr = await fetch(`${SB_URL}/rest/v1/rpc/redeem_invite_code`, {
        method:'POST',
        headers:{'apikey':SB_KEY,'Authorization':'Bearer '+data.session.access_token,'Content-Type':'application/json'},
        body: JSON.stringify({ p_code: invite })
      });
      const redeemed = rr.ok ? await rr.json() : false;
      if(redeemed !== true) {
        console.warn('[Lock] Invitasjonskoden kunne ikke løses inn — kontoen er opprettet som artist.');
        _selectedPkg = 'artist';
      }
    }

    // Logg inn automatisk
    sessionStorage.setItem('mv_username', username);
    sessionStorage.setItem('mv_package', _selectedPkg);
    window._mvCurrentUserId = data.user?.id;
    sessionStorage.setItem('mv_user_id', data.user?.id || '');

    if(errEl){ errEl.style.color='#a6be8b'; errEl.textContent='✓ Konto opprettet! Logger inn...'; errEl.style.display='block'; }

    setTimeout(async () => {
      const { data: loginData, error: loginErr } = await window.supabaseClient.auth.signInWithPassword({ email, password });

      if(loginErr){
        // Sannsynligvis e-postbekreftelse påkrevd
        if(errEl){
          errEl.style.color='#bfb2a6';
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
    if(errEl){ errEl.style.color='#ffaaa3'; errEl.textContent = e.message || 'Registrering feilet.'; errEl.style.display='block'; }
    if(btn){ btn.disabled=false; btn.textContent='Opprett konto'; }
  }
};

