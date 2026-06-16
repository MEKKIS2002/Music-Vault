/* ================================================================
   packages.js — Music Vault pakke-system
   Definerer hvilke tabs og funksjoner hver pakke har tilgang til.

   Pakker lagres som 'package'-kolonne i Supabase profiles-tabellen.
   Leses ved innlogging og lagres i sessionStorage.

   Legg til nye pakker her — resten av appen tilpasser seg automatisk.
================================================================ */

window.MV_PACKAGES = {

  // ── Alle tabs og funksjoner (admin/eier) ─────────────────────
  admin: {
    label: 'Admin',
    tabs: '*',          // alle tabs
    features: '*'       // alle funksjoner
  },

  // ── Artist — standardpakke ────────────────────────────────────
  artist: {
    label: 'Artist',
    tabs: ['beats', 'mixtapes', 'albums', 'lyriclab'],
    features: ['upload', 'lyrics', 'share_mixtape', 'ai_inspire', 'rhymes', 'download']
  },

  // ── PRO Artist — utvidet pakke ────────────────────────────────
  pro: {
    label: 'PRO',
    tabs: ['beats', 'mixtapes', 'albums', 'lyriclab', 'pipeline'],
    features: ['upload', 'lyrics', 'share_mixtape', 'pitch', 'ai_inspire', 'rhymes',
               'download', 'r2_upload', 'stats', 'collab', 'release_planner']
  },

  // ── Label ─────────────────────────────────────────────────────
  label: {
    label: 'Label',
    tabs: ['label', 'mixtapes', 'albums', 'pipeline'],
    features: ['upload', 'share_mixtape', 'pitch', 'r2_upload', 'download',
               'multi_artist', 'label_dashboard', 'comments']
  },

  // ── Kun lytting (ingen innlogging / viewer) ───────────────────
  viewer: {
    label: 'Lytter',
    tabs: ['mixtapes'],
    features: []
  }
};

// ── Hjelpefunksjoner ─────────────────────────────────────────────────────────

/**
 * Hent gjeldende pakke for innlogget bruker.
 * Returnerer pakke-objektet, eller admin-pakken som fallback.
 */
window.getCurrentPackage = function() {
  const pkg = sessionStorage.getItem('mv_package') || 'admin';
  return window.MV_PACKAGES[pkg] || window.MV_PACKAGES['admin'];
};

/**
 * Sjekk om gjeldende bruker har tilgang til en funksjon.
 * Bruk: if (hasFeature('pitch')) { ... }
 */
window.hasFeature = function(feature) {
  const pkg = window.getCurrentPackage();
  if (pkg.features === '*') return true;
  return Array.isArray(pkg.features) && pkg.features.includes(feature);
};

/**
 * Sjekk om gjeldende bruker har tilgang til en tab.
 * Bruk: if (hasTab('lyriclab')) { ... }
 */
window.hasTab = function(tab) {
  const pkg = window.getCurrentPackage();
  if (pkg.tabs === '*') return true;
  return Array.isArray(pkg.tabs) && pkg.tabs.includes(tab);
};

/**
 * Sett pakke for gjeldende bruker (kalles ved innlogging).
 */
window.setPackage = function(packageKey) {
  const key = packageKey && window.MV_PACKAGES[packageKey] ? packageKey : 'viewer';
  sessionStorage.setItem('mv_package', key);
  applyPackage();
};

/**
 * Anvend pakke-begrensninger på UI:
 * - Skjul tabs som ikke er inkludert
 * - Legg til body-klasse for CSS-targeting
 */
window.applyPackage = function() {
  const pkg    = window.getCurrentPackage();
  const pkgKey = sessionStorage.getItem('mv_package') || 'admin';

  // Body-klasse
  Object.keys(window.MV_PACKAGES).forEach(k => document.body.classList.remove('pkg-' + k));
  document.body.classList.add('pkg-' + pkgKey);

  // Kjør tab-synlighet litt forsinket så DOM er klar
  const applyTabs = () => {
    document.querySelectorAll('.tab-btn[data-tab]').forEach(btn => {
      const tab = btn.dataset.tab;
      btn.style.display = hasTab(tab) ? '' : 'none';
    });

    document.querySelectorAll('[data-feature]').forEach(el => {
      el.style.display = hasFeature(el.dataset.feature) ? '' : 'none';
    });

    // Naviger til første tillatte tab hvis aktiv tab ikke er tilgjengelig
    if(pkg.tabs !== '*' && Array.isArray(pkg.tabs) && pkg.tabs.length > 0){
      const activeBtn = document.querySelector('.tab-btn.active');
      const activeTab = activeBtn?.dataset?.tab;
      if(!activeTab || !hasTab(activeTab)){
        const firstBtn = document.querySelector(`.tab-btn[data-tab="${pkg.tabs[0]}"]`);
        if(firstBtn){
          firstBtn.click();
          // Trigger label dashboard render if label is first tab
          if(pkg.tabs[0] === 'label'){
            setTimeout(()=>{
              if(typeof window.labelRenderArtistList === 'function') window.labelRenderArtistList();
            }, 200);
          }
        }
      }
    }
  };

  // Kjør nå + med forsinkelse (sikrer at render er ferdig)
  applyTabs();
  setTimeout(applyTabs, 150);
  setTimeout(applyTabs, 500);

  console.log(`[MV Packages] ${pkgKey} | tabs: ${JSON.stringify(pkg.tabs)}`);
};

// Kjør applyPackage kun etter innlogging — ikke ved sidelast
// (kalles eksplisitt fra lock.js via window.setPackage)
