// ════════════════════════════════════════════════════════════════════════════
// share-song.js — public share links for a SINGLE song/beat.
//
// Mirrors the pitch flow, but for one track. A "Del"-knapp generates an
// unguessable token, snapshots the track's public fields into Supabase
// (song_shares), and produces an external URL (share.html?s=<token>) that
// ANYONE can open without logging in — it only exposes that one track.
//
// Owner can disable/delete a link (DB: enabled=false / row removed) → the
// public page stops working. Admin panel lists/manages all active links.
//
// DB: table public.song_shares + RPC public.get_song_share(p_token) — see sql/song_shares.sql
// ════════════════════════════════════════════════════════════════════════════
(function(){
  'use strict';

  const SB_URL = 'https://ylvqkfdvijqnecuqznyr.supabase.co';
  const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlsdnFrZmR2aWpxbmVjdXF6bnlyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgzMzA4MzIsImV4cCI6MjA5MzkwNjgzMn0.bYPTaxQK8n7I7w5Ri2DVYW5_LbFHg2IXkuhHsLTDDqc';

  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function toast(m){ if(typeof window.showToast==='function') window.showToast(m); else console.log(m); }
  function getState(){ return typeof state!=='undefined'?state:window.state; }

  // Auth: prefer the logged-in session token + uid (needed for RLS insert/select).
  async function getAuth(){
    let token=SB_KEY, uid=window._mvCurrentUserId||sessionStorage.getItem('mv_user_id')||null;
    try{
      const {data:{session}}=await window.supabaseClient.auth.getSession();
      if(session?.access_token) token=session.access_token;
      if(session?.user?.id){ uid=session.user.id; window._mvCurrentUserId=uid; sessionStorage.setItem('mv_user_id',uid); }
    }catch(e){}
    return {token, uid};
  }
  function hdrs(token){ return {'apikey':SB_KEY,'Authorization':'Bearer '+(token||SB_KEY),'Content-Type':'application/json'}; }

  // Unguessable token: 24 chars of crypto-random base62 (~142 bits).
  function newToken(){
    const A='abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const buf=new Uint8Array(24); (window.crypto||window.msCrypto).getRandomValues(buf);
    let out=''; for(let i=0;i<buf.length;i++) out+=A[buf[i]%A.length];
    return out;
  }

  function publicAudioUrl(b){ const u=b&&(b.audio_url||b.url||''); return /^https?:\/\//i.test(u)?u:''; }
  function isSong(b){ return !!(b&&(String(b.lyrics||'').trim() || (b.lyricSections||[]).some(s=>String(s&&s.text||'').trim()))); }
  function artistOf(b){
    const st=getState();
    return b.artist || b.producer || b.uploadedBy
      || st?.settings?.artistName || sessionStorage.getItem('mv_username') || '';
  }
  function shareUrlFor(token){ return new URL('share.html?s='+encodeURIComponent(token), location.href).href; }

  function snapshot(b, kind){
    return {
      kind, title: b.name||'Uten tittel', cover: b.cover||'',
      artist: artistOf(b), producer: b.source||b.producer||'',
      audio_url: publicAudioUrl(b), bpm: b.bpm||null, key: b.key||'',
      duration: b.duration||0, beatId: b.id, sharedAt: Date.now()
    };
  }

  // Create-or-refresh a share link for a beat. Returns {token,url} or null.
  async function upsertShare(b, kind){
    const {token:authToken, uid} = await getAuth();
    if(!uid){ toast('Logg inn for å lage delingslenke'); return null; }
    const token = b.shareToken || newToken();
    const row = { id:token, owner_id:uid, beat_id:b.id, kind, data:snapshot(b,kind), enabled:true };
    const res = await fetch(`${SB_URL}/rest/v1/song_shares`, {
      method:'POST',
      headers:{...hdrs(authToken),'Prefer':'resolution=merge-duplicates,return=minimal'},
      body: JSON.stringify(row)
    });
    if(!res.ok){ const t=await res.text().catch(()=> ''); toast('Kunne ikke dele: '+(t||res.status)); return null; }
    b.shareToken=token; b.shareEnabled=true;
    if(typeof saveState==='function') saveState();
    return { token, url: shareUrlFor(token) };
  }

  // ── Public API: open the share modal for a song/beat ──────────────────────
  window.shareSong = async function(beatId, kind){
    const st=getState();
    const b=st?.beats?.find(x=>x.id===beatId);
    if(!b){ toast('Fant ikke sangen'); return; }
    if(!publicAudioUrl(b)){
      toast('⚠ Last opp/publiser lydfilen først — offentlig deling krever en publisert lydfil.');
      return;
    }
    const k = kind || (isSong(b)?'song':'beat');
    showModal(b, null, 'Lager delingslenke…');
    const r = await upsertShare(b, k);
    if(!r){ closeModal(); return; }
    showModal(b, r.url, '');
  };

  // ── Modal ─────────────────────────────────────────────────────────────────
  function closeModal(){ const m=document.getElementById('_mvSongShare'); if(m) m.style.display='none'; }
  function showModal(b, url, statusMsg){
    let modal=document.getElementById('_mvSongShare');
    if(!modal){
      modal=document.createElement('div'); modal.id='_mvSongShare';
      modal.addEventListener('click',e=>{ if(e.target===modal) modal.style.display='none'; });
      document.body.appendChild(modal);
    }
    modal.style.cssText='position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.82);display:flex;align-items:center;justify-content:center;backdrop-filter:blur(5px)';
    const kindLabel = isSong(b)?'sang':'beat';
    const linkBlock = url ? `
      <p style="font-size:12px;color:rgba(255,255,255,.45);margin:0 0 10px">Offentlig lenke — alle med denne kan høre kun denne ${kindLabel}en:</p>
      <div style="display:flex;gap:8px;margin-bottom:14px">
        <input id="_mvSS_url" readonly value="${esc(url)}"
          style="flex:1;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);color:#f4ede4;padding:9px 12px;font-size:12px;font-family:system-ui;outline:none;border-radius:8px">
        <button onclick="navigator.clipboard.writeText(document.getElementById('_mvSS_url').value).then(()=>{this.textContent='✓';setTimeout(()=>this.textContent='Kopier',1800)})"
          style="background:#f4a443;border:none;color:#000;font-size:12px;font-weight:800;padding:9px 16px;cursor:pointer;border-radius:8px;font-family:inherit;white-space:nowrap">Kopier</button>
      </div>
      <div style="display:flex;gap:8px">
        <a href="${esc(url)}" target="_blank" rel="noopener"
          style="flex:1;text-align:center;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);color:#f4ede4;padding:9px 12px;font-size:12px;font-weight:700;cursor:pointer;border-radius:8px;text-decoration:none">Åpne forhåndsvisning ↗</a>
        <button onclick="window._mvDisableShare('${esc(b.shareToken||'')}')"
          style="background:rgba(251,113,133,.12);border:1px solid rgba(251,113,133,.3);color:#fb7185;font-size:12px;font-weight:800;padding:9px 16px;cursor:pointer;border-radius:8px;font-family:inherit;white-space:nowrap">Deaktiver lenke</button>
      </div>` : `
      <p style="font-size:13px;color:rgba(255,255,255,.5);margin:18px 0;text-align:center">${esc(statusMsg||'…')}</p>`;
    modal.innerHTML=`
      <div style="background:#1c1a17;border:1px solid rgba(255,255,255,.12);max-width:480px;width:94%;padding:26px 28px;border-radius:14px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
          <h2 style="font-size:16px;font-weight:900;margin:0;color:#f4ede4">🔗 Del ${esc(kindLabel)}</h2>
          <button onclick="document.getElementById('_mvSongShare').style.display='none'" style="background:none;border:none;color:rgba(255,255,255,.4);font-size:22px;cursor:pointer;padding:0;line-height:1">&times;</button>
        </div>
        <div style="display:flex;align-items:center;gap:12px;margin:8px 0 18px">
          ${b.cover?`<img src="${esc(b.cover)}" alt="" style="width:48px;height:48px;border-radius:8px;object-fit:cover;flex-shrink:0">`:`<div style="width:48px;height:48px;border-radius:8px;background:rgba(255,255,255,.06);display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0">🎵</div>`}
          <div style="min-width:0">
            <div style="font-size:14px;font-weight:800;color:#f4ede4;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(b.name||'Uten tittel')}</div>
            <div style="font-size:12px;color:rgba(255,255,255,.4)">${esc(artistOf(b)||'—')}</div>
          </div>
        </div>
        ${linkBlock}
      </div>`;
    modal.style.display='flex';
  }

  // Disable from the modal (sets enabled=false → public page stops working).
  window._mvDisableShare = async function(token){
    if(!token){ closeModal(); return; }
    const ok = await window.setSongShareEnabled(token, false);
    if(ok){
      const st=getState(); const b=st?.beats?.find(x=>x.shareToken===token);
      if(b){ b.shareEnabled=false; if(typeof saveState==='function') saveState(); }
      toast('✓ Delingslenke deaktivert');
    }
    closeModal();
    if(typeof window.renderAdminShareLinks==='function') window.renderAdminShareLinks();
  };

  // ── Shared helpers (used by admin panel) ──────────────────────────────────
  window.listSongShares = async function(){
    const {token, uid} = await getAuth();
    if(!uid) return [];
    const res = await fetch(`${SB_URL}/rest/v1/song_shares?owner_id=eq.${uid}&order=created_at.desc&select=id,beat_id,kind,data,enabled,created_at`, {headers:hdrs(token)});
    if(!res.ok) return [];
    return res.json();
  };
  window.setSongShareEnabled = async function(token, enabled){
    const {token:authToken, uid} = await getAuth();
    if(!uid) return false;
    const res = await fetch(`${SB_URL}/rest/v1/song_shares?id=eq.${encodeURIComponent(token)}&owner_id=eq.${uid}`, {
      method:'PATCH', headers:{...hdrs(authToken),'Prefer':'return=minimal'}, body:JSON.stringify({enabled:!!enabled})
    });
    return res.ok;
  };
  window.deleteSongShare = async function(token){
    const {token:authToken, uid} = await getAuth();
    if(!uid) return false;
    const res = await fetch(`${SB_URL}/rest/v1/song_shares?id=eq.${encodeURIComponent(token)}&owner_id=eq.${uid}`, {
      method:'DELETE', headers:{...hdrs(authToken),'Prefer':'return=minimal'}
    });
    if(res.ok){
      const st=getState(); const b=st?.beats?.find(x=>x.shareToken===token);
      if(b){ delete b.shareToken; b.shareEnabled=false; if(typeof saveState==='function') saveState(); }
    }
    return res.ok;
  };
  window.songShareUrl = shareUrlFor;

})();
