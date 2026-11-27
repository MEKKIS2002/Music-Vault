// === main-script-1 ===
// STATE: localStorage key 'musicVault.v4'. State object: { beats[], albums[], mixtapes[], settings{} }
// BEATS: beatsFromIds() filtrerer alltid arkiverte. Bruk den fremfor direkte beatIds-lookup.
// RENDERING: renderAll() markerer alle tabs dirty + renderer aktiv tab.
//            renderActiveTab(tab) renderer kun gitt tab hvis den er dirty.
//            saveState() → markDirty() → schedulePush() automatisk.
// TABS: Tab-handler er i db.js. Arkiv-tab har spesialtilfelle (dynamisk opprettet av archive.js).
//       Tab-synlighet: .hidden (display:none) + .tab-visible (opacity:1). Begge må settes.
// AUDIO: getBeatAudioUrl(beat) → R2 Worker URL (audio_url) → Google Drive fallback → url
// ── IndexedDB audio store ──
const audioDB=(()=>{
  let db=null;
  function open(){
    return new Promise((res,rej)=>{
      if(db){res(db);return;}
      const req=indexedDB.open("mvAudio",1);
      req.onupgradeneeded=e=>e.target.result.createObjectStore("files");
      req.onsuccess=e=>{db=e.target.result;res(db);};
      req.onerror=e=>rej(e);
    });
  }
  return{
    async save(id,blob){const d=await open();return new Promise((res,rej)=>{const tx=d.transaction("files","readwrite");tx.objectStore("files").put(blob,id);tx.oncomplete=res;tx.onerror=rej;});},
    async load(id){const d=await open();return new Promise((res,rej)=>{const tx=d.transaction("files","readonly");const req=tx.objectStore("files").get(id);req.onsuccess=e=>res(e.target.result||null);req.onerror=rej;});},
    async del(id){const d=await open();return new Promise((res,rej)=>{const tx=d.transaction("files","readwrite");tx.objectStore("files").delete(id);tx.oncomplete=res;tx.onerror=rej;});}
  };
})();

function normalizeAudioUrl(url){
  const str=String(url||'').trim();
  if(!str||str.endsWith(':idb'))return '';
  const fileMatch=str.match(/drive\.google\.com\/file\/d\/([^/?#]+)/);
  if(fileMatch)return `https://drive.google.com/uc?export=download&id=${fileMatch[1]}`;
  const idMatch=str.match(/[?&]id=([^&#]+)/);
  if(str.includes('drive.google.com')&&idMatch)return `https://drive.google.com/uc?export=download&id=${idMatch[1]}`;
  return str;
}
function getBeatAudioUrl(beat){
  if(!beat)return '';
  return normalizeAudioUrl(beat.audio_url)||normalizeAudioUrl(beat.url)||normalizeAudioUrl(beat.drive_url);
}

async function loadAudioForBeat(beatId){
  const el=document.getElementById("au-"+beatId);if(!el)return;
  const wrap=document.getElementById("au-wrap-"+beatId)||el.parentElement;
  const b=state.beats.find(x=>x.id===beatId);
  // Try IndexedDB first for local uploads
  const blob=await audioDB.load(beatId);
  if(blob){
    if(el.dataset.objectUrl)URL.revokeObjectURL(el.dataset.objectUrl);
    const objectUrl=URL.createObjectURL(blob);
    el.dataset.objectUrl=objectUrl;
    el.src=objectUrl;
    if(wrap)wrap.style.display="block";
    return;
  }
  // Fall back to a real stored URL. Ignore the IndexedDB sentinel if the blob is missing.
  const externalUrl=getBeatAudioUrl(b);
  if(externalUrl){
    el.src=externalUrl;
    if(wrap)wrap.style.display="block";
    return;
  }
  // No playable audio available
  el.removeAttribute("src");
  el.load();
  if(wrap)wrap.style.display="none";
}


// Spillerens ikoner som SVG (samme tegn på alle plattformer, ingen emojier)
const MV_PLAYER_ICONS={play:"<svg class=\"bp-ico\" viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M8 5.14v13.72a1 1 0 0 0 1.5.86l11-6.86a1 1 0 0 0 0-1.72l-11-6.86A1 1 0 0 0 8 5.14z\"/></svg>",pause:"<svg class=\"bp-ico\" viewBox=\"0 0 24 24\" aria-hidden=\"true\"><rect x=\"6\" y=\"5\" width=\"4\" height=\"14\" rx=\"1\"/><rect x=\"14\" y=\"5\" width=\"4\" height=\"14\" rx=\"1\"/></svg>",note:"<svg class=\"bp-ico bp-ico-note\" viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M9 17.5V6.2a1 1 0 0 1 .76-.97l9-2.25A1 1 0 0 1 20 4v11.5\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linejoin=\"round\"/><circle cx=\"6.5\" cy=\"17.5\" r=\"2.5\"/><circle cx=\"17.5\" cy=\"15.5\" r=\"2.5\"/></svg>"};
// ── Bottom player: one persistent Spotify-style player ──
const bottomPlayer={audio:new Audio(),queue:[],index:0,context:null,objectUrl:null,started:false};
bottomPlayer.audio.preload="auto";
// A track that genuinely played to the END advances the queue; the LAST track ending is the
// ONLY thing allowed to report "Ferdigspilt". Load/access failures must never reach this path.
bottomPlayer.audio.addEventListener("ended",()=>{
  // I Lyric Lab eier bølgeformen den samme lyden: ikke stopp og tøm spilleren
  // (det fjerner src under WaveSurfer). Låten står klar fra start / looper der.
  if(mvLyricLabOwnsPlayer()){updateBottomUI();return;}
  if(bottomPlayer.index+1<bottomPlayer.queue.length)playBottomIndex(bottomPlayer.index+1);
  else{bottomStop(true);showToast("✓ Ferdigspilt");}
});
bottomPlayer.audio.addEventListener("timeupdate",updateBottomProgress);
bottomPlayer.audio.addEventListener("loadedmetadata",function(){
  updateBottomProgress();
  // Persist duration on the current beat so album totals work
  if(bottomPlayer.context?.beatId){
    const b=state.beats.find(x=>x.id===bottomPlayer.context.beatId);
    if(b&&bottomPlayer.audio.duration>0){
      b.duration=Math.round(bottomPlayer.audio.duration);
      if(typeof saveState==='function') saveState();
    }
  }
});
bottomPlayer.audio.addEventListener("play",updateBottomUI);
bottomPlayer.audio.addEventListener("pause",updateBottomUI);
bottomPlayer.audio.addEventListener("error",onBottomAudioError);
// Human-readable reason for an <audio> MediaError. This is a FAILURE, not "ferdigspilt".
function describeMediaError(err){
  switch(err&&err.code){
    case 1: return 'avspilling ble avbrutt';
    case 2: return 'nettverksfeil – fikk ikke lastet ned lydfilen';
    case 3: return 'kunne ikke dekode lydfilen (skadet eller ugyldig format)';
    case 4: return 'lydkilden mangler eller er utilgjengelig (404/403 eller feil URL)';
    default: return 'ukjent lydfeil';
  }
}
// A load/playback failure must surface a REAL error and stop — never be mistaken for the song
// finishing. We additionally probe http(s) sources to report the actual HTTP status so the
// underlying access/URL problem (e.g. the producer can't reach the file) can be fixed.
async function onBottomAudioError(){
  const a=bottomPlayer.audio;
  // Ignore spurious errors fired while stopping / clearing the source (no real src).
  if(!a.src||a.src===location.href)return;
  const beat=bottomPlayer.queue[bottomPlayer.index];
  const name=beat?beat.name:'låten';
  const src=a.currentSrc||a.src||'';
  const reason=describeMediaError(a.error);
  console.error('[player] Audio error',{beat:name,beatId:beat&&beat.id,src,code:a.error&&a.error.code,reason});
  a.pause();
  updateBottomUI();
  showToast(`Kunne ikke spille «${name}» – ${reason}`,6000);
  if(/^https?:/i.test(src)){
    try{
      const res=await fetch(src,{method:'HEAD'});
      if(!res.ok)showToast(`«${name}»: lydfil utilgjengelig (HTTP ${res.status}). Sjekk audio_url / tilgang i R2.`,7000);
    }catch(e){
      showToast(`«${name}»: får ikke kontakt med lydfilen (nettverk/CORS). Sjekk audio_url.`,7000);
    }
  }
}
// No playable audio for THIS user/browser. Explain WHY instead of silently skipping ahead
// (which previously walked off the end of the queue and falsely reported "Ferdigspilt").
function reportUnplayableBeat(beat){
  const name=beat?beat.name:'låten';
  const localOnly=beat&&/:idb$/.test(String(beat.url||beat.audio_url||''));
  console.warn('[player] Unplayable beat',{name,id:beat&&beat.id,url:beat&&beat.url,audio_url:beat&&beat.audio_url});
  if(localOnly)showToast(`«${name}» finnes bare lokalt hos opplasteren – aldri lastet opp til skylagring (R2), så den kan ikke spilles her. Last den opp på nytt for å dele.`,7000);
  else showToast(`Ingen lydfil koblet til «${name}» (mangler audio_url / tilgang).`,6000);
}
function beatsFromIds(ids){return (ids||[]).map(id=>state.beats.find(b=>b.id===id)).filter(b=>b&&!b.archived);}
function fmtTime(sec){sec=Number(sec||0);if(!isFinite(sec))return "0:00";const m=Math.floor(sec/60);const s=Math.floor(sec%60);return `${m}:${String(s).padStart(2,"0")}`;}
async function getPlayableAudioUrl(beat){
  if(!beat)return null;
  const blob=await audioDB.load(beat.id);
  if(blob)return URL.createObjectURL(blob);
  const externalUrl=getBeatAudioUrl(beat);
  if(externalUrl)return externalUrl;
  return null;
}
function updateCollectionPlayerUI(){updateBottomUI();}
function updateBottomUI(){
  const bar=document.getElementById("bottomPlayer");if(!bar)return;
  const beat=bottomPlayer.queue[bottomPlayer.index];
  const active=!!beat||bottomPlayer.started;
  bar.classList.toggle("show",active);
  const _bpBtn=document.getElementById("bpPlayBtn");
  // SVG-ikoner (ingen emojier — ⏸/▶ ble vist som fargede emojier på mobil)
  const _bpWant=bottomPlayer.audio.paused?"play":"pause";
  if(_bpBtn.dataset.icon!==_bpWant){_bpBtn.dataset.icon=_bpWant;_bpBtn.innerHTML=MV_PLAYER_ICONS[_bpWant];}
  _bpBtn.setAttribute("aria-label",bottomPlayer.audio.paused?"Spill av":"Pause");
  document.getElementById("bpTitle").textContent=beat?beat.name:"Ingen låt valgt";
  const ctx=bottomPlayer.context?`${bottomPlayer.context.label||"Spiller"}${bottomPlayer.queue.length>1?` · ${bottomPlayer.index+1}/${bottomPlayer.queue.length}`:""}`:"Beat";
  document.getElementById("bpSub").textContent=beat?ctx:"Trykk play på en beat, et album eller en mixtape";
  const cover=document.getElementById("bpCover");
  if(beat&&beat.cover){
    cover.innerHTML=`<img src="${esc(beat.cover)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:inherit;">`;
    cover.style.background="none";
  } else {
    cover.innerHTML=MV_PLAYER_ICONS.note;
    cover.style.background="";
  }
  updateOpenCollectionControls();
  // Live play-state hooks defined in app.js / track-cards.js (those files load BEFORE this one,
  // so they can't wrap updateBottomUI themselves — we call them here instead).
  if(typeof window.updatePlayingAnimations==='function')window.updatePlayingAnimations();
  if(typeof window.markPlayingCard==='function')window.markPlayingCard();
}
function updateOpenCollectionControls(){
  const beat=bottomPlayer.queue[bottomPlayer.index];
  const playing=!!beat&&!bottomPlayer.audio.paused;
  const ctx=bottomPlayer.context||{};
  const update=(type,currentId,playBtnId,stopBtnId,nowId)=>{
    const isThis=playing&&ctx.type===type&&ctx.id===currentId;
    const btn=document.getElementById(playBtnId);
    if(btn)btn.innerHTML=isThis?`<span class="ic ic-pause" aria-hidden="true"></span> Spiller: ${esc(beat.name)}`:`<span class="ic ic-play" aria-hidden="true"></span> Spill fra start`;
    const stop=document.getElementById(stopBtnId);
    if(stop)stop.classList.toggle("hidden",!isThis);
    const now=document.getElementById(nowId);
    if(now)now.textContent=isThis?`Nå spilles ${bottomPlayer.index+1}/${bottomPlayer.queue.length}: ${beat.name}`:"";
  };
  update("album",currentAlbumId,"playAlbumBtn","stopAlbumBtn","albumNowPlaying");
  update("mixtape",currentMixtapeId,"playMixtapeBtn","stopMixtapeBtn","mixtapeNowPlaying");
}
// Paint the "played" portion of a range input (Spotify-style white fill) via a CSS var.
function bpSetRangeFill(el){
  if(!el)return;
  const min=Number(el.min)||0,max=Number(el.max)||100,v=Number(el.value);
  const pct=max>min?((v-min)/(max-min))*100:0;
  el.style.setProperty('--pct',pct+'%');
}
function updateBottomProgress(){
  const a=bottomPlayer.audio;
  const dur=isFinite(a.duration)?a.duration:0;
  document.getElementById("bpCurrent").textContent=fmtTime(a.currentTime);
  document.getElementById("bpDuration").textContent=fmtTime(dur);
  const seek=document.getElementById("bpSeek");
  if(seek){
    if(!seek.matches(":active"))seek.value=dur?Math.round((a.currentTime/dur)*1000):0;
    bpSetRangeFill(seek);
  }
  // F7: only count a play once ≥20% of the track has actually been played (and only once per track).
  if(!bottomPlayer.playCounted&&dur>0&&!a.paused&&(a.currentTime/dur)>=0.2){
    bottomPlayer.playCounted=true;
    const b=bottomPlayer.queue[bottomPlayer.index];
    recordBeatPlay(b&&b.id);
  }
}
function bottomSeek(v){const a=bottomPlayer.audio;if(isFinite(a.duration)&&a.duration>0)a.currentTime=(Number(v)/1000)*a.duration;bpSetRangeFill(document.getElementById("bpSeek"));}
function bottomSetVolume(v){bottomPlayer.audio.volume=Number(v);bpSetRangeFill(document.getElementById("bpVolume"));}
// Keep the range fills painted while dragging + on first load.
(function initBpRangeFills(){
  const wire=()=>{
    const seek=document.getElementById("bpSeek"),vol=document.getElementById("bpVolume");
    if(seek){seek.addEventListener("input",()=>bpSetRangeFill(seek));bpSetRangeFill(seek);}
    if(vol){vol.addEventListener("input",()=>bpSetRangeFill(vol));bpSetRangeFill(vol);}
  };
  if(document.readyState!=="loading")wire();
  else document.addEventListener("DOMContentLoaded",wire);
})();
async function playBottomIndex(i){
  if(i<0)i=0;
  if(i>=bottomPlayer.queue.length){bottomStop(true);showToast("✓ Ferdigspilt");return;}
  bottomPlayer.index=i;bottomPlayer.started=true;
  bottomPlayer.playCounted=false;   // F7: reset — this track hasn't passed the 20% count threshold yet
  const beat=bottomPlayer.queue[i];
  const url=await getPlayableAudioUrl(beat);
  if(!url){reportUnplayableBeat(beat);bottomStop(true);return;}
  if(bottomPlayer.objectUrl)URL.revokeObjectURL(bottomPlayer.objectUrl);
  bottomPlayer.objectUrl=url.startsWith("blob:")?url:null;
  bottomPlayer.audio.pause();
  bottomPlayer.audio.src=url;
  bottomPlayer.audio.load();
  updateBottomUI();
  try{await bottomPlayer.audio.play();}   // F7: the play count is recorded later, once ≥20% has played
  catch(e){
    console.error('Audio play failed:',e,url,beat);
    showToast('Kunne ikke spille av låten. Lydfilen mangler eller kan ikke åpnes – bytt den via ⋯ → Mer → Bytt lydfil.');
  }
  updateBottomUI();
}
// F7: play history / counter. Counts once per track-start (this is the single choke-point for
// all playback — album, mixtape, single beat, collection). Stored on the beat + synced to Supabase.
function recordBeatPlay(beatId){
  if(!beatId)return;
  const b=state.beats.find(x=>x.id===beatId);if(!b)return;
  b.playCount=(Number(b.playCount)||0)+1;
  b.lastPlayedAt=Date.now();
  saveState();                       // persists locally + debounced Supabase push
  updatePlayCountBadges(beatId);     // live-update any visible chips without a full re-render
}
function playCountTitle(b){
  const n=Number(b&&b.playCount)||0;
  if(!n)return 'Ikke spilt enda';
  const when=b.lastPlayedAt?` · sist ${new Date(b.lastPlayedAt).toLocaleString('nb-NO',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}`:'';
  return `Spilt ${n} gang${n===1?'':'er'}${when}`;
}
function updatePlayCountBadges(beatId){
  const b=state.beats.find(x=>x.id===beatId);if(!b)return;
  const n=Number(b.playCount)||0;
  const sel=(window.CSS&&CSS.escape)?CSS.escape(String(beatId)):String(beatId);
  document.querySelectorAll(`[data-pc-id="${sel}"]`).forEach(el=>{
    el.innerHTML=`<span class="ic ic-play" aria-hidden="true"></span> ${n}`;
    el.classList.toggle('empty',!n);
    el.title=playCountTitle(b);
  });
}
async function playQueue(queue,context){
  if(!queue.length){showToast("Ingen låter å spille");return;}
  bottomPlayer.queue=queue;bottomPlayer.index=0;bottomPlayer.context=context||null;
  await playBottomIndex(0);
}
// ── Lyric Lab deler bunnspillerens lydelement (js/lyriclab.js → initWaveSurfer) ──
// Én spiller: det som spiller fortsetter når du åpner låten i Lyric Lab, og
// posisjon/pause følger med begge veier.
function mvLyricLabOwnsPlayer(){
  const tab=document.getElementById("lyriclabTab");
  const cur=bottomPlayer.queue[bottomPlayer.index];
  return !!(tab&&!tab.classList.contains("hidden")&&cur&&cur.id===window.currentLyricLabBeatId);
}
// Legg en låt klar i bunnspilleren uten å starte den. Står den der allerede,
// røres ingenting (posisjon og avspilling beholdes). Returnerer src-en.
async function mvCueBeat(beatId){
  const cur=bottomPlayer.queue[bottomPlayer.index];
  if(cur&&cur.id===beatId&&bottomPlayer.audio.src)return bottomPlayer.audio.src;
  const beat=state.beats.find(b=>b.id===beatId);if(!beat)return null;
  const url=await getPlayableAudioUrl(beat);if(!url)return null;
  if(bottomPlayer.objectUrl)URL.revokeObjectURL(bottomPlayer.objectUrl);
  bottomPlayer.objectUrl=url.startsWith("blob:")?url:null;
  bottomPlayer.queue=[beat];bottomPlayer.index=0;
  bottomPlayer.context={type:"beat",id:beatId,label:"Lyric Lab"};
  bottomPlayer.started=true;bottomPlayer.playCounted=false;
  bottomPlayer.audio.pause();bottomPlayer.audio.src=url;bottomPlayer.audio.load();
  updateBottomUI();
  return url;
}
window.mvCueBeat=mvCueBeat;
window.mvBottomAudio=bottomPlayer.audio;
async function playSingleBeat(beatId){const beat=state.beats.find(b=>b.id===beatId);if(!beat)return;await playQueue([beat],{type:"beat",id:beatId,label:"Beat"});}
// Play a song inside an album/mixtape and keep playing the rest of that collection after it
// (in the order shown on screen). Falls back to single-beat playback if no collection is open.
async function playCollectionFromBeat(beatId,mode){
  const listMode=mode==="mixtape"?"mixtape":"album";
  const col=activeCollectionForMode(listMode);
  if(!col||!Array.isArray(col.beatIds))return playSingleBeat(beatId);
  const queue=listMode==="mixtape"?getSortedMixtapeBeats(col):beatsFromIds(col.beatIds);
  const startIdx=queue.findIndex(b=>b.id===beatId);
  if(startIdx<0)return playSingleBeat(beatId);
  bottomPlayer.queue=queue;
  bottomPlayer.index=startIdx;
  bottomPlayer.context={type:listMode,id:col.id,label:col.name};
  await playBottomIndex(startIdx);
}
function bottomTogglePlay(){if(!bottomPlayer.audio.src&&bottomPlayer.queue.length){playBottomIndex(bottomPlayer.index);return;}if(bottomPlayer.audio.paused){bottomPlayer.audio.play().catch(()=>showToast("Trykk Play igjen hvis nettleseren blokkerte avspilling"));}else bottomPlayer.audio.pause();updateBottomUI();}
function bottomNext(auto=false){if(bottomPlayer.index+1<bottomPlayer.queue.length)playBottomIndex(bottomPlayer.index+1);else if(auto)bottomStop(true);}
function bottomPrev(){if(bottomPlayer.audio.currentTime>3){bottomPlayer.audio.currentTime=0;return;}playBottomIndex(Math.max(0,bottomPlayer.index-1));}
function bottomStop(silent=false){bottomPlayer.audio.pause();bottomPlayer.audio.removeAttribute("src");bottomPlayer.audio.load();if(bottomPlayer.objectUrl)URL.revokeObjectURL(bottomPlayer.objectUrl);bottomPlayer.objectUrl=null;bottomPlayer.queue=[];bottomPlayer.index=0;bottomPlayer.context=null;bottomPlayer.started=false;updateBottomUI();if(!silent)showToast("Avspilling stoppet");}
function stopCollectionPlayback(silent=false){bottomStop(silent);}
async function playAlbumFromStart(albumId){const album=state.albums.find(a=>a.id===albumId);if(!album)return;const queue=beatsFromIds(album.beatIds);if(!queue.length){showToast("Albumet har ingen låter ennå");return;}await playQueue(queue,{type:"album",id:albumId,label:album.name});}
async function playMixtapeFromStart(mixtapeId){const mt=state.mixtapes.find(m=>m.id===mixtapeId);if(!mt)return;const queue=beatsFromIds(mt.beatIds);if(!queue.length){showToast("Mixtapen har ingen låter ennå");return;}await playQueue(queue,{type:"mixtape",id:mixtapeId,label:mt.name});}
document.addEventListener("play",e=>{
  const el=e.target;
  if(el&&el.tagName==="AUDIO"&&el.id&&el.id.startsWith("au-")){
    const beatId=el.id.slice(3);
    el.pause();
    playSingleBeat(beatId);
  }
},true);

// Accepted audio extensions for "bytt lydfil" — mobile pickers give `type:""` for several of
// these, so the extension is the reliable check. Keep in sync with the `accept` attributes.
const AUDIO_EXT_RE=/\.(mp3|wav|m4a|aac|flac|ogg|oga|opus|aif|aiff|wma|mp4)$/i;
function isAudioFile(file){
  if(!file)return false;
  return (file.type||"").startsWith("audio")||AUDIO_EXT_RE.test(file.name||"");
}
window.isAudioFile=isAudioFile;
// F6: replace a song's audio file. The old file is overwritten PERMANENTLY in R2 (same key =
// beat.id, so the PUT replaces it and frees the storage). Warns first. Cache-busts the reused URL.
async function uploadBeatAudio(beatId,file){
  // NB: mobile file pickers often give an empty `type` for .wav/.m4a/.aiff, so fall back
  // to the file extension instead of rejecting a perfectly good demo.
  if(!file||!isAudioFile(file)){showToast("Velg en gyldig lydfil");return;}
  const b=state.beats.find(x=>x.id===beatId);if(!b)return;
  const hadAudio=!!(b.audio_url||b.url);
  if(hadAudio&&!(await mvConfirm({title:`Bytte lydfilen på «${b.name}»?`,body:`Ny fil: ${file.name}. Den gamle lydfilen slettes for godt. Last den ned først hvis du vil beholde den.`,ok:'Bytt lydfil',danger:true})))return;
  // Lokal kopi for umiddelbar avspilling (getPlayableAudioUrl foretrekker IDB-bloben)
  await audioDB.save(beatId,file);
  b.url=beatId+":idb"; // sentinel so we know audio exists
  b.source="local";
  if(!(Number(b.bpm)>0))await mvApplyBpm(b,{file,name:file.name});   // ny fil kan ha tempo i metadata
  b.audioUpdatedAt=Date.now();   // ny lyd → gammel bølgeform i Lyric Lab gjelder ikke lenger
  if(b.keySource==='analyse'){b.key='';}   // ny fil → finn tonearten på nytt
  if(window.mvAnalysis)setTimeout(()=>window.mvAnalysis.enrich(b,file).catch(()=>{}),400);
  saveState();
  const el=document.getElementById("au-"+beatId);
  if(el){
    if(el.dataset.objectUrl)URL.revokeObjectURL(el.dataset.objectUrl);
    const objectUrl=URL.createObjectURL(file);
    el.dataset.objectUrl=objectUrl;
    el.src=objectUrl;
    const wrap=document.getElementById("au-wrap-"+beatId)||el.parentElement;
    if(wrap)wrap.style.display="block";
  }
  // Erstatt i R2: samme nøkkel (active|archived/{beat.id}) → PUT overskriver/​frigjør den
  // gamle filen permanent. Lå den gamle filen på en ANNEN nøkkel, slettes den eksplisitt.
  if(window.r2Storage&&window.r2Storage.ready()){
    const oldKey=b.r2_key||"";
    const newKey=(b.archived?"archived/":"active/")+beatId;
    try{
      let up=file;
      if(window.audioCompress?.shouldCompress(up))up=await window.audioCompress.compress(up);
      showToast(`Erstatter lydfil (${(up.size/(1024*1024)).toFixed(1)}MB) i R2...`);
      const url=await window.r2Storage.upload(beatId,up,!!b.archived);
      // Same key → same URL; bust caches/CDN so the new audio is served, not the old.
      b.audio_url=url+(url.includes("?")?"&":"?")+"v="+Date.now();
      b.r2_key=newKey;
      // Legacy/stale key (f.eks. bare "{beatId}" fra en eldre versjon, eller archived/ vs
      // active/): PUT-en overskrev den ikke, så den gamle filen ville blitt liggende å ta plass.
      if(oldKey&&oldKey!==newKey&&oldKey!==beatId&&oldKey.includes("/")){
        try{ await window.r2Storage.removeKey(oldKey); }catch(e){ console.warn("[R2] Kunne ikke slette gammel nøkkel:",oldKey,e); }
      }
      saveState();
      if(typeof window.pushToSupabase==="function")window.pushToSupabase();
      showToast("✓ Lydfil erstattet — gammel fil slettet");
    }catch(e){
      console.error("[R2] Bytt lydfil feilet:",e);
      showToast('Kunne ikke lagre lydfilen i skyen. Den er lagret på denne enheten – prøv igjen når du er på nett.');
    }
  }else{
    showToast("✓ Lydfil lastet opp (lokalt)");
  }
}

// ── F5: RAW vocals ───────────────────────────────────────────────────────────
// High-quality vocal stems attached to a song so the artist can share them with producers.
// Stored in R2 under a per-song namespace `raw/{beatId}/{fileId}` (NOT compressed — full quality),
// with metadata in `beat.rawVocals[]` (synced to Supabase like the rest of state). Each file gets
// a public URL the artist can copy/send; files are individually deletable (R2 + metadata).
function rawVocalsMarkup(b){
  const list=Array.isArray(b.rawVocals)?b.rawVocals:[];
  const items=list.map(r=>{
    const dl = r.url
      ? `<a class="ab-raw-btn" href="${esc(r.url)}" target="_blank" rel="noopener" download="${esc(r.name)}" title="Last ned / åpne"><span class="ic ic-download" aria-hidden="true"></span></a>`
      : `<button class="ab-raw-btn" onclick="event.stopPropagation();downloadLocalRaw('${b.id}','${r.id}')" title="Last ned (lokal kopi)"><span class="ic ic-download" aria-hidden="true"></span></button>`;
    return `
    <div class="ab-raw-item">
      <span class="ab-raw-name" title="${esc(r.name)}"><span class="ic ic-mic" aria-hidden="true"></span> ${esc(r.name)}${r.url?"":` <span class="ab-raw-local" title="Kun lagret lokalt — del-lenke lages ved opplasting til R2 (live-siden)">lokal</span>`}</span>
      <span class="ab-raw-size">${(Number(r.size||0)/(1024*1024)).toFixed(1)}MB</span>
      ${dl}
      <button class="ab-raw-btn" onclick="event.stopPropagation();copyRawVocalLink('${b.id}','${r.id}')" title="Kopier delingslenke"><span class="ic ic-link" aria-hidden="true"></span></button>
      <button class="ab-raw-btn danger" onclick="event.stopPropagation();deleteRawVocal('${b.id}','${r.id}')" title="Slett permanent"><span class="ic ic-trash" aria-hidden="true"></span></button>
    </div>`;
  }).join("");
  return `
    <div class="ab-raw-head">
      <span class="ab-raw-title">RAW-vokaler${list.length?` <span class="ab-raw-count">${list.length}</span>`:""}</span>
      <label class="ghost-btn ab-raw-upload" style="cursor:pointer;font-size:12px;padding:6px 12px">+ Last opp RAW<input type="file" accept="audio/*,.wav,.aif,.aiff,.flac,.m4a" multiple hidden onchange="uploadRawVocals('${b.id}',this.files);this.value=''"></label>
    </div>
    <div class="ab-raw-hint">Høykvalitets vokalfiler for produsenter — del lenken så de kan laste ned og mikse.</div>
    ${list.length?`<div class="ab-raw-list">${items}</div>`:`<div class="ab-raw-empty">Ingen RAW-vokaler lastet opp enda.</div>`}`;
}
function renderRawList(beatId){
  const b=state.beats.find(x=>x.id===beatId);if(!b)return;
  document.querySelectorAll(`#abraw-${beatId}`).forEach(el=>{el.innerHTML=rawVocalsMarkup(b);});
}
// Local-first: every file is saved to IndexedDB immediately (so it shows up + is downloadable/
// playable even with no R2), THEN uploaded to R2 in the background for a shareable public link.
// R2's CORS only allows the github.io origin, so locally the R2 step fails (kept as "lokal").
async function uploadRawVocals(beatId,files){
  const b=state.beats.find(x=>x.id===beatId);if(!b)return;
  if(!Array.isArray(b.rawVocals))b.rawVocals=[];
  const picked=[...(files||[])].filter(f=>f);
  if(!picked.length)return;
  for(const file of picked){
    const rawId=uid();
    const idbKey=`raw:${beatId}:${rawId}`;
    const r2key=`raw/${beatId}/${rawId}`;
    // 1) Lagre lokalt FØRST → vises umiddelbart, kan spilles/lastes ned uansett R2.
    try{ await audioDB.save(idbKey,file); }catch(e){ console.warn("[RAW] IDB-lagring feilet:",e); }
    const entry={id:rawId,name:file.name,size:file.size,type:file.type||"",key:r2key,idbKey,url:"",uploadedAt:Date.now()};
    b.rawVocals.push(entry);
    saveState();
    renderRawList(beatId);
    showToast(`✓ «${file.name}» lagt til`);
    // 2) Last opp til R2 i bakgrunnen for en delbar offentlig lenke (krever live-origin pga CORS).
    if(window.r2Storage&&window.r2Storage.ready()){
      try{
        showToast(`Deler «${file.name}» (${(file.size/(1024*1024)).toFixed(1)}MB) til R2…`);
        const url=await window.r2Storage.uploadKey(r2key,file);   // NB: ingen komprimering — full kvalitet
        entry.url=url;
        saveState();
        if(typeof window.pushToSupabase==="function")window.pushToSupabase();
        renderRawList(beatId);
        showToast(`✓ «${file.name}» klar til deling`);
      }catch(e){
        console.error("[RAW] R2-opplasting feilet:",e);
        showToast("Lagret lokalt — deling til R2 virker bare på live-siden");
      }
    }
  }
}
async function downloadLocalRaw(beatId,rawId){
  const b=state.beats.find(x=>x.id===beatId);
  const raw=b&&Array.isArray(b.rawVocals)&&b.rawVocals.find(r=>r.id===rawId);
  if(!raw)return;
  try{
    const blob=await audioDB.load(raw.idbKey);
    if(!blob){showToast("Fant ikke den lokale filen");return;}
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");a.href=url;a.download=raw.name||"raw-vokal";
    document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),4000);
  }catch(e){console.warn("[RAW] lokal nedlasting feilet:",e);showToast("Kunne ikke laste ned filen. Sjekk at du er på nett, og prøv igjen.");}
}
async function deleteRawVocal(beatId,rawId){
  const b=state.beats.find(x=>x.id===beatId);if(!b||!Array.isArray(b.rawVocals))return;
  const raw=b.rawVocals.find(r=>r.id===rawId);if(!raw)return;
  if(!(await mvConfirm({title:`Slette RAW-vokalen «${raw.name}»?`,body:'Den slettes for godt og kan ikke hentes tilbake.',ok:'Slett',danger:true})))return;
  try{ if(raw.idbKey) await audioDB.del(raw.idbKey); }catch(e){}
  try{ if(raw.url&&window.r2Storage?.removeKey) await window.r2Storage.removeKey(raw.key); }catch(e){console.warn("[RAW] R2-sletting feilet:",e);}
  b.rawVocals=b.rawVocals.filter(r=>r.id!==rawId);
  saveState();
  if(typeof window.pushToSupabase==="function")window.pushToSupabase();
  renderRawList(beatId);
  showToast("✓ RAW-vokal slettet");
}
function copyRawVocalLink(beatId,rawId){
  const b=state.beats.find(x=>x.id===beatId);
  const raw=b&&Array.isArray(b.rawVocals)&&b.rawVocals.find(r=>r.id===rawId);
  if(!raw)return;
  if(!raw.url){showToast("Kun lagret lokalt — del-lenke lages når filen lastes opp til R2 (på live-siden)");return;}
  navigator.clipboard.writeText(raw.url).then(()=>showToast("✓ Delingslenke kopiert"),()=>showToast("Kunne ikke kopiere lenken. Marker og kopier den selv."));
}

// When creating beats from file upload, also store in IDB
async function createBeatFromFileIDB(file){
  const b={id:uid(),name:file.name.replace(/\.[^/.]+$/,""),url:"",source:"local",favorite:false,lyrics:"",rating:0,cover:"",done:0,createdAt:Date.now()};
  await audioDB.save(b.id,file);
  b.url=b.id+":idb";
  await mvApplyBpm(b,{file,name:file.name});
  // Cover/toneart fra filen, ellers analyse av lyden (analysis.js) — i bakgrunnen
  if(window.mvAnalysis)setTimeout(()=>window.mvAnalysis.enrich(b,file).catch(()=>{}),400);
  return b;
}

// ── BPM (js/bpm.js) ──────────────────────────────────────────────────────────
// Leses fra ORIGINALFILEN ved opplasting — audio-compress fjerner metadata når
// WAV gjøres om til MP3, så etterpå er det for sent. Ellers: filnavnet, hvis entydig.
// bpmSource: 'fil' | 'filnavn' | 'manuell'. En manuell verdi overskrives aldri.
async function mvApplyBpm(b,src){
  if(!b||b.bpmSource==="manuell"||!window.mvBpm)return false;
  try{
    const r=await window.mvBpm.detect(src);
    b.bpmChecked=true;
    if(r){b.bpm=r.bpm;b.bpmSource=r.source;return true;}
  }catch(e){}
  return false;
}
// Etterfyll én gang for låter som fantes før dette: lagret fil (bare starten via
// Range) → filnavn. bpmChecked hindrer at samme låt sjekkes på nytt.
async function mvBackfillBpm(){
  if(!window.mvBpm||sessionStorage.getItem("mv_unlocked")!=="1")return;
  const todo=(state.beats||[]).filter(b=>!b._shared&&!b.bpmChecked&&!(Number(b.bpm)>0));
  if(!todo.length)return;
  let found=0;
  for(const b of todo){
    const u=b.audio_url||b.url||"";
    if(await mvApplyBpm(b,{url:/^https?:\/\//i.test(u)?u:null,name:b.name}))found++;
  }
  saveState();
  console.log(`[BPM] Etterfylt ${found} av ${todo.length} låter`);
}
window.mvBackfillBpm=mvBackfillBpm;
setTimeout(()=>{mvBackfillBpm().catch(e=>console.warn("[BPM]",e));},8000);
// Rett BPM for hånd (Lyric Lab). Tom/0 fjerner verdien.
window.mvSetBpm=function(beatId,val){
  const b=state.beats.find(x=>x.id===beatId);if(!b)return;
  const n=Math.round(Number(String(val).replace(",",".")));
  if(n>=40&&n<=300){b.bpm=n;b.bpmSource="manuell";}
  else if(!String(val).trim()){b.bpm=null;b.bpmSource="manuell";}
  else{showToast("BPM må være mellom 40 og 300");return false;}
  b.bpmChecked=true;saveState();return true;
};

const STAGES=["Idé","Hook","Vers","Innspilt","Mix","Master","Klar"];
const SK="musicVault.v4";
const state=loadState();
window.state = state; // eksponér globalt for audio-compress.js og andre
let currentAlbumId=null;
let modalRating=0;
let newAlbumCoverBase64=null;
let newAlbumCoverFile=null;   // originalen, for HD-cover etter opprettelse

// Felles statusfarger (samme regel som pipeline.js): 0 = ikke startet (nøytral),
// 1–99 = i arbeid (oransje), 100 = ferdig (grønn). Rødt brukes bare for feil.
function mvPctColor(p){p=Number(p)||0;return p>=100?"var(--ok)":p>0?"var(--accent-ink)":"var(--muted)";}
window.mvPctColor=mvPctColor;
function uid(){return crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random().toString(36).slice(2)}`;}
function clamp(v){return Math.max(0,Math.min(100,Number(v||0)));}
function esc(v){return String(v||"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");}
function convertDrive(url){const m=url.match(/\/d\/([^/?#]+)/);return m?`https://drive.google.com/uc?export=download&id=${m[1]}`:url;}

function lyricsEditorMarkup(beatId,placeholder){
  // Always return a mount point — filled immediately if lyriclab.js is ready,
  // or filled by mountInlineEditors() called from toggleAlbumBeat/toggleBeat
  if(typeof window.renderInlineSections === 'function'){
    return `<div class="ll-inline-mount" id="llmount-${beatId}" data-beat-id="${beatId}" data-mounted="1">${window.renderInlineSections(beatId)}</div>`;
  }
  return `<div class="ll-inline-mount" id="llmount-${beatId}" data-beat-id="${beatId}">
    <div style="color:var(--muted);font-size:12px;padding:8px 0">Laster editor...</div>
  </div>`;
}

// Called by lyriclab.js after it loads — fills all pending mount points
function mountInlineEditors(){
  document.querySelectorAll('.ll-inline-mount:not([data-mounted])').forEach(el=>{
    const id = el.dataset.beatId;
    if(id && typeof window.renderInlineSections === 'function'){
      el.innerHTML = window.renderInlineSections(id);
      el.setAttribute('data-mounted','1');
    }
  });
}


function defaultState(){
  return{beats:[],demos:[],albums:[],mixtapes:[],versions:[],settings:{driveFolderId:"",driveApiKey:"",soundcloudProxy:""}};
}
function migrate(s){
  const base=defaultState();
  const n={...base,...s};
  n.beats=(n.beats||[]).map(b=>({...b,lyrics:b.lyrics||"",favorite:!!b.favorite,rating:Number(b.rating||0),cover:b.cover||"",done:Number(b.done||0)}));
  n.demos=(n.demos||[]).map(d=>({...d,stage:d.stage||"Idé",mix:Number(d.mix??0),rating:Number(d.rating||1),done:Number(d.done||0),lyricsNotes:d.lyricsNotes||""}));
  n.albums=n.albums||[];n.mixtapes=(n.mixtapes||[]).map(m=>({...m,cover:m.cover||null,color:m.color||null,beatIds:m.beatIds||[]}));n.versions=n.versions||[];n.settings={...base.settings,...(n.settings||{})};
  return n;
}
function getUserSK(){ const uid=sessionStorage.getItem('mv_user_id'); return uid ? SK+'.'+uid : SK; }
function loadState(){try{const uid=sessionStorage.getItem('mv_user_id');const key=uid?SK+'.'+uid:SK;const r=localStorage.getItem(key)||(uid?localStorage.getItem(SK):null);const s=r?JSON.parse(r):null;return s?migrate(s):defaultState();}catch{return defaultState();}}
function saveState(){
  // Denne deklarasjonen klobber alle window.saveState-wrappere i app.js og
  // supabase.js (FINDINGS §0) — derfor kalles de eksplisitt herfra.
  if(typeof window.mvEnsureFullData==='function') window.mvEnsureFullData();
  try{localStorage.setItem(getUserSK(),JSON.stringify(state));}catch(e){console.warn('saveState failed:',e);}
  markDirty();
  renderStats();
  if(typeof window.mvSupabaseSync?.schedulePush==='function')window.mvSupabaseSync.schedulePush();
  if(typeof window.mvShowSaved==='function') window.mvShowSaved();
}
function isAdmin(){return sessionStorage.getItem('mv_role')==='admin';}



function releaseScore(d){
  return Math.round(Math.min(100,
    (Number(d.rating||0)/10)*25+
    (Number(d.done||0)/100)*30+
    (Number(d.mix||0)/100)*20+
    (STAGES.indexOf(d.stage||"Idé")/(STAGES.length-1))*15+
    (state.versions.some(v=>v.demoId===d.id)?3:0)+
    ((d.lyricsNotes||"").trim()?2:0)
  ));
}

function renderStats(){ renderDashboard(); }
// Språkbytte: tegn Hjem på nytt (ukedagsbokstaver o.l. lages i koden)
document.addEventListener('mv:lang',()=>{ try{ renderDashboard(); }catch(e){} });

function renderDashboard(){
  const username=sessionStorage.getItem('mv_username')||'deg';
  const h=new Date().getHours();
  const greet=h<10?'God morgen':h<17?'God dag':h<22?'God kveld':'God natt';
  const gEl=document.getElementById('dashGreeting');
  const sEl=document.getElementById('dashSub');
  if(gEl) gEl.textContent=greet+', '+username;
  const beats=(state.beats||[]).filter(b=>!b.archived);
  const albums=(state.albums||[]).filter(a=>!a.archived);
  const mixtapes=(state.mixtapes||[]).filter(m=>!m.archived);
  const noAudio=beats.filter(b=>!(b.audio_url||b.url));
  const allDemos=albums.flatMap(a=>(a.beatIds||[]).map(id=>beats.find(b=>b.id===id)).filter(Boolean));
  const avgDone=allDemos.length?Math.round(allDemos.reduce((s,b)=>s+Number(b.done||0),0)/allDemos.length):0;
  if(sEl){
    sEl.innerHTML=`<div id="dashSubPills" style="display:flex;gap:6px;flex-wrap:wrap;margin-top:4px">`+
      `<span class="ds-pill">${beats.length} ${beats.length===1?'låt':'låter'}</span>`+
      `<span class="ds-pill ds-accent">${albums.length} ${albums.length===1?'album':'albumer'}</span>`+
      `<span class="ds-pill ds-accent">${mixtapes.length} ${mixtapes.length===1?'mixtape':'mixtapes'}</span>`+
      (noAudio.length?`<span class="ds-pill ds-warn" title="${noAudio.slice(0,3).map(b=>b.name).join(', ')}">${noAudio.length} uten lyd</span>`:'')+
      `<span class="ds-pill" title="Snittet av «Ferdig %» på alle låter">${avgDone}% snitt ferdig</span></div>`;
  }
  const saEl=document.getElementById('dashSmartAlerts');
  if(saEl){
    const alerts=[];const now=Date.now(),DAY=86400000;
    const inAlbum=new Set(albums.flatMap(a=>a.beatIds||[]));
    const doneNotIn=beats.filter(b=>Number(b.done||0)>=100&&!inAlbum.has(b.id));
    if(doneNotIn.length) alerts.push({type:'info',icon:'<span class="ic ic-music" aria-hidden="true"></span>',msg:`${doneNotIn.length} låt${doneNotIn.length>1?'er er':'en er'} 100% ferdig men ikke i noe album`,detail:doneNotIn.slice(0,2).map(b=>esc(b.name)).join(', ')+(doneNotIn.length>2?' ...':''),tab:'albums'});
    // Siste aktivitet i et album = albumet selv eller noen av låtene i det (før så det dødt ut selv om låtene ble jobbet med daglig)
    albums.forEach(a=>{const aB=(a.beatIds||[]).map(id=>beats.find(b=>b.id===id)).filter(Boolean);
      const lu=Math.max(a.updatedAt||a.createdAt||0,...aB.map(b=>b.updatedAt||b.createdAt||0));
      const avg=aB.length?aB.reduce((s,b)=>s+Number(b.done||0),0)/aB.length:0;
      if(lu&&now-lu>14*DAY&&avg<100)alerts.push({type:'info',icon:'<span class="ic ic-clock" aria-hidden="true"></span>',msg:`\u00ab${esc(a.name)}\u00bb venter p\u00e5 deg`,detail:`Sist jobbet med for ${Math.floor((now-lu)/DAY)} dager siden`,tab:'albums'});});
    if(noAudio.length) alerts.push({type:'warn',icon:'<span class="ic ic-mute" aria-hidden="true"></span>',msg:`${noAudio.length} låt${noAudio.length>1?'er mangler':'en mangler'} lydfil`,detail:noAudio.slice(0,2).map(b=>esc(b.name)).join(', ')+(noAudio.length>2?' ...':''),tab:'beats'});
    if(!alerts.length) saEl.innerHTML='<div class="sa-empty">Ingen varsler akkurat n\u00e5 \u2713</div>';
    else saEl.innerHTML=alerts.map(a=>`<div class="smart-alert smart-alert-${a.type}" onclick="document.querySelector('.tab-btn[data-tab=\\'${a.tab}\\']')?.click()"><span class="sa-icon">${a.icon}</span><div class="sa-body"><div class="sa-msg">${a.msg}</div>${a.detail?`<div class="sa-detail">${a.detail}</div>`:''}</div><span class="sa-arrow">\u2192</span></div>`).join('');
  }
  const sortedAlbums=albums.slice().sort((a,b)=>(b.updatedAt||b.createdAt||b.id||0)-(a.updatedAt||a.createdAt||a.id||0));
  const heroAlbum=sortedAlbums[0]?{...sortedAlbums[0],_type:'album'}:null;
  function projectScore(p){const pB=(p.beatIds||[]).map(id=>beats.find(b=>b.id===id)).filter(Boolean);const avg=pB.length?pB.reduce((s,b)=>s+Number(b.done||0),0)/pB.length:0;return(p.updatedAt||p.createdAt||p.id||0)+(avg>15&&avg<92?(100-Math.abs(avg-55))*50000:0);}
  const pool=[...sortedAlbums.slice(1).map(a=>({...a,_type:'album'})),...mixtapes.map(m=>({...m,_type:'mixtape'}))].sort((a,b)=>projectScore(b)-projectScore(a)).slice(0,3);
  const projects=[...(heroAlbum?[heroAlbum]:[]),...pool].slice(0,4);
  const pEl=document.getElementById('dashProjects');
  if(pEl){
    if(!projects.length){pEl.innerHTML='<div class="dash-empty">Ingen prosjekter enn\u00e5.</div>';}
    else{pEl.innerHTML=projects.map(p=>{
      const isAlbum=p._type==='album';
      const pB=(p.beatIds||[]).map(id=>beats.find(b=>b.id===id)).filter(Boolean);
      const pct=pB.length?Math.round(pB.reduce((s,b)=>s+Number(b.done||0),0)/pB.length):0;
      const col=mvPctColor(pct);
      const count=pB.length;
      const cover=p.cover?`<img src="${esc(p.cover)}" alt="" style="width:100%;height:100%;object-fit:cover">`:`<span style="font-size:28px">${isAlbum?'<span class="ic ic-disc" aria-hidden="true"></span>':'<span class="ic ic-cassette" aria-hidden="true"></span>'}</span>`;
      // Uten cover: prosjektets egen farge (kassettfargen for mixtapes) i stedet for en grå rute
      const tint=!p.cover&&p.color?` style="background:linear-gradient(135deg,${esc(p.color)},color-mix(in srgb,${esc(p.color)} 55%,#000))"`:'';
      // Mixtapes har ingen steg → ingen prosent. Album på 0 % sier «ikke startet», ikke «0%».
      const showPct=isAlbum&&count>0;
      const pctLbl=!showPct?'':pct>0?`<span style="color:${col};font-weight:700">${window.mvStages?mvStages.fmt(pct):pct+'%'}</span>`:'<span class="dash-proj-new">ikke startet</span>';
      return `<div class="dash-proj-card" onclick="dashOpenProject('${esc(p.id)}','${p._type}')" data-cm-type="${p._type}" data-cm-id="${esc(p.id)}"><div class="dash-proj-cover${tint?' is-tinted':''}"${tint}>${cover}${showPct&&pct>0?`<div class="dash-proj-prog-bar"><div style="width:${pct}%;background:${col};height:100%;border-radius:2px"></div></div>`:''}</div><div class="dash-proj-footer"><div class="dash-proj-name" data-no-i18n>${esc(p.name)}</div><div class="dash-proj-meta"><span>${isAlbum?'Album':'Mixtape'}</span> &middot; <span>${count} låt${count===1?'':'er'}</span>${pctLbl?' &middot; '+pctLbl:''}</div></div></div>`;
    }).join('');}
  }
  const lastEl=document.getElementById('dashLastBeat');
  if(lastEl){
    const lastId=sessionStorage.getItem('mv_last_beat');
    const b=lastId?beats.find(x=>x.id===lastId):null;
    const recent=b||beats.slice().sort((a,b2)=>(b2.createdAt||b2.id||0)-(a.createdAt||a.id||0))[0];
    if(recent){
      const cover=recent.cover?`<img src="${esc(recent.cover)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:10px">`:'<span style="font-size:36px"><span class="ic ic-music" aria-hidden="true"></span></span>';
      const dur=recent.duration?Math.floor(recent.duration/60)+':'+String(Math.floor(recent.duration%60)).padStart(2,'0'):'';
      const meta=[recent.bpm?recent.bpm+' BPM':'',recent.key||'',dur].filter(Boolean).join(' · ');
      lastEl.dataset.cmBeat=recent.id;
      lastEl.innerHTML=`<div class="last-beat-cover">${cover}</div><div class="last-beat-info"><div class="last-beat-name">${esc(recent.name)}</div>${meta?`<div class="last-beat-dur">${esc(meta)}</div>`:''}<div class="last-beat-actions"><button class="last-beat-play" aria-label="Spill ${esc(recent.name)}" title="Spill" onclick="event.stopPropagation();playSingleBeat('${recent.id}');sessionStorage.setItem('mv_last_beat','${recent.id}')"><span class="ic ic-play" aria-hidden="true"></span></button><button class="last-beat-lab" onclick="event.stopPropagation();openInLyricLab('${recent.id}')"><span class="ic ic-pen" aria-hidden="true"></span> Åpne i Lyric Lab</button></div></div>`;
    } else {lastEl.innerHTML='<div class="dash-empty">Ingen låter enn\u00e5.</div>';}
  }
  const actEl=document.getElementById('dashActivity');
  const streakEl=document.getElementById('dashStreak');
  if(actEl){
    const today=new Date();today.setHours(0,0,0,0);
    const activeDays=new Set();
    beats.forEach(b=>{const ts=b.updatedAt||b.createdAt;if(ts){const d=new Date(ts);d.setHours(0,0,0,0);activeDays.add(d.getTime());}});
    albums.forEach(a=>{const ts=a.updatedAt||a.createdAt;if(ts){const d=new Date(ts);d.setHours(0,0,0,0);activeDays.add(d.getTime());}});
    mixtapes.forEach(m=>{const ts=m.updatedAt||m.createdAt;if(ts){const d=new Date(ts);d.setHours(0,0,0,0);activeDays.add(d.getTime());}});
    // Ukedagsbokstaver følger valgt språk (søndag først, som getDay())
    const dayNames=window.mvI18n&&mvI18n.lang==='en'?['S','M','T','W','T','F','S']:['\u00d8','M','T','O','T','F','L'];
    actEl.innerHTML=Array.from({length:7},(_,i)=>{
      const d=new Date(today);d.setDate(d.getDate()-(6-i));
      const on=activeDays.has(d.getTime()),isToday=i===6;
      return `<div class="act-col"><div class="act-bar${on?' on':''}${isToday?' today':''}"></div><div class="act-day-lbl">${dayNames[d.getDay()]}</div></div>`;
    }).join('');
    let streak=0,cur=new Date(today);
    while(activeDays.has(cur.getTime())){streak++;cur=new Date(cur);cur.setDate(cur.getDate()-1);}
    // Ingen rekke i dag betyr ikke «ingen aktivitet» — vis hvor mange av de 7 dagene som har vært aktive
    const week=Array.from({length:7},(_,i)=>{const d=new Date(today);d.setDate(d.getDate()-i);return activeDays.has(d.getTime());}).filter(Boolean).length;
    if(streakEl) streakEl.innerHTML=streak>0?`<span class="streak-num">${streak}</span><span class="streak-txt">dag${streak===1?'':'er'} p\u00e5 rad</span>`:week?`<span class="streak-num">${week}</span><span class="streak-txt">aktiv${week===1?'':'e'} dag${week===1?'':'er'} siste uke</span>`:'<span class="streak-txt">Ingen aktivitet siste uke</span>';
  }
  const recent2=beats.slice().sort((a,b)=>(b.createdAt||b.id||0)-(a.createdAt||a.id||0)).slice(0,4);
  const bEl=document.getElementById('dashBeats');
  if(bEl){
    if(!recent2.length){bEl.innerHTML='<div class="dash-empty">Ingen låter enn\u00e5.</div>';}
    else{bEl.innerHTML=recent2.map(b=>{
      const cover=b.cover?`<img src="${esc(b.cover)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:8px">`:`<span style="font-size:20px"><span class="ic ic-music" aria-hidden="true"></span></span>`;
      const dur=b.duration?Math.floor(b.duration/60)+':'+String(Math.floor(b.duration%60)).padStart(2,'0'):'';
      return `<div class="dash-beat-card" data-cm-beat="${b.id}"><div class="dash-beat-top"><div class="dash-beat-thumb">${cover}</div><div class="dash-beat-info"><div class="dash-beat-name" title="${esc(b.name)}">${esc(b.name)}</div>${dur?`<div class="dash-beat-dur">${dur}</div>`:''}</div></div><div class="dash-beat-btns"><button class="dash-btn-play" onclick="event.stopPropagation();playSingleBeat('${b.id}');sessionStorage.setItem('mv_last_beat','${b.id}')"><span class="ic ic-play" aria-hidden="true"></span> Spill</button><button class="dash-btn-lab" onclick="event.stopPropagation();openInLyricLab('${b.id}')"><span class="ic ic-pen" aria-hidden="true"></span> Lab</button></div></div>`;
    }).join('');}
  }
  const progEl=document.getElementById('dashProgress');
  if(progEl){
    if(!albums.length){progEl.innerHTML='<div class="dash-empty">Ingen albumer enn\u00e5.</div>';}
    else{progEl.innerHTML=albums.slice(0,4).map(a=>{
      const ab=(a.beatIds||[]).map(id=>beats.find(b=>b.id===id)).filter(Boolean);
      const pct=ab.length?Math.round(ab.reduce((s,b)=>s+Number(b.done||0),0)/ab.length):0;
      const col=mvPctColor(pct);
      return `<div class="prog-row"><div class="prog-top"><div class="prog-name">${esc(a.name)}</div><div class="prog-pct" style="color:${col}">${pct}%</div></div><div class="prog-track"><div class="prog-fill" style="width:${pct}%;background:${col}"></div></div></div>`;
    }).join('');}
  }
  // Gate the mobile "Flere sider" links (Label/Admin) to match desktop tab visibility.
  if(typeof window.mvSyncHomeMoreLinks==='function') window.mvSyncHomeMoreLinks();
}
window.dashOpenProject=function(id,type){if(type==='album'){document.querySelector('.tab-btn[data-tab="albums"]')?.click();setTimeout(()=>{if(typeof openAlbum==='function')openAlbum(id);setTimeout(()=>document.getElementById('albumDetailView')?.scrollIntoView({behavior:'smooth',block:'start'}),120);},80);}else{document.querySelector('.tab-btn[data-tab="mixtapes"]')?.click();setTimeout(()=>{if(typeof openMixtape==='function')openMixtape(id);setTimeout(()=>document.getElementById('mixtapeDetailView')?.scrollIntoView({behavior:'smooth',block:'start'}),120);},80);}};
window.dashNewAlbum=function(){document.querySelector('.tab-btn[data-tab="albums"]')?.click();setTimeout(()=>document.getElementById('newAlbumBtn')?.click(),80);};
window.dashNewMixtape=function(){document.querySelector('.tab-btn[data-tab="mixtapes"]')?.click();setTimeout(()=>document.getElementById('newMixtapeBtn')?.click(),80);};
window.dashOpenLyricLab=function(){document.querySelector('.tab-btn[data-tab="lyriclab"]')?.click();};
window.dashUploadTrigger=function(){document.getElementById('dashUploadInput')?.click();};
// Felles melding etter opplasting (Hjem, Beats, album, mixtape): én låt → «Skriv tekst» åpner den i Lyric Lab
// Nye låter: husk dem i 2 døgn (i denne nettleseren), så Beats kan vise dem som en CD som glir inn,
// med «Skriv tekst» som synlig neste steg i raden (forsvinner når låten har tekst).
window.mvFresh={
  key:'mv_fresh_beats', ttl:2*24*60*60*1000, // ny i 2 døgn
  all(){try{const m=JSON.parse(localStorage.getItem(this.key)||'{}');const now=Date.now();for(const k in m){if(now-m[k].t>this.ttl)delete m[k];}return m;}catch(e){return {};}},
  add(ids){try{const m=this.all();ids.forEach(id=>{m[id]={t:Date.now(),shown:false};});localStorage.setItem(this.key,JSON.stringify(m));}catch(e){}},
  has(id){return !!this.all()[id];},
  // Spill inn-animasjonen for nye rader som ennå ikke har vist den — bare når Beats faktisk vises
  play(){try{const t=document.getElementById('beatsTab');if(!t||!t.offsetParent)return;const m=this.all();let ch=false;
    t.querySelectorAll('.bl-row.bl-fresh').forEach(r=>{const id=r.dataset.beatId;if(m[id]&&!m[id].shown){m[id].shown=true;ch=true;r.classList.remove('bl-arrive');void r.offsetWidth;r.classList.add('bl-arrive');}});
    if(ch)localStorage.setItem(this.key,JSON.stringify(m));}catch(e){}}
};
document.addEventListener('click',e=>{if(e.target.closest&&e.target.closest('[data-tab="beats"]'))setTimeout(()=>window.mvFresh.play(),120);},true);
// Fremdriften på albumkort er låst til man trykker «Endre» (en tilfeldig dra skal ikke endre den)
window.mvToggleProgressEdit=function(btn,id){const r=document.getElementById('abirange-'+id);if(!r)return;r.disabled=!r.disabled;btn.textContent=r.disabled?'Endre':'OK';btn.setAttribute('aria-expanded',String(!r.disabled));if(!r.disabled)r.focus();};
window.mvWriteLyrics=function(id){document.querySelector('.tab-btn[data-tab="lyriclab"]')?.click();setTimeout(()=>typeof openInLyricLab==='function'&&openInLyricLab(id),60);};
window.mvUploadedToast=function(beats){
  beats=(beats||[]).filter(Boolean);
  if(!beats.length){showToast('Kunne ikke laste opp. Sjekk at du er på nett og at filen er en lydfil (mp3, wav, m4a).','Prøv igjen',()=>window.dashUploadTrigger&&dashUploadTrigger());return;}
  window.mvFresh.add(beats.map(b=>b.id));
  if(beats.length===1&&typeof openInLyricLab==='function'){const id=beats[0].id;showToast('✓ «'+beats[0].name+'» lastet opp','Skriv tekst',()=>window.mvWriteLyrics(id));}
  else showToast('✓ '+beats.length+' låt'+(beats.length>1?'er':'')+' lastet opp');
};
// Opplasting fra Hjem, Beats-siden og mobilknappen: legg låten(e) i biblioteket og lagre
// (før ble lydfila bare lagret lokalt og låten aldri lagt til). Én låt → «Skriv tekst».
window.dashUpload=async function(files){
  files=[...(files||[])].filter(f=>f&&(/^audio\//.test(f.type)||/\.(mp3|wav|m4a|aac|flac|ogg|aif|aiff)$/i.test(f.name)));
  if(!files.length){showToast('Fant ingen lydfiler');return;}
  const added=[];
  for(const file of files){
    try{const b=await createBeatFromFile(file);if(b){if(!state.beats.find(x=>x.id===b.id))state.beats.unshift(b);added.push(b);if(typeof uploadBeatToR2==='function')uploadBeatToR2(b,file);}}
    catch(e){console.warn('[upload]',e);}
  }
  const inp=document.getElementById('dashUploadInput');if(inp)inp.value='';
  if(!added.length){showToast('Kunne ikke laste opp. Sjekk at du er på nett og at filen er en lydfil (mp3, wav, m4a).','Prøv igjen',()=>window.dashUploadTrigger&&dashUploadTrigger());return;}
  saveState();
  try{renderDashboard();}catch(e){}
  try{window.beatsTab&&beatsTab.renderBeatsTab();}catch(e){}
  mvUploadedToast(added);
};


// ── BEATS ──
function renderBeats(container,beats,albumMode){
  const el=container||document.createElement("div");
  if(!beats){
    const q=(document.getElementById("beatSearch")||{}).value?.toLowerCase()||"";
    const f=(document.getElementById("beatFilter")||{}).value||"all";
    beats=state.beats
      .filter(b=>b.name.toLowerCase().includes(q))
      .filter(b=>f==="fav"?b.favorite:f==="lyrics"?b.lyrics?.trim():true)
      .sort((a,b)=>Number(b.favorite)-Number(a.favorite)||b.createdAt-a.createdAt);
  }
  if(!beats.length){el.innerHTML=`<div class="empty">Ingen beats her ennå.</div>`;return;}
  el.innerHTML=beats.map(b=>`
    <div class="beat-item" id="bi-${b.id}">
      <div class="beat-row" onclick="toggleBeat('${b.id}')">
        <div class="icon-pill"><span class="ic ic-music" aria-hidden="true"></span></div>
        <div class="beat-meta">
          <strong>${esc(b.name)}</strong>
          <span>${b.lyrics?.trim()?`<span class="ic ic-pen" aria-hidden="true"></span> Tekst lagret`:"Ingen tekst"} · ${esc(b.source||"URL")}</span>
        </div>
        <button class="star-btn${b.favorite?" active":""}" data-fav-id="${b.id}" aria-label="Favoritt: ${esc(b.name)}" aria-pressed="${b.favorite?'true':'false'}" onclick="event.stopPropagation();toggleFav('${b.id}',this)" title="Favoritt"><span class="ic ic-heart" aria-hidden="true"></span></button>
        <span class="expand-arrow">▾</span>
      </div>
      <div class="beat-expand">
        <div id="au-wrap-${b.id}" style="margin-bottom:12px">
          <button class="primary-btn" onclick="playSingleBeat('${b.id}')"><span class="ic ic-play" aria-hidden="true"></span> Spill denne</button>
        </div>
        <div style="margin-bottom:12px">
          <label class="ghost-btn ab-swap-audio" style="cursor:pointer;font-size:12px;display:inline-flex;align-items:center;gap:6px;padding:6px 12px" title="Erstatt lydfilen — den gamle slettes permanent"><span class="ic ic-music" aria-hidden="true"></span> Last opp / bytt lydfil<input type="file" accept="audio/*,.mp3,.wav,.m4a,.aac,.flac,.ogg,.aif,.aiff" hidden onchange="uploadBeatAudio('${b.id}',this.files[0]);this.value=''"></label>
        </div>
        <div class="ab-lyric-editor">
          ${lyricsEditorMarkup(b.id,"Skriv hook, vers, tekst, ideer, flows...")}
        </div>
        <div class="beat-expand-actions">
          <button class="ghost-btn" onclick="openInLyricLab('${b.id}')"><span class="ic ic-pen" aria-hidden="true"></span> Åpne i Lyric Lab</button>
          ${albumMode
  ? `<button class="small-btn danger" onclick="removeFromCollection('${b.id}','${listMode}')">Fjern fra ${listMode==="mixtape"?"mixtape":"album"}</button>
     ${isAdmin()?`<button class="small-btn danger" onclick="deleteBeat('${b.id}')">Slett låt</button>`:''}`
  : isAdmin()?`<button class="small-btn danger" onclick="deleteBeat('${b.id}')">Slett låt</button>`:''}
        </div>
      </div>
    </div>`).join("");
}

function toggleBeat(id){
  const item=document.getElementById(`bi-${id}`);if(!item)return;
  item.classList.toggle("expanded");
  if(item.classList.contains("expanded")){
    loadAudioForBeat(id);
    requestAnimationFrame(()=>{ if(typeof mountInlineEditors==='function') mountInlineEditors(); });
  }
}
// ── ⋯-meny for spor i album/mixtape: sjeldne handlinger samlet ett sted ──────
// (erstatter de tre små ikonene 🔗 ✎ × i hver rad)
function mvCloseTrackMenu(){document.querySelectorAll(".mv-row-menu").forEach(m=>m.remove());}
window.mvTrackMenu=function(btn,beatId,listMode){
  const open=document.querySelector(".mv-row-menu");mvCloseTrackMenu();
  if(open&&open.dataset.for===beatId)return;           // andre trykk lukker
  const b=state.beats.find(x=>x.id===beatId);if(!b)return;
  const where=listMode==="mixtape"?"mixtapen":"albumet";
  const m=document.createElement("div");m.className="mv-row-menu";m.setAttribute("role","menu");m.dataset.for=beatId;
  const item=(label,fn,cls)=>{const x=document.createElement("button");x.type="button";x.setAttribute("role","menuitem");x.textContent=label;if(cls)x.className=cls;x.onclick=e=>{e.stopPropagation();mvCloseTrackMenu();fn();};return x;};
  m.append(
    item("Spill neste",()=>window.mvQueuePlayNext&&mvQueuePlayNext(beatId)),
    item("Legg i kø",()=>window.mvQueueAdd&&mvQueueAdd(beatId)),
    document.createElement("hr"),
    item("Åpne i Lyric Lab",()=>window.openInLyricLab&&openInLyricLab(beatId)),
    item("Lag delingslenke",()=>window.shareSong&&shareSong(beatId)),
    item("Gi nytt navn",()=>window.renameBeatInline&&renameBeatInline(beatId)),
    document.createElement("hr"),
    item("✕ Fjern fra "+where,()=>removeFromCollection(beatId,listMode),"danger"));
  document.body.appendChild(m);
  const r=btn.getBoundingClientRect(),w=m.offsetWidth,h=m.offsetHeight;
  m.style.left=Math.max(8,Math.min(r.right-w,innerWidth-w-8))+"px";
  m.style.top=(r.bottom+6+h>innerHeight?Math.max(8,r.top-h-6):r.bottom+6)+"px";
  m.querySelector("button")?.focus();
};
document.addEventListener("click",e=>{if(!e.target.closest(".mv-row-menu,.ab-more-btn"))mvCloseTrackMenu();});
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&document.querySelector(".mv-row-menu"))mvCloseTrackMenu();});
window.addEventListener("scroll",mvCloseTrackMenu,true);
function toggleFav(id,btn){
  const b=state.beats.find(x=>x.id===id);if(!b)return;
  b.favorite=!b.favorite;saveState();
  document.querySelectorAll(`[data-fav-id="${id}"]`).forEach(el=>{el.classList.toggle("active",!!b.favorite);el.setAttribute("aria-pressed",b.favorite?"true":"false");if(/^[★☆]$/.test(el.textContent.trim()))el.textContent=b.favorite?"★":"☆";});
  if(btn)btn.classList.toggle("active",!!b.favorite);
  renderStats();
  showToast(b.favorite?"★ Lagt til som favoritt":"☆ Fjernet fra favoritter");
}
async function deleteBeat(id){
  if(!window.isAdminMode){showToast("Kun admin kan slette låter");return;}
  if(!(await mvConfirm({title:'Slette låten for godt?',body:'Låten og lydfilen slettes fra skyen og kan ikke hentes tilbake. Vil du bare ha den bort, kan du arkivere den i stedet.',ok:'Slett for godt',danger:true})))return;
  const beat = state.beats.find(b=>b.id===id);
  state.beats=state.beats.filter(b=>b.id!==id);
  state.albums.forEach(a=>{a.beatIds=a.beatIds.filter(x=>x!==id);});
  state.mixtapes.forEach(m=>{m.beatIds=m.beatIds.filter(x=>x!==id);});
  saveState();
  renderAll();
  showToast("Sang slettet");
  // Delete from R2
  if(beat && window.r2Storage?.ready()){
    try{
      await window.r2Storage.remove(id, !!beat.archived);
    }catch(e){ console.warn('[R2] Kunne ikke slette fil:', e); }
  }
  // Delete from Supabase
  if(window.supabaseClient && window.isAdminMode){
    try{
      await window.supabaseClient.from('beats').delete().eq('id', id);
      await window.supabaseClient.from('mixtape_beats').delete().eq('beat_id', id);
      await window.supabaseClient.from('album_beats').delete().eq('beat_id', id);
    }catch(e){ console.warn('[Supabase] Kunne ikke slette beat:', e); }
  }
}

// ── DEMOS ──

// ── ALBUMS ──
function renderAlbums(){
  if(currentAlbumId){renderAlbumDetail();return;}
  window.mvRouter&&mvRouter.setAlbum&&mvRouter.setAlbum(null);
  document.getElementById("albumsListView").classList.remove("hidden");
  document.getElementById("albumDetailView").classList.add("hidden");
  const grid=document.getElementById("albumGrid");
  const cards=state.albums.map(a=>{
    const n=(a.beatIds||[]).filter(id=>{const b=state.beats.find(x=>x.id===id);return b&&!b.archived;}).length;
    const label=a.cover
      ?`<div class="vinyl-label"><img src="${esc(a.cover)}" alt="${esc(a.name)}"></div>`
      :`<div class="vinyl-label"><div class="vinyl-label-ph">♪</div></div>`;
    const sleeve=a.cover
      ?`<div class="record-sleeve"><img src="${esc(a.cover)}" alt="${esc(a.name)}"></div>`
      :`<div class="record-sleeve"><div class="record-sleeve-ph"><span class="ic ic-music" aria-hidden="true"></span></div></div>`;
    return`<div class="album-card" draggable="true" data-id="${a.id}" ondragstart="startCardDrag(event,'album','${a.id}')" ondragover="cardDragOver(event,'album','${a.id}')" ondragleave="cardDragLeave(event,'${a.id}')" ondrop="dropCard(event,'album','${a.id}')" ondragend="endCardDrag()" onclick="openAlbumFromCard(event,'${a.id}')">
      <div class="album-display">
        <div class="vinyl-disc">
          <div class="vinyl-groove"></div>
          ${label}
          <div class="vinyl-hole"></div>
        </div>
        ${sleeve}
      </div>
      <div class="album-info">
        <strong>${esc(a.name)}</strong>
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:3px">
          <span style="font-size:11px;color:var(--muted)">${n} låt${n===1?'':'er'}</span>
          ${(()=>{const totalSec=(a.beatIds||[]).reduce((s,id)=>{const b=state.beats.find(x=>x.id===id);return s+(b&&!b.archived?Number(b.duration||0):0);},0);const m=Math.floor(totalSec/60),sec=Math.floor(totalSec%60);return totalSec>0?`<span style="font-size:11px;color:var(--faint)">•</span><span style="font-size:11px;color:var(--muted)">${m}:${String(sec).padStart(2,'0')}</span>`:'';})()}
          ${(()=>{const STATUS_COLORS={'Idé':'rgba(214,129,85,.6)','Skriving':'rgba(191,178,166,.6)','Innspilling':'rgba(214,129,85,.7)','Miks':'rgba(214,129,85,.7)','Master':'rgba(214,129,85,.7)','Klar for release':'rgba(166,190,139,.7)','Ferdig':'rgba(166,190,139,.7)'};const s=window.mvStages?mvStages.normalizeAlbum(a.status):(a.status||'Idé');const c=STATUS_COLORS[s]||'rgba(244,234,220,.7)';return`<span style="font-size:10px;font-weight:800;padding:2px 8px;border-radius:999px;background:${c.replace('.6','.15').replace('.7','.15')};color:${c};border:1px solid ${c.replace('.6','.3').replace('.7','.3')}">${s}</span>`;})()}
        </div>
      </div>
      <button class="small-btn" style="margin-top:8px;padding:7px 12px" onclick="event.stopPropagation();playAlbumFromStart('${a.id}')"><span class="ic ic-play" aria-hidden="true"></span> Spill</button>
    </div>`;
  });
  cards.push(`<div class="album-new-btn" onclick="document.getElementById('newAlbumBtn').click()">
    <div class="album-display">
      <div class="vinyl-disc">
        <div class="vinyl-groove"></div>
        <div class="vinyl-label"><div class="vinyl-label-ph">+</div></div>
        <div class="vinyl-hole"></div>
      </div>
      <div class="record-sleeve record-sleeve-new"><div class="record-sleeve-ph">+</div></div>
    </div>
    <span>Nytt album</span>
  </div>`);
  grid.innerHTML=cards.join("");
}

let cardDrag={type:null,id:null,moved:false};
function openAlbumFromCard(event,id){if(cardDrag.moved){event.preventDefault();event.stopPropagation();cardDrag.moved=false;return;}openAlbum(id);}
function openMixtapeFromCard(event,id){if(cardDrag.moved){event.preventDefault();event.stopPropagation();cardDrag.moved=false;return;}openMixtape(id);}
function startCardDrag(event,type,id){
  if(isProducerUser()){event.preventDefault();return;}
  const isHandle=type==="album"?!!event.target.closest(".album-display"):!!event.target.closest(".cass-body");
  if(!isHandle){event.preventDefault();return;}
  cardDrag={type,id,moved:false};
  event.dataTransfer.effectAllowed="move";
  event.dataTransfer.setData("text/plain",id);
  setTimeout(()=>event.currentTarget.classList.add("dragging"),0);
}
function isDropAfter(event,el){
  const r=el.getBoundingClientRect();
  // Slightly generous threshold makes one-step right moves easier on grid cards.
  return r.width>=r.height ? event.clientX>(r.left+r.width*.38) : event.clientY>(r.top+r.height/2);
}
function cardDragOver(event,type,id){
  if(!cardDrag.id||cardDrag.type!==type||cardDrag.id===id)return;
  event.preventDefault();
  const el=event.currentTarget;
  el.dataset.dropAfter=isDropAfter(event,el)?"1":"0";
  el.classList.add("drag-over");
}
function cardDragLeave(event,id){
  if(event.currentTarget&&!event.currentTarget.contains(event.relatedTarget)){
    event.currentTarget.classList.remove("drag-over");
    delete event.currentTarget.dataset.dropAfter;
  }
}
function dropCard(event,type,targetId){
  event.preventDefault();
  const sourceId=cardDrag.id||event.dataTransfer.getData("text/plain");
  const targetCard=event.currentTarget;
  let after=targetCard?.dataset?.dropAfter==="1";
  document.querySelectorAll(".album-card.drag-over,.cassette-card.drag-over").forEach(el=>{el.classList.remove("drag-over");delete el.dataset.dropAfter;});
  if(!sourceId||sourceId===targetId||cardDrag.type!==type){endCardDrag();return;}
  const arr=type==="album"?state.albums:state.mixtapes;
  if(type==="mixtape")ensureMixtapeStableVisuals();
  const from=arr.findIndex(x=>x.id===sourceId);
  const to=arr.findIndex(x=>x.id===targetId);
  if(from<0||to<0){endCardDrag();return;}

  // Adjacent moves should always work in one step.
  if(to===from+1)after=true;
  if(to===from-1)after=false;

  const [item]=arr.splice(from,1);
  let insertAt=arr.findIndex(x=>x.id===targetId);
  if(insertAt<0){arr.splice(from,0,item);endCardDrag();return;}
  if(after)insertAt+=1;
  insertAt=Math.max(0,Math.min(insertAt,arr.length));
  arr.splice(insertAt,0,item);
  cardDrag.moved=true;
  saveState();
  type==="album"?renderAlbums():renderMixtapes();
  showToast("✓ Rekkefølge oppdatert");
  setTimeout(()=>{cardDrag={type:null,id:null,moved:false};},120);
}
function endCardDrag(){
  document.querySelectorAll(".album-card.dragging,.cassette-card.dragging,.album-card.drag-over,.cassette-card.drag-over").forEach(el=>el.classList.remove("dragging","drag-over"));
  if(cardDrag.id&&!cardDrag.moved)cardDrag={type:null,id:null,moved:false};
}

function openAlbum(id){currentAlbumId=id;renderAlbumDetail();setTimeout(()=>showDropZone("albumDrop"),50);window.mvRouter&&mvRouter.setAlbum&&mvRouter.setAlbum(state.albums.some(a=>a.id===id)?id:null);}

function renderAlbumDetail(){
  document.getElementById("albumsListView").classList.add("hidden");
  document.getElementById("albumDetailView").classList.remove("hidden");
  const dz=document.getElementById("albumDrop");if(dz)dz.classList.add("active");
  const album=state.albums.find(a=>a.id===currentAlbumId);
  if(!album){currentAlbumId=null;renderAlbums();return;}
  const hd=document.getElementById("albumDetailHd");
  const label=album.cover
    ?`<div class="vinyl-label"><img src="${esc(album.cover)}" alt="${esc(album.name)}"></div>`
    :`<div class="vinyl-label"><div class="vinyl-label-ph">♪</div></div>`;
  const sleeve=album.cover
    ?`<div class="detail-sleeve"><img src="${esc(album.cover)}" alt="${esc(album.name)}"></div>`
    :`<div class="detail-sleeve"><div class="record-sleeve-ph"><span class="ic ic-music" aria-hidden="true"></span></div></div>`;
  hd.innerHTML=`
    <div class="detail-record">
      <div class="vinyl-disc">
        <div class="vinyl-groove"></div>
        ${label}
        <div class="vinyl-hole"></div>
      </div>
      ${sleeve}
    </div>
    <div class="album-detail-info" style="flex:1">
      <div class="eyebrow">Album</div>
      <h2>${esc(album.name)}</h2>
      <span>${(()=>{const n=(album.beatIds||[]).filter(id=>{const b=state.beats.find(x=>x.id===id);return b&&!b.archived;}).length;return n+' beat'+(n===1?'':'s');})()}</span>
      <div id="albumNowPlaying" class="hint" style="margin-top:8px"></div>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="primary-btn" id="playAlbumBtn" onclick="playAlbumFromStart('${album.id}')"><span class="ic ic-play" aria-hidden="true"></span> Spill fra start</button>
      <button class="small-btn danger hidden" id="stopAlbumBtn" onclick="stopCollectionPlayback()"><span class="ic ic-stop" aria-hidden="true"></span> Stopp</button>
    </div>`;
  const beats=beatsFromIds(album.beatIds);
  renderAlbumBeats(beats);
  updateCollectionPlayerUI();
  updateArchiveToolbarButtons?.();
  if(typeof renderCollectionComments==='function')renderCollectionComments('album',currentAlbumId);
  // Apply the premium album header (Del/Pitch/Bytt bilde + proper layout). Defined in app.js,
  // which loads BEFORE this file — so its renderAlbumDetail wrapper is clobbered by this
  // function declaration. Calling the exposed hook here guarantees the redesign runs.
  if(typeof window.redesignAlbumDetail==='function')window.redesignAlbumDetail();
}

let collectionDrag={beatId:null,mode:null};
function activeCollectionForMode(mode){
  if(mode==="mixtape")return state.mixtapes.find(m=>m.id===currentMixtapeId)||null;
  return state.albums.find(a=>a.id===currentAlbumId)||null;
}
// F3: a song reorder drag begins ONLY from the cover thumbnail (the drag source is the
// `.ab-cover-wrap`, not the whole row). This keeps the %-slider and the rest of the row free
// — touching them never starts a reorder — while a click on the cover still expands the song
// (native dragstart fires on a real drag move, not on a click). Same immediate-drag model as
// the studio board. NB earlier attempt used a press-and-hold "arm" timer; it blocked natural
// drags (you had to hold still 200ms first) so it was removed.
function startCollectionDrag(event,beatId,mode){
  collectionDrag={beatId,mode:mode||"album"};
  event.stopPropagation();
  event.dataTransfer.effectAllowed="move";
  event.dataTransfer.setData("text/plain",beatId);
  setTimeout(()=>{const card=document.getElementById(`abi-${beatId}`);if(card)card.classList.add("dragging");},0);
}
function endCollectionDrag(){
  document.querySelectorAll(".album-beat-card.dragging,.album-beat-card.drag-over").forEach(el=>el.classList.remove("dragging","drag-over"));
  collectionDrag={beatId:null,mode:null};
}
function dragBeatOver(event,targetId){
  if(!collectionDrag.beatId||collectionDrag.beatId===targetId)return;
  event.preventDefault();
  const card=document.getElementById(`abi-${targetId}`);
  if(card){
    // Mode-aware: list view inserts above/below (Y), card grid inserts left/right (X).
    const r=card.getBoundingClientRect();
    const after=card.closest(".album-beat-listmode")
      ? event.clientY>(r.top+r.height/2)
      : event.clientX>(r.left+r.width*.45);
    card.dataset.dropAfter=after?"1":"0";
    card.classList.add("drag-over");
  }
}
function dragBeatLeave(event,targetId){
  const card=document.getElementById(`abi-${targetId}`);
  if(card&&!card.contains(event.relatedTarget)){card.classList.remove("drag-over");delete card.dataset.dropAfter;}
}
function dropCollectionBeat(event,targetId,mode){
  event.preventDefault();event.stopPropagation();
  const draggedId=collectionDrag.beatId||event.dataTransfer.getData("text/plain");
  const dragMode=collectionDrag.mode||mode||"album";
  const targetCard=document.getElementById(`abi-${targetId}`);
  let after=targetCard?.dataset?.dropAfter==="1";
  document.querySelectorAll(".album-beat-card.drag-over").forEach(el=>{el.classList.remove("drag-over");delete el.dataset.dropAfter;});
  if(!draggedId||draggedId===targetId||dragMode!==mode){endCollectionDrag();return;}
  const col=activeCollectionForMode(mode);if(!col||!Array.isArray(col.beatIds)){endCollectionDrag();return;}
  const ids=col.beatIds.slice();
  const from=ids.indexOf(draggedId);const to=ids.indexOf(targetId);
  if(from<0||to<0){endCollectionDrag();return;}
  if(to===from+1)after=true;
  if(to===from-1)after=false;
  ids.splice(from,1);
  let insertAt=ids.indexOf(targetId);
  if(insertAt<0){endCollectionDrag();return;}
  if(after)insertAt+=1;
  insertAt=Math.max(0,Math.min(insertAt,ids.length));
  ids.splice(insertAt,0,draggedId);
  col.beatIds=ids;
  saveState();
  if(bottomPlayer.context&&bottomPlayer.context.type===mode&&bottomPlayer.context.id===col.id){
    const current=bottomPlayer.queue[bottomPlayer.index];
    bottomPlayer.queue=beatsFromIds(col.beatIds);
    bottomPlayer.index=Math.max(0,bottomPlayer.queue.findIndex(b=>current&&b.id===current.id));
  }
  mode==="mixtape"?renderMixtapeDetail():renderAlbumDetail();
  showToast("✓ Rekkefølge oppdatert");
  endCollectionDrag();
}
function removeFromCollection(beatId,mode){
  const col=activeCollectionForMode(mode||"album");if(!col)return;
  col.beatIds=col.beatIds.filter(id=>id!==beatId);
  saveState();
  if(mode==="mixtape"){renderMixtapeDetail();showToast("✓ Beat fjernet fra mixtape");}
  else{renderAlbumDetail();showToast("✓ Beat fjernet fra album");}
}
function beatMixtapeColor(beatId,listMode){
  let mt=null;
  if(listMode==="mixtape"&&currentMixtapeId)mt=state.mixtapes.find(x=>x.id===currentMixtapeId);
  if(!mt)mt=(state.mixtapes||[]).find(x=>(x.beatIds||[]).includes(beatId));
  return mt?cassColor(mt,state.mixtapes.indexOf(mt)):"";
}
function songBorderAttrs(beatId,listMode){
  const col=beatMixtapeColor(beatId,listMode);
  return col?` class="album-beat-card mixtape-colored" style="--song-border-color:${col}"`:` class="album-beat-card"`;
}
// «Lastet opp av» skjules overalt (Beats og album) når alle låtene er fra samme person
window.mvUpdateSolo=function(){try{const who=new Set((state.beats||[]).filter(b=>!b.archived).map(b=>(window.mvUploaderName?mvUploaderName(b):b.uploadedBy)||''));document.body.classList.toggle('mv-solo',who.size<=1);}catch(e){}};
function renderAlbumBeats(beats,mode,customEl){
  window.mvUpdateSolo();
  const listMode=mode||"album";
  const el=customEl||document.getElementById("albumBeatList");
  // View class set by applyView() in track-cards.js — don't hardcode here
  if(!beats||!beats.length){el.innerHTML=`<div class="empty">Ingen låter i ${listMode==="mixtape"?"mixtapen":"albumet"} ennå.</div>`;return;}
  const canDrag=!isProducerUser()&&(listMode!=="mixtape"||mixtapeSortMode==="custom");
  const hint=canDrag?`<div class="reorder-hint" style="grid-column:1/-1"><span>↕</span><span>Dra sangene for å endre rekkefølge.</span></div>`:(listMode==="mixtape"&&mixtapeSortMode!=="custom"?`<div class="reorder-hint" style="grid-column:1/-1"><span>↕</span><span>Sortert visning. Velg «Egen rekkefølge» for å dra sangene.</span></div>`:"");
  el.innerHTML=hint+beats.map((b,idx)=>{
    const coverHtml=b.cover
      ?`<img class="ab-cover" src="${esc(b.cover)}" alt="${esc(b.name)}" draggable="false">`
      :`<div class="ab-cover-ph" draggable="false" style="user-select:none;-webkit-user-select:none"><span class="ic ic-music" aria-hidden="true"></span></div>`;
    if(isProducerUser()&&listMode==="mixtape"){
      return`<div${songBorderAttrs(b.id,listMode)} id="abi-${b.id}" data-beat-id="${b.id}">
        <div class="ab-top">
          <div class="ab-cover-wrap" onclick="toggleAlbumBeat('${b.id}')" role="button" tabindex="0" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();toggleAlbumBeat('${b.id}')}" aria-label="Vis detaljer: ${esc(b.name)}">${coverHtml}</div>
          <div class="ab-body" onclick="mvTapPlay(event,'${b.id}','${listMode}')">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
              <span style="font-size:11px;color:rgb(var(--ink-rgb) / calc(.25 + (1 - .25) * var(--ink-boost)));font-variant-numeric:tabular-nums;font-weight:700;flex-shrink:0">${String(idx+1).padStart(2,'0')}</span>
              <div class="ab-title" style="min-width:0">${esc(b.name)}</div>
            </div>
            <div class="hint" style="margin-top:6px">${esc(b.source||"Opplastet beat")}${(window.mvUploaderName?mvUploaderName(b):b.uploadedBy)?`<span class="ab-uploader"> · <span style="color:var(--accent-ink);font-size:11px"><span class="ic ic-user" aria-hidden="true"></span> ${esc((window.mvUploaderName?mvUploaderName(b):b.uploadedBy))}</span></span>`:''}</div>
          </div>
        </div>
        <div class="ab-expand">
          <div class="ab-expand-left">
            <div id="au-wrap-${b.id}" style="margin-bottom:12px">
              <button class="primary-btn" onclick="playCollectionFromBeat('${b.id}','${listMode}')"><span class="ic ic-play" aria-hidden="true"></span> Spill denne</button>
            </div>
          </div>
        </div>
      </div>`;
    }
    const stars=Array.from({length:10},(_,i)=>`<button class="${i<(b.rating||0)?"on":""}" onclick="setAlbumBeatRating('${b.id}',${i+1})">★</button>`).join("");
    // Drop target lives on the whole card; the drag SOURCE is only the cover (F3 press-and-hold).
    const dropAttrs=canDrag?`ondragover="dragBeatOver(event,'${b.id}')" ondragleave="dragBeatLeave(event,'${b.id}')" ondrop="dropCollectionBeat(event,'${b.id}','${listMode}')"`:"";
    const coverDragAttrs=canDrag?`draggable="true" ondragstart="startCollectionDrag(event,'${b.id}','${listMode}')" ondragend="endCollectionDrag()"`:"";
    return`<div${songBorderAttrs(b.id,listMode)} id="abi-${b.id}" data-beat-id="${b.id}" ${dropAttrs} style="user-select:none;-webkit-user-select:none">
      <div class="ab-top">
        <div class="ab-cover-wrap" ${coverDragAttrs} onclick="toggleAlbumBeat('${b.id}')" role="button" tabindex="0" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();toggleAlbumBeat('${b.id}')}" aria-label="Vis detaljer: ${esc(b.name)}">
          ${coverHtml}
        </div>
        <div class="ab-body" onclick="mvTapPlay(event,'${b.id}','${listMode}')">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
            <div style="display:flex;align-items:center;gap:8px;min-width:0;flex:1">
              <span style="font-size:11px;color:rgb(var(--ink-rgb) / calc(.25 + (1 - .25) * var(--ink-boost)));font-variant-numeric:tabular-nums;font-weight:700;flex-shrink:0">${String(idx+1).padStart(2,'0')}</span>
              <div class="ab-title" id="abt-${b.id}" style="min-width:0;flex:1">${esc(b.name)}</div>
              ${listMode==="album"&&window.mvStages?(()=>{const s=mvStages.of(b);return `<span class="ab-stage" style="--stage-c:${s.color}" title="Låtens steg og fremdrift"><i aria-hidden="true"></i>${esc(s.label)} · ${mvStages.fmt(mvStages.pct(b))}</span>`;})():""}
              <span class="ab-playcount${(Number(b.playCount)||0)?'':' empty'}" data-pc-id="${b.id}" title="${esc(playCountTitle(b))}"><span class="ic ic-headphones" aria-hidden="true"></span> ${Number(b.playCount)||0}</span>
              ${(window.mvUploaderName?mvUploaderName(b):b.uploadedBy)?`<span class="ab-uploader" style="font-size:10px;font-weight:700;letter-spacing:.06em;color:var(--accent-ink);opacity:.8;white-space:nowrap"><span class="ic ic-user" aria-hidden="true"></span> ${esc((window.mvUploaderName?mvUploaderName(b):b.uploadedBy))}</span>`:''}
            </div>
            <div style="display:flex;align-items:center;gap:3px;flex-shrink:0">
              ${(()=>{ const noAudio=!(b.audio_url||b.url); if(noAudio) return '<span title="Mangler lydfil" style="width:6px;height:6px;border-radius:50%;background:var(--danger);display:block;margin-right:2px"></span>'; return ''; })()}
              <button class="ab-quick-play" onclick="event.stopPropagation();playCollectionFromBeat('${b.id}','${listMode}');sessionStorage.setItem('mv_last_beat','${b.id}')" title="Spill låt" aria-label="Spill ${esc(b.name)}" style="width:28px;height:28px;border-radius:50%;background:rgb(var(--accent-rgb) / .18);border:1px solid rgb(var(--accent-rgb) / .4);color:var(--accent-ink);font-size:10px;display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;padding:0"><span class="ic ic-play" aria-hidden="true"></span></button>
              <button class="star-btn${b.favorite?" active":""}" data-fav-id="${b.id}" title="Favoritt" aria-label="Favoritt: ${esc(b.name)}" aria-pressed="${b.favorite?'true':'false'}" onclick="event.stopPropagation();toggleFav('${b.id}',this)"><span class="ic ic-heart" aria-hidden="true"></span></button>
              <button class="ab-more-btn" type="button" onclick="event.stopPropagation();mvTrackMenu(this,'${b.id}','${listMode}')" title="Flere valg" aria-label="Flere valg for ${esc(b.name)}" aria-haspopup="menu">⋯</button>
            </div>
          </div>
          <div class="ab-stars" onclick="event.stopPropagation()">${stars}</div>
          ${listMode==="album"?`<div class="progress-wrap" onclick="event.stopPropagation()">
            <div class="progress-label"><span>Fremdrift</span><strong id="abidone-${b.id}">${b.done||0}%</strong><button type="button" class="ab-progress-edit" aria-controls="abirange-${b.id}" aria-expanded="false" onclick="mvToggleProgressEdit(this,'${b.id}')">Endre</button></div>
            <input type="range" class="ab-progress-range" id="abirange-${b.id}" min="0" max="100" value="${b.done||0}" style="--pct:${b.done||0}%" disabled aria-label="Fremdrift for ${esc(b.name)}" oninput="setAlbumBeatDone('${b.id}',this.value)">
          </div>`:""}
        </div>
      </div>
      <div class="ab-expand">
        <div class="ab-expand-top-bar">
          <div id="au-wrap-${b.id}" style="display:flex;align-items:center;gap:8px;width:100%">
            <button class="primary-btn" style="font-size:12px;padding:7px 14px" onclick="playCollectionFromBeat('${b.id}','${listMode}')"><span class="ic ic-play" aria-hidden="true"></span> Spill</button>
            <button class="star-btn${b.favorite?" active":""}" data-fav-id="${b.id}" aria-label="Favoritt: ${esc(b.name)}" aria-pressed="${b.favorite?'true':'false'}" onclick="event.stopPropagation();toggleFav('${b.id}',this)" title="Favoritt" style="font-size:20px;background:none;border:none;cursor:pointer;padding:0;color:${b.favorite?'#d68155':'rgba(255,255,255,.25)'}"><span class="ic ic-heart" aria-hidden="true"></span></button>
            <div style="margin-left:auto">${(()=>{ const noAudio=!(b.audio_url||b.url); const noLyric=!(b.lyrics||(b.lyricSections||[]).some(s=>s.text?.trim())); if(noAudio) return '<span title="Mangler lydfil" style="font-size:10px;font-weight:800;padding:2px 7px;border-radius:999px;background:rgb(var(--danger-rgb) / .15);color:var(--danger);border:1px solid rgb(var(--danger-rgb) / .3)">Ingen lyd</span>'; if(noLyric) return '<span title="Mangler tekst" style="font-size:10px;font-weight:800;padding:2px 7px;border-radius:999px;background:rgb(var(--accent-rgb) / .12);color:var(--accent-ink);border:1px solid rgb(var(--accent-rgb) / .3)">Ingen tekst</span>'; return ''; })()}</div>
          </div>
          <label class="ghost-btn ab-swap-audio" style="cursor:pointer;font-size:12px;padding:6px 12px" title="Erstatt lydfilen — den gamle slettes permanent"><span class="ic ic-music" aria-hidden="true"></span> Bytt lydfil<input type="file" accept="audio/*,.mp3,.wav,.m4a,.aac,.flac,.ogg,.aif,.aiff" hidden onchange="uploadBeatAudio('${b.id}',this.files[0]);this.value=''"></label>
          <label class="ghost-btn" style="cursor:pointer;font-size:12px;padding:6px 12px"><span class="ic ic-image" aria-hidden="true"></span> Coverbilde<input type="file" accept="image/*" hidden onchange="setAlbumBeatCover('${b.id}',this)"></label>
          <button class="small-btn danger" onclick="removeFromCollection('${b.id}','${listMode}')">Fjern fra ${listMode==="mixtape"?"mixtape":"album"}</button>
        </div>
        <div class="ab-raw" id="abraw-${b.id}">${rawVocalsMarkup(b)}</div>
        <div class="ab-lyric-editor">
          ${lyricsEditorMarkup(b.id,"Skriv tekst, hooks, vers, ideer...")}
        </div>
      </div>
    </div>`;
  }).join("");
  // The studio kanban + view-class logic live in track-cards.js, but db.js OWNS renderAlbumBeats
  // and loads LAST (its declaration clobbers any wrapper), so we invoke the hook here. (FINDINGS §0)
  if(typeof window.afterRenderAlbumBeats==='function') window.afterRenderAlbumBeats(el, listMode);
}
// Mobile-only tap-to-play: tapping a song row (but NOT the cover image or an
// interactive control) plays it. Play buttons are hidden on phones (mobile.css).
window.mvTapPlay=function(e,id,kind){
  if(window.innerWidth>768) return;                 // desktop unchanged
  if(e.target.closest('button,a,input,select,textarea,label,.ab-cover-wrap,.bl-cover,.ab-stars,.progress-wrap,.star-btn')) return;
  try{ sessionStorage.setItem('mv_last_beat',id); }catch(_){}
  if(kind==='beat'){ if(window.beatsTab&&beatsTab.playBeat) beatsTab.playBeat(id); }
  else if(typeof playCollectionFromBeat==='function'){ playCollectionFromBeat(id,kind); }
};
// ══════════════════════════════════════════════════════════════════════════════
// mvShare — standalone share modal (reads data-share="type|id|name")
// ══════════════════════════════════════════════════════════════════════════════
// Låt-id-ene i et album/en mixtape (fra lokal state), eller [] for en enkelt låt.
function _mvSMcollectionBeatIds(type,id){
  const st=typeof state!=='undefined'?state:window.state;
  const col=type==='album'?(st?.albums||[]).find(a=>String(a.id)===String(id)):type==='mixtape'?(st?.mixtapes||[]).find(m=>String(m.id)===String(id)):null;
  return col?(col.beatIds||[]).slice():[];
}
window.mvShare = async function(btn) {
  const raw = btn.dataset.share || '';
  const i1 = raw.indexOf('|'), i2 = raw.indexOf('|', i1+1);
  const contentType = raw.slice(0, i1);
  const contentId   = raw.slice(i1+1, i2);
  const contentName = raw.slice(i2+1) || contentId;
  if (!contentType || !contentId) { showToast('Mangler innholds-ID'); return; }
  const SBU=window.MV_CONFIG.SUPABASE_URL;
  const SBK=window.MV_CONFIG.SUPABASE_ANON_KEY;
  let token=SBK, uid=window._mvCurrentUserId||sessionStorage.getItem('mv_user_id');
  try {
    const {data:{session}}=await window.supabaseClient.auth.getSession();
    if(session?.access_token) token=session.access_token;
    if(session?.user?.id){uid=session.user.id;window._mvCurrentUserId=uid;sessionStorage.setItem('mv_user_id',uid);}
  } catch(e) {}
  if(!uid){showToast('Logg inn for \u00e5 dele');return;}
  const hdrs={'apikey':SBK,'Authorization':'Bearer '+token,'Content-Type':'application/json'};
  let existing=[],names={};
  try {
    const r=await fetch(`${SBU}/rest/v1/content_access?content_type=eq.${contentType}&content_id=eq.${contentId}&select=*`,{headers:hdrs});
    if(r.ok) existing=await r.json();
    if(existing.length){
      const ids=existing.map(x=>x.grantee_id).filter(Boolean);
      if(ids.length){const pr=await fetch(`${SBU}/rest/v1/rpc/get_usernames`,{method:'POST',headers:hdrs,body:JSON.stringify({p_ids:ids})});if(pr.ok)(await pr.json()).forEach(p=>names[p.id]=p.username||p.id);}
    }
  }catch(e){}
  const typeLabel={beat:'Beat',album:'Album',mixtape:'Mixtape'}[contentType]||contentType;
  const existHTML=existing.length
    ?existing.map(r=>`<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid rgb(var(--ink-rgb) / .06)"><span style="font-size:13px;font-weight:700;color:var(--text);flex:1"><span class="ic ic-user" aria-hidden="true"></span> ${esc(names[r.grantee_id]||r.grantee_id)}</span><span style="font-size:11px;color:var(--faint)">${r.role==='editor'?'Redakt\u00f8r':'Kan se'}</span><button type="button" onclick="window._mvSMrevoke('${esc(r.grantee_id)}','${esc(names[r.grantee_id]||'')}')" aria-label="Fjern tilgang for ${esc(names[r.grantee_id]||'bruker')}" style="background:none;border:1px solid rgb(var(--danger-rgb) / .3);color:var(--danger);font-size:11px;font-weight:800;padding:4px 10px;cursor:pointer;border-radius:999px;font-family:inherit">Fjern tilgang</button></div>`).join('')
    :'<p style="font-size:12px;color:rgb(var(--ink-rgb) / calc(.3 + (1 - .3) * var(--ink-boost)));margin:0">Ingen har tilgang</p>';
  let modal=document.getElementById('_mvSM');
  if(!modal){modal=document.createElement('div');modal.id='_mvSM';modal.addEventListener('click',e=>{if(e.target===modal)modal.style.display='none';});document.body.appendChild(modal);}
  modal.style.cssText='position:fixed;inset:0;z-index:9999;background:rgb(var(--shade-rgb) / .82);display:flex;align-items:center;justify-content:center;backdrop-filter:blur(5px)';
  modal.innerHTML=`
    <div style="background:var(--surface-1);border:1px solid rgb(var(--ink-rgb) / .12);max-width:440px;width:94%;padding:26px 28px;border-radius:14px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
        <h2 style="font-size:16px;font-weight:900;margin:0;color:var(--text)">Del ${typeLabel}</h2>
        <button onclick="document.getElementById('_mvSM').style.display='none'" style="background:none;border:none;color:rgb(var(--ink-rgb) / calc(.4 + (1 - .4) * var(--ink-boost)));font-size:22px;cursor:pointer;padding:0;line-height:1">&#215;</button>
      </div>
      <p style="font-size:12px;color:var(--faint);margin:0 0 6px">${esc(contentName)}</p>
      <p style="font-size:12px;color:var(--faint);margin:0 0 18px;line-height:1.5">Gir en annen Music Vault-bruker tilgang i appen${contentType!=='beat'?' — til samlingen og låtene i den':''}. «Kan se» kan lytte; «Kan redigere» kan også endre. Mottakeren får et varsel.</p>
      <div style="display:grid;gap:10px">
        <input id="_mvSM_u" placeholder="Brukernavn"
          style="background:rgb(var(--ink-rgb) / .06);border:1px solid rgb(var(--ink-rgb) / .12);color:var(--text);padding:10px 12px;font-size:13px;font-family:inherit;outline:none;border-radius:8px;width:100%;box-sizing:border-box"
          onkeydown="if(event.key==='Enter') window._mvSMdo()">
        <div style="display:flex;gap:8px">
          <select id="_mvSM_r" style="flex:1;background:var(--surface-1);border:1px solid rgb(var(--ink-rgb) / .12);color:var(--text);padding:10px;font-size:13px;font-family:inherit;outline:none;border-radius:8px">
            <option value="viewer">Kan se</option><option value="editor">Kan redigere</option>
          </select>
          <button onclick="window._mvSMdo()" style="background:linear-gradient(135deg,var(--accent),var(--accent-deep));border:none;color:#000;font-size:13px;font-weight:900;padding:10px 22px;cursor:pointer;border-radius:8px;font-family:inherit">Del</button>
        </div>
        <div id="_mvSM_s" style="font-size:12px;color:rgb(var(--ink-rgb) / calc(.4 + (1 - .4) * var(--ink-boost)));min-height:16px"></div>
        <div style="font-size:10px;font-weight:900;letter-spacing:.1em;text-transform:uppercase;color:rgb(var(--ink-rgb) / calc(.3 + (1 - .3) * var(--ink-boost)));margin-top:4px">Har tilgang</div>
        <div id="_mvSM_l">${existHTML}</div>
      </div>
    </div>`;
  window._mvSMdo=async function(){
    // Ikke gjør om til små bokstaver: brukernavn slås opp eksakt (f.eks. «Bounceprovida Records»).
    const username=(document.getElementById('_mvSM_u')?.value||'').trim();
    const role=document.getElementById('_mvSM_r')?.value||'viewer';
    const statusEl=document.getElementById('_mvSM_s');
    if(!username){if(statusEl)statusEl.textContent='Skriv inn brukernavn';return;}
    if(statusEl){statusEl.style.color='rgba(255,255,255,.4)';statusEl.textContent='S\u00f8ker...';}
    try{
      const pr=await fetch(`${SBU}/rest/v1/rpc/get_user_id_by_username`,{method:'POST',headers:hdrs,body:JSON.stringify({p_username:username})});
      const profiles=pr.ok?await pr.json():[];
      if(!profiles.length){if(statusEl){statusEl.style.color='var(--danger)';statusEl.textContent='Finner ikke bruker: '+username;}return;}
      const granteeId=profiles[0].id;
      if(granteeId===uid){if(statusEl){statusEl.style.color='var(--danger)';statusEl.textContent='Kan ikke dele med deg selv';}return;}
      const body=JSON.stringify({owner_id:uid,grantee_id:granteeId,content_type:contentType,content_id:contentId,role,content_name:contentName});
      const res=await fetch(`${SBU}/rest/v1/content_access`,{method:'POST',headers:{...hdrs,'Prefer':'resolution=merge-duplicates'},body});
      if(!res.ok){const err=await res.text();if(statusEl){statusEl.style.color='var(--danger)';statusEl.textContent='Feil: '+err;}return;}
      // Album/mixtape: gi tilgang til l\u00e5tene som ALLEREDE ligger der. (Triggeren
      // auto_share_on_*_beat_add dekker bare l\u00e5ter som legges til senere.)
      const beatIds=_mvSMcollectionBeatIds(contentType,contentId);
      if(beatIds.length){
        await fetch(`${SBU}/rest/v1/content_access`,{method:'POST',headers:{...hdrs,'Prefer':'resolution=merge-duplicates'},
          body:JSON.stringify(beatIds.map(id=>({owner_id:uid,grantee_id:granteeId,content_type:'beat',content_id:String(id),role})))});
      }
      // Varsel til mottakeren (notifications.js viser det i klokka hans)
      await fetch(`${SBU}/rest/v1/notifications`,{method:'POST',headers:{...hdrs,'Prefer':'return=minimal'},
        body:JSON.stringify({recipient_id:granteeId,sender_id:uid,type:{beat:'share_beat',album:'share_album',mixtape:'share_mixtape'}[contentType]||'share_beat',content_id:contentId,content_name:contentName,role,read:false})}).catch(()=>{});
      if(statusEl){statusEl.style.color='var(--ok)';statusEl.textContent='\u2713 Delt med '+username;}
      if(document.getElementById('_mvSM_u')) document.getElementById('_mvSM_u').value='';
      setTimeout(()=>window.mvShare(btn),800);
    }catch(e){if(statusEl){statusEl.style.color='var(--danger)';statusEl.textContent='Feil: '+e.message;}}
  };
  // Fjern tilgang. For album/mixtape fjernes også tilgangen til låtene — bortsett
  // fra låter som mottakeren fortsatt har via en ANNEN delt samling.
  window._mvSMrevoke=async function(granteeId,name){
    if(!(await mvConfirm({title:`Fjerne tilgangen for ${name||'denne brukeren'}?`,body:`De mister tilgangen til «${contentName}». Du kan dele på nytt senere.`,ok:'Fjern tilgang',danger:true})))return;
    const statusEl=document.getElementById('_mvSM_s');
    try{
      const del=await fetch(`${SBU}/rest/v1/content_access?owner_id=eq.${uid}&grantee_id=eq.${encodeURIComponent(granteeId)}&content_type=eq.${contentType}&content_id=eq.${encodeURIComponent(contentId)}`,
        {method:'DELETE',headers:{...hdrs,'Prefer':'return=representation'}});
      if(!del.ok||!(await del.json()).length)throw new Error('ingen tilgang ble fjernet');
      const beatIds=_mvSMcollectionBeatIds(contentType,contentId);
      if(beatIds.length){
        const other=await fetch(`${SBU}/rest/v1/content_access?owner_id=eq.${uid}&grantee_id=eq.${encodeURIComponent(granteeId)}&content_type=in.(album,mixtape)&select=content_type,content_id`,{headers:hdrs});
        const keep=new Set();
        if(other.ok)(await other.json()).forEach(r=>_mvSMcollectionBeatIds(r.content_type,r.content_id).forEach(id=>keep.add(String(id))));
        const drop=beatIds.map(String).filter(id=>!keep.has(id));
        if(drop.length)await fetch(`${SBU}/rest/v1/content_access?owner_id=eq.${uid}&grantee_id=eq.${encodeURIComponent(granteeId)}&content_type=eq.beat&content_id=in.(${drop.map(encodeURIComponent).join(',')})`,
          {method:'DELETE',headers:{...hdrs,'Prefer':'return=minimal'}});
      }
      showToast('✓ Tilgang fjernet');
      window.mvShare(btn);
    }catch(e){if(statusEl){statusEl.style.color='var(--danger)';statusEl.textContent='Kunne ikke fjerne: '+e.message;}}
  };
};

// ══════════════════════════════════════════════════════════════════════════════
// mvPitch — data-pitch="type|id|"
// ══════════════════════════════════════════════════════════════════════════════
window.mvPitch = function(btn) {
  const raw=(btn.dataset.pitch||'').trim();
  const sep=raw.indexOf('|');
  const type=sep>=0?raw.slice(0,sep):raw;
  const id=sep>=0?raw.slice(sep+1).replace(/\|.*$/,''):'';
  if(type==='album'){
    if(typeof window.albumPitchMode==='function'){window.albumPitchMode(id);return;}
    showToast('Album pitch ikke tilgjengelig');
  } else if(type==='mixtape'){
    if(typeof window.mixtapeShareMode==='function'){window.mixtapeShareMode(id);return;}
    showToast('Deling er ikke klar ennå — prøv igjen om litt');
  }
};
// ── renameBeatInline ──────────────────────────────────────────────────────────
window.renameBeatInline = function(id) {
  const el=document.getElementById('abt-'+id);if(!el)return;
  const st=typeof state!=='undefined'?state:window.state;
  const b=st.beats.find(x=>x.id===id);if(!b)return;
  const old=b.name||'';
  const inp=document.createElement('input');inp.type='text';inp.value=old;
  inp.style.cssText='background:rgb(var(--ink-rgb) / .08);border:1px solid rgb(var(--accent-rgb) / .5);color:var(--text);font-size:inherit;font-weight:inherit;font-family:inherit;padding:2px 8px;border-radius:6px;outline:none;width:100%;box-sizing:border-box;min-width:60px';
  el.replaceWith(inp);inp.focus();inp.select();
  function commit(){
    const n=inp.value.trim();
    if(n&&n!==old){b.name=n;saveState();if(typeof showToast==='function')showToast('\u2713 Navn lagret');}
    const mixV=document.getElementById('mixtapeDetailView'),albV=document.getElementById('albumDetailView');
    if(mixV&&!mixV.classList.contains('hidden')){if(typeof renderMixtapeDetail==='function')renderMixtapeDetail();}
    else if(albV&&!albV.classList.contains('hidden')){if(typeof renderAlbumDetail==='function')renderAlbumDetail();}
    else{const d=document.createElement('div');d.id='abt-'+id;d.className='ab-title';d.style.cssText='min-width:0;flex:1';d.textContent=n||old;inp.replaceWith(d);}
  }
  inp.addEventListener('blur',commit);
  inp.addEventListener('keydown',e=>{if(e.key==='Enter')inp.blur();if(e.key==='Escape'){inp.value=old;inp.blur();}});
};

// ── Hvem lastet opp en låt ────────────────────────────────────────────────────
// Navnet som ble lagret på låten er et øyeblikksbilde og følger ikke med når brukernavnet
// endres. Derfor: dine egne låter (og låter med din bruker-ID) vises med navnet i profilen
// din nå; delte låter fra andre beholder navnet som ble lagret.
window.mvUploaderName = function(b){
  if(!b) return '';
  const me = sessionStorage.getItem('mv_username') || '';
  const myId = window._mvCurrentUserId || sessionStorage.getItem('mv_user_id') || '';
  if(b.uploadedById) return (b.uploadedById === myId && me) ? me : (b.uploadedBy || '');
  if(!b._shared && me) return me;
  return b.uploadedBy || '';
};

// ── downloadBeat ──────────────────────────────────────────────────────────────
window.downloadBeat = function(id) {
  const st=typeof state!=='undefined'?state:window.state;
  const b=st?.beats?.find(x=>x.id===id);
  const url=b?.audio_url||b?.url||b?.driveUrl||b?.drive_url;
  if(!url){if(typeof showToast==='function')showToast('Ingen lydfil');return;}
  const a=document.createElement('a');a.href=url;
  a.download=(b.name||'beat').replace(/[^a-z0-9 ._-]/gi,'_')+'.mp3';
  a.target='_blank';document.body.appendChild(a);a.click();setTimeout(()=>a.remove(),300);
};



window.renderCollectionComments = async function(type, id) {
  const elId = type==='album' ? 'albumComments' : 'mixtapeComments';
  const el = document.getElementById(elId);
  if(!el || !id) return;
  const SBU=window.MV_CONFIG.SUPABASE_URL, SBK=window.MV_CONFIG.SUPABASE_ANON_KEY;
  let token=SBK, uid=window._mvCurrentUserId||sessionStorage.getItem('mv_user_id');
  try {const {data:{session}}=await window.supabaseClient.auth.getSession();if(session?.access_token)token=session.access_token;if(session?.user?.id)uid=session.user.id;}catch(e){}
  const hdrs={'apikey':SBK,'Authorization':'Bearer '+token,'Content-Type':'application/json'};
  let pitchComments=[],labelComments=[];
  try{const r=await fetch(`${SBU}/rest/v1/pitch_comments?album_id=eq.${id}&order=created_at.asc&select=*`,{headers:hdrs});if(r.ok)pitchComments=await r.json();}catch(e){}
  try{const r=await fetch(`${SBU}/rest/v1/notifications?content_id=eq.${id}&type=eq.label_comment&order=created_at.asc&select=*`,{headers:hdrs});if(r.ok)labelComments=await r.json();}catch(e){}
  const all=[
    ...pitchComments.map(c=>{const initials=(c.author||'?').slice(0,2).toUpperCase();const dt=new Date(c.created_at);const ts=dt.toLocaleDateString('nb-NO',{day:'numeric',month:'short'})+' '+dt.toLocaleTimeString('nb-NO',{hour:'2-digit',minute:'2-digit'});const canDel=isAdmin()||uid===c.sender_id;return `<div class="cc-item" id="cc-${c.id}"><div class="cc-avatar">${initials}</div><div class="cc-body"><div class="cc-header"><span class="cc-author">${esc(c.author||'Anonym')}</span><span class="cc-tag cc-tag-pitch">Pitch</span><span class="cc-time">${ts}</span>${canDel?`<button class="cc-del" aria-label="Slett kommentar" title="Slett kommentar" onclick="deleteCollectionComment('pitch','${c.id}','${type}','${id}')">&#215;</button>`:''}</div><div class="cc-text">${esc(c.comment||'')}</div></div></div>`}),
    ...labelComments.map(n=>{const author=n.content_name||'Label';const initials=author.slice(0,2).toUpperCase();const dt=new Date(n.created_at);const ts=dt.toLocaleDateString('nb-NO',{day:'numeric',month:'short'})+' '+dt.toLocaleTimeString('nb-NO',{hour:'2-digit',minute:'2-digit'});const canDel=isAdmin()||uid===n.recipient_id||uid===n.sender_id;return `<div class="cc-item" id="cc-${n.id}"><div class="cc-avatar cc-avatar-label">${initials}</div><div class="cc-body"><div class="cc-header"><span class="cc-author">${esc(author)}</span><span class="cc-tag cc-tag-label">Label</span><span class="cc-time">${ts}</span>${canDel?`<button class="cc-del" aria-label="Slett kommentar" title="Slett kommentar" onclick="deleteCollectionComment('notification','${n.id}','${type}','${id}')">&#215;</button>`:''}</div></div></div>`})
  ];
  el.innerHTML=`<div class="cc-wrap"><div class="cc-title"><span class="ic ic-chat" aria-hidden="true"></span> Kommentarer ${all.length?'<span class="cc-count">'+all.length+'</span>':''}</div><div class="cc-list">${all.length?all.join(''):'<div class="cc-empty">Ingen kommentarer enn\u00e5.</div>'}</div></div>`;
};
window.deleteCollectionComment = async function(source,commentId,type,collId) {
  if(!(await mvConfirm({title:'Slette kommentaren?',body:'Den kan ikke hentes tilbake.',ok:'Slett',danger:true})))return;
  const SBU=window.MV_CONFIG.SUPABASE_URL,SBK=window.MV_CONFIG.SUPABASE_ANON_KEY;
  let token=SBK;try{const {data:{session}}=await window.supabaseClient.auth.getSession();if(session?.access_token)token=session.access_token;}catch(e){}
  const hdrs={'apikey':SBK,'Authorization':'Bearer '+token};
  const table=source==='pitch'?'pitch_comments':'notifications';
  try{const r=await fetch(`${SBU}/rest/v1/${table}?id=eq.${commentId}`,{method:'DELETE',headers:hdrs});if(r.ok||r.status===204){document.getElementById('cc-'+commentId)?.remove();if(typeof showToast==='function')showToast('\u2713 Kommentar slettet');};}catch(e){if(typeof showToast==='function')showToast('Feil: '+e.message);}
};

function toggleAlbumBeat(id){
  // Mount inline editors that appear when card expands
  requestAnimationFrame(()=>{
    if(typeof mountInlineEditors === 'function') mountInlineEditors();
  });
  // Find card in the currently VISIBLE beat list (mixtape or album context)
  const mixList = document.getElementById('mixtapeBeatList');
  const albList = document.getElementById('albumBeatList');
  const mixVisible = mixList && !document.getElementById('mixtapeDetailView')?.classList.contains('hidden');
  const albVisible = albList && !document.getElementById('albumDetailView')?.classList.contains('hidden');
  
  let card = null;
  if(mixVisible){
    card = mixList.querySelector(`[data-beat-id="${id}"], #abi-${id}`);
  }
  if(!card && albVisible){
    card = albList.querySelector(`[data-beat-id="${id}"], #abi-${id}`);
  }
  // Fallback: first visible card with this id
  if(!card){
    const all = document.querySelectorAll(`[data-beat-id="${id}"], #abi-${id}`);
    for(const c of all){ if(c.offsetParent !== null){ card = c; break; } }
  }
  if(!card) return;

  const isExpanded = card.classList.contains("expanded");

  if(isExpanded){
    // Animate out, then collapse
    const expandEl = card.querySelector('.ab-expand');
    if(expandEl && !expandEl.dataset.collapsing){
      expandEl.dataset.collapsing = '1';
      expandEl.style.animation = 'mvCollapseOut 0.18s ease forwards';
      setTimeout(()=>{
        card.classList.remove("expanded");
        expandEl.style.animation = '';
        delete expandEl.dataset.collapsing;
      }, 170);
    } else if(!expandEl){
      card.classList.remove("expanded");
    }
  } else {
    card.classList.add("expanded");
    loadAudioForBeat(id);
  }
}
function setAlbumBeatRating(id,r){
  const b=state.beats.find(x=>x.id===id);if(!b)return;
  b.rating=r;saveState();
  const card=document.getElementById(`abi-${id}`);
  if(card)card.querySelectorAll(".ab-stars button").forEach((s,i)=>s.classList.toggle("on",i<r));
}
function setAlbumBeatDone(id,val){
  const b=state.beats.find(x=>x.id===id);if(!b)return;
  b.done=clamp(val);saveState();
  const lbl=document.getElementById(`abidone-${id}`);if(lbl)lbl.textContent=b.done+"%";
  // V11: one combined bar — the range input itself shows the fill via --pct.
  const rng=document.getElementById(`abirange-${id}`);if(rng){rng.value=b.done;rng.style.setProperty('--pct',b.done+'%');}
}
// V14: crop the largest CENTERED square of the source and scale it into a square canvas —
// no stretch, no over-zoom, no letterbox bars. Shared by every cover upload so they're consistent.
function mvSquareCoverDataURL(img,size,quality){
  size=size||600;
  const iw=img.naturalWidth||img.width, ih=img.naturalHeight||img.height;
  const s=Math.min(iw,ih);                 // largest square that fits inside the source
  const sx=(iw-s)/2, sy=(ih-s)/2;          // centered
  const canvas=document.createElement("canvas");canvas.width=canvas.height=size;
  canvas.getContext("2d").drawImage(img,sx,sy,s,s,0,0,size,size);
  return canvas.toDataURL("image/jpeg",quality||.85);
}
function setAlbumBeatCover(id,input){
  const f=input.files[0];if(!f)return;
  const reader=new FileReader();
  reader.onload=e=>{
    const img=new Image();
    img.onload=()=>{
      const b=state.beats.find(x=>x.id===id);if(!b)return;
      b.cover=mvSquareCoverDataURL(img,600,.85);   // V14: square crop (was stretched into 600x338)
      saveState();
      renderAlbumDetail();
    };img.src=e.target.result;
  };reader.readAsDataURL(f);
}

document.getElementById("newAlbumCoverInput").addEventListener("change",e=>{
  const f=e.target.files[0];if(!f)return;
  const reader=new FileReader();
  reader.onload=ev=>{
    const img=new Image();
    img.onload=()=>{
      newAlbumCoverFile=f;
      newAlbumCoverBase64=mvSquareCoverDataURL(img,400,.85);   // V14: square crop (was Math.min letterbox)
      const prev=document.getElementById("albumCoverPreview");
      prev.src=newAlbumCoverBase64;
      document.getElementById("albumCoverPreviewWrap").style.display="flex";
    };
    img.src=ev.target.result;
  };
  reader.readAsDataURL(f);
});

function makeAlbumCover(file,cb){
  if(!file)return;
  const reader=new FileReader();
  reader.onload=ev=>{
    const img=new Image();
    img.onload=()=>cb(mvSquareCoverDataURL(img,600,.86));   // V14: shared square crop
    img.src=ev.target.result;
  };
  reader.readAsDataURL(file);
}

// HD-cover for den store cover-visningen (js/cover-viewer.js): samme kvadratiske
// utsnitt, opptil 2048 px, lastet opp til R2 (covers/{albumId}). Selve album.cover
// forblir den lille data-URL-en så synk og lister holder seg lette.
// cover_hd_for = fingeravtrykk av album.cover, så et cover byttet på annen måte
// (f.eks. arvet) aldri viser en gammel HD-fil.
function mvCoverFingerprint(s){s=String(s||"");let h=5381;for(let i=0;i<s.length;i+=Math.max(1,s.length>>10))h=((h<<5)+h+s.charCodeAt(i))|0;return s.length+"-"+(h>>>0).toString(36);}
window.mvCoverFingerprint=mvCoverFingerprint;
function mvUploadAlbumCoverHD(album,file){
  if(!album||!file||!window.r2Storage||!window.r2Storage.ready())return;
  const url=URL.createObjectURL(file);
  const img=new Image();
  img.onload=()=>{
    URL.revokeObjectURL(url);
    const iw=img.naturalWidth,ih=img.naturalHeight,s=Math.min(iw,ih),size=Math.min(2048,s);
    const c=document.createElement("canvas");c.width=c.height=size;
    c.getContext("2d").drawImage(img,(iw-s)/2,(ih-s)/2,s,s,0,0,size,size);
    c.toBlob(blob=>{
      if(!blob)return;
      window.r2Storage.uploadKey("covers/"+album.id,blob)
        .then(u=>{album.cover_hd=u+(u.includes("?")?"&":"?")+"v="+Date.now();album.cover_hd_for=mvCoverFingerprint(album.cover);saveState();})
        .catch(err=>console.warn("[Cover] HD-opplasting feilet — viser vanlig oppløsning:",err));
    },"image/jpeg",.9);
  };
  img.onerror=()=>URL.revokeObjectURL(url);
  img.src=url;
}

const albumCoverInput=document.getElementById("albumCoverInput");
if(albumCoverInput){
  albumCoverInput.addEventListener("change",e=>{
    const f=e.target.files[0];if(!f)return;
    const album=state.albums.find(a=>a.id===currentAlbumId);if(!album)return;
    makeAlbumCover(f,data=>{
      album.cover=data;
      saveState();
      renderAlbumDetail();
      showToast("✓ Albumbildet er oppdatert");
      mvUploadAlbumCoverHD(album,f);
    });
    e.target.value="";
  });
}

document.getElementById("newAlbumBtn").addEventListener("click",()=>{
  document.getElementById("newAlbumName").value="";
  document.getElementById("newAlbumCoverInput").value="";
  document.getElementById("albumCoverPreviewWrap").style.display="none";
  newAlbumCoverBase64=null;
  newAlbumCoverFile=null;
  document.getElementById("newAlbumModal").classList.add("open");
});

document.getElementById("saveNewAlbumBtn").addEventListener("click",()=>{
  const name=document.getElementById("newAlbumName").value.trim();
  if(!name){alert("Skriv inn et albumnavn.");return;}
  state.albums.unshift({id:uid(),name,cover:newAlbumCoverBase64||null,beatIds:[],createdAt:Date.now()});
  if(newAlbumCoverBase64&&newAlbumCoverFile)mvUploadAlbumCoverHD(state.albums[0],newAlbumCoverFile);
  saveState();renderAlbums();closeModal("newAlbumModal");showToast(`✓ Album "${name}" opprettet`);
});

document.getElementById("backToAlbumsBtn").addEventListener("click",()=>{currentAlbumId=null;renderAlbums();});

function beatSourceMixtape(beatId){
  const mt=(state.mixtapes||[]).find(x=>(x.beatIds||[]).includes(beatId));
  return mt?{mixtape:mt,color:cassColor(mt,state.mixtapes.indexOf(mt))}:null;
}
function beatCheckItemMarkup(b){
  const src=beatSourceMixtape(b.id);
  const cls=src?'beat-check-item mixtape-source':'beat-check-item';
  const style=src?` style="--source-mixtape-color:${src.color}"`:'';
  const meta=src?`<span class="beat-check-meta">${esc(src.mixtape.name)}</span>`:'';
  return `<label class="${cls}"${style}><input type="checkbox" value="${b.id}"><span>${esc(b.name)}</span>${meta}</label>`;
}

function renderAlbumAddBeatSearch(){
  const q=(document.getElementById("beatSearchInput")?.value||"").trim().toLowerCase();
  const filtered=albumAddBeatCandidates.filter(b=>String(b.name||"").toLowerCase().includes(q)||String(b.source||"").toLowerCase().includes(q));
  document.getElementById("beatCheckList").innerHTML=filtered.length
    ?filtered.map(beatCheckItemMarkup).join("")
    :`<div class="hint">${albumAddBeatCandidates.length?"Ingen beats matcher søket.":"Alle beats er allerede i dette albumet."}</div>`;
}

document.getElementById("addBeatsToAlbumBtn").addEventListener("click",()=>{
  const album=state.albums.find(a=>a.id===currentAlbumId);if(!album)return;
  albumAddBeatCandidates=state.beats.filter(b=>!b.archived&&!album.beatIds.includes(b.id));   // arkiverte låter skal ikke foreslås
  const search=document.getElementById("beatSearchInput");
  if(search)search.value="";
  renderAlbumAddBeatSearch();
  document.getElementById("addBeatsModal").classList.add("open");
  setTimeout(()=>document.getElementById("beatSearchInput")?.focus(),80);
});

document.getElementById("beatSearchInput")?.addEventListener("input",renderAlbumAddBeatSearch);

document.getElementById("confirmAddBeatsBtn").addEventListener("click",()=>{
  const album=state.albums.find(a=>a.id===currentAlbumId);if(!album)return;
  const checked=[...document.querySelectorAll("#beatCheckList input:checked")];
  checked.forEach(cb=>{if(!album.beatIds.includes(cb.value))album.beatIds.push(cb.value);});
  saveState();renderAlbumDetail();closeModal("addBeatsModal");showToast(`✓ ${checked.length} ${checked.length===1?"låt":"låter"} lagt til`);
});

document.getElementById("deleteAlbumBtn").addEventListener("click",()=>{
  if(isProducerUser()){showToast("Produsentmodus: sletting er låst");return;}
  const a=state.albums.find(x=>x.id===currentAlbumId);if(!a)return;
  showDeleteConfirm(`Slette albumet "${a.name}"?`,()=>{
    state.albums=state.albums.filter(x=>x.id!==currentAlbumId);
    currentAlbumId=null;saveState();renderAlbums();showToast("Album slettet");
  });
});

// ── PIPELINE ──
function renderPipeline(){
  const board=document.getElementById("pipelineBoard");
  if(!state.albums.length){board.innerHTML=`<div class="empty">Ingen albumer ennå. Opprett et album og legg til beats for å se pipeline.</div>`;return;}
  board.innerHTML=state.albums.map(album=>{
    const beats=state.beats.filter(b=>album.beatIds.includes(b.id));
    const avg=beats.length?Math.round(beats.reduce((s,b)=>s+clamp(b.done||0),0)/beats.length):0;
    const avgCol=mvPctColor(avg);
    const coverHtml=album.cover
      ?`<img class="pipeline-album-cover" src="${esc(album.cover)}" alt="${esc(album.name)}">`
      :`<div class="pipeline-album-cover-ph"><span class="ic ic-music" aria-hidden="true"></span></div>`;
    const beatRows=beats.map(b=>{
      const pct=clamp(b.done||0);
      const col=pct>=70?"var(--ok)":pct>=40?"var(--accent-ink)":"var(--danger)";
      return`<div class="pipeline-beat-row">
        <div class="pipeline-beat-name">${esc(b.name)}</div>
        <div class="pipeline-beat-bar"><div style="width:${pct}%;background:${col}"></div></div>
        <div class="pipeline-beat-pct">${pct}%</div>
      </div>`;
    }).join("");
    return`<div class="pipeline-album-section">
      <div class="pipeline-album-hd">
        ${coverHtml}
        <div class="pipeline-album-info">
          <h3>${esc(album.name)}</h3>
          <div class="pipeline-avg">
            <div class="progress-bar" style="height:8px"><div style="width:${avg}%;background:${avgCol}"></div></div>
            <span style="color:${avgCol};font-weight:700">${avg}%</span>
          </div>
        </div>
      </div>
      ${beats.length?beatRows:`<p class="hint" style="margin:0">Ingen beats i dette albumet ennå.</p>`}
    </div>`;
  }).join("");
}

// ── MIXTAPES ──
const CASS_COLORS=[
  "#b95f33","#cf7b3e","#d79647","#f2a442","#9a4b2d","#6f4a2b",
  "#d94b4b","#e85d75","#b6427a","#7a4fc4","#4f6fd8","#2f83c9",
  "#2f9b8f","#3d9b61","#7aa33f","#c2a83b","#c66d2a","#8f5e39",
  "#e56b3f","#ff8c42","#6d8fbd","#3b6f63","#945a91","#314d7a"
];
let currentMixtapeId=null;
let mixtapeSortMode="custom";
let albumAddBeatCandidates=[];
let mixtapeAddBeatCandidates=[];
let newMixtapeCoverBase64=null;
function hashStr(str){let h=0;for(let i=0;i<String(str||"").length;i++)h=(Math.imul(31,h)+String(str||"").charCodeAt(i))|0;return Math.abs(h);}
function cassColor(mt,idx=0){return mt?.color||CASS_COLORS[hashStr(mt?.id||mt?.name||String(idx))%CASS_COLORS.length];}
function ensureMixtapeStableVisuals(){
  let changed=false;
  (state.mixtapes||[]).forEach((mt,idx)=>{
    if(!mt.id){mt.id=uid();changed=true;}
    if(!mt.color){mt.color=CASS_COLORS[hashStr(mt.id||mt.name||String(idx))%CASS_COLORS.length];changed=true;}
    if(typeof mt.cover==="undefined"){mt.cover=null;changed=true;}
  });
  if(changed)saveState();
}
function cassCoverStyle(cover){return cover?`--cass-cover:url('${cover}');`:"";}
// Cassette PNG selection — deterministic based on mixtape id so same tape always gets same image
function cassettePng(mt){
  const CASSETTES = ['assets/Cassette 1.png','assets/Cassette 2.png','assets/Cassette 3.png','assets/Cassette 4.png'];
  // Hash the id string to a stable index
  const id = mt.id || '';
  let h = 0;
  for(let i=0;i<id.length;i++) h = (h*31 + id.charCodeAt(i)) & 0xffff;
  return CASSETTES[h % CASSETTES.length];
}
function cassetteMarkup(mt,idx=0){
  const tracks=(mt?.beatIds||[]).filter(id=>{const b=state.beats.find(x=>x.id===id);return b&&!b.archived;}).length;
  const png = cassettePng(mt);
  return `<div class="cass-png-wrap">
    <img class="cass-png" src="${png}" alt="Kassett" draggable="false">
    <div class="cass-png-label">
      <div class="cass-png-name">${esc(mt.name)}</div>
      <div class="cass-png-meta">${tracks} ${tracks===1?'låt':'låter'}</div>
    </div>
  </div>`;
}

function renderMixtapes(){
  ensureMixtapeStableVisuals();
  if(currentMixtapeId){renderMixtapeDetail();return;}
  document.getElementById("mixtapesListView").classList.remove("hidden");
  document.getElementById("mixtapeDetailView").classList.add("hidden");
  const grid=document.getElementById("mixtapeGrid");
  const cards=state.mixtapes.map((mt,idx)=>{
    const n=(mt.beatIds||[]).filter(id=>{ const b=state.beats.find(x=>x.id===id); return b && !b.archived; }).length;
    const dragAttrs=isProducerUser()?`data-id="${mt.id}"`:`draggable="true" data-id="${mt.id}" ondragstart="startCardDrag(event,'mixtape','${mt.id}')" ondragover="cardDragOver(event,'mixtape','${mt.id}')" ondragleave="cardDragLeave(event,'${mt.id}')" ondrop="dropCard(event,'mixtape','${mt.id}')" ondragend="endCardDrag()"`;
    return`<div class="cassette-card" ${dragAttrs} onclick="openMixtapeFromCard(event,'${mt.id}')">
      ${cassetteMarkup(mt,idx)}
      <div class="cass-card-title">${esc(mt.name)}<span>${n} ${n===1?"låt":"låter"}</span></div>
    </div>`;
  });
  // "Ny mixtape" uses cassette-4 with a + on the label, semi-transparent
  const NEW_CASSETTE = 'assets/Cassette 4.png';
  cards.push(`<div class="cassette-card cass-new-card" onclick="document.getElementById('newMixtapeBtn').click()">
      <div class="cass-png-wrap" style="opacity:.55">
        <img class="cass-png" src="${NEW_CASSETTE}" alt="Ny kassett" draggable="false">
        <div class="cass-png-label" style="justify-content:center;align-items:center;padding-top:0%">
          <div style="font-size:11px;font-weight:300;color:#4a3a28;letter-spacing:.18em;text-transform:uppercase">+ Ny mixtape</div>
        </div>
      </div>
      <div class="cass-card-title">Ny mixtape<span>&nbsp;</span></div>
    </div>`);
  grid.innerHTML=cards.join("");
}

function openMixtape(id){currentMixtapeId=id;renderMixtapeDetail();setTimeout(()=>showDropZone("mixtapeDrop"),50);}

function getSortedMixtapeBeats(mt){
  const beats=beatsFromIds(mt.beatIds);
  const mode=mixtapeSortMode||"custom";
  if(mode==="favorite")return beats.slice().sort((a,b)=>(b.favorite?1:0)-(a.favorite?1:0)||(b.rating||0)-(a.rating||0)||String(a.name||"").localeCompare(String(b.name||"")));
  if(mode==="rating")return beats.slice().sort((a,b)=>(b.rating||0)-(a.rating||0)||(b.favorite?1:0)-(a.favorite?1:0)||String(a.name||"").localeCompare(String(b.name||"")));
  if(mode==="newest")return beats.slice().sort((a,b)=>(b.createdAt||0)-(a.createdAt||0)||String(a.name||"").localeCompare(String(b.name||"")));
  if(mode==="name")return beats.slice().sort((a,b)=>String(a.name||"").localeCompare(String(b.name||""),"nb",{sensitivity:"base"}));
  return beats;
}

function renderMixtapeDetail(){
  document.getElementById("mixtapesListView").classList.add("hidden");
  document.getElementById("mixtapeDetailView").classList.remove("hidden");
  const dz=document.getElementById("mixtapeDrop");if(dz)dz.classList.add("active");
  const mt=state.mixtapes.find(x=>x.id===currentMixtapeId);
  if(!mt){currentMixtapeId=null;renderMixtapes();return;}
  const idx=state.mixtapes.indexOf(mt);
  const col=cassColor(mt,idx);
  const hd=document.getElementById("mixtapeDetailHd");
  hd.style.background="none";hd.style.border="none";hd.style.padding="0 0 4px 0";
  hd.innerHTML=`
    <div class="mixtape-detail-head">
      <div class="mixtape-detail-visual">
        <img src="${cassettePng(mt)}" class="mixtape-detail-cassette" alt="${esc(mt.name)}" draggable="false">
      </div>
      <div class="mixtape-detail-copy">
        <div class="mixtape-detail-kicker">Mixtape</div>
        <h2 style="display:flex;align-items:center;gap:8px">${esc(mt.name)}<button onclick="renameMixtape('${mt.id}')" title="Gi nytt navn" aria-label="Gi nytt navn til mixtapen" style="background:none;border:none;cursor:pointer;color:var(--muted);font-size:14px;padding:2px 4px;opacity:.7;transition:opacity .15s" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=.7"><span class="ic ic-pen" aria-hidden="true"></span></button></h2>
        <span style="color:var(--muted);font-size:13px">${(()=>{const n=(mt.beatIds||[]).filter(id=>{const b=state.beats.find(x=>x.id===id);return b&&!b.archived;}).length;return n+' beat'+(n===1?'':'s');})()}</span>
        <div id="mixtapeNowPlaying" class="hint" style="margin-top:6px"></div>
      </div>
      <div class="mixtape-detail-actions">
        <button class="primary-btn" id="playMixtapeBtn" onclick="playMixtapeFromStart('${mt.id}')"><span class="ic ic-play" aria-hidden="true"></span> Spill fra start</button>
        ${(typeof window.isOwnerOrEditor==='function'&&window.isOwnerOrEditor())?`<button class="ghost-btn mv-mob-hide" data-pitch="mixtape|${mt.id}|" onclick="mvPitch(this)" title="Offentlig lenke som alle med lenken kan lytte på"><span class="ic ic-globe" aria-hidden="true"></span> Del lenke</button>`:''}
        ${!mt._shared?`<button class="ghost-btn mv-mob-hide" data-share="mixtape|${mt.id}|${esc(mt.name)}" onclick="mvShare(this)"><span class="ic ic-user" aria-hidden="true"></span> Del med bruker</button>`:''}
        <button class="small-btn danger hidden" id="stopMixtapeBtn" onclick="stopCollectionPlayback()"><span class="ic ic-stop" aria-hidden="true"></span> Stopp</button>
      </div>
    </div>
  `;
  const sortSelect=document.getElementById("mixtapeSortSelect");
  if(sortSelect)sortSelect.value=mixtapeSortMode||"custom";
  const beats=getSortedMixtapeBeats(mt);
  renderAlbumBeats(beats,"mixtape",document.getElementById("mixtapeBeatList"));
  updateCollectionPlayerUI();
  updateArchiveToolbarButtons?.();
}

function renderIntegrations(){
  document.getElementById("driveFolderId").value=state.settings.driveFolderId||"";
  document.getElementById("driveApiKey").value=state.settings.driveApiKey||"";
  document.getElementById("soundcloudProxy").value=state.settings.soundcloudProxy||"";
}

// Dirty flags — tracks which tabs need re-render
const _dirtyTabs = new Set(['albums','mixtapes','pipeline','integrations','beats']);

function markDirty(tab){ if(tab) _dirtyTabs.add(tab); else ['albums','mixtapes','pipeline','integrations','beats'].forEach(t=>_dirtyTabs.add(t)); }

function renderActiveTab(tab){
  renderStats();
  const t = tab || document.querySelector('.tab-btn.active')?.dataset?.tab || '';
  if((t==='mixtapes'||t==='')  && _dirtyTabs.has('mixtapes'))  { renderMixtapes();  _dirtyTabs.delete('mixtapes'); }
  if(t==='albums'   && _dirtyTabs.has('albums'))   { renderAlbums();   _dirtyTabs.delete('albums'); }
  if(t==='pipeline') { (window.renderPipelineV2||renderPipeline)(); _dirtyTabs.delete('pipeline'); } // always re-render pipeline
  if(t==='integrations' && _dirtyTabs.has('integrations')){ renderIntegrations(); _dirtyTabs.delete('integrations'); }
  if(t==='beats') { if(typeof renderBeatsTab==='function') renderBeatsTab(); }
  if(t==='archive') {
    if(typeof window.renderArchiveView==='function') window.renderArchiveView();
    else if(typeof window.openArchiveTab==='function') window.openArchiveTab();
  }
  if(t==='lyriclab' && typeof window.renderLyricLab==='function') window.renderLyricLab();
  if(t==='artistpage' && window.mvArtistStudio) window.mvArtistStudio.open();
  if((t==='hjem'||t==='') && window.mvExplore) window.mvExplore.open();
}

function renderAll(){
  renderStats();
  // Mark all tabs dirty so next time they're opened they re-render
  markDirty();
  // Only render the currently active tab
  renderActiveTab();
  applyRoleMode();
}

function updateModalScore(d){
  const sc=releaseScore(d);const el=document.getElementById("editModalScore");
  el.textContent=sc;el.style.color=sc>=70?"var(--ok)":sc>=40?"var(--accent-ink)":"var(--danger)";
}
function switchMTab(t){
  document.querySelectorAll(".mtab").forEach(x=>x.classList.remove("active"));
  document.querySelectorAll(".mtab-content").forEach(x=>x.classList.remove("active"));
  document.querySelector(`.mtab[data-mtab="${t}"]`).classList.add("active");
  document.getElementById(`mtab-${t}`).classList.add("active");
}
function renderModalStars(r){
  modalRating=r;
  document.getElementById("editRatingStars").innerHTML=Array.from({length:10},(_,i)=>`<button class="rstar${i<r?" on":""}" onmouseover="pvStars(${i+1})" onmouseout="renderModalStars(${modalRating})" onclick="setMRating(${i+1})">★</button>`).join("");
}
function pvStars(n){document.querySelectorAll(".rstar").forEach((s,i)=>s.classList.toggle("on",i<n));}
function setMRating(n){modalRating=n;renderModalStars(n);}
function renderModalVers(demoId){
  const vers=state.versions.filter(v=>v.demoId===demoId).sort((a,b)=>b.createdAt-a.createdAt);
  const el=document.getElementById("editVerList");
  if(!vers.length){el.innerHTML=`<div class="hint" style="padding:10px 0">Ingen versjoner ennå.</div>`;return;}
  el.innerHTML=vers.map(v=>`<div class="ver-item"><div class="ver-date">${new Date(v.createdAt).toLocaleDateString("no-NO")} ${new Date(v.createdAt).toLocaleTimeString("no-NO",{hour:"2-digit",minute:"2-digit"})}</div><div class="ver-text"><strong>${esc(v.name)}</strong>${v.notes?`<br><span style="color:var(--muted);font-size:12px">${esc(v.notes)}</span>`:""}</div><button class="ver-del" onclick="delMVer('${v.id}')">✕</button></div>`).join("");
}
function delMVer(id){state.versions=state.versions.filter(v=>v.id!==id);saveState();const did=document.getElementById("editDemoId").value;renderModalVers(did);}

document.getElementById("saveOverviewBtn").addEventListener("click",()=>{
  const d=state.demos.find(x=>x.id===document.getElementById("editDemoId").value);if(!d)return;
  const ap=document.querySelector(".p-btn.active");if(ap)d.stage=ap.textContent;
  d.done=clamp(document.getElementById("editCompl").value);d.rating=modalRating;d.notes=document.getElementById("editNotes").value.trim();
  saveState();renderAll();updateModalScore(d);showToast("✓ Lagret");
});
document.getElementById("deleteDemoBtn").addEventListener("click",()=>{
  if(isProducerUser()){showToast("Produsentmodus: sletting er låst");return;}
  const id=document.getElementById("editDemoId").value;
  const prevDemos=state.demos.slice(), prevVersions=state.versions.slice();
  state.demos=state.demos.filter(d=>d.id!==id);state.versions=state.versions.filter(v=>v.demoId!==id);
  saveState();renderAll();document.getElementById("editDemoModal").classList.remove("open");
  showToast("Demoen er slettet","Angre",()=>{state.demos=prevDemos;state.versions=prevVersions;saveState();renderAll();showToast("✓ Demoen er tilbake");});
});
document.getElementById("addModalVerBtn").addEventListener("click",()=>{
  const did=document.getElementById("editDemoId").value;const t=document.getElementById("editVerInput").value.trim();if(!t)return;
  state.versions.unshift({id:uid(),demoId:did,name:t,url:"",notes:"",createdAt:Date.now()});
  document.getElementById("editVerInput").value="";saveState();renderModalVers(did);
  const d=state.demos.find(x=>x.id===did);if(d)updateModalScore(d);showToast("✓ Versjon lagt til");
});
document.getElementById("saveDemoNotesBtn").addEventListener("click",()=>{
  const d=state.demos.find(x=>x.id===document.getElementById("editDemoId").value);if(!d)return;
  d.lyricsNotes=document.getElementById("editDemoNotes").value;saveState();updateModalScore(d);showToast("✓ Notater lagret");
});
document.getElementById("closeModalBtn").addEventListener("click",()=>document.getElementById("editDemoModal").classList.remove("open"));
document.getElementById("editDemoModal").addEventListener("click",e=>{if(e.target===e.currentTarget)e.currentTarget.classList.remove("open");});
document.querySelectorAll(".mtab").forEach(t=>t.addEventListener("click",()=>switchMTab(t.dataset.mtab)));

// ── BEAT EVENTS ──
document.getElementById("beatFiles").addEventListener("change",async e=>{
  const files=Array.from(e.target.files).filter(f=>f.type.startsWith("audio")||/\.(mp3|wav|flac|m4a|ogg|aac)$/i.test(f.name));
  for(const f of files)state.beats.unshift(await createBeatFromFile(f));
  saveState();renderAll();showToast(`✓ ${files.length} ${files.length===1?"låt":"låter"} lagt til`);
  e.target.value="";
});
document.getElementById("addBeatUrlBtn").addEventListener("click",()=>{
  const name=document.getElementById("beatNameInput").value.trim(),url=document.getElementById("beatUrlInput").value.trim();
  if(!name||!url){alert("Navn og URL kreves.");return;}
  state.beats.unshift({id:uid(),name,url:convertDrive(url),source:url.includes("drive.google")?"Google Drive":"URL",favorite:false,lyrics:"",rating:0,cover:"",done:0,createdAt:Date.now()});
  document.getElementById("beatNameInput").value="";document.getElementById("beatUrlInput").value="";
  saveState();renderAll();showToast("✓ Beat lagt til");
});


// ── DEMO EVENTS ──

// ── VERSION EVENTS ──


// ── INTEGRATIONS ──
document.getElementById("saveDriveSettingsBtn")?.addEventListener("click",()=>{state.settings.driveFolderId=document.getElementById("driveFolderId")?.value.trim()||'';state.settings.driveApiKey=document.getElementById("driveApiKey")?.value.trim()||'';saveState();showToast("✓ Lagret");});
document.getElementById("mockDriveImportBtn")?.addEventListener("click",()=>{state.beats.unshift({id:uid(),name:"Drive-import eksempel",url:"",source:"Google Drive (demo)",favorite:false,lyrics:"",createdAt:Date.now()});saveState();renderAll();showToast("✓ Simulert import");});
document.getElementById("saveSCSettingsBtn").addEventListener("click",()=>{state.settings.soundcloudProxy=document.getElementById("soundcloudProxy").value.trim();saveState();showToast("✓ Lagret");});

// ── EXPORT / IMPORT ──
document.getElementById("exportBtn").addEventListener("click",()=>{const b=new Blob([JSON.stringify(state,null,2)],{type:"application/json"});const u=URL.createObjectURL(b);const a=document.createElement("a");a.href=u;a.download="music-vault-backup.json";a.click();URL.revokeObjectURL(u);});
document.getElementById("importInput").addEventListener("change",e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=()=>{try{const imp=migrate(JSON.parse(r.result));Object.keys(state).forEach(k=>delete state[k]);Object.assign(state,imp);currentAlbumId=null;saveState();renderAll();showToast("✓ Backup importert");}catch{alert("Ugyldig fil.")}};r.readAsText(f);});

// ── TABS ──
// Fanebytte: en NY side starter øverst; klikk på fanen du allerede er på beholder posisjonen
// (double-rAF vinner over scroll fra render())
// Logo → Hjem (klikk på "Music Vault"-merket i headeren går til Hjem-fanen)
document.querySelector(".mv-logo")?.addEventListener("click",()=>document.querySelector('.tab-btn[data-tab="hjem"]')?.click());
document.querySelector(".mv-logo")?.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();document.querySelector('.tab-btn[data-tab="hjem"]')?.click();}});

document.querySelectorAll(".tab-btn").forEach(btn=>btn.addEventListener("click",()=>{
  if(isProducerUser()&&!["mixtapes","pipeline","docs"].includes(btn.dataset.tab)){showToast("Produsentmodus har tilgang til mixtapes og pipeline");return;}
  const sameTab=btn.classList.contains("active");
  const y=sameTab?(window.scrollY||document.documentElement.scrollTop||0):0;
  document.querySelectorAll(".tab-btn").forEach(b=>b.classList.remove("active"));
  btn.classList.add("active");

  // Archive tab is special — created dynamically by archive.js
  if(btn.dataset.tab === 'archive'){
    const current = document.querySelector(".tab-view:not(.hidden)");
    if(current){ current.classList.remove("tab-visible"); current.classList.add("hidden"); }
    if(typeof window.renderArchiveView === 'function') window.renderArchiveView();
    requestAnimationFrame(()=>{
      const archTab = document.getElementById('archiveTab');
      if(archTab){ archTab.classList.remove('tab-visible'); requestAnimationFrame(()=>archTab.classList.add('tab-visible')); }
    });
    applyRoleMode();
    requestAnimationFrame(()=>requestAnimationFrame(()=>window.scrollTo(0,y)));
    return;
  }

  // Lyric Lab tab — always re-render on every visit
  if(btn.dataset.tab === 'lyriclab'){
    // Hide ALL tab-views including archive (which uses style.display directly)
    document.querySelectorAll('.tab-view').forEach(v=>{
      v.classList.remove('tab-visible');
      v.classList.add('hidden');
      v.style.display = '';  // clear any style.display='none' set by archive.js
    });
    // Also deactivate archive body classes if needed
    document.body.classList.remove('final-archive-active','clean-archive-active');
    const ll = document.getElementById('lyriclabTab');
    if(!ll) return;
    ll.classList.remove('hidden');
    ll.style.display = '';
    ll.classList.remove('tab-visible');
    if(typeof window.renderLyricLab === 'function') window.renderLyricLab();
    requestAnimationFrame(()=>ll.classList.add('tab-visible'));
    applyRoleMode();
    requestAnimationFrame(()=>requestAnimationFrame(()=>window.scrollTo(0,y)));
    return;
  }

  const TAB_ID_MAP = { adminpanel: 'adminPanelTab', label: 'labelTab' };
  const current = document.querySelector(".tab-view:not(.hidden)");
  const next = document.getElementById(TAB_ID_MAP[btn.dataset.tab] || `${btn.dataset.tab}Tab`);
  if(!next) return;
  // Clear style.display set by archive.js on all tabs
  document.querySelectorAll('.tab-view').forEach(v=>{ v.style.display=''; });
  if(current && current !== next){ current.classList.remove("tab-visible"); current.classList.add("hidden"); }
  next.classList.remove("hidden");
  next.classList.remove("tab-visible");
  requestAnimationFrame(()=>{ next.classList.add("tab-visible"); });
  renderActiveTab(btn.dataset.tab);
  applyRoleMode();
  requestAnimationFrame(()=>requestAnimationFrame(()=>window.scrollTo(0,y)));
}));

// ── "Mer" dropdown in the desktop tab bar (collapses Arkivert/Label/Admin/Integrasjoner) ──
(function(){
  const btn=document.getElementById("mvMoreBtn"), menu=document.getElementById("mvMoreMenu");
  if(!btn||!menu) return;
  function place(){ const r=btn.getBoundingClientRect(); menu.style.top=(r.bottom+6)+"px"; menu.style.left="auto"; menu.style.right=Math.max(8,window.innerWidth-r.right)+"px"; }
  function close(){ menu.classList.remove("open"); btn.setAttribute("aria-expanded","false"); }
  function open(){ place(); menu.classList.add("open"); btn.setAttribute("aria-expanded","true"); }
  btn.addEventListener("click",e=>{ e.stopPropagation(); menu.classList.contains("open")?close():open(); });
  document.addEventListener("click",e=>{ if(!menu.contains(e.target)&&e.target!==btn) close(); });
  window.addEventListener("resize",()=>{ if(menu.classList.contains("open")) place(); });
  menu.querySelectorAll(".tab-btn[data-tab]").forEach(b=>b.addEventListener("click",close));
  // Highlight the "Mer" trigger when one of its tabs is active.
  const group=["archive","label","adminpanel","integrations"];
  const sync=()=>{ const a=document.querySelector(".mv-tabs .tab-btn.active")?.dataset?.tab; btn.classList.toggle("active",group.includes(a)); };
  document.querySelectorAll(".mv-tabs .tab-btn, .mv-more-menu .tab-btn").forEach(b=>b.addEventListener("click",()=>setTimeout(sync,0)));
  sync();
})();

// ── CLOSE MODALS ON BACKDROP ──
["newAlbumModal","addBeatsModal","newMixtapeModal","addBeatsToMixtapeModal","deleteConfirmModal"].forEach(id=>{
  const el=document.getElementById(id);if(el)el.addEventListener("click",e=>{if(e.target===e.currentTarget)closeModal(id);});
});
function syncModalState(){document.body.classList.toggle('modal-is-open',!!document.querySelector('.modal.open'));}
function closeModal(id){document.getElementById(id)?.classList.remove("open");syncModalState();}

// Keep global search behind any popup/modal.
(function(){
  const sync=()=>document.body.classList.toggle('modal-is-open',!!document.querySelector('.modal.open'));
  const mo=new MutationObserver(sync);
  mo.observe(document.documentElement,{subtree:true,attributes:true,attributeFilter:['class']});
  document.addEventListener('click',()=>setTimeout(sync,0),true);
  sync();
})();


const _lrt={};

// ── TOAST ──
let _tt;
// showToast(melding[, ms]) eller showToast(melding, knappetekst, handling) — f.eks. «Angre».
// (Denne lastes etter app.js og er den som faktisk gjelder, så knappen må støttes her.)
function showToast(msg,ms,actionFn){
  const actionLabel = typeof ms==='string' && typeof actionFn==='function' ? ms : null; if(actionLabel) ms=7000;
  let t=document.getElementById("_toast");
  if(!t){t=document.createElement("div");t.id="_toast";t.setAttribute("role","status");t.setAttribute("aria-live","polite");t.style.cssText="position:fixed;bottom:22px;right:22px;background:rgb(var(--panel-rgb) / .96);backdrop-filter:blur(16px);border:1px solid rgb(var(--ink-rgb) / .2);border-radius:12px;padding:11px 18px;font-size:13px;z-index:999;transform:translateY(60px);opacity:0;transition:all .25s;pointer-events:none;max-width:min(420px,90vw)";document.body.appendChild(t);void t.offsetWidth;}   /* første toast: registrer starttilstanden så den glir inn */
  t.textContent=String(msg||'').replace(/^(?:[\u{1F000}-\u{1FAFF}☀-➿⏩-⏺⬆⬇▶]️?\s*)+/u,'');
  t.style.pointerEvents=actionLabel?'auto':'none'; t.style.display='flex'; t.style.alignItems='center'; t.style.gap='10px';
  if(actionLabel){ const b=document.createElement('button'); b.type='button'; b.id='toastActionBtn'; b.className='toast-action'; b.textContent=actionLabel; b.onclick=()=>{ clearTimeout(_tt); t.classList.add('is-hiding'); t.style.transform='translateY(60px)'; t.style.opacity='0'; actionFn(); }; t.appendChild(b); } // ingen emojier i varsler
  t.classList.remove("is-hiding");t.style.transform="translateY(0)";t.style.opacity="1";   // (sto tidligere inne i kommentaren over → toastene var usynlige)
  clearTimeout(_tt);_tt=setTimeout(()=>{t.classList.add("is-hiding");t.style.transform="translateY(60px)";t.style.opacity="0";},ms||2500);
}

function makeMixtapeCover(file,cb){
  if(!file)return;
  const reader=new FileReader();
  reader.onload=ev=>{
    const img=new Image();
    img.onload=()=>{
      const w=900,h=255;
      const canvas=document.createElement("canvas");canvas.width=w;canvas.height=h;
      const ctx=canvas.getContext("2d");
      const ratio=Math.max(w/img.width,h/img.height);
      const dw=img.width*ratio,dh=img.height*ratio;
      ctx.drawImage(img,(w-dw)/2,(h-dh)/2,dw,dh);
      cb(canvas.toDataURL("image/jpeg",.82));
    };
    img.src=ev.target.result;
  };
  reader.readAsDataURL(file);
}

// ── MIXTAPE EVENTS ──
function openNewMixtapeModal(){
  document.getElementById("newMixtapeName").value="";
  const inp=document.getElementById("newMixtapeCoverInput");if(inp)inp.value="";
  const wrap=document.getElementById("newMixtapeCoverPreviewWrap");if(wrap)wrap.style.display="none";
  newMixtapeCoverBase64=null;
  document.getElementById("newMixtapeModal").classList.add("open");
}
document.getElementById("newMixtapeBtn").addEventListener("click",(e)=>{
  e.preventDefault();
  openNewMixtapeModal();
});
document.getElementById("newMixtapeCoverInput").addEventListener("change",e=>{
  const f=e.target.files[0];if(!f)return;
  makeMixtapeCover(f,data=>{
    newMixtapeCoverBase64=data;
    const prev=document.getElementById("newMixtapeCoverPreview");
    prev.src=data;
    document.getElementById("newMixtapeCoverPreviewWrap").style.display="flex";
  });
});
document.getElementById("saveNewMixtapeBtn").addEventListener("click",()=>{
  const name=document.getElementById("newMixtapeName").value.trim();
  if(!name){alert("Skriv inn et navn.");return;}
  const id=uid();
  state.mixtapes.unshift({id,name,beatIds:[],cover:newMixtapeCoverBase64||null,color:CASS_COLORS[Math.floor(Math.random()*CASS_COLORS.length)],createdAt:Date.now()});
  saveState();
  currentMixtapeId=null;
  renderMixtapes();
  applyRoleMode();
  closeModal("newMixtapeModal");
  showToast(`✓ "${name}" opprettet`);
});
document.getElementById("backToMixtapesBtn").addEventListener("click",()=>{currentMixtapeId=null;renderMixtapes();});

// ── UPLOAD / DROP helpers ──
async function createBeatFromFile(file){
  const beat = await createBeatFromFileIDB(file);
  if(beat){
    // Store who uploaded this beat
    beat.uploadedBy = sessionStorage.getItem('mv_username') || '';
    beat.uploadedById = window._mvCurrentUserId || sessionStorage.getItem('mv_user_id') || '';   // navnet slås opp fra ID-en ved visning
  }
  return beat;
}
// V13: a freshly added beat inherits the collection's cover IMMEDIATELY (no placeholder),
// and is marked as inherited so it keeps following the album/mixtape cover (archive.js sync).
function inheritCollectionCover(beat,col,type){
  if(!beat||!col||!col.cover)return;
  if(beat.cover&&String(beat.cover).trim())return;   // don't overwrite a real cover
  beat.cover=col.cover;
  beat.coverInherited=true;beat.coverInheritedFromType=type;beat.coverInheritedFromId=col.id;beat.coverInheritedFrom=type;
}
function addBeatToMixtape(beat){
  console.log('[MIX] addBeatToMixtape kalt. beat.id:', beat?.id, '| currentMixtapeId:', currentMixtapeId);
  if(!beat){console.error('[MIX] FEIL: beat er undefined!');return;}
  if(!state.beats.find(b=>b.id===beat.id))state.beats.push(beat);
  const mt=state.mixtapes.find(x=>x.id===currentMixtapeId);
  if(mt&&!mt.beatIds.includes(beat.id)){mt.beatIds.push(beat.id);console.log('[MIX] Beat lagt til mixtape:', mt.name);}
  else if(!mt){console.error('[MIX] FEIL: Ingen mixtape funnet for ID:', currentMixtapeId);}
  inheritCollectionCover(beat,mt,'mixtape');
  saveState();
}
function addBeatToAlbum(beat){
  if(!state.beats.find(b=>b.id===beat.id))state.beats.push(beat);
  const album=state.albums.find(x=>x.id===currentAlbumId);
  if(album&&!album.beatIds.includes(beat.id))album.beatIds.push(beat.id);
  inheritCollectionCover(beat,album,'album');
  saveState();
}

// ── R2 upload helper (called after beat is added to state) ──
async function uploadBeatToR2(beat, file) {
  console.log('[R2] uploadBeatToR2 kalt. beat.id:', beat?.id, '| r2Storage ready:', window.r2Storage?.ready());
  if (!window.r2Storage || !window.r2Storage.ready()) {
    console.warn('[R2] r2Storage ikke klar — R2_WORKER_URL satt?', window.R2_WORKER_URL);
    return;
  }
  try {
    // Compress large WAV/FLAC/AIFF files before upload
    if (window.audioCompress?.shouldCompress(file)) {
      file = await window.audioCompress.compress(file);
    }
    const sizeMB = (file.size / (1024*1024)).toFixed(1);
    showToast(`Laster opp ${sizeMB}MB til R2...`);
    const url = await window.r2Storage.upload(beat.id, file, !!beat.archived);
    console.log('[R2] Opplasting OK. URL:', url);
    beat.audio_url = url;
    beat.r2_key = beat.id;
    saveState();
    // Sync to Supabase automatically after R2 upload
    if (typeof window.pushToSupabase === 'function') {
      window.pushToSupabase();
    }
    showToast('✓ Lastet opp til R2 og synkronisert');
  } catch (e) {
    console.error('[R2] Opplasting feilet:', e);
    showToast('Kunne ikke lagre lydfilen i skyen. Den er lagret på denne enheten – prøv igjen når du er på nett.');
  }
}
async function handleMixtapeDrop(e){
  e.preventDefault();document.getElementById("mixtapeDrop").classList.remove("drag-over");
  const files=[...e.dataTransfer.files].filter(f=>f.type.startsWith("audio")||/\.(mp3|wav|flac|m4a|ogg|aac)$/i.test(f.name));
  if(!files.length){showToast("Ingen lydfiler funnet");return;}
  const added=[];for(const f of files){const b=await createBeatFromFile(f);addBeatToMixtape(b);uploadBeatToR2(b,f);added.push(b);}
  renderMixtapeDetail();mvUploadedToast(added);
}
async function handleAlbumDrop(e){
  e.preventDefault();document.getElementById("albumDrop").classList.remove("drag-over");
  const files=[...e.dataTransfer.files].filter(f=>f.type.startsWith("audio")||/\.(mp3|wav|flac|m4a|ogg|aac)$/i.test(f.name));
  if(!files.length){showToast("Ingen lydfiler funnet");return;}
  const added=[];for(const f of files){const b=await createBeatFromFile(f);addBeatToAlbum(b);uploadBeatToR2(b,f);added.push(b);}
  renderAlbumDetail();mvUploadedToast(added);
}
document.getElementById("mixtapeUploadInput").addEventListener("change",async e=>{
  if(!window.isAdminMode){showToast("Kun admin kan laste opp lydfiler");e.target.value="";return;}
  const files=[...e.target.files].filter(f=>f.type.startsWith("audio")||/\.(mp3|wav|flac|m4a|ogg|aac)$/i.test(f.name));
  const added=[];for(const f of files){const b=await createBeatFromFile(f);addBeatToMixtape(b);uploadBeatToR2(b,f);added.push(b);}
  renderMixtapeDetail();mvUploadedToast(added);
  e.target.value="";
});
document.getElementById("mixtapeCoverInput").addEventListener("change",e=>{
  const f=e.target.files[0];if(!f)return;
  const mt=state.mixtapes.find(x=>x.id===currentMixtapeId);if(!mt)return;
  makeMixtapeCover(f,data=>{
    mt.cover=data;
    if(!mt.color)mt.color=cassColor(mt,state.mixtapes.indexOf(mt));
    saveState();renderMixtapeDetail();renderMixtapes();showToast("✓ Kassettbildet er oppdatert");
  });
  e.target.value="";
});
document.getElementById("albumUploadInput").addEventListener("change",async e=>{
  if(!window.isAdminMode){showToast("Kun admin kan laste opp lydfiler");e.target.value="";return;}
  const files=[...e.target.files].filter(f=>f.type.startsWith("audio")||/\.(mp3|wav|flac|m4a|ogg|aac)$/i.test(f.name));
  const added=[];for(const f of files){const b=await createBeatFromFile(f);addBeatToAlbum(b);uploadBeatToR2(b,f);added.push(b);}
  renderAlbumDetail();mvUploadedToast(added);
  e.target.value="";
});
// Show drop zones when in detail views
function showDropZone(id){const el=document.getElementById(id);if(el)el.classList.add("active");}
document.getElementById("mixtapeSortSelect")?.addEventListener("change",e=>{
  mixtapeSortMode=e.target.value||"custom";
  renderMixtapeDetail();
});

function renderMixtapeAddBeatSearch(){
  const q=(document.getElementById("mixtapeBeatSearchInput")?.value||"").trim().toLowerCase();
  const filtered=mixtapeAddBeatCandidates.filter(b=>String(b.name||"").toLowerCase().includes(q)||String(b.source||"").toLowerCase().includes(q));
  document.getElementById("mixtapeBeatCheckList").innerHTML=filtered.length
    ?filtered.map(beatCheckItemMarkup).join("")
    :`<div class="hint">${mixtapeAddBeatCandidates.length?"Ingen beats matcher søket.":"Alle beats er allerede i denne mixtapen."}</div>`;
}

document.getElementById("addBeatsToMixtapeBtn").addEventListener("click",()=>{
  const mt=state.mixtapes.find(x=>x.id===currentMixtapeId);if(!mt)return;
  mixtapeAddBeatCandidates=state.beats.filter(b=>!b.archived&&!mt.beatIds.includes(b.id));   // arkiverte låter skal ikke foreslås
  const search=document.getElementById("mixtapeBeatSearchInput");
  if(search)search.value="";
  renderMixtapeAddBeatSearch();
  document.getElementById("addBeatsToMixtapeModal").classList.add("open");
  setTimeout(()=>document.getElementById("mixtapeBeatSearchInput")?.focus(),80);
});
document.getElementById("mixtapeBeatSearchInput")?.addEventListener("input",renderMixtapeAddBeatSearch);
document.getElementById("confirmAddBeatsToMixtapeBtn").addEventListener("click",()=>{
  const mt=state.mixtapes.find(x=>x.id===currentMixtapeId);if(!mt)return;
  const checked=[...document.querySelectorAll("#mixtapeBeatCheckList input:checked")];
  checked.forEach(cb=>{if(!mt.beatIds.includes(cb.value))mt.beatIds.push(cb.value);});
  saveState();renderMixtapeDetail();closeModal("addBeatsToMixtapeModal");showToast(`✓ ${checked.length} ${checked.length===1?"låt":"låter"} lagt til`);
});
document.getElementById("deleteMixtapeBtn").addEventListener("click",()=>{
  if(isProducerUser()){showToast("Produsentmodus: sletting er låst");return;}
  const mt=state.mixtapes.find(x=>x.id===currentMixtapeId);if(!mt)return;
  showDeleteConfirm(`Slette mixtapen "${mt.name}"?`,()=>{
    state.mixtapes=state.mixtapes.filter(x=>x.id!==currentMixtapeId);
    currentMixtapeId=null;saveState();renderMixtapes();showToast("Mixtape slettet");
  });
});
// (handled above)

// ── REMOVE old beat listeners that reference gone elements ──

let _deleteCallback=null;
// ── Rename modal ────────────────────────────────────────────────────────────
function showRenameModal(label, currentName, onSave) {
  let modal = document.getElementById('mvRenameModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'mvRenameModal';
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal-card modal-sm" style="max-width:380px">
        <div class="modal-hd">
          <div class="modal-hd-left"><h2 id="mvRenameTitle">Gi nytt navn</h2></div>
          <div class="modal-hd-right"><button class="close-btn" onclick="closeModal('mvRenameModal')" aria-label="Lukk">×</button></div>
        </div>
        <div class="modal-body" style="padding:22px 28px 28px;display:grid;gap:14px">
          <input id="mvRenameInput" class="text-input" style="font-size:15px;padding:10px 14px;background:rgb(var(--ink-rgb) / .06);border:1px solid rgb(var(--ink-rgb) / .12);border-radius:8px;color:var(--text);width:100%;box-sizing:border-box" />
          <button id="mvRenameSaveBtn" class="primary-btn" style="width:100%">Lagre</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) closeModal('mvRenameModal'); });
  }
  document.getElementById('mvRenameTitle').textContent = `Gi nytt navn — ${label}`;
  const inp = document.getElementById('mvRenameInput');
  inp.value = currentName;
  modal._onSave = onSave;
  const btn = document.getElementById('mvRenameSaveBtn');
  btn.onclick = () => {
    const val = inp.value.trim();
    if (!val) return;
    modal._onSave(val);
    closeModal('mvRenameModal');
  };
  inp.onkeydown = e => { if (e.key === 'Enter') btn.click(); if (e.key === 'Escape') closeModal('mvRenameModal'); };
  modal.classList.add('open');
  setTimeout(() => { inp.focus(); inp.select(); }, 80);
}

window.renameBeat = function(id) {
  const b = state.beats.find(x => x.id === id); if (!b) return;
  showRenameModal('låt', b.name, val => {
    b.name = val; saveState();
    if (typeof window.beatsTab?.renderBeatsTab === 'function') window.beatsTab.renderBeatsTab();
    renderAll(); showToast('✓ Navn oppdatert');
  });
};
window.renameMixtape = function(id) {
  const mt = state.mixtapes.find(x => x.id === id); if (!mt) return;
  showRenameModal('mixtape', mt.name, val => {
    mt.name = val; saveState(); renderMixtapes();
    if (id === currentMixtapeId) renderMixtapeDetail();
    showToast('✓ Navn oppdatert');
  });
};

// Bekreftelse i appens stil (i stedet for nettleserens confirm()). Brukes bare for handlinger som
// ikke kan angres; det som kan angres skjer med en gang og får «Angre» i meldingen nederst.
// mvConfirm({title, body, ok, danger}) → Promise<boolean>. Esc / Avbryt / klikk utenfor = nei.
window.mvConfirm=function(o){
  o=typeof o==='string'?{title:o}:(o||{});
  return new Promise(resolve=>{
    document.getElementById('mvConfirm')?.remove();
    const ret=document.activeElement, w=document.createElement('div');
    w.id='mvConfirm'; w.className='mv-confirm';
    w.innerHTML=`<div class="mv-confirm-card" role="alertdialog" aria-modal="true" aria-labelledby="mvConfirmT" aria-describedby="mvConfirmB">
      <h2 id="mvConfirmT">${esc(o.title||'Er du sikker?')}</h2>${o.body?`<p id="mvConfirmB">${esc(o.body)}</p>`:''}
      <div class="mv-confirm-btns"><button type="button" class="ghost-btn" data-v="0">${esc(o.cancel||'Avbryt')}</button><button type="button" class="primary-btn${o.danger?' mv-confirm-danger':''}" data-v="1">${esc(o.ok||'OK')}</button></div></div>`;
    const done=v=>{ w.remove(); removeEventListener('keydown',key,true); ret&&ret.focus&&ret.focus(); resolve(v); };
    const key=e=>{ if(e.key==='Escape'){ e.preventDefault(); e.stopPropagation(); done(false); }
      if(e.key==='Tab'){ const b=[...w.querySelectorAll('button')], i=b.indexOf(document.activeElement); e.preventDefault(); b[(i+(e.shiftKey?-1:1)+b.length)%b.length].focus(); } };
    w.addEventListener('click',e=>{ const b=e.target.closest('[data-v]'); if(b) done(b.dataset.v==='1'); else if(e.target===w) done(false); });
    addEventListener('keydown',key,true);
    document.body.appendChild(w);
    // Farlige valg: fokus på Avbryt, så Enter ikke sletter ved et uhell
    (o.danger?w.querySelector('[data-v="0"]'):w.querySelector('[data-v="1"]')).focus();
  });
};
function showDeleteConfirm(msg,cb){
  _deleteCallback=cb;
  document.getElementById('deleteConfirmTitle').textContent='Bekreft sletting';
  document.getElementById('deleteConfirmMsg').textContent=msg+' Denne handlingen kan ikke angres.';
  document.getElementById('deleteConfirmInput').value='';
  const btn=document.getElementById('deleteConfirmBtn');
  btn.disabled=true;btn.style.opacity='.5';
  document.getElementById('deleteConfirmModal').classList.add('open');
  setTimeout(()=>document.getElementById('deleteConfirmInput').focus(),100);
}
function executeDelete(){
  if(_deleteCallback){_deleteCallback();_deleteCallback=null;}
  closeModal('deleteConfirmModal');
}
document.getElementById('deleteConfirmInput').addEventListener('input',function(){
  const btn=document.getElementById('deleteConfirmBtn');
  const ok=this.value.toLowerCase()==='slett';
  btn.disabled=!ok;btn.style.opacity=ok?'1':'.5';
});
document.getElementById('deleteConfirmModal').addEventListener('click',e=>{if(e.target===e.currentTarget)closeModal('deleteConfirmModal');});

// ── Beat card expand/collapse animation ──────────────────────────────────────
(function injectExpandAnimation(){
  if(document.getElementById('mv-expand-anim')) return;
  const s = document.createElement('style');
  s.id = 'mv-expand-anim';
  s.textContent = `
    @keyframes mvExpandIn {
      from { opacity: 0; transform: translateY(-10px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    @keyframes mvCollapseOut {
      from { opacity: 1; transform: translateY(0); }
      to   { opacity: 0; transform: translateY(-8px); }
    }
    .album-beat-card.expanded .ab-expand {
      animation: mvExpandIn 0.28s cubic-bezier(0.22, 1, 0.36, 1) both;
    }
    .album-beat-card {
      transition: box-shadow 0.25s ease;
    }
  `;
  document.head.appendChild(s);
})();

renderAll();
// Add tab-visible class to initial active tab (no transition needed on first load)
// Ensure archive is NOT the default active tab at startup
requestAnimationFrame(()=>{
  const archiveBtn = document.querySelector('.tab-btn[data-tab="archive"]');
  const archiveTab = document.getElementById('archiveTab');
  // If archive is somehow active at startup, switch to mixtapes
  if(archiveBtn?.classList.contains('active') || (archiveTab && !archiveTab.classList.contains('hidden'))){
    if(archiveBtn) archiveBtn.classList.remove('active');
    if(archiveTab){ archiveTab.classList.add('hidden'); archiveTab.style.display=''; }
    document.body.classList.remove('final-archive-active','clean-archive-active');
    const mixtapesBtn = document.querySelector('.tab-btn[data-tab="mixtapes"]');
    const mixtapesTab = document.getElementById('mixtapesTab');
    if(mixtapesBtn) mixtapesBtn.classList.add('active');
    if(mixtapesTab){ mixtapesTab.classList.remove('hidden'); mixtapesTab.classList.add('tab-visible'); }
  } else {
    document.querySelectorAll('.tab-view:not(.hidden)').forEach(v=>v.classList.add('tab-visible'));
  }
});
