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
  let fuzzyIds = null;   // id-er som bare matchet uskarpt (beholdes etter sortering)
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
    fuzzyIds = null;
    if (searchQ) {
      const q = searchQ.toLowerCase();
      const all = beats;
      const exact = beats.filter(b =>
        (b.name||'').toLowerCase().includes(q) ||
        (b.source||'').toLowerCase().includes(q) ||
        ((window.mvUploaderName?mvUploaderName(b):b.uploadedBy)||'').toLowerCase().includes(q) ||
        (Number(b.bpm)>0 && String(b.bpm)===q.replace(/\s*bpm$/,'').trim()) ||   // «140» eller «140 bpm»
        getCollections(b.id).some(c => c.name.toLowerCase().includes(q))
      );
      // Uskarpe treff (search.js): tåler skrivefeil — legges etter de vanlige treffene
      if (typeof window.mvFuzzyBeats === 'function') {
        const have = new Set(exact.map(b => b.id));
        const extra = window.mvFuzzyBeats(all.filter(b => !have.has(b.id)), searchQ, id => getCollections(id).map(c => c.name).join(' '));
        beats = exact.concat(extra);
        fuzzyIds = new Set(extra.map(b => b.id));
      } else beats = exact;
    }
    beats.sort((a, b) => {
      if (fuzzyIds) { const fa = fuzzyIds.has(a.id), fb = fuzzyIds.has(b.id); if (fa !== fb) return fa ? 1 : -1; if (fa) return 0; }
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
    // Kort meny (kritikk 6): det du gjør ofte øverst, resten i «Mer», og ingen permanent sletting her —
    // «Flytt til arkivet» kan angres, og permanent sletting skjer fra arkivet.
    menu.innerHTML = `
      <button onclick="window.mvQueuePlayNext&&mvQueuePlayNext('${beatId}')"><span class="ic ic-list" aria-hidden="true"></span> Spill neste</button>
      <button onclick="window.mvQueueAdd&&mvQueueAdd('${beatId}')"><span class="ic ic-plus" aria-hidden="true"></span> Legg i kø</button>
      <button onclick="beatsTab.openLyricLab('${beatId}')"><span class="ic ic-pen" aria-hidden="true"></span> Åpne i Lyric Lab</button>
      ${admin && (mixtapes.length || albums.length) ? `<details class="bt-sub"><summary><span class="ic ic-disc" aria-hidden="true"></span> Legg til i album/mixtape</summary><div class="bt-sub-list">
      ${admin && mixtapes.length ? `        <div style="padding:4px 10px 2px;font-size:9px;font-weight:900;letter-spacing:.1em;color:rgb(var(--ink-rgb) / calc(.3 + (1 - .3) * var(--ink-boost)));text-transform:uppercase">Legg i mixtape</div>
        ${mixtapes.map(m=>{
          const inIt=(m.beatIds||[]).includes(beatId);
          return `<button onclick="beatsTab.addToCollection('${beatId}','mixtape','${m.id}')" style="${inIt?'color:rgb(var(--ink-rgb) / calc(.3 + (1 - .3) * var(--ink-boost)));':''}">
            ${inIt?'✓ ':''}<span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:inline-block;max-width:130px">${m.name.replace(/</g,'&lt;')}</span>
          </button>`;
        }).join('')}` : ''}
      ${admin && albums.length ? `        <div style="padding:4px 10px 2px;font-size:9px;font-weight:900;letter-spacing:.1em;color:rgb(var(--ink-rgb) / calc(.3 + (1 - .3) * var(--ink-boost)));text-transform:uppercase">Legg i album</div>
        ${albums.map(a=>{
          const inIt=(a.beatIds||[]).includes(beatId);
          return `<button onclick="beatsTab.addToCollection('${beatId}','album','${a.id}')" style="${inIt?'color:rgb(var(--ink-rgb) / calc(.3 + (1 - .3) * var(--ink-boost)));':''}">
            ${inIt?'✓ ':''}<span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:inline-block;max-width:130px">${a.name.replace(/</g,'&lt;')}</span>
          </button>`;
        }).join('')}` : ''}
      </div></details>` : ''}
      ${admin && !beat._shared && window.mvSetSongPublic ? `<button onclick="beatsTab.togglePublic('${beatId}')"><span class="ic ic-globe" aria-hidden="true"></span> ${window.mvIsSongPublic(beatId) ? 'Fjern fra Explore' : 'Gjør offentlig på Explore'}</button>` : ''}
      ${admin ? `<details class="bt-sub"><summary><span class="ic ic-sliders" aria-hidden="true"></span> Mer</summary><div class="bt-sub-list">
  ${admin ? `<button onclick="downloadBeat('${beatId}')"><span class="ic ic-download" aria-hidden="true"></span> Last ned</button>` : ''}
  ${admin ? `<button onclick="beatsTab.swapAudio('${beatId}')" title="Erstatt lydfilen — den gamle slettes permanent"><span class="ic ic-music" aria-hidden="true"></span> Bytt lydfil</button>` : ''}
  ${admin ? `<button onclick="renameBeat('${beatId}')"><span class="ic ic-pen" aria-hidden="true"></span> Gi nytt navn</button>` : ''}
  ${admin && !beat._shared ? `<button onclick="openShareDirect('beat','${beatId}','${(beat.name||'Beat').replace(/["']/g,"")}')"><span class="ic ic-link" aria-hidden="true"></span> Del med bruker</button>` : ''}
  ${admin ? `<button onclick="beatsTab.shareLink('${beatId}')"><span class="ic ic-link" aria-hidden="true"></span> Lag delingslenke</button>` : ''}
      </div></details>` : ''}
      ${admin ? `<hr style="border:none;border-top:1px solid rgb(var(--ink-rgb) / .08);margin:4px 0"><button onclick="beatsTab.archiveBeat('${beatId}')">${isArch ? '<span class="ic ic-refresh" aria-hidden="true"></span> Gjenopprett' : '<span class="ic ic-archive" aria-hidden="true"></span> Flytt til arkivet'}</button>` : ''}
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

  // Ny låt (lastet opp nylig i denne fanen) som ennå ikke har tekst
  function fresh(b){ return !!(window.mvFresh && window.mvFresh.has(b.id)) && !((b.lyricSections||[]).some(s => s && s.text && s.text.trim()) || (b.lyrics||'').trim()); }
  function toggleFav(beatId) {
    closeDropdown();
    // NB: «toggleFav» her ville peke på denne funksjonen selv (uendelig rekursjon) — bruk den globale i db.js
    if (typeof window.toggleFav === 'function' && window.toggleFav !== toggleFav) { window.toggleFav(beatId, document.querySelector('[data-fav-id="'+beatId+'"]')); renderBeatsTab(); return; }
    const st = typeof state !== 'undefined' ? state : window.state;
    const beat = st?.beats?.find(b => b.id === beatId);
    if (beat) { beat.favorite = !beat.favorite; if(typeof saveState==='function') saveState(); renderBeatsTab(); }
  }

  // Replace the song's audio file (F6). The dropdown is closed first, so we can't rely on a
  // <label><input type=file> inside it (it would be detached before `change` fires) — build a
  // throwaway input on <body> instead. uploadBeatAudio() (db.js) owns the warning + R2 overwrite.
  function swapAudio(beatId) {
    closeDropdown();
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'audio/*,.mp3,.wav,.m4a,.aac,.flac,.ogg,.aif,.aiff';
    inp.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
    const cleanup = () => { setTimeout(() => inp.remove(), 0); };
    inp.addEventListener('change', () => {
      const f = inp.files && inp.files[0];
      if (f && typeof uploadBeatAudio === 'function') uploadBeatAudio(beatId, f);
      cleanup();
    });
    inp.addEventListener('cancel', cleanup);
    document.body.appendChild(inp);
    inp.click();
  }

  function archiveBeat(beatId) {
    closeDropdown();
    if (typeof toggleArchiveItem === 'function') toggleArchiveItem('beat', beatId);
    setTimeout(() => {
      renderBeatsTab();
      const b = (window.state?.beats || []).find(x => x.id === beatId);
      if (b && typeof showToast === 'function')
        showToast(b.archived ? '✓ Flyttet til arkivet' : '✓ Gjenopprettet', 'Angre', () => { toggleArchiveItem('beat', beatId); setTimeout(renderBeatsTab, 50); });
    }, 50);
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
            <span class="beats-count" aria-live="polite">${searchQ ? `${beats.length} av ${total}` : `${total} sanger`}</span>
          </div>
          <div class="beats-tab-controls">
            <button type="button" class="primary-btn beats-upload-btn" onclick="dashUploadTrigger()" title="Last opp lydfiler — eller slipp dem på siden"><span class="ic ic-upload" aria-hidden="true"></span> Last opp låt</button>
            <div class="beats-search-wrap">
              <span class="beats-search-icon"><span class="ic ic-search" aria-hidden="true"></span></span>
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
              <div class="bl-row${fresh(b) ? ' bl-fresh' : ''}" data-beat-id="${b.id}" onclick="mvTapPlay(event,'${b.id}','beat')">
                <span class="bl-num">${i + 1}</span>
                <span class="bl-cover"><span class="mv-cd bl-cd" aria-hidden="true" style="${window.mvCdStyle ? mvCdStyle(b.id) : ''}"></span>${coverHtml}</span>
                <span class="bl-name">
                  <span class="bl-title">${esc(b.name)}</span>${window.mvIsSongPublic && window.mvIsSongPublic(b.id) ? '<span class="mv-public-badge' + (window.mvBadgeAttrs ? mvBadgeAttrs(b.id) : '') + '" title="Synlig for alle med Music Vault-konto i Explore"><span class="ic ic-globe" aria-hidden="true"></span> Offentlig</span>' : ''}
                  <span class="ab-playcount${(Number(b.playCount)||0)?'':' empty'}" data-pc-id="${b.id}" title="${esc(typeof playCountTitle==='function'?playCountTitle(b):'')}"><span class="ic ic-headphones" aria-hidden="true"></span> ${Number(b.playCount)||0}</span>
                  ${b.rating ? `<span class="bl-rating">${'★'.repeat(Math.round(b.rating/2))}</span>` : ''}
                  ${fresh(b) ? `<button type="button" class="bl-write" onclick="event.stopPropagation();mvWriteLyrics('${b.id}')" aria-label="Skriv tekst til ${esc(b.name)}"><span class="ic ic-pen" aria-hidden="true"></span>Skriv tekst</button>` : ''}
                </span>
                <span class="bl-collections">${colChips}</span>
                <span class="bl-uploader">${(window.mvUploaderName?mvUploaderName(b):b.uploadedBy) ? `<span class="bl-uploader-tag"><span class="ic ic-user" aria-hidden="true"></span> ${esc((window.mvUploaderName?mvUploaderName(b):b.uploadedBy))}</span>` : '<span style="color:var(--muted)">—</span>'}</span>
                <span class="bl-date">${fmtDate(b.createdAt)}</span>
                <span class="bl-dur">${fmtDur(b.duration)}</span>
                <span class="bl-actions">
                  <button class="bl-play" onclick="event.stopPropagation();beatsTab.playBeat('${b.id}')" title="Spill" aria-label="Spill ${esc(b.name)}"><span class="ic ic-play" aria-hidden="true"></span></button>
                  <button class="bl-star${b.favorite?' active':''}" data-fav-id="${b.id}" onclick="event.stopPropagation();beatsTab.toggleFav('${b.id}')" title="${b.favorite?'Fjern favoritt':'Legg til favoritt'}" aria-label="${b.favorite?'Fjern favoritt':'Legg til favoritt'}: ${esc(b.name)}" aria-pressed="${b.favorite?'true':'false'}"><span class="ic ic-heart" aria-hidden="true"></span></button>
                  <button class="bl-menu" onclick="event.stopPropagation();beatsTab.openDropdown('${b.id}',this)" title="Mer" aria-label="Flere valg for ${esc(b.name)}" aria-haspopup="menu">⋯</button>
                </span>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
    // Lista tegnes på nytt (f.eks. når du kommer tilbake til fanen) — legg på «spilles nå» igjen,
    // ellers mister raden markeringen og CD-en slutter å snurre
    try { window.updatePlayingAnimations && window.updatePlayingAnimations(); } catch(e) {}
    requestAnimationFrame(() => { try { window.mvFresh && window.mvFresh.play(); } catch(e) {} }); // ny låt: CD glir inn når Beats vises
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
        color: var(--muted); background: rgb(var(--ink-rgb) / .06);
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
        background: rgb(var(--ink-rgb) / .07); border: 1px solid rgb(var(--ink-rgb) / .12);
        border-radius: 12px; padding: 9px 32px 9px 34px; color: var(--text);
        font-size: 13px; font-family: inherit; outline: none; width: 240px;
        transition: border-color .15s;
      }
      .beats-search:focus { border-color: var(--accent-line); background: var(--accent-soft); }
      .beats-search-clear {
        position: absolute; right: 10px; background: none; border: none;
        color: var(--muted); cursor: pointer; font-size: 12px; padding: 2px 4px;
      }

      .beats-sort {
        background: rgb(var(--ink-rgb) / .07); border: 1px solid rgb(var(--ink-rgb) / .12);
        border-radius: 12px; padding: 9px 12px; color: var(--text);
        font-size: 13px; font-family: inherit; cursor: pointer; outline: none;
      }

      .beats-list-header {
        display: grid;
        grid-template-columns: 32px 52px minmax(160px,2fr) minmax(120px,1.5fr) 110px 90px 60px 72px;
        gap: 0 10px; padding: 0 12px 8px; border-bottom: 1px solid rgb(var(--ink-rgb) / .07);
        font-size: 11px; font-weight: 800; letter-spacing: .08em;
        color: var(--muted); text-transform: uppercase;
      }

      .beats-list { display: flex; flex-direction: column; gap: 1px; }

      .bl-row {
        display: grid;
        grid-template-columns: 32px 52px minmax(160px,2fr) minmax(120px,1.5fr) 110px 90px 60px 72px;
        gap: 0 10px; align-items: center;
        padding: 5px 12px; border-radius: 10px;
        transition: background .12s; cursor: default;
      }
      .bl-row:hover { background: rgb(var(--ink-rgb) / .05); }
      .bl-row:hover .bl-play { opacity: 1; }

      .bl-num { font-size: 12px; color: var(--muted); text-align: center; }
      .bl-cover { width: 36px; }
      .bl-cover-img { width: 36px; height: 36px; border-radius: 6px; object-fit: cover; }
      .bl-cover-ph {
        width: 36px; height: 36px; border-radius: 6px;
        background: rgb(var(--accent-rgb) / .15); display: flex; align-items: center;
        justify-content: center; font-size: 14px; color: rgb(var(--accent-ink-rgb) / calc(.6 + (1 - .6) * var(--ink-boost)));
      }

      .bl-name { display: flex; align-items: center; gap: 6px; min-width: 0; }
      .bl-title {
        font-size: 13px; font-weight: 800; letter-spacing: -.01em;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      .bl-fav { color: var(--accent-ink); font-size: 12px; flex-shrink: 0; }
      .bl-rating { font-size: 10px; color: var(--accent-ink); letter-spacing: -1px; flex-shrink: 0; }

      .bl-collections { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }
      .bl-chip {
        font-size: 10px; font-weight: 800; letter-spacing: .04em;
        padding: 2px 8px; border-radius: 999px; white-space: nowrap;
        max-width: 120px; overflow: hidden; text-overflow: ellipsis;
      }
      .bl-chip.mixtape { background: rgb(var(--accent-rgb) / .15); color: var(--accent2); }
      .bl-chip.album   { background: rgb(var(--muted-rgb) / .12); color: #67e8f9; }

      .bl-uploader-tag {
        font-size: 11px; font-weight: 700; color: var(--accent-ink);
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }

      .bl-date { font-size: 11px; color: var(--muted); white-space: nowrap; }
      .bl-dur  { font-size: 12px; color: var(--muted); font-variant-numeric: tabular-nums; }

      .bl-actions { display: flex; gap: 4px; align-items: center; justify-content: flex-end; }
      .bl-play {
        background: rgb(var(--accent-rgb) / .15); border: none; border-radius: 50%;
        width: 28px; height: 28px; color: var(--accent-ink); font-size: 11px;
        cursor: pointer; display: flex; align-items: center; justify-content: center;
        opacity: 0; transition: opacity .12s, background .12s;
      }
      .bl-play:hover { background: rgb(var(--accent-rgb) / .3); }
      .bl-menu {
        background: rgb(var(--ink-rgb) / .07); border: 1px solid rgb(var(--ink-rgb) / .1);
        border-radius: 8px; width: 28px; height: 28px; color: var(--text);
        font-size: 16px; cursor: pointer; display: flex; align-items: center;
        justify-content: center; transition: background .12s;
      }
      .bl-menu:hover { background: rgb(var(--ink-rgb) / .14); }

      .beats-empty {
        text-align: center; padding: 48px 20px; color: var(--muted);
        font-size: 14px; line-height: 1.7;
      }

      /* Dropdown */
      .bt-dropdown {
        background: var(--surface-1); border: 1px solid rgb(var(--ink-rgb) / .12);
        border-radius: 12px; padding: 6px; box-shadow: 0 16px 48px rgb(var(--shadow-rgb) / calc(.6 * var(--shadow-k)));
        display: flex; flex-direction: column; gap: 2px;
      }
      .bt-dropdown button {
        background: none; border: none; color: var(--text); font-size: 13px;
        font-family: inherit; font-weight: 700; padding: 8px 12px;
        border-radius: 8px; cursor: pointer; text-align: left; width: 100%;
        transition: background .1s;
      }
      .bt-dropdown button:hover { background: rgb(var(--ink-rgb) / .08); }
      .bt-dropdown button.danger { color: var(--danger); }
      .bt-dropdown button.danger:hover { background: rgb(var(--danger-rgb) / .12); }
      /* Undermenyer («Legg til i album/mixtape», «Mer») — lukket som standard, åpnes på stedet */
      .bt-dropdown .bt-sub > summary { list-style: none; display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 700;
        padding: 8px 12px; border-radius: 8px; cursor: pointer; color: var(--text); }
      .bt-dropdown .bt-sub > summary::-webkit-details-marker { display: none; }
      .bt-dropdown .bt-sub > summary::after { content: '›'; margin-left: auto; color: var(--muted); transition: transform .15s; }
      .bt-dropdown .bt-sub[open] > summary::after { transform: rotate(90deg); }
      .bt-dropdown .bt-sub > summary:hover { background: rgb(var(--ink-rgb) / .08); }
      .bt-dropdown .bt-sub > summary:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
      .bt-dropdown .bt-sub-list { display: flex; flex-direction: column; gap: 2px; padding: 2px 0 4px 12px; max-height: 260px; overflow: auto; }

      /* Now-playing equalizer keyframes (self-contained for the injected sheet) */
      @keyframes mvEqBl {
        0%,100% { background-size: 3px 35%, 3px 70%, 3px 45%, cover; }
        20%     { background-size: 3px 70%, 3px 35%, 3px 80%, cover; }
        40%     { background-size: 3px 45%, 3px 85%, 3px 30%, cover; }
        60%     { background-size: 3px 80%, 3px 45%, 3px 65%, cover; }
        80%     { background-size: 3px 30%, 3px 75%, 3px 50%, cover; }
      }

      /* Mobile — Spotify-style rows: cover · title · play · star always visible.
         Cover is shown (was hidden), the play button is always visible (no hover
         on touch), and secondary columns are dropped. */
      @media (max-width: 768px) {
        .beats-list-header { display: none; }
        .bl-row {
          grid-template-columns: 46px minmax(0,1fr) auto;
          gap: 0 12px; padding: 7px 10px; align-items: center;
        }
        .bl-row .bl-num,
        .bl-row .bl-collections,
        .bl-row .bl-uploader,
        .bl-row .bl-date,
        .bl-row .bl-dur { display: none; }
        .bl-row .bl-cover { display: block; width: 46px; position: relative; }
        .bl-cover-img, .bl-cover-ph { width: 46px; height: 46px; border-radius: 6px; }
        .bl-title { font-size: 15px; }
        .bl-row { cursor: pointer; }          /* tap the row to play */
        .bl-actions { gap: 6px; }
        /* Synlig spillknapp: radtrykk spiller fortsatt, men nå ser du det på forhånd */
        .bl-play { display: flex; opacity: 1; width: 34px; height: 34px; font-size: 12px; }
        .bl-title { white-space: normal; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; line-height: 1.25; }
        .bl-menu { width: 34px; height: 34px; }
        .bl-star { font-size: 18px; }

        /* Now-playing: animated gold equalizer over the cover + gold title */
        .bl-row.now-playing-glow .bl-cover::after {
          content: ""; position: absolute; inset: 0;
          border-radius: 6px; pointer-events: none;
          background:
            linear-gradient(var(--accent),var(--accent)) 25% 100% / 3px 40% no-repeat,
            linear-gradient(#d68155,#d68155) 50% 100% / 3px 65% no-repeat,
            linear-gradient(#d68155,#d68155) 75% 100% / 3px 50% no-repeat,
            rgba(0,0,0,.5);
          animation: mvEqBl .9s ease-in-out infinite;
        }
        .bl-row.now-playing-glow .bl-title { color: var(--accent-ink); }
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
  window.beatsTab = { renderBeatsTab, onSearch, onSort, openDropdown, playBeat, toggleFav, swapAudio, archiveBeat, deleteBeat,
    renameBeat: (id) => window.renameBeat?.(id),
    openLyricLab(id){ closeDropdown(); if(typeof window.openInLyricLab==='function') window.openInLyricLab(id); },
    shareLink(id){ closeDropdown(); if(typeof window.shareSong==='function') window.shareSong(id); },
    togglePublic(id){ closeDropdown(); if(window.mvSetSongPublic) window.mvSetSongPublic(id, !window.mvIsSongPublic(id)); },
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

// Slipp lydfiler hvor som helst på Beats-siden for å laste dem opp
(function(){
  const tab = () => document.getElementById('beatsTab');
  const hasFiles = e => [...((e.dataTransfer && e.dataTransfer.types) || [])].includes('Files');
  let depth = 0;
  document.addEventListener('dragenter', e => { const t = tab(); if (!t || t.classList.contains('hidden') || !hasFiles(e) || !t.contains(e.target)) return; depth++; t.classList.add('is-file-over'); });
  document.addEventListener('dragleave', e => { const t = tab(); if (!t || !t.contains(e.target)) return; if (--depth <= 0){ depth = 0; t.classList.remove('is-file-over'); } });
  document.addEventListener('dragover', e => { const t = tab(); if (t && !t.classList.contains('hidden') && hasFiles(e) && t.contains(e.target)) e.preventDefault(); });
  document.addEventListener('drop', e => {
    const t = tab(); if (!t || t.classList.contains('hidden') || !hasFiles(e) || !t.contains(e.target)) return;
    e.preventDefault(); depth = 0; t.classList.remove('is-file-over');
    if (typeof window.dashUpload === 'function') window.dashUpload(e.dataTransfer.files);
  });
})();
