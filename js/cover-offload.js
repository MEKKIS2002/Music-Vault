// ════════════════════════════════════════════════════════════════════════════
// cover-offload.js — flytter cover fra data-URL (inne i state) til R2.
//
// Hvorfor: cover som data-URL utgjorde ~96 % av hele tilstanden (5 MB), som
// ligger på taket for localStorage og sendes med i hver synk. Her lastes hvert
// unike bilde opp ÉN gang til R2 (covers/<innholds-hash>.jpg) og data-URL-en
// byttes med lenken. Mange sanger deler samme cover (arvet fra album) → én fil.
//
// - Kjører i bakgrunnen: kort etter oppstart og så jevnlig (nye cover flyttes også).
// - Bare egne elementer, bare med skrivetilgang, på nett og når R2 er klar.
// - Oppdaterer album.cover_hd_for så HD-coveret fortsatt hører til.
// - window.mvCoverOffload.run({ dryRun:true }) viser hva som ville skjedd.
// ════════════════════════════════════════════════════════════════════════════
(function(){
  'use strict';

  const MAX_PER_RUN = 25;
  let running = false;

  const st = () => window.state || (typeof state !== 'undefined' ? state : null);
  const isData = v => typeof v === 'string' && v.startsWith('data:image');
  const canRun = () => {
    // Samme kriterium som synken (canWrite i supabase.js): uten skrivetilgang
    // ville byttet bare blitt lokalt.
    const admin = window.isAdminMode || sessionStorage.getItem('mv_role') === 'admin';
    if (!admin || !window.supabaseClient) return false;
    return navigator.onLine !== false && !!(window.r2Storage && window.r2Storage.ready()) && !!sessionStorage.getItem('mv_package');
  };

  async function sha16(str){
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return [...new Uint8Array(buf)].slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join('');
  }
  const extOf = d => (/^data:image\/(png|webp|gif)/.exec(d) || [, 'jpg'])[1].replace('jpeg', 'jpg');

  // Finnes fila allerede i R2? (GET med 1 byte — /file er offentlig)
  async function exists(key){
    try {
      const r = await fetch(`${window.R2_WORKER_URL}/file/${encodeURIComponent(key)}`, { headers: { Range: 'bytes=0-0' } });
      return r.ok;
    } catch(e){ return false; }
  }

  // Alle (element, felt)-par med data-URL-cover, gruppert per unike bilde.
  function collect(s){
    const groups = new Map();                      // dataUrl -> [{ item, field, kind }]
    const add = (item, field, kind) => {
      if (!item || item._shared || !isData(item[field])) return;
      const k = item[field];
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push({ item, field, kind });
    };
    (s.beats || []).forEach(b => add(b, 'cover', 'beat'));
    (s.albums || []).forEach(a => { add(a, 'cover', 'album'); add(a, 'cover_url', 'album'); });
    (s.mixtapes || []).forEach(m => { add(m, 'cover', 'mixtape'); add(m, 'cover_url', 'mixtape'); });
    return groups;
  }

  async function run({ dryRun = false } = {}){
    const s = st();
    if (!s || running) return null;
    if (!dryRun && !canRun()) return null;
    running = true;
    const report = { images: 0, refs: 0, uploaded: 0, reused: 0, failed: 0, dryRun };
    try {
      const groups = collect(s);
      let done = 0;
      for (const [dataUrl, refs] of groups){
        if (done >= MAX_PER_RUN) break;
        done++; report.images++; report.refs += refs.length;
        const key = `covers/${await sha16(dataUrl)}.${extOf(dataUrl)}`;
        if (dryRun) continue;
        let url;
        try {
          if (await exists(key)) { url = window.r2Storage.fileUrl(key); report.reused++; }
          else {
            const blob = await (await fetch(dataUrl)).blob();
            url = await window.r2Storage.uploadKey(key, blob);
            report.uploaded++;
          }
        } catch(e){ report.failed++; console.warn('[Cover] Kunne ikke flytte', key, e); continue; }
        const fp = window.mvCoverFingerprint;
        refs.forEach(({ item, field, kind }) => {
          const hdWasCurrent = kind === 'album' && field === 'cover' && fp && item.cover_hd_for && item.cover_hd_for === fp(item.cover);
          item[field] = url;
          if (hdWasCurrent) item.cover_hd_for = fp(url);
        });
      }
      if (!dryRun && (report.uploaded || report.reused) && typeof saveState === 'function') saveState();
      if (report.images) console.info('[Cover] Flyttet til R2:', report);
      return report;
    } finally { running = false; }
  }

  window.mvCoverOffload = { run, collect: () => { const s = st(); return s ? collect(s).size : 0; } };

  // Bakgrunn: litt etter oppstart (etter pull), så hvert 2. minutt.
  setTimeout(() => run(), 15000);
  setInterval(() => run(), 120000);
})();
