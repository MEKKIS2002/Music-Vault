// ════════════════════════════════════════════════════════════════════════════
// mixtape-share.js — «🌐 Del lenke» for a mixtape (public page: mixtape.html?t=<token>).
//
// Own file ON PURPOSE: app.js throws «state is not defined» at load (it runs before
// db.js defines state), so nothing after ~line 750 in app.js ever executes — the old
// window.mixtapeShareMode there was dead code. Load this AFTER db.js.
// ════════════════════════════════════════════════════════════════════════════
(function(){
'use strict';

// Public page: mixtape.html?t=<token> (in this repo). Rows live in Supabase
// public.mixtape_shares and are read ONLY via the RPC get_mixtape_share — see
// sql/mixtape_shares.sql. The link is a SNAPSHOT: it shows the tracks from the
// last publish/«Oppdater», not the live mixtape. The table is owner-only (RLS);
// Worker-era links (…workers.dev/share/<token>) 404 since then — their tokens
// still open on mixtape.html.
function _mtShareToken(){
  const A='abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const buf=new Uint8Array(24); crypto.getRandomValues(buf);
  return Array.from(buf,n=>A[n%A.length]).join('');
}
function _mtShareUrl(token){ return new URL('mixtape.html?t='+encodeURIComponent(token), document.baseURI).href; }
function _mtPublicAudio(b){ const u=b&&(b.audio_url||b.url||''); return /^https?:\/\//i.test(u)?u:''; }
// The exact track list the recipient gets: same order as the mixtape, minus
// tracks without a public audio file (those can't play outside this browser).
function _mtSharePayload(mt){
  const all=(typeof beatsFromIds==='function'?beatsFromIds:window.beatsFromIds)(mt.beatIds||[]);
  const shared=all.filter(b=>_mtPublicAudio(b));
  return {
    all, shared, skipped: all.filter(b=>!_mtPublicAudio(b)),
    data:{ mt:{id:mt.id,name:mt.name,cover:mt.cover||'',color:mt.color||'#d68155'},
           beats:shared.map(b=>({id:b.id,name:b.name,duration:b.duration||0,audio_url:_mtPublicAudio(b)})) }
  };
}
async function _mtUid(){
  try{ const {data:{session}}=await window.supabaseClient.auth.getSession(); return session?.user?.id||null; }catch(e){ return null; }
}

window.mixtapeShareMode = async function(mixtapeId) {
  const mt = (typeof state !== 'undefined' ? state : window.state)?.mixtapes?.find(m=>m.id===mixtapeId);
  if (!mt) { showToast('Mixtape ikke funnet'); return; }
  if (!window.supabaseClient) { showToast('Ikke tilkoblet — prøv igjen om litt'); return; }

  if (mt._shareToken && mt._shareEnabled !== false) { _showMixtapePitchDialog(mt); return; }

  const p = _mtSharePayload(mt);
  if (!p.shared.length) { showToast('Ingen spor har offentlig lydfil ennå'); return; }
  showToast('Publiserer pitch-side...');
  try {
    const token = _mtShareToken();
    const { error } = await window.supabaseClient.from('mixtape_shares').insert({
      id: token, data: p.data, enabled: true, owner_id: await _mtUid(), updated_at: new Date().toISOString()
    });
    if (error) throw error;
    mt._shareToken = token; mt._shareUrl = _mtShareUrl(token); mt._shareEnabled = true;
    if (typeof saveState === 'function') saveState();
    _showMixtapePitchDialog(mt);
  } catch(e) {
    showToast('Kunne ikke publisere: ' + (e.message||e));
  }
};

function _showMixtapePitchDialog(mt) {
  let modal = document.getElementById('mvMixtapePitchModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'mvMixtapePitchModal';
    modal.addEventListener('click', e => { if(e.target===modal) modal.style.display='none'; });
    document.body.appendChild(modal);
  }
  const shareUrl = _mtShareUrl(mt._shareToken);
  const btn = 'background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);color:#f4eadc;font-size:12px;padding:7px 14px;cursor:pointer;font-family:system-ui';

  modal.innerHTML = `<div role="dialog" aria-modal="true" aria-labelledby="mvPitchHd" style="background:#110f0c;border:1px solid rgba(255,255,255,.12);max-width:460px;width:100%;padding:24px 28px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <h2 id="mvPitchHd" style="font-size:16px;font-weight:800;margin:0"><span class="ic ic-globe" aria-hidden="true"></span> Alle med lenken</h2>
      <button id="mvPitchClose" aria-label="Lukk" style="background:none;border:none;color:rgba(255,255,255,.6);font-size:20px;cursor:pointer;padding:0;line-height:1">×</button>
    </div>
    <div style="display:grid;gap:14px;font-family:system-ui">
      <div style="font-size:12px;color:rgba(244,234,220,.62);line-height:1.5">Hvem som helst med lenken kan lytte, uten innlogging. Ingen nedlasting.</div>
      <div id="mvPitchInfo" style="font-size:13px;color:#f4eadc;line-height:1.5;background:rgba(255,255,255,.04);padding:10px 12px">Henter status…</div>
      <div style="display:flex;gap:8px">
        <input id="mvPitchUrl" readonly aria-label="Delingslenke" style="flex:1;min-width:0;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);color:#f4eadc;padding:9px 12px;font-size:12px;outline:none">
        <button id="mvPitchCopy" style="background:#d68155;border:none;color:#000;font-size:12px;font-weight:800;padding:8px 14px;cursor:pointer">Kopier</button>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button id="mvPitchOpen" style="${btn}"><span class="ic ic-eye" aria-hidden="true"></span> Forhåndsvis som mottaker</button>
        <button id="mvPitchUpdateBtn" style="${btn}"><span class="ic ic-refresh" aria-hidden="true"></span> Oppdater sporlisten</button>
        <button id="mvPitchDisableBtn" style="${btn};background:rgba(255,170,163,.1);border-color:rgba(255,170,163,.3);color:#ffaaa3;margin-left:auto"><span class="ic ic-alert" aria-hidden="true"></span> Deaktiver</button>
      </div>
      <div id="mvPitchStatus" role="status" style="font-size:12px;color:rgba(244,234,220,.62);min-height:16px"></div>
    </div>
  </div>`;

  const $m = id => document.getElementById(id);
  $m('mvPitchUrl').value = shareUrl;
  $m('mvPitchClose').onclick = () => { modal.style.display='none'; };
  $m('mvPitchOpen').onclick = () => window.open(shareUrl, '_blank', 'noopener');
  $m('mvPitchCopy').onclick = function(){
    navigator.clipboard.writeText(shareUrl).then(()=>{ this.textContent='✓'; setTimeout(()=>this.textContent='Kopier',2000); });
  };

  // «9 av 13 spor deles» — compare what the link holds with the mixtape now.
  const renderInfo = async () => {
    const info = $m('mvPitchInfo'); if (!info) return;
    const p = _mtSharePayload(mt);
    let linked = null, updatedAt = null;
    try {
      const { data } = await window.supabaseClient.rpc('get_mixtape_share', { p_token: mt._shareToken });
      if (data) { linked = (data.beats||[]).map(b=>b.id); updatedAt = data.updatedAt; }
    } catch(e) {}
    if (!linked) { info.textContent = 'Fant ikke lenken. Den kan være deaktivert.'; return; }
    const linkedSet = new Set(linked);
    const missing = p.shared.filter(b=>!linkedSet.has(b.id)).length;
    const removed = linked.filter(id=>!p.all.some(b=>b.id===id)).length;
    const when = updatedAt ? new Date(updatedAt).toLocaleDateString('nb-NO',{day:'numeric',month:'short',year:'numeric'}) : '';
    let html = `<strong>${linked.length} av ${p.all.length} spor</strong> deles${when?` · sist oppdatert ${esc(when)}`:''}.`;
    if (missing) html += `<br>${missing} nye spor er ikke med — trykk «Oppdater sporlisten».`;
    if (removed) html += `<br>${removed} spor i lenken er fjernet fra mixtapen.`;
    if (p.skipped.length) html += `<br><span style="color:rgba(244,234,220,.62)">${p.skipped.length} spor mangler offentlig lydfil og kan ikke deles: ${p.skipped.slice(0,3).map(b=>esc(b.name)).join(', ')}${p.skipped.length>3?' …':''}</span>`;
    info.innerHTML = html;
  };
  renderInfo();

  $m('mvPitchUpdateBtn').onclick = async () => {
    const status = $m('mvPitchStatus');
    status.textContent = 'Oppdaterer...';
    try {
      const p = _mtSharePayload(mt);
      const { error } = await window.supabaseClient.from('mixtape_shares')
        .update({ data: p.data, updated_at: new Date().toISOString() }).eq('id', mt._shareToken);
      if (error) throw error;
      status.textContent = '✓ Oppdatert';
      renderInfo();
    } catch(e) { status.textContent = '' + (e.message||e); }
  };

  $m('mvPitchDisableBtn').onclick = async () => {
    if (!confirm('Deaktivere lenken? Den slutter å virke for alle som har den.')) return;
    const status = $m('mvPitchStatus');
    status.textContent = 'Deaktiverer...';
    try {
      const { error } = await window.supabaseClient.from('mixtape_shares')
        .update({ enabled: false, updated_at: new Date().toISOString() }).eq('id', mt._shareToken);
      if (error) throw error;
      mt._shareToken = null; mt._shareUrl = null; mt._shareEnabled = false;
      if(typeof saveState==='function') saveState();
      status.textContent = '✓ Deaktivert. Neste deling gir ny lenke.';
      setTimeout(()=>{modal.style.display='none';}, 2000);
    } catch(e) { status.textContent = '' + (e.message||e); }
  };

  modal.style.cssText = 'position:fixed;inset:0;z-index:9000;background:rgba(0,0,0,.75);display:flex;align-items:center;justify-content:center;padding:16px;backdrop-filter:blur(4px)';
}


})();
