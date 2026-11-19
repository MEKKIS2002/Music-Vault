// ════════════════════════════════════════════════════════════════════════════
// analysis.js — finn toneart, BPM og cover automatisk.
//
// 1. Filmetadata (music-metadata, github.com/Borewit/music-metadata, MIT):
//    innebygd cover (APIC/covr/PICTURE) og toneart (TKEY / initialkey) leses
//    rett fra den opplastede filen. Biblioteket lastes først når det trengs.
// 2. Lydanalyse når filen ikke sier noe:
//    - Toneart: «chroma» — hvor mye energi hver av de 12 tonene har gjennom
//      låten (samme idé som Meyda, github.com/meyda/meyda, MIT) — sammenlignet
//      med Krumhansl–Schmucklers dur- og moll-profiler.
//    - BPM: energistøt (onsets) + autokorrelasjon, foldet inn i 70–180.
//    Resultatet er et anslag: «keySource:'analyse'». En toneart eller BPM du
//    har satt selv (kilde «manuell») overskrives aldri.
// ════════════════════════════════════════════════════════════════════════════
(function(){
  'use strict';
  const MM_URL = 'https://cdn.jsdelivr.net/npm/music-metadata@12.3.4/+esm';
  const NOTES = ['C','C#','D','Eb','E','F','F#','G','Ab','A','Bb','B'];
  const SR = 11025;                       // analyser på lav samplerate — raskt og nok for toneart/tempo
  const MAX_BYTES = 80 * 1024 * 1024;
  const toast = m => { if (typeof window.showToast === 'function') window.showToast(m); };
  const save = () => { if (typeof window.saveState === 'function') window.saveState(); };
  const beatById = id => ((typeof state !== 'undefined' ? state : window.state)?.beats || []).find(b => b.id === id);

  // ── 1. Metadata fra fila ─────────────────────────────────────────────────
  let mm = null;
  const loadMM = () => (mm ||= import(MM_URL).catch(e => { mm = null; throw e; }));
  // «A minor», «Am», «F#m», «Gbmaj», Camelot «8A» → appens format («Am», «F#», «Eb» …)
  const CAMELOT = { '1A':'Abm','2A':'Ebm','3A':'Bbm','4A':'Fm','5A':'Cm','6A':'Gm','7A':'Dm','8A':'Am','9A':'Em','10A':'Bm','11A':'F#m','12A':'C#m',
                    '1B':'B','2B':'F#','3B':'C#','4B':'Ab','5B':'Eb','6B':'Bb','7B':'F','8B':'C','9B':'G','10B':'D','11B':'A','12B':'E' };
  const FLAT = { 'Db':'C#','D#':'Eb','Gb':'F#','G#':'Ab','A#':'Bb','Cb':'B','E#':'F','Fb':'E','B#':'C' };
  function normKey(raw){
    let s = String(raw || '').trim(); if (!s) return '';
    const cam = s.toUpperCase().replace(/\s/g, ''); if (CAMELOT[cam]) return CAMELOT[cam];
    const m = /^([A-Ga-g])\s*([#♯b♭]?)\s*(m(?!aj)|min(?:or)?|moll)?/i.exec(s.replace(/\s*(major|maj|dur)$/i, ''));
    if (!m) return '';
    let n = m[1].toUpperCase() + (m[2] === '♯' ? '#' : m[2] === '♭' ? 'b' : m[2]);
    n = FLAT[n] || n;
    if (!NOTES.includes(n)) return '';
    return n + (m[3] ? 'm' : '');
  }
  function imageToDataUrl(pic){
    return new Promise(res => {
      try{
        const blob = new Blob([pic.data], { type: pic.format || 'image/jpeg' });
        const url = URL.createObjectURL(blob), img = new Image();
        img.onload = () => {
          const max = 512, k = Math.min(1, max / Math.max(img.width, img.height));
          const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          URL.revokeObjectURL(url); res(c.toDataURL('image/jpeg', .85));
        };
        img.onerror = () => { URL.revokeObjectURL(url); res(null); };
        img.src = url;
      }catch(e){ res(null); }
    });
  }
  async function fromTags(file){
    try{
      const { parseBlob } = await loadMM();
      const meta = await parseBlob(file, { duration: false, skipPostHeaders: true });
      const c = meta.common || {};
      const pic = (c.picture || [])[0];
      return { key: normKey(c.key), bpm: Number(c.bpm) || null, cover: pic ? await imageToDataUrl(pic) : null };
    }catch(e){ console.warn('[Analyse] Kunne ikke lese metadata:', e?.message || e); return {}; }
  }

  // ── 2. Lydanalyse ────────────────────────────────────────────────────────
  async function decode(blob){
    const Ctx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    const buf = await new Ctx(1, 1, SR).decodeAudioData(await blob.arrayBuffer());   // resamples til SR
    const n = buf.length, out = new Float32Array(n), ch = buf.numberOfChannels;
    for (let c = 0; c < ch; c++){ const d = buf.getChannelData(c); for (let i = 0; i < n; i++) out[i] += d[i] / ch; }
    return out;
  }
  // Enkel radix-2 FFT (in-place)
  function fft(re, im){
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++){ let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j){ [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
    for (let len = 2; len <= n; len <<= 1){
      const a = -2 * Math.PI / len, wr = Math.cos(a), wi = Math.sin(a);
      for (let i = 0; i < n; i += len){
        let cr = 1, ci = 0;
        for (let j = 0; j < len / 2; j++){
          const k = i + j, l = k + len / 2;
          const tr = re[l] * cr - im[l] * ci, ti = re[l] * ci + im[l] * cr;
          re[l] = re[k] - tr; im[l] = im[k] - ti; re[k] += tr; im[k] += ti;
          const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
        }
      }
    }
  }
  function chroma(x){
    const N = 4096, hop = 4096, win = new Float32Array(N);
    for (let i = 0; i < N; i++) win[i] = .5 - .5 * Math.cos(2 * Math.PI * i / (N - 1));
    const pcOf = new Int8Array(N / 2).fill(-1);
    for (let k = 1; k < N / 2; k++){ const f = k * SR / N; if (f >= 65 && f <= 2100) pcOf[k] = ((Math.round(12 * Math.log2(f / 440)) % 12) + 12 + 9) % 12; }
    const total = new Float64Array(12), re = new Float32Array(N), im = new Float32Array(N);
    for (let s = 0; s + N <= x.length; s += hop){
      let e = 0; for (let i = 0; i < N; i++){ re[i] = x[s + i] * win[i]; im[i] = 0; e += re[i] * re[i]; }
      if (e < 1e-4) continue;                                      // hopp over stillhet
      fft(re, im);
      const frame = new Float64Array(12); let fs = 0;
      for (let k = 1; k < N / 2; k++){ const p = pcOf[k]; if (p < 0) continue; const m = Math.sqrt(re[k] * re[k] + im[k] * im[k]); frame[p] += m; fs += m; }
      if (fs > 0) for (let p = 0; p < 12; p++) total[p] += frame[p] / fs;   // hver ramme teller likt
    }
    return total;
  }
  // Krumhansl–Kessler-profiler
  const MAJOR = [6.35,2.23,3.48,2.33,4.38,4.09,2.52,5.19,2.39,3.66,2.29,2.88];
  const MINOR = [6.33,2.68,3.52,5.38,2.60,3.53,2.54,4.75,3.98,2.69,3.34,3.17];
  function corr(a, b){ const n = a.length, ma = a.reduce((s, v) => s + v, 0) / n, mb = b.reduce((s, v) => s + v, 0) / n; let num = 0, da = 0, db = 0; for (let i = 0; i < n; i++){ num += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; } return da && db ? num / Math.sqrt(da * db) : 0; }
  function keyFromChroma(c){
    let best = { key:'', r:-2 }, second = -2;
    for (let t = 0; t < 12; t++){
      const rot = i => c[(i + t) % 12];
      const v = Array.from({ length: 12 }, (_, i) => rot(i));
      for (const [prof, suf] of [[MAJOR, ''], [MINOR, 'm']]){
        const r = corr(v, prof);
        if (r > best.r){ second = best.r; best = { key: NOTES[t] + suf, r }; } else if (r > second) second = r;
      }
    }
    return { key: best.key, confidence: Math.max(0, Math.min(1, (best.r - second) * 4 + best.r * .5)) };
  }
  function tempo(x){
    const hop = 256, env = [];
    let prev = 0;
    for (let s = 0; s + hop <= x.length; s += hop){
      let e = 0; for (let i = s; i < s + hop; i++) e += x[i] * x[i];
      const le = Math.log(1e-9 + e); env.push(Math.max(0, le - prev)); prev = le;
    }
    const fps = SR / hop, n = env.length; if (n < fps * 6) return null;
    const mean = env.reduce((a, b) => a + b, 0) / n; const o = env.map(v => v - mean);
    const lag = bpm => fps * 60 / bpm;
    const ac = l => { let s = 0; const L = Math.round(l); for (let i = 0; i + L < n; i++) s += o[i] * o[i + L]; return s / (n - L); };
    let best = null, bestS = -Infinity;
    for (let bpm = 60; bpm <= 200; bpm += .5){
      // Vekt inn dobbel og halv periode så vi lander på den «naturlige» pulsen
      const s = ac(lag(bpm)) + .5 * ac(lag(bpm) * 2) + .25 * ac(lag(bpm) / 2) * (bpm < 100 ? 1 : 0);
      if (s > bestS){ bestS = s; best = bpm; }
    }
    if (!best) return null;
    while (best < 70) best *= 2; while (best > 180) best /= 2;
    return Math.round(best);
  }
  async function getBlob(beat){
    try{ const b = await audioDB.load(beat.id); if (b) return b; }catch(e){}
    const url = typeof window.getBeatAudioUrl === 'function' ? window.getBeatAudioUrl(beat) : beat.audio_url;
    if (!url || !/^https?:/.test(url)) return null;
    const r = await fetch(url); if (!r.ok) return null;
    return r.blob();
  }
  async function analyseBlob(blob){
    if (!blob || blob.size > MAX_BYTES) return null;
    const x = await decode(blob);
    const k = keyFromChroma(chroma(x));
    return { key: k.key, keyConfidence: Math.round(k.confidence * 100) / 100, bpm: tempo(x) };
  }

  // ── 3. Bruk på en låt ────────────────────────────────────────────────────
  // Fyller bare inn det som mangler, og rører aldri verdier satt for hånd.
  async function enrich(beat, file, { analyse = true, quiet = true } = {}){
    if (!beat) return null;
    const changed = [];
    const tags = file ? await fromTags(file) : {};
    if (tags.cover && !beat.cover){ beat.cover = tags.cover; changed.push('cover'); }
    if (tags.key && !beat.key && beat.keySource !== 'manuell'){ beat.key = tags.key; beat.keySource = 'fil'; changed.push('toneart'); }
    if (tags.bpm && !(Number(beat.bpm) > 0) && beat.bpmSource !== 'manuell'){ beat.bpm = Math.round(tags.bpm); beat.bpmSource = 'fil'; changed.push('BPM'); }
    const needKey = !beat.key && beat.keySource !== 'manuell';
    const needBpm = !(Number(beat.bpm) > 0) && beat.bpmSource !== 'manuell';
    if (analyse && (needKey || needBpm)){
      try{
        const r = await analyseBlob(file || await getBlob(beat));
        if (r){
          if (needKey && r.key){ beat.key = r.key; beat.keySource = 'analyse'; beat.keyConfidence = r.keyConfidence; changed.push('toneart'); }
          if (needBpm && r.bpm){ beat.bpm = r.bpm; beat.bpmSource = 'analyse'; beat.bpmChecked = true; changed.push('BPM'); }
        }
      }catch(e){ console.warn('[Analyse]', beat.name, e?.message || e); }
    }
    if (changed.length){
      save();
      if (typeof window.renderAll === 'function') window.renderAll();
      if (typeof window.llRefreshMeta === 'function') try{ window.llRefreshMeta(); }catch(e){}
      if (!quiet) toast('«' + (beat.name || 'Låten') + '»: fant ' + [...new Set(changed)].join(', '));
    } else if (!quiet) toast('Fant ikke noe nytt for «' + (beat.name || 'låten') + '»');
    return changed;
  }
  // Fra menyen: analyser på nytt selv om analysen har satt noe før (men aldri over manuelle verdier)
  async function reanalyse(id){
    const b = beatById(id); if (!b) return;
    if (b.keySource === 'analyse'){ b.key = ''; }
    if (b.bpmSource === 'analyse'){ b.bpm = null; }
    toast('Analyserer «' + (b.name || 'låten') + '» …');
    let file = null; try{ file = await audioDB.load(b.id); }catch(e){}
    const ch = await enrich(b, file, { quiet: true });
    toast(ch && ch.length ? '«' + (b.name || 'Låten') + '»: ' + [b.key ? 'toneart ' + labelKey(b.key) : '', b.bpm ? b.bpm + ' BPM' : ''].filter(Boolean).join(' · ') : 'Kunne ikke analysere «' + (b.name || 'låten') + '»');
  }
  const labelKey = k => { const m = /^(.+?)(m?)$/.exec(k || ''); return m ? m[1] + (m[2] ? '-moll' : '-dur') : k; };

  // ── 4. Alle som mangler ──────────────────────────────────────────────────
  // Låter lastet opp før analysen fantes har verken toneart eller BPM. Gå
  // gjennom dem én og én (lyden hentes fra R2/lokalt), lagre underveis.
  let _bulkRunning = false;
  const missing = () => ((window.state || {}).beats || []).filter(b => !b._shared && !b.archived &&
    ((!b.key && b.keySource !== 'manuell') || (!(Number(b.bpm) > 0) && b.bpmSource !== 'manuell')));
  async function enrichMissing(onProgress){
    if (_bulkRunning) return null;
    _bulkRunning = true;
    const list = missing(); let done = 0, found = 0, failed = 0;
    try {
      for (const b of list){
        onProgress && onProgress({ done, total: list.length, name: b.name });
        let file = null; try { file = await audioDB.load(b.id); } catch(e){}
        try { const ch = await enrich(b, file, { quiet: true }); if (ch && ch.length) found++; }
        catch(e){ failed++; }
        done++;
        await new Promise(r => setTimeout(r, 50));      // la siden puste mellom låtene
      }
    } finally { _bulkRunning = false; }
    onProgress && onProgress({ done, total: list.length, finished: true, found, failed });
    return { total: list.length, found, failed };
  }
  // Knappen i Integrasjoner
  window.mvAnalyseAll = async function(btn){
    const n = missing().length;
    if (!n){ toast('Alle låter har allerede toneart og BPM'); return; }
    const label = btn ? btn.querySelector('.mv-aa-label') : null;
    if (btn) btn.disabled = true;
    const res = await enrichMissing(p => {
      if (label) label.textContent = p.finished ? `Ferdig — ${p.found} av ${p.total} fikk toneart/BPM` : `Analyserer ${p.done + 1} av ${p.total}: ${p.name || ''}`;
    });
    if (btn) btn.disabled = false;
    if (res) toast(`Analyse ferdig: ${res.found} av ${res.total} låter oppdatert` + (res.failed ? ` (${res.failed} feilet)` : ''));
  };

  window.mvAnalysis = { enrich, reanalyse, analyseBlob, normKey, keyFromChroma, tempo, fromTags, enrichMissing, missing };
})();
