// === main-script-2 ===
(function(){
  const PRODUCER_TABS=["mixtapes","pipeline"];
  function safeTab(tab){return PRODUCER_TABS.includes(tab)?tab:"mixtapes";}
  window.showProducerAllowedTab=function(tab){
    const target=safeTab(tab);
    document.body.classList.toggle('producer-mode',typeof isProducerUser==='function'&&isProducerUser());
    document.querySelectorAll('.tab-btn').forEach(btn=>{
      const isActive=btn.dataset.tab===target;
      btn.classList.toggle('active',isActive);
      if(typeof isProducerUser==='function'&&isProducerUser()){
        btn.style.display=PRODUCER_TABS.includes(btn.dataset.tab)?'inline-flex':'none';
      }else{
        btn.style.display='';
      }
    });
    document.querySelectorAll('.tab-view').forEach(view=>view.classList.add('hidden'));
    const view=document.getElementById(target+'Tab');
    if(view)view.classList.remove('hidden');
    if(target==='pipeline'&&typeof renderPipeline==='function')renderPipeline();
    if(target==='mixtapes'&&typeof renderMixtapes==='function')renderMixtapes();
  };
  const previousApply=window.applyRoleMode;
  window.applyRoleMode=function(){
    if(typeof previousApply==='function')previousApply();
    if(typeof isProducerUser==='function'&&isProducerUser()){
      const active=document.querySelector('.tab-btn.active')?.dataset?.tab||'mixtapes';
      window.showProducerAllowedTab(active);
    }
  };
  document.querySelectorAll('.tab-btn').forEach(btn=>{
    btn.addEventListener('click',function(e){
      if(!(typeof isProducerUser==='function'&&isProducerUser()))return;
      e.preventDefault();
      e.stopImmediatePropagation();
      const tab=btn.dataset.tab;
      if(!PRODUCER_TABS.includes(tab)){
        if(typeof showToast==='function')showToast('Produsentmodus har tilgang til mixtapes og pipeline');
        return false;
      }
      window.showProducerAllowedTab(tab);
      return false;
    },true);
  });
  document.addEventListener('DOMContentLoaded',()=>{
    if(typeof isProducerUser==='function'&&isProducerUser())window.showProducerAllowedTab(document.querySelector('.tab-btn.active')?.dataset?.tab||'mixtapes');
  });
})();


/* === UX UPGRADE PACK === */
(function(){
  const _oldSaveState = window.saveState;
  const _oldRenderAll = window.renderAll;
  const _oldShowToast = window.showToast;
  let _toastTimer=null;
  let _selectedBeats=new Set();

  window.showToast=function(msg, actionLabel, actionFn){
    let t=document.getElementById('_toast');
    if(!t){t=document.createElement('div');t.id='_toast';t.style.cssText='position:fixed;bottom:22px;right:22px;background:rgba(18,18,27,.96);backdrop-filter:blur(16px);border:1px solid rgba(255,255,255,.2);border-radius:14px;padding:11px 14px;font-size:13px;z-index:9999;transform:translateY(60px);opacity:0;transition:all .25s;box-shadow:0 18px 50px rgba(0,0,0,.35);display:flex;align-items:center;gap:4px;pointer-events:auto';document.body.appendChild(t);}
    t.innerHTML=`<span>${esc(String(msg||''))}</span>${actionLabel?`<button class="toast-action" id="toastActionBtn">${esc(actionLabel)}</button>`:''}`;
    if(actionLabel&&actionFn){const b=document.getElementById('toastActionBtn'); if(b)b.onclick=()=>{actionFn();t.style.opacity='0';};}
    t.style.transform='translateY(0)';t.style.opacity='1';
    clearTimeout(_toastTimer);_toastTimer=setTimeout(()=>{t.style.transform='translateY(60px)';t.style.opacity='0';},actionLabel?7000:2600);
  };

  window.saveState=function(){
    if(typeof _oldSaveState==='function')_oldSaveState();
    showSavePulse();
  };

  function showSavePulse(){
    let el=document.getElementById('autosaveIndicator');
    if(!el){el=document.createElement('div');el.id='autosaveIndicator';el.className='autosave-indicator';document.body.appendChild(el);}
    el.textContent='✓ Lagret';el.classList.add('show');
    clearTimeout(el._t);el._t=setTimeout(()=>el.classList.remove('show'),1200);
  }

  function ensureUxData(){
    state.settings=state.settings||{};
    state.settings.lastBackup=state.settings.lastBackup||'';
    (state.beats||[]).forEach(b=>{
      if(!b.uploadedAt)b.uploadedAt=b.createdAt||Date.now();
      if(!b.uploadStatus)b.uploadStatus='sendt inn';
      if(!b.priority)b.priority='medium';
      if(typeof b.comments==='undefined')b.comments='';
      if(typeof b.pipelineNotes==='undefined')b.pipelineNotes='';
      if(typeof b.lyricsNotes==='undefined')b.lyricsNotes=b.lyricsNotes||'';
      if(typeof b.structure==='undefined')b.structure='Intro / Verse / Hook / Verse / Hook / Outro';
      if(typeof b.credits==='undefined')b.credits='';
      if(typeof b.bpm==='undefined')b.bpm='';
      if(typeof b.key==='undefined')b.key='';
      if(typeof b.energy==='undefined')b.energy='';
      if(typeof b.mood==='undefined')b.mood='';
      if(typeof b.tags==='undefined')b.tags='';
    });
    (state.mixtapes||[]).forEach((m,i)=>{if(!m.status)m.status='Åpen for uploads'; if(typeof m.description==='undefined')m.description=''; if(!m.color)m.color=cassColor(m,i);});
    (state.albums||[]).forEach(a=>{if(!a.status)a.status='Idé'; if(typeof a.archived==='undefined')a.archived=false;});
  }


  function installRoleBadge(){
    // Erstattet av mvUserCorner i lock.js — ikke gjør noe
    const old = document.getElementById('roleBadge');
    if(old) old.remove();
  }


  function emptyState(icon,title,text,btn,onclick){return `<div class="empty-state"><div><div class="empty-icon">${icon}</div><h3>${esc(title)}</h3><p>${esc(text)}</p>${btn?`<button class="primary-btn" onclick="${onclick}">${esc(btn)}</button>`:''}</div></div>`;}
  window.uxEmptyState=emptyState;

  const _oldRenderMixtapes=window.renderMixtapes;
  window.renderMixtapes=function(){
    ensureUxData();
    if(typeof _oldRenderMixtapes==='function')_oldRenderMixtapes();
    const grid=document.getElementById('mixtapeGrid');
    if(grid && !(state.mixtapes||[]).length){grid.innerHTML=emptyState('📼','Ingen mixtapes ennå','Lag en mixtape for å samle beats og produsent-uploads.','Lag mixtape',"document.getElementById('newMixtapeBtn').click()");}
    injectProducerDashboard();
    hydrateCards();
  };

  const _oldRenderAlbums=window.renderAlbums;
  window.renderAlbums=function(){
    ensureUxData();
    if(typeof _oldRenderAlbums==='function')_oldRenderAlbums();
    const grid=document.getElementById('albumGrid');
    if(grid && !(state.albums||[]).filter(a=>!a.archived).length){grid.innerHTML=emptyState('💿','Ingen albumer ennå','Lag et album for å flytte favorittbeats over til demoer.','Lag album',"document.getElementById('newAlbumBtn').click()");}
    hydrateCards();
  };

  const _oldRenderPipeline=window.renderPipeline;
  window.renderPipeline=function(){
    if(typeof _oldRenderPipeline==='function')_oldRenderPipeline();
    enhancePipeline();
  };

  function enhancePipeline(){
    const board=document.getElementById('pipelineBoard'); if(!board)return;
    if(!state.albums?.length){board.innerHTML=emptyState('📊','Pipeline er tom','Lag et album og legg til demoer for å bygge pipeline.','Lag album',"document.querySelector('[data-tab=albums]').click();setTimeout(()=>document.getElementById('newAlbumBtn')?.click(),80)");return;}
    if(!document.getElementById('pipelineFilterbar')){
      board.insertAdjacentHTML('beforebegin',`<div id="pipelineFilterbar" class="pipeline-filterbar"><input id="pipelineSearch" class="ux-input" placeholder="Søk i pipeline"><select id="pipelineStatusFilter" class="ux-input"><option value="">Alle statuser</option><option>Idé</option><option>Demo</option><option>Valgt</option><option>Miks</option><option>Master</option><option>Klar for release</option></select><select id="pipelinePriorityFilter" class="ux-input"><option value="">Alle prioriteter</option><option value="high">Høy</option><option value="medium">Medium</option><option value="low">Lav</option></select></div>`);
      ['pipelineSearch','pipelineStatusFilter','pipelinePriorityFilter'].forEach(id=>document.getElementById(id)?.addEventListener('input',filterPipeline));
    }
    board.querySelectorAll('.pipeline-beat-row').forEach(row=>{
      const name=row.querySelector('.pipeline-beat-name')?.textContent||'';
      const beat=(state.beats||[]).find(b=>b.name===name);
      if(beat){const col=beatMixtapeColor(beat.id,'album')||'var(--accent)';row.style.setProperty('--chip-color',col);row.dataset.priority=beat.priority||'medium';row.dataset.status=beat.stage||'';row.insertAdjacentHTML('beforeend',`<span class="beat-chip"><span class="color-dot" style="--chip-color:${col}"></span>${esc(beat.priority||'medium')}</span>`);}
    });
    filterPipeline();
  }
  function filterPipeline(){
    const q=(document.getElementById('pipelineSearch')?.value||'').toLowerCase();
    const st=document.getElementById('pipelineStatusFilter')?.value||'';
    const pr=document.getElementById('pipelinePriorityFilter')?.value||'';
    document.querySelectorAll('.pipeline-beat-row').forEach(row=>{const ok=(!q||row.textContent.toLowerCase().includes(q))&&(!st||row.dataset.status===st)&&(!pr||row.dataset.priority===pr);row.style.display=ok?'flex':'none';});
  }

  const _oldRenderAlbumDetail=window.renderAlbumDetail;
  window.renderAlbumDetail=function(){
    if(typeof _oldRenderAlbumDetail==='function')_oldRenderAlbumDetail();
    redesignAlbumDetail();
  };

  function redesignAlbumDetail(){
    const album=state.albums?.find(a=>a.id===currentAlbumId);
    const hd=document.getElementById('albumDetailHd');
    if(!album||!hd)return;
    const beats=beatsFromIds(album.beatIds);
    const avg=beats.length?Math.round(beats.reduce((s,b)=>s+Number(b.done||0),0)/beats.length):0;
    const isPlaying=bottomPlayer.context?.type==='album'&&bottomPlayer.context?.id===album.id&&!bottomPlayer.audio.paused;
    const cover=album.cover
      ?`<img src="${esc(album.cover)}" alt="${esc(album.name)}">`
      :`<div class="album-detail-cover-ph">♪</div>`;
    const label=album.cover
      ?`<img src="${esc(album.cover)}" alt="">`
      :`<div class="album-detail-cover-ph" style="font-size:22px;border-radius:50%">♪</div>`;
    hd.classList.toggle('is-playing-album',!!isPlaying);
    hd.innerHTML=`
      <div class="album-detail-premium">
        <div class="album-detail-art" aria-hidden="true">
          <div class="album-detail-vinyl">
            <div class="album-detail-vinyl-label">${label}</div>
            <div class="album-detail-vinyl-hole"></div>
          </div>
          <div class="album-detail-cover-card">${cover}</div>
        </div>

        <div class="album-detail-main">
          <div class="eyebrow">Album</div>
          <h2>${esc(album.name)}</h2>
          <p class="album-detail-sub">
            <span>${beats.length} sang${beats.length===1?'':'er'}</span>
            <span>•</span>
            <span>${(()=>{const s=beats.reduce((t,b)=>t+Number(b.duration||0),0);const m=Math.floor(s/60),sec=Math.floor(s%60);return s>0?m+':'+String(sec).padStart(2,'0'):'--:--';})()}</span>
            <span>•</span>
            <span>${avg}% ferdig</span>
          </p>
          <div class="album-detail-actions">
            <button class="primary-btn" id="playAlbumBtn" onclick="playAlbumFromStart('${album.id}');document.getElementById('albumDetailHd')?.classList.add('vinyl-spinning')">▶ Spill fra start</button>
            ${window.isOwnerOrEditor && window.isOwnerOrEditor(album) ? `<label class="ghost-btn" style="cursor:pointer">🖼️ Bytt albumbilde<input type="file" accept="image/*" hidden onchange="setAlbumCover('${album.id}',this.files[0])"></label>` : ''}
            <button class="ghost-btn" onclick="albumToggleABSide('${album.id}')" id="abSideBtn" title="A/B-side visning">💿 A/B-side</button>
            ${window.isOwnerOrEditor && window.isOwnerOrEditor(album) ? `<button class="ghost-btn" onclick="window.albumPitchMode('${album.id}')" title="Artist one-pager">📄 Pitch</button>` : ''}
            ${!album._shared ? `<button class="ghost-btn" onclick="window.openShareModal('album','${album.id}','${album.name.replace(/'/g,"\\'")}')">👤 Del med bruker</button>` : ''}
            <button class="small-btn danger hidden" id="stopAlbumBtn" onclick="stopCollectionPlayback()">⏹ Stopp</button>
          </div>
        </div>

        <aside class="album-detail-side">
          <div class="meta-row"><span>Status</span><strong>${esc(album.status||'Idé')}</strong></div>
          <div class="meta-row"><span>Tracks</span><strong>${beats.length}</strong></div>
          <div class="meta-row"><span>Ferdig</span><strong>${avg}%</strong></div>
          <div class="progress-bar"><div style="width:${avg}%"></div></div>
          <select class="ux-input" onchange="albumStatusChange('${album.id}',this.value)">
            <option ${album.status==='Idé'?'selected':''}>Idé</option>
            <option ${album.status==='Demo'?'selected':''}>Demo</option>
            <option ${album.status==='Valgt'?'selected':''}>Valgt</option>
            <option ${album.status==='Miks'?'selected':''}>Miks</option>
            <option ${album.status==='Master'?'selected':''}>Master</option>
            <option ${album.status==='Klar for release'?'selected':''}>Klar for release</option>
          </select>
        </aside>
      </div>`;
  }
  // Load beat durations in background by probing audio metadata
  function loadMissingDurations(beats) {
    beats.forEach(b => {
      if (b.duration > 0) return; // already known
      const url = b.audio_url || b.url;
      if (!url) return;
      const audio = new Audio();
      audio.preload = 'metadata';
      audio.addEventListener('loadedmetadata', () => {
        if (audio.duration > 0 && isFinite(audio.duration)) {
          b.duration = Math.round(audio.duration);
          if (typeof saveState === 'function') saveState();
          // Re-render header to show updated duration
          if (typeof redesignAlbumDetail === 'function') redesignAlbumDetail();
        }
      }, { once: true });
      audio.src = url;
    });
  }

  // Patch renderAlbumDetail to also load durations
  const _origRedesign = redesignAlbumDetail;
  redesignAlbumDetail = function() {
    _origRedesign();
    const album = state.albums?.find(a=>a.id===currentAlbumId);
    if (album) {
      const beats = beatsFromIds(album.beatIds).filter(b=>!b.duration||b.duration===0);
      if (beats.length) loadMissingDurations(beats);
    }
  };

  window.albumStatusChange=function(id,val){const a=state.albums.find(x=>x.id===id);if(a){a.status=val;saveState();showToast('✓ Albumstatus oppdatert');renderAlbumDetail();}};

  // ── A/B Side toggle ────────────────────────────────────────────────────────
  let _abSideActive = false;
  window.albumToggleABSide = function(albumId) {
    _abSideActive = !_abSideActive;
    const btn = document.getElementById('abSideBtn');
    if (btn) { btn.classList.toggle('active', _abSideActive); btn.textContent = _abSideActive ? '💿 Full liste' : '💿 A/B-side'; }
    const album = state.albums.find(a=>a.id===albumId);
    if (!album) return;
    const beats = beatsFromIds(album.beatIds);
    const list  = document.getElementById('albumBeatList');
    if (!list) return;
    if (_abSideActive) {
      const mid = Math.ceil(beats.length / 2);
      list.insertAdjacentHTML('afterbegin', `
        <div class="ab-side-divider" id="abSideA"><span class="ab-side-label">A-SIDE</span></div>`);
      const bCards = list.querySelectorAll('.album-beat-card');
      if (bCards[mid]) bCards[mid].insertAdjacentHTML('beforebegin',
        `<div class="ab-side-divider" id="abSideB"><span class="ab-side-label">B-SIDE</span></div>`);
    } else {
      list.querySelectorAll('.ab-side-divider').forEach(el=>el.remove());
    }
  };

  // ── Pitch mode (one-pager) ────────────────────────────────────────────────
  window.albumPitchMode = function(albumId) {
    const album = state.albums?.find(a=>a.id===albumId);
    if (!album) return;
    const beats = beatsFromIds(album.beatIds);
    const totalSec = beats.reduce((s,b)=>s+Number(b.duration||0),0);
    const dur = totalSec>0 ? Math.floor(totalSec/60)+':'+String(Math.floor(totalSec%60)).padStart(2,'0') : null;
    const STATUS_COLORS = {'Idé':'#a855f7','Skriving':'#60a5fa','Innspilling':'#f97316','Mixing':'#f4a443','Ferdig':'#34d399'};
    const stCol = STATUS_COLORS[album.status||'Idé'] || '#f4a443';
    const mid = Math.ceil(beats.length/2);
    const coverUrl = album.cover || '';
    const PREVIEW_SEC = 17;
    const CROSSFADE_SEC = 1.2;
    const SB_URL_P = 'https://ylvqkfdvijqnecuqznyr.supabase.co';
    const SB_KEY_P = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlsdnFrZmR2aWpxbmVjdXF6bnlyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgzMzA4MzIsImV4cCI6MjA5MzkwNjgzMn0.bYPTaxQK8n7I7w5Ri2DVYW5_LbFHg2IXkuhHsLTDDqc';

    const beatsJson = JSON.stringify(beats.map(b=>({
      id:b.id, name:b.name, duration:b.duration||0, audio_url:b.audio_url||b.url||''
    })));

    const rows = beats.map((b,i)=>{
      const sideDiv = beats.length>=4&&(i===0||i===mid)
        ? `<div class="side-label">${i===0?'A':'B'}-SIDE</div>` : '';
      const d=Number(b.duration||0), dStr=d>0?Math.floor(d/60)+':'+String(Math.floor(d%60)).padStart(2,'0'):'';
      return sideDiv+`<div class="track-row" data-idx="${i}" onclick="playPreview(${i})">
        <span class="track-num">${String(i+1).padStart(2,'0')}</span>
        <div class="track-play-icon">▶</div>
        <span class="track-name">${b.name.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</span>
        <span class="track-dur">${dStr}</span>
      </div>`;
    }).join('');

    const html = `<!DOCTYPE html><html lang="no"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${album.name} — Pitch</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#0d0b09;color:#f4ede4;font-family:Georgia,serif;min-height:100vh;display:flex;align-items:flex-start;justify-content:center;padding:60px 20px}
.page{max-width:680px;width:100%}
.hero{display:flex;align-items:flex-start;gap:48px;margin-bottom:56px}
.sleeve-wrap{position:relative;width:200px;height:200px;flex-shrink:0}
.sleeve{width:200px;height:200px;overflow:hidden;position:relative;z-index:2;box-shadow:0 20px 60px rgba(0,0,0,.7)}
.sleeve img{width:100%;height:100%;object-fit:cover;display:block}
.sleeve-ph{width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:56px;background:rgba(255,255,255,.06)}
.vinyl-wrap{position:absolute;right:-60px;top:10px;z-index:1}
.vinyl-disc{width:170px;height:170px;border-radius:50%;background:radial-gradient(circle,#1c1c1c 0%,#111 45%,#0a0a0a 100%);box-shadow:0 8px 32px rgba(0,0,0,.8);animation:vinylSpin 4s linear infinite;position:relative}
.vinyl-grooves{position:absolute;inset:8px;border-radius:50%;background:repeating-radial-gradient(circle at center,transparent 0,transparent 4px,rgba(255,255,255,.025) 4px,rgba(255,255,255,.025) 5px)}
.vinyl-label{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:58px;height:58px;border-radius:50%;background:${stCol};display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:900;letter-spacing:.1em;text-transform:uppercase;color:#000;font-family:system-ui}
.vinyl-hole{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:7px;height:7px;border-radius:50%;background:#0d0b09}
@keyframes vinylSpin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
.vinyl-wrap.paused .vinyl-disc{animation-play-state:paused}
.hero-info{padding-top:6px;flex:1;min-width:0}
.hero-status{font-size:10px;font-weight:800;letter-spacing:.2em;color:${stCol};text-transform:uppercase;font-family:system-ui;margin-bottom:12px}
.hero-title{font-size:40px;font-weight:900;letter-spacing:-.04em;line-height:1.05;margin-bottom:14px}
.hero-meta{display:flex;gap:16px;font-size:12px;color:rgba(255,255,255,.4);font-family:system-ui;font-weight:700}
.controls{display:flex;align-items:center;gap:10px;margin-top:20px;flex-wrap:wrap}
.ctrl-btn{background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);color:#f4ede4;font-size:12px;font-weight:700;padding:8px 16px;cursor:pointer;font-family:system-ui;letter-spacing:.04em;transition:all .15s}
.ctrl-btn:hover{background:rgba(255,255,255,.13)}
.ctrl-btn.active-play{background:${stCol};color:#000;border-color:${stCol}}
.preview-label{font-size:11px;color:rgba(255,255,255,.3);font-family:system-ui;font-weight:700;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tracklist-label{font-size:10px;font-weight:800;letter-spacing:.18em;color:rgba(255,255,255,.28);text-transform:uppercase;font-family:system-ui;padding-bottom:12px;border-bottom:1px solid rgba(255,255,255,.08);margin-bottom:6px}
.side-label{font-size:9px;font-weight:800;letter-spacing:.18em;color:${stCol};text-transform:uppercase;font-family:system-ui;padding:14px 0 4px;opacity:.55}
.track-row{display:flex;align-items:center;gap:14px;padding:10px 12px;border-bottom:1px solid rgba(255,255,255,.05);cursor:pointer;transition:background .15s;position:relative;overflow:hidden}
.track-row:hover{background:rgba(255,255,255,.04)}
.track-num{font-size:11px;color:rgba(255,255,255,.22);min-width:22px;font-family:system-ui;font-variant-numeric:tabular-nums}
.track-play-icon{font-size:11px;color:rgba(255,255,255,.3);width:16px;flex-shrink:0}
.track-name{font-size:15px;font-weight:700;flex:1}
.track-dur{font-size:11px;color:rgba(255,255,255,.28);font-family:system-ui;font-variant-numeric:tabular-nums}
.track-row.active{background:rgba(255,255,255,.04)}
.track-row.active .track-name{background:linear-gradient(90deg,#f4ede4 0%,${stCol} 40%,#fff 55%,${stCol} 70%,#f4ede4 100%);background-size:200% auto;-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;animation:shineText 2.5s linear infinite;font-weight:900}
.track-row.active .track-play-icon{color:${stCol}}
.track-row.active .track-num{color:${stCol};opacity:.7}
@keyframes shineText{0%{background-position:0% center}100%{background-position:200% center}}
.track-row.active::after{content:'';position:absolute;bottom:0;left:0;height:2px;background:${stCol};width:var(--progress,0%);transition:width .3s linear}
.comments-section{margin-top:40px;padding-top:24px;border-top:1px solid rgba(255,255,255,.07)}
.comments-label{font-size:10px;font-weight:800;letter-spacing:.18em;color:rgba(255,255,255,.28);text-transform:uppercase;font-family:system-ui;margin-bottom:16px}
.comment-form{display:grid;gap:10px;margin-bottom:24px}
.comment-input{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:#f4ede4;padding:10px 14px;font-size:13px;font-family:Georgia,serif;outline:none;resize:vertical;min-height:80px;transition:border-color .15s}
.comment-input:focus{border-color:rgba(244,164,67,.4)}
.comment-name-row{display:flex;gap:8px}
.comment-name{flex:1;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:#f4ede4;padding:8px 12px;font-size:13px;font-family:system-ui;outline:none;transition:border-color .15s}
.comment-name:focus{border-color:rgba(244,164,67,.4)}
.comment-submit{background:${stCol};border:none;color:#000;font-size:12px;font-weight:800;padding:8px 20px;cursor:pointer;font-family:system-ui}
.comment-card{padding:14px 16px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07);margin-bottom:10px}
.comment-author{font-size:12px;font-weight:800;color:${stCol};font-family:system-ui}
.comment-date{font-size:11px;color:rgba(255,255,255,.28);font-family:system-ui;margin-left:8px}
.comment-body{font-size:14px;line-height:1.65;color:rgba(255,255,255,.75);margin-top:8px;white-space:pre-wrap}
.no-comments{font-size:12px;color:rgba(255,255,255,.3);font-family:system-ui}
.footer{font-size:11px;color:rgba(255,255,255,.18);font-family:system-ui;text-align:center;padding-top:24px;border-top:1px solid rgba(255,255,255,.06);margin-top:36px}
</style>
</head><body>
<div class="page">
  <div class="hero">
    <div class="sleeve-wrap">
      <div class="sleeve">${coverUrl?`<img src="${coverUrl}" alt="">`:'<div class="sleeve-ph">🎵</div>'}</div>
      <div class="vinyl-wrap paused" id="vinylWrap">
        <div class="vinyl-disc">
          <div class="vinyl-grooves"></div>
          <div class="vinyl-label">${album.name.slice(0,3).toUpperCase()}</div>
          <div class="vinyl-hole"></div>
        </div>
      </div>
    </div>
    <div class="hero-info">
      <div class="hero-status">${album.status||'Album'}</div>
      <h1 class="hero-title">${album.name}</h1>
      <div class="hero-meta">
        <span>${beats.length} sanger</span>
        ${dur?`<span>• ${dur} total</span>`:''}
        <span>• ${new Date().getFullYear()}</span>
      </div>
      <div class="controls">
        <button class="ctrl-btn" id="playAllBtn" onclick="togglePlayAll()">▶ Spill preview</button>
        <button class="ctrl-btn" onclick="stopAll()">⏹</button>
        <span class="preview-label" id="previewLabel">17 sek per sang</span>
      </div>
    </div>
  </div>
  <div class="tracklist-label">Trackliste</div>
  <div id="tracklist">${rows}</div>
  <div class="comments-section">
    <div class="comments-label">Tilbakemeldinger</div>
    <div class="comment-form">
      <textarea class="comment-input" id="commentBody" placeholder="Skriv en tilbakemelding..."></textarea>
      <div class="comment-name-row">
        <input class="comment-name" id="commentAuthor" placeholder="Ditt navn">
        <button class="comment-submit" onclick="submitComment()">Send</button>
      </div>
    </div>
    <div id="commentsList"><div class="no-comments">Laster kommentarer...</div></div>
  </div>
  <div class="footer">Laget med Music Vault</div>
</div>
<script>
const BEATS=${beatsJson};
const ALBUM_ID='${album.id}';
const SB_URL='${SB_URL_P}';
const SB_KEY='${SB_KEY_P}';
const VOL=0.3;
const PREVIEW_SEC=${PREVIEW_SEC};
const CROSSFADE_SEC=${CROSSFADE_SEC};
let audio=null,nextAudio=null,currentIdx=-1,progressInterval=null;
function stopAll(silent){
  clearInterval(progressInterval);
  if(audio){audio.pause();audio.src='';audio=null;}
  if(nextAudio){nextAudio.pause();nextAudio.src='';nextAudio=null;}
  document.querySelectorAll('.track-row').forEach(r=>{r.classList.remove('active');r.style.removeProperty('--progress');});
  document.getElementById('vinylWrap').classList.add('paused');
  const btn=document.getElementById('playAllBtn');
  btn.classList.remove('active-play');btn.textContent='▶ Spill preview';
  document.getElementById('previewLabel').textContent='17 sek per sang';
  if(!silent)currentIdx=-1;
}
async function playPreview(idx){
  clearInterval(progressInterval);
  if(audio){audio.pause();audio.src='';audio=null;}
  if(nextAudio){nextAudio.pause();nextAudio.src='';nextAudio=null;}
  const beat=BEATS[idx];if(!beat||!beat.audio_url){nextTrack(idx);return;}
  currentIdx=idx;
  document.querySelectorAll('.track-row').forEach((r,i)=>{r.classList.toggle('active',i===idx);r.style.removeProperty('--progress');});
  document.querySelectorAll('.track-row')[idx]?.scrollIntoView({behavior:'smooth',block:'nearest'});
  document.getElementById('vinylWrap').classList.remove('paused');
  document.getElementById('playAllBtn').classList.add('active-play');
  document.getElementById('playAllBtn').textContent='⏸ Spiller';
  document.getElementById('previewLabel').textContent=beat.name;
  audio=new Audio();audio.volume=VOL;
  try{const res=await fetch(beat.audio_url);if(res.ok){const blob=await res.blob();audio.src=URL.createObjectURL(blob);}else audio.src=beat.audio_url;}
  catch(e){audio.src=beat.audio_url;}
  audio.addEventListener('loadedmetadata',()=>{audio.currentTime=Math.max(0,(audio.duration||0)*0.08);});
  audio.play().catch(()=>{});
  const startTime=Date.now();
  progressInterval=setInterval(()=>{
    const elapsed=(Date.now()-startTime)/1000;
    const pct=Math.min(100,(elapsed/PREVIEW_SEC)*100);
    const row=document.querySelectorAll('.track-row')[idx];
    if(row)row.style.setProperty('--progress',pct+'%');
    if(elapsed>=PREVIEW_SEC-CROSSFADE_SEC){
      if(audio)audio.volume=Math.max(0,VOL*((PREVIEW_SEC-elapsed)/CROSSFADE_SEC));
      if(!nextAudio&&idx+1<BEATS.length){const nb=BEATS[idx+1];if(nb?.audio_url){nextAudio=new Audio();nextAudio.volume=0;nextAudio.src=nb.audio_url;nextAudio.load();}}
    }
    if(elapsed>=PREVIEW_SEC)nextTrack(idx);
  },80);
}
function nextTrack(fromIdx){clearInterval(progressInterval);const next=fromIdx+1;if(next<BEATS.length)playPreview(next);else stopAll();}
function togglePlayAll(){
  if(currentIdx>=0&&audio&&!audio.paused){audio.pause();document.getElementById('vinylWrap').classList.add('paused');document.getElementById('playAllBtn').classList.remove('active-play');document.getElementById('playAllBtn').textContent='▶ Fortsett';clearInterval(progressInterval);}
  else if(currentIdx>=0&&audio&&audio.paused){audio.play();document.getElementById('vinylWrap').classList.remove('paused');document.getElementById('playAllBtn').classList.add('active-play');document.getElementById('playAllBtn').textContent='⏸ Spiller';}
  else playPreview(0);
}
async function loadComments(){
  try{
    const res=await fetch(SB_URL+'/rest/v1/pitch_comments?album_id=eq.'+ALBUM_ID+'&order=created_at.asc&select=*',{headers:{'apikey':SB_KEY,'Authorization':'Bearer '+SB_KEY}});
    const comments=res.ok?await res.json():[];
    const el=document.getElementById('commentsList');
    el.innerHTML=comments.length?comments.map(c=>'<div class="comment-card"><span class="comment-author">'+c.author+'</span><span class="comment-date">'+new Date(c.created_at).toLocaleDateString('no-NO')+'</span><div class="comment-body">'+c.comment+'</div></div>').join(''):'<div class="no-comments">Ingen tilbakemeldinger ennå.</div>';
  }catch(e){document.getElementById('commentsList').innerHTML='<div class="no-comments">Kunne ikke laste.</div>';}
}
async function submitComment(){
  const body=document.getElementById('commentBody')?.value?.trim();
  const author=document.getElementById('commentAuthor')?.value?.trim()||'Anonym';
  if(!body)return;
  try{
    await fetch(SB_URL+'/rest/v1/pitch_comments',{method:'POST',headers:{'apikey':SB_KEY,'Authorization':'Bearer '+SB_KEY,'Content-Type':'application/json','Prefer':'return=minimal'},body:JSON.stringify({album_id:ALBUM_ID,author,comment:body,created_at:new Date().toISOString()})});
    document.getElementById('commentBody').value='';loadComments();
  }catch(e){}
}
loadComments();
</script></body></html>`;

    const blob2 = new Blob([html], {type:'text/html'});
    window.open(URL.createObjectURL(blob2), '_blank');
    if(typeof showToast==='function') showToast('✓ Pitch-side åpnet i ny fane');
  };
  window.setAlbumCover=function(id,file){if(!file)return;const r=new FileReader();r.onload=e=>{const a=state.albums.find(x=>x.id===id);if(a){a.cover=e.target.result;saveState();renderAlbumDetail();renderAlbums();showToast('✓ Albumbilde oppdatert');}};r.readAsDataURL(file);};

  const _oldRenderAlbumBeats=window.renderAlbumBeats;
  window.renderAlbumBeats=function(beats,mode,customEl){
    if(typeof _oldRenderAlbumBeats==='function')_oldRenderAlbumBeats(beats,mode,customEl);
    enhanceBeatCards(mode||'album', customEl||document.getElementById('albumBeatList'));
  };

  function enhanceBeatCards(mode,el){
    if(!el)return;
    if(!el.querySelector('.album-beat-card') && (!beatsFromDom(el).length))return;
    if(el.innerHTML.includes('Ingen beats')){
      el.innerHTML=emptyState(mode==='mixtape'?'🎧':'💿',mode==='mixtape'?'Mixtapen er tom':'Albumet er tomt',mode==='mixtape'?'Last opp beats eller legg til eksisterende beats.':'Legg til beats som demoer for å starte albumet.',mode==='mixtape'?'Last opp beats':'Legg til eksisterende',mode==='mixtape'?"document.getElementById('mixtapeUploadInput').click()":"document.getElementById('addBeatsToAlbumBtn').click()");
      return;
    }
    el.querySelectorAll('.album-beat-card').forEach(card=>{
      const id=card.dataset.beatId||card.id?.replace('abi-',''); const b=state.beats.find(x=>x.id===id); if(!b)return;
      card.classList.toggle('is-batch-selected',_selectedBeats.has(id));
      const title=card.querySelector('.ab-title');
      if(title&&!card.querySelector('.beat-chip-row')){const col=beatMixtapeColor(id,mode)||'var(--accent)';title.insertAdjacentHTML('afterend',`<div class="beat-chip-row" style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap"><span class="beat-chip"><span class="color-dot" style="--chip-color:${col}"></span>${esc(primaryMixtapeName(id)||'Mixtape')}</span></div>`);}
      const exp=card.querySelector('.ab-expand-left');
      if(exp&&!card.querySelector('.ux-extra-fields')) exp.insertAdjacentHTML('beforeend',extraBeatFields(b,mode));
    });
  }
  function beatsFromDom(el){return [...el.querySelectorAll('[data-beat-id]')].map(x=>x.dataset.beatId)}
  function primaryMixtapeName(id){const m=(state.mixtapes||[]).find(mt=>(mt.beatIds||[]).includes(id));return m?.name||'';}
  function extraBeatFields(b,mode){return ``;}
  window.updateBeatMeta=function(id,key,val){const b=state.beats.find(x=>x.id===id);if(!b)return;b[key]=val;saveState();showToast('✓ Oppdatert');};
  // Masseredigering er fjernet fra tracklisten.
  window.toggleBeatSelect=function(){};
  window.batchFavorite=function(){};
  window.batchRemove=function(){};
  window.batchMoveToAlbum=function(){};
  window.moveBeatToAlbumPrompt=function(id){const a=state.albums[0]; if(!a){showToast('Lag et album først');return;} if(!a.beatIds.includes(id))a.beatIds.push(id);saveState();renderMixtapeDetail();showToast(`✓ Kopiert til ${a.name}`,'Angre',()=>{a.beatIds=a.beatIds.filter(x=>x!==id);saveState();renderMixtapeDetail();});};

  const _oldRemoveFromCollection=window.removeFromCollection;
  window.removeFromCollection=function(beatId,mode){const col=activeCollectionForMode(mode||'album'); if(!col)return; const before=col.beatIds.slice(); if(typeof _oldRemoveFromCollection==='function')_oldRemoveFromCollection(beatId,mode); showToast('✓ Beat fjernet','Angre',()=>{col.beatIds=before;saveState();mode==='mixtape'?renderMixtapeDetail():renderAlbumDetail();});};

  const _oldToggleFav=window.toggleFav;
  window.toggleFav=function(id,btn){if(typeof _oldToggleFav==='function')_oldToggleFav(id,btn); document.querySelectorAll(`#bi-${id},#abi-${id}`).forEach(el=>{el.classList.add('flash');setTimeout(()=>el.classList.remove('flash'),1200);});};

  const _oldCreateBeatFromFile=window.createBeatFromFile;
  if(_oldCreateBeatFromFile){window.createBeatFromFile=async function(file){const b=await _oldCreateBeatFromFile(file); if(b){b.fileType=file.type||'';b.fileSize=file.size||0;b.uploadedAt=Date.now();b.producer=isProducerUser()?'Produsent':'Admin';b.uploadStatus='sendt inn';} return b;};}

  function injectProducerDashboard(){
    if(!isProducerUser())return;
    const list=document.getElementById('mixtapesListView'); if(!list||document.getElementById('producerDashboard'))return;
    list.insertAdjacentHTML('afterbegin',`<div id="producerDashboard" class="producer-dashboard"><h3 style="margin:0 0 6px">Produsent-dashboard</h3><p class="hint" style="margin:0 0 12px">Last opp beats, lag mixtapes og følg med på pipeline-status. Sletting og admin-endringer er låst.</p><button class="primary-btn" onclick="document.getElementById('newMixtapeBtn').click()">+ Ny mixtape</button> <label class="ghost-btn" style="cursor:pointer;margin-left:8px">📂 Last opp beats<input type="file" accept="audio/*" multiple hidden onchange="producerQuickUpload(this.files)"></label></div>`);
  }
  window.producerQuickUpload=async function(files){let mt=state.mixtapes[0];if(!mt){mt={id:uid(),name:'Producer Uploads',beatIds:[],color:CASS_COLORS[0],status:'Åpen for uploads',createdAt:Date.now()};state.mixtapes.unshift(mt);}currentMixtapeId=mt.id;for(const f of [...files])addBeatToMixtape(await createBeatFromFile(f));saveState();renderMixtapes();showToast(`✓ ${files.length} beat${files.length===1?'':'s'} lastet opp`);};

  function hydrateCards(){document.querySelectorAll('.cassette-card,.album-card,.album-beat-card').forEach(el=>{el.addEventListener('dragstart',()=>document.body.classList.add('is-dragging'),{once:true});el.addEventListener('dragend',()=>document.body.classList.remove('is-dragging'),{once:true});});updatePlayingAnimations();}
  function updatePlayingAnimations(){document.body.classList.toggle('is-playing-mixtape',bottomPlayer.context?.type==='mixtape'&&!bottomPlayer.audio.paused);document.body.classList.toggle('is-playing-album',bottomPlayer.context?.type==='album'&&!bottomPlayer.audio.paused);document.querySelectorAll('.album-detail-hd').forEach(h=>h.classList.toggle('is-playing-album',bottomPlayer.context?.type==='album'&&!bottomPlayer.audio.paused));document.querySelectorAll(`#abi-${bottomPlayer.queue?.[bottomPlayer.index]?.id}`).forEach(el=>el.classList.add('flash'));}
  const _oldUpdateBottomUI=window.updateBottomUI; if(_oldUpdateBottomUI){window.updateBottomUI=function(){_oldUpdateBottomUI();updatePlayingAnimations();};}

  window.renderAll=function(){ensureUxData();installRoleBadge();if(typeof _oldRenderAll==='function')_oldRenderAll();installRoleBadge();};

  // Backup UX
  document.getElementById('exportBtn')?.addEventListener('click',()=>{state.settings.lastBackup=new Date().toLocaleString('no-NO');setTimeout(()=>showToast('✓ Backup eksportert'),80);});
  document.getElementById('importInput')?.addEventListener('change',e=>{const f=e.target.files?.[0]; if(f)showToast(`Importer: ${f.name}. Sjekk at dette er riktig backup.`);});

  if(typeof state !== 'undefined') { ensureUxData(); installRoleBadge(); }
  setTimeout(()=>{try{ if(typeof state !== 'undefined'){ensureUxData();} renderAll();}catch(e){console.error(e);}},80);
})();

// === fullUpgradeScript ===
(function(){
  if(window.__fullUpgradePackLoaded)return; window.__fullUpgradePackLoaded=true;
  const $=(s,r=document)=>r.querySelector(s); const $$=(s,r=document)=>[...r.querySelectorAll(s)];
  const safeEsc=v=>typeof esc==='function'?esc(v):String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const getRole=()=>typeof getUserRole==='function'?(getUserRole()||'admin'):(sessionStorage.getItem('mv_role')||'admin');
  const isProducer=()=>typeof isProducerUser==='function'?isProducerUser():getRole()==='producer';
  const parseTime=v=>{if(v==null||v==='')return null; const s=String(v).trim(); if(/^\d+:\d+(\.\d+)?$/.test(s)){const [m,sec]=s.split(':');return Number(m)*60+Number(sec);} const n=Number(s.replace(',','.')); return Number.isFinite(n)?n:null;};
  function ensureFullData(){
    try{
      state.settings=state.settings||{}; state.settings.recentlyPlayed=state.settings.recentlyPlayed||[]; state.settings.archivedIds=state.settings.archivedIds||[]; state.settings.producerName=state.settings.producerName||'';
      state.settings.notifications=state.settings.notifications||[]; state.settings.showArchived=!!state.settings.showArchived;
      (state.beats||[]).forEach(b=>{b.createdAt=b.createdAt||Date.now(); b.uploadedAt=b.uploadedAt||b.createdAt; b.uploadStatus=b.uploadStatus||'sendt inn'; b.priority=b.priority||'medium'; b.stage=b.stage||'Idé'; b.owner=b.owner||b.producerName||b.producer||'Admin'; b.fileType=b.fileType||''; b.fileSize=b.fileSize||0; b.deadline=b.deadline||''; b.assignee=b.assignee||''; b.structure=b.structure||b.structure||''; b.credits=b.credits||'';});
      (state.mixtapes||[]).forEach(m=>{m.archived=!!m.archived; m.description=m.description||''; m.status=m.status||'Åpen for uploads'; m.coverZoom=m.coverZoom||1; m.coverPosX=m.coverPosX||50; m.coverPosY=m.coverPosY||50;});
      (state.albums||[]).forEach(a=>{a.archived=!!a.archived; a.status=a.status||'Idé'; a.deadline=a.deadline||''; a.assignee=a.assignee||'';});
    }catch(e){console.warn('full data repair failed',e)}
  }
  const oldSave=window.saveState; window.saveState=function(){ensureFullData(); if(oldSave)oldSave(); showSavedIndicator();};
  function showSavedIndicator(){let el=$('#autosaveIndicator'); if(!el){el=document.createElement('div');el.id='autosaveIndicator';el.className='upgrade-pill';el.style.cssText='position:fixed;left:18px;bottom:108px;z-index:2300;background:rgba(18,18,27,.92);backdrop-filter:blur(14px)';document.body.appendChild(el);}el.textContent='✓ Lagret';el.style.opacity='1';clearTimeout(window.__saveT);window.__saveT=setTimeout(()=>el.style.opacity='.0',1200);}

  function installGlobalSearch(){
    const app=$('.app')||document.body; if($('#globalSearchWrap'))return;
    const nav=$('.tabs'); const wrap=document.createElement('div'); wrap.id='globalSearchWrap'; wrap.className='global-search-wrap';
    wrap.innerHTML=`<input id="globalSearchInput" class="global-search-input" placeholder="Søk globalt i beats, mixtapes, album, lyrics, credits og notater…"><div id="globalSearchResults" class="global-search-results"></div>`;
    if(nav) nav.insertAdjacentElement('beforebegin',wrap); else app.insertAdjacentElement('afterbegin',wrap);
    $('#globalSearchInput').addEventListener('input',renderGlobalSearch);
    document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();$('#globalSearchInput')?.focus();}});
  }
  function renderGlobalSearch(){
    const q=$('#globalSearchInput')?.value.trim().toLowerCase()||''; const out=$('#globalSearchResults'); if(!out)return;
    if(!q){out.classList.remove('open');out.innerHTML='';return;}
    const results=[];
    (state.beats||[]).forEach(b=>{const hay=[b.name,b.source,b.lyrics,b.comments,b.structure,b.credits,b.bpm,b.key,b.priority,b.stage,b.owner,b.uploadStatus].join(' ').toLowerCase(); if(hay.includes(q))results.push({type:'Beat',title:b.name,sub:[b.bpm&&b.bpm+' BPM',b.key,b.owner,b.uploadStatus].filter(Boolean).join(' · '),go:()=>openBeatContext(b.id)});});
    (state.mixtapes||[]).forEach(m=>{const hay=[m.name,m.description,m.status].join(' ').toLowerCase(); if(hay.includes(q))results.push({type:'Mixtape',title:m.name,sub:`${(m.beatIds||[]).length} beats · ${m.status||''}`,go:()=>{document.querySelector('[data-tab="mixtapes"]')?.click();setTimeout(()=>openMixtape(m.id),80)}});});
    (state.albums||[]).forEach(a=>{const hay=[a.name,a.status,a.assignee,a.deadline].join(' ').toLowerCase(); if(hay.includes(q))results.push({type:'Album',title:a.name,sub:`${(a.beatIds||[]).length} demoer · ${a.status||''}`,go:()=>{document.querySelector('[data-tab="albums"]')?.click();setTimeout(()=>openAlbum(a.id),80)}});});
    out.innerHTML=results.slice(0,40).map((r,i)=>`<div class="global-result" data-i="${i}"><div class="global-result-type">${safeEsc(r.type)}</div><div style="min-width:0"><div class="global-result-title">${safeEsc(r.title)}</div><div class="global-result-sub">${safeEsc(r.sub||'')}</div></div></div>`).join('')||`<div class="global-result"><div class="global-result-sub">Ingen treff.</div></div>`;
    out.classList.add('open'); $$('.global-result[data-i]',out).forEach(el=>el.onclick=()=>{results[Number(el.dataset.i)]?.go(); out.classList.remove('open');});
  }
  window.openBeatContext=function(id){const mt=(state.mixtapes||[]).find(m=>(m.beatIds||[]).includes(id)); const al=(state.albums||[]).find(a=>(a.beatIds||[]).includes(id)); if(mt){document.querySelector('[data-tab="mixtapes"]')?.click();setTimeout(()=>{openMixtape(mt.id);setTimeout(()=>document.getElementById('abi-'+id)?.scrollIntoView({behavior:'smooth',block:'center'}),120)},80);} else if(al){document.querySelector('[data-tab="albums"]')?.click();setTimeout(()=>{openAlbum(al.id);setTimeout(()=>document.getElementById('abi-'+id)?.scrollIntoView({behavior:'smooth',block:'center'}),120)},80);} };

  function installQueueDrawer(){
    if($('#queueDrawer'))return; const d=document.createElement('div'); d.id='queueDrawer'; d.className='queue-drawer';
    d.innerHTML=`<div class="queue-hd"><strong>Play queue</strong><button class="ghost-btn" onclick="document.getElementById('queueDrawer').classList.remove('open')">Lukk</button></div><div id="queueList" class="queue-list"></div><div class="queue-hd"><strong>Recently played</strong></div><div id="recentList" class="queue-list"></div>`;document.body.appendChild(d);
    const btn=document.createElement('button');btn.id='queueToggleBtn';btn.className='ghost-btn';btn.textContent='Kø';btn.onclick=()=>{d.classList.toggle('open');renderQueueDrawer();}; $('.bp-right')?.prepend(btn);
  }
  function renderQueueDrawer(){const q=$('#queueList'), r=$('#recentList'); if(q){q.innerHTML=(bottomPlayer.queue||[]).map((b,i)=>`<div class="queue-item ${i===bottomPlayer.index?'active':''}" onclick="playBottomIndex(${i})"><span class="queue-num">${i+1}</span><div style="min-width:0"><div class="queue-title">${safeEsc(b.name)}</div><div class="queue-sub">${safeEsc(bottomPlayer.context?.label||'Queue')}</div></div></div>`).join('')||'<div class="queue-item"><span class="queue-sub">Køen er tom.</span></div>';} if(r){r.innerHTML=(state.settings.recentlyPlayed||[]).slice(0,12).map(id=>state.beats.find(b=>b.id===id)).filter(Boolean).map(b=>`<div class="queue-item" onclick="playSingleBeat('${b.id}')"><span class="queue-num">▶</span><div class="queue-title">${safeEsc(b.name)}</div></div>`).join('')||'<div class="queue-item"><span class="queue-sub">Ingen nylig spilte.</span></div>';}}
  const oldPlayIndex=window.playBottomIndex; if(oldPlayIndex){window.playBottomIndex=async function(i){await oldPlayIndex(i); const b=bottomPlayer.queue?.[bottomPlayer.index]; if(b){state.settings.recentlyPlayed=[b.id,...(state.settings.recentlyPlayed||[]).filter(x=>x!==b.id)].slice(0,30); if(oldSave)oldSave();} renderQueueDrawer();};}
  bottomPlayer?.audio?.addEventListener('timeupdate',()=>{const b=bottomPlayer.queue?.[bottomPlayer.index]; if(!b)return; const s=parseTime(b.loopStart), e=parseTime(b.loopEnd); if(s!=null&&e!=null&&e>s&&bottomPlayer.audio.currentTime>=e){bottomPlayer.audio.currentTime=s; showLoopFlash(b.id);}});
  function showLoopFlash(id){const card=$('#abi-'+id); if(card){card.classList.add('loop-active');setTimeout(()=>card.classList.remove('loop-active'),700);}}

  async function drawWaveformForBeat(id,holder){
    if(!holder||holder.dataset.drawn)return; holder.dataset.drawn='1'; holder.classList.add('loading');
    try{let blob=await audioDB.load(id); if(!blob){holder.textContent='Waveform kun for lokale lydfiler'; holder.classList.remove('loading'); return;}
      const buf=await blob.arrayBuffer(); const ctx=new (window.AudioContext||window.webkitAudioContext)(); const audio=await ctx.decodeAudioData(buf.slice(0)); const data=audio.getChannelData(0); const canvas=document.createElement('canvas'); canvas.width=900; canvas.height=110; const c=canvas.getContext('2d'); c.clearRect(0,0,900,110); c.globalAlpha=.95; c.strokeStyle=getComputedStyle(document.documentElement).getPropertyValue('--accent')||'#f59e0b'; c.lineWidth=2; const step=Math.ceil(data.length/450); c.beginPath(); for(let i=0;i<450;i++){let min=1,max=-1; for(let j=0;j<step;j++){const v=data[(i*step)+j]||0;if(v<min)min=v;if(v>max)max=v;} const x=i*2; c.moveTo(x,55+min*48); c.lineTo(x,55+max*48);} c.stroke(); holder.innerHTML=''; holder.appendChild(canvas); const b=state.beats.find(x=>x.id===id); if(b){b.duration=Math.round(audio.duration); if(!b.fileSize)b.fileSize=blob.size; if(!b.fileType)b.fileType=blob.type; if(oldSave)oldSave();} ctx.close?.();
    }catch(e){console.warn(e); holder.textContent='Kunne ikke tegne waveform';} finally{holder.classList.remove('loading');}
  }
  function enhanceWaveforms(){ $$('.album-beat-card').forEach(card=>{const id=card.dataset.beatId; const w=$('.waveform',card); if(id&&w&&!w.dataset.hasClick){w.dataset.hasClick='1'; w.textContent='Klikk for waveform'; w.onclick=(e)=>{e.stopPropagation();drawWaveformForBeat(id,w)}; drawWaveformForBeat(id,w);}}); }

  function addExtendedMeta(){ return;
    $$('.album-beat-card').forEach(card=>{const id=card.dataset.beatId; const b=state.beats.find(x=>x.id===id); if(!b)return; const ex=$('.ux-extra-fields',card); if(ex&&!$('.full-meta-extra',ex)){
      ex.insertAdjacentHTML('beforeend',`<div class="full-meta-extra"><div class="meta-mini-grid"><input class="ux-input" type="date" title="Deadline" value="${safeEsc(b.deadline||'')}" onchange="updateBeatMeta('${id}','deadline',this.value)"><input class="ux-input" placeholder="Ansvarlig" value="${safeEsc(b.assignee||'')}" onchange="updateBeatMeta('${id}','assignee',this.value)"><select class="ux-input" onchange="updateBeatMeta('${id}','uploadStatus',this.value)"><option ${b.uploadStatus==='sendt inn'?'selected':''}>sendt inn</option><option ${b.uploadStatus==='hørt'?'selected':''}>hørt</option><option ${b.uploadStatus==='favoritt'?'selected':''}>favoritt</option><option ${b.uploadStatus==='valgt til album'?'selected':''}>valgt til album</option><option ${b.uploadStatus==='trenger ny versjon'?'selected':''}>trenger ny versjon</option></select></div><div class="structure-tags"><span class="structure-tag">Intro</span><span class="structure-tag">Verse</span><span class="structure-tag">Hook</span><span class="structure-tag">Bridge</span><span class="structure-tag">Outro</span></div><div class="hint" style="margin-top:8px">Metadata: ${safeEsc(b.fileType||'ukjent filtype')} · ${b.fileSize?Math.round(b.fileSize/1024/1024*10)/10+' MB':'ukjent størrelse'} · ${b.duration?fmtTime(b.duration):'ukjent varighet'} · ${b.uploadedAt?new Date(b.uploadedAt).toLocaleDateString('no-NO'):''}</div></div>`);
      if(isProducer()&&b.owner&&state.settings.producerName&&b.owner!==state.settings.producerName&&b.owner!=='Produsent'){card.classList.add('producer-locked'); ex.querySelectorAll('input,select,textarea,button').forEach(x=>{if(!/play/i.test(x.textContent||''))x.disabled=true;});}
      if(isProducer()&&(!b.owner||b.owner===state.settings.producerName||b.owner==='Produsent'))card.classList.add('producer-owned');
    }});
  }

  function updateArchiveToolbarButtons(){
    const album=(state.albums||[]).find(x=>x.id===currentAlbumId);
    const mixtape=(state.mixtapes||[]).find(x=>x.id===currentMixtapeId);
    const albumBtn=document.getElementById('archiveAlbumBtn');
    if(albumBtn){
      albumBtn.style.display=album?'inline-flex':'none';
      albumBtn.textContent=album?(typeof archiveLabel==='function'?archiveLabel:window.archiveLabel)('album',album):'Arkiver album';
      albumBtn.onclick=function(e){e?.stopPropagation?.(); archiveCurrentCollection('album');};
    }
    const mixtapeBtn=document.getElementById('archiveMixtapeBtn');
    if(mixtapeBtn){
      mixtapeBtn.style.display=mixtape?'inline-flex':'none';
      mixtapeBtn.textContent=mixtape?(typeof archiveLabel==='function'?archiveLabel:window.archiveLabel)('mixtape',mixtape):'Arkiver mixtape';
      mixtapeBtn.onclick=function(e){e?.stopPropagation?.(); archiveCurrentCollection('mixtape');};
    }
    document.querySelectorAll('.mv-archive-detail-toolbar').forEach(el=>el.remove());
  }
  window.updateArchiveToolbarButtons=updateArchiveToolbarButtons;
  window.archiveCurrentCollection=function(type){
    if(type==='album'){
      const item=(state.albums||[]).find(x=>x.id===currentAlbumId);
      if(item) toggleArchiveItem('album', item.id);
      return;
    }
    const item=(state.mixtapes||[]).find(x=>x.id===currentMixtapeId);
    if(item) toggleArchiveItem('mixtape', item.id);
  };

  function installArchiveControls(){
    updateArchiveToolbarButtons();
    // Global "Vis arkiv" button removed: archive has its own tab.
    $('#archiveToggleGlobal')?.closest('.archive-toolbar')?.remove();
    document.querySelectorAll('.mv-archive-detail-toolbar').forEach(el=>el.remove());
    if(!state.settings.showArchived){(state.albums||[]).forEach((al,i)=>{if(al.archived) $$('.album-card')[i]?.classList.add('archive-hidden')}); (state.mixtapes||[]).forEach((mt,i)=>{if(mt.archived) $$('.cassette-card')[i]?.classList.add('archive-hidden')});}
  }
  window.toggleShowArchived=function(){state.settings.showArchived=!state.settings.showArchived;saveState();renderAll();};
  window.toggleArchiveItem=function(type,id){const arr=type==='album'?state.albums:state.mixtapes; const item=arr.find(x=>x.id===id); if(!item)return; item.archived=!item.archived; saveState(); renderAll(); updateArchiveToolbarButtons?.(); showToast(item.archived?'✓ Arkivert':'✓ Gjenopprettet','Angre',()=>{item.archived=!item.archived;saveState();renderAll();updateArchiveToolbarButtons?.();});};

  function createModal(id,title,body){let m=$('#'+id); if(!m){m=document.createElement('div');m.id=id;m.className='modal';m.innerHTML=`<div class="modal-card modal-sm"><div class="modal-hd"><div class="modal-hd-left"><h2>${title}</h2></div><div class="modal-hd-right"><button class="close-btn" onclick="closeModal('${id}')">×</button></div></div><div class="modal-body" style="padding:22px 28px 28px;display:grid;gap:14px"></div></div>`;document.body.appendChild(m);} $('.modal-body',m).innerHTML=body; return m;}
  window.openCassetteCropEditor=function(id){const mt=state.mixtapes.find(x=>x.id===id); if(!mt){return} const body=`<div class="crop-editor-stage" style="--cass-color:${safeEsc(cassColor(mt,state.mixtapes.indexOf(mt)))};--zoom:${mt.coverZoom||1};--pos-x:${mt.coverPosX||50}%;--pos-y:${mt.coverPosY||50}%">${mt.cover?`<img id="cropPreviewImg" src="${safeEsc(mt.cover)}">`:'<div style="display:grid;place-items:center;height:100%;color:#fff">Ingen kassettbilde</div>'}</div><label class="ghost-btn" style="cursor:pointer;justify-content:center">Bytt bilde<input type="file" hidden accept="image/*" onchange="cassetteCropUpload('${id}',this.files[0])"></label><label>Zoom<input id="cropZoom" type="range" min="1" max="2.4" step=".05" value="${mt.coverZoom||1}" oninput="cassetteCropChange('${id}','coverZoom',this.value)"></label><label>Horisontal posisjon<input type="range" min="0" max="100" value="${mt.coverPosX||50}" oninput="cassetteCropChange('${id}','coverPosX',this.value)"></label><label>Vertikal posisjon<input type="range" min="0" max="100" value="${mt.coverPosY||50}" oninput="cassetteCropChange('${id}','coverPosY',this.value)"></label><button class="primary-btn" onclick="saveState();renderMixtapeDetail();renderMixtapes();closeModal('cassetteCropModal');showToast('✓ Kassettbilde lagret')">Lagre</button>`; createModal('cassetteCropModal','Rediger kassettbilde',body).classList.add('open');};
  window.cassetteCropChange=function(id,key,val){const mt=state.mixtapes.find(x=>x.id===id); if(!mt)return; mt[key]=Number(val); const st=$('.crop-editor-stage'); if(st){st.style.setProperty('--zoom',mt.coverZoom||1);st.style.setProperty('--pos-x',(mt.coverPosX||50)+'%');st.style.setProperty('--pos-y',(mt.coverPosY||50)+'%');}};
  window.cassetteCropUpload=function(id,file){if(!file)return;const r=new FileReader();r.onload=e=>{const mt=state.mixtapes.find(x=>x.id===id); if(mt){mt.cover=e.target.result;openCassetteCropEditor(id)}};r.readAsDataURL(file);};
  const oldCassCoverStyle=window.cassCoverStyle; if(oldCassCoverStyle){window.cassCoverStyle=function(cover){return oldCassCoverStyle(cover)}}

  function installImportPreview(){const inp=$('#importInput'); if(!inp||inp.dataset.fullPreview)return; inp.dataset.fullPreview='1'; inp.addEventListener('change',e=>{e.stopImmediatePropagation(); const f=e.target.files?.[0]; if(!f)return; const r=new FileReader(); r.onload=()=>{try{const raw=JSON.parse(r.result); const imp=typeof migrate==='function'?migrate(raw):raw; const body=`<p class="hint">Sjekk backupen før import. Import erstatter nåværende lokale data.</p><div class="import-preview-list"><div class="import-preview-row"><span>Beats</span><strong>${(imp.beats||[]).length}</strong></div><div class="import-preview-row"><span>Mixtapes</span><strong>${(imp.mixtapes||[]).length}</strong></div><div class="import-preview-row"><span>Albumer</span><strong>${(imp.albums||[]).length}</strong></div></div><button class="primary-btn" id="confirmImportPreview">Importer backup</button>`; const m=createModal('importPreviewModal','Import-preview',body); m.classList.add('open'); $('#confirmImportPreview').onclick=()=>{Object.keys(state).forEach(k=>delete state[k]);Object.assign(state,imp);ensureFullData();currentAlbumId=null;currentMixtapeId=null;saveState();renderAll();closeModal('importPreviewModal');showToast('✓ Backup importert');};}catch(err){alert('Ugyldig fil.')}}; r.readAsText(f);},true);}

  function installProducerEnhancements(){
    if(isProducer()&&!state.settings.producerName){const n=prompt('Produsentnavn for uploads?', 'Produsent')||'Produsent'; state.settings.producerName=n; saveState();}
    const dash=$('#producerDashboard'); if(dash&&!$('#producerNotifications')){const mine=(state.beats||[]).filter(b=>b.owner===state.settings.producerName||b.producerName===state.settings.producerName); const action=mine.filter(b=>['favoritt','valgt til album','trenger ny versjon'].includes(b.uploadStatus)).length; dash.insertAdjacentHTML('beforeend',`<div id="producerNotifications" class="upgrade-panel" style="margin-top:14px"><h3>Mine uploads <span class="notification-badge">${action}</span></h3><p class="hint">${mine.length} beats lastet opp av ${safeEsc(state.settings.producerName||'produsent')}.</p></div>`);}
    const badge=$('#roleBadge'); if(badge&&isProducer()&&state.settings.producerName) badge.textContent='Produsent · '+state.settings.producerName;
  }
  const oldCreateBeat=window.createBeatFromFile; if(oldCreateBeat){window.createBeatFromFile=async function(file){const b=await oldCreateBeat(file); if(b){b.owner=isProducer()?(state.settings.producerName||'Produsent'):'Admin';b.producerName=b.owner;b.uploadStatus=b.uploadStatus||'sendt inn';b.uploadedAt=Date.now();b.fileType=file.type||b.fileType||'';b.fileSize=file.size||b.fileSize||0;saveState();} return b;};}

  function installResetDemo(){if($('#resetDemoBtn'))return; const area=$('#integrationsTab .content-panel')||$('#integrationsTab')||document.body; area.insertAdjacentHTML('beforeend',`<div class="upgrade-panel"><h3>Data-verktøy</h3><div class="upgrade-row"><button id="resetDemoBtn" class="small-btn danger">Reset lokale data</button><button id="loadDemoBtn" class="ghost-btn">Last inn demo-data</button><span class="hint">Bruk med forsiktighet. Backup anbefales først.</span></div></div>`); $('#resetDemoBtn').onclick=()=>showDeleteConfirm('Nullstille all lokal data?',()=>{localStorage.removeItem('mvState');location.reload();}); $('#loadDemoBtn').onclick=()=>{state.mixtapes.unshift({id:uid(),name:'Demo Mixtape',beatIds:[],color:'#6d8fbd',status:'Åpen for uploads',createdAt:Date.now()});state.albums.unshift({id:uid(),name:'Demo Album',beatIds:[],status:'Idé',createdAt:Date.now()});saveState();renderAll();showToast('✓ Demo-data lagt til');};}

  function addPipelineInputs(){ $$('.pipeline-beat-row').forEach(row=>{if($('.pipeline-extra',row))return; const name=$('.pipeline-beat-name',row)?.textContent; const b=state.beats.find(x=>x.name===name); if(!b)return; row.insertAdjacentHTML('beforeend',`<div class="pipeline-extra" style="display:flex;gap:6px;flex-wrap:wrap"><input class="ux-input" style="width:130px;padding:6px 8px" type="date" value="${safeEsc(b.deadline||'')}" onchange="updateBeatMeta('${b.id}','deadline',this.value)"><input class="ux-input" style="width:120px;padding:6px 8px" placeholder="Ansvarlig" value="${safeEsc(b.assignee||'')}" onchange="updateBeatMeta('${b.id}','assignee',this.value)"></div>`);});}

  const oldRenderAll2=window.renderAll; window.renderAll=function(){ensureFullData(); if(oldRenderAll2)oldRenderAll2(); setTimeout(runFullEnhancements,0);};
  const oldRenderAlbumBeats2=window.renderAlbumBeats; if(oldRenderAlbumBeats2){window.renderAlbumBeats=function(beats,mode,customEl){oldRenderAlbumBeats2(beats,mode,customEl); setTimeout(()=>{enhanceWaveforms();addExtendedMeta();},0);};}
  function runFullEnhancements(){installGlobalSearch();installQueueDrawer();installArchiveControls();installImportPreview();installProducerEnhancements();installResetDemo();enhanceWaveforms();addExtendedMeta();addPipelineInputs();renderQueueDrawer();}
  ensureFullData(); setTimeout(()=>{try{runFullEnhancements(); renderQueueDrawer();}catch(e){console.error(e)}},120);
})();

// === main-script-3 ===
(function(){
  // Full arkiv-funksjon: arkiverte elementer skjules fra statistikk og vanlige lister,
  // men vises samlet under egen fane "Arkivert".
  const ACTIVE_FILTER_FLAG='__mvRenderingActiveOnly';

  function activeTab(){return document.querySelector('.tab-btn.active')?.dataset?.tab||'mixtapes';}
  function isArchiveTab(){return activeTab()==='archive';}
  function beatById(id){return (state.beats||[]).find(b=>b.id===id);}
  function isArchivedBeat(id){const b=beatById(id);return !!(b&&b.archived);}
  function activeBeatIds(ids){return (ids||[]).filter(id=>!isArchivedBeat(id));}
  function activeBeatCount(ids){return activeBeatIds(ids).length;}
  function show(msg){if(typeof showToast==='function')showToast(msg);}

  function ensureArchiveData(){
    state.settings=state.settings||{};
    state.settings.showArchived=false;
    (state.beats||[]).forEach(b=>{b.archived=!!b.archived;});
    (state.albums||[]).forEach(a=>{a.archived=!!a.archived; a.beatIds=a.beatIds||[];});
    (state.mixtapes||[]).forEach(m=>{m.archived=!!m.archived; m.beatIds=m.beatIds||[];});
  }

  const oldRenderStats=window.renderStats;
  window.renderStats=function(){
    ensureArchiveData();
    const byId=new Map((state.beats||[]).map(b=>[b.id,b]));
    const mixtapeBeatIds=new Set((state.mixtapes||[]).filter(mt=>!mt.archived).flatMap(mt=>activeBeatIds(mt.beatIds)));
    const albumDemoIds=new Set((state.albums||[]).filter(a=>!a.archived).flatMap(a=>activeBeatIds(a.beatIds)));
    const mixtapeBeats=[...mixtapeBeatIds].map(id=>byId.get(id)).filter(b=>b&&!b.archived);
    const albumDemos=[...albumDemoIds].map(id=>byId.get(id)).filter(b=>b&&!b.archived);
    const set=(id,val)=>{const el=document.getElementById(id);if(el)el.textContent=val;};
    set('beatCount',mixtapeBeats.length);
    set('favCount',mixtapeBeats.filter(b=>b.favorite).length);
    set('demoCount',albumDemos.length);
    const avg=albumDemos.length?Math.round(albumDemos.reduce((s,d)=>s+Number(d.done||0),0)/albumDemos.length):0;
    set('avgDone',avg+'%');
  };

  function withFilteredCollections(kind,fn){
    ensureArchiveData();
    if(isArchiveTab())return fn();
    const key=kind==='album'?'albums':'mixtapes';
    const original=state[key];
    state[key]=(original||[]).filter(x=>!x.archived);
    window[ACTIVE_FILTER_FLAG]=true;
    try{return fn();}finally{state[key]=original;window[ACTIVE_FILTER_FLAG]=false;}
  }

  const oldRenderAlbums=window.renderAlbums;
  if(oldRenderAlbums){
    window.renderAlbums=function(){
      if(currentAlbumId){return renderAlbumDetail();}
      return withFilteredCollections('album',()=>oldRenderAlbums());
    };
  }
  const oldRenderMixtapes=window.renderMixtapes;
  if(oldRenderMixtapes){
    window.renderMixtapes=function(){
      if(currentMixtapeId){return renderMixtapeDetail();}
      return withFilteredCollections('mixtape',()=>oldRenderMixtapes());
    };
  }

  const oldGetSortedMixtapeBeats=window.getSortedMixtapeBeats;
  if(oldGetSortedMixtapeBeats){
    window.getSortedMixtapeBeats=function(mt){
      const arr=oldGetSortedMixtapeBeats(mt)||[];
      return (mt&&mt.archived)||isArchiveTab()?arr:arr.filter(b=>!b.archived);
    };
  }

  const oldRenderAlbumBeats=window.renderAlbumBeats;
  if(oldRenderAlbumBeats){
    window.renderAlbumBeats=function(beats,mode,customEl){
      ensureArchiveData();
      const listMode=mode||'album';
      const col=listMode==='mixtape'?(state.mixtapes||[]).find(m=>m.id===currentMixtapeId):(state.albums||[]).find(a=>a.id===currentAlbumId);
      const includeArchived=!!(col&&col.archived)||isArchiveTab();
      const filtered=includeArchived?(beats||[]):(beats||[]).filter(b=>!b.archived);
      oldRenderAlbumBeats(filtered,mode,customEl);
      setTimeout(()=>installBeatArchiveButtons(listMode),0);
    };
  }

  const oldRenderBeats=window.renderBeats;
  if(oldRenderBeats){
    window.renderBeats=function(container,beats,albumMode){
      const includeArchived=isArchiveTab();
      if(Array.isArray(beats)&&!includeArchived)beats=beats.filter(b=>!b.archived);
      oldRenderBeats(container,beats,albumMode);
      setTimeout(()=>installBeatArchiveButtons('beat'),0);
    };
  }

  function archiveLabel(type,item){
    if(type==='beat')return item.archived?'Gjenopprett sang':'Arkiver sang';
    if(type==='album')return item.archived?'Gjenopprett album':'Arkiver album';
    return item.archived?'Gjenopprett mixtape':'Arkiver mixtape';
  }
  window.archiveLabel = archiveLabel; // expose so fullUpgradeScript can use it

  window.toggleArchiveItem=function(type,id){
    ensureArchiveData();
    let arr=type==='album'?state.albums:type==='mixtape'?state.mixtapes:state.beats;
    const item=(arr||[]).find(x=>x.id===id);
    if(!item)return;
    item.archived=!item.archived;
    saveState();
    renderAll();
    if(isArchiveTab())renderArchiveView();
    show(item.archived?'✓ Arkivert':'✓ Gjenopprettet fra arkiv');
  };

  window.toggleShowArchived=function(){openArchiveTab();};

  function installArchiveTab(){
    const tabs=document.querySelector('.tabs');
    if(!tabs)return;
    if(!document.querySelector('[data-tab="archive"]')){
      tabs.insertAdjacentHTML('beforeend','<button class="tab-btn" data-tab="archive">🗄️ Arkivert</button>');
    }
    if(!document.getElementById('archiveTab')){
      const integrations=document.getElementById('integrationsTab');
      const sec=document.createElement('section');
      sec.id='archiveTab';
      sec.className='tab-view hidden';
      sec.innerHTML=`<div class="content-panel glass">
        <div class="section-title"><h2>Arkivert</h2><span class="hint">Elementer her teller ikke med i statistikk.</span></div>
        <p class="hint" style="margin-bottom:18px">Arkiverte beats/sanger, albumer og mixtapes skjules fra de vanlige visningene uten å bli slettet.</p>
        <div id="archiveList" class="archive-list"></div>
      </div>`;
      integrations?.insertAdjacentElement('afterend',sec) || document.querySelector('main.app')?.appendChild(sec);
    }
    document.querySelectorAll('[data-tab="archive"]').forEach(btn=>{
      if(btn.dataset.archiveBound)return;
      btn.dataset.archiveBound='1';
      btn.addEventListener('click',function(e){
        e.preventDefault();e.stopImmediatePropagation();
        openArchiveTab();
      },true);
    });
    document.getElementById('archiveToggleGlobal')?.closest('.archive-toolbar')?.remove();
  }

  window.openArchiveTab=function(){
    installArchiveTab();
    document.querySelectorAll('.tab-btn').forEach(b=>b.classList.toggle('active',b.dataset.tab==='archive'));
    document.querySelectorAll('.tab-view').forEach(v=>v.classList.add('hidden'));
    document.getElementById('archiveTab')?.classList.remove('hidden');
    currentAlbumId=null;
    currentMixtapeId=null;
    renderArchiveView();
  };

  window.renderArchiveView=function(){
    ensureArchiveData();
    const el=document.getElementById('archiveList');
    if(!el)return;
    const archivedMixtapes=(state.mixtapes||[]).filter(m=>m.archived);
    const archivedAlbums=(state.albums||[]).filter(a=>a.archived);
    const archivedBeats=(state.beats||[]).filter(b=>b.archived);
    const section=(title,items,empty)=>`<div class="archive-section"><h3>${title} <span>${items.length}</span></h3>${items.length?items.join(''):`<div class="empty">${empty}</div>`}</div>`;
    const beatCard=b=>`<div class="archive-row">
      <div class="archive-main"><strong>${esc(b.name||'Uten navn')}</strong><span>Sang/beat · ${esc(b.source||'lokal')}</span></div>
      <div class="archive-actions"><button class="ghost-btn" onclick="toggleArchiveItem('beat','${b.id}')">Gjenopprett</button></div>
    </div>`;
    const albumCard=a=>`<div class="archive-row">
      <div class="archive-main"><strong>${esc(a.name||'Uten navn')}</strong><span>Album · ${activeBeatCount(a.beatIds)} aktive / ${(a.beatIds||[]).length} totalt</span></div>
      <div class="archive-actions"><button class="ghost-btn" onclick="toggleArchiveItem('album','${a.id}')">Gjenopprett</button><button class="small-btn" onclick="document.querySelector('[data-tab=albums]')?.click();setTimeout(()=>openAlbum('${a.id}'),60)">Åpne</button></div>
    </div>`;
    const mixtapeCard=m=>`<div class="archive-row">
      <div class="archive-main"><strong>${esc(m.name||'Uten navn')}</strong><span>Mixtape · ${activeBeatCount(m.beatIds)} aktive / ${(m.beatIds||[]).length} totalt</span></div>
      <div class="archive-actions"><button class="ghost-btn" onclick="toggleArchiveItem('mixtape','${m.id}')">Gjenopprett</button><button class="small-btn" onclick="document.querySelector('[data-tab=mixtapes]')?.click();setTimeout(()=>openMixtape('${m.id}'),60)">Åpne</button></div>
    </div>`;
    el.innerHTML=section('Mixtapes',archivedMixtapes.map(mixtapeCard),'Ingen arkiverte mixtapes.')+
      section('Albumer',archivedAlbums.map(albumCard),'Ingen arkiverte albumer.')+
      section('Sanger og beats',archivedBeats.map(beatCard),'Ingen arkiverte sanger eller beats.');
  };

  function installBeatArchiveButtons(listMode){
    ensureArchiveData();
    document.querySelectorAll('.album-beat-card[data-beat-id]').forEach(card=>{
      const id=card.dataset.beatId;
      const b=beatById(id);if(!b)return;
      card.classList.toggle('archive-badge',!!b.archived);
      if(card.querySelector('.archive-song-btn')){
        card.querySelector('.archive-song-btn').textContent=archiveLabel('beat',b);
        return;
      }
      const target=card.querySelector('.ab-expand-actions')||card.querySelector('.ab-expand-right')||card.querySelector('.ab-body');
      if(target){
        target.insertAdjacentHTML('beforeend',`<button class="ghost-btn archive-song-btn" onclick="event.stopPropagation();toggleArchiveItem('beat','${id}')">${archiveLabel('beat',b)}</button>`);
      }
    });
    document.querySelectorAll('.beat-item[id^="bi-"]').forEach(item=>{
      const id=item.id.replace(/^bi-/,'');
      const b=beatById(id);if(!b)return;
      item.classList.toggle('archive-badge',!!b.archived);
      if(item.querySelector('.archive-song-btn')){item.querySelector('.archive-song-btn').textContent=archiveLabel('beat',b);return;}
      const target=item.querySelector('.beat-expand-actions')||item.querySelector('.beat-expand');
      if(target)target.insertAdjacentHTML('beforeend',`<button class="ghost-btn archive-song-btn" onclick="event.stopPropagation();toggleArchiveItem('beat','${id}')">${archiveLabel('beat',b)}</button>`);
    });
  }

  function installCollectionArchiveButtons(){
    ensureArchiveData();
    updateArchiveToolbarButtons?.();
    document.querySelectorAll('.mv-archive-detail-toolbar').forEach(el=>el.remove());
  }

  function installArchiveCss(){
    if(document.getElementById('mvArchiveCss'))return;
    document.head.insertAdjacentHTML('beforeend',`
`);
  }

  function patchAddBeatModals(){
    const albumBtn=document.getElementById('addBeatsToAlbumBtn');
    if(albumBtn&&!albumBtn.dataset.archivePatch){
      albumBtn.dataset.archivePatch='1';
      albumBtn.addEventListener('click',function(e){
        e.stopImmediatePropagation();
        const album=(state.albums||[]).find(a=>a.id===currentAlbumId);if(!album)return;
        albumAddBeatCandidates=(state.beats||[]).filter(b=>!b.archived&&!album.beatIds.includes(b.id));
        const search=document.getElementById('beatSearchInput');if(search)search.value='';
        if(typeof renderAlbumAddBeatSearch==='function')renderAlbumAddBeatSearch();
        document.getElementById('addBeatsModal')?.classList.add('open');
        setTimeout(()=>document.getElementById('beatSearchInput')?.focus(),80);
      },true);
    }
    const mixBtn=document.getElementById('addBeatsToMixtapeBtn');
    if(mixBtn&&!mixBtn.dataset.archivePatch){
      mixBtn.dataset.archivePatch='1';
      mixBtn.addEventListener('click',function(e){
        e.stopImmediatePropagation();
        const mt=(state.mixtapes||[]).find(m=>m.id===currentMixtapeId);if(!mt)return;
        mixtapeAddBeatCandidates=(state.beats||[]).filter(b=>!b.archived&&!mt.beatIds.includes(b.id));
        const search=document.getElementById('mixtapeBeatSearchInput');if(search)search.value='';
        if(typeof renderMixtapeAddBeatSearch==='function')renderMixtapeAddBeatSearch();
        document.getElementById('addBeatsToMixtapeModal')?.classList.add('open');
        setTimeout(()=>document.getElementById('mixtapeBeatSearchInput')?.focus(),80);
      },true);
    }
  }

  const prevRenderAll=window.renderAll;
  window.renderAll=function(){
    ensureArchiveData();
    if(prevRenderAll)prevRenderAll();
    renderStats();
    setTimeout(()=>{installArchiveCss();installArchiveTab();installBeatArchiveButtons();installCollectionArchiveButtons();patchAddBeatModals();if(isArchiveTab())renderArchiveView();},0);
  };

  installArchiveCss();
  ensureArchiveData();
  setTimeout(()=>{installArchiveTab();installBeatArchiveButtons();installCollectionArchiveButtons();patchAddBeatModals();renderStats();},150);
})();

// ── Deling, varsler og pitch ──────────────────────────────────────

// ── Deling og varsel-system ──────────────────────────────────────────────
var SB_URL = 'https://ylvqkfdvijqnecuqznyr.supabase.co';
var SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlsdnFrZmR2aWpxbmVjdXF6bnlyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgzMzA4MzIsImV4cCI6MjA5MzkwNjgzMn0.bYPTaxQK8n7I7w5Ri2DVYW5_LbFHg2IXkuhHsLTDDqc';

function sbHeaders(token){
  const t = token || sessionStorage.getItem('sb_access_token') || SB_KEY;
  return {'apikey':SB_KEY,'Authorization':'Bearer '+t,'Content-Type':'application/json'};
}

// ── Varsel-bjelle ─────────────────────────────────────────────────────────
function installNotificationBell(){
  if(document.getElementById('mvNotifBell')) return;
  const bell = document.createElement('button');
  bell.id = 'mvNotifBell';
  bell.className = 'mv-hdr-icon-btn';
  bell.title = 'Varsler';
  bell.setAttribute('aria-label','Varsler');
  bell.style.cssText = 'position:relative;font-size:16px;';
  bell.innerHTML = `🔔<span id="mvNotifCount" style="
    display:none;position:absolute;top:3px;right:3px;
    background:#fb7185;color:#fff;font-size:9px;font-weight:900;
    border-radius:999px;padding:1px 4px;font-family:system-ui;min-width:14px;
    text-align:center;line-height:1.4;pointer-events:none;
  "></span>`;
  bell.onclick = () => openNotifPanel();

  // Place inside header slot if available, otherwise fixed fallback
  const slot = document.getElementById('mvNotifBellSlot');
  if(slot){
    slot.appendChild(bell);
  } else {
    bell.style.cssText += ';position:fixed;top:12px;right:60px;z-index:8050;';
    document.body.appendChild(bell);
  }
  loadNotifications();
}

async function loadNotifications(){
  const uid = window._mvCurrentUserId;
  if(!uid) return;
  try{
    const {data:{session}} = await window.supabaseClient.auth.getSession();
    const token = session?.access_token;
    const res = await fetch(`${SB_URL}/rest/v1/notifications?recipient_id=eq.${uid}&order=created_at.desc&limit=20`, {
      headers: sbHeaders(token)
    });
    if(!res.ok) return;
    const notifs = await res.json();
    const unread = notifs.filter(n=>!n.read).length;
    const countEl = document.getElementById('mvNotifCount');
    if(countEl){
      countEl.textContent = unread > 9 ? '9+' : unread;
      countEl.style.display = unread > 0 ? 'block' : 'none';
    }
    window._mvNotifications = notifs;
  }catch(e){}
}

function openNotifPanel(){
  let panel = document.getElementById('mvNotifPanel');
  if(!panel){
    panel = document.createElement('div');
    panel.id = 'mvNotifPanel';
    panel.style.cssText = `
      position:fixed;top:50px;right:120px;z-index:8200;
      background:#1a1612;border:1px solid rgba(255,255,255,.12);
      border-radius:12px;width:320px;max-height:420px;overflow-y:auto;
      box-shadow:0 16px 48px rgba(0,0,0,.6);font-family:system-ui;
    `;
    document.body.appendChild(panel);
    document.addEventListener('click', e=>{
      if(!panel.contains(e.target) && e.target.id!=='mvNotifBell'){
        panel.style.display='none';
      }
    });
  }
  const notifs = window._mvNotifications || [];
  const typeLabels = {
    share_beat:    '🎵 Ny sang delt med deg',
    share_album:   '💿 Nytt album delt med deg',
    share_mixtape: '📼 Ny mixtape delt med deg',
    new_beat:      '🎵 Ny sang tilgjengelig',
    new_album:     '💿 Nytt album tilgjengelig',
    new_mixtape:   '📼 Ny mixtape tilgjengelig',
    label_invite:  '🏷 Labelinvitasjon',
    label_left:    '👋 Artist forlot labelen',
    label_comment: '💬 Kommentar fra label'
  };
  panel.innerHTML = `
    <div style="padding:14px 16px;border-bottom:1px solid rgba(255,255,255,.08);display:flex;align-items:center;justify-content:space-between">
      <span style="font-size:13px;font-weight:800;color:#f4ede4">Varsler</span>
      ${notifs.some(n=>!n.read)?`<button onclick="markAllNotifsRead()" style="background:none;border:none;color:rgba(255,255,255,.4);font-size:11px;cursor:pointer;font-family:system-ui">Merk alle som lest</button>`:''}
    </div>
    ${notifs.length ? notifs.map(n=>`
      <div style="padding:12px 16px;border-bottom:1px solid rgba(255,255,255,.06);background:${n.read?'transparent':'rgba(244,164,67,.06)'}">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px">
          <div style="flex:1;min-width:0">
            <div style="font-size:12px;font-weight:700;color:${n.read?'rgba(255,255,255,.5)':'#f4ede4'}">${typeLabels[n.type]||n.type}</div>
            <div style="font-size:13px;color:#f4a443;font-weight:800;margin:3px 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${n.content_name||n.content_id}</div>
            <div style="font-size:11px;color:rgba(255,255,255,.35);margin-bottom:${n.type==='label_invite'?'8px':'0'}">${n.type==='label_invite'?'Label-invitasjon':n.role==='editor'?'Redaktørtilgang':'Visningsmodus'} · ${new Date(n.created_at).toLocaleDateString('no-NO')}</div>
            ${n.type==='label_invite'?`<div style="display:flex;gap:8px">
              <button onclick="window.labelRespondInvite('${n.content_id}','${n.id}',true)" style="background:rgba(52,211,153,.15);border:1px solid rgba(52,211,153,.3);color:#34d399;font-size:11px;font-weight:800;padding:5px 14px;cursor:pointer;font-family:system-ui">✓ Aksepter</button>
              <button onclick="window.labelRespondInvite('${n.content_id}','${n.id}',false)" style="background:rgba(251,113,133,.1);border:1px solid rgba(251,113,133,.3);color:#fb7185;font-size:11px;font-weight:800;padding:5px 14px;cursor:pointer;font-family:system-ui">✕ Avslå</button>
            </div>`:''}
          </div>
          <button onclick="window.deleteNotif('${n.id}')" title="Slett varsel" style="background:none;border:none;color:rgba(255,255,255,.2);cursor:pointer;font-size:14px;padding:2px 4px;flex-shrink:0;line-height:1" onmouseover="this.style.color='rgba(251,113,133,.7)'" onmouseout="this.style.color='rgba(255,255,255,.2)'">✕</button>
        </div>
      </div>
    `).join('') : `<div style="padding:24px 16px;text-align:center;color:rgba(255,255,255,.3);font-size:13px">Ingen varsler</div>`}
  `;
  panel.style.display = panel.style.display==='none' ? 'block' : (panel.style.display||'block');
  // Merk kun ikke-invite varsler som lest
  const hasUnansweredInvites = notifs.some(n=>n.type==='label_invite'&&!n.read);
  if(!hasUnansweredInvites) markAllNotifsRead();
}

window.deleteNotif = async function(notifId){
  const uid = window._mvCurrentUserId;
  if(!uid) return;
  try{
    const {data:{session}} = await window.supabaseClient.auth.getSession();
    await fetch(`${SB_URL}/rest/v1/notifications?id=eq.${notifId}&recipient_id=eq.${uid}`, {
      method:'DELETE', headers:{...sbHeaders(session?.access_token),'Prefer':'return=minimal'}
    });
    // Fjern fra lokal cache og re-render panel
    if(window._mvNotifications){
      window._mvNotifications = window._mvNotifications.filter(n=>n.id!=notifId);
    }
    openNotifPanel();
    loadNotifications();
  }catch(e){}
};

window.markAllNotifsRead = async function(){
  const uid = window._mvCurrentUserId;
  if(!uid) return;
  try{
    const {data:{session}} = await window.supabaseClient.auth.getSession();
    await fetch(`${SB_URL}/rest/v1/notifications?recipient_id=eq.${uid}&read=eq.false`, {
      method:'PATCH', headers:{...sbHeaders(session?.access_token),'Prefer':'return=minimal'},
      body: JSON.stringify({read:true})
    });
    const countEl = document.getElementById('mvNotifCount');
    if(countEl) countEl.style.display='none';
    if(window._mvNotifications) window._mvNotifications.forEach(n=>n.read=true);
  }catch(e){}
};

// ── Del-modal ─────────────────────────────────────────────────────────────
window.openShareModal = async function(contentType, contentId, contentName){
  const uid = window._mvCurrentUserId;
  if(!uid){ showToast('Logg inn for å dele'); return; }

  // Hent eksisterende tilganger
  const {data:{session}} = await window.supabaseClient.auth.getSession();
  const token = session?.access_token;

  const res = await fetch(
    `${SB_URL}/rest/v1/content_access?content_type=eq.${contentType}&content_id=eq.${contentId}&select=*`,
    {headers: sbHeaders(token)}
  );
  const existing = res.ok ? await res.json() : [];

  // Hent brukernavn for eksisterende tilganger
  let granteeNames = {};
  if(existing.length){
    const ids = existing.map(r=>r.grantee_id).filter(Boolean);
    const pr = await fetch(
      `${SB_URL}/rest/v1/rpc/get_usernames`,
      {method:'POST', headers: sbHeaders(token), body: JSON.stringify({p_ids: ids})}
    );
    if(pr.ok){const profiles = await pr.json(); profiles.forEach(p=>granteeNames[p.id]=p.username||p.id);}
  }

  // Build and show share modal with inline styles (avoids CSS class dependency)
  const closeShare = () => { const m = document.getElementById('mvShareItemModal'); if(m) m.style.display='none'; };

  let modal = document.getElementById('mvShareItemModal');
  if(!modal){
    modal = document.createElement('div');
    modal.id = 'mvShareItemModal';
    modal.addEventListener('click', e=>{ if(e.target===modal) closeShare(); });
    document.body.appendChild(modal);
  }

  const typeLabel = {beat:'Beat',album:'Album',mixtape:'Mixtape'}[contentType]||contentType;

  modal.innerHTML = `<div style="background:#1a1612;border:1px solid rgba(255,255,255,.12);max-width:460px;width:100%;padding:24px 28px;position:relative">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
      <h2 style="font-size:16px;font-weight:800;margin:0">Del ${typeLabel}: ${contentName}</h2>
      <button onclick="document.getElementById('mvShareItemModal').style.display='none'" style="background:none;border:none;color:rgba(255,255,255,.5);font-size:20px;cursor:pointer;padding:0;line-height:1">×</button>
    </div>
    <div style="display:grid;gap:16px">
      <div style="display:grid;gap:8px">
        <label style="font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:rgba(255,255,255,.4)">Del med bruker</label>
        <input id="shareUsername" placeholder="Brukernavn (f.eks. erik)"
          style="width:100%;box-sizing:border-box;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);color:#f4ede4;padding:10px 12px;font-size:13px;font-family:system-ui;outline:none;border-radius:0!important"
          onkeydown="if(event.key==='Enter') window.doShare('${contentType}','${contentId}','${contentName}')">
        <div style="display:flex;gap:8px">
          <select id="shareRole" style="flex:1;background:#1a1612;border:1px solid rgba(255,255,255,.12);color:#f4ede4;padding:10px 12px;font-size:13px;font-family:system-ui;outline:none">
            <option value="viewer">Visningsmodus</option>
            <option value="editor">Redaktør</option>
          </select>
          <button onclick="window.doShare('${contentType}','${contentId}','${contentName}')" style="background:#f4a443;border:none;color:#000;font-size:13px;font-weight:800;padding:10px 20px;cursor:pointer;font-family:system-ui;white-space:nowrap">Del</button>
        </div>
        <div id="shareStatus" style="font-size:11px;color:rgba(255,255,255,.4);min-height:16px"></div>
      </div>
      <div>
        <div style="font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:rgba(255,255,255,.4);margin-bottom:10px">Har tilgang</div>
        <div id="shareAccessList">
          ${existing.length ? existing.map(r=>`
            <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.06)">
              <span style="font-size:13px;font-weight:700;color:#f4ede4;flex:1">👤 ${granteeNames[r.grantee_id]||r.grantee_id}</span>
              <span style="font-size:11px;color:rgba(255,255,255,.4)">${r.role==='editor'?'Redaktør':'Visningsmodus'}</span>
              <button onclick="window.revokeShare('${contentType}','${contentId}','${r.grantee_id}')" style="background:none;border:none;color:rgba(255,100,100,.6);cursor:pointer;font-size:13px;padding:2px 6px">✕</button>
            </div>
          `).join('') : '<div style="font-size:12px;color:rgba(255,255,255,.3)">Ingen har tilgang ennå</div>'}
        </div>
      </div>
    </div>
  </div>`;

  modal.style.cssText = 'position:fixed;inset:0;z-index:9000;background:rgba(0,0,0,.75);display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px)';
};

window.doShare = async function(contentType, contentId, contentName){
  const username = document.getElementById('shareUsername')?.value?.trim().toLowerCase();
  const role = document.getElementById('shareRole')?.value || 'viewer';
  const status = document.getElementById('shareStatus');
  if(!username){ if(status) status.textContent='Skriv inn et brukernavn'; return; }

  const {data:{session}} = await window.supabaseClient.auth.getSession();
  const token = session?.access_token;
  const uid = window._mvCurrentUserId;

  // Finn grantee via username (sikker RPC)
  const pr = await fetch(`${SB_URL}/rest/v1/rpc/get_user_id_by_username`, {method:'POST', headers:sbHeaders(token), body: JSON.stringify({p_username: username})});
  const profiles = pr.ok ? await pr.json() : [];
  if(!profiles.length){ if(status) status.textContent=`Finner ingen bruker med brukernavn "${username}"`; return; }
  const granteeId = profiles[0].id;
  if(granteeId === uid){ if(status) status.textContent='Du kan ikke dele med deg selv'; return; }

  // Insert i content_access
  const ir = await fetch(`${SB_URL}/rest/v1/content_access`, {
    method:'POST',
    headers:{...sbHeaders(token),'Prefer':'resolution=merge-duplicates'},
    body: JSON.stringify({content_type:contentType, content_id:contentId, owner_id:uid, grantee_id:granteeId, role})
  });

  if(!ir.ok){ if(status) status.textContent='Kunne ikke dele: '+await ir.text(); return; }

  // Send varsel
  const typeMap = {beat:'share_beat', album:'share_album', mixtape:'share_mixtape'};
  await fetch(`${SB_URL}/rest/v1/notifications`, {
    method:'POST',
    headers:{...sbHeaders(token),'Prefer':'return=minimal'},
    body: JSON.stringify({recipient_id:granteeId, sender_id:uid, type:typeMap[contentType]||'share_beat', content_id:contentId, content_name:contentName, role, read:false})
  });

  // Del alle beats i samlingen automatisk
  if(contentType === 'album' || contentType === 'mixtape'){
    const relTable = contentType === 'album' ? 'album_beats' : 'mixtape_beats';
    const relCol   = contentType === 'album' ? 'album_id'   : 'mixtape_id';
    const relRes = await fetch(
      `${SB_URL}/rest/v1/${relTable}?${relCol}=eq.${contentId}&select=beat_id`,
      {headers: sbHeaders(token)}
    );
    if(relRes.ok){
      const rows = await relRes.json();
      if(rows.length){
        const beatAccessRows = rows.map(r => ({
          content_type: 'beat',
          content_id: String(r.beat_id),
          owner_id: uid,
          grantee_id: granteeId,
          role
        }));
        await fetch(`${SB_URL}/rest/v1/content_access`, {
          method: 'POST',
          headers: {...sbHeaders(token), 'Prefer': 'resolution=merge-duplicates'},
          body: JSON.stringify(beatAccessRows)
        });
      }
    }
  }

  if(status) status.textContent=`✓ Delt med ${username} som ${role==='editor'?'redaktør':'betrakter'}`;
  document.getElementById('shareUsername').value='';
  showToast(`✓ Delt med ${username}`);
};

window.revokeShare = async function(contentType, contentId, granteeId){
  if(!confirm('Fjerne tilgangen?')) return;
  const {data:{session}} = await window.supabaseClient.auth.getSession();
  await fetch(
    `${SB_URL}/rest/v1/content_access?content_type=eq.${contentType}&content_id=eq.${contentId}&grantee_id=eq.${granteeId}`,
    {method:'DELETE', headers:{...sbHeaders(session?.access_token),'Prefer':'return=minimal'}}
  );
  showToast('✓ Tilgang fjernet');
  // Reload modal
  const modal = document.getElementById('mvShareItemModal');
  if(modal) modal.classList.remove('open');
};

// Poll varsler hvert 30s
setInterval(loadNotifications, 30000);

// ── Kjør ved oppstart ────────────────────────────────────────────────────
setTimeout(()=>{
  if(sessionStorage.getItem('mv_unlocked')==='1'){
    installNotificationBell();
  }
}, 1200);

// ── Mixtape pitch-side ────────────────────────────────────────────────────
window.mixtapeShareMode = async function(mixtapeId) {
  const mt = (typeof state !== 'undefined' ? state : window.state)?.mixtapes?.find(m=>m.id===mixtapeId);
  if (!mt) { showToast('Mixtape ikke funnet'); return; }
  const WORKER = window.R2_WORKER_URL || 'https://beat-vault.marcus-aas-mekiassen.workers.dev';

  if (mt._shareToken && mt._shareEnabled !== false) {
    _showMixtapePitchDialog(mixtapeId, `${WORKER}/share/${mt._shareToken}`, WORKER, mt);
    return;
  }

  const token = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  showToast('Publiserer pitch-side...');
  try {
    const beats = (typeof beatsFromIds === 'function' ? beatsFromIds : window.beatsFromIds)(mt.beatIds || []);
    const payload = {
      mt: { id: mt.id, name: mt.name, cover: mt.cover||'', color: mt.color||'#f4a443' },
      beats: beats.map(b => ({ id:b.id, name:b.name, duration:b.duration||0, audio_url:b.audio_url||b.url||'' }))
    };
    const res = await fetch(`${WORKER}/share/${token}`, {
      method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Ukjent feil');
    mt._shareToken = token;
    mt._shareUrl = data.url;
    mt._shareEnabled = true;
    if (typeof saveState === 'function') saveState();
    _showMixtapePitchDialog(mixtapeId, data.url, WORKER, mt);
  } catch(e) {
    showToast('⚠ Kunne ikke publisere: ' + e.message);
  }
};

function _showMixtapePitchDialog(mixtapeId, shareUrl, workerUrl, mt) {
  let modal = document.getElementById('mvMixtapePitchModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'mvMixtapePitchModal';
    modal.addEventListener('click', e => { if(e.target===modal) modal.style.display='none'; });
    document.body.appendChild(modal);
  }

  modal.innerHTML = `<div style="background:#1a1612;border:1px solid rgba(255,255,255,.12);max-width:440px;width:100%;padding:24px 28px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
      <h2 style="font-size:16px;font-weight:800;margin:0">🎤 Pitch mixtape</h2>
      <button onclick="document.getElementById('mvMixtapePitchModal').style.display='none'" style="background:none;border:none;color:rgba(255,255,255,.5);font-size:20px;cursor:pointer;padding:0;line-height:1">×</button>
    </div>
    <div style="display:grid;gap:14px">
      <div style="font-size:12px;color:rgba(255,255,255,.5);font-family:system-ui">Del denne lenken med A&R, labels eller samarbeidspartnere</div>
      <div style="display:flex;gap:8px">
        <input id="mvPitchUrl" readonly style="flex:1;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);color:#f4ede4;padding:9px 12px;font-size:12px;font-family:system-ui;outline:none">
        <button onclick="navigator.clipboard.writeText(document.getElementById('mvPitchUrl').value).then(()=>{this.textContent='✓';setTimeout(()=>this.textContent='Kopier',2000)})" style="background:#f4a443;border:none;color:#000;font-size:12px;font-weight:800;padding:8px 14px;cursor:pointer;font-family:system-ui">Kopier</button>
      </div>
      <div style="display:flex;gap:8px">
        <button onclick="window.open(document.getElementById('mvPitchUrl').value,'_blank')" style="background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);color:#f4ede4;font-size:12px;padding:7px 14px;cursor:pointer;font-family:system-ui">🔗 Åpne</button>
        <button id="mvPitchUpdateBtn" style="background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);color:#f4ede4;font-size:12px;padding:7px 14px;cursor:pointer;font-family:system-ui">🔄 Oppdater</button>
        <button id="mvPitchDisableBtn" style="background:rgba(251,113,133,.1);border:1px solid rgba(251,113,133,.3);color:#fb7185;font-size:12px;padding:7px 14px;cursor:pointer;font-family:system-ui;margin-left:auto">⛔ Deaktiver</button>
      </div>
      <div id="mvPitchStatus" style="font-size:11px;color:rgba(255,255,255,.35);font-family:system-ui;min-height:16px"></div>
    </div>
  </div>`;

  document.getElementById('mvPitchUrl').value = shareUrl;
  document.getElementById('mvPitchStatus').textContent = '';

  document.getElementById('mvPitchUpdateBtn').onclick = async () => {
    const status = document.getElementById('mvPitchStatus');
    status.textContent = 'Oppdaterer...';
    try {
      const beats = (typeof beatsFromIds==='function'?beatsFromIds:window.beatsFromIds)(mt.beatIds||[]);
      const payload = {
        mt: {id:mt.id,name:mt.name,cover:mt.cover||'',color:mt.color||'#f4a443'},
        beats: beats.map(b=>({id:b.id,name:b.name,duration:b.duration||0,audio_url:b.audio_url||b.url||''}))
      };
      const res = await fetch(`${workerUrl}/share/${mt._shareToken}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
      const data = await res.json();
      status.textContent = data.ok ? '✓ Oppdatert' : '⚠ '+data.error;
    } catch(e) { status.textContent = '⚠ '+e.message; }
  };

  document.getElementById('mvPitchDisableBtn').onclick = async () => {
    if (!confirm('Deaktivere pitch-siden?')) return;
    const status = document.getElementById('mvPitchStatus');
    status.textContent = 'Deaktiverer...';
    try {
      await fetch(`${workerUrl}/share/${mt._shareToken}`, {method:'DELETE'});
      mt._shareToken = null; mt._shareUrl = null; mt._shareEnabled = false;
      if(typeof saveState==='function') saveState();
      status.textContent = '✓ Deaktivert. Neste pitch gir ny lenke.';
      setTimeout(()=>{modal.style.display='none';}, 2000);
    } catch(e) { status.textContent = '⚠ '+e.message; }
  };

  modal.style.cssText = 'position:fixed;inset:0;z-index:9000;background:rgba(0,0,0,.75);display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px)';
}

// Expose for lock.js
window.installNotificationBell = installNotificationBell;
