// === pipeline.js ===
// Pipeline overhaul: Kanban, next step, drag priority, Lyric Lab link,
// quick-update slider, weekly progress, streak, album notes.

(function () {
  'use strict';

  // ── Constants ───────────────────────────────────────────────────────────────
  const STAGES = [
    { id: 'todo',       label: 'Ikke startet', color: 'rgba(255,255,255,.12)' },
    { id: 'inprogress', label: 'I arbeid',     color: 'rgba(249,115,22,.18)'  },
    { id: 'done',       label: 'Ferdig',       color: 'rgba(52,211,153,.18)'  },
  ];

  // ── Helpers ─────────────────────────────────────────────────────────────────
  function st()       { return typeof state !== 'undefined' ? state : window.state; }
  function save()     { if (typeof saveState === 'function') saveState(); }
  function esc(s)     { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function clamp(n)   { return Math.max(0, Math.min(100, Number(n)||0)); }
  function activeBeats(album) {
    return (album.beatIds||[]).map(id=>(st().beats||[]).find(b=>b.id===id)).filter(b=>b&&!b.archived);
  }
  function beatStage(b) {
    const pct = clamp(b.done||0);
    if (pct >= 100) return 'done';
    if (pct > 0 || (b.audio_url||b.url) || (b.lyricSections||[]).some(s=>s.text?.trim())) return 'inprogress';
    return 'todo';
  }
  function nextStep(b) {
    const steps = [];
    if (!b.audio_url && !b.url) steps.push('Last opp lydfil');
    const hasLyrics = (b.lyricSections||[]).some(s=>s.text?.trim()) || (b.lyrics||'').trim();
    if (!hasLyrics) steps.push('Skriv tekst');
    const allDone = (b.lyricSections||[]).length > 0 && (b.lyricSections||[]).every(s=>s.done);
    if (hasLyrics && !allDone && (b.lyricSections||[]).length > 0) steps.push('Ferdigstill seksjoner');
    if (clamp(b.done||0) < 100) steps.push('Sett til 100%');
    return steps[0] || null;
  }

  // ── Streak ─────────────────────────────────────────────────────────────────
  function updateStreak() {
    const key    = 'mv_pipeline_streak';
    const today  = new Date().toDateString();
    const stored = JSON.parse(localStorage.getItem(key) || '{"last":"","count":0}');
    const yesterday = new Date(Date.now()-86400000).toDateString();
    if (stored.last === today) return stored.count;
    if (stored.last === yesterday) { stored.count++; }
    else if (stored.last !== today) { stored.count = 1; }
    stored.last = today;
    localStorage.setItem(key, JSON.stringify(stored));
    return stored.count;
  }

  // ── Weekly progress ────────────────────────────────────────────────────────
  function weeklyProgress() {
    const key = 'mv_pipeline_weekly';
    const weekStart = getWeekStart();
    const stored = JSON.parse(localStorage.getItem(key) || '{}');
    if (!stored.week || stored.week !== weekStart) {
      // New week — snapshot current state
      const total = (st().beats||[]).filter(b=>!b.archived).reduce((s,b)=>s+clamp(b.done||0),0);
      const count = (st().beats||[]).filter(b=>!b.archived).length;
      stored.week = weekStart; stored.startAvg = count ? Math.round(total/count) : 0;
      stored.history = stored.history || [];
      localStorage.setItem(key, JSON.stringify(stored));
    }
    const beats   = (st().beats||[]).filter(b=>!b.archived);
    const curAvg  = beats.length ? Math.round(beats.reduce((s,b)=>s+clamp(b.done||0),0)/beats.length) : 0;
    const diff    = curAvg - (stored.startAvg||0);
    return { curAvg, diff, startAvg: stored.startAvg||0 };
  }
  function getWeekStart() {
    const d = new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate()-d.getDay());
    return d.toISOString().slice(0,10);
  }

  // ── Drag state ─────────────────────────────────────────────────────────────
  let _dragBeatId = null, _dragAlbumId = null;

  // ── Main render ─────────────────────────────────────────────────────────────
  function renderPipelineV2() {
    const board = document.getElementById('pipelineBoard');
    if (!board) return;

    const albums = (st().albums||[]).filter(a=>!a.archived);
    if (!albums.length) {
      board.innerHTML = '<div class="empty">Ingen albumer ennå.</div>';
      return;
    }

    const streak = updateStreak();
    const weekly = weeklyProgress();

    board.innerHTML = `
      <div class="pl-header">
        <div class="pl-stats-row">
          <div class="pl-stat-pill ${weekly.diff > 0 ? 'up' : weekly.diff < 0 ? 'down' : ''}">
            📈 Denne uka: ${weekly.diff > 0 ? '+' : ''}${weekly.diff}% snitt
          </div>
          <div class="pl-stat-pill">
            🔥 Streak: ${streak} dag${streak !== 1 ? 'er' : ''}
          </div>
          <div class="pl-stat-pill">
            📊 Snitt totalt: ${weekly.curAvg}%
          </div>
        </div>
      </div>

      ${albums.map(album => renderAlbumKanban(album)).join('')}
    `;

    // Wire up drag events
    board.querySelectorAll('.pl-beat-card').forEach(el => {
      el.addEventListener('dragstart', e => {
        _dragBeatId  = el.dataset.beatId;
        _dragAlbumId = el.dataset.albumId;
        el.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
      });
      el.addEventListener('dragend', () => el.classList.remove('dragging'));
    });
    board.querySelectorAll('.pl-column').forEach(col => {
      col.addEventListener('dragover', e => { e.preventDefault(); col.classList.add('drag-over'); });
      col.addEventListener('dragleave', () => col.classList.remove('drag-over'));
      col.addEventListener('drop', e => {
        e.preventDefault();
        col.classList.remove('drag-over');
        if (!_dragBeatId) return;
        const beat = (st().beats||[]).find(b=>b.id===_dragBeatId);
        if (!beat) return;
        const stage = col.dataset.stage;
        if (stage === 'done')       beat.done = 100;
        else if (stage === 'inprogress') { if (!beat.done || beat.done === 0) beat.done = 10; if(beat.done >= 100) beat.done = 50; }
        else                        beat.done = 0;
        save();
        renderPipelineV2();
      });
    });

    // Drag reorder within album (priority)
    board.querySelectorAll('.pl-beat-list').forEach(list => {
      list.addEventListener('dragover', e => {
        e.preventDefault();
        const dragging = list.querySelector('.dragging');
        const siblings = [...list.querySelectorAll('.pl-beat-card:not(.dragging)')];
        const after = siblings.find(el => {
          const box = el.getBoundingClientRect();
          return e.clientY < box.top + box.height / 2;
        });
        if (after) list.insertBefore(dragging || document.createElement('div'), after);
        else list.appendChild(dragging || document.createElement('div'));
      });
      list.addEventListener('drop', () => {
        const albumId = list.dataset.albumId;
        const album   = (st().albums||[]).find(a=>a.id===albumId);
        if (!album) return;
        const order = [...list.querySelectorAll('.pl-beat-card')].map(el=>el.dataset.beatId);
        // Reorder album.beatIds to match drag order
        album.beatIds = order.filter(id=>album.beatIds.includes(id));
        save();
      });
    });
  }

  function renderAlbumKanban(album) {
    const beats = activeBeats(album);
    const avg   = beats.length ? Math.round(beats.reduce((s,b)=>s+clamp(b.done||0),0)/beats.length) : 0;
    const col   = avg >= 70 ? '#34d399' : avg >= 40 ? '#f97316' : '#fb7185';
    const stageBuckets = { todo: [], inprogress: [], done: [] };
    beats.forEach(b => stageBuckets[beatStage(b)].push(b));

    const statusOptions = ['Idé','Skriving','Innspilling','Mixing','Masterering','Ferdig'];
    const currentStatus = album.status || 'Idé';

    return `
    <div class="pl-album" id="plalbum-${esc(album.id)}">
      <div class="pl-album-head">
        ${album.cover ? `<img class="pl-album-cover" src="${esc(album.cover)}" alt="">` : '<div class="pl-album-cover pl-album-cover-ph">🎵</div>'}
        <div class="pl-album-info">
          <div class="pl-album-name">${esc(album.name)}</div>
          <div class="pl-album-meta">
            <select class="pl-status-select" onchange="plSetAlbumStatus('${esc(album.id)}',this.value)">
              ${statusOptions.map(s=>`<option value="${s}"${s===currentStatus?' selected':''}>${s}</option>`).join('')}
            </select>
            <span style="color:${col};font-weight:900;font-size:13px">${avg}%</span>
            <span style="font-size:11px;color:rgba(255,255,255,.3)">${beats.length} sang${beats.length!==1?'er':''}</span>
          </div>
          <div class="pl-progress-bar"><div style="width:${avg}%;background:${col};transition:width .3s"></div></div>
        </div>
        <button class="pl-notes-btn" onclick="plToggleNotes('${esc(album.id)}')" title="Notater">📝</button>
      </div>

      <div class="pl-notes-box" id="plnotes-${esc(album.id)}" style="display:${album.pipelineNotes ? 'flex' : 'none'}">
        <textarea class="pl-notes-ta" placeholder="Produksjonsnotater for dette albumet..."
          oninput="plSaveNotes('${esc(album.id)}',this.value)"
        >${esc(album.pipelineNotes||'')}</textarea>
      </div>

      <div class="pl-kanban">
        ${STAGES.map(stage => `
          <div class="pl-column" data-stage="${stage.id}" style="background:${stage.color}">
            <div class="pl-column-head">
              <span>${stage.label}</span>
              <span class="pl-col-count">${stageBuckets[stage.id].length}</span>
            </div>
            <div class="pl-beat-list" data-album-id="${esc(album.id)}">
              ${stageBuckets[stage.id].map(b => renderBeatCard(b, album.id)).join('')}
            </div>
          </div>
        `).join('')}
      </div>
    </div>`;
  }

  function renderBeatCard(b, albumId) {
    const pct   = clamp(b.done||0);
    const col   = pct >= 70 ? '#34d399' : pct >= 40 ? '#f97316' : '#fb7185';
    const next  = nextStep(b);
    const hasAudio = !!(b.audio_url || b.url);
    const hasLyrics = (b.lyricSections||[]).some(s=>s.text?.trim()) || !!(b.lyrics||'').trim();

    return `
    <div class="pl-beat-card" draggable="true" data-beat-id="${esc(b.id)}" data-album-id="${esc(albumId)}">
      <div class="pl-beat-top">
        ${b.cover ? `<img class="pl-beat-thumb" src="${esc(b.cover)}" alt="">` : '<div class="pl-beat-thumb pl-beat-ph">🎵</div>'}
        <div class="pl-beat-info">
          <div class="pl-beat-name">${esc(b.name)}</div>
          <div class="pl-beat-tags">
            ${hasAudio ? '<span class="pl-tag green">Lyd ✓</span>' : '<span class="pl-tag red">Ingen lyd</span>'}
            ${hasLyrics ? '<span class="pl-tag green">Tekst ✓</span>' : '<span class="pl-tag muted">Ingen tekst</span>'}
          </div>
        </div>
        <div class="pl-beat-actions">
          <button onclick="event.stopPropagation();if(typeof openInLyricLab==='function')openInLyricLab('${esc(b.id)}')" class="pl-action-btn" title="Åpne i Lyric Lab">✍️</button>
          <span style="font-size:11px;font-weight:800;color:${col}">${pct}%</span>
        </div>
      </div>
      ${next ? `<div class="pl-next-step">→ ${esc(next)}</div>` : ''}
      <div class="pl-beat-slider-wrap">
        <input type="range" min="0" max="100" value="${pct}" class="pl-slider"
          style="accent-color:${col}"
          oninput="plUpdateBeat('${esc(b.id)}',this.value,this)"
          onchange="plSaveBeat('${esc(b.id)}',this.value)">
      </div>
    </div>`;
  }

  // ── Actions ─────────────────────────────────────────────────────────────────
  window.plSetAlbumStatus = function(albumId, status) {
    const album = (st().albums||[]).find(a=>a.id===albumId);
    if (album) { album.status = status; save(); }
  };

  window.plToggleNotes = function(albumId) {
    const box = document.getElementById('plnotes-' + albumId);
    if (!box) return;
    box.style.display = box.style.display === 'none' ? 'flex' : 'none';
    if (box.style.display === 'flex') box.querySelector('textarea')?.focus();
  };

  window.plSaveNotes = function(albumId, text) {
    const album = (st().albums||[]).find(a=>a.id===albumId);
    if (album) { album.pipelineNotes = text; save(); }
  };

  window.plUpdateBeat = function(beatId, val, slider) {
    // Live update: just update the color
    const pct = clamp(Number(val));
    const col = pct >= 70 ? '#34d399' : pct >= 40 ? '#f97316' : '#fb7185';
    slider.style.accentColor = col;
    const card = slider.closest('.pl-beat-card');
    if (card) {
      const pctEl = card.querySelector('.pl-beat-actions span');
      if (pctEl) { pctEl.textContent = pct + '%'; pctEl.style.color = col; }
    }
  };

  window.plSaveBeat = function(beatId, val) {
    const beat = (st().beats||[]).find(b=>b.id===beatId);
    if (!beat) return;
    beat.done = clamp(Number(val));
    save();
    // Re-render to potentially move card to different column
    setTimeout(renderPipelineV2, 100);
  };

  // ── Register with renderActiveTab ─────────────────────────────────────────
  window.renderPipelineV2 = renderPipelineV2;

  // Patch the existing renderPipeline to use our version
  window.renderPipeline = renderPipelineV2;

  // Override db.js's renderPipeline immediately
  window.renderPipeline    = renderPipelineV2;
  window.renderPipelineV2  = renderPipelineV2;

  // Boot if pipeline tab is already active
  if (!document.getElementById('pipelineTab')?.classList.contains('hidden')) {
    setTimeout(renderPipelineV2, 0);
  }

})();
