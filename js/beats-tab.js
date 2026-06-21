// === beats-tab.js ===
// Beats-oversiktsfane — total visning av alle ikke-arkiverte sanger.
//
// Features: søk (navn/mixtape/album/uploader), sortering, ⋯-meny per sang.
// Meny-innhold: Spill, Favoritt, Arkiver, Slett (kun admin via isAdmin()).
// Varighet lagres på beat.duration første gang lydfilen lastes.
// Oppdaterer automatisk når renderAll() kalles og tabben er synlig.
(function () {
  'use strict';

  // ── State ──────────────────────────────────────────────────────────────────
  let searchQ = '';
  let sortMode = 'newest'; // newest | oldest | name | rating | duration
  let openDropdownId = null;

  // ── Helpers ────────────────────────────────────────────────────────────────
  function esc(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

  function fmtDate(ts) {
    if (!ts) return '—';
    return new Date(ts).toLocaleDateString('no-NO', { day:'2-digit', month:'short', year:'numeric' });
  }

  function fmtDur(secs) {
    if (!secs || !isFinite(secs)) return '—';
    const m = Math.floor(secs / 60), s = Math.floor(secs % 60);
    return `${m}:${String(s).padStart(2,'0')}`;
  }

  function getCollections(beatId) {
    const st = typeof state !== 'undefined' ? state : window.state;
    if (!st) return [];
    const cols = [];
    (st.mixtapes || []).forEach(m => { if ((m.beatIds||[]).includes(beatId)) cols.push({ type:'mixtape', name: m.name, id: m.id }); });
    (st.albums  || []).forEach(a => { if ((a.beatIds||[]).includes(beatId)) cols.push({ type:'album',   name: a.name, id: a.id }); });
    return cols;
  }

  function getFilteredBeats() {
    const st = typeof state !== 'undefined' ? state : window.state;
    if (!st) return [];
    let beats = [...(st.beats || [])].filter(b => !b.archived);
    if (searchQ) {
      const q = searchQ.toLowerCase();
      beats = beats.filter(b =>
        (b.name||'').toLowerCase().includes(q) ||
        (b.source||'').toLowerCase().includes(q) ||
        (b.uploadedBy||'').toLowerCase().includes(q) ||
        getCollections(b.id).some(c => c.name.toLowerCase().includes(q))
      );
    }
    beats.sort((a, b) => {
      if (sortMode === 'newest')   return (b.createdAt||0) - (a.createdAt||0);
      if (sortMode === 'oldest')   return (a.createdAt||0) - (b.createdAt||0);
      if (sortMode === 'name')     return (a.name||'').localeCompare(b.name||'');
      if (sortMode === 'rating')   return (b.rating||0) - (a.rating||0);
      if (sortMode === 'duration') return (b.duration||0) - (a.duration||0);
      return 0;
    });
    return beats;
  }

  // ── Dropdown ───────────────────────────────────────────────────────────────
  function closeDropdown() {
    openDropdownId = null;
    document.querySelectorAll('.bt-dropdown').forEach(d => d.remove());
  }

  function openDropdown(beatId, triggerEl) {
    closeDropdown();
    const beat = (typeof state !== 'undefined' ? state : window.state)?.beats?.find(b => b.id === beatId);
    if (!beat) return;
    openDropdownId = beatId;

    const admin = typeof isAdmin === 'function' ? isAdmin() : sessionStorage.getItem('mv_role') === 'admin';
    const isArch = !!beat.archived;

    const menu = document.createElement('div');
    menu.className = 'bt-dropdown';
    const mixtapes = (typeof state !== 'undefined' ? state.mixtapes : window.state?.mixtapes || []).filter(m=>!m.archived);
    const albums   = (typeof state !== 'undefined' ? state.albums   : window.state?.albums   || []).filter(a=>!a.archived);
    menu.innerHTML = `
      <button onclick="beatsTab.playBeat('${beatId}')">▶ Spill</button>
      ${admin ? `<button onclick="downloadBeat('${beatId}')">⬇ Last ned</button>` : ''}
      ${admin ? `<button onclick="renameBeat('${beatId}')">✏️ Gi nytt navn</button>` : ''}
      ${admin ? `<button onclick="beatsTab.toggleFav('${beatId}')">${beat.favorite ? '★ Fjern favoritt' : '☆ Legg til favoritt'}</button>` : ''}
      ${admin && mixtapes.length ? `<hr style="border:none;border-top:1px solid rgba(255,255,255,.08);margin:4px 0">
        <div style="padding:4px 10px 2px;font-size:9px;font-weight:900;letter-spacing:.1em;color:rgba(255,255,255,.3);text-transform:uppercase">Legg i mixtape</div>
        ${mixtapes.map(m=>{
          const inIt=(m.beatIds||[]).includes(beatId);
          return `<button onclick="beatsTab.addToCollection('${beatId}','mixtape','${m.id}')" style="${inIt?'color:rgba(255,255,255,.3);':''}">
            ${inIt?'✓ ':''}<span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:inline-block;max-width:130px">${m.name.replace(/</g,'&lt;')}</span>
          </button>`;
        }).join('')}` : ''}
      ${admin && albums.length ? `<hr style="border:none;border-top:1px solid rgba(255,255,255,.08);margin:4px 0">
        <div style="padding:4px 10px 2px;font-size:9px;font-weight:900;letter-spacing:.1em;color:rgba(255,255,255,.3);text-transform:uppercase">Legg i album</div>
        ${albums.map(a=>{
          const inIt=(a.beatIds||[]).includes(beatId);
          return `<button onclick="beatsTab.addToCollection('${beatId}','album','${a.id}')" style="${inIt?'color:rgba(255,255,255,.3);':''}">
            ${inIt?'✓ ':''}<span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:inline-block;max-width:130px">${a.name.replace(/</g,'&lt;')}</span>
          </button>`;
        }).join('')}` : ''}
      ${admin ? `<hr style="border:none;border-top:1px solid rgba(255,255,255,.08);margin:4px 0">` : ''}
      ${admin ? `<hr style="border:none;border-top:1px solid rgba(255,255,255,.08);margin:4px 0">` : ''}
      ${admin && !beat._shared ? `<button onclick="openShareDirect('beat','${beatId}','${(beat.name||'Beat').replace(/["']/g,"")}')">🔗 Del med bruker</button>` : ''}
      ${admin ? `<button onclick="beatsTab.shareLink('${beatId}')">🌐 Del offentlig lenke</button>` : ''}
      ${admin ? `<button onclick="beatsTab.archiveBeat('${beatId}')">${isArch ? '↩ Gjenopprett' : '📦 Arkiver sang'}</button>` : ''}
      ${admin ? `<button class="danger" onclick="beatsTab.deleteBeat('${beatId}')">🗑 Slett permanent</button>` : ''}
    `;

    // Position relative to trigger
    document.body.appendChild(menu);
    const rect = triggerEl.getBoundingClientRect();
    const mw = 220;
    let left = rect.right - mw + window.scrollX;
    if (left < 8) left = 8;
    menu.style.cssText = `
      position:absolute;
      top:${rect.bottom + window.scrollY + 4}px;
      left:${left}px;
      width:${mw}px;
      z-index:9000;
    `;
  }

  // ── Beat actions ───────────────────────────────────────────────────────────
  function playBeat(beatId) {
    closeDropdown();
    if (typeof playSingleBeat === 'function') playSingleBeat(beatId);
  }

  function toggleFav(beatId) {
    closeDropdown();
    if (typeof toggleFav === 'function') { toggleFav(beatId); return; }
    const st = typeof state !== 'undefined' ? state : window.state;
    const beat = st?.beats?.find(b => b.id === beatId);
    if (beat) { beat.favorite = !beat.favorite; if(typeof saveState==='function') saveState(); renderBeatsTab(); }
  }

  function archiveBeat(beatId) {
    closeDropdown();
    if (typeof toggleArchiveItem === 'function') toggleArchiveItem('beat', beatId);
    setTimeout(renderBeatsTab, 50);
  }

  function deleteBeat(beatId) {
    closeDropdown();
    if (typeof window.deleteBeat === 'function') window.deleteBeat(beatId);
    setTimeout(renderBeatsTab, 100);
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  function renderBeatsTab() {
    const container = document.getElementById('beatsTabContent');
    if (!container) return;
    const beats = getFilteredBeats();
    const total = (typeof state !== 'undefined' ? state : window.state)?.beats?.filter(b => !b.archived).length || 0;

    container.innerHTML = `
      <div class="beats-tab-wrap">
        <div class="beats-tab-header">
          <div class="beats-tab-title">
            <h1>Beats</h1>
            <span class="beats-count">${total} sanger</span>
          </div>
          <div class="beats-tab-controls">
            <div class="beats-search-wrap">
              <span class="beats-search-icon">🔍</span>
              <input
                id="beatsSearchInput"
                class="beats-search"
                placeholder="Søk etter navn, album, mixtape..."
                value="${esc(searchQ)}"
                oninput="beatsTab.onSearch(this.value)"
              />
              ${searchQ ? `<button class="beats-search-clear" onclick="beatsTab.onSearch('')">✕</button>` : ''}
            </div>
            <select class="beats-sort" onchange="beatsTab.onSort(this.value)">
              <option value="newest"   ${sortMode==='newest'  ?'selected':''}>Nyeste først</option>
              <option value="oldest"   ${sortMode==='oldest'  ?'selected':''}>Eldste først</option>
              <option value="name"     ${sortMode==='name'    ?'selected':''}>Navn A–Å</option>
              <option value="rating"   ${sortMode==='rating'  ?'selected':''}>Høyest rating</option>
              <option value="duration" ${sortMode==='duration'?'selected':''}>Lengde</option>
            </select>
          </div>
        </div>

        <div class="beats-list-header">
          <span class="bl-num">#</span>
          <span class="bl-cover"></span>
          <span class="bl-name">Navn</span>
          <span class="bl-collections">Samlinger</span>
          <span class="bl-uploader">Lastet opp av</span>
          <span class="bl-date">Dato</span>
          <span class="bl-dur">Lengde</span>
          <span class="bl-actions"></span>
        </div>

        <div class="beats-list">
          ${beats.length === 0 ? `
            <div class="beats-empty">
              ${searchQ ? `Ingen beats matcher "<strong>${esc(searchQ)}</strong>"` : 'Ingen beats ennå — last opp sanger i mixtapes eller albumer.'}
            </div>
          ` : beats.map((b, i) => {
            const cols = getCollections(b.id);
            const coverHtml = b.cover
              ? `<img src="${esc(b.cover)}" class="bl-cover-img" alt="">`
              : `<div class="bl-cover-ph">♪</div>`;

            const colChips = cols.length
              ? cols.map(c => `<span class="bl-chip ${c.type}">${esc(c.name)}</span>`).join('')
              : `<span style="color:var(--muted);font-size:11px">—</span>`;

            return `
              <div class="bl-row" data-beat-id="${b.id}">
                <span class="bl-num">${i + 1}</span>
                <span class="bl-cover">${coverHtml}</span>
                <span class="bl-name">
                  <span class="bl-title">${esc(b.name)}</span>
                  ${b.rating ? `<span class="bl-rating">${'★'.repeat(Math.round(b.rating/2))}</span>` : ''}
                </span>
                <span class="bl-collections">${colChips}</span>
                <span class="bl-uploader">${b.uploadedBy ? `<span class="bl-uploader-tag">👤 ${esc(b.uploadedBy)}</span>` : '<span style="color:var(--muted)">—</span>'}</span>
                <span class="bl-date">${fmtDate(b.createdAt)}</span>
                <span class="bl-dur">${fmtDur(b.duration)}</span>
                <span class="bl-actions">
                  <button class="bl-play" onclick="event.stopPropagation();beatsTab.playBeat('${b.id}')" title="Spill">▶</button>
                  <button class="bl-star${b.favorite?' active':''}" onclick="event.stopPropagation();beatsTab.toggleFav('${b.id}')" title="${b.favorite?'Fjern favoritt':'Legg til favoritt'}">★</button>
                  <button class="bl-menu" onclick="event.stopPropagation();beatsTab.openDropdown('${b.id}',this)" title="Mer">⋯</button>
                </span>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }

  // ── Event handlers ─────────────────────────────────────────────────────────
  function onSearch(val) {
    searchQ = val;
    renderBeatsTab();
    const input = document.getElementById('beatsSearchInput');
    if (input) { input.focus(); input.setSelectionRange(val.length, val.length); }
  }

  function onSort(val) {
    sortMode = val;
    renderBeatsTab();
  }

  // ── CSS injection ──────────────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById('beats-tab-style')) return;
    const style = document.createElement('style');
    style.id = 'beats-tab-style';
    style.textContent = `
      .beats-tab-wrap { padding: 0 0 80px; max-width: 1200px; margin: 0 auto; }

      .beats-tab-header {
        display: flex; align-items: center; justify-content: space-between;
        flex-wrap: wrap; gap: 16px; margin-bottom: 20px;
      }
      .beats-tab-title { display: flex; align-items: baseline; gap: 12px; }
      .beats-tab-title h1 { font-size: 28px; font-weight: 900; letter-spacing: -.04em; margin: 0; }
      .beats-count {
        font-size: 12px; font-weight: 800; letter-spacing: .08em;
        color: var(--muted); background: rgba(255,255,255,.06);
        padding: 3px 10px; border-radius: 999px;
      }
      .beats-tab-controls { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }

      .beats-search-wrap {
        position: relative; display: flex; align-items: center;
      }
      .beats-search-icon {
        position: absolute; left: 12px; font-size: 13px; pointer-events: none;
      }
      .beats-search {
        background: rgba(255,255,255,.07); border: 1px solid rgba(255,255,255,.12);
        border-radius: 12px; padding: 9px 32px 9px 34px; color: var(--text);
        font-size: 13px; font-family: inherit; outline: none; width: 240px;
        transition: border-color .15s;
      }
      .beats-search:focus { border-color: rgba(168,85,247,.5); background: rgba(168,85,247,.06); }
      .beats-search-clear {
        position: absolute; right: 10px; background: none; border: none;
        color: var(--muted); cursor: pointer; font-size: 12px; padding: 2px 4px;
      }

      .beats-sort {
        background: rgba(255,255,255,.07); border: 1px solid rgba(255,255,255,.12);
        border-radius: 12px; padding: 9px 12px; color: var(--text);
        font-size: 13px; font-family: inherit; cursor: pointer; outline: none;
      }

      .beats-list-header {
        display: grid;
        grid-template-columns: 32px 40px minmax(160px,2fr) minmax(120px,1.5fr) 110px 90px 60px 72px;
        gap: 0 10px; padding: 0 12px 8px; border-bottom: 1px solid rgba(255,255,255,.07);
        font-size: 11px; font-weight: 800; letter-spacing: .08em;
        color: var(--muted); text-transform: uppercase;
      }

      .beats-list { display: flex; flex-direction: column; gap: 1px; }

      .bl-row {
        display: grid;
        grid-template-columns: 32px 40px minmax(160px,2fr) minmax(120px,1.5fr) 110px 90px 60px 72px;
        gap: 0 10px; align-items: center;
        padding: 5px 12px; border-radius: 10px;
        transition: background .12s; cursor: default;
      }
      .bl-row:hover { background: rgba(255,255,255,.05); }
      .bl-row:hover .bl-play { opacity: 1; }

      .bl-num { font-size: 12px; color: var(--muted); text-align: center; }
      .bl-cover { width: 36px; }
      .bl-cover-img { width: 36px; height: 36px; border-radius: 6px; object-fit: cover; }
      .bl-cover-ph {
        width: 36px; height: 36px; border-radius: 6px;
        background: rgba(168,85,247,.15); display: flex; align-items: center;
        justify-content: center; font-size: 14px; color: rgba(168,85,247,.6);
      }

      .bl-name { display: flex; align-items: center; gap: 6px; min-width: 0; }
      .bl-title {
        font-size: 13px; font-weight: 800; letter-spacing: -.01em;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      .bl-fav { color: #f4a443; font-size: 12px; flex-shrink: 0; }
      .bl-rating { font-size: 10px; color: #f4a443; letter-spacing: -1px; flex-shrink: 0; }

      .bl-collections { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }
      .bl-chip {
        font-size: 10px; font-weight: 800; letter-spacing: .04em;
        padding: 2px 8px; border-radius: 999px; white-space: nowrap;
        max-width: 120px; overflow: hidden; text-overflow: ellipsis;
      }
      .bl-chip.mixtape { background: rgba(168,85,247,.15); color: #c084fc; }
      .bl-chip.album   { background: rgba(34,211,238,.12); color: #67e8f9; }

      .bl-uploader-tag {
        font-size: 11px; font-weight: 700; color: var(--mv-amber, #ff8a1f);
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }

      .bl-date { font-size: 11px; color: var(--muted); white-space: nowrap; }
      .bl-dur  { font-size: 12px; color: var(--muted); font-variant-numeric: tabular-nums; }

      .bl-actions { display: flex; gap: 4px; align-items: center; justify-content: flex-end; }
      .bl-play {
        background: rgba(244,164,67,.15); border: none; border-radius: 50%;
        width: 28px; height: 28px; color: #f4a443; font-size: 11px;
        cursor: pointer; display: flex; align-items: center; justify-content: center;
        opacity: 0; transition: opacity .12s, background .12s;
      }
      .bl-play:hover { background: rgba(244,164,67,.3); }
      .bl-menu {
        background: rgba(255,255,255,.07); border: 1px solid rgba(255,255,255,.1);
        border-radius: 8px; width: 28px; height: 28px; color: var(--text);
        font-size: 16px; cursor: pointer; display: flex; align-items: center;
        justify-content: center; transition: background .12s;
      }
      .bl-menu:hover { background: rgba(255,255,255,.14); }

      .beats-empty {
        text-align: center; padding: 48px 20px; color: var(--muted);
        font-size: 14px; line-height: 1.7;
      }

      /* Dropdown */
      .bt-dropdown {
        background: #1a1825; border: 1px solid rgba(255,255,255,.12);
        border-radius: 12px; padding: 6px; box-shadow: 0 16px 48px rgba(0,0,0,.6);
        display: flex; flex-direction: column; gap: 2px;
      }
      .bt-dropdown button {
        background: none; border: none; color: var(--text); font-size: 13px;
        font-family: inherit; font-weight: 700; padding: 8px 12px;
        border-radius: 8px; cursor: pointer; text-align: left; width: 100%;
        transition: background .1s;
      }
      .bt-dropdown button:hover { background: rgba(255,255,255,.08); }
      .bt-dropdown button.danger { color: #fb7185; }
      .bt-dropdown button.danger:hover { background: rgba(251,113,133,.12); }

      /* Mobile responsiveness */
      @media (max-width: 768px) {
        .beats-list-header,
        .bl-row {
          grid-template-columns: 30px minmax(0,1fr) 60px 56px;
        }
        .beats-list-header .bl-cover,
        .beats-list-header .bl-collections,
        .beats-list-header .bl-uploader,
        .beats-list-header .bl-date,
        .bl-row .bl-cover,
        .bl-row .bl-collections,
        .bl-row .bl-uploader,
        .bl-row .bl-date { display: none; }
      }
    `;
    document.head.appendChild(style);
  }

  // ── Store duration when audio loads ──────────────────────────────────────────
  // Hook into audio element creation to persist duration on beat
  function tryStoreDuration(beatId) {
    const st = typeof state !== 'undefined' ? state : window.state;
    const beat = st?.beats?.find(b => b.id === beatId);
    if (!beat) return;
    const audio = document.getElementById('au-' + beatId);
    if (!audio) return;
    const onLoaded = () => {
      if (isFinite(audio.duration) && audio.duration > 0) {
        beat.duration = audio.duration;
        if (typeof saveState === 'function') saveState();
      }
    };
    if (isFinite(audio.duration) && audio.duration > 0) {
      onLoaded();
    } else {
      audio.addEventListener('loadedmetadata', onLoaded, { once: true });
    }
  }
  window.beatsTabStoreDuration = tryStoreDuration;

  // ── Init ──────────────────────────────────────────────────────────────────
  function init() {
    injectStyles();

    // Close dropdown on outside click
    document.addEventListener('click', e => {
      if (!e.target.closest('.bt-dropdown') && !e.target.closest('.bl-menu')) {
        closeDropdown();
      }
    });

    // Install on tab click
    document.addEventListener('click', e => {
      const btn = e.target.closest('.tab-btn[data-tab="beats"]');
      if (btn) setTimeout(renderBeatsTab, 0);
    });

    // Re-render when data changes (hook into renderAll)
    const _origRenderAll = window.renderAll;
    if (typeof _origRenderAll === 'function') {
      window.renderAll = function () {
        const r = _origRenderAll.apply(this, arguments);
        const beatsTab = document.getElementById('beatsTab');
        if (beatsTab && !beatsTab.classList.contains('hidden')) renderBeatsTab();
        return r;
      };
    }

    // Double-click on song title to rename
    document.addEventListener('dblclick', e => {
      const titleEl = e.target.closest('.bl-title');
      if (!titleEl) return;
      const row = titleEl.closest('[data-beat-id]');
      if (!row) return;
      const admin = typeof isAdmin === 'function' ? isAdmin() : sessionStorage.getItem('mv_role') === 'admin';
      if (!admin) return;
      e.stopPropagation();
      if (typeof window.renameBeat === 'function') window.renameBeat(row.dataset.beatId);
    });

    // Store duration whenever beat audio loads
    document.addEventListener('loadedmetadata', e => {
      const audio = e.target;
      if (!audio || audio.tagName !== 'AUDIO') return;
      const id = audio.id?.replace('au-', '');
      if (id) tryStoreDuration(id);
    }, true);
  }

  // ── Public API ────────────────────────────────────────────────────────────
  window.beatsTab = { renderBeatsTab, onSearch, onSort, openDropdown, playBeat, toggleFav, archiveBeat, deleteBeat,
    renameBeat: (id) => window.renameBeat?.(id),
    shareLink(id){ closeDropdown(); if(typeof window.shareSong==='function') window.shareSong(id); },
    addToCollection(beatId, type, colId){
      const st = typeof state !== 'undefined' ? state : window.state;
      if(!st) return;
      const col = type==='mixtape'
        ? (st.mixtapes||[]).find(m=>m.id===colId)
        : (st.albums||[]).find(a=>a.id===colId);
      if(!col) return;
      if(!(col.beatIds||[]).includes(beatId)){
        if(!col.beatIds) col.beatIds=[];
        col.beatIds.push(beatId);
        if(typeof saveState==='function') saveState();
        if(typeof showToast==='function') showToast(`✓ Lagt til i ${col.name}`);
      } else {
        if(typeof showToast==='function') showToast(`Allerede i ${col.name}`);
      }
      // Close dropdown
      document.querySelectorAll('.bt-dropdown').forEach(m=>m.remove());
    }
  };
  window.renderBeatsTab = renderBeatsTab;

  if (document.readyState !== 'loading') init();
  else document.addEventListener('DOMContentLoaded', init);
})();
