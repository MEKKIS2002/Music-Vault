// === marcus-mixtape-search-performance-js ===
(function(){
  'use strict';
  const STORE_KEY='mv-mixtape-active-search';
  let timer=null;
  let raf=null;
  let lastMixtapeId='';
  let textCache=new Map(); 

  function qs(s,r=document){return r.querySelector(s)}
  function qsa(s,r=document){return Array.from(r.querySelectorAll(s))}
  function isOpen(){const d=qs('#mixtapeDetailView');return !!(d && !d.classList.contains('hidden'))}
  function mixId(){try{return String(currentMixtapeId||'active')}catch(e){return String(window.currentMixtapeId||'active')}}
  function beats(){try{return (window.state&&window.state.beats)||(typeof state!=='undefined'&&state.beats)||[]}catch(e){return []}}
  function beatById(id){return beats().find(b=>String(b.id)===String(id))||null}
  function strip(html){
    const raw=String(html||'');
    if(raw.indexOf('<')===-1)return raw;
    const div=document.createElement('div');
    div.innerHTML=raw;
    return div.textContent||div.innerText||'';
  }
  function normalize(s){return String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')}
  function cardId(card){return card.getAttribute('data-beat-id') || String(card.id||'').replace(/^abi-/,'')}
  function list(){return qs('#mixtapeBeatList')}
  function cards(){const l=list();return l?qsa('.album-beat-card[data-beat-id], [id^="abi-"][data-beat-id]',l):[]}
  function input(){return qs('#mixtapeDetailView .marcus-fast-mixtape-search') || qs('#mixtapeDetailView .collection-tools .collection-search')}
  function count(){return qs('#mixtapeDetailView .collection-tools [data-count], #mixtapeDetailView .collection-count[data-count]')}
  function ensureEmpty(){
    const l=list(); if(!l)return null;
    let e=qs('.marcus-mixtape-search-empty',l);
    if(!e){e=document.createElement('div');e.className='marcus-mixtape-search-empty';e.textContent='Ingen spor matcher søket i denne mixtapen.';l.appendChild(e)}
    return e;
  }
  function resetCacheIfNeeded(){
    const id=mixId();
    const all=cards();
    const signature=id+':'+all.map(c=>cardId(c)).join('|');
    if(signature===lastMixtapeId)return;
    lastMixtapeId=signature;
    textCache=new Map();
    all.forEach(card=>{
      const bid=cardId(card);
      const b=beatById(bid);
      const domTitle=card.querySelector('.ab-title,strong,.title,.studio-title')?.textContent || '';
      const txt=[b?.name, strip(b?.lyrics), b?.credits, b?.notes, domTitle].filter(Boolean).join(' ');
      textCache.set(String(bid), normalize(txt));
    });
  }
  function applyNow(){
    if(!isOpen())return;
    const inp=input(); if(!inp)return;
    resetCacheIfNeeded();
    const q=normalize(inp.value).trim();
    try{sessionStorage.setItem(STORE_KEY+':'+mixId(),q)}catch(e){}
    const terms=q.split(/\s+/).filter(Boolean);
    const all=cards();
    let shown=0;
    for(const card of all){
      const txt=textCache.get(String(cardId(card))) || normalize(card.textContent||'');
      const ok=!terms.length || terms.every(t=>txt.includes(t));
      card.classList.toggle('marcus-fast-search-hidden',!ok);
      // Remove older hidden classes controlled by previous patches so they don't fight this faster filter.
      card.classList.remove('marcus-mixtape-search-hidden');
      card.setAttribute('aria-hidden', ok?'false':'true');
      if(ok)shown++;
    }
    const e=ensureEmpty(); if(e)e.classList.toggle('show',terms.length>0 && shown===0);
    const c=count(); if(c)c.textContent=terms.length?`${shown}/${all.length} treff`:`${shown}/${all.length} vises`;
  }
  function scheduleApply(immediate=false){
    if(timer)clearTimeout(timer);
    if(raf)cancelAnimationFrame(raf);
    const run=()=>{raf=requestAnimationFrame(applyNow)};
    if(immediate)run(); else timer=setTimeout(run,110);
  }
  function upgradeInput(){
    const tools=qs('#mixtapeDetailView .collection-tools'); if(!tools)return null;
    let inp=qs('.marcus-fast-mixtape-search',tools);
    const old=qs('.collection-search',tools);
    if(!inp && old){
      inp=old.cloneNode(false);
      inp.className='marcus-fast-mixtape-search';
      inp.removeAttribute('oninput');
      inp.oninput=null;
      inp.placeholder='Søk i denne mixtapen';
      inp.dataset.marcusFastSearch='1';
      try{inp.value=sessionStorage.getItem(STORE_KEY+':'+mixId())||old.value||''}catch(e){inp.value=old.value||''}
      old.replaceWith(inp);
    }
    if(inp && !inp.dataset.marcusFastBound){
      inp.dataset.marcusFastBound='1';
      inp.addEventListener('input',function(e){
        // Stop older delegated handlers from doing expensive synchronous filtering.
        e.stopImmediatePropagation();
        scheduleApply(false);
      },true);
      inp.addEventListener('search',()=>scheduleApply(true),true);
    }
    return inp;
  }
  function install(){
    if(!isOpen())return;
    const detail=qs('#mixtapeDetailView');
    if(detail)qsa('#marcusMixtapeLocalSearch, .marcus-mixtape-local-search',detail).forEach(el=>el.remove());
    const inp=upgradeInput();
    if(!inp)return;
    if(inp.dataset.mixtapeId!==mixId()){
      inp.dataset.mixtapeId=mixId();
      try{inp.value=sessionStorage.getItem(STORE_KEY+':'+mixId())||''}catch(e){}
      lastMixtapeId='';
    }
    // Mark as already handled so older install routines do not bind directly to this input if they run later.
    inp.dataset.marcusSingleSearchBound='1';
    inp.dataset.marcusVisibilityBound='1';
    scheduleApply(true);
  }
  function scheduleInstall(){setTimeout(install,0);setTimeout(install,120);setTimeout(install,320)}
  document.addEventListener('click',function(e){
    if(e.target?.closest?.('[data-tab="mixtapes"], .cassette-card, #backToMixtapesBtn, #addBeatsToMixtapeBtn, #confirmAddBeatsBtn, .collection-filter, [data-track-view]'))scheduleInstall();
  },true);
  document.addEventListener('DOMContentLoaded',scheduleInstall);
  if(document.readyState!=='loading')scheduleInstall();
  const mo=new MutationObserver(function(muts){
    for(const m of muts){
      for(const n of m.addedNodes){
        if(n.nodeType===1 && (n.matches?.('#mixtapeDetailView, #mixtapeBeatList, .collection-tools, .album-beat-card') || n.querySelector?.('#mixtapeBeatList, .collection-tools, .album-beat-card'))){scheduleInstall();return;}
      }
    }
  });
  mo.observe(document.body,{childList:true,subtree:true});
  window.applyMarcusFastMixtapeSearch=applyNow;
})();
