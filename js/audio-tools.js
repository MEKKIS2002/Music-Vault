// ════════════════════════════════════════════════════════════════════════════
// audio-tools.js — jevn lydstyrke + avspilling uten nett
// (ideer fra Koel: volumeNormalizer.ts, useOfflinePlayback.ts, useNetworkStatus.ts — MIT)
//
// JEVN LYDSTYRKE
//   Første gang en låt spilles måles lydnivået (RMS uten stille partier) i
//   bakgrunnen. Resultatet huskes per låt, og høye låter dempes mot et felles
//   nivå så du slipper å skru volumet opp og ned mellom spor. Volumslideren er
//   fortsatt DITT volum; dempingen legges oppå. Av/på: knappen i spilleren eller N.
//
// UTEN NETT
//   - sw.js mellomlagrer selve appen, så den åpner uten nett.
//   - «Lagre offline» (høyreklikk på låt/album/mixtape) legger lydfilen i
//     nettleserens lokale lager (samme audioDB som spilleren alltid sjekker først).
//   - Uten nett vises et merke, og låter som ikke er lagret tones ned.
// ════════════════════════════════════════════════════════════════════════════
(function(){
  'use strict';
  const LS = { get:(k,d)=>{ try{ const v = localStorage.getItem(k); return v == null ? d : v; }catch(e){ return d; } },
               set:(k,v)=>{ try{ localStorage.setItem(k, v); }catch(e){} } };
  const toast = m => { if (typeof window.showToast === 'function') window.showToast(m); };
  const P = () => (typeof bottomPlayer !== 'undefined' ? bottomPlayer : null);
  const beatById = id => ((typeof state !== 'undefined' ? state : window.state)?.beats || []).find(b => b.id === id);
  const cloudUrl = b => (typeof window.getBeatAudioUrl === 'function' ? window.getBeatAudioUrl(b) : (b?.audio_url || ''));

  // ═════════════════════════ JEVN LYDSTYRKE ═══════════════════════════════
  const TARGET_DB = -16;          // felles nivå (dBFS RMS)
  const MAX_CUT_DB = -12;         // demp aldri mer enn dette
  const MAX_BYTES = 60 * 1024 * 1024;
  let normOn = LS.get('mv_norm', '1') === '1';
  let userVol = 1, trackGain = 1, gainFor = null, ramp = null;
  let loud = {}; try{ loud = JSON.parse(LS.get('mv_loudness', '{}')) || {}; }catch(e){ loud = {}; }

  function apply(animate){
    const p = P(); if (!p) return;
    const target = Math.max(0, Math.min(1, userVol * (normOn ? trackGain : 1)));
    cancelAnimationFrame(ramp);
    if (!animate){ p.audio.volume = target; return; }
    const from = p.audio.volume, t0 = performance.now();
    const step = t => { const k = Math.min(1, (t - t0) / 900); p.audio.volume = from + (target - from) * k; if (k < 1) ramp = requestAnimationFrame(step); };
    ramp = requestAnimationFrame(step);
  }
  function gainFromDb(db){ return Math.pow(10, Math.max(MAX_CUT_DB, Math.min(0, TARGET_DB - db)) / 20); }

  // Brukerens volum går via oss (slideren, piltastene i player-extras.js)
  const origSetVol = window.bottomSetVolume;
  window.bottomSetVolume = function(v){
    userVol = Math.max(0, Math.min(1, Number(v)));
    apply(false);
    const r = document.getElementById('bpVolume');
    if (r && typeof window.bpSetRangeFill === 'function') window.bpSetRangeFill(r);
  };
  void origSetVol;

  async function getBlob(beat){
    try{ const b = await audioDB.load(beat.id); if (b) return b; }catch(e){}
    const url = cloudUrl(beat); if (!url || !/^https?:/.test(url)) return null;
    const r = await fetch(url); if (!r.ok) return null;
    const len = Number(r.headers.get('content-length') || 0); if (len > MAX_BYTES) return null;
    return r.blob();
  }
  // RMS over begge kanaler i blokker på ~0,1 s, stille blokker (< -50 dB) telles ikke med
  function measure(buf){
    const block = Math.round(buf.sampleRate * .1), chans = Math.min(2, buf.numberOfChannels);
    const data = []; for (let c = 0; c < chans; c++) data.push(buf.getChannelData(c));
    let sum = 0, n = 0;
    for (let i = 0; i + block <= buf.length; i += block){
      let bs = 0;
      for (let c = 0; c < chans; c++){ const d = data[c]; for (let j = i; j < i + block; j += 2) bs += d[j] * d[j]; }
      const ms = bs / (chans * block / 2);
      if (ms > 1e-5){ sum += ms; n++; }
    }
    return n ? 10 * Math.log10(sum / n) : null;
  }
  const busy = new Set();
  async function analyse(beat){
    if (!beat || busy.has(beat.id)) return null;
    busy.add(beat.id);
    try{
      const blob = await getBlob(beat); if (!blob || blob.size > MAX_BYTES) return null;
      const Ctx = window.OfflineAudioContext || window.webkitOfflineAudioContext; if (!Ctx) return null;
      const buf = await new Ctx(1, 1, 44100).decodeAudioData(await blob.arrayBuffer());
      const db = measure(buf); if (db == null) return null;
      loud[beat.id] = Math.round(db * 10) / 10;
      LS.set('mv_loudness', JSON.stringify(loud));
      return loud[beat.id];
    }catch(e){ console.warn('[Lydstyrke] Kunne ikke måle', beat?.name, e?.message || e); return null; }
    finally{ busy.delete(beat.id); }
  }
  async function onTrack(){
    const p = P(); const beat = p && p.queue[p.index]; if (!beat || beat.id === gainFor) return;
    gainFor = beat.id;
    if (loud[beat.id] != null){ trackGain = gainFromDb(loud[beat.id]); apply(false); return; }
    trackGain = 1; apply(false);
    if (!normOn) return;
    const db = await analyse(beat);
    if (db != null && gainFor === beat.id){ trackGain = gainFromDb(db); apply(true); }
  }
  function toggleNormalize(force){
    normOn = typeof force === 'boolean' ? force : !normOn;
    LS.set('mv_norm', normOn ? '1' : '0');
    gainFor = null; onTrack(); apply(true); syncBtn();
    toast(normOn ? 'Jevn lydstyrke er på' : 'Jevn lydstyrke er av');
  }
  function syncBtn(){
    const b = document.getElementById('mvNormBtn'); if (!b) return;
    b.setAttribute('aria-pressed', normOn); b.classList.toggle('is-on', normOn);
    b.title = 'Jevn lydstyrke: ' + (normOn ? 'på' : 'av') + ' (N)';
  }
  function addNormBtn(){
    const acts = document.querySelector('#bottomPlayer .bp-actions'); if (!acts || document.getElementById('mvNormBtn')) return;
    const b = document.createElement('button'); b.type = 'button'; b.id = 'mvNormBtn'; b.className = 'bp-btn mv-norm-btn';
    b.setAttribute('aria-label', 'Jevn lydstyrke');
    // Eget ikon (ikke glidebryterne fra «Innstillinger») + en prikk som viser at den er på
    b.innerHTML = '<span class="ic ic-level" aria-hidden="true"></span><span class="mv-norm-dot" aria-hidden="true"></span>';
    b.addEventListener('click', () => toggleNormalize());
    acts.insertBefore(b, acts.querySelector('.bp-vol-ico') || acts.firstChild);
    syncBtn();
  }

  // ═════════════════════════ UTEN NETT ════════════════════════════════════
  const MINE_KEY = 'mv_offline_ids';           // låter VI har lastet ned (kan trygt fjernes igjen)
  let mine = new Set(); try{ mine = new Set(JSON.parse(LS.get(MINE_KEY, '[]'))); }catch(e){}
  let stored = new Set();                      // alt som ligger i audioDB (også egne opplastinger)
  const saveMine = () => LS.set(MINE_KEY, JSON.stringify([...mine]));

  function idbKeys(){
    return new Promise(res => {
      try{
        const req = indexedDB.open('mvAudio', 1);
        req.onupgradeneeded = e => e.target.result.createObjectStore('files');
        req.onsuccess = e => { const d = e.target.result; try{ const q = d.transaction('files').objectStore('files').getAllKeys(); q.onsuccess = () => { res(q.result || []); d.close(); }; q.onerror = () => { res([]); d.close(); }; }catch(err){ res([]); } };
        req.onerror = () => res([]);
      }catch(e){ res([]); }
    });
  }
  async function refreshStored(){ stored = new Set(await idbKeys()); markRows(); }
  const isOffline = id => stored.has(id);
  const canRemove = id => mine.has(id) && !!cloudUrl(beatById(id));

  async function saveOffline(id, quiet){
    const b = beatById(id); if (!b) return false;
    if (stored.has(id)){ if (!quiet) toast('«' + (b.name || 'Låten') + '» er allerede lagret på enheten'); return true; }
    const url = cloudUrl(b); if (!url){ if (!quiet) toast('Fant ingen lydfil for «' + (b.name || '') + '»'); return false; }
    try{
      if (navigator.storage?.persist) navigator.storage.persist().catch(()=>{});
      if (!quiet) toast('Lagrer «' + (b.name || 'låten') + '» offline …');
      const r = await fetch(url); if (!r.ok) throw new Error('HTTP ' + r.status);
      const blob = await r.blob();
      await audioDB.save(id, blob);
      stored.add(id); mine.add(id); saveMine(); markRows();
      if (!quiet) toast('✓ «' + (b.name || 'Låten') + '» kan spilles uten nett');
      return true;
    }catch(e){
      if (!quiet) toast('Kunne ikke lagre offline: ' + (e.message || e));
      return false;
    }
  }
  async function removeOffline(id){
    if (!canRemove(id)){ toast('Denne lydfilen finnes bare på denne enheten og kan ikke fjernes herfra'); return; }
    try{ await audioDB.del(id); }catch(e){}
    stored.delete(id); mine.delete(id); saveMine(); markRows();
    toast('Fjernet fra enheten — spilles fra skyen igjen');
  }
  async function saveCollection(type, id){
    const s = (typeof state !== 'undefined' ? state : window.state) || {};
    const c = (type === 'album' ? s.albums : s.mixtapes || []).find(x => x.id === id); if (!c) return;
    const ids = (c.beatIds || []).filter(x => !stored.has(x));
    if (!ids.length){ toast('Alt i «' + (c.name || '') + '» er allerede lagret offline'); return; }
    let ok = 0;
    for (let i = 0; i < ids.length; i++){
      toast('Lagrer offline ' + (i + 1) + '/' + ids.length + ' …');
      if (await saveOffline(ids[i], true)) ok++;
    }
    toast(ok === ids.length ? '✓ «' + (c.name || '') + '» kan spilles uten nett' : ok + ' av ' + ids.length + ' låter ble lagret offline');
  }

  // Tone ned låter som ikke kan spilles når vi er uten nett
  let markTimer = null;
  function markRows(){
    clearTimeout(markTimer);
    markTimer = setTimeout(() => {
      const off = !navigator.onLine;
      document.querySelectorAll('[data-beat-id], [data-cm-beat]').forEach(el => {
        const id = el.dataset.beatId || el.dataset.cmBeat;
        el.classList.toggle('mv-has-offline', stored.has(id));
        el.classList.toggle('mv-unavailable', off && !stored.has(id));
      });
    }, 80);
  }
  function netChange(){
    const off = !navigator.onLine;
    document.body.classList.toggle('mv-offline', off);
    let pill = document.getElementById('mvOfflinePill');
    if (off && !pill){
      pill = document.createElement('div'); pill.id = 'mvOfflinePill'; pill.className = 'mv-offline-pill'; pill.setAttribute('role', 'status');
      pill.innerHTML = '<span class="ic ic-cloud" aria-hidden="true"></span> Uten nett — bare låter lagret på enheten kan spilles';
      document.body.appendChild(pill);
    } else if (!off && pill) pill.remove();
    if (!off && netChange._was) toast('Tilkoblet igjen');
    netChange._was = off;
    markRows();
  }
  function registerSW(){
    if (!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return;
    if (location.hostname === '127.0.0.1' && location.port === '8765') return;   // ikke i testriggen
    navigator.serviceWorker.register('sw.js').catch(e => console.warn('[Offline] Service worker:', e?.message || e));
  }

  function init(){
    try{ userVol = Number(document.getElementById('bpVolume')?.value || P()?.audio.volume || 1); }catch(e){}
    addNormBtn();
    const p = P();
    if (p){ ['play', 'loadedmetadata'].forEach(ev => p.audio.addEventListener(ev, onTrack)); }
    window.addEventListener('online', netChange); window.addEventListener('offline', netChange);
    netChange();
    refreshStored();
    // Nye rader tegnes hele tiden — merk dem (billig, avgrenset med timer)
    new MutationObserver(recs => { if (recs.some(r => r.addedNodes.length)) markRows(); })
      .observe(document.getElementById('mainContent') || document.querySelector('main') || document.body, { childList:true, subtree:true });
    registerSW();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();

  window.mvAudioTools = {
    toggleNormalize, userVolume: () => userVol, isNormalizing: () => normOn, analyse, loudness: () => ({ ...loud }),
    isOffline, canRemove, saveOffline, removeOffline, saveCollection, refreshStored
  };
})();
