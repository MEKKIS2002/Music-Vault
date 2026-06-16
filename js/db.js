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
function openBeatAudio(beatId){
  const beat=state.beats.find(b=>b.id===beatId);
  const url=getBeatAudioUrl(beat);
  if(!url){showToast('Ingen ekstern lydlenke er koblet til denne beaten');return;}
  window.open(url,'_blank','noopener,noreferrer');
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


// ── Bottom player: one persistent Spotify-style player ──
const bottomPlayer={audio:new Audio(),queue:[],index:0,context:null,objectUrl:null,started:false};
bottomPlayer.audio.preload="auto";
bottomPlayer.audio.addEventListener("ended",()=>bottomNext(true));
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
bottomPlayer.audio.addEventListener("error",()=>{const b=bottomPlayer.queue[bottomPlayer.index];if(b)showToast(`Kunne ikke spille "${b.name}"`);bottomNext(true);});
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
  document.getElementById("bpPlayBtn").textContent=bottomPlayer.audio.paused?"▶":"⏸";
  document.getElementById("bpTitle").textContent=beat?beat.name:"Ingen sang valgt";
  const ctx=bottomPlayer.context?`${bottomPlayer.context.label||"Spiller"}${bottomPlayer.queue.length>1?` · ${bottomPlayer.index+1}/${bottomPlayer.queue.length}`:""}`:"Beat";
  document.getElementById("bpSub").textContent=beat?ctx:"Trykk play på en beat, et album eller en mixtape";
  const cover=document.getElementById("bpCover");
  if(beat&&beat.cover){
    cover.innerHTML=`<img src="${esc(beat.cover)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:inherit;">`;
    cover.style.background="none";
  } else {
    cover.innerHTML='<span style="font-size:22px;line-height:1">&#127925;</span>';
    cover.style.background="";
  }
  updateOpenCollectionControls();
}
function updateOpenCollectionControls(){
  const beat=bottomPlayer.queue[bottomPlayer.index];
  const playing=!!beat&&!bottomPlayer.audio.paused;
  const ctx=bottomPlayer.context||{};
  const update=(type,currentId,playBtnId,stopBtnId,nowId)=>{
    const isThis=playing&&ctx.type===type&&ctx.id===currentId;
    const btn=document.getElementById(playBtnId);
    if(btn)btn.textContent=isThis?`⏸ Spiller: ${beat.name}`:"▶ Spill fra start";
    const stop=document.getElementById(stopBtnId);
    if(stop)stop.classList.toggle("hidden",!isThis);
    const now=document.getElementById(nowId);
    if(now)now.textContent=isThis?`Nå spilles ${bottomPlayer.index+1}/${bottomPlayer.queue.length}: ${beat.name}`:"";
  };
  update("album",currentAlbumId,"playAlbumBtn","stopAlbumBtn","albumNowPlaying");
  update("mixtape",currentMixtapeId,"playMixtapeBtn","stopMixtapeBtn","mixtapeNowPlaying");
}
function updateBottomProgress(){
  const a=bottomPlayer.audio;
  const dur=isFinite(a.duration)?a.duration:0;
  document.getElementById("bpCurrent").textContent=fmtTime(a.currentTime);
  document.getElementById("bpDuration").textContent=fmtTime(dur);
  const seek=document.getElementById("bpSeek");
  if(seek&&!seek.matches(":active"))seek.value=dur?Math.round((a.currentTime/dur)*1000):0;
}
function bottomSeek(v){const a=bottomPlayer.audio;if(isFinite(a.duration)&&a.duration>0)a.currentTime=(Number(v)/1000)*a.duration;}
function bottomSetVolume(v){bottomPlayer.audio.volume=Number(v);}
async function playBottomIndex(i){
  if(i<0)i=0;
  if(i>=bottomPlayer.queue.length){bottomStop(true);showToast("✓ Ferdigspilt");return;}
  bottomPlayer.index=i;bottomPlayer.started=true;
  const beat=bottomPlayer.queue[i];
  const url=await getPlayableAudioUrl(beat);
  if(!url){showToast(`Hopper over "${beat.name}" – mangler lydfil`);return playBottomIndex(i+1);}
  if(bottomPlayer.objectUrl)URL.revokeObjectURL(bottomPlayer.objectUrl);
  bottomPlayer.objectUrl=url.startsWith("blob:")?url:null;
  bottomPlayer.audio.pause();
  bottomPlayer.audio.src=url;
  bottomPlayer.audio.load();
  updateBottomUI();
  try{await bottomPlayer.audio.play();}
  catch(e){
    console.error('Audio play failed:',e,url,beat);
    showToast('Kunne ikke spille av. Prøv «Åpne lydfil» eller sjekk audio_url.');
  }
  updateBottomUI();
}
async function playQueue(queue,context){
  if(!queue.length){showToast("Ingen sanger å spille");return;}
  bottomPlayer.queue=queue;bottomPlayer.index=0;bottomPlayer.context=context||null;
  await playBottomIndex(0);
}
async function playSingleBeat(beatId){const beat=state.beats.find(b=>b.id===beatId);if(!beat)return;await playQueue([beat],{type:"beat",id:beatId,label:"Beat"});}
function bottomTogglePlay(){if(!bottomPlayer.audio.src&&bottomPlayer.queue.length){playBottomIndex(bottomPlayer.index);return;}if(bottomPlayer.audio.paused){bottomPlayer.audio.play().catch(()=>showToast("Trykk Play igjen hvis nettleseren blokkerte avspilling"));}else bottomPlayer.audio.pause();updateBottomUI();}
function bottomNext(auto=false){if(bottomPlayer.index+1<bottomPlayer.queue.length)playBottomIndex(bottomPlayer.index+1);else if(auto)bottomStop(true);}
function bottomPrev(){if(bottomPlayer.audio.currentTime>3){bottomPlayer.audio.currentTime=0;return;}playBottomIndex(Math.max(0,bottomPlayer.index-1));}
function bottomStop(silent=false){bottomPlayer.audio.pause();bottomPlayer.audio.removeAttribute("src");bottomPlayer.audio.load();if(bottomPlayer.objectUrl)URL.revokeObjectURL(bottomPlayer.objectUrl);bottomPlayer.objectUrl=null;bottomPlayer.queue=[];bottomPlayer.index=0;bottomPlayer.context=null;bottomPlayer.started=false;updateBottomUI();if(!silent)showToast("⏹ Avspilling stoppet");}
function stopCollectionPlayback(silent=false){bottomStop(silent);}
async function playAlbumFromStart(albumId){const album=state.albums.find(a=>a.id===albumId);if(!album)return;const queue=beatsFromIds(album.beatIds);if(!queue.length){showToast("Albumet har ingen sanger ennå");return;}await playQueue(queue,{type:"album",id:albumId,label:album.name});}
async function playMixtapeFromStart(mixtapeId){const mt=state.mixtapes.find(m=>m.id===mixtapeId);if(!mt)return;const queue=beatsFromIds(mt.beatIds);if(!queue.length){showToast("Mixtapen har ingen sanger ennå");return;}await playQueue(queue,{type:"mixtape",id:mixtapeId,label:mt.name});}
document.addEventListener("play",e=>{
  const el=e.target;
  if(el&&el.tagName==="AUDIO"&&el.id&&el.id.startsWith("au-")){
    const beatId=el.id.slice(3);
    el.pause();
    playSingleBeat(beatId);
  }
},true);

async function uploadBeatAudio(beatId,file){
  if(!file||!file.type.startsWith("audio"))return;
  const b=state.beats.find(x=>x.id===beatId);if(!b)return;
  await audioDB.save(beatId,file);
  b.url=beatId+":idb"; // sentinel so we know audio exists
  b.source="local";
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
  showToast("✓ Lydfil lastet opp");
}

// When creating beats from file upload, also store in IDB
async function createBeatFromFileIDB(file){
  const b={id:uid(),name:file.name.replace(/\.[^/.]+$/,""),url:"",source:"local",favorite:false,lyrics:"",rating:0,cover:"",done:0,createdAt:Date.now()};
  await audioDB.save(b.id,file);
  b.url=b.id+":idb";
  return b;
}

const STAGES=["Idé","Hook","Vers","Innspilt","Mix","Master","Klar"];
const SK="musicVault.v4";
const state=loadState();
window.state = state; // eksponér globalt for audio-compress.js og andre
let currentAlbumId=null;
let modalRating=0;
let newAlbumCoverBase64=null;

function uid(){return crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random().toString(36).slice(2)}`;}
function clamp(v){return Math.max(0,Math.min(100,Number(v||0)));}
function esc(v){return String(v||"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");}
function convertDrive(url){const m=url.match(/\/d\/([^/?#]+)/);return m?`https://drive.google.com/uc?export=download&id=${m[1]}`:url;}

function stripHTML(v){const d=document.createElement("div");d.innerHTML=String(v||"");return d.textContent||d.innerText||"";}
function lyricHTML(v){const str=String(v||"");return /<\/?[a-z][\s\S]*>/i.test(str)?str:esc(str).replace(/\n/g,"<br>");}
function colorToolbar(editorId){
  const colors=["#fde047","#fb7185","#60a5fa","#34d399","#c084fc","#fb923c"];
  return `<div class="color-toolbar" onmousedown="event.preventDefault()"><span>Marker</span>${colors.map(c=>`<button type="button" class="color-chip" style="--chip:${c}" title="Marker med farge" onclick="applyLyricColor('${editorId}','${c}')"></button>`).join("")}<button type="button" class="color-clear" onclick="clearLyricColor('${editorId}')">Fjern farge</button></div>`;
}
function applyLyricColor(editorId,color){const ed=document.getElementById(editorId);if(!ed)return;ed.focus();document.execCommand("styleWithCSS",false,true);document.execCommand("hiliteColor",false,color);const id=ed.dataset.beatId;if(id)autosaveLyrics(id,ed.innerHTML);}
function clearLyricColor(editorId){const ed=document.getElementById(editorId);if(!ed)return;ed.focus();document.execCommand("removeFormat",false,null);const id=ed.dataset.beatId;if(id)autosaveLyrics(id,ed.innerHTML);}
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

function phCover(t){const s=encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><rect width="600" height="400" fill="#11111a"/><circle cx="100" cy="80" r="160" fill="#a855f7" opacity=".3"/><circle cx="530" cy="340" r="190" fill="#22d3ee" opacity=".2"/><text x="40" y="230" fill="white" font-family="Arial" font-size="38" font-weight="800">${String(t).slice(0,20).replace(/[<>&"]/g,"")}</text></svg>`);return`data:image/svg+xml,${s}`;}

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
function saveState(){try{localStorage.setItem(getUserSK(),JSON.stringify(state));}catch(e){console.warn('saveState failed:',e);}markDirty();renderStats();if(typeof window.mvSupabaseSync?.schedulePush==='function')window.mvSupabaseSync.schedulePush();}
function isAdmin(){return sessionStorage.getItem('mv_role')==='admin';}

function setupSel(el,opts){el.innerHTML=opts;}
function setupRating(el){el.innerHTML=Array.from({length:10},(_,i)=>`<option value="${i+1}">${i+1} stjerne${i===0?"":"r"}`).join("");}
function setupStage(el){el.innerHTML=STAGES.map(s=>`<option value="${s}">${s}`).join("");}


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

function renderDashboard(){
  const username=sessionStorage.getItem('mv_username')||'deg';
  const h=new Date().getHours();
  const greet=h<10?'God morgen':h<17?'God dag':h<22?'God kveld':'God natt';
  const gEl=document.getElementById('dashGreeting');
  const sEl=document.getElementById('dashSub');
  if(gEl) gEl.textContent=greet+', '+username+' \uD83D\uDC4B';
  const beats=(state.beats||[]).filter(b=>!b.archived);
  const albums=(state.albums||[]).filter(a=>!a.archived);
  const mixtapes=(state.mixtapes||[]).filter(m=>!m.archived);
  const noAudio=beats.filter(b=>!(b.audio_url||b.url));
  const allDemos=albums.flatMap(a=>(a.beatIds||[]).map(id=>beats.find(b=>b.id===id)).filter(Boolean));
  const avgDone=allDemos.length?Math.round(allDemos.reduce((s,b)=>s+Number(b.done||0),0)/allDemos.length):0;
  if(sEl){
    sEl.innerHTML=`<div id="dashSubPills" style="display:flex;gap:6px;flex-wrap:wrap;margin-top:4px">`+
      `<span class="ds-pill">${beats.length} beats</span>`+
      `<span class="ds-pill ds-accent">${albums.length} albumer</span>`+
      `<span class="ds-pill ds-accent">${mixtapes.length} mixtapes</span>`+
      (noAudio.length?`<span class="ds-pill ds-warn" title="${noAudio.slice(0,3).map(b=>b.name).join(', ')}">${noAudio.length} uten lyd</span>`:'')+
      `<span class="ds-pill">${avgDone}% snitt ferdig</span></div>`;
  }
  const saEl=document.getElementById('dashSmartAlerts');
  if(saEl){
    const alerts=[];const now=Date.now(),DAY=86400000;
    const inAlbum=new Set(albums.flatMap(a=>a.beatIds||[]));
    const doneNotIn=beats.filter(b=>Number(b.done||0)>=100&&!inAlbum.has(b.id));
    if(doneNotIn.length) alerts.push({type:'info',icon:'\u2728',msg:`${doneNotIn.length} sang${doneNotIn.length>1?'er er':'en er'} 100% ferdig men ikke i noe album`,detail:doneNotIn.slice(0,2).map(b=>esc(b.name)).join(', ')+(doneNotIn.length>2?' ...':''),tab:'albums'});
    albums.forEach(a=>{const lu=a.updatedAt||a.createdAt||0;if(lu&&now-lu>14*DAY)alerts.push({type:'warn',icon:'\u23F0',msg:`\u00ab${esc(a.name)}\u00bb ikke oppdatert p\u00e5 ${Math.floor((now-lu)/DAY)} dager`,detail:'',tab:'albums'});});
    if(noAudio.length) alerts.push({type:'warn',icon:'\uD83D\uDD07',msg:`${noAudio.length} sang${noAudio.length>1?'er mangler':'en mangler'} lydfil`,detail:noAudio.slice(0,2).map(b=>esc(b.name)).join(', ')+(noAudio.length>2?' ...':''),tab:'beats'});
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
      const col=pct>=70?'#34d399':pct>=35?'#f97316':'#fb7185';
      const count=pB.length;
      const cover=p.cover?`<img src="${esc(p.cover)}" alt="" style="width:100%;height:100%;object-fit:cover">`:`<span style="font-size:28px">${isAlbum?'\uD83C\uDFB5':'\uD83C\uDFBC'}</span>`;
      return `<div class="dash-proj-card" onclick="dashOpenProject('${esc(p.id)}','${p._type}')"><div class="dash-proj-cover">${cover}<div class="dash-proj-prog-bar"><div style="width:${pct}%;background:${col};height:100%;border-radius:2px"></div></div></div><div class="dash-proj-footer"><div class="dash-proj-name">${esc(p.name)}</div><div class="dash-proj-meta">${count} sang${count===1?'':'er'} &middot; <span style="color:${col};font-weight:700">${pct}%</span></div></div></div>`;
    }).join('');}
  }
  const lastEl=document.getElementById('dashLastBeat');
  if(lastEl){
    const lastId=sessionStorage.getItem('mv_last_beat');
    const b=lastId?beats.find(x=>x.id===lastId):null;
    const recent=b||beats.slice().sort((a,b2)=>(b2.createdAt||b2.id||0)-(a.createdAt||a.id||0))[0];
    if(recent){
      const cover=recent.cover?`<img src="${esc(recent.cover)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:10px">`:'<span style="font-size:36px">\uD83C\uDFB5</span>';
      const dur=recent.duration?Math.floor(recent.duration/60)+':'+String(Math.floor(recent.duration%60)).padStart(2,'0'):'';
      lastEl.innerHTML=`<div class="last-beat-cover">${cover}</div><div class="last-beat-info"><div class="last-beat-label">Fortsett der du slapp</div><div class="last-beat-name">${esc(recent.name)}</div>${dur?`<div class="last-beat-dur">${dur}</div>`:''}</div><div class="last-beat-actions"><button class="last-beat-play" onclick="event.stopPropagation();playSingleBeat('${recent.id}');sessionStorage.setItem('mv_last_beat','${recent.id}')">&#9654; Spill</button><button class="last-beat-lab" onclick="event.stopPropagation();openInLyricLab('${recent.id}')">&#9998; Lab</button></div>`;
    } else {lastEl.innerHTML='<div class="dash-empty">Ingen sanger enn\u00e5.</div>';}
  }
  const actEl=document.getElementById('dashActivity');
  const streakEl=document.getElementById('dashStreak');
  if(actEl){
    const today=new Date();today.setHours(0,0,0,0);
    const activeDays=new Set();
    beats.forEach(b=>{const ts=b.updatedAt||b.createdAt;if(ts){const d=new Date(ts);d.setHours(0,0,0,0);activeDays.add(d.getTime());}});
    albums.forEach(a=>{const ts=a.updatedAt||a.createdAt;if(ts){const d=new Date(ts);d.setHours(0,0,0,0);activeDays.add(d.getTime());}});
    mixtapes.forEach(m=>{const ts=m.updatedAt||m.createdAt;if(ts){const d=new Date(ts);d.setHours(0,0,0,0);activeDays.add(d.getTime());}});
    const dayNames=['\u00d8','M','T','O','T','F','L'];
    actEl.innerHTML=Array.from({length:7},(_,i)=>{
      const d=new Date(today);d.setDate(d.getDate()-(6-i));
      const on=activeDays.has(d.getTime()),isToday=i===6;
      return `<div class="act-col"><div class="act-bar${on?' on':''}${isToday?' today':''}"></div><div class="act-day-lbl">${dayNames[d.getDay()]}</div></div>`;
    }).join('');
    let streak=0,cur=new Date(today);
    while(activeDays.has(cur.getTime())){streak++;cur=new Date(cur);cur.setDate(cur.getDate()-1);}
    if(streakEl) streakEl.innerHTML=streak>0?`<span class="streak-num">${streak}</span><span class="streak-txt">dag${streak===1?'':'er'} p\u00e5 rad</span>`:'<span class="streak-txt" style="color:rgba(255,255,255,.25)">Ingen aktivitet registrert enn\u00e5</span>';
  }
  const recent2=beats.slice().sort((a,b)=>(b.createdAt||b.id||0)-(a.createdAt||a.id||0)).slice(0,4);
  const bEl=document.getElementById('dashBeats');
  if(bEl){
    if(!recent2.length){bEl.innerHTML='<div class="dash-empty">Ingen sanger enn\u00e5.</div>';}
    else{bEl.innerHTML=recent2.map(b=>{
      const cover=b.cover?`<img src="${esc(b.cover)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:8px">`:`<span style="font-size:20px">\uD83C\uDFB5</span>`;
      const dur=b.duration?Math.floor(b.duration/60)+':'+String(Math.floor(b.duration%60)).padStart(2,'0'):'';
      return `<div class="dash-beat-card"><div class="dash-beat-top"><div class="dash-beat-thumb">${cover}</div><div class="dash-beat-info"><div class="dash-beat-name" title="${esc(b.name)}">${esc(b.name)}</div><div class="dash-beat-dur">${dur||'\u2014'}</div></div></div><div class="dash-beat-btns"><button class="dash-btn-play" onclick="event.stopPropagation();playSingleBeat('${b.id}');sessionStorage.setItem('mv_last_beat','${b.id}')">&#9654; Spill</button><button class="dash-btn-lab" onclick="event.stopPropagation();openInLyricLab('${b.id}')">&#9998; Lab</button></div></div>`;
    }).join('');}
  }
  const progEl=document.getElementById('dashProgress');
  if(progEl){
    if(!albums.length){progEl.innerHTML='<div class="dash-empty">Ingen albumer enn\u00e5.</div>';}
    else{progEl.innerHTML=albums.slice(0,4).map(a=>{
      const ab=(a.beatIds||[]).map(id=>beats.find(b=>b.id===id)).filter(Boolean);
      const pct=ab.length?Math.round(ab.reduce((s,b)=>s+Number(b.done||0),0)/ab.length):0;
      const col=pct>=70?'#34d399':pct>=35?'#f97316':'#fb7185';
      return `<div class="prog-row"><div class="prog-top"><div class="prog-name">${esc(a.name)}</div><div class="prog-pct" style="color:${col}">${pct}%</div></div><div class="prog-track"><div class="prog-fill" style="width:${pct}%;background:${col}"></div></div></div>`;
    }).join('');}
  }
}
window.dashOpenProject=function(id,type){if(type==='album'){document.querySelector('.tab-btn[data-tab="albums"]')?.click();setTimeout(()=>{if(typeof openAlbum==='function')openAlbum(id);setTimeout(()=>document.getElementById('albumDetailView')?.scrollIntoView({behavior:'smooth',block:'start'}),120);},80);}else{document.querySelector('.tab-btn[data-tab="mixtapes"]')?.click();setTimeout(()=>{if(typeof openMixtape==='function')openMixtape(id);setTimeout(()=>document.getElementById('mixtapeDetailView')?.scrollIntoView({behavior:'smooth',block:'start'}),120);},80);}};
window.dashNewAlbum=function(){document.querySelector('.tab-btn[data-tab="albums"]')?.click();setTimeout(()=>document.getElementById('newAlbumBtn')?.click(),80);};
window.dashNewMixtape=function(){document.querySelector('.tab-btn[data-tab="mixtapes"]')?.click();setTimeout(()=>document.getElementById('newMixtapeBtn')?.click(),80);};
window.dashOpenLyricLab=function(){document.querySelector('.tab-btn[data-tab="lyriclab"]')?.click();};
window.dashUploadTrigger=function(){document.getElementById('dashUploadInput')?.click();};
window.dashUpload=async function(files){if(!files||!files.length)return;for(const file of files){if(typeof createBeatFromFileIDB==='function')await createBeatFromFileIDB(file);}renderDashboard();showToast('\u2713 '+files.length+' sang'+(files.length>1?'er':'')+' lastet opp');};


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
        <div class="icon-pill">🎵</div>
        <div class="beat-meta">
          <strong>${esc(b.name)}</strong>
          <span>${b.lyrics?.trim()?"✏️ Tekst lagret":"Ingen tekst"} · ${esc(b.source||"URL")}</span>
        </div>
        <button class="star-btn${b.favorite?" active":""}" data-fav-id="${b.id}" onclick="event.stopPropagation();toggleFav('${b.id}',this)" title="Favoritt">★</button>
        <span class="expand-arrow">▾</span>
      </div>
      <div class="beat-expand">
        <div id="au-wrap-${b.id}" style="margin-bottom:12px">
          <button class="primary-btn" onclick="playSingleBeat('${b.id}')">▶ Spill denne</button>
        </div>
        <div style="margin-bottom:12px">
          <label class="ghost-btn" style="cursor:pointer;font-size:12px;display:inline-flex;align-items:center;gap:6px;padding:6px 12px">🎵 Last opp / bytt lydfil<input type="file" accept="audio/*" hidden onchange="uploadBeatAudio('${b.id}',this.files[0])"></label>
        </div>
        <div class="ab-lyric-editor">
          ${lyricsEditorMarkup(b.id,"Skriv hook, vers, tekst, ideer, flows...")}
        </div>
        <div class="beat-expand-actions">
          <button class="ghost-btn" onclick="openInLyricLab('${b.id}')">✍️ Åpne i Lyric Lab</button>
          ${albumMode
  ? `<button class="small-btn danger" onclick="removeFromCollection('${b.id}','${listMode}')">Fjern fra ${listMode==="mixtape"?"mixtape":"album"}</button>
     ${isAdmin()?`<button class="small-btn danger" onclick="deleteBeat('${b.id}')">Slett sang</button>`:''}`
  : isAdmin()?`<button class="small-btn danger" onclick="deleteBeat('${b.id}')">Slett sang</button>`:''}
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
const _lt={};
function autosaveLyrics(id,val){clearTimeout(_lt[id]);_lt[id]=setTimeout(()=>{const b=state.beats.find(x=>x.id===id);if(b){b.lyrics=val;saveState();}},800);}
function saveBeatLyrics(id){
  const ed=document.querySelector(`#bi-${id} .rich-lyrics-editor`)||document.getElementById(`lyrics-${id}`);
  const ta=document.querySelector(`#bi-${id} .beat-expand textarea`);
  const b=state.beats.find(x=>x.id===id);
  if(b&&(ed||ta)){b.lyrics=ed?ed.innerHTML:ta.value;saveState();showToast("✓ Tekst lagret");}
}
function copyBeatLyrics(id){const b=state.beats.find(x=>x.id===id);if(b)navigator.clipboard.writeText(stripHTML(b.lyrics||"")).then(()=>showToast("✓ Tekst kopiert"));}
function toggleFav(id,btn){
  const b=state.beats.find(x=>x.id===id);if(!b)return;
  b.favorite=!b.favorite;saveState();
  document.querySelectorAll(`[data-fav-id="${id}"]`).forEach(el=>el.classList.toggle("active",!!b.favorite));
  if(btn)btn.classList.toggle("active",!!b.favorite);
  renderStats();
  showToast(b.favorite?"★ Lagt til som favoritt":"☆ Fjernet fra favoritter");
}
async function deleteBeat(id){
  if(!window.isAdminMode){showToast("⚠ Kun admin kan slette sanger");return;}
  if(!confirm("Slette denne sangen permanent? Den fjernes fra R2 og Supabase."))return;
  const beat = state.beats.find(b=>b.id===id);
  state.beats=state.beats.filter(b=>b.id!==id);
  state.albums.forEach(a=>{a.beatIds=a.beatIds.filter(x=>x!==id);});
  state.mixtapes.forEach(m=>{m.beatIds=m.beatIds.filter(x=>x!==id);});
  saveState();
  renderAll();
  showToast("🗑 Sang slettet");
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
      :`<div class="record-sleeve"><div class="record-sleeve-ph">🎵</div></div>`;
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
          <span style="font-size:11px;color:rgba(255,255,255,.45)">${n} sang${n===1?'':'er'}</span>
          ${(()=>{const totalSec=(a.beatIds||[]).reduce((s,id)=>{const b=state.beats.find(x=>x.id===id);return s+(b&&!b.archived?Number(b.duration||0):0);},0);const m=Math.floor(totalSec/60),sec=Math.floor(totalSec%60);return totalSec>0?`<span style="font-size:11px;color:rgba(255,255,255,.3)">•</span><span style="font-size:11px;color:rgba(255,255,255,.35)">${m}:${String(sec).padStart(2,'0')}</span>`:'';})()}
          ${(()=>{const STATUS_COLORS={'Idé':'rgba(168,85,247,.6)','Skriving':'rgba(96,165,250,.6)','Innspilling':'rgba(249,115,22,.7)','Mixing':'rgba(244,164,67,.7)','Ferdig':'rgba(52,211,153,.7)'};const s=a.status||'Idé';const c=STATUS_COLORS[s]||'rgba(255,255,255,.3)';return`<span style="font-size:10px;font-weight:800;padding:2px 8px;border-radius:999px;background:${c.replace('.6','.15').replace('.7','.15')};color:${c};border:1px solid ${c.replace('.6','.3').replace('.7','.3')}">${s}</span>`;})()}
        </div>
      </div>
      <button class="small-btn" style="margin-top:8px;padding:7px 12px" onclick="event.stopPropagation();playAlbumFromStart('${a.id}')">▶ Spill</button>
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

function openAlbum(id){currentAlbumId=id;renderAlbumDetail();setTimeout(()=>showDropZone("albumDrop"),50);}

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
    :`<div class="detail-sleeve"><div class="record-sleeve-ph">🎵</div></div>`;
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
      <button class="primary-btn" id="playAlbumBtn" onclick="playAlbumFromStart('${album.id}')">▶ Spill fra start</button>
      <button class="small-btn danger hidden" id="stopAlbumBtn" onclick="stopCollectionPlayback()">⏹ Stopp</button>
    </div>`;
  const beats=beatsFromIds(album.beatIds);
  renderAlbumBeats(beats);
  updateCollectionPlayerUI();
  updateArchiveToolbarButtons?.();
  if(typeof renderCollectionComments==='function')renderCollectionComments('album',currentAlbumId);
}

let collectionDrag={beatId:null,mode:null};
function activeCollectionForMode(mode){
  if(mode==="mixtape")return state.mixtapes.find(m=>m.id===currentMixtapeId)||null;
  return state.albums.find(a=>a.id===currentAlbumId)||null;
}
function startCollectionDrag(event,beatId,mode){
  if(!event.target.closest(".ab-cover-wrap")){event.preventDefault();return;}
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
  if(card){card.dataset.dropAfter=isDropAfter(event,card)?"1":"0";card.classList.add("drag-over");}
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
function renderAlbumBeats(beats,mode,customEl){
  const listMode=mode||"album";
  const el=customEl||document.getElementById("albumBeatList");
  // View class set by applyView() in track-cards.js — don't hardcode here
  if(!beats||!beats.length){el.innerHTML=`<div class="empty">Ingen beats i dette ${listMode==="mixtape"?"mixtapen":"albumet"} ennå. Klikk "+ Legg til beats".</div>`;return;}
  const canDrag=!isProducerUser()&&(listMode!=="mixtape"||mixtapeSortMode==="custom");
  const hint=canDrag?`<div class="reorder-hint" style="grid-column:1/-1"><span>↕</span><span>Dra sangene for å endre rekkefølge.</span></div>`:(listMode==="mixtape"&&mixtapeSortMode!=="custom"?`<div class="reorder-hint" style="grid-column:1/-1"><span>↕</span><span>Sortert visning. Velg «Egen rekkefølge» for å dra sangene.</span></div>`:"");
  el.innerHTML=hint+beats.map((b,idx)=>{
    const coverHtml=b.cover
      ?`<img class="ab-cover" src="${esc(b.cover)}" alt="${esc(b.name)}" draggable="false">`
      :`<div class="ab-cover-ph" draggable="false" style="user-select:none;-webkit-user-select:none">&#127925;</div>`;
    if(isProducerUser()&&listMode==="mixtape"){
      return`<div${songBorderAttrs(b.id,listMode)} id="abi-${b.id}" data-beat-id="${b.id}">
        <div class="ab-top">
          <div class="ab-cover-wrap" onclick="toggleAlbumBeat('${b.id}')">${coverHtml}</div>
          <div class="ab-body">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
              <span style="font-size:11px;color:rgba(255,255,255,.25);font-variant-numeric:tabular-nums;font-weight:700;flex-shrink:0">${String(idx+1).padStart(2,'0')}</span>
              <div class="ab-title" style="min-width:0">${esc(b.name)}</div>
            </div>
            <div class="hint" style="margin-top:6px">${esc(b.source||"Opplastet beat")}${b.uploadedBy?` · <span style="color:var(--mv-amber,#ff8a1f);font-size:11px">👤 ${esc(b.uploadedBy)}</span>`:''}</div>
          </div>
        </div>
        <div class="ab-expand">
          <div class="ab-expand-left">
            <div id="au-wrap-${b.id}" style="margin-bottom:12px">
              <button class="primary-btn" onclick="playSingleBeat('${b.id}')">▶ Spill denne</button>
            </div>
          </div>
        </div>
      </div>`;
    }
    const stars=Array.from({length:10},(_,i)=>`<button class="${i<(b.rating||0)?"on":""}" onclick="setAlbumBeatRating('${b.id}',${i+1})">★</button>`).join("");
    const dragAttrs=canDrag?`draggable="true" ondragstart="startCollectionDrag(event,'${b.id}','${listMode}')" ondragend="endCollectionDrag()" ondragover="dragBeatOver(event,'${b.id}')" ondragleave="dragBeatLeave(event,'${b.id}')" ondrop="dropCollectionBeat(event,'${b.id}','${listMode}')"`:"";
    return`<div${songBorderAttrs(b.id,listMode)} id="abi-${b.id}" data-beat-id="${b.id}" ${dragAttrs} style="user-select:none;-webkit-user-select:none">
      <div class="ab-top">
        <div class="ab-cover-wrap" onclick="toggleAlbumBeat('${b.id}')">
          ${coverHtml}
        </div>
        <div class="ab-body">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
            <div style="display:flex;align-items:center;gap:8px;min-width:0;flex:1">
              <span style="font-size:11px;color:rgba(255,255,255,.25);font-variant-numeric:tabular-nums;font-weight:700;flex-shrink:0">${String(idx+1).padStart(2,'0')}</span>
              <div class="ab-title" id="abt-${b.id}" style="min-width:0;flex:1">${esc(b.name)}</div>
              ${b.uploadedBy?`<span style="font-size:10px;font-weight:700;letter-spacing:.06em;color:var(--mv-amber,#ff8a1f);opacity:.8;white-space:nowrap">👤 ${esc(b.uploadedBy)}</span>`:''}
            </div>
            <div style="display:flex;align-items:center;gap:3px;flex-shrink:0">
              ${(()=>{ const noAudio=!(b.audio_url||b.url); if(noAudio) return '<span title="Mangler lydfil" style="width:6px;height:6px;border-radius:50%;background:#fb7185;display:block;margin-right:2px"></span>'; return ''; })()}
              <button onclick="event.stopPropagation();playSingleBeat('${b.id}');sessionStorage.setItem('mv_last_beat','${b.id}')" title="Spill sang" style="width:28px;height:28px;border-radius:50%;background:rgba(244,164,67,.18);border:1px solid rgba(244,164,67,.4);color:#f4a443;font-size:10px;display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;padding:0">&#9654;</button>
              <button class="ab-rename-btn" onclick="event.stopPropagation();renameBeatInline('${b.id}')" title="Gi nytt navn" style="width:24px;height:24px;background:none;border:none;color:rgba(255,255,255,.4);font-size:14px;cursor:pointer;flex-shrink:0;padding:0;opacity:0;transition:opacity .15s;border-radius:4px;display:flex;align-items:center;justify-content:center">&#9998;</button>
              <button class="ab-remove-btn" onclick="event.stopPropagation();removeFromCollection('${b.id}','${listMode}')" title="Fjern" style="width:24px;height:24px;background:none;border:none;color:rgba(251,113,133,.4);font-size:13px;font-weight:900;cursor:pointer;flex-shrink:0;padding:0;opacity:0;transition:opacity .15s;border-radius:4px;display:flex;align-items:center;justify-content:center">&#215;</button>
              <button class="star-btn${b.favorite?" active":""}" data-fav-id="${b.id}" onclick="event.stopPropagation();toggleFav('${b.id}',this)" style="width:24px;height:24px;font-size:18px;padding:0;flex-shrink:0;background:none;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center">&#9733;</button>
            </div>
          </div>
          <div class="ab-stars" onclick="event.stopPropagation()">${stars}</div>
          ${listMode==="album"?`<div class="progress-wrap" onclick="event.stopPropagation()">
            <div class="progress-label"><span>Ferdig</span><strong id="abidone-${b.id}">${b.done||0}%</strong></div>
            <div class="progress-bar"><div id="abibar-${b.id}" style="width:${b.done||0}%"></div></div>
            <input type="range" min="0" max="100" value="${b.done||0}" style="padding:0;border:none;background:transparent;accent-color:var(--accent);cursor:pointer;width:100%;margin-top:4px" oninput="setAlbumBeatDone('${b.id}',this.value)">
          </div>`:""}
        </div>
      </div>
      <div class="ab-expand">
        <div class="ab-expand-top-bar">
          <div id="au-wrap-${b.id}" style="display:flex;align-items:center;gap:8px;width:100%">
            <button class="primary-btn" style="font-size:12px;padding:7px 14px" onclick="playSingleBeat('${b.id}')">▶ Spill</button>
            <button class="star-btn${b.favorite?" active":""}" data-fav-id="${b.id}" onclick="event.stopPropagation();toggleFav('${b.id}',this)" title="Favoritt" style="font-size:20px;background:none;border:none;cursor:pointer;padding:0;color:${b.favorite?'#f4a443':'rgba(255,255,255,.25)'}">★</button>
            <div style="margin-left:auto">${(()=>{ const noAudio=!(b.audio_url||b.url); const noLyric=!(b.lyrics||(b.lyricSections||[]).some(s=>s.text?.trim())); if(noAudio) return '<span title="Mangler lydfil" style="font-size:10px;font-weight:800;padding:2px 7px;border-radius:999px;background:rgba(251,113,133,.15);color:#fb7185;border:1px solid rgba(251,113,133,.3)">Ingen lyd</span>'; if(noLyric) return '<span title="Mangler tekst" style="font-size:10px;font-weight:800;padding:2px 7px;border-radius:999px;background:rgba(249,115,22,.12);color:#f97316;border:1px solid rgba(249,115,22,.3)">Ingen tekst</span>'; return ''; })()}</div>
          </div>
          <label class="ghost-btn" style="cursor:pointer;font-size:12px;padding:6px 12px">🎵 Bytt lydfil<input type="file" accept="audio/*" hidden onchange="uploadBeatAudio('${b.id}',this.files[0])"></label>
          <label class="ghost-btn" style="cursor:pointer;font-size:12px;padding:6px 12px">🖼️ Coverbilde<input type="file" accept="image/*" hidden onchange="setAlbumBeatCover('${b.id}',this)"></label>
          <button class="small-btn danger" onclick="removeFromCollection('${b.id}','${listMode}')">Fjern fra ${listMode==="mixtape"?"mixtape":"album"}</button>
        </div>
        <div class="ab-lyric-editor">
          ${lyricsEditorMarkup(b.id,"Skriv tekst, hooks, vers, ideer...")}
        </div>
      </div>
    </div>`;
  }).join("");
}
// ══════════════════════════════════════════════════════════════════════════════
// mvShare — standalone share modal (reads data-share="type|id|name")
// ══════════════════════════════════════════════════════════════════════════════
window.mvShare = async function(btn) {
  const raw = btn.dataset.share || '';
  const i1 = raw.indexOf('|'), i2 = raw.indexOf('|', i1+1);
  const contentType = raw.slice(0, i1);
  const contentId   = raw.slice(i1+1, i2);
  const contentName = raw.slice(i2+1) || contentId;
  if (!contentType || !contentId) { showToast('Mangler innholds-ID'); return; }
  const SBU='https://ylvqkfdvijqnecuqznyr.supabase.co';
  const SBK='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlsdnFrZmR2aWpxbmVjdXF6bnlyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgzMzA4MzIsImV4cCI6MjA5MzkwNjgzMn0.bYPTaxQK8n7I7w5Ri2DVYW5_LbFHg2IXkuhHsLTDDqc';
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
      const ids=existing.map(x=>x.grantee_id).filter(Boolean).join(',');
      if(ids){const pr=await fetch(`${SBU}/rest/v1/profiles?id=in.(${ids})&select=id,username`,{headers:hdrs});if(pr.ok)(await pr.json()).forEach(p=>names[p.id]=p.username||p.id);}
    }
  }catch(e){}
  const typeLabel={beat:'Beat',album:'Album',mixtape:'Mixtape'}[contentType]||contentType;
  const existHTML=existing.length
    ?existing.map(r=>`<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.06)"><span style="font-size:13px;font-weight:700;color:#f4ede4;flex:1">\uD83D\uDC64 ${names[r.grantee_id]||r.grantee_id}</span><span style="font-size:11px;color:rgba(255,255,255,.4)">${r.role==='editor'?'Redakt\u00f8r':'Kan se'}</span></div>`).join('')
    :'<p style="font-size:12px;color:rgba(255,255,255,.3);margin:0">Ingen har tilgang</p>';
  let modal=document.getElementById('_mvSM');
  if(!modal){modal=document.createElement('div');modal.id='_mvSM';modal.addEventListener('click',e=>{if(e.target===modal)modal.style.display='none';});document.body.appendChild(modal);}
  modal.style.cssText='position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.82);display:flex;align-items:center;justify-content:center;backdrop-filter:blur(5px)';
  modal.innerHTML=`
    <div style="background:#1c1a17;border:1px solid rgba(255,255,255,.12);max-width:440px;width:94%;padding:26px 28px;border-radius:14px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
        <h2 style="font-size:16px;font-weight:900;margin:0;color:#f4ede4">Del ${typeLabel}</h2>
        <button onclick="document.getElementById('_mvSM').style.display='none'" style="background:none;border:none;color:rgba(255,255,255,.4);font-size:22px;cursor:pointer;padding:0;line-height:1">&#215;</button>
      </div>
      <p style="font-size:12px;color:rgba(255,255,255,.35);margin:0 0 18px">${contentName}</p>
      <div style="display:grid;gap:10px">
        <input id="_mvSM_u" placeholder="Brukernavn"
          style="background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);color:#f4ede4;padding:10px 12px;font-size:13px;font-family:inherit;outline:none;border-radius:8px;width:100%;box-sizing:border-box"
          onkeydown="if(event.key==='Enter') window._mvSMdo()">
        <div style="display:flex;gap:8px">
          <select id="_mvSM_r" style="flex:1;background:#1c1a17;border:1px solid rgba(255,255,255,.12);color:#f4ede4;padding:10px;font-size:13px;font-family:inherit;outline:none;border-radius:8px">
            <option value="viewer">Kan se</option><option value="editor">Kan redigere</option>
          </select>
          <button onclick="window._mvSMdo()" style="background:linear-gradient(135deg,#f4a443,#cb6e1a);border:none;color:#000;font-size:13px;font-weight:900;padding:10px 22px;cursor:pointer;border-radius:8px;font-family:inherit">Del</button>
        </div>
        <div id="_mvSM_s" style="font-size:12px;color:rgba(255,255,255,.4);min-height:16px"></div>
        <div style="font-size:10px;font-weight:900;letter-spacing:.1em;text-transform:uppercase;color:rgba(255,255,255,.3);margin-top:4px">Har tilgang</div>
        <div id="_mvSM_l">${existHTML}</div>
      </div>
    </div>`;
  window._mvSMdo=async function(){
    const username=(document.getElementById('_mvSM_u')?.value||'').trim().toLowerCase();
    const role=document.getElementById('_mvSM_r')?.value||'viewer';
    const statusEl=document.getElementById('_mvSM_s');
    if(!username){if(statusEl)statusEl.textContent='Skriv inn brukernavn';return;}
    if(statusEl){statusEl.style.color='rgba(255,255,255,.4)';statusEl.textContent='S\u00f8ker...';}
    try{
      const pr=await fetch(`${SBU}/rest/v1/profiles?username=eq.${encodeURIComponent(username)}&select=id`,{headers:hdrs});
      const profiles=pr.ok?await pr.json():[];
      if(!profiles.length){if(statusEl){statusEl.style.color='#fb7185';statusEl.textContent='Finner ikke bruker: '+username;}return;}
      const granteeId=profiles[0].id;
      if(granteeId===uid){if(statusEl){statusEl.style.color='#fb7185';statusEl.textContent='Kan ikke dele med deg selv';}return;}
      const body=JSON.stringify({owner_id:uid,grantee_id:granteeId,content_type:contentType,content_id:contentId,role,content_name:contentName});
      const res=await fetch(`${SBU}/rest/v1/content_access`,{method:'POST',headers:{...hdrs,'Prefer':'resolution=merge-duplicates'},body});
      if(!res.ok){const err=await res.text();if(statusEl){statusEl.style.color='#fb7185';statusEl.textContent='Feil: '+err;}return;}
      if(statusEl){statusEl.style.color='#34d399';statusEl.textContent='\u2713 Delt med '+username;}
      if(document.getElementById('_mvSM_u')) document.getElementById('_mvSM_u').value='';
      setTimeout(()=>window.mvShare(btn),800);
    }catch(e){if(statusEl){statusEl.style.color='#fb7185';statusEl.textContent='Feil: '+e.message;}}
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
    showToast('\u26a0 Album pitch ikke tilgjengelig');
  } else if(type==='mixtape'){
    if(typeof window.mixtapeShareMode==='function'){window.mixtapeShareMode(id);return;}
    _mvMixtapePitchFallback(id);
  }
};
function _mvMixtapePitchFallback(mixtapeId){
  const st=typeof state!=='undefined'?state:window.state;
  const mt=st?.mixtapes?.find(m=>m.id===mixtapeId);
  if(!mt){showToast('Mixtape ikke funnet');return;}
  const WORKER=window.R2_WORKER_URL||'https://beat-vault.marcus-aas-mekiassen.workers.dev';
  if(mt._shareToken&&mt._shareEnabled!==false){_mvShowPitchModal(mt,`${WORKER}/share/${mt._shareToken}`);return;}
  showToast('Publiserer pitch-side...');
  const token=Date.now().toString(36)+Math.random().toString(36).slice(2,7);
  const beats=(typeof beatsFromIds==='function'?beatsFromIds:window.beatsFromIds)(mt.beatIds||[]);
  const payload={mt:{id:mt.id,name:mt.name,cover:mt.cover||'',color:mt.color||'#f4a443'},beats:beats.map(b=>({id:b.id,name:b.name,duration:b.duration||0,audio_url:b.audio_url||b.url||''}))};
  fetch(`${WORKER}/share/${token}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)})
    .then(r=>r.json()).then(data=>{
      if(!data.ok)throw new Error(data.error||'Ukjent feil');
      mt._shareToken=token;mt._shareUrl=data.url;mt._shareEnabled=true;
      if(typeof saveState==='function')saveState();
      _mvShowPitchModal(mt,data.url);
    }).catch(e=>showToast('\u26a0 Kunne ikke publisere: '+e.message));
}
function _mvShowPitchModal(mt,shareUrl){
  let modal=document.getElementById('_mvPM');
  if(!modal){modal=document.createElement('div');modal.id='_mvPM';modal.addEventListener('click',e=>{if(e.target===modal)modal.style.display='none';});document.body.appendChild(modal);}
  modal.style.cssText='position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.82);display:flex;align-items:center;justify-content:center;backdrop-filter:blur(5px)';
  modal.innerHTML=`
    <div style="background:#1c1a17;border:1px solid rgba(255,255,255,.12);max-width:480px;width:94%;padding:26px 28px;border-radius:14px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px">
        <h2 style="font-size:16px;font-weight:900;margin:0;color:#f4ede4">\uD83C\uDFA4 Pitch: ${esc(mt.name)}</h2>
        <button onclick="document.getElementById('_mvPM').style.display='none'" style="background:none;border:none;color:rgba(255,255,255,.4);font-size:22px;cursor:pointer;padding:0;line-height:1">&#215;</button>
      </div>
      <p style="font-size:12px;color:rgba(255,255,255,.4);margin:0 0 14px">Del denne lenken med labels eller partnere:</p>
      <div style="display:flex;gap:8px">
        <input id="_mvPM_url" readonly value="${shareUrl}"
          style="flex:1;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);color:#f4ede4;padding:9px 12px;font-size:12px;font-family:system-ui;outline:none;border-radius:8px">
        <button onclick="navigator.clipboard.writeText(document.getElementById('_mvPM_url').value).then(()=>{this.textContent='\u2713';setTimeout(()=>this.textContent='Kopier',2000)})"
          style="background:#f4a443;border:none;color:#000;font-size:12px;font-weight:800;padding:9px 16px;cursor:pointer;border-radius:8px;font-family:inherit">Kopier</button>
      </div>
    </div>`;
}

// ── renameBeatInline ──────────────────────────────────────────────────────────
window.renameBeatInline = function(id) {
  const el=document.getElementById('abt-'+id);if(!el)return;
  const st=typeof state!=='undefined'?state:window.state;
  const b=st.beats.find(x=>x.id===id);if(!b)return;
  const old=b.name||'';
  const inp=document.createElement('input');inp.type='text';inp.value=old;
  inp.style.cssText='background:rgba(255,255,255,.08);border:1px solid rgba(244,164,67,.5);color:#f4ede4;font-size:inherit;font-weight:inherit;font-family:inherit;padding:2px 8px;border-radius:6px;outline:none;width:100%;box-sizing:border-box;min-width:60px';
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

// ── downloadBeat ──────────────────────────────────────────────────────────────
window.downloadBeat = function(id) {
  const st=typeof state!=='undefined'?state:window.state;
  const b=st?.beats?.find(x=>x.id===id);
  const url=b?.audio_url||b?.url||b?.driveUrl||b?.drive_url;
  if(!url){if(typeof showToast==='function')showToast('\u26a0 Ingen lydfil');return;}
  const a=document.createElement('a');a.href=url;
  a.download=(b.name||'beat').replace(/[^a-z0-9 ._-]/gi,'_')+'.mp3';
  a.target='_blank';document.body.appendChild(a);a.click();setTimeout(()=>a.remove(),300);
};



window.renderCollectionComments = async function(type, id) {
  const elId = type==='album' ? 'albumComments' : 'mixtapeComments';
  const el = document.getElementById(elId);
  if(!el || !id) return;
  const SBU='https://ylvqkfdvijqnecuqznyr.supabase.co', SBK='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlsdnFrZmR2aWpxbmVjdXF6bnlyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgzMzA4MzIsImV4cCI6MjA5MzkwNjgzMn0.bYPTaxQK8n7I7w5Ri2DVYW5_LbFHg2IXkuhHsLTDDqc';
  let token=SBK, uid=window._mvCurrentUserId||sessionStorage.getItem('mv_user_id');
  try {const {data:{session}}=await window.supabaseClient.auth.getSession();if(session?.access_token)token=session.access_token;if(session?.user?.id)uid=session.user.id;}catch(e){}
  const hdrs={'apikey':SBK,'Authorization':'Bearer '+token,'Content-Type':'application/json'};
  let pitchComments=[],labelComments=[];
  try{const r=await fetch(`${SBU}/rest/v1/pitch_comments?album_id=eq.${id}&order=created_at.asc&select=*`,{headers:hdrs});if(r.ok)pitchComments=await r.json();}catch(e){}
  try{const r=await fetch(`${SBU}/rest/v1/notifications?content_id=eq.${id}&type=eq.label_comment&order=created_at.asc&select=*`,{headers:hdrs});if(r.ok)labelComments=await r.json();}catch(e){}
  const all=[
    ...pitchComments.map(c=>{const initials=(c.author||'?').slice(0,2).toUpperCase();const dt=new Date(c.created_at);const ts=dt.toLocaleDateString('nb-NO',{day:'numeric',month:'short'})+' '+dt.toLocaleTimeString('nb-NO',{hour:'2-digit',minute:'2-digit'});const canDel=isAdmin()||uid===c.sender_id;return `<div class="cc-item" id="cc-${c.id}"><div class="cc-avatar">${initials}</div><div class="cc-body"><div class="cc-header"><span class="cc-author">${esc(c.author||'Anonym')}</span><span class="cc-tag cc-tag-pitch">Pitch</span><span class="cc-time">${ts}</span>${canDel?`<button class="cc-del" onclick="deleteCollectionComment('pitch','${c.id}','${type}','${id}')">&#215;</button>`:''}</div><div class="cc-text">${esc(c.comment||'')}</div></div></div>`}),
    ...labelComments.map(n=>{const author=n.content_name||'Label';const initials=author.slice(0,2).toUpperCase();const dt=new Date(n.created_at);const ts=dt.toLocaleDateString('nb-NO',{day:'numeric',month:'short'})+' '+dt.toLocaleTimeString('nb-NO',{hour:'2-digit',minute:'2-digit'});const canDel=isAdmin()||uid===n.recipient_id||uid===n.sender_id;return `<div class="cc-item" id="cc-${n.id}"><div class="cc-avatar cc-avatar-label">${initials}</div><div class="cc-body"><div class="cc-header"><span class="cc-author">${esc(author)}</span><span class="cc-tag cc-tag-label">Label</span><span class="cc-time">${ts}</span>${canDel?`<button class="cc-del" onclick="deleteCollectionComment('notification','${n.id}','${type}','${id}')">&#215;</button>`:''}</div></div></div>`})
  ];
  el.innerHTML=`<div class="cc-wrap"><div class="cc-title">&#128172; Kommentarer ${all.length?'<span class="cc-count">'+all.length+'</span>':''}</div><div class="cc-list">${all.length?all.join(''):'<div class="cc-empty">Ingen kommentarer enn\u00e5.</div>'}</div></div>`;
};
window.deleteCollectionComment = async function(source,commentId,type,collId) {
  if(!confirm('Slette denne kommentaren?'))return;
  const SBU='https://ylvqkfdvijqnecuqznyr.supabase.co',SBK='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlsdnFrZmR2aWpxbmVjdXF6bnlyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgzMzA4MzIsImV4cCI6MjA5MzkwNjgzMn0.bYPTaxQK8n7I7w5Ri2DVYW5_LbFHg2IXkuhHsLTDDqc';
  let token=SBK;try{const {data:{session}}=await window.supabaseClient.auth.getSession();if(session?.access_token)token=session.access_token;}catch(e){}
  const hdrs={'apikey':SBK,'Authorization':'Bearer '+token};
  const table=source==='pitch'?'pitch_comments':'notifications';
  try{const r=await fetch(`${SBU}/rest/v1/${table}?id=eq.${commentId}`,{method:'DELETE',headers:hdrs});if(r.ok||r.status===204){document.getElementById('cc-'+commentId)?.remove();if(typeof showToast==='function')showToast('\u2713 Kommentar slettet');};}catch(e){if(typeof showToast==='function')showToast('\u26a0 Feil: '+e.message);}
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
  const bar=document.getElementById(`abibar-${id}`);if(bar)bar.style.width=b.done+"%";
  const lbl=document.getElementById(`abidone-${id}`);if(lbl)lbl.textContent=b.done+"%";
}
function setAlbumBeatCover(id,input){
  const f=input.files[0];if(!f)return;
  const reader=new FileReader();
  reader.onload=e=>{
    const img=new Image();
    img.onload=()=>{
      const canvas=document.createElement("canvas");canvas.width=600;canvas.height=338;
      canvas.getContext("2d").drawImage(img,0,0,600,338);
      const b=state.beats.find(x=>x.id===id);if(!b)return;
      b.cover=canvas.toDataURL("image/jpeg",.85);saveState();
      renderAlbumDetail();
    };img.src=e.target.result;
  };reader.readAsDataURL(f);
}
function removeFromAlbum(beatId){removeFromCollection(beatId,currentMixtapeId?"mixtape":"album");}

document.getElementById("newAlbumCoverInput").addEventListener("change",e=>{
  const f=e.target.files[0];if(!f)return;
  const reader=new FileReader();
  reader.onload=ev=>{
    const img=new Image();
    img.onload=()=>{
      const sz=400;const canvas=document.createElement("canvas");canvas.width=sz;canvas.height=sz;
      const ctx=canvas.getContext("2d");
      const ratio=Math.min(sz/img.width,sz/img.height);
      const w=img.width*ratio,h=img.height*ratio;
      ctx.drawImage(img,(sz-w)/2,(sz-h)/2,w,h);
      newAlbumCoverBase64=canvas.toDataURL("image/jpeg",.85);
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
    img.onload=()=>{
      const sz=600;
      const canvas=document.createElement("canvas");canvas.width=sz;canvas.height=sz;
      const ctx=canvas.getContext("2d");
      const ratio=Math.max(sz/img.width,sz/img.height);
      const w=img.width*ratio,h=img.height*ratio;
      ctx.drawImage(img,(sz-w)/2,(sz-h)/2,w,h);
      cb(canvas.toDataURL("image/jpeg",.86));
    };
    img.src=ev.target.result;
  };
  reader.readAsDataURL(file);
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
    });
    e.target.value="";
  });
}

document.getElementById("newAlbumBtn").addEventListener("click",()=>{
  document.getElementById("newAlbumName").value="";
  document.getElementById("newAlbumCoverInput").value="";
  document.getElementById("albumCoverPreviewWrap").style.display="none";
  newAlbumCoverBase64=null;
  document.getElementById("newAlbumModal").classList.add("open");
});

document.getElementById("saveNewAlbumBtn").addEventListener("click",()=>{
  const name=document.getElementById("newAlbumName").value.trim();
  if(!name){alert("Skriv inn et albumnavn.");return;}
  state.albums.unshift({id:uid(),name,cover:newAlbumCoverBase64||null,beatIds:[],createdAt:Date.now()});
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
  albumAddBeatCandidates=state.beats.filter(b=>!album.beatIds.includes(b.id));
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
  saveState();renderAlbumDetail();closeModal("addBeatsModal");showToast(`✓ ${checked.length} beat${checked.length===1?"":"s"} lagt til`);
});

document.getElementById("deleteAlbumBtn").addEventListener("click",()=>{
  if(isProducerUser()){showToast("Produsentmodus: sletting er låst");return;}
  const a=state.albums.find(x=>x.id===currentAlbumId);if(!a)return;
  showDeleteConfirm(`Slette albumet "${a.name}"?`,()=>{
    state.albums=state.albums.filter(x=>x.id!==currentAlbumId);
    currentAlbumId=null;saveState();renderAlbums();showToast("🗑 Album slettet");
  });
});

// ── PIPELINE ──
function renderPipeline(){
  const board=document.getElementById("pipelineBoard");
  if(!state.albums.length){board.innerHTML=`<div class="empty">Ingen albumer ennå. Opprett et album og legg til beats for å se pipeline.</div>`;return;}
  board.innerHTML=state.albums.map(album=>{
    const beats=state.beats.filter(b=>album.beatIds.includes(b.id));
    const avg=beats.length?Math.round(beats.reduce((s,b)=>s+clamp(b.done||0),0)/beats.length):0;
    const avgCol=avg>=70?"#34d399":avg>=40?"#f97316":"#fb7185";
    const coverHtml=album.cover
      ?`<img class="pipeline-album-cover" src="${esc(album.cover)}" alt="${esc(album.name)}">`
      :`<div class="pipeline-album-cover-ph">🎵</div>`;
    const beatRows=beats.map(b=>{
      const pct=clamp(b.done||0);
      const col=pct>=70?"#34d399":pct>=40?"#f97316":"#fb7185";
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
function cassLabelClass(cover,base="cass-label"){return `${base}${cover?" has-cover":""}`;}
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
      <div class="cass-png-meta">${tracks} beat${tracks===1?'':'s'}</div>
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
      <div class="cass-card-title">${esc(mt.name)}<span>${n} beat${n===1?"":"s"}</span></div>
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
        <h2 style="display:flex;align-items:center;gap:8px">${esc(mt.name)}<button onclick="renameMixtape('${mt.id}')" title="Gi nytt navn" style="background:none;border:none;cursor:pointer;color:var(--muted);font-size:14px;padding:2px 4px;opacity:.7;transition:opacity .15s" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=.7">✏️</button></h2>
        <span style="color:var(--muted);font-size:13px">${(()=>{const n=(mt.beatIds||[]).filter(id=>{const b=state.beats.find(x=>x.id===id);return b&&!b.archived;}).length;return n+' beat'+(n===1?'':'s');})()}</span>
        <div id="mixtapeNowPlaying" class="hint" style="margin-top:6px"></div>
      </div>
      <div class="mixtape-detail-actions">
        <button class="primary-btn" id="playMixtapeBtn" onclick="playMixtapeFromStart('${mt.id}')">▶ Spill fra start</button>
        <button class="small-btn danger hidden" id="stopMixtapeBtn" onclick="stopCollectionPlayback()">⏹ Stopp</button>
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
}

function renderAll(){
  renderStats();
  // Mark all tabs dirty so next time they're opened they re-render
  markDirty();
  // Only render the currently active tab
  renderActiveTab();
  applyRoleMode();
}
// Full render for cases where all tabs must be up to date (e.g. after data sync)
function renderAllTabs(){renderStats();renderMixtapes();renderAlbums();(window.renderPipelineV2||renderPipeline)();renderIntegrations();applyRoleMode();markDirty();}

// ── DEMO MODAL ──
function openDemoModal(id){
  const d=state.demos.find(x=>x.id===id);if(!d)return;
  document.getElementById("editDemoId").value=d.id;
  document.getElementById("editModalTitle").textContent=d.title;
  document.getElementById("editModalSub").textContent="";
  updateModalScore(d);
  const ew=document.getElementById("editEmbedWrap");
  ew.innerHTML=d.url&&d.url!=="https://soundcloud.com/"?`<iframe width="100%" height="120" scrolling="no" frameborder="no" allow="autoplay" src="https://w.soundcloud.com/player/?url=${encodeURIComponent(d.url)}&color=%23a855f7&auto_play=false&hide_related=true&show_comments=false&show_user=true&visual=false" style="border-radius:12px"></iframe>`:"";
  document.getElementById("editPipelineSel").innerHTML=STAGES.map(s=>`<button class="p-btn${d.stage===s?" active":""}" onclick="selectPStage('${s}',this)">${s}</button>`).join("");
  document.getElementById("editCompl").value=d.done||0;
  document.getElementById("editComplVal").textContent=(d.done||0)+"%";
  modalRating=d.rating||0;renderModalStars(modalRating);
  document.getElementById("editNotes").value=d.notes||"";
  renderModalVers(d.id);
  document.getElementById("editDemoNotes").value=d.lyricsNotes||"";
  switchMTab("overview");
  document.getElementById("editDemoModal").classList.add("open");
}
function updateModalScore(d){
  const sc=releaseScore(d);const el=document.getElementById("editModalScore");
  el.textContent=sc;el.style.color=sc>=70?"#34d399":sc>=40?"#f97316":"#fb7185";
}
function switchMTab(t){
  document.querySelectorAll(".mtab").forEach(x=>x.classList.remove("active"));
  document.querySelectorAll(".mtab-content").forEach(x=>x.classList.remove("active"));
  document.querySelector(`.mtab[data-mtab="${t}"]`).classList.add("active");
  document.getElementById(`mtab-${t}`).classList.add("active");
}
function selectPStage(s,el){document.querySelectorAll(".p-btn").forEach(b=>b.classList.remove("active"));el.classList.add("active");}
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
  const id=document.getElementById("editDemoId").value;if(!confirm("Slette demoen?"))return;
  state.demos=state.demos.filter(d=>d.id!==id);state.versions=state.versions.filter(v=>v.demoId!==id);
  saveState();renderAll();document.getElementById("editDemoModal").classList.remove("open");showToast("🗑 Slettet");
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
  saveState();renderAll();showToast(`✓ ${files.length} beat${files.length===1?"":"s"} lagt til`);
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
// Tab switching: preserve scroll position (double-rAF wins over any render() scroll)
document.querySelectorAll(".tab-btn").forEach(btn=>btn.addEventListener("click",()=>{
  if(isProducerUser()&&!["mixtapes","pipeline"].includes(btn.dataset.tab)){showToast("Produsentmodus har tilgang til mixtapes og pipeline");return;}
  const y=window.scrollY||document.documentElement.scrollTop||0;
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


// ── RICH LYRICS EDITOR ──
function escToHtml(t){return String(t||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\n/g,"<br>");}
function richToPlain(html){return html.replace(/<br\s*\/?>/gi,"\n").replace(/<[^>]+>/g,"");}
const _lrt={};
function autosaveLyricsRich(id,el){
  clearTimeout(_lrt[id]);
  _lrt[id]=setTimeout(()=>{const b=state.beats.find(x=>x.id===id);if(b){b.lyrics=el.innerHTML;saveState();}},600);
}
function saveBeatLyricsRich(id){
  const el=document.getElementById("le-"+id);
  const b=state.beats.find(x=>x.id===id);
  if(b&&el){b.lyrics=el.innerHTML;saveState();showToast("✓ Tekst lagret");}
}
function copyBeatLyricsRich(id){
  const el=document.getElementById("le-"+id);if(!el)return;
  navigator.clipboard.writeText(richToPlain(el.innerHTML)).then(()=>showToast("✓ Tekst kopiert"));
}
function applyHighlight(beatId,color){
  const el=document.getElementById("le-"+beatId);if(!el)return;
  el.focus();
  const sel=window.getSelection();
  if(!sel||sel.rangeCount===0||sel.isCollapsed){showToast("Merk tekst først");return;}
  const range=sel.getRangeAt(0);
  if(color==="none"){
    document.execCommand("removeFormat");
  }else{
    const mark=document.createElement("mark");
    mark.style.cssText="background:"+color+";color:#111;border-radius:3px;padding:0 2px";
    try{range.surroundContents(mark);}catch(e){const frag=range.extractContents();mark.appendChild(frag);range.insertNode(mark);}
    sel.removeAllRanges();
  }
  autosaveLyricsRich(beatId,el);
}

// ── TOAST ──
let _tt;
function showToast(msg){
  let t=document.getElementById("_toast");
  if(!t){t=document.createElement("div");t.id="_toast";t.style.cssText="position:fixed;bottom:22px;right:22px;background:rgba(18,18,27,.96);backdrop-filter:blur(16px);border:1px solid rgba(255,255,255,.2);border-radius:12px;padding:11px 18px;font-size:13px;z-index:999;transform:translateY(60px);opacity:0;transition:all .25s;pointer-events:none";document.body.appendChild(t);}
  t.textContent=String(msg||'');t.style.transform="translateY(0)";t.style.opacity="1";
  clearTimeout(_tt);_tt=setTimeout(()=>{t.style.transform="translateY(60px)";t.style.opacity="0";},2500);
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
  }
  return beat;
}
function addBeatToMixtape(beat){
  console.log('[MIX] addBeatToMixtape kalt. beat.id:', beat?.id, '| currentMixtapeId:', currentMixtapeId);
  if(!beat){console.error('[MIX] FEIL: beat er undefined!');return;}
  if(!state.beats.find(b=>b.id===beat.id))state.beats.push(beat);
  const mt=state.mixtapes.find(x=>x.id===currentMixtapeId);
  if(mt&&!mt.beatIds.includes(beat.id)){mt.beatIds.push(beat.id);console.log('[MIX] Beat lagt til mixtape:', mt.name);}
  else if(!mt){console.error('[MIX] FEIL: Ingen mixtape funnet for ID:', currentMixtapeId);}
  saveState();
}
function addBeatToAlbum(beat){
  if(!state.beats.find(b=>b.id===beat.id))state.beats.push(beat);
  const album=state.albums.find(x=>x.id===currentAlbumId);
  if(album&&!album.beatIds.includes(beat.id))album.beatIds.push(beat.id);
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
    showToast(`⬆ Laster opp ${sizeMB}MB til R2...`);
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
    showToast('⚠ R2 feilet — lydfil lagret lokalt');
  }
}
async function handleMixtapeDrop(e){
  e.preventDefault();document.getElementById("mixtapeDrop").classList.remove("drag-over");
  const files=[...e.dataTransfer.files].filter(f=>f.type.startsWith("audio")||/\.(mp3|wav|flac|m4a|ogg|aac)$/i.test(f.name));
  if(!files.length){showToast("Ingen lydfiler funnet");return;}
  for(const f of files){const b=await createBeatFromFile(f);addBeatToMixtape(b);uploadBeatToR2(b,f);}
  renderMixtapeDetail();showToast(`✓ ${files.length} beat${files.length===1?"":"s"} lagt til`);
}
async function handleAlbumDrop(e){
  e.preventDefault();document.getElementById("albumDrop").classList.remove("drag-over");
  const files=[...e.dataTransfer.files].filter(f=>f.type.startsWith("audio")||/\.(mp3|wav|flac|m4a|ogg|aac)$/i.test(f.name));
  if(!files.length){showToast("Ingen lydfiler funnet");return;}
  for(const f of files){const b=await createBeatFromFile(f);addBeatToAlbum(b);uploadBeatToR2(b,f);}
  renderAlbumDetail();showToast(`✓ ${files.length} beat${files.length===1?"":"s"} lagt til`);
}
document.getElementById("mixtapeUploadInput").addEventListener("change",async e=>{
  if(!window.isAdminMode){showToast("⚠ Kun admin kan laste opp lydfiler");e.target.value="";return;}
  const files=[...e.target.files].filter(f=>f.type.startsWith("audio")||/\.(mp3|wav|flac|m4a|ogg|aac)$/i.test(f.name));
  for(const f of files){const b=await createBeatFromFile(f);addBeatToMixtape(b);uploadBeatToR2(b,f);}
  renderMixtapeDetail();showToast(`✓ ${files.length} beat${files.length===1?"":"s"} lagt til`);
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
  if(!window.isAdminMode){showToast("⚠ Kun admin kan laste opp lydfiler");e.target.value="";return;}
  const files=[...e.target.files].filter(f=>f.type.startsWith("audio")||/\.(mp3|wav|flac|m4a|ogg|aac)$/i.test(f.name));
  for(const f of files){const b=await createBeatFromFile(f);addBeatToAlbum(b);uploadBeatToR2(b,f);}
  renderAlbumDetail();showToast(`✓ ${files.length} beat${files.length===1?"":"s"} lagt til`);
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
  mixtapeAddBeatCandidates=state.beats.filter(b=>!mt.beatIds.includes(b.id));
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
  saveState();renderMixtapeDetail();closeModal("addBeatsToMixtapeModal");showToast(`✓ ${checked.length} beat${checked.length===1?"":"s"} lagt til`);
});
document.getElementById("deleteMixtapeBtn").addEventListener("click",()=>{
  if(isProducerUser()){showToast("Produsentmodus: sletting er låst");return;}
  const mt=state.mixtapes.find(x=>x.id===currentMixtapeId);if(!mt)return;
  showDeleteConfirm(`Slette mixtapen "${mt.name}"?`,()=>{
    state.mixtapes=state.mixtapes.filter(x=>x.id!==currentMixtapeId);
    currentMixtapeId=null;saveState();renderMixtapes();showToast("🗑 Mixtape slettet");
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
          <div class="modal-hd-right"><button class="close-btn" onclick="closeModal('mvRenameModal')">×</button></div>
        </div>
        <div class="modal-body" style="padding:22px 28px 28px;display:grid;gap:14px">
          <input id="mvRenameInput" class="text-input" style="font-size:15px;padding:10px 14px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);border-radius:8px;color:var(--text);width:100%;box-sizing:border-box" />
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
  showRenameModal('sang', b.name, val => {
    b.name = val; saveState();
    if (typeof window.beatsTab?.renderBeatsTab === 'function') window.beatsTab.renderBeatsTab();
    renderAll(); showToast('✓ Navn oppdatert');
  });
};
window.renameAlbum = function(id) {
  const a = state.albums.find(x => x.id === id); if (!a) return;
  showRenameModal('album', a.name, val => {
    a.name = val; saveState(); renderAlbums();
    if (id === currentAlbumId) renderAlbumDetail();
    showToast('✓ Navn oppdatert');
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
