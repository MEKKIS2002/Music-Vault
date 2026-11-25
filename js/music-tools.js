// ════════════════════════════════════════════════════════════════════════════
// music-tools.js — akkorder og metronom i Lyric Lab.
//
// AKKORDER (Tonal, github.com/tonaljs/tonal, MIT): ut fra låtens toneart vises
//   de seks akkordene som hører hjemme i tonearten og vanlige progresjoner.
//   Klikk en akkord for å høre den, «+» setter den inn i teksten der markøren
//   står, som «[Am] ».
// METRONOM (Tone.js, github.com/Tonejs/Tone.js, MIT): klikk i låtens BPM med
//   aksent på slag 1. «Opptelling» gir én takt med klikk før en take starter
//   (i stedet for 3 sekunder).
// Begge bibliotekene lastes først når kortene brukes.
// ════════════════════════════════════════════════════════════════════════════
(function(){
  'use strict';
  const TONAL_URL = 'https://cdn.jsdelivr.net/npm/tonal@6.5.1/browser/tonal.min.js';
  const TONE_URL  = 'https://cdn.jsdelivr.net/npm/tone@15.1.22/build/Tone.js';
  const LS = { get:(k,d)=>{ try{ const v = localStorage.getItem(k); return v == null ? d : v; }catch(e){ return d; } }, set:(k,v)=>{ try{ localStorage.setItem(k, v); }catch(e){} } };
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const toast = m => { if (typeof window.showToast === 'function') window.showToast(m); };
  const beat = () => { const id = window.currentLyricLabBeatId; return ((typeof state !== 'undefined' ? state : window.state)?.beats || []).find(b => b.id === id); };

  const scripts = {};
  function load(url, global){
    if (window[global]) return Promise.resolve(window[global]);
    return scripts[url] ||= new Promise((res, rej) => {
      const s = document.createElement('script'); s.src = url; s.async = true;
      s.onload = () => window[global] ? res(window[global]) : rej(new Error(global + ' mangler'));
      s.onerror = () => { delete scripts[url]; rej(new Error('Kunne ikke laste ' + global)); };
      document.head.appendChild(s);
    });
  }
  const tonal = () => load(TONAL_URL, 'Tonal');
  const tone = async () => { const T = await load(TONE_URL, 'Tone'); await T.start(); return T; };

  // ═════════════════════════════ AKKORDER ═════════════════════════════════
  const PROG = {
    major: [['Pop', ['I','V','vi','IV']], ['Ballade', ['vi','IV','I','V']], ['50-talls', ['I','vi','IV','V']], ['Jazz', ['ii','V','I']]],
    minor: [['Moll-pop', ['i','VI','III','VII']], ['Trap / drill', ['i','VI','VII']], ['Episk', ['i','VII','VI','VII']], ['Klassisk', ['i','iv','v','i']]],
  };
  function parseKey(k){
    const m = /^([A-G][#b]?)(m?)$/.exec(String(k || '').trim()); if (!m) return null;
    return { tonic: m[1], minor: !!m[2] };
  }
  // Romertall → akkordnavn i tonearten (tåler både I/i og VI/vi)
  function chordsFor(T, key){
    const info = key.minor ? T.Key.minorKey(key.tonic).natural : T.Key.majorKey(key.tonic);
    const triads = (info.triads || []).map(c => c.replace(/dim$/, 'dim'));
    const grades = key.minor ? ['i','ii°','III','iv','v','VI','VII'] : ['I','ii','iii','IV','V','vi','vii°'];
    const byRoman = {}; grades.forEach((g, i) => { byRoman[g.replace('°','').toLowerCase()] = triads[i]; });
    const progs = PROG[key.minor ? 'minor' : 'major'].map(([name, rn]) => [name, rn.map(r => byRoman[r.toLowerCase()]).filter(Boolean)]);
    // Vis de seks «brukbare» (dropp den forminskede) + harmonisk-moll V i moll
    let main = triads.map((c, i) => ({ c, g: grades[i] })).filter(x => !/dim/.test(x.c));
    if (key.minor){ const V = T.Key.minorKey(key.tonic).harmonic.triads?.[4]; if (V && !main.some(x => x.c === V)) main.push({ c: V, g: 'V' }); }
    return { main, progs, scale: (key.minor ? T.Key.minorKey(key.tonic).natural.scale : info.scale) || [] };
  }
  async function playChord(name){
    try{
      const [T, Tn] = await Promise.all([tonal(), tone()]);
      const ch = T.Chord.get(name); if (!ch || !ch.tonic) return;
      const root = ch.tonic + '3';
      const notes = ch.intervals.map(iv => T.Note.transpose(root, iv));
      notes.unshift(T.Note.transpose(root, '-8P'));          // bass-tone en oktav under
      chordSynth ||= new Tn.PolySynth(Tn.Synth, { oscillator:{ type:'triangle' }, envelope:{ attack:.01, decay:.3, sustain:.35, release:1.2 }, volume:-10 }).toDestination();
      chordSynth.triggerAttackRelease(notes, 1.4);
    }catch(e){ toast('Kunne ikke spille akkorden'); }
  }
  let chordSynth = null;

  // Husk hvor markøren sist sto i en tekstboks, så «+» kan sette inn der
  let lastRange = null;
  document.addEventListener('selectionchange', () => {
    const s = getSelection(); if (!s || !s.rangeCount) return;
    const r = s.getRangeAt(0), ed = r.startContainer.parentElement?.closest?.('#lyriclabTab .ll-textarea') || (r.startContainer.closest && r.startContainer.closest('#lyriclabTab .ll-textarea'));
    if (ed) lastRange = { ed, range: r.cloneRange() };
  });
  function insertChord(name){
    const text = '[' + name + '] ';
    if (lastRange && document.contains(lastRange.ed)){
      lastRange.ed.focus();
      const s = getSelection(); s.removeAllRanges(); s.addRange(lastRange.range);
      document.execCommand('insertText', false, text);            // går via input-hendelsen → lagres som vanlig
      return;
    }
    navigator.clipboard?.writeText(text.trim()).then(() => toast('Kopiert ' + text.trim() + ' — klikk i teksten først for å sette inn direkte'), () => toast(text.trim()));
  }

  async function renderChords(){
    const card = document.getElementById('llChordCard'); if (!card) return;
    const b = beat(); const key = parseKey(b?.key);
    const body = card.querySelector('.mv-chords-body');
    if (!key){
      body.innerHTML = `<p class="ll-muted-hint">Akkordene følger låtens toneart.</p><button type="button" class="ll-side-btn mv-set-key" onclick="window.llOpenSongInfo&&llOpenSongInfo('key')">Sett toneart</button>`;
      card.querySelector('.mv-chords-key').textContent = '';
      return;
    }
    card.querySelector('.mv-chords-key').textContent = key.tonic + (key.minor ? '-moll' : '-dur');
    body.innerHTML = `<p class="ll-muted-hint">Laster akkorder …</p>`;
    let T; try{ T = await tonal(); }catch(e){ body.innerHTML = `<p class="ll-muted-hint">Kunne ikke laste akkordbiblioteket.</p>`; return; }
    if (parseKey(beat()?.key)?.tonic !== key.tonic) return;                // tonearten endret seg mens vi lastet
    const { main, progs, scale } = chordsFor(T, key);
    const chip = c => `<span class="mv-chord"><button type="button" class="mv-chord-play" data-chord="${esc(c)}" title="Spill ${esc(c)}">${esc(c)}</button><button type="button" class="mv-chord-add" data-add="${esc(c)}" title="Sett inn [${esc(c)}] i teksten" aria-label="Sett inn ${esc(c)} i teksten">+</button></span>`;
    body.innerHTML = `
      <div class="mv-chords-grid">${main.map(x => `<div class="mv-chord-cell"><small>${esc(x.g)}</small>${chip(x.c)}</div>`).join('')}</div>
      <p class="mv-chords-sub">Progresjoner</p>
      <div class="mv-progs">${progs.map(([n, cs]) => `<div class="mv-prog"><button type="button" class="mv-prog-play" data-prog="${esc(cs.join(' '))}" title="Spill progresjonen"><span class="ic ic-play" aria-hidden="true"></span></button><span class="mv-prog-name">${esc(n)}</span><span class="mv-prog-chords">${cs.map(esc).join(' – ')}</span></div>`).join('')}</div>
      <p class="mv-chords-scale"><span>Skala:</span> ${scale.map(esc).join(' ')}</p>`;
  }
  let progTimer = null;
  async function playProg(list){
    clearTimeout(progTimer);
    const bpm = Number(beat()?.bpm) || 90, len = 60 / bpm * 4 * 1000 / 2;     // en halv takt per akkord
    list.forEach((c, i) => { progTimer = setTimeout(() => playChord(c), i * len); });
  }

  // ═════════════════════════════ METRONOM ═════════════════════════════════
  let metroOn = false, loop = null, clickHi = null, clickLo = null, beatNo = 0;
  const countInOn = () => LS.get('mv_countin', '1') === '1';
  async function clicks(){
    const T = await tone();
    clickHi ||= new T.MembraneSynth({ pitchDecay:.008, octaves:2, envelope:{ attack:.001, decay:.08, sustain:0 }, volume:-6 }).toDestination();
    clickLo ||= new T.MembraneSynth({ pitchDecay:.008, octaves:2, envelope:{ attack:.001, decay:.06, sustain:0 }, volume:-12 }).toDestination();
    return T;
  }
  const bpmNow = () => { const n = Number(beat()?.bpm); return n >= 40 && n <= 300 ? n : 90; };
  async function startMetro(){
    const T = await clicks();
    T.getTransport().bpm.value = bpmNow();
    beatNo = 0;
    loop?.dispose();
    loop = new T.Loop(time => { (beatNo % 4 === 0 ? clickHi : clickLo).triggerAttackRelease(beatNo % 4 === 0 ? 'C6' : 'G5', '32n', time); flash(beatNo % 4); beatNo++; }, '4n').start(0);
    T.getTransport().start('+0.05');
    metroOn = true; syncMetro();
  }
  async function stopMetro(){
    metroOn = false;
    try{ const T = window.Tone; if (T){ T.getTransport().stop(); T.getTransport().cancel(); } }catch(e){}
    loop?.dispose(); loop = null; syncMetro();
  }
  function flash(n){
    const d = document.querySelectorAll('#llMetroCard .mv-metro-dot');
    requestAnimationFrame(() => d.forEach((x, i) => x.classList.toggle('on', i === n)));
  }
  // Én takt (4 slag) i låtens tempo, så kalles done() på «1» i neste takt
  async function countIn(bpm, onTick, done){
    try{
      const T = await clicks();
      const step = 60 / (Number(bpm) || 90), t0 = T.now() + .08;
      for (let i = 0; i < 4; i++){
        (i === 0 ? clickHi : clickLo).triggerAttackRelease(i === 0 ? 'C6' : 'G5', '32n', t0 + i * step);
        setTimeout(() => onTick && onTick(4 - i), (t0 - T.now() + i * step) * 1000);
      }
      setTimeout(done, (t0 - T.now() + 4 * step) * 1000);
    }catch(e){ done(); }
  }
  function syncMetro(){
    const card = document.getElementById('llMetroCard'); if (!card) return;
    const btn = card.querySelector('.mv-metro-toggle');
    btn.classList.toggle('is-on', metroOn); btn.setAttribute('aria-pressed', metroOn);
    btn.innerHTML = metroOn ? '<span class="ic ic-stop" aria-hidden="true"></span> Stopp' : '<span class="ic ic-play" aria-hidden="true"></span> Start';
    card.querySelector('.mv-metro-bpm').textContent = bpmNow();
    const src = card.querySelector('.mv-metro-bpm-src');
    if (Number(beat()?.bpm) > 0) src.textContent = 'BPM';
    else src.innerHTML = 'BPM · <button type="button" class="mv-link-btn" onclick="window.llOpenSongInfo&&llOpenSongInfo(\'bpm\')">sett låtens BPM</button>';
    const ci = card.querySelector('.mv-countin input'); if (ci) ci.checked = countInOn();
    if (!metroOn) card.querySelectorAll('.mv-metro-dot').forEach(x => x.classList.remove('on'));
  }

  // ═════════════════════════════ KORT I LYRIC LAB ═════════════════════════
  function addCards(){
    const right = document.querySelector('#lyriclabTab .ll-right'); if (!right || document.getElementById('llMetroCard')) return;
    // Øverst i «Spill inn»-fanen når den finnes (Lyric Lab), ellers etter Memoer
    const toolsBody = right.querySelector('#llRecTools');
    const after = toolsBody ? null : (right.querySelector('#llMemoList')?.closest('.ll-card') || right.firstElementChild);
    (toolsBody || after).insertAdjacentHTML(toolsBody ? 'afterbegin' : 'afterend', `
      <div class="ll-card ll-side-card" id="llMetroCard">
        <div class="ll-side-hd"><h3 class="ll-side-title">Metronom</h3><button type="button" class="ll-side-btn mv-metro-toggle" aria-pressed="false"></button></div>
        <div class="mv-metro-row">
          <div class="mv-metro-tempo"><b class="mv-metro-bpm">90</b><span class="mv-metro-bpm-src">BPM</span></div>
          <div class="mv-metro-dots" aria-hidden="true"><i class="mv-metro-dot"></i><i class="mv-metro-dot"></i><i class="mv-metro-dot"></i><i class="mv-metro-dot"></i></div>
        </div>
        <label class="mv-countin"><input type="checkbox"> Opptelling (én takt) før take</label>
      </div>
      <div class="ll-card ll-side-card" id="llChordCard">
        <div class="ll-side-hd"><h3 class="ll-side-title">Akkorder</h3><span class="mv-chords-key"></span></div>
        <div class="mv-chords-body"></div>
      </div>`);
    const mc = document.getElementById('llMetroCard');
    mc.querySelector('.mv-metro-toggle').addEventListener('click', () => metroOn ? stopMetro() : startMetro().catch(() => toast('Kunne ikke starte metronomen')));
    mc.querySelector('.mv-countin input').addEventListener('change', e => LS.set('mv_countin', e.target.checked ? '1' : '0'));
    const cc = document.getElementById('llChordCard');
    cc.addEventListener('mousedown', e => { if (e.target.closest('button')) e.preventDefault(); });   // behold markøren i teksten
    cc.addEventListener('click', e => {
      const p = e.target.closest('[data-chord]'), a = e.target.closest('[data-add]'), g = e.target.closest('[data-prog]');
      if (p) playChord(p.dataset.chord); else if (a) insertChord(a.dataset.add); else if (g) playProg(g.dataset.prog.split(' '));
    });
    syncMetro(); renderChords();
  }
  // Toneart/BPM endret (velgeren i Lyric Lab eller analysen) → oppdater kortene
  const origRefresh = window.llRefreshMeta;
  function wrapRefresh(){
    if (typeof window.llRefreshMeta !== 'function' || window.llRefreshMeta._mt) return;
    const orig = window.llRefreshMeta;
    window.llRefreshMeta = function(){ const r = orig.apply(this, arguments); renderChords(); syncMetro(); if (metroOn) try{ window.Tone.getTransport().bpm.value = bpmNow(); }catch(e){} return r; };
    window.llRefreshMeta._mt = true;
  }
  void origRefresh;
  let lastBeat = null;
  function scan(){
    wrapRefresh();
    const right = document.querySelector('#lyriclabTab .ll-right');
    if (right && !document.getElementById('llMetroCard')) addCards();
    if (window.currentLyricLabBeatId !== lastBeat){ lastBeat = window.currentLyricLabBeatId; renderChords(); syncMetro(); }
    // Ut av Lyric Lab → stopp metronomen
    if (metroOn && document.getElementById('lyriclabTab')?.classList.contains('hidden')) stopMetro();
  }
  let t = null;
  new MutationObserver(() => { clearTimeout(t); t = setTimeout(scan, 80); }).observe(document.getElementById('lyriclabTab') || document.body, { childList:true, subtree:true, attributes:true, attributeFilter:['class'] });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scan); else scan();

  window.mvMetronome = { start: startMetro, stop: stopMetro, isOn: () => metroOn, countIn, countInEnabled: countInOn };
  window.mvChords = { render: renderChords, play: playChord, insert: insertChord, parseKey };
})();
