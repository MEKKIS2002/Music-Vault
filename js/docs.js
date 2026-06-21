// ════════════════════════════════════════════════════════════════════════════
// docs.js — standalone notes / docs (Apple Notes-style).
//
// Independent of beats/albums/mixtapes: a freestanding place for ideas, lyrics,
// notes and plans. Sidebar with the user's docs (newest-edited first) + a rich
// editor on the right. Per-user (Supabase RLS), debounced autosave.
//
// DB: table public.docs + owner-only RLS + updated_at trigger — see sql/docs.sql
// ════════════════════════════════════════════════════════════════════════════
(function(){
  'use strict';

  const SB_URL = 'https://ylvqkfdvijqnecuqznyr.supabase.co';
  const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlsdnFrZmR2aWpxbmVjdXF6bnlyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgzMzA4MzIsImV4cCI6MjA5MzkwNjgzMn0.bYPTaxQK8n7I7w5Ri2DVYW5_LbFHg2IXkuhHsLTDDqc';

  let _docs = [];           // [{id,title,content,format,created_at,updated_at}]
  let _currentId = null;
  let _saveTimer = null;
  let _loading = false;

  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function toast(m){ if(typeof window.showToast==='function') window.showToast(m); }
  function stripHtml(html){ const d=document.createElement('div'); d.innerHTML=html||''; return (d.textContent||d.innerText||'').replace(/\s+/g,' ').trim(); }
  function el(id){ return document.getElementById(id); }

  async function getAuth(){
    let token=null, uid=window._mvCurrentUserId||sessionStorage.getItem('mv_user_id')||null;
    try{
      const {data:{session}} = await window.supabaseClient.auth.getSession();
      if(session?.access_token) token=session.access_token;
      if(session?.user?.id){ uid=session.user.id; window._mvCurrentUserId=uid; sessionStorage.setItem('mv_user_id',uid); }
    }catch(e){}
    return {token, uid};
  }
  function hdrs(token, extra){ return Object.assign({'apikey':SB_KEY,'Authorization':'Bearer '+(token||SB_KEY),'Content-Type':'application/json'}, extra||{}); }

  function relTime(iso){
    const t=new Date(iso).getTime(); if(!t) return '';
    const s=Math.floor((Date.now()-t)/1000);
    if(s<60) return 'nå';
    if(s<3600) return Math.floor(s/60)+' min siden';
    if(s<86400) return Math.floor(s/3600)+' t siden';
    if(s<172800) return 'i går';
    if(s<604800) return Math.floor(s/86400)+' dager siden';
    return new Date(iso).toLocaleDateString('no-NO',{day:'numeric',month:'short',year:'numeric'});
  }

  // ── API ───────────────────────────────────────────────────────────────────
  async function apiList(){
    const {token, uid} = await getAuth();
    if(!uid) throw new Error('not-logged-in');
    const res = await fetch(`${SB_URL}/rest/v1/docs?owner_id=eq.${uid}&order=updated_at.desc&select=id,title,content,format,created_at,updated_at`, {headers:hdrs(token)});
    if(!res.ok) throw new Error('list-failed');
    return res.json();
  }
  async function apiCreate(){
    const {token, uid} = await getAuth();
    if(!uid) throw new Error('not-logged-in');
    const res = await fetch(`${SB_URL}/rest/v1/docs`, {
      method:'POST', headers:hdrs(token,{'Prefer':'return=representation'}),
      body: JSON.stringify({owner_id:uid, title:'Uten tittel', content:''})
    });
    if(!res.ok) throw new Error('create-failed');
    return (await res.json())[0];
  }
  async function apiUpdate(id, fields){
    const {token, uid} = await getAuth();
    if(!uid) throw new Error('not-logged-in');
    const res = await fetch(`${SB_URL}/rest/v1/docs?id=eq.${id}&owner_id=eq.${uid}`, {
      method:'PATCH', headers:hdrs(token,{'Prefer':'return=representation'}), body: JSON.stringify(fields)
    });
    if(!res.ok) throw new Error('update-failed');
    return (await res.json())[0];
  }
  async function apiDelete(id){
    const {token, uid} = await getAuth();
    if(!uid) throw new Error('not-logged-in');
    const res = await fetch(`${SB_URL}/rest/v1/docs?id=eq.${id}&owner_id=eq.${uid}`, {
      method:'DELETE', headers:hdrs(token,{'Prefer':'return=minimal'})
    });
    if(!res.ok) throw new Error('delete-failed');
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  function shell(inner){
    const c = el('docsContent'); if(!c) return;
    c.innerHTML = `<div class="docs-wrap">${inner}</div>`;
  }
  function stateView(ico, title, sub, btn){
    return `<div class="docs-state">
      <div class="docs-state-ico">${ico}</div>
      <div class="docs-state-t">${esc(title)}</div>
      ${sub?`<div class="docs-state-s">${esc(sub)}</div>`:''}
      ${btn||''}
    </div>`;
  }

  window.renderDocs = async function(){
    const c = el('docsContent'); if(!c) return;
    if(_loading) return;
    _loading = true;
    shell(`<div class="docs-loading"><span class="docs-spinner"></span> Laster dokumenter…</div>`);
    try{
      _docs = await apiList();
      _loading = false;
      if(_currentId && !_docs.some(d=>d.id===_currentId)) _currentId = null;
      if(!_currentId && _docs.length) _currentId = _docs[0].id;   // newest-edited
      renderLayout();
    }catch(e){
      _loading = false;
      if(e.message==='not-logged-in'){
        shell(stateView('🔒','Logg inn','Logg inn for å bruke Docs.',''));
      }else{
        shell(stateView('⚠️','Kunne ikke laste','Noe gikk galt. Prøv igjen.',
          `<button class="docs-btn-primary" onclick="window.renderDocs()">Prøv igjen</button>`));
      }
    }
  };

  function renderLayout(){
    if(!_docs.length){
      shell(`<aside class="docs-sidebar">
          <div class="docs-side-hd"><span>Docs</span>
            <button class="docs-new-btn" onclick="window.docsNew()" title="Nytt dokument">＋</button></div>
          <div id="docsList" class="docs-list"></div>
        </aside>
        <section class="docs-editor docs-editor-empty">
          ${stateView('📝','Ingen dokumenter ennå','Lag ditt første dokument for idéer, lyrics, notater og planer.',
            `<button class="docs-btn-primary" onclick="window.docsNew()">Create new doc</button>`)}
        </section>`);
      return;
    }
    shell(`
      <aside class="docs-sidebar">
        <div class="docs-side-hd"><span>Docs</span>
          <button class="docs-new-btn" onclick="window.docsNew()" title="Nytt dokument">＋</button></div>
        <div class="docs-search-wrap">
          <input id="docsSearch" class="docs-search" placeholder="Søk i dokumenter…" oninput="window.docsFilter(this.value)">
        </div>
        <div id="docsList" class="docs-list"></div>
      </aside>
      <section class="docs-editor" id="docsEditorPane"></section>`);
    renderSidebar();
    renderEditor();
  }

  function renderSidebar(filter){
    const list = el('docsList'); if(!list) return;
    const q = (filter||'').toLowerCase();
    const rows = _docs.filter(d=>!q || (d.title||'').toLowerCase().includes(q) || stripHtml(d.content).toLowerCase().includes(q));
    if(!rows.length){ list.innerHTML = `<div class="docs-list-empty">Ingen treff.</div>`; return; }
    list.innerHTML = rows.map(d=>{
      const snip = stripHtml(d.content).slice(0,70) || 'Tomt dokument';
      return `<button class="docs-item${d.id===_currentId?' active':''}" onclick="window.docsOpen('${d.id}')">
        <div class="docs-item-title">${esc(d.title||'Uten tittel')}</div>
        <div class="docs-item-meta"><span class="docs-item-time">${esc(relTime(d.updated_at))}</span><span class="docs-item-snip">${esc(snip)}</span></div>
      </button>`;
    }).join('');
  }

  function renderEditor(){
    const pane = el('docsEditorPane'); if(!pane) return;
    const doc = _docs.find(d=>d.id===_currentId);
    if(!doc){ pane.classList.add('docs-editor-empty'); pane.innerHTML = stateView('📄','Velg et dokument','Velg et dokument fra listen, eller lag et nytt.',''); return; }
    pane.classList.remove('docs-editor-empty');
    pane.innerHTML = `
      <div class="docs-ed-bar">
        <input id="docsTitle" class="docs-ed-title" value="${esc(doc.title||'')}" placeholder="Uten tittel" spellcheck="false">
        <span id="docsSaveState" class="docs-save-state"></span>
        <button class="docs-del-btn" onclick="window.docsDelete('${doc.id}')" title="Slett dokument">🗑</button>
      </div>
      <div class="docs-toolbar" id="docsToolbar">
        <button data-cmd="bold" title="Fet (Ctrl+B)"><b>B</b></button>
        <button data-cmd="italic" title="Kursiv (Ctrl+I)"><i>I</i></button>
        <span class="docs-tb-sep"></span>
        <button data-block="h1" title="Overskrift 1">H1</button>
        <button data-block="h2" title="Overskrift 2">H2</button>
        <button data-block="p" title="Vanlig tekst">¶</button>
        <span class="docs-tb-sep"></span>
        <button data-cmd="insertUnorderedList" title="Punktliste">•</button>
        <button data-cmd="insertOrderedList" title="Nummerert liste">1.</button>
      </div>
      <div id="docsBody" class="docs-ed-body" contenteditable="true" spellcheck="true" data-placeholder="Skriv her…">${doc.content||''}</div>`;

    const titleEl = el('docsTitle'), bodyEl = el('docsBody'), tb = el('docsToolbar');

    titleEl.addEventListener('input', ()=>scheduleSave());
    titleEl.addEventListener('keydown', e=>{ if(e.key==='Enter'){ e.preventDefault(); bodyEl.focus(); } });
    bodyEl.addEventListener('input', ()=>scheduleSave());
    bodyEl.addEventListener('blur', ()=>flushSave());

    // Toolbar: keep selection in the editor (mousedown preventDefault), then run command.
    tb.addEventListener('mousedown', e=>{ if(e.target.closest('button')) e.preventDefault(); });
    tb.addEventListener('click', e=>{
      const b=e.target.closest('button'); if(!b) return;
      bodyEl.focus();
      if(b.dataset.cmd){ document.execCommand(b.dataset.cmd, false, null); }
      else if(b.dataset.block){ document.execCommand('formatBlock', false, b.dataset.block); }
      scheduleSave();
    });
  }

  // ── Save logic (debounced autosave) ──────────────────────────────────────────
  function setSaveState(txt, cls){
    const s = el('docsSaveState'); if(!s) return;
    s.textContent = txt; s.className = 'docs-save-state' + (cls?(' '+cls):'');
  }
  function scheduleSave(){
    setSaveState('Lagrer…','saving');
    clearTimeout(_saveTimer);
    _saveTimer = setTimeout(flushSave, 800);
  }
  async function flushSave(){
    clearTimeout(_saveTimer);
    const doc = _docs.find(d=>d.id===_currentId);
    if(!doc) return;
    const titleEl = el('docsTitle'), bodyEl = el('docsBody');
    if(!titleEl || !bodyEl) return;
    const title = (titleEl.value||'').trim() || 'Uten tittel';
    const content = bodyEl.innerHTML;
    if(title===doc.title && content===doc.content){ setSaveState('Lagret','ok'); return; }
    try{
      const updated = await apiUpdate(doc.id, {title, content});
      Object.assign(doc, {title:updated.title, content:updated.content, updated_at:updated.updated_at});
      // Re-sort newest-first and refresh sidebar (editor keeps focus — separate DOM).
      _docs.sort((a,b)=> new Date(b.updated_at) - new Date(a.updated_at));
      renderSidebar(el('docsSearch')?.value||'');
      setSaveState('Lagret','ok');
    }catch(e){
      setSaveState('Ikke lagret','err');
    }
  }

  // ── Public actions ───────────────────────────────────────────────────────────
  window.docsOpen = async function(id){
    if(id===_currentId) return;
    await flushSave();
    _currentId = id;
    renderSidebar(el('docsSearch')?.value||'');
    renderEditor();
    const t=el('docsTitle'); // keep focus in body for quick typing
    const b=el('docsBody'); if(b) b.focus();
  };
  window.docsNew = async function(){
    try{
      const doc = await apiCreate();
      _docs.unshift(doc);
      _currentId = doc.id;
      renderLayout();
      const t = el('docsTitle'); if(t){ t.focus(); t.select(); }
      toast('✓ Nytt dokument');
    }catch(e){
      toast(e.message==='not-logged-in' ? 'Logg inn for å lage dokument' : 'Kunne ikke lage dokument');
    }
  };
  window.docsDelete = function(id){
    const doc = _docs.find(d=>d.id===id); if(!doc) return;
    const run = async ()=>{
      try{
        await apiDelete(id);
        _docs = _docs.filter(d=>d.id!==id);
        if(_currentId===id) _currentId = _docs.length ? _docs[0].id : null;
        renderLayout();
        toast('🗑 Dokument slettet');
      }catch(e){ toast('Kunne ikke slette'); }
    };
    if(typeof window.showDeleteConfirm==='function') window.showDeleteConfirm(`Slette «${doc.title||'Uten tittel'}»?`, run);
    else if(confirm(`Slette «${doc.title||'Uten tittel'}»?`)) run();
  };
  window.docsFilter = function(v){ renderSidebar(v); };

  // ── Tab activation hook (mirrors admin-panel.js) ─────────────────────────────
  document.addEventListener('click', e=>{
    if(e.target.closest('.tab-btn[data-tab="docs"]') || e.target.closest('[data-mob-tab="docs"]')){
      setTimeout(window.renderDocs, 60);
    }
  });
  // Deep-link: open the Docs tab when the URL hash is #docs
  function maybeHash(){ if((location.hash||'').replace(/^#/,'').toLowerCase().startsWith('docs')){
    const btn=document.querySelector('.tab-btn[data-tab="docs"]'); if(btn) btn.click();
  }}
  window.addEventListener('hashchange', maybeHash);
  if(document.readyState!=='loading') setTimeout(maybeHash, 400);
  else document.addEventListener('DOMContentLoaded', ()=>setTimeout(maybeHash, 400));

})();
