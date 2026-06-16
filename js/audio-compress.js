// === audio-compress.js ===
// Konverterer WAV/AIFF til MP3 før R2-opplasting
// Bruker lamejs (MP3-encoder i ren JavaScript)
// Lastes inn via CDN — ingen npm/build-steg

(function(){
  'use strict';

  // Last lamejs fra CDN
  const LAME_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/lamejs/1.2.1/lame.min.js';
  let lameLoaded = false;
  let lameLoading = null;

  function loadLame(){
    if(lameLoaded) return Promise.resolve();
    if(lameLoading) return lameLoading;
    lameLoading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = LAME_CDN;
      s.onload = () => { lameLoaded = true; resolve(); };
      s.onerror = reject;
      document.head.appendChild(s);
    });
    return lameLoading;
  }

  // Filtyper som bør komprimeres
  const COMPRESS_TYPES = ['audio/wav','audio/wave','audio/x-wav','audio/aiff','audio/x-aiff','audio/flac','audio/x-flac'];
  const COMPRESS_EXTS  = ['.wav','.wave','.aif','.aiff','.flac'];

  function shouldCompress(file){
    if(!file) return false;
    const type = (file.type||'').toLowerCase();
    const name = (file.name||'').toLowerCase();
    if(COMPRESS_TYPES.some(t => type.includes(t))) return true;
    if(COMPRESS_EXTS.some(e => name.endsWith(e))) return true;
    // Komprimer store filer uansett (>5MB)
    if(file.size > 5 * 1024 * 1024 && type.startsWith('audio')) return true;
    return false;
  }

  async function compress(file, opts = {}){
    const { kbps = 192, onProgress } = opts;

    if(typeof showToast === 'function') showToast('🔄 Konverterer til MP3...');

    try {
      await loadLame();
    } catch(e) {
      console.warn('[AudioCompress] Kunne ikke laste lamejs, laster opp original:', e);
      return file;
    }

    // Les filen som ArrayBuffer
    const arrayBuffer = await file.arrayBuffer();

    // Dekod med Web Audio API
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    let audioBuffer;
    try {
      audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    } catch(e) {
      console.warn('[AudioCompress] Klarte ikke dekode lyd, laster opp original:', e);
      audioCtx.close();
      return file;
    }
    audioCtx.close();

    const sampleRate  = audioBuffer.sampleRate;
    const numChannels = Math.min(audioBuffer.numberOfChannels, 2);
    const leftChannel  = audioBuffer.getChannelData(0);
    const rightChannel = numChannels > 1 ? audioBuffer.getChannelData(1) : leftChannel;

    // Konverter Float32 til Int16
    function floatTo16bit(floatArr){
      const int16 = new Int16Array(floatArr.length);
      for(let i = 0; i < floatArr.length; i++){
        const s = Math.max(-1, Math.min(1, floatArr[i]));
        int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
      }
      return int16;
    }

    const leftInt16  = floatTo16bit(leftChannel);
    const rightInt16 = floatTo16bit(rightChannel);

    // Initialiser lamejs encoder
    // eslint-disable-next-line no-undef
    const mp3encoder = new lamejs.Mp3Encoder(numChannels, sampleRate, kbps);
    const mp3Data = [];
    const blockSize = 1152; // lamejs chunk size
    const totalSamples = leftInt16.length;

    for(let i = 0; i < totalSamples; i += blockSize){
      const leftChunk  = leftInt16.subarray(i, i + blockSize);
      const rightChunk = rightInt16.subarray(i, i + blockSize);
      const encoded    = numChannels > 1
        ? mp3encoder.encodeBuffer(leftChunk, rightChunk)
        : mp3encoder.encodeBuffer(leftChunk);
      if(encoded.length > 0) mp3Data.push(encoded);
      if(onProgress && i % (blockSize * 100) === 0){
        onProgress(Math.round(i / totalSamples * 100));
      }
    }

    const flushed = mp3encoder.flush();
    if(flushed.length > 0) mp3Data.push(flushed);

    // Bygg MP3 Blob
    const mp3Blob = new Blob(mp3Data, { type: 'audio/mpeg' });
    const origMB  = (file.size / 1024 / 1024).toFixed(1);
    const newMB   = (mp3Blob.size / 1024 / 1024).toFixed(1);
    console.log(`[AudioCompress] ${file.name}: ${origMB}MB WAV → ${newMB}MB MP3 (${kbps}kbps)`);

    if(typeof showToast === 'function') showToast(`✓ Konvertert: ${origMB}MB → ${newMB}MB`);

    // Lag ny File med .mp3 extension
    const newName = file.name.replace(/\.(wav|wave|aif|aiff|flac)$/i, '.mp3');
    return new File([mp3Blob], newName, { type: 'audio/mpeg' });
  }

  // Eksponér globalt
  window.audioCompress = { shouldCompress, compress };
  console.log('[AudioCompress] Klar — WAV/AIFF/FLAC konverteres til MP3 ved opplasting');

  // ── Batch-konverter alle WAV-beats ──────────────────────────────────────
  window.convertAllWavBeats = async function(){
    if(!window.r2Storage?.ready()){ if(typeof showToast==='function') showToast('⚠ R2 ikke klar'); return; }
    const appState = window.state || (typeof state !== 'undefined' ? state : null);
    if(!appState?.beats){ if(typeof showToast==='function') showToast('⚠ State ikke klar'); return; }

    // Finn beats med audio_url som kan være WAV
    const candidates = appState.beats.filter(b =>
      !b.archived && (b.audio_url||'').includes('worker')
    );

    if(typeof showToast==='function') showToast(`🔍 Sjekker ${candidates.length} beats...`);

    // Sjekk Content-Type for hver
    const toConvert = [];
    for(const b of candidates){
      try{
        const r = await fetch(b.audio_url, {method:'HEAD'});
        const ct = r.headers.get('content-type')||'';
        if(ct.includes('wav')||ct.includes('wave')||ct.includes('aiff')) toConvert.push(b);
      } catch(e){}
    }

    if(!toConvert.length){
      if(typeof showToast==='function') showToast('✓ Ingen WAV-beats funnet — alt er allerede MP3');
      return;
    }

    // Bygg modal
    const modal = document.createElement('div');
    modal.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.85);display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px)';
    modal.innerHTML = `
      <div style="background:#1a1612;border:1px solid rgba(255,255,255,.12);width:min(460px,92vw);padding:28px;font-family:system-ui">
        <h2 style="font-size:16px;font-weight:800;margin:0 0 8px;color:#f4ede4">🔄 Konverter WAV til MP3</h2>
        <p style="font-size:13px;color:rgba(255,255,255,.5);margin:0 0 16px">Fant <strong style="color:#f4a443">${toConvert.length}</strong> WAV-beat${toConvert.length>1?'s':''}</p>
        <div style="max-height:200px;overflow-y:auto;margin-bottom:16px">
          ${toConvert.map(b=>`<div style="display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid rgba(255,255,255,.06)">
            <span style="font-size:13px;color:#f4ede4;flex:1">${b.name||b.title||b.id.slice(0,8)}</span>
            <span id="wcS_${b.id}" style="font-size:11px;color:rgba(255,255,255,.35)">Venter</span>
          </div>`).join('')}
        </div>
        <div style="background:rgba(255,255,255,.06);height:6px;margin-bottom:16px"><div id="wcBar" style="height:100%;background:#f4a443;width:0;transition:width .3s"></div></div>
        <div style="display:flex;gap:10px">
          <button id="wcBtn" onclick="window._runWavConvert()" style="flex:1;background:linear-gradient(135deg,#f4a443,#cb6e1a);border:none;color:#000;font-size:13px;font-weight:800;padding:11px;cursor:pointer">Start</button>
          <button onclick="this.closest('[style*=fixed]').remove()" style="background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);color:rgba(255,255,255,.5);font-size:13px;padding:11px 16px;cursor:pointer">Avbryt</button>
        </div>
      </div>`;
    document.body.appendChild(modal);

    window._runWavConvert = async function(){
      const btn = document.getElementById('wcBtn');
      if(btn){ btn.disabled=true; btn.textContent='Konverterer...'; }
      let done = 0;
      for(const beat of toConvert){
        const st = document.getElementById('wcS_'+beat.id);
        try{
          if(st){ st.style.color='#60a5fa'; st.textContent='Henter...'; }
          const res = await fetch(beat.audio_url);
          if(!res.ok) throw new Error('HTTP '+res.status);
          const blob = await res.blob();
          const wavFile = new File([blob], (beat.name||beat.id)+'.wav', {type:blob.type||'audio/wav'});

          if(st){ st.style.color='#a855f7'; st.textContent='Konverterer...'; }
          const mp3File = await compress(wavFile);

          if(st){ st.style.color='#f4a443'; st.textContent='Laster opp...'; }
          const url = await window.r2Storage.upload(beat.id, mp3File, !!beat.archived);
          beat.audio_url = url;
          if(typeof saveState==='function') saveState();

          if(st){ st.style.color='#34d399'; st.textContent='✓ Ferdig'; }
        } catch(e){
          if(st){ st.style.color='#fb7185'; st.textContent='✕ Feilet'; }
          console.error('[WAV Convert]', beat.id, e);
        }
        done++;
        const bar = document.getElementById('wcBar');
        if(bar) bar.style.width = Math.round(done/toConvert.length*100)+'%';
      }
      if(typeof window.pushToSupabase==='function') window.pushToSupabase();
      if(btn) btn.textContent = '✓ Ferdig';
      if(typeof showToast==='function') showToast('✓ Konvertert '+done+' beat'+( done>1?'s':'')+' til MP3');
    };
  };

})();
