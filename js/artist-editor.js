// ════════════════════════════════════════════════════════════════════════════
// artist-editor.js — rediger den offentlige artistsiden (artist.html?u=<adresse>).
// Kort i Integrasjoner (#artistPageCard). Data: tabellen artist_pages (bare egen
// rad, RLS). Utvalgte låter = dine egne aktive delingslenker (song_shares).
// ════════════════════════════════════════════════════════════════════════════
(function(){
  'use strict';
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const SLUG = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;
  const pageUrl = slug => new URL('artist.html?u=' + encodeURIComponent(slug), document.baseURI).href;
  const toast = m => typeof window.showToast === 'function' ? window.showToast(m) : console.log(m);
  const client = () => window.supabaseClient;

  async function uid(){ try { return (await client().auth.getSession()).data?.session?.user?.id || null; } catch(e){ return null; } }

  async function render(){
    const box = document.getElementById('artistPageCard'); if (!box || !client()) return;
    const body = box.querySelector('.ap-body');
    const id = await uid(); if (!id){ body.innerHTML = '<p class="hint">Logg inn for å lage artistside.</p>'; return; }
    const [{ data: page }, { data: shares }] = await Promise.all([
      client().from('artist_pages').select('*').eq('user_id', id).maybeSingle(),
      client().from('song_shares').select('id,data,enabled').eq('owner_id', id).eq('enabled', true).order('created_at', { ascending: false }),
    ]);
    const guess = (sessionStorage.getItem('mv_username') || '').toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '');
    const p = page || { slug: guess, display_name: sessionStorage.getItem('mv_username') || '', bio: '', photo_url: '', contact: '', links: [], featured: [], published: false };
    const featured = new Set(p.featured || []);
    const linksText = (p.links || []).map(l => (l.label ? l.label + ' | ' : '') + l.url).join('\n');
    body.innerHTML = `
      <div class="ap-grid">
        <label>Adresse<input id="apSlug" value="${esc(p.slug)}" placeholder="f.eks. mekkis" autocomplete="off"></label>
        <label>Navn<input id="apName" value="${esc(p.display_name)}"></label>
        <label class="ap-wide">Bio<textarea id="apBio" rows="4" maxlength="2000">${esc(p.bio)}</textarea></label>
        <label>Bilde (lenke)<input id="apPhoto" value="${esc(p.photo_url)}" placeholder="https://…"></label>
        <label>Kontakt<input id="apContact" value="${esc(p.contact)}" placeholder="e-post eller tekst" maxlength="200"></label>
        <label class="ap-wide">Lenker (én per linje, «Navn | https://…»)<textarea id="apLinks" rows="3">${esc(linksText)}</textarea></label>
      </div>
      <div class="ap-sub">Låter på siden — velg blant dine delingslenker</div>
      <div class="ap-tracks">${(shares || []).length ? shares.map(s => `
        <label class="ap-track"><input type="checkbox" value="${esc(s.id)}" ${featured.has(s.id) ? 'checked' : ''}> ${esc(s.data?.title || 'Uten tittel')}</label>`).join('')
        : '<p class="hint">Du har ingen delingslenker ennå — del en låt («Del lenke») for å vise den her.</p>'}</div>
      <label class="ap-pub"><input type="checkbox" id="apPublished" ${p.published ? 'checked' : ''}> Publisert (synlig for alle med lenken)</label>
      <div class="ap-actions">
        <button class="ghost-btn" id="apSave">Lagre</button>
        ${page ? `<a class="ghost-btn" href="${esc(pageUrl(p.slug))}" target="_blank" rel="noopener">Åpne siden</a>
        <button class="ghost-btn" id="apCopy">Kopier lenke</button>` : ''}
        <span class="hint" id="apMsg" role="status"></span>
      </div>`;
    body.querySelector('#apSave').onclick = save;
    const copy = body.querySelector('#apCopy');
    if (copy) copy.onclick = () => navigator.clipboard.writeText(pageUrl(p.slug)).then(() => toast('✓ Lenke kopiert'));
  }

  async function save(){
    const v = id => document.getElementById(id).value.trim();
    const msg = document.getElementById('apMsg');
    const slug = v('apSlug').toLowerCase();
    if (!SLUG.test(slug)){ msg.textContent = 'Adressen må være 3–40 tegn: små bokstaver, tall og bindestrek.'; return; }
    const photo = v('apPhoto');
    if (photo && !/^https:\/\//i.test(photo)){ msg.textContent = 'Bildelenken må starte med https://'; return; }
    const links = v('apLinks').split('\n').map(l => l.trim()).filter(Boolean).map(l => {
      const [a, b] = l.includes('|') ? l.split('|').map(x => x.trim()) : ['', l];
      return { label: a, url: b };
    }).filter(l => /^https?:\/\//i.test(l.url));
    const featured = [...document.querySelectorAll('.ap-track input:checked')].map(i => i.value);
    const row = { user_id: await uid(), slug, display_name: v('apName'), bio: v('apBio'), photo_url: photo, contact: v('apContact'),
                  links, featured, published: document.getElementById('apPublished').checked, updated_at: new Date().toISOString() };
    msg.textContent = 'Lagrer…';
    const { error } = await client().from('artist_pages').upsert(row, { onConflict: 'user_id' });
    if (error){ msg.textContent = /duplicate|unique/i.test(error.message) ? 'Den adressen er tatt — velg en annen.' : 'Kunne ikke lagre: ' + error.message; return; }
    toast(row.published ? '✓ Artistsiden er publisert' : '✓ Lagret (ikke publisert)');
    render();
  }

  window.mvArtistEditor = { render };
  // Fyll kortet når Integrasjoner åpnes (og ved oppstart om den alt er åpen).
  document.addEventListener('click', e => { if (e.target.closest && e.target.closest('.tab-btn[data-tab="integrations"]')) setTimeout(render, 100); });
  setTimeout(render, 3000);
})();
