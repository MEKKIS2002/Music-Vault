// === mv-archive-demo-crates-js ===
// Arkiv-tab renderer for Music Vault.
// #archiveTab eksisterer IKKE i index.html — den opprettes dynamisk av ensureTab().
// window.renderArchiveView = render (eksponert for db.js sin tab-handler).
//
// Viser: arkiverte mixtapes, albumer og beats (samlet i demo-kasser).
// Tabben aktiveres via db.js tab-handler (spesialtilfelle for data-tab="archive").
// activate() setter style.display='block' + body.final-archive-active klasse.
// db.js legger til .tab-visible etterpå for opacity-transition.
(function(){
  const MAX_DEMOS_PER_CRATE = 25;
  const STORE_KEY = 'mvArchivePageY';
  const palette = [
    ['#211a15','#090807'],['#28170e','#060505'],['#152019','#050505'],['#241911','#090706']
  ];

  function getState(){ try{ if(typeof state!=='undefined' && state && (state.beats||state.albums||state.mixtapes)) return state; }catch(e){} return window.APP_STATE || window.musicVaultState || window.appState || window.state || {}; }
  function byId(arr,id){ return (arr||[]).find(x=>String(x.id)===String(id)); }
  function safe(v){ return String(v==null?'':v).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
  function ensure(){
    const state=getState();
    state.settings=state.settings||{};
    state.beats=state.beats||[];
    state.albums=state.albums||[];
    state.mixtapes=state.mixtapes||[];
    const defaults=['Gamle demoer','2024 beats','Ikke brukt','Klassikere'];
    const deleted=new Set(state.settings.deletedArchiveCollections||[]);
    const current=(state.settings.archiveCollections||[]).filter(c=>c&&!deleted.has(c));
    const seeds=defaults.filter(c=>!deleted.has(c));
    state.settings.archiveCollections=Array.from(new Set([...current,...seeds]));
    return state;
  }
  function titleOf(x){ return x.name||x.title||x.beatName||'Uten tittel'; }
  function typeName(x){ return x.__type==='album'?'Album':x.__type==='mixtape'?'Mixtape':x.__type==='demo-crate'?'Demo-kasse':'Demo'; }
  function countOf(x){ return x.__type==='beat'?1:(x.__type==='demo-crate'?(x.beats||[]).length:((x.beatIds||[]).length||0)); }
  function coverOf(x){ return x.cover||x.image||x.artwork||x.coverUrl||''; }
  function itemDate(x){ return Number(x.archivedAt||x.updatedAt||x.createdAt||0); }
  function dateLabel(x){ const t=itemDate(x); return t?new Date(t).toLocaleDateString('no-NO',{day:'2-digit',month:'short',year:'numeric'}):'Ukjent dato'; }
  function genreOf(x){ return x.genre||x.style||x.mood||x.status||'Ukjent'; }
  function noteOf(x){ return x.description||x.notes||x.note||x.lyricsNote||'Ingen notat lagt inn ennå.'; }
  function ensureTab(){
    let tab=document.getElementById('archiveTab');
    if(!tab){ tab=document.createElement('section'); tab.id='archiveTab'; tab.className='tab-view hidden'; (document.querySelector('main.app')||document.body).appendChild(tab); }
    let btn=document.querySelector('.tab-btn[data-tab="archive"]');
    if(!btn){ document.querySelector('.tabs')?.insertAdjacentHTML('beforeend','<button class="tab-btn" data-tab="archive">🗄️ Arkivert</button>'); }
    return tab;
  }
  function activate(){
    document.body.classList.add('clean-archive-active','final-archive-active');
    document.querySelectorAll('.tab-btn[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab==='archive'));
    document.querySelectorAll('.tab-view').forEach(v=>{ if(v.id!=='archiveTab'){ v.classList.add('hidden'); v.style.display='none'; } });
    const tab=ensureTab(); tab.classList.remove('hidden'); tab.style.display='block';
  }
  function deactivate(){ document.body.classList.remove('final-archive-active'); }
  function rawArchivedItems(){
    const state=ensure();
    return [
      ...state.mixtapes.filter(x=>x.archived).map(x=>({...x,__type:'mixtape'})),
      ...state.albums.filter(x=>x.archived).map(x=>({...x,__type:'album'})),
      ...state.beats.filter(x=>x.archived).map(x=>({...x,__type:'beat'}))
    ];
  }
  function baseFilteredItems(){
    let arr=rawArchivedItems();
    const q=(window.__faQ||'').trim().toLowerCase();
    const type=window.__faType||'all';
    const sort=window.__faSort||'newest';
    const col=window.__faCollection||'all';
    if(type!=='all') arr=arr.filter(x=> x.__type===type || (type==='demo' && x.__type==='beat'));
    if(col!=='all') arr=arr.filter(x => (x.archiveCollection||'')===col);
    if(q) arr=arr.filter(x => [titleOf(x), typeName(x), genreOf(x), noteOf(x)].join(' ').toLowerCase().includes(q));
    const t=x=>itemDate(x);
    if(sort==='oldest') arr.sort((a,b)=>t(a)-t(b));
    else if(sort==='az') arr.sort((a,b)=>titleOf(a).localeCompare(titleOf(b),'no'));
    else if(sort==='za') arr.sort((a,b)=>titleOf(b).localeCompare(titleOf(a),'no'));
    else arr.sort((a,b)=>t(b)-t(a));
    return arr;
  }
  function archiveCards(){
    const items=baseFilteredItems();
    const nonDemo=items.filter(x=>x.__type!=='beat');
    const demos=items.filter(x=>x.__type==='beat');
    const demoCrates=[];
    for(let i=0;i<demos.length;i+=MAX_DEMOS_PER_CRATE){
      const slice=demos.slice(i,i+MAX_DEMOS_PER_CRATE);
      demoCrates.push({
        __type:'demo-crate',
        id:'demo-crate-'+(demoCrates.length+1),
        name: demoCrates.length ? 'Demo-kasse '+(demoCrates.length+1) : 'Demo-kasse',
        beats:slice,
        archivedAt: Math.max(...slice.map(itemDate),0),
        note:'Single demoer lagres samlet i en egen stor arkivkasse.',
        archiveCollection:'',
      });
    }
    const combined=[...nonDemo, ...demoCrates];
    const sort=window.__faSort||'newest';
    const t=x=>itemDate(x);
    if(sort==='oldest') combined.sort((a,b)=>t(a)-t(b));
    else if(sort==='az') combined.sort((a,b)=>titleOf(a).localeCompare(titleOf(b),'no'));
    else if(sort==='za') combined.sort((a,b)=>titleOf(b).localeCompare(titleOf(a),'no'));
    else combined.sort((a,b)=>t(b)-t(a));
    return combined;
  }
  function demoDiscCount(total){ total=Number(total||0); if(total<=1) return 1; if(total<=3) return 2; if(total<=6) return 3; if(total<=10) return 4; if(total<=15) return 5; if(total<=20) return 6; return 7; }
  function demoDiscMarkup(total){
    const count=demoDiscCount(total);
    const center=(count-1)/2;
    const discs=[];
    for(let i=0;i<count;i++){
      const offset=i-center;
      const depth=(count-1-i);
      const shift='0px';
      const lift=(8 + depth*14).toFixed(1);
      const rot=(offset*0.2).toFixed(1);
      const z=(60 + i).toFixed(1);
      discs.push(`<span class="fa-demo-disc fa-vinyl" style="--disc-i:${i};--disc-z:${z};--disc-shift:${shift};--disc-lift:${lift};--disc-rot:${rot}"></span>`);
    }
    return discs.join('');
  }
  function standardCard(x,i){
    const [c1,c2]=palette[i%palette.length];
    const n=countOf(x), cover=coverOf(x), canPlay=x.__type==='beat'||n>0;
    const state=ensure();
    return `<div class="fa-tile fa-tile--${safe(x.__type)}" style="--i:${i}"><div class="fa-crate"><span class="fa-handle"></span><button class="fa-record" type="button" data-fa-open="${safe(x.__type)}:${safe(x.id)}" style="--c1:${safe(c1)};--c2:${safe(c2)}" aria-label="Åpne ${safe(titleOf(x))}"><span class="fa-shadow"></span><span class="fa-vinyl"></span><span class="fa-sleeve">${cover?`<img src="${safe(cover)}" alt="">`:''}<span class="fa-label">Arkivert</span><span class="fa-info"><h3>${safe(titleOf(x))}</h3><p>${safe(n===1?'1 spor':n+' spor')} · ${safe(typeName(x))}</p></span></span><span class="fa-play" data-fa-play="${safe(x.__type)}:${safe(x.id)}" title="Klikk for å spille">${canPlay?'▶':'·'}</span></button><div class="fa-hover"><div class="fa-meta"><span>${safe(n===1?'1 spor':n+' spor')}</span><span>${safe(dateLabel(x))}</span><span>${safe(genreOf(x))}</span><span>Klikk for å spille</span></div><div class="fa-note">${safe(noteOf(x))}</div><div class="fa-actions"><button class="fa-mini restore" data-fa-restore="${safe(x.__type)}:${safe(x.id)}">Gjenopprett</button><button class="fa-mini" data-fa-open-btn="${safe(x.__type)}:${safe(x.id)}">Åpne</button><select class="fa-collection-select" data-fa-collection-for="${safe(x.__type)}:${safe(x.id)}"><option value="">Ingen samling</option>${state.settings.archiveCollections.map(c=>`<option value="${safe(c)}" ${(x.archiveCollection||'')===c?'selected':''}>${safe(c)}</option>`).join('')}</select></div></div></div></div>`;
  }
  function demoCrateCard(x,i){
    const n=countOf(x);
    const label = x.id==='demo-crate-1' ? 'Demokasse' : titleOf(x);
    return `<div class="fa-tile fa-tile--demo-group" style="--i:${i}"><div class="fa-crate fa-demo-group"><span class="fa-handle"></span><button class="fa-record fa-record--demo-group" type="button" data-fa-open="demo-crate:${safe(x.id)}" aria-label="Åpne ${safe(label)}"><span class="fa-shadow"></span><span class="fa-demo-backboard"></span><span class="fa-demo-stack">${demoDiscMarkup(n)}</span><span class="fa-label">Arkivert</span><span class="fa-demo-card-count">${n}/25 demoer</span><span class="fa-info"><h3>${safe(label)}</h3><p>${safe(n===1?'1 demo':n+' demoer')} · Singles uten sleeve</p></span><span class="fa-play" data-fa-play="demo-crate:${safe(x.id)}" title="Åpne demo-kasse">▶</span></button><div class="fa-hover"><div class="fa-meta"><span>${safe(n===1?'1 demo':n+' demoer')}</span><span>${safe(dateLabel(x))}</span><span>Demoer</span><span>Klikk for å åpne kassen</span></div><div class="fa-note">Single demoer samles i en større trekasse. Jo flere demoer som ligger her, jo flere vinyler vises i kassen.</div><div class="fa-actions"><button class="fa-mini restore" data-fa-restore-all-demo="${safe(x.id)}">Gjenopprett alle</button><button class="fa-mini" data-fa-open-demo-crate="${safe(x.id)}">Åpne kasse</button></div></div></div></div>`;
  }
  function card(x,i){ return x.__type==='demo-crate' ? demoCrateCard(x,i) : standardCard(x,i); }
  function collections(){ const state=ensure(); const active=window.__faCollection||'all'; return `<div class="fa-collections"><button class="fa-chip ${active==='all'?'active':''}" data-fa-col="all">Alle</button>${state.settings.archiveCollections.map(c=>`<button class="fa-chip ${active===c?'active':''}" data-fa-col="${safe(c)}">${safe(c)}</button>`).join('')}<button class="fa-chip" data-fa-new-col>+ Ny samling</button></div>`; }
  function empty(rawCount){ return `<div class="fa-empty"><div><div class="fa-empty-art"></div><h3>${rawCount?'Ingen treff':'Tom arkivkasse'}</h3><p>${rawCount?'Prøv et annet søk, filter eller samling.':'Arkiverte prosjekter dukker opp her. Når du arkiverer en demo, mixtape eller et album, legges det fysisk i kassen og kan gjenopprettes senere.'}</p></div></div>`; }
  function footerText(raw, items){
    const demoCount=raw.filter(x=>x.__type==='beat').length;
    const demoCrates=items.filter(x=>x.__type==='demo-crate').length;
    const collectionCount=raw.filter(x=>x.__type==='album'||x.__type==='mixtape').length;
    let parts=[`${raw.length} arkivert`];
    if(demoCount) parts.push(`${demoCount} demoer i ${demoCrates} demo-kasse${demoCrates===1?'':'r'}`);
    if(collectionCount) parts.push(`${collectionCount} samlinger`);
    return parts.join(' · ');
  }
  function modalMarkup(){ return `<div class="fa-demo-modal" id="faDemoModal" hidden><div class="fa-demo-modal-card"><div class="fa-demo-modal-top"><div><div class="fa-kicker">🗄️ Demo-kasse</div><h3 id="faDemoModalTitle">Demo-kasse</h3><p id="faDemoModalSub">Arkiverte single demoer ligger samlet her.</p><div class="fa-demo-modal-actions"><button class="fa-btn" type="button" id="faDemoRestoreAll">Gjenopprett alle</button></div></div><button class="fa-demo-modal-close" type="button" id="faDemoClose">Lukk</button></div><div class="fa-demo-list" id="faDemoList"></div></div></div>`; }
  function render(){
    ensure(); activate(); const tab=ensureTab(); const raw=rawArchivedItems(), items=archiveCards();
    tab.innerHTML=`<div class="fa-page fa-opening"><div class="fa-top"><div><div class="fa-kicker">🗄️ Arkivert</div><h1 class="fa-title">Arkivkasse</h1><p class="fa-sub">Arkiverte prosjekter ligger lavt i trekassen, klare til å spilles av, sorteres i samlinger eller hentes tilbake.</p></div><div class="fa-count">${items.length} vises nå</div></div><div class="fa-controls"><label class="fa-search">⌕<input id="faSearch" value="${safe(window.__faQ||'')}" placeholder="Søk i arkivet"></label><select id="faType" class="fa-select"><option value="all" ${(window.__faType||'all')==='all'?'selected':''}>Alle typer</option><option value="album" ${window.__faType==='album'?'selected':''}>Album</option><option value="mixtape" ${window.__faType==='mixtape'?'selected':''}>Mixtape</option><option value="demo" ${window.__faType==='demo'?'selected':''}>Demo</option></select><select id="faSort" class="fa-select"><option value="newest" ${(window.__faSort||'newest')==='newest'?'selected':''}>Nyeste arkivert</option><option value="oldest" ${window.__faSort==='oldest'?'selected':''}>Eldste arkivert</option><option value="az" ${window.__faSort==='az'?'selected':''}>A–Å</option><option value="za" ${window.__faSort==='za'?'selected':''}>Å–A</option></select><button class="fa-btn" type="button" data-fa-reset>Nullstill</button><button class="fa-btn" type="button" data-fa-new-col>+ Samling</button></div>${collections()}<div class="fa-stage"><div class="fa-track" data-fa-track>${items.length?items.map(card).join(''):empty(raw.length)}</div><div class="fa-footer"><span>${footerText(raw,items)}</span><div class="fa-arrows"><button class="fa-arrow" data-fa-left type="button">‹</button><button class="fa-arrow" data-fa-right type="button">›</button></div></div><div class="fa-dots" data-fa-dots></div></div>${modalMarkup()}</div>`;
    bind(tab);
    requestAnimationFrame(()=>updateDots(tab));
  }
  function saveScroll(){ try{ sessionStorage.setItem(STORE_KEY, String(window.scrollY||document.documentElement.scrollTop||0)); }catch(e){} }
  function itemRef(ref){
    const [type,id]=String(ref).split(':');
    const state=ensure();
    const arr=type==='album'?state.albums:type==='mixtape'?state.mixtapes:state.beats;
    return {type,id,item:byId(arr,id)};
  }
  function getDemoCrate(id){ return archiveCards().find(x=>x.__type==='demo-crate' && String(x.id)===String(id)); }
  function openRef(ref){
    saveScroll();
    const [type,id]=String(ref).split(':');
    if(type==='demo-crate'){ openDemoCrate(id); return; }
    const {item}=itemRef(ref); if(!item) return;
    if(type==='album'){ document.body.classList.remove('final-archive-active','clean-archive-active'); document.querySelector('[data-tab="albums"]')?.click(); setTimeout(()=>window.openAlbum?.(id),60); }
    else if(type==='mixtape'){ document.body.classList.remove('final-archive-active','clean-archive-active'); document.querySelector('[data-tab="mixtapes"]')?.click(); setTimeout(()=>window.openMixtape?.(id),60); }
    else { document.body.classList.remove('final-archive-active','clean-archive-active'); document.querySelector('[data-tab="beats"]')?.click(); setTimeout(()=>window.playSingleBeat?.(id),80); }
  }
  function playRef(ref){
    const [type,id]=String(ref).split(':');
    if(type==='demo-crate'){ openDemoCrate(id); return; }
    if(type==='album') window.playAlbumFromStart?.(id);
    else if(type==='mixtape') window.playMixtapeFromStart?.(id);
    else window.playSingleBeat?.(id);
  }
  function restoreRef(ref){
    const [type,id]=String(ref).split(':');
    if(type==='demo-crate'){ restoreAllInDemoCrate(id); return; }
    const {item}=itemRef(ref); if(!item) return;
    item.archived=false; if(!item.restoredAt) item.restoredAt=Date.now();
    window.saveState?.(); render(); window.showToast?.('✓ Gjenopprettet fra arkiv');
  }
  function restoreAllInDemoCrate(id){
    const crate=getDemoCrate(id); if(!crate) return;
    crate.beats.forEach(item=>{ item.archived=false; if(!item.restoredAt) item.restoredAt=Date.now(); });
    window.saveState?.();
    closeDemoModal();
    render();
    window.showToast?.(`✓ Gjenopprettet ${crate.beats.length} demoer`);
  }
  function setCollection(ref,val){ const {item}=itemRef(ref); if(!item) return; item.archiveCollection=val; window.saveState?.(); window.showToast?.(val?`Lagt i «${val}»`:'Fjernet fra samling'); render(); }
  function newCollection(){
    const state=ensure();
    const name=prompt('Navn på ny arkivsamling:', ''); if(!name) return; const clean=name.trim(); if(!clean) return;
    state.settings.deletedArchiveCollections=(state.settings.deletedArchiveCollections||[]).filter(c=>c!==clean);
    if(!state.settings.archiveCollections.includes(clean)) state.settings.archiveCollections.push(clean);
    window.__faCollection=clean; window.saveState?.(); render();
  }
  function openDemoCrate(id){
    const crate=getDemoCrate(id); if(!crate) return;
    const modal=document.getElementById('faDemoModal'); if(!modal) return;
    modal.hidden=false;
    modal.dataset.crateId=id;
    document.getElementById('faDemoModalTitle').textContent = crate.id==='demo-crate-1' ? 'Demo-kasse' : titleOf(crate);
    document.getElementById('faDemoModalSub').textContent = `${crate.beats.length} ${crate.beats.length===1?'demo ligger':'demoer ligger'} i denne kassen. Maks 25 demoer per kasse.`;
    const list=document.getElementById('faDemoList');
    list.innerHTML = crate.beats.map(b=>`<div class="fa-demo-row"><div class="fa-demo-row-thumb">${coverOf(b)?`<img src="${safe(coverOf(b))}" alt="">`:'<span class="fa-vinyl"></span>'}</div><div class="fa-demo-row-main"><h4>${safe(titleOf(b))}</h4><p>${safe(dateLabel(b))} · ${safe(genreOf(b))} · Demo</p></div><div class="fa-demo-row-actions"><button class="fa-mini play" type="button" data-demo-play="${safe(b.id)}">▶ Spill</button><button class="fa-mini" type="button" data-demo-open="${safe(b.id)}">Åpne</button><button class="fa-mini restore" type="button" data-demo-restore="${safe(b.id)}">Gjenopprett</button></div></div>`).join('');
    document.getElementById('faDemoRestoreAll').onclick=()=>restoreAllInDemoCrate(id);
    bindDemoModal();
  }
  function closeDemoModal(){ const modal=document.getElementById('faDemoModal'); if(modal) modal.hidden=true; }
  function bindDemoModal(){
    document.getElementById('faDemoClose')?.addEventListener('click', closeDemoModal);
    document.getElementById('faDemoModal')?.addEventListener('click', e=>{ if(e.target.id==='faDemoModal') closeDemoModal(); });
    document.querySelectorAll('[data-demo-play]').forEach(btn=>btn.addEventListener('click',()=>window.playSingleBeat?.(btn.dataset.demoPlay)));
    document.querySelectorAll('[data-demo-open]').forEach(btn=>btn.addEventListener('click',()=>openRef('beat:'+btn.dataset.demoOpen)));
    document.querySelectorAll('[data-demo-restore]').forEach(btn=>btn.addEventListener('click',()=>restoreRef('beat:'+btn.dataset.demoRestore)));
  }
  function bind(tab){
    const track=tab.querySelector('[data-fa-track]');
    tab.querySelector('#faSearch')?.addEventListener('input',e=>{ window.__faQ=e.target.value; render(); });
    tab.querySelector('#faType')?.addEventListener('change',e=>{ window.__faType=e.target.value; render(); });
    tab.querySelector('#faSort')?.addEventListener('change',e=>{ window.__faSort=e.target.value; render(); });
    tab.querySelector('[data-fa-reset]')?.addEventListener('click',()=>{ window.__faQ=''; window.__faType='all'; window.__faSort='newest'; window.__faCollection='all'; render(); });
    tab.querySelectorAll('[data-fa-new-col]').forEach(b=>b.addEventListener('click',newCollection));
    tab.querySelectorAll('[data-fa-col]').forEach(b=>b.addEventListener('click',()=>{ window.__faCollection=b.dataset.faCol; render(); }));
    tab.querySelector('[data-fa-left]')?.addEventListener('click',()=>track?.scrollBy({left:-(track.clientWidth||900),behavior:'smooth'}));
    tab.querySelector('[data-fa-right]')?.addEventListener('click',()=>track?.scrollBy({left:(track.clientWidth||900),behavior:'smooth'}));
    track?.addEventListener('scroll',()=>{ try{ sessionStorage.setItem('mvArchiveTrackX', String(track.scrollLeft)); }catch(e){} requestAnimationFrame(()=>updateDots(tab)); },{passive:true});
    const x=Number(sessionStorage.getItem('mvArchiveTrackX')||0); if(x) requestAnimationFrame(()=>track.scrollLeft=x);
    tab.querySelectorAll('[data-fa-open]').forEach(b=>b.addEventListener('click',e=>{ if(e.target.closest('[data-fa-play],[data-fa-restore],[data-fa-open-btn],[data-fa-collection-for],[data-fa-open-demo-crate],[data-fa-restore-all-demo]')) return; openRef(b.dataset.faOpen); }));
    tab.querySelectorAll('[data-fa-open-btn]').forEach(b=>b.addEventListener('click',e=>{ e.stopPropagation(); openRef(b.dataset.faOpenBtn); }));
    tab.querySelectorAll('[data-fa-play]').forEach(b=>b.addEventListener('click',e=>{ e.stopPropagation(); playRef(b.dataset.faPlay); }));
    tab.querySelectorAll('[data-fa-restore]').forEach(b=>b.addEventListener('click',e=>{ e.stopPropagation(); restoreRef(b.dataset.faRestore); }));
    tab.querySelectorAll('[data-fa-open-demo-crate]').forEach(b=>b.addEventListener('click',e=>{ e.stopPropagation(); openDemoCrate(b.dataset.faOpenDemoCrate); }));
    tab.querySelectorAll('[data-fa-restore-all-demo]').forEach(b=>b.addEventListener('click',e=>{ e.stopPropagation(); restoreAllInDemoCrate(b.dataset.faRestoreAllDemo); }));
    tab.querySelectorAll('[data-fa-collection-for]').forEach(s=>s.addEventListener('change',e=>{ e.stopPropagation(); setCollection(s.dataset.faCollectionFor,s.value); }));
    document.addEventListener('keydown',e=>{ if(e.key==='Escape') closeDemoModal(); });
  }
  function updateDots(tab){ const track=tab.querySelector('[data-fa-track]'),dots=tab.querySelector('[data-fa-dots]'); if(!track||!dots) return; const isMobile=matchMedia('(max-width:980px)').matches; const tiles=[...track.querySelectorAll('.fa-tile')]; if(!isMobile||!tiles.length){ dots.innerHTML=''; return; } const per=matchMedia('(max-width:680px)').matches?1:2; const pages=Math.max(1,Math.ceil(tiles.length/per)); const active=Math.min(pages-1,Math.round(track.scrollLeft/Math.max(1,track.clientWidth))); dots.innerHTML=Array.from({length:pages},(_,i)=>`<button class="fa-dot ${i===active?'active':''}" type="button" data-fa-dot="${i}"></button>`).join(''); dots.querySelectorAll('[data-fa-dot]').forEach(b=>b.addEventListener('click',()=>track.scrollTo({left:Number(b.dataset.faDot)*track.clientWidth,behavior:'smooth'}))); }

  window.renderArchiveView = render;
  window.openArchiveTab = render;

  const prevToggle = window.toggleArchiveItem;
  if(prevToggle && !prevToggle.__mvDemoCratesWrapped){
    const wrapped = function(){ const res = prevToggle.apply(this, arguments); if(document.body.classList.contains('final-archive-active')) setTimeout(render,0); return res; };
    wrapped.__mvDemoCratesWrapped = true;
    window.toggleArchiveItem = wrapped;
  }

  document.addEventListener('click', function(e){
    const btn=e.target.closest?.('.tab-btn[data-tab], [data-tab]');
    if(!btn) return;
    if(btn.dataset.tab==='archive'){
      e.preventDefault();
      e.stopPropagation();
      render();
      return false;
    }
    deactivate();
  }, true);

  if(document.readyState!=='loading') ensureTab();
  else document.addEventListener('DOMContentLoaded', ensureTab, {once:true});
})();

// === marcus-stable-recovery-js ===
(function(){
  'use strict';
  const ARCHIVE_CLASSES=['final-archive-active','clean-archive-active','mv-archive-v4-active','marcus-archive-safe-active'];
  // FIX: Added label and adminpanel to PANELS so leaveArchive restores them correctly
  const PANELS={mixtapes:'mixtapesTab',albums:'albumsTab',beats:'beatsTab',pipeline:'pipelineTab',integrations:'integrationsTab',archive:'archiveTab',label:'labelTab',adminpanel:'adminPanelTab'};
  function qs(s,r=document){return r.querySelector(s)}
  function qsa(s,r=document){return Array.from(r.querySelectorAll(s))}
  function stateObj(){window.state=window.state||{};state.settings=state.settings||{};state.beats=state.beats||[];state.albums=state.albums||[];state.mixtapes=state.mixtapes||[];state.settings.archiveCollections=Array.from(new Set(state.settings.archiveCollections||[]));return state;}
  function save(){try{window.saveState&&window.saveState()}catch(e){console.warn('saveState failed',e)}}
  function leaveArchive(){
    ARCHIVE_CLASSES.forEach(c=>document.body.classList.remove(c));
    // Gjøm arkiv-tab — db.js håndterer alt annet
    const archive=qs('#archiveTab');
    if(archive){ archive.classList.add('hidden'); archive.style.display=''; }
    // Clear style.display satt av activate() — db.js tar seg av resten
    document.querySelectorAll('.tab-view').forEach(v=>{ v.style.display=''; });
  }
  function enhanceEmptyCrate(root=document){
    qsa('#archiveTab .fa-empty-art',root).forEach(box=>{
    });
  }
  function enhanceCollectionDelete(root=document){
    const st=stateObj();
    qsa('#archiveTab .fa-chip[data-fa-col]',root).forEach(chip=>{
      const name=chip.getAttribute('data-fa-col');
      if(!name || name==='all' || chip.querySelector('.fa-chip-delete'))return;
      const x=document.createElement('button');
      x.type='button';
      x.className='fa-chip-delete';
      x.title='Slett samling';
      x.setAttribute('aria-label','Slett samling '+name);
      x.setAttribute('data-marcus-delete-collection',name);
      x.textContent='×';
      chip.appendChild(x);
    });
  }
  function enhanceArchive(root=document){enhanceEmptyCrate(root);enhanceCollectionDelete(root)}
  function deleteCollection(name){
    const st=stateObj();
    if(!name || name==='all')return;
    const used=['beats','albums','mixtapes'].reduce((n,k)=>n+(st[k]||[]).filter(x=>(x.archiveCollection||'')===name).length,0);
    const ok=confirm(used?`Slette samlingen «${name}» og fjerne taggen fra ${used} elementer?`:`Slette samlingen «${name}»?`);
    if(!ok)return;
    st.settings.deletedArchiveCollections=Array.from(new Set([...(st.settings.deletedArchiveCollections||[]),name]));
    st.settings.archiveCollections=(st.settings.archiveCollections||[]).filter(c=>c!==name);
    ['beats','albums','mixtapes'].forEach(k=>(st[k]||[]).forEach(x=>{if(x.archiveCollection===name)x.archiveCollection=''}));
    if(window.__faCollection===name)window.__faCollection='all';
    save();
    if(typeof window.renderArchiveView==='function')window.renderArchiveView();
    setTimeout(()=>enhanceArchive(),30);
  }

  document.addEventListener('click',function(e){
    const trigger=e.target&&e.target.closest&&e.target.closest('.tab-btn[data-tab], [data-tab]');
    if(!trigger||!trigger.dataset)return;
    const tab=trigger.dataset.tab;
    if(!tab || tab==='archive')return;
    // Kjør alltid leaveArchive for å rydde opp archive-state
    leaveArchive();
  },true);

  document.addEventListener('click',function(e){
    const del=e.target&&e.target.closest&&e.target.closest('[data-marcus-delete-collection]');
    if(!del)return;
    e.preventDefault();e.stopPropagation();
    deleteCollection(del.getAttribute('data-marcus-delete-collection'));
  },true);

  const mo=new MutationObserver(muts=>{
    for(const m of muts){
      if(m.target&&((m.target.id==='archiveTab')||(m.target.closest&&m.target.closest('#archiveTab')))){enhanceArchive();break;}
    }
  });
  document.addEventListener('DOMContentLoaded',()=>{const a=qs('#archiveTab');if(a)mo.observe(a,{childList:true,subtree:true});enhanceArchive();});
  if(document.readyState!=='loading'){const a=qs('#archiveTab');if(a)mo.observe(a,{childList:true,subtree:true});enhanceArchive();}
})();

// === marcus-final-archive-png-js ===
(function(){
  const BACK='assets/crate-back.png';
  const FRONT='assets/crate-front.png';
  const VINYL='assets/vinyl-label.png';
  function apply(root){
    (root.querySelectorAll ? root.querySelectorAll('#archiveTab .fa-crate, .fa-crate') : []).forEach(crate=>{
      if(!(crate instanceof Element)) return;
      let back=crate.querySelector(':scope > .fa-crate-png-back');
      if(!back){back=document.createElement('img');back.className='fa-crate-png-back';back.alt='';crate.insertBefore(back,crate.firstChild);}
      if(back.getAttribute('src')!==BACK) back.setAttribute('src',BACK);
      let front=crate.querySelector(':scope > .fa-crate-png-front');
      if(!front){front=document.createElement('img');front.className='fa-crate-png-front';front.alt='';crate.appendChild(front);}
      if(front.getAttribute('src')!==FRONT) front.setAttribute('src',FRONT);
      const record=crate.querySelector(':scope .fa-record');
      if(record) record.style.setProperty('z-index','5','important');
      crate.querySelectorAll(':scope .fa-vinyl, :scope .fa-demo-disc').forEach(vinyl=>{
        vinyl.style.setProperty('background','none','important');
        vinyl.style.setProperty('box-shadow','none','important');
        vinyl.style.setProperty('border','0','important');
        let img=vinyl.querySelector(':scope > .fa-vinyl-png');
        if(!img){img=document.createElement('img');img.className='fa-vinyl-png';img.alt='';vinyl.appendChild(img);}
        if(img.getAttribute('src')!==VINYL) img.setAttribute('src',VINYL);
      });
      if(front && crate.lastElementChild!==front) crate.appendChild(front);
    });
  }
  function schedule(){
    const root=document.getElementById('archiveTab')||document;
    apply(root);
    requestAnimationFrame(()=>apply(root));
    setTimeout(()=>apply(root),50);
    setTimeout(()=>apply(root),250);
  }
  document.addEventListener('click',function(e){
    if(e.target.closest && e.target.closest('[data-tab="archive"], [data-fa-open], [data-fa-reset], [data-fa-new-col], [data-fa-left], [data-fa-right], [data-fa-col]')) schedule();
  },true);
  document.addEventListener('DOMContentLoaded',function(){
    schedule();
    const obs=new MutationObserver(function(muts){
      for(const m of muts){
        for(const n of m.addedNodes){
          if(n.nodeType===1 && (n.matches?.('#archiveTab, .fa-crate, .fa-record') || n.querySelector?.('.fa-crate'))){schedule();return;}
        }
      }
    });
    obs.observe(document.body,{childList:true,subtree:true});
  });
  if(document.readyState!=='loading') schedule();
  window.applyFinalArchivePngs=apply;
})();

// === marcus-final-empty-crate-js ===
(function(){
  'use strict';
  const CRATE_SRC = 'assets/crate-empty.png';
  function applyEmptyCrate(root=document){
    (root.querySelectorAll ? root.querySelectorAll('#archiveTab .fa-empty-art, .fa-empty-art') : []).forEach(box => {
      if(!(box instanceof Element)) return;
      let img = box.querySelector(':scope > .marcus-empty-crate-img');
      if(!img){
        box.innerHTML = '';
        img = document.createElement('img');
        img.className = 'marcus-empty-crate-img';
        img.alt = '';
        box.appendChild(img);
      }
      if(img.getAttribute('src') !== CRATE_SRC) img.setAttribute('src', CRATE_SRC);
    });
  }
  function schedule(){
    const root = document.getElementById('archiveTab') || document;
    applyEmptyCrate(root);
    requestAnimationFrame(() => applyEmptyCrate(root));
    setTimeout(() => applyEmptyCrate(root), 60);
    setTimeout(() => applyEmptyCrate(root), 220);
  }
  document.addEventListener('DOMContentLoaded', schedule);
  document.addEventListener('click', function(e){
    if(e.target && e.target.closest && e.target.closest('[data-tab="archive"], [data-fa-reset], [data-fa-col], [data-fa-new-col], [data-fa-left], [data-fa-right]')) schedule();
  }, true);
  const mo = new MutationObserver(function(muts){
    for(const m of muts){
      for(const n of m.addedNodes){
        if(n.nodeType===1 && ((n.matches && n.matches('#archiveTab, .fa-empty, .fa-empty-art')) || (n.querySelector && n.querySelector('.fa-empty-art')))){
          schedule();
          return;
        }
      }
    }
  });
  mo.observe(document.body, {childList:true, subtree:true});
  if(document.readyState !== 'loading') schedule();
  window.applyMarcusFinalEmptyCrate = applyEmptyCrate;
})();

// === marcus-collection-cover-inheritance-js ===
(function(){
  'use strict';
  function appState(){ try{ if(typeof state !== 'undefined') return state; }catch(e){} return window.state || null; }
  function getCurrentAlbumId(){ try{ if(typeof currentAlbumId !== 'undefined') return currentAlbumId; }catch(e){} return window.currentAlbumId; }
  function getCurrentMixtapeId(){ try{ if(typeof currentMixtapeId !== 'undefined') return currentMixtapeId; }catch(e){} return window.currentMixtapeId; }
  function beatById(id){ const st = appState(); return (st && Array.isArray(st.beats)) ? st.beats.find(b => String(b.id) === String(id)) : null; }
  function hasCover(beat){ return !!(beat && typeof beat.cover === 'string' && beat.cover.trim()); }
  function inheritCoverFromCollection(collection, collectionType){
    if(!collection || !collection.cover || !Array.isArray(collection.beatIds)) return false;
    let changed = false;
    collection.beatIds.forEach(id => {
      const beat = beatById(id);
      if(beat && !hasCover(beat)){ beat.cover = collection.cover; beat.coverInheritedFrom = collectionType || 'collection'; beat.coverInheritedAt = Date.now(); changed = true; }
    });
    if(changed){ try{ if(typeof saveState === 'function') saveState(); else window.saveState && window.saveState(); }catch(e){ console.warn('Cover inheritance save failed', e); } }
    return changed;
  }
  function inheritCurrentAlbumCover(){ const st = appState(); if(!st || !Array.isArray(st.albums)) return false; const albumId = getCurrentAlbumId(); const album = st.albums.find(a => String(a.id) === String(albumId)); return inheritCoverFromCollection(album, 'album'); }
  function inheritCurrentMixtapeCover(){ const st = appState(); if(!st || !Array.isArray(st.mixtapes)) return false; const mixtapeId = getCurrentMixtapeId(); const mt = st.mixtapes.find(m => String(m.id) === String(mixtapeId)); return inheritCoverFromCollection(mt, 'mixtape'); }
  function rerenderAlbumSoon(){ setTimeout(function(){ try{ if(typeof renderAlbumDetail === 'function') renderAlbumDetail(); }catch(e){} }, 0); }
  function rerenderMixtapeSoon(){ setTimeout(function(){ try{ if(typeof renderMixtapeDetail === 'function') renderMixtapeDetail(); }catch(e){} }, 0); }
  const originalRenderAlbumDetail = window.renderAlbumDetail;
  if(typeof originalRenderAlbumDetail === 'function'){ window.renderAlbumDetail = function(){ inheritCurrentAlbumCover(); return originalRenderAlbumDetail.apply(this, arguments); }; }
  const originalRenderMixtapeDetail = window.renderMixtapeDetail;
  if(typeof originalRenderMixtapeDetail === 'function'){ window.renderMixtapeDetail = function(){ inheritCurrentMixtapeCover(); return originalRenderMixtapeDetail.apply(this, arguments); }; }
  document.addEventListener('change', function(e){
    const t = e.target; if(!t || !t.matches) return;
    if(t.matches('#albumCoverInput, input[onchange^="setAlbumCover"]')){ setTimeout(function(){ if(inheritCurrentAlbumCover()) rerenderAlbumSoon(); }, 500); }
    if(t.matches('#mixtapeCoverInput')){ setTimeout(function(){ if(inheritCurrentMixtapeCover()) rerenderMixtapeSoon(); }, 500); }
  }, true);
  window.inheritCollectionCoverToEmptySongs = function(type, id){ const st = appState(); if(!st) return false; if(type === 'album') return inheritCoverFromCollection((st.albums||[]).find(a => String(a.id) === String(id)), 'album'); if(type === 'mixtape') return inheritCoverFromCollection((st.mixtapes||[]).find(m => String(m.id) === String(id)), 'mixtape'); return false; };
})();

// === marcus-cover-inheritance-tracking-js ===
(function(){
  'use strict';
  function st(){ try{ if(typeof state !== 'undefined') return state; }catch(e){} return window.state || null; }
  function save(){ try{ if(typeof saveState === 'function') saveState(); else window.saveState && window.saveState(); }catch(e){ console.warn('Cover inheritance tracking save failed', e); } }
  function byId(arr,id){ return (arr||[]).find(x=>String(x.id)===String(id)) || null; }
  function beatById(id){ const s=st(); return s && byId(s.beats,id); }
  function hasCover(b){ return !!(b && typeof b.cover === 'string' && b.cover.trim()); }
  function isInheritedFrom(b,type,id){ if(!b) return false; if(b.coverInherited === true && String(b.coverInheritedFromType||'') === String(type) && String(b.coverInheritedFromId||'') === String(id)) return true; if(b.coverInheritedFrom && !b.coverInheritedFromId && String(b.coverInheritedFrom) === String(type)) return true; return false; }
  function markInherited(b,type,id){ b.coverInherited = true; b.coverInheritedFromType = type; b.coverInheritedFromId = id; b.coverInheritedFrom = type; b.coverInheritedAt = Date.now(); delete b.coverManual; }
  function markManual(b){ if(!b) return; b.coverInherited = false; delete b.coverInheritedFromType; delete b.coverInheritedFromId; delete b.coverInheritedFrom; delete b.coverInheritedAt; b.coverManual = true; }
  function syncCollectionCover(type,id,oldCover){
    const s=st(); if(!s) return false;
    const col = type === 'album' ? byId(s.albums,id) : byId(s.mixtapes,id);
    if(!col || !col.cover || !Array.isArray(col.beatIds)) return false;
    let changed=false;
    col.beatIds.forEach(beatId=>{ const b=beatById(beatId); if(!b) return; const inheritedHere = isInheritedFrom(b,type,col.id); const wasLegacyInheritedHere = !!(b.coverInheritedFrom && !b.coverInheritedFromId && String(b.coverInheritedFrom)===String(type)); const matchesOldInheritedCover = oldCover && b.cover === oldCover; const empty = !hasCover(b); if(inheritedHere || empty || (wasLegacyInheritedHere && matchesOldInheritedCover)){ if(b.cover !== col.cover){ b.cover = col.cover; changed = true; } const before = JSON.stringify([b.coverInherited,b.coverInheritedFromType,b.coverInheritedFromId,b.coverInheritedFrom]); markInherited(b,type,col.id); const after = JSON.stringify([b.coverInherited,b.coverInheritedFromType,b.coverInheritedFromId,b.coverInheritedFrom]); if(before !== after) changed = true; } });
    if(changed) save();
    return changed;
  }
  function currentAlbumId(){ try{ if(typeof currentAlbumId !== 'undefined') return currentAlbumId; }catch(e){} return window.currentAlbumId; }
  function currentMixtapeId(){ try{ if(typeof currentMixtapeId !== 'undefined') return currentMixtapeId; }catch(e){} return window.currentMixtapeId; }
  function syncCurrentAlbum(oldCover){ const id=currentAlbumId(); return id ? syncCollectionCover('album',id,oldCover) : false; }
  function syncCurrentMixtape(oldCover){ const id=currentMixtapeId(); return id ? syncCollectionCover('mixtape',id,oldCover) : false; }
  function rerenderAlbum(){ setTimeout(()=>{ try{ if(typeof renderAlbumDetail==='function') renderAlbumDetail(); if(typeof renderAlbums==='function') renderAlbums(); }catch(e){} },0); }
  function rerenderMixtape(){ setTimeout(()=>{ try{ if(typeof renderMixtapeDetail==='function') renderMixtapeDetail(); if(typeof renderMixtapes==='function') renderMixtapes(); }catch(e){} },0); }
  const oldSetAlbumCover = window.setAlbumCover;
  if(typeof oldSetAlbumCover === 'function'){ window.setAlbumCover = function(id,file){ const s=st(); const album=s && byId(s.albums,id); const oldCover=album && album.cover; const result = oldSetAlbumCover.apply(this, arguments); setTimeout(()=>{ if(syncCollectionCover('album',id,oldCover)) rerenderAlbum(); },650); return result; }; }
  const oldCassetteCropUpload = window.cassetteCropUpload;
  if(typeof oldCassetteCropUpload === 'function'){ window.cassetteCropUpload = function(id,file){ const s=st(); const mt=s && byId(s.mixtapes,id); const oldCover=mt && mt.cover; const result = oldCassetteCropUpload.apply(this, arguments); setTimeout(()=>{ if(syncCollectionCover('mixtape',id,oldCover)) rerenderMixtape(); },650); return result; }; }
  const oldSetAlbumBeatCover = window.setAlbumBeatCover;
  if(typeof oldSetAlbumBeatCover === 'function'){ window.setAlbumBeatCover = function(id,input){ const b=beatById(id); if(b){ markManual(b); save(); } return oldSetAlbumBeatCover.apply(this, arguments); }; }
  document.addEventListener('change', function(e){
    const t=e.target; if(!t || !t.matches) return; const s=st(); if(!s) return;
    if(t.matches('#albumCoverInput')){ const album=byId(s.albums,currentAlbumId()); const oldCover=album && album.cover; setTimeout(()=>{ if(syncCurrentAlbum(oldCover)) rerenderAlbum(); },700); }
    if(t.matches('#mixtapeCoverInput')){ const mt=byId(s.mixtapes,currentMixtapeId()); const oldCover=mt && mt.cover; setTimeout(()=>{ if(syncCurrentMixtape(oldCover)) rerenderMixtape(); },700); }
    if(t.matches('input[onchange*="setAlbumBeatCover"]')){ const m=(t.getAttribute('onchange')||'').match(/setAlbumBeatCover\(['"]([^'"]+)/); if(m){ const b=beatById(m[1]); if(b){ markManual(b); save(); } } }
  }, true);
  const previousRenderAlbumDetail = window.renderAlbumDetail;
  if(typeof previousRenderAlbumDetail === 'function'){ window.renderAlbumDetail = function(){ const old = syncCurrentAlbum(); const result = previousRenderAlbumDetail.apply(this, arguments); setTimeout(markVisibleInheritedCards,0); return result; }; }
  const previousRenderMixtapeDetail = window.renderMixtapeDetail;
  if(typeof previousRenderMixtapeDetail === 'function'){ window.renderMixtapeDetail = function(){ syncCurrentMixtape(); const result = previousRenderMixtapeDetail.apply(this, arguments); setTimeout(markVisibleInheritedCards,0); return result; }; }
  function markVisibleInheritedCards(){ document.querySelectorAll('.album-beat-card[data-beat-id], [id^="abi-"]').forEach(card=>{ const id=card.getAttribute('data-beat-id') || String(card.id||'').replace(/^abi-/,''); const b=beatById(id); card.setAttribute('data-cover-inherited', b && b.coverInherited === true ? 'true' : 'false'); if(b && b.coverInherited === true){ card.title = card.title || 'Coveret er arvet fra album/mixtape'; } }); }
  window.syncCollectionCoverInheritance = syncCollectionCover;
  window.markBeatCoverManual = function(id){ const b=beatById(id); if(b){ markManual(b); save(); markVisibleInheritedCards(); return true; } return false; };
  document.addEventListener('DOMContentLoaded',()=>setTimeout(markVisibleInheritedCards,150));
  const mo=new MutationObserver(()=>{ requestAnimationFrame(markVisibleInheritedCards); });
  if(document.body) mo.observe(document.body,{childList:true,subtree:true});
})();

// === marcus-persistent-archive-collection-delete-js ===
(function(){
  'use strict';
  const DEFAULTS = ['Gamle demoer','2024 beats','Ikke brukt','Klassikere'];
  function st(){ window.state = window.state || {}; state.settings = state.settings || {}; state.settings.archiveCollections = state.settings.archiveCollections || []; state.settings.deletedArchiveCollections = state.settings.deletedArchiveCollections || []; return state; }
  function sanitizeArchiveCollections(){ const s = st(); const deleted = new Set(s.settings.deletedArchiveCollections || []); s.settings.archiveCollections = Array.from(new Set(s.settings.archiveCollections || [])).filter(c => c && !deleted.has(c)); ['beats','albums','mixtapes'].forEach(k => (s[k] || []).forEach(item => { if(item && deleted.has(item.archiveCollection)) item.archiveCollection = ''; })); }
  function rememberDeletedCollection(name){ if(!name || name === 'all') return; const s = st(); s.settings.deletedArchiveCollections = Array.from(new Set([...(s.settings.deletedArchiveCollections || []), name])); sanitizeArchiveCollections(); try{ window.saveState && window.saveState(); }catch(e){} }
  document.addEventListener('click', function(e){ const del = e.target && e.target.closest && e.target.closest('[data-marcus-delete-collection], .fa-chip-delete'); if(!del) return; const name = del.getAttribute('data-marcus-delete-collection') || del.closest('[data-fa-col]')?.getAttribute('data-fa-col'); setTimeout(() => rememberDeletedCollection(name), 0); setTimeout(() => { sanitizeArchiveCollections(); if(document.body.classList.contains('final-archive-active') && window.renderArchiveView) window.renderArchiveView(); }, 80); }, true);
  const oldRender = window.renderArchiveView;
  if(typeof oldRender === 'function'){ window.renderArchiveView = function(){ sanitizeArchiveCollections(); const result = oldRender.apply(this, arguments); sanitizeArchiveCollections(); return result; }; }
  document.addEventListener('DOMContentLoaded', sanitizeArchiveCollections);
  if(document.readyState !== 'loading') sanitizeArchiveCollections();
})();

// === marcus-tab-order-archive-before-integrations ===
(function(){
  'use strict';
  function reorderTabs(){
    const archive = document.querySelector('.tab-btn[data-tab="archive"], [data-tab="archive"]');
    const integrations = document.querySelector('.tab-btn[data-tab="integrations"], [data-tab="integrations"]');
    if(!archive || !integrations || !integrations.parentElement) return;
    if(archive.parentElement !== integrations.parentElement) return;
    if(!(archive.compareDocumentPosition(integrations) & Node.DOCUMENT_POSITION_FOLLOWING)){ integrations.parentElement.insertBefore(archive, integrations); }
    mo.disconnect();
  }
  function reorderAndMaybeStop(){ reorderTabs(); }
  const mo = new MutationObserver(reorderAndMaybeStop);
  document.addEventListener('DOMContentLoaded', function(){ reorderTabs(); mo.observe(document.querySelector('.tabs')||document.body, { childList:true, subtree:true }); });
  if(document.readyState !== 'loading') reorderTabs();
})();
