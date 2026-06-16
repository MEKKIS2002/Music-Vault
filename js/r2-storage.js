// === r2-storage.js ===
// Cloudflare R2 audio storage via Cloudflare Worker proxy
// Worker URL: https://beat-vault.marcus-aas-mekiassen.workers.dev
// Bucket: music-vault-audio (10GB gratis)
//
// Mappestruktur i R2:
//   active/{beat-id}   — aktive lydfiler
//   archived/{beat-id} — arkiverte lydfiler
//
// Arkivering av sang → r2Storage.move(id, true)  → active/ → archived/
// Gjenoppretting     → r2Storage.move(id, false) → archived/ → active/
// Sletting           → r2Storage.remove(id, archived)
//
// OBS: Lydkomprimering (audio-compress.js) er deaktivert —
//      MediaRecorder komprimerer i sanntid (3 min sang = 3 min komprimering).
//      Filer lastes opp direkte til R2 uansett format.

(function () {
  'use strict';

  // ── CONFIG — fill these in ──────────────────────────────────────────
  const R2_WORKER_URL = window.R2_WORKER_URL || '';
  // ────────────────────────────────────────────────────────────────────

  const ready = () => !!R2_WORKER_URL && !R2_WORKER_URL.includes('DIN_WORKER');

  // r2Key(beat, archived) → "active/beat-id.mp3" or "archived/beat-id.mp3"
  function r2Key(beatId, archived) {
    const folder = archived ? 'archived' : 'active';
    return `${folder}/${beatId}`;
  }

  // ── UPLOAD ──────────────────────────────────────────────────────────
  // Returns the public URL of the uploaded file, or throws on error.
  async function upload(beatId, file, archived = false, onProgress = null) {
    if (!ready()) throw new Error('R2 Worker URL ikke konfigurert');
    const key = r2Key(beatId, archived);
    const url = `${R2_WORKER_URL}/upload/${encodeURIComponent(key)}`;

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', url);
      xhr.setRequestHeader('Content-Type', file.type || 'audio/mpeg');
      if (onProgress) {
        xhr.upload.addEventListener('progress', e => {
          if (e.lengthComputable) onProgress(Math.round(e.loaded / e.total * 100));
        });
      }
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const res = JSON.parse(xhr.responseText);
            resolve(res.url || `${R2_WORKER_URL}/file/${encodeURIComponent(key)}`);
          } catch {
            resolve(`${R2_WORKER_URL}/file/${encodeURIComponent(key)}`);
          }
        } else {
          reject(new Error(`R2 opplasting feilet: HTTP ${xhr.status}`));
        }
      };
      xhr.onerror = () => reject(new Error('R2 opplasting: nettverksfeil'));
      xhr.send(file);
    });
  }

  // ── DELETE ──────────────────────────────────────────────────────────
  async function remove(beatId, archived = false) {
    if (!ready()) return;
    const key = r2Key(beatId, archived);
    const res = await fetch(`${R2_WORKER_URL}/delete/${encodeURIComponent(key)}`, { method: 'DELETE' });
    if (!res.ok) console.warn('R2 sletting feilet:', res.status);
  }

  // ── MOVE (archive / restore) ─────────────────────────────────────────
  // Copies from src key to dst key via Worker, then deletes src.
  async function move(beatId, toArchived) {
    if (!ready()) return null;
    const from = r2Key(beatId, !toArchived);
    const to   = r2Key(beatId,  toArchived);
    const res = await fetch(`${R2_WORKER_URL}/move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to })
    });
    if (!res.ok) { console.warn('R2 move feilet:', res.status); return null; }
    const { url } = await res.json();
    return url || `${R2_WORKER_URL}/file/${encodeURIComponent(to)}`;
  }

  // ── PUBLIC URL ───────────────────────────────────────────────────────
  function getUrl(beatId, archived = false) {
    if (!ready()) return null;
    return `${R2_WORKER_URL}/file/${encodeURIComponent(r2Key(beatId, archived))}`;
  }

  // ── EXPOSE ───────────────────────────────────────────────────────────
  window.r2Storage = { upload, remove, move, getUrl, ready };

  // ── HOOK INTO ARCHIVE/RESTORE ─────────────────────────────────────────
  // Moves file in R2 when a beat is archived or restored
  const _origToggle = window.toggleArchiveItem;
  if (typeof _origToggle === 'function') {
    window.toggleArchiveItem = async function (id, type) {
      _origToggle(id, type);
      if (type !== 'beat' && type !== undefined) return;
      const beat = (state.beats || []).find(b => b.id === id);
      if (!beat || !ready()) return;
      try {
        const newUrl = await move(id, !!beat.archived);
        if (newUrl) {
          beat.audio_url = newUrl;
          beat.r2_key = r2Key(id, !!beat.archived);
          saveState();
          if (window.supabaseClient && window.isAdminMode && typeof pushToSupabase === 'function') {
            pushToSupabase();
          }
        }
      } catch (e) {
        console.warn('R2 move feilet:', e);
      }
    };
  }

  console.log('[R2 Storage]', ready() ? 'Klar ✓' : 'Worker URL ikke konfigurert ⚠');
})();


// ── R2 STORAGE WIDGET ────────────────────────────────────────────────────────
// Viser lagringsoversikt i Integrasjoner-tabben
(function () {
  'use strict';

  const R2_MAX_GB   = 10;
  const R2_MAX_BYTES = R2_MAX_GB * 1024 * 1024 * 1024;

  function fmt(bytes) {
    if (bytes >= 1e9) return (bytes / 1e9).toFixed(2) + ' GB';
    if (bytes >= 1e6) return (bytes / 1e6).toFixed(1) + ' MB';
    if (bytes >= 1e3) return (bytes / 1e3).toFixed(0) + ' KB';
    return bytes + ' B';
  }

  function pct(used) {
    return Math.min(100, Math.round(used / R2_MAX_BYTES * 100));
  }

  function barColor(p) {
    if (p >= 90) return '#fb7185';   // rød
    if (p >= 70) return '#f97316';   // oransje
    if (p >= 50) return '#ffba5e';   // gul
    return '#34d399';                // grønn
  }

  // Henter statistikk fra Worker: GET /stats → { totalBytes, activeBytes, archivedBytes, fileCount }
  async function fetchStats() {
    const workerUrl = window.R2_WORKER_URL || '';
    if (!workerUrl) throw new Error('R2_WORKER_URL ikke konfigurert');
    const res = await fetch(`${workerUrl}/stats`, { method: 'GET' });
    if (!res.ok) throw new Error(`Worker svarte med HTTP ${res.status}`);
    return res.json();
  }

  // Estimerer størrelse fra IndexedDB + beat audio_url-felter (offline fallback)
  function estimateFromState() {
    try {
      const beats = (typeof state !== 'undefined' && state.beats) ? state.beats : [];
      // Rough: count beats that have an audio_url starting with R2 worker URL
      const workerUrl = window.R2_WORKER_URL || '';
      const r2Beats = workerUrl
        ? beats.filter(b => (b.audio_url || '').startsWith(workerUrl))
        : [];
      return {
        estimated: true,
        fileCount: r2Beats.length,
        // We can't know exact bytes without /stats — show count only
        totalBytes: null,
      };
    } catch { return { estimated: true, fileCount: 0, totalBytes: null }; }
  }

  function renderWidget(data) {
    const el = document.getElementById('r2StorageWidget');
    if (!el) return;

    if (data.error) {
      el.innerHTML = `
        <div class="r2-widget-header">
          <span class="r2-widget-icon">☁</span>
          <span class="r2-widget-title">R2 Lagring</span>
          <span class="r2-widget-status r2-status-warn">Ikke tilkoblet</span>
        </div>
        <p class="r2-widget-hint">${data.error}</p>`;
      return;
    }

    if (data.estimated) {
      el.innerHTML = `
        <div class="r2-widget-header">
          <span class="r2-widget-icon">☁</span>
          <span class="r2-widget-title">R2 Lagring</span>
          <span class="r2-widget-status r2-status-ok">Tilkoblet</span>
        </div>
        <p class="r2-widget-hint">${data.fileCount} lydfiler i R2 · Oppdater for eksakt størrelse</p>
        <button class="r2-refresh-btn ghost-btn" onclick="window.r2StorageWidget.refresh()">↻ Hent statistikk</button>`;
      return;
    }

    const usedPct  = pct(data.totalBytes || 0);
    const color    = barColor(usedPct);
    const activePct   = pct(data.activeBytes   || 0);
    const archivePct  = pct(data.archivedBytes  || 0);

    el.innerHTML = `
      <div class="r2-widget-header">
        <span class="r2-widget-icon">☁</span>
        <span class="r2-widget-title">R2 Lagring</span>
        <span class="r2-widget-status r2-status-ok">Tilkoblet</span>
        <button class="r2-refresh-btn ghost-btn" onclick="window.r2StorageWidget.refresh()" title="Oppdater">↻</button>
      </div>

      <div class="r2-bar-wrap">
        <div class="r2-bar-bg">
          <div class="r2-bar-fill r2-bar-active"  style="width:${activePct}%;background:#34d399"></div>
          <div class="r2-bar-fill r2-bar-archive" style="width:${archivePct}%;background:#a855f7;margin-left:${activePct}%"></div>
        </div>
        <div class="r2-bar-label">
          <span style="color:${color};font-weight:900;font-size:18px">${fmt(data.totalBytes)}</span>
          <span class="r2-bar-max"> / ${R2_MAX_GB} GB gratis</span>
        </div>
      </div>

      <div class="r2-bar-pct" style="color:${color}">${usedPct}% brukt</div>

      <div class="r2-legend">
        <span class="r2-dot" style="background:#34d399"></span>
        <span>Aktive: ${fmt(data.activeBytes || 0)}</span>
        <span class="r2-dot" style="background:#a855f7;margin-left:12px"></span>
        <span>Arkivert: ${fmt(data.archivedBytes || 0)}</span>
        <span style="margin-left:auto;color:var(--muted)">${data.fileCount || 0} filer</span>
      </div>`;
  }

  async function refresh() {
    const el = document.getElementById('r2StorageWidget');
    if (el) el.innerHTML = `<div class="r2-widget-header"><span class="r2-widget-icon">☁</span><span class="r2-widget-title">R2 Lagring</span><span class="r2-widget-status" style="opacity:.5">Laster...</span></div>`;
    try {
      const data = await fetchStats();
      renderWidget(data);
    } catch (e) {
      const fallback = estimateFromState();
      if (fallback.fileCount > 0) {
        renderWidget(fallback);
      } else {
        renderWidget({ error: window.R2_WORKER_URL ? `Kunne ikke hente statistikk: ${e.message}` : 'Sett R2_WORKER_URL i index.html for å aktivere' });
      }
    }
  }

  function installWidget() {
    if (document.getElementById('r2StorageWidget')) return;

    // Find insertion point: after Supabase panel or inside integrations tab
    const parent =
      document.getElementById('supabaseAdminPanel')?.parentElement ||
      document.querySelector('#integrationsTab .content-panel') ||
      document.querySelector('#integrationsTab');
    if (!parent) return;

    const card = document.createElement('div');
    card.className = 'settings-card r2-storage-card';
    card.id = 'r2StorageWidget';
    card.innerHTML = `<div class="r2-widget-header"><span class="r2-widget-icon">☁</span><span class="r2-widget-title">R2 Lagring</span></div>`;

    // Insert before Supabase sync panel if it exists, else append
    const syncPanel = document.getElementById('supabaseDataSyncPanel');
    if (syncPanel) {
      parent.insertBefore(card, syncPanel);
    } else {
      parent.appendChild(card);
    }

    refresh();
  }

  // CSS for the widget
  const style = document.createElement('style');
  style.textContent = `
    .r2-storage-card {
      padding: 20px 22px !important;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    .r2-widget-header {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
    }
    .r2-widget-icon {
      font-size: 20px;
      line-height: 1;
    }
    .r2-widget-title {
      font-weight: 900;
      font-size: 15px;
      letter-spacing: -.02em;
      color: #f4ede4;
      flex: 1;
    }
    .r2-widget-status {
      font-size: 11px;
      font-weight: 800;
      letter-spacing: .08em;
      padding: 3px 10px;
      border-radius: 999px;
    }
    .r2-status-ok   { background: rgba(52,211,153,.15); color: #34d399; }
    .r2-status-warn { background: rgba(251,113,133,.12); color: #fb7185; }
    .r2-refresh-btn {
      font-size: 14px !important;
      padding: 4px 10px !important;
      margin-left: auto;
      cursor: pointer;
    }
    .r2-bar-wrap {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .r2-bar-bg {
      position: relative;
      height: 10px;
      border-radius: 999px;
      background: rgba(255,255,255,.08);
      overflow: hidden;
    }
    .r2-bar-fill {
      position: absolute;
      top: 0;
      height: 100%;
      border-radius: 999px;
      transition: width .5s ease;
    }
    .r2-bar-label {
      display: flex;
      align-items: baseline;
      gap: 4px;
    }
    .r2-bar-max {
      font-size: 13px;
      color: var(--muted, #888);
    }
    .r2-bar-pct {
      font-size: 12px;
      font-weight: 800;
      letter-spacing: .06em;
      opacity: .8;
    }
    .r2-legend {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      color: var(--muted, #aaa);
      flex-wrap: wrap;
    }
    .r2-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      display: inline-block;
    }
    .r2-widget-hint {
      font-size: 12px;
      color: var(--muted, #aaa);
      margin: 0;
    }
  `;
  document.head.appendChild(style);

  window.r2StorageWidget = { refresh, install: installWidget };

  // Install when integrations tab becomes visible
  document.addEventListener('click', e => {
    const btn = e.target?.closest?.('.tab-btn[data-tab="integrations"]');
    if (btn) setTimeout(installWidget, 80);
  });

  // Also try on DOMContentLoaded
  if (document.readyState !== 'loading') {
    setTimeout(installWidget, 500);
  } else {
    document.addEventListener('DOMContentLoaded', () => setTimeout(installWidget, 500));
  }
})();
