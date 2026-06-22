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
    c.innerHTML = `<section class="content-panel glass docs-panel">
      <div class="section-title">
        <h2>Docs</h2>
        <span class="hint">Idéer, lyrics, notater og planer — fritt fra beats, album og mixtaper.</span>
      </div>
      <div class="docs-wrap">${inner}</div>
    </section>`;
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
          <div class="docs-side-hd"><span>Dokumenter</span>
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
        <div class="docs-side-hd"><span>Dokumenter</span>
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
        <span class="docs-tb-sep"></span>
        <button class="docs-hl-btn" data-hl="#f59e0b" style="background:#f59e0b" title="Uthev gul"></button>
        <button class="docs-hl-btn" data-hl="#10b981" style="background:#10b981" title="Uthev grønn"></button>
        <button class="docs-hl-btn" data-hl="#3b82f6" style="background:#3b82f6" title="Uthev blå"></button>
        <button class="docs-hl-btn" data-hl="#ec4899" style="background:#ec4899" title="Uthev rosa"></button>
        <button class="docs-hl-btn" data-hl="#ef4444" style="background:#ef4444" title="Uthev rød"></button>
        <button class="docs-hl-btn" data-hl="#a855f7" style="background:#a855f7" title="Uthev lilla"></button>
        <button class="docs-hl-btn docs-hl-clear" data-hl="" title="Fjern uthevning">✕</button>
      </div>
      <div id="docsBody" class="docs-ed-body" contenteditable="true" spellcheck="true" data-placeholder="Skriv her…">${doc.content||''}</div>`;

    const titleEl = el('docsTitle'), bodyEl = el('docsBody'), tb = el('docsToolbar');

    titleEl.addEventListener('input', ()=>scheduleSave());
    titleEl.addEventListener('keydown', e=>{ if(e.key==='Enter'){ e.preventDefault(); bodyEl.focus(); } });
    bodyEl.addEventListener('input', ()=>scheduleSave());
    bodyEl.addEventListener('blur', ()=>flushSave());
    // Paste: strip inherited colors (they made pasted text turn black on the dark editor).
    bodyEl.addEventListener('paste', onDocsPaste);

    // Toolbar: keep selection in the editor (mousedown preventDefault), then run command.
    tb.addEventListener('mousedown', e=>{ if(e.target.closest('button')) e.preventDefault(); });
    tb.addEventListener('click', e=>{
      const b=e.target.closest('button'); if(!b) return;
      bodyEl.focus();
      if(b.classList.contains('docs-hl-btn')){ docsHighlight(b.dataset.hl||''); return; }
      if(b.dataset.cmd){ document.execCommand(b.dataset.cmd, false, null); }
      else if(b.dataset.block){ document.execCommand('formatBlock', false, b.dataset.block); }
      scheduleSave();
    });
  }

  // ── Paste sanitising ─────────────────────────────────────────────────────────
  // Pasted HTML (Word/Google Docs/web) carries inline `color`/`bgcolor` — usually black —
  // which is unreadable on the dark editor. Strip those while keeping basic structure and
  // our own highlight marks. Falls back to plain text when no HTML is on the clipboard.
  function onDocsPaste(e){
    const cd = e.clipboardData || window.clipboardData;
    if(!cd) return;
    e.preventDefault();
    const html = cd.getData('text/html');
    if(html){
      document.execCommand('insertHTML', false, sanitizePastedHtml(html));
    } else {
      document.execCommand('insertText', false, cd.getData('text/plain') || '');
    }
    scheduleSave();
  }
  function sanitizePastedHtml(html){
    const root = document.createElement('div');
    root.innerHTML = html;
    root.querySelectorAll('script,style,meta,link,title,head,o\\:p').forEach(n=>n.remove());
    root.querySelectorAll('*').forEach(node=>{
      const tag = node.tagName;
      Array.from(node.attributes).forEach(attr=>{
        const name = attr.name.toLowerCase();
        if(tag==='A' && name==='href') return;            // keep links
        if(name==='style'){
          // Keep ONLY a background colour on <mark> (our highlight); drop every text colour.
          const bg = node.style.backgroundColor || '';
          node.removeAttribute('style');
          if(tag==='MARK' && bg) node.style.background = bg;
          return;
        }
        node.removeAttribute(attr.name);                  // color, bgcolor, class, id, face…
      });
    });
    return root.innerHTML;
  }

  // ── Highlight (uthev), mirrors Lyric Lab: wrap selection in <mark> (black text on colour) ──
  function docsHighlight(color){
    const bodyEl = el('docsBody'); if(!bodyEl) return;
    const sel = window.getSelection();
    if(!sel || sel.rangeCount===0 || sel.isCollapsed){ toast('Marker tekst først'); return; }
    let range = sel.getRangeAt(0);
    if(!bodyEl.contains(range.commonAncestorContainer)){ toast('Marker tekst i dokumentet'); return; }

    if(!color){ unwrapDocsMarks(bodyEl, range); bodyEl.normalize(); scheduleSave(); return; }

    // Selection sits fully inside one existing highlight → just recolour it.
    const host = range.commonAncestorContainer;
    const inMark = (host.nodeType===3 ? host.parentElement : host)?.closest?.('mark');
    if(inMark && bodyEl.contains(inMark)){ inMark.style.background = color; scheduleSave(); return; }

    // Otherwise drop any overlapping marks, then wrap a fresh one.
    unwrapDocsMarks(bodyEl, range);
    if(sel.rangeCount) range = sel.getRangeAt(0);
    if(range.collapsed){ scheduleSave(); return; }
    const mark = document.createElement('mark');
    mark.className = 'docs-hl';
    mark.style.background = color;
    try { range.surroundContents(mark); }
    catch(_){ const frag = range.extractContents(); mark.appendChild(frag); range.insertNode(mark); }
    const r = document.createRange(); r.selectNodeContents(mark);
    sel.removeAllRanges(); sel.addRange(r);
    bodyEl.normalize();
    scheduleSave();
  }
  function unwrapDocsMarks(editor, range){
    Array.from(editor.querySelectorAll('mark')).forEach(mark=>{
      const mRange = document.createRange(); mRange.selectNode(mark);
      const overlaps = range.compareBoundaryPoints(Range.END_TO_START, mRange) < 0 &&
                       range.compareBoundaryPoints(Range.START_TO_END, mRange) > 0;
      if(overlaps){
        const parent = mark.parentNode;
        while(mark.firstChild) parent.insertBefore(mark.firstChild, mark);
        parent.removeChild(mark);
      }
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
