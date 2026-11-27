// ════════════════════════════════════════════════════════════════════════════
// router.js — egen adresse per side, så tilbake/frem-knappene i nettleseren
// hopper mellom sidene (og en side kan bokmerkes / deles som lenke).
//
//   …/Music-Vault/#beats   …/#album   …/#lyric-lab   osv.
//
// Fanene byttes fortsatt av de eksisterende .tab-btn-knappene. Routeren
// følger med på hvilken knapp som er aktiv (uansett HVORDAN den ble aktiv —
// klikk, snarvei på Hjem, høyreklikkmeny …) og legger inn en historikk-
// oppføring. Ved tilbake/frem klikker den riktig knapp. Spørreparametere
// (delingslenker o.l.) røres ikke.
// ════════════════════════════════════════════════════════════════════════════
(function(){
  'use strict';
  const SLUG = {
    hjem:'hjem', beats:'beats', docs:'docs', mixtapes:'mixtapes', albums:'album',
    pipeline:'pipeline', lyriclab:'lyric-lab', archive:'arkivert', label:'label',
    adminpanel:'admin', integrations:'integrasjoner', artistpage:'artistside'
  };
  const TAB = {};
  Object.keys(SLUG).forEach(t => { TAB[SLUG[t]] = t; });
  TAB.albums = 'albums'; TAB.lyriclab = 'lyriclab'; TAB.archive = 'archive'; TAB.home = 'hjem'; TAB.explore = 'hjem';
  // Engelske adresser virker også (#archived, #artist-page …) — ellers havnet man stille på Hjem
  Object.assign(TAB, { archived:'archive', 'artist-page':'artistpage', artist:'artistpage', integrations:'integrations', album:'albums', 'lyric-lab':'lyriclab', lyrics:'lyriclab', settings:'hjem' });
  const TITLE = 'Music Vault';

  let current = null;        // fanen adressen viser nå
  let applying = false;      // vi bytter fane fordi adressen endret seg

  const btnFor = tab => document.querySelector('.tab-btn[data-tab="' + tab + '"]');
  const activeTab = () => document.querySelector('.tab-btn.active')?.dataset?.tab || null;
  const tabFromHash = () => {
    const h = decodeURIComponent((location.hash || '').replace(/^#\/?/, '')).toLowerCase().split(/[/?]/)[0];
    return TAB[h] || null;
  };
  const unlocked = () => {
    const ls = document.getElementById('lockScreen');
    return !ls || getComputedStyle(ls).display === 'none';
  };
  const SLUG_EN = { hjem:'home', albums:'albums', lyriclab:'lyric-lab', archive:'archived', integrations:'integrations', artistpage:'artist-page' };
  const slugFor = tab => (window.mvI18n && window.mvI18n.lang === 'en' && SLUG_EN[tab]) || SLUG[tab] || tab;
  const urlFor = tab => location.pathname + location.search + '#' + slugFor(tab);
  const label = tab => (btnFor(tab)?.textContent || '').trim();

  function setTitle(tab){
    const l = label(tab);
    document.title = l && tab !== 'hjem' ? l + ' · ' + TITLE : TITLE;
  }

  // Fanen ble byttet i appen → oppdater adressen
  function onTabChanged(){
    if (!unlocked()) return;
    const tab = activeTab(); if (!tab || tab === current) return;
    const prev = current; current = tab; setTitle(tab);
    if (applying) return;
    const url = urlFor(tab);
    if (prev === null) history.replaceState({ mvTab: tab }, '', url);   // første side: ingen ekstra steg
    else history.pushState({ mvTab: tab }, '', url);
  }

  // Adressen endret seg (tilbake/frem, eller lenke) → bytt fane
  function goTo(tab){
    const b = btnFor(tab);
    if (!b || b.style.display === 'none' || getComputedStyle(b).display === 'none'){
      // Siden finnes ikke for denne brukeren (f.eks. Admin) → vis Hjem
      tab = 'hjem';
      history.replaceState({ mvTab: tab }, '', urlFor(tab));
    }
    if (tab === activeTab()){ current = tab; setTitle(tab); return; }
    applying = true;
    try{ btnFor(tab)?.click(); }
    finally{ setTimeout(()=>{ applying = false; current = activeTab(); setTitle(current); }, 0); }
  }

  function onPop(){
    if (!unlocked()) return;
    const raw = (location.hash || '').replace(/^#\/?/, '');
    const tab = tabFromHash() || 'hjem';
    if (raw && !tabFromHash() && typeof window.showToast === 'function') window.showToast('Fant ikke siden — viser Hjem');
    goTo(tab);
  }

  // Albumet som er åpent står i adressen (#album/<id>), så oppdatering og lenker lander riktig.
  // replaceState: ingen ekstra steg i historikken; «Tilbake» i appen gir #album igjen.
  const albumFromHash = () => { const m = decodeURIComponent((location.hash || '').replace(/^#\/?/, '')).match(/^(?:album|albums)\/([^/?]+)/i); return m ? m[1] : null; };
  function openAlbumFromHash(id){
    if (!id) return;
    setTimeout(()=>{ try{ if (typeof window.openAlbum === 'function') window.openAlbum(id); }catch(e){} }, 120);
  }
  function setAlbum(id){
    if (!unlocked() || activeTab() !== 'albums') return;
    const url = location.pathname + location.search + '#' + slugFor('albums') + (id ? '/' + encodeURIComponent(id) : '');
    if (location.href.endsWith(url)) return;
    history.replaceState({ mvTab: 'albums', album: id || null }, '', url);
  }

  // Første visning etter innlogging: følg adressen hvis den peker på en side
  let started = false;
  function start(){
    if (started || !unlocked()) return;
    started = true;
    const want = tabFromHash(), albumId = albumFromHash();
    if (want && want !== activeTab()){
      // Vent litt så pakke/rolle har bestemt hvilke faner som vises
      setTimeout(()=>{ current = null; goTo(want); current = activeTab(); history.replaceState({ mvTab: current }, '', urlFor(current)); setTitle(current); openAlbumFromHash(albumId); }, 350);
    } else {
      onTabChanged(); openAlbumFromHash(albumId);
    }
  }

  function init(){
    const nav = document.querySelector('.mv-tabs') || document.body;
    new MutationObserver(()=>{ if (started) onTabChanged(); })
      .observe(nav, { subtree:true, attributes:true, attributeFilter:['class'] });
    // Låseskjermen skjules ved innlogging → start
    const ls = document.getElementById('lockScreen');
    if (ls) new MutationObserver(()=>{ if (unlocked()) start(); else { started = false; current = null; } })
      .observe(ls, { attributes:true, attributeFilter:['style','class'] });
    window.addEventListener('popstate', onPop);
    window.addEventListener('hashchange', ()=>{ if (started && tabFromHash() && tabFromHash() !== activeTab()) onPop(); });
    start();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  window.mvRouter = { goTo, slug: t => SLUG[t], setAlbum };
})();
