// ════════════════════════════════════════════════════════════════════════════
// stages.js — ÉN stegmodell for en låt, brukt av Lyric Lab, Pipeline, Studio-
// visningen i album/mixtapes og boardet.
//
//   Idé → Skriving → Innspilling → Miks → Master → Ferdig
//
// Kilden er låtens «Ferdig %» (beat.done). Steget regnes ut fra prosenten med
// de samme grensene overalt, og å velge et steg setter prosenten inn i stegets
// område (står den allerede der, røres den ikke).
//
//   mvStages.list                → [{ key, label, min, max, set }]
//   mvStages.of(beat)            → stegobjekt
//   mvStages.index(beat)         → 0–5
//   mvStages.set(beat, key)      → endrer beat.done ved behov, returnerer true om endret
//   mvStages.normalizeAlbum(s)   → eldre albumstatus («Mixing», «Mastering») → ny
// ════════════════════════════════════════════════════════════════════════════
(function(){
  'use strict';
  const LIST = [
    { key: 'idea',    label: 'Idé',         min: 0,   max: 0,   set: 0   },
    { key: 'writing', label: 'Skriving',    min: 1,   max: 24,  set: 10  },
    { key: 'record',  label: 'Innspilling', min: 25,  max: 49,  set: 30  },
    { key: 'mix',     label: 'Miks',        min: 50,  max: 74,  set: 55  },
    { key: 'master',  label: 'Master',      min: 75,  max: 99,  set: 80  },
    { key: 'done',    label: 'Ferdig',      min: 100, max: 100, set: 100 },
  ];
  const pct = b => Math.max(0, Math.min(100, Number(b && b.done) || 0));
  const hasAudio  = b => !!(b && (b.audio_url || b.url));
  const hasLyrics = b => !!(b && (((b.lyricSections || []).some(s => s && s.text && s.text.trim())) || String(b.lyrics || '').trim()));

  function index(b){
    const p = pct(b);
    if (p >= 100) return 5;
    if (p >= 75)  return 4;
    if (p >= 50)  return 3;
    if (p >= 25)  return 2;
    // Steget følger bare prosenten, så et valgt steg alltid «blir stående»
    // (lyd/tekst brukes til «neste steg»-hint i Pipeline, ikke til steget).
    return p > 0 ? 1 : 0;
  }
  function of(b){ return LIST[index(b)]; }
  function set(b, key){
    const s = LIST.find(x => x.key === key); if (!b || !s) return false;
    if (index(b) === LIST.indexOf(s)) return false;          // allerede i dette steget
    b.done = s.set;
    return true;
  }
  // Albumstatus brukte «Mixing»/«Mastering» enkelte steder og «Miks»/«Master» andre
  const ALBUM = ['Idé', 'Skriving', 'Innspilling', 'Miks', 'Master', 'Klar for release'];
  const ALBUM_ALIASES = { 'Mixing': 'Miks', 'Mastering': 'Master', 'Demo': 'Innspilling', 'Valgt': 'Skriving' };
  function normalizeAlbum(s){ return ALBUM_ALIASES[s] || s || 'Idé'; }

  window.mvStages = { list: LIST, of, index, set, pct, hasAudio, hasLyrics, album: ALBUM, normalizeAlbum };
})();
