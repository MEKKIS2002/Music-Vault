// ════════════════════════════════════════════════════════════════════════════
// notifications.js — varselklokka i headeren (🔔), panelet og telleren.
//
// Flyttet hit fra app.js, der koden lå ETTER punktet der app.js krasjer ved
// oppstart («state is not defined») — SB_URL/SB_KEY ble aldri satt, og
// deleteNotif/markAllNotifsRead fantes ikke. Varslene ble derfor aldri hentet.
//
// Last etter db.js og FØR label.js (label.js lapper window.openNotifPanel).
// Funksjonene er globale fordi lock.js kaller installNotificationBell() etter
// innlogging, og label.js kaller loadNotifications()/openNotifPanel().
// Tabell: public.notifications (RLS: mottaker kan lese/oppdatere/slette egne).
// ════════════════════════════════════════════════════════════════════════════
(function(){
  'use strict';
  const SB_URL = 'https://ylvqkfdvijqnecuqznyr.supabase.co';
  const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlsdnFrZmR2aWpxbmVjdXF6bnlyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgzMzA4MzIsImV4cCI6MjA5MzkwNjgzMn0.bYPTaxQK8n7I7w5Ri2DVYW5_LbFHg2IXkuhHsLTDDqc';
  const POLL_MS = 60000;

  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  async function headers(){
    let token = SB_KEY;
    try { const { data:{ session } } = await window.supabaseClient.auth.getSession(); if (session?.access_token) token = session.access_token; } catch(e) {}
    return { 'apikey':SB_KEY, 'Authorization':'Bearer '+token, 'Content-Type':'application/json' };
  }
  function uid(){ return window._mvCurrentUserId || sessionStorage.getItem('mv_user_id') || null; }

  const TYPE_LABELS = {
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

  function setCount(unread){
    const el = document.getElementById('mvNotifCount');
    if (el){ el.textContent = unread > 9 ? '9+' : String(unread); el.style.display = unread > 0 ? 'block' : 'none'; }
    const bell = document.getElementById('mvNotifBell');
    if (bell) bell.setAttribute('aria-label', unread > 0 ? `Varsler, ${unread} uleste` : 'Varsler');
  }

  async function loadNotifications(){
    const id = uid(); if (!id) return;
    try {
      const res = await fetch(`${SB_URL}/rest/v1/notifications?recipient_id=eq.${encodeURIComponent(id)}&order=created_at.desc&limit=20`, { headers: await headers() });
      if (!res.ok) return;
      const notifs = await res.json();
      window._mvNotifications = notifs;
      setCount(notifs.filter(n => !n.read).length);
    } catch(e) {}
  }

  function installNotificationBell(){
    if (document.getElementById('mvNotifBell')) return;
    const bell = document.createElement('button');
    bell.id = 'mvNotifBell';
    bell.type = 'button';
    bell.className = 'mv-hdr-icon-btn';
    bell.title = 'Varsler';
    bell.setAttribute('aria-label', 'Varsler');
    bell.setAttribute('aria-haspopup', 'dialog');
    bell.style.cssText = 'position:relative;font-size:16px;';
    bell.innerHTML = `🔔<span id="mvNotifCount" aria-hidden="true" style="display:none;position:absolute;top:3px;right:3px;background:#fb7185;color:#fff;font-size:9px;font-weight:900;border-radius:999px;padding:1px 4px;font-family:system-ui;min-width:14px;text-align:center;line-height:1.4;pointer-events:none"></span>`;
    bell.onclick = (e) => { e.stopPropagation(); window.openNotifPanel(); };   // via window: label.js lapper den

    const slot = document.getElementById('mvNotifBellSlot');
    if (slot) slot.appendChild(bell);
    else { bell.style.cssText += ';position:fixed;top:12px;right:60px;z-index:8050;'; document.body.appendChild(bell); }
    loadNotifications();
  }

  function openNotifPanel(){
    let panel = document.getElementById('mvNotifPanel');
    if (!panel){
      panel = document.createElement('div');
      panel.id = 'mvNotifPanel';
      panel.setAttribute('role', 'dialog');
      panel.setAttribute('aria-label', 'Varsler');
      // Under headeren, høyrejustert; på smale skjermer hele bredden minus kant.
      panel.style.cssText = `position:fixed;top:56px;right:12px;z-index:8200;width:min(340px,calc(100vw - 24px));
        max-height:min(440px,70vh);overflow-y:auto;background:#15120e;border:1px solid rgba(255,255,255,.13);
        border-radius:12px;box-shadow:0 16px 48px rgba(0,0,0,.6);font-family:system-ui;`;
      document.body.appendChild(panel);
      document.addEventListener('click', e => {
        if (panel.style.display !== 'none' && !panel.contains(e.target) && !e.target.closest('#mvNotifBell')) panel.style.display = 'none';
      });
      document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && panel.style.display !== 'none'){ panel.style.display = 'none'; document.getElementById('mvNotifBell')?.focus(); }
      });
    }
    const notifs = window._mvNotifications || [];
    panel.innerHTML = `
      <div style="padding:14px 16px;border-bottom:1px solid rgba(255,255,255,.08);display:flex;align-items:center;justify-content:space-between">
        <span style="font-size:13px;font-weight:800;color:#f4ede4">Varsler</span>
        ${notifs.some(n => !n.read) ? `<button type="button" onclick="window.markAllNotifsRead()" style="background:none;border:none;color:rgba(244,237,228,.6);font-size:11px;cursor:pointer;font-family:system-ui">Merk alle som lest</button>` : ''}
      </div>
      ${notifs.length ? notifs.map(n => `
        <div style="padding:12px 16px;border-bottom:1px solid rgba(255,255,255,.06);background:${n.read ? 'transparent' : 'rgba(244,164,67,.06)'}">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px">
            <div style="flex:1;min-width:0">
              <div style="font-size:12px;font-weight:700;color:${n.read ? 'rgba(244,237,228,.6)' : '#f4ede4'}">${esc(TYPE_LABELS[n.type] || n.type)}</div>
              <div style="font-size:13px;color:#f4a443;font-weight:800;margin:3px 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(n.content_name || n.content_id)}</div>
              <div style="font-size:11px;color:rgba(244,237,228,.6);margin-bottom:${n.type === 'label_invite' ? '8px' : '0'}">${n.type === 'label_invite' ? 'Label-invitasjon' : n.role === 'editor' ? 'Redaktørtilgang' : 'Visningsmodus'} · ${esc(new Date(n.created_at).toLocaleDateString('nb-NO'))}</div>
              ${n.type === 'label_invite' ? `<div style="display:flex;gap:8px">
                <button type="button" onclick="window.labelRespondInvite('${esc(n.content_id)}','${esc(n.id)}',true)" style="background:rgba(52,211,153,.15);border:1px solid rgba(52,211,153,.3);color:#34d399;font-size:11px;font-weight:800;padding:5px 14px;cursor:pointer;font-family:system-ui">✓ Aksepter</button>
                <button type="button" onclick="window.labelRespondInvite('${esc(n.content_id)}','${esc(n.id)}',false)" style="background:rgba(251,113,133,.1);border:1px solid rgba(251,113,133,.3);color:#fb7185;font-size:11px;font-weight:800;padding:5px 14px;cursor:pointer;font-family:system-ui">✕ Avslå</button>
              </div>` : ''}
            </div>
            <button type="button" onclick="window.deleteNotif('${esc(n.id)}')" title="Slett varsel" aria-label="Slett varsel: ${esc(TYPE_LABELS[n.type] || n.type)} ${esc(n.content_name || '')}" style="background:none;border:none;color:rgba(244,237,228,.45);cursor:pointer;font-size:14px;padding:2px 4px;flex-shrink:0;line-height:1">✕</button>
          </div>
        </div>`).join('') : `<div style="padding:24px 16px;text-align:center;color:rgba(244,237,228,.6);font-size:13px">Ingen varsler</div>`}`;
    panel.style.display = 'block';
    // Åpning = sett. Ubesvarte labelinvitasjoner holdes som uleste til de er besvart.
    if (!notifs.some(n => n.type === 'label_invite' && !n.read)) window.markAllNotifsRead();
  }

  async function deleteNotif(notifId){
    const id = uid(); if (!id) return;
    try {
      await fetch(`${SB_URL}/rest/v1/notifications?id=eq.${encodeURIComponent(notifId)}&recipient_id=eq.${encodeURIComponent(id)}`,
        { method:'DELETE', headers:{ ...(await headers()), 'Prefer':'return=minimal' } });
      if (window._mvNotifications) window._mvNotifications = window._mvNotifications.filter(n => String(n.id) !== String(notifId));
      window.openNotifPanel();
      loadNotifications();
    } catch(e) {}
  }

  async function markAllNotifsRead(){
    const id = uid(); if (!id) return;
    if (!(window._mvNotifications || []).some(n => !n.read)) return;   // ingenting å oppdatere
    try {
      await fetch(`${SB_URL}/rest/v1/notifications?recipient_id=eq.${encodeURIComponent(id)}&read=eq.false`,
        { method:'PATCH', headers:{ ...(await headers()), 'Prefer':'return=minimal' }, body: JSON.stringify({ read:true }) });
      (window._mvNotifications || []).forEach(n => { n.read = true; });
      setCount(0);
    } catch(e) {}
  }

  window.installNotificationBell = installNotificationBell;
  window.loadNotifications = loadNotifications;
  window.openNotifPanel = openNotifPanel;
  window.deleteNotif = deleteNotif;
  window.markAllNotifsRead = markAllNotifsRead;

  // Oppdater mens fanen er synlig, og med en gang når den blir synlig igjen.
  setInterval(() => { if (!document.hidden && document.getElementById('mvNotifBell')) loadNotifications(); }, POLL_MS);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && document.getElementById('mvNotifBell')) loadNotifications(); });
  // lock.js installerer klokka etter innlogging; dette dekker en allerede åpen økt.
  setTimeout(() => { if (sessionStorage.getItem('mv_unlocked') === '1') installNotificationBell(); }, 1500);
})();
