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
// ── Statistikk for delingslenker (tabell share_listens, RPC get_share_stats) ──
// Fyller el med «Åpnet av N · M har spilt av · hørt i snitt P %». Bare eieren får tall.
window.mvLoadShareStats = async function(kind, token, el){
  if (!el || !token || !window.supabaseClient) return;
  el.textContent = 'Henter statistikk…';
  try {
    const { data, error } = await window.supabaseClient.rpc('get_share_stats', { p_kind: kind, p_token: token });
    if (error) throw error;
    const rows = data || [];
    const openRow = rows.find(r => r.beat_id === '');
    const opens = openRow ? Number(openRow.opens) : Math.max(0, ...rows.map(r => Number(r.opens)));
    const played = rows.filter(r => r.beat_id !== '' || kind === 'song');
    const plays = played.reduce((n, r) => n + Number(r.plays || 0), 0);
    const pcts = played.filter(r => r.avg_pct != null).map(r => Number(r.avg_pct));
    const avg = pcts.length ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : null;
    if (!opens && !plays){ el.textContent = 'Ingen har åpnet lenken ennå.'; return; }
    el.textContent = [`Åpnet av ${opens}`, kind === 'song' ? `${plays} har spilt av` : `${plays} avspillinger`, avg != null ? `hørt i snitt ${avg} %` : ''].filter(Boolean).join(' · ');
  } catch(e){ el.textContent = ''; }
};

(function(){
  'use strict';

  const SB_URL = window.MV_CONFIG.SUPABASE_URL;
  const SB_KEY = window.MV_CONFIG.SUPABASE_ANON_KEY;

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
    // Artistnavnet (fra artistsiden/innstillinger) før kontonavn og opplaster; aldri en rolle som «Admin»
    const role = s => /^(admin|producer|label)$/i.test(String(s || '').trim());
    const cands = [b.artist, window.mvArtistName, st?.settings?.artistName, b.producer, b.uploadedBy, sessionStorage.getItem('mv_username')];
    return cands.find(c => c && String(c).trim() && !role(c)) || '';
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
  async function upsertShare(b, kind, extra){
    const {token:authToken, uid} = await getAuth();
    if(!uid){ toast('Logg inn for å lage delingslenke'); return null; }
    const token = b.shareToken || newToken();
    const row = { id:token, owner_id:uid, beat_id:b.id, kind, data:snapshot(b,kind), enabled:true, ...(extra||{}) };
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
      toast('Last opp/publiser lydfilen først — offentlig deling krever en publisert lydfil.');
      return;
    }
    const k = kind || (isSong(b)?'song':'beat');
    showModal(b, null, 'Lager delingslenke…');
    const r = await upsertShare(b, k);
    if(!r){ closeModal(); return; }
    showModal(b, r.url, '');
  };

  // ── Offentlig på Explore ──────────────────────────────────────────────────
  // Gjør en låt synlig i Explore-fanen for alle innloggede (song_shares.is_public).
  // Lager/oppdaterer delingslenken ved behov. Å skjule den igjen lar lenken leve.
  window.mvBadgeAttrs = function(beatId){
    const j = window.__mvJustPublic;
    return j && j.id === beatId ? ` is-new" style="animation-delay:-${Math.round(performance.now() - j.at)}ms` : '';
  };
  window.mvIsSongPublic = function(beatId){
    const b = getState()?.beats?.find(x=>x.id===beatId);
    return !!(b && b.isPublic && b.shareEnabled !== false);
  };
  // Første gang en låt gjøres offentlig: forklar hvem som ser den (appens egen
  // dialog, ikke nettleserens confirm). Valget «ikke spør igjen» huskes per enhet.
  const CONFIRM_KEY = 'mv_explore_confirmed';
  function confirmPublic(name){
    try { if (localStorage.getItem(CONFIRM_KEY) === '1') return Promise.resolve(true); } catch(e){}
    return new Promise(resolve => {
      const prev = document.activeElement;
      const wrap = document.createElement('div');
      wrap.className = 'mv-pub-dialog'; wrap.setAttribute('role', 'dialog'); wrap.setAttribute('aria-modal', 'true'); wrap.setAttribute('aria-labelledby', 'mvPubTitle');
      wrap.innerHTML = `<div class="mv-pub-card">
          <div class="mv-pub-ic"><span class="ic ic-globe" aria-hidden="true"></span></div>
          <h2 id="mvPubTitle">Gjøre «${esc(name || 'låten')}» offentlig?</h2>
          <p>Låten vises i Explore, og alle med en Music Vault-konto kan finne og høre den. Den kan også legges på artistsiden din.</p>
          <p class="mv-pub-sub">Du kan gjøre den privat igjen når som helst med den samme bryteren.</p>
          <label class="mv-pub-remember"><input type="checkbox" id="mvPubRemember"> Ikke spør igjen på denne enheten</label>
          <div class="mv-pub-actions">
            <button type="button" class="ghost-btn" data-v="0">Avbryt</button>
            <button type="button" class="mv-pub-yes" data-v="1">Gjør offentlig</button>
          </div>
        </div>`;
      const done = ok => {
        if (ok && wrap.querySelector('#mvPubRemember').checked){ try { localStorage.setItem(CONFIRM_KEY, '1'); } catch(e){} }
        document.removeEventListener('keydown', onKey, true);
        // Tones ut; fjernes når animasjonen er ferdig (tidsfrist som reserve)
        if (matchMedia('(prefers-reduced-motion: reduce)').matches) wrap.remove();
        else {
          const card = wrap.querySelector('.mv-pub-card');
          wrap.style.setProperty('--o-from', getComputedStyle(wrap).opacity);
          if (card) card.style.setProperty('--o-from', getComputedStyle(card).opacity);
          wrap.classList.add('is-leaving');
          const rm = () => wrap.remove();
          wrap.addEventListener('animationend', e => { if (e.target === wrap) rm(); }, { once: false });
          setTimeout(rm, 400);
        }
        try { prev && prev.focus && prev.focus({ preventScroll: true }); } catch(e){}
        resolve(ok);
      };
      const onKey = e => {
        if (e.key === 'Escape'){ e.preventDefault(); done(false); return; }
        if (e.key === 'Tab'){                                              // fokus blir i dialogen
          const f = [...wrap.querySelectorAll('button, input')]; const first = f[0], last = f[f.length - 1];
          if (e.shiftKey && document.activeElement === first){ e.preventDefault(); last.focus(); }
          else if (!e.shiftKey && document.activeElement === last){ e.preventDefault(); first.focus(); }
        }
      };
      wrap.addEventListener('click', e => {
        if (e.target === wrap) return done(false);
        const b = e.target.closest('button[data-v]'); if (b) done(b.dataset.v === '1');
      });
      document.addEventListener('keydown', onKey, true);
      document.body.appendChild(wrap);
      wrap.querySelector('.mv-pub-yes').focus();
    });
  }

  window.mvSetSongPublic = async function(beatId, makePublic){
    const b = getState()?.beats?.find(x=>x.id===beatId);
    if(!b){ toast('Fant ikke sangen'); return false; }
    if(makePublic){
      if(!publicAudioUrl(b)){ toast('Last opp lydfilen først — en offentlig låt trenger en publisert lydfil.'); return false; }
      if(!(await confirmPublic(b.name))) return false;
      const extra = { is_public:true };
      if(!b.isPublic) extra.published_at = new Date().toISOString();
      const r = await upsertShare(b, isSong(b)?'song':'beat', extra);
      if(!r) return false;
    } else if(b.shareToken){
      const {token:authToken} = await getAuth();
      const res = await fetch(`${SB_URL}/rest/v1/song_shares?id=eq.${encodeURIComponent(b.shareToken)}`, {
        method:'PATCH', headers:{...hdrs(authToken),'Prefer':'return=minimal'}, body: JSON.stringify({ is_public:false })
      });
      if(!res.ok){ toast('Kunne ikke endre synlighet'); return false; }
    }
    b.isPublic = !!makePublic;
    // Merket spiller inn-animasjonen én gang. Tegnes det på nytt like etter, fortsetter
    // animasjonen der den var (negativ delay) i stedet for å starte på nytt.
    window.__mvJustPublic = makePublic ? { id: b.id, at: performance.now() } : null;
    setTimeout(() => { if (window.__mvJustPublic && window.__mvJustPublic.id === b.id) window.__mvJustPublic = null; }, 1500);
    if(typeof saveState==='function') saveState();
    toast(makePublic ? '✓ «'+(b.name||'Låten')+'» er nå offentlig på Explore' : '✓ Fjernet fra Explore');
    const cb = document.getElementById('_mvSS_public'); if(cb) cb.checked = !!makePublic;
    if(window.mvExplore && window.mvExplore.refresh && document.querySelector('.tab-btn.active')?.dataset?.tab === 'hjem') window.mvExplore.refresh();
    if(document.querySelector('.tab-btn.active')?.dataset?.tab === 'beats' && window.beatsTab?.renderBeatsTab) window.beatsTab.renderBeatsTab();   // «Offentlig»-merket
    return true;
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
    modal.style.cssText='position:fixed;inset:0;z-index:9999;background:rgb(var(--shade-rgb) / .82);display:flex;align-items:center;justify-content:center;backdrop-filter:blur(5px)';
    const kindLabel = isSong(b)?'sang':'beat';
    const linkBlock = url ? `
      <label style="display:flex;gap:10px;align-items:flex-start;padding:10px 12px;margin:0 0 14px;border:1px solid rgb(var(--ink-rgb) / .12);border-radius:10px;cursor:pointer">
        <input type="checkbox" id="_mvSS_public" ${b.isPublic?'checked':''} onchange="window.mvSetSongPublic('${esc(b.id)}', this.checked).then(ok=>{ if(!ok) this.checked=!this.checked; })" style="margin-top:2px;accent-color:var(--accent);width:16px;height:16px;flex:none">
        <span style="font-size:13px;color:var(--text);line-height:1.4"><strong>Vis på Explore</strong><br><span style="color:var(--muted);font-size:12px">Alle med Music Vault-konto kan finne og høre ${kindLabel}en.</span></span>
      </label>
      <div class="mv-share-stats" style="font-size:12px;color:var(--muted);margin:0 0 10px"></div>
      <p style="font-size:12px;color:rgb(var(--ink-rgb) / calc(.45 + (1 - .45) * var(--ink-boost)));margin:0 0 10px">Offentlig lenke — alle med denne kan høre kun denne ${kindLabel}en:</p>
      <div style="display:flex;gap:8px;margin-bottom:14px">
        <input id="_mvSS_url" readonly value="${esc(url)}"
          style="flex:1;background:rgb(var(--ink-rgb) / .06);border:1px solid rgb(var(--ink-rgb) / .12);color:var(--text);padding:9px 12px;font-size:12px;font-family:system-ui;outline:none;border-radius:8px">
        <button onclick="navigator.clipboard.writeText(document.getElementById('_mvSS_url').value).then(()=>{this.textContent='✓';setTimeout(()=>this.textContent='Kopier',1800)})"
          style="background:var(--accent);border:none;color:#000;font-size:12px;font-weight:800;padding:9px 16px;cursor:pointer;border-radius:8px;font-family:inherit;white-space:nowrap">Kopier</button>
      </div>
      <div style="display:flex;gap:8px">
        <a href="${esc(url)}" target="_blank" rel="noopener"
          style="flex:1;text-align:center;background:rgb(var(--ink-rgb) / .06);border:1px solid rgb(var(--ink-rgb) / .12);color:var(--text);padding:9px 12px;font-size:12px;font-weight:700;cursor:pointer;border-radius:8px;text-decoration:none">Åpne forhåndsvisning ↗</a>
        <button onclick="window._mvDisableShare('${esc(b.shareToken||'')}')"
          style="background:rgb(var(--danger-rgb) / .12);border:1px solid rgb(var(--danger-rgb) / .3);color:var(--danger);font-size:12px;font-weight:800;padding:9px 16px;cursor:pointer;border-radius:8px;font-family:inherit;white-space:nowrap">Deaktiver lenke</button>
      </div>` : `
      <p style="font-size:13px;color:rgb(var(--ink-rgb) / calc(.5 + (1 - .5) * var(--ink-boost)));margin:18px 0;text-align:center">${esc(statusMsg||'…')}</p>`;
    modal.innerHTML=`
      <div style="background:var(--surface-1);border:1px solid rgb(var(--ink-rgb) / .12);max-width:480px;width:94%;padding:26px 28px;border-radius:14px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
          <h2 style="font-size:16px;font-weight:900;margin:0;color:var(--text)"><span class="ic ic-link" aria-hidden="true"></span> Del ${esc(kindLabel)}</h2>
          <button onclick="document.getElementById('_mvSongShare').style.display='none'" style="background:none;border:none;color:rgb(var(--ink-rgb) / calc(.4 + (1 - .4) * var(--ink-boost)));font-size:22px;cursor:pointer;padding:0;line-height:1">&times;</button>
        </div>
        <div style="display:flex;align-items:center;gap:12px;margin:8px 0 18px">
          ${b.cover?`<img src="${esc(b.cover)}" alt="" style="width:48px;height:48px;border-radius:8px;object-fit:cover;flex-shrink:0">`:`<div style="width:48px;height:48px;border-radius:8px;background:rgb(var(--ink-rgb) / .06);display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0"><span class="ic ic-music" aria-hidden="true"></span></div>`}
          <div style="min-width:0">
            <div style="font-size:14px;font-weight:800;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(b.name||'Uten tittel')}</div>
            <div style="font-size:12px;color:rgb(var(--ink-rgb) / calc(.4 + (1 - .4) * var(--ink-boost)))">${esc(artistOf(b)||'—')}</div>
          </div>
        </div>
        ${linkBlock}
      </div>`;
    modal.style.display='flex';
    const statsEl = modal.querySelector('.mv-share-stats');
    if (statsEl && b.shareToken && window.mvLoadShareStats) window.mvLoadShareStats('song', b.shareToken, statsEl);
  }

  // Disable from the modal (sets enabled=false → public page stops working).
  window._mvDisableShare = async function(token){
    if(!token){ closeModal(); return; }
    const ok = await window.setSongShareEnabled(token, false);
    if(ok){
      const st=getState(); const b=st?.beats?.find(x=>x.shareToken===token);
      if(b){ b.shareEnabled=false; b.isPublic=false; if(typeof saveState==='function') saveState(); }
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
