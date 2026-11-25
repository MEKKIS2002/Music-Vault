// ════════════════════════════════════════════════════════════════════════════
// artist-studio.js — fanen «Artistside»: visuell redigering av den offentlige
// profilen (artist.html?u=<adresse>) med forhåndsvisning som oppdateres mens
// du skriver.
//
// Data: én rad i artist_pages (bare egen, RLS). Seksjonene ligger i `blocks`
// (rekkefølge = rekkefølgen på siden). Bilder lastes opp til R2 som
// covers/<innholds-hash>.jpg (samme navnerom som cover-offload.js).
// Låter = et utvalg av dine OFFENTLIGE låter (song_shares.is_public).
// Selve siden tegnes av js/artist-render.js (delt med artist.html).
// ════════════════════════════════════════════════════════════════════════════
(function(){
  'use strict';
  const R = () => window.mvArtistRender;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const SLUG = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;
  const HEX = /^#[0-9a-f]{6}$/i;
  const ACCENTS = [['#d68155','Oransje'],['#e0a458','Rav'],['#8fbf7a','Grønn'],['#6fb3c9','Blå'],['#9d8cff','Lilla'],['#e0707a','Rosa'],['#f4eadc','Krem']];
  const TYPES = {
    bio:     { label: 'Bio',     ic: 'ic-user' },
    tracks:  { label: 'Låter',   ic: 'ic-music' },
    gallery: { label: 'Bilder',  ic: 'ic-image' },
    text:    { label: 'Tekst',   ic: 'ic-file' },
    links:   { label: 'Lenker',  ic: 'ic-link' },
    contact: { label: 'Kontakt', ic: 'ic-chat' },
  };
  const client = () => window.supabaseClient;
  const toast = m => typeof window.showToast === 'function' ? window.showToast(m) : console.log(m);
  const pageUrl = slug => new URL('artist.html?u=' + encodeURIComponent(slug), document.baseURI).href;
  const newId = () => Math.random().toString(36).slice(2, 9);
  const root = () => document.getElementById('artistpageTab');

  let S = null;          // { uid, exists, savedSlug, saved, page:{…}, shares:[{id,data}] }
  let bound = false, dragFrom = -1, busy = 0;

  // ── Laste ────────────────────────────────────────────────────────────────
  async function load(){
    const c = client(); if (!c) return null;
    const uid = (await c.auth.getSession()).data?.session?.user?.id; if (!uid) return null;
    const [pg, sh] = await Promise.all([
      c.from('artist_pages').select('*').eq('user_id', uid).maybeSingle(),
      c.from('song_shares').select('id,data').eq('owner_id', uid).eq('enabled', true).eq('is_public', true).order('created_at', { ascending: false }),
    ]);
    if (pg.error) throw pg.error;
    const name = sessionStorage.getItem('mv_username') || '';
    const p = pg.data || { slug: name.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, ''), display_name: name, featured: [], links: [] };
    const blocks = (Array.isArray(p.blocks) && p.blocks.length ? p.blocks : R().defaultBlocks(p)).map(b => ({ ...b, id: b.id || newId() }));
    S = {
      uid, exists: !!pg.data, savedSlug: pg.data ? p.slug : '',
      shares: sh.data || [],
      page: { slug: p.slug || '', display_name: p.display_name || '', photo_url: p.photo_url || '', banner_url: p.banner_url || '',
              accent: HEX.test(p.accent || '') ? p.accent : '#d68155', blocks, published: !!p.published },
    };
    window.mvArtistName = p.display_name || '';   // brukes som kreditering når låter deles
    S.saved = snap();
    return S;
  }
  const snap = () => JSON.stringify(S.page);
  const dirty = () => !!S && snap() !== S.saved;

  // ── Åpne fanen ───────────────────────────────────────────────────────────
  async function open(){
    const el = root(); if (!el) return;
    if (!S){
      el.innerHTML = '<div class="as-empty">Laster artistsiden…</div>';
      try { if (!(await load())){ el.innerHTML = '<div class="as-empty">Logg inn for å lage din artistside.</div>'; return; } }
      catch(e){ el.innerHTML = `<div class="as-empty">Kunne ikke laste artistsiden: ${esc(e.message)}</div>`; return; }
    }
    if (!el.querySelector('.as-wrap')) layout(el);
    drawEditor(); drawPreview(); bar();
  }

  function layout(el){
    el.innerHTML = `
      <div class="as-wrap">
        <div class="as-bar">
          <div>
            <h1 class="as-title">Artistside</h1>
            <div class="as-url" id="asUrl"></div>
          </div>
          <div class="as-actions">
            <span class="as-status" id="asStatus" role="status"></span>
            <label class="as-switch"><input type="checkbox" id="asPublished"> <span>Publisert</span></label>
            <a class="ghost-btn" id="asOpen" target="_blank" rel="noopener">Åpne siden</a>
            <button class="ghost-btn" id="asCopy" type="button">Kopier lenke</button>
            <button class="as-save" id="asSave" type="button">Lagre</button>
          </div>
        </div>
        <div class="as-grid">
          <div class="as-editor" id="asEditor"></div>
          <div class="as-preview">
            <div class="as-preview-label">Forhåndsvisning — slik ser andre siden</div>
            <div class="as-device"><div class="ap-page" id="asPreview"><div id="asPreviewBody"></div></div></div>
          </div>
        </div>
      </div>`;
    R().bind(el.querySelector('#asPreview'), {});
    if (!bound){ bindEvents(el); bound = true; }
  }

  // ── Redigering ───────────────────────────────────────────────────────────
  function drawEditor(){
    const ed = document.getElementById('asEditor'); if (!ed) return;
    const p = S.page;
    const initial = esc((p.display_name || p.slug || '?').slice(0, 1).toUpperCase());
    ed.innerHTML = `
      <section class="as-card">
        <h2>Profil</h2>
        <div class="as-banner-pick" ${p.banner_url ? `style="background-image:url('${esc(p.banner_url)}')"` : ''}>
          ${p.banner_url ? '' : '<span class="as-banner-hint">Banner (bredt bilde, f.eks. 2400×800)</span>'}
          <button class="as-chip" data-act="img" data-target="banner_url" type="button">${p.banner_url ? 'Bytt banner' : 'Last opp banner'}</button>
          ${p.banner_url ? '<button class="as-chip" data-act="clear" data-target="banner_url" type="button">Fjern</button>' : ''}
        </div>
        <div class="as-profile">
          ${p.photo_url ? `<img class="as-avatar" src="${esc(p.photo_url)}" alt="Profilbilde">` : `<div class="as-avatar" aria-hidden="true">${initial}</div>`}
          <div class="as-profile-btns">
            <button class="as-chip" data-act="img" data-target="photo_url" type="button">${p.photo_url ? 'Bytt profilbilde' : 'Last opp profilbilde'}</button>
            ${p.photo_url ? '<button class="as-chip" data-act="clear" data-target="photo_url" type="button">Fjern</button>' : ''}
          </div>
        </div>
        <label class="as-field">Artistnavn<input data-f="display_name" value="${esc(p.display_name)}" maxlength="80"></label>
        <label class="as-field">Adresse
          <span class="as-slug"><span>…/artist.html?u=</span><input data-f="slug" value="${esc(p.slug)}" maxlength="40" autocomplete="off" spellcheck="false"></span>
        </label>
        <div class="as-field">Aksentfarge på siden
          <div class="as-swatches">
            ${ACCENTS.map(([hex, name]) => `<button class="as-swatch" type="button" data-act="accent" data-v="${hex}" style="background:${hex}" aria-label="${name}" aria-pressed="${p.accent.toLowerCase() === hex}"></button>`).join('')}
            <label class="as-custom-color" title="Egen farge"><input type="color" data-f="accent" value="${esc(p.accent)}" aria-label="Egen farge"></label>
          </div>
        </div>
      </section>

      <section class="as-card">
        <div class="as-card-head"><h2>Seksjoner</h2><span class="as-hint">Dra i ⋮⋮ eller bruk pilene for å endre rekkefølgen</span></div>
        <div class="as-blocks">${p.blocks.map(blockCard).join('') || '<p class="as-hint">Ingen seksjoner ennå — legg til en under.</p>'}</div>
        <div class="as-add"><span class="as-hint">Legg til:</span>
          ${Object.entries(TYPES).map(([t, d]) => `<button class="as-chip" type="button" data-act="add" data-type="${t}"><span class="ic ${d.ic}" aria-hidden="true"></span> ${d.label}</button>`).join('')}
        </div>
      </section>`;
  }

  function blockCard(b, i){
    const d = TYPES[b.type] || { label: b.type, ic: 'ic-file' }, n = S.page.blocks.length;
    const titleField = b.type === 'bio' ? '' :
      `<input data-b="${i}" data-k="title" value="${esc(b.title || '')}" placeholder="Overskrift: ${esc(R().TITLES[b.type] || 'valgfri')}" maxlength="60">`;
    return `
      <div class="as-block${b.hidden ? ' is-hidden' : ''}" data-i="${i}">
        <div class="as-block-head">
          <span class="as-grip" title="Dra for å flytte" aria-hidden="true">⋮⋮</span>
          <span class="ic ${d.ic}" aria-hidden="true"></span><strong>${d.label}</strong>${b.hidden ? '<span class="as-tag">Skjult</span>' : ''}
          <span class="as-block-tools">
            <button class="as-icon-btn" type="button" data-act="up" data-i="${i}" aria-label="Flytt opp" ${i === 0 ? 'disabled' : ''}>↑</button>
            <button class="as-icon-btn" type="button" data-act="down" data-i="${i}" aria-label="Flytt ned" ${i === n - 1 ? 'disabled' : ''}>↓</button>
            <button class="as-icon-btn" type="button" data-act="hide" data-i="${i}" aria-label="${b.hidden ? 'Vis seksjonen' : 'Skjul seksjonen'}"><span class="ic ic-eye" aria-hidden="true"></span></button>
            <button class="as-icon-btn" type="button" data-act="del" data-i="${i}" aria-label="Slett seksjonen"><span class="ic ic-trash" aria-hidden="true"></span></button>
          </span>
        </div>
        <div class="as-block-body">${titleField}${blockBody(b, i)}</div>
      </div>`;
  }

  function blockBody(b, i){
    switch (b.type){
      case 'bio':  return `<textarea data-b="${i}" data-k="text" rows="5" maxlength="2000" placeholder="Hvem er du, hva lager du, hva er på gang?">${esc(b.text)}</textarea>`;
      case 'text': return `<textarea data-b="${i}" data-k="text" rows="4" maxlength="4000" placeholder="Fri tekst — sitater, pressetekst, kommende slipp …">${esc(b.text)}</textarea>`;
      case 'contact': return `<input data-b="${i}" data-k="text" value="${esc(b.text)}" maxlength="200" placeholder="booking@… eller en kort tekst">`;
      case 'tracks': {
        const tokens = b.tokens || [], byId = Object.fromEntries(S.shares.map(s => [s.id, s.data || {}]));
        const rest = S.shares.filter(s => !tokens.includes(s.id));
        const rows = tokens.map((t, j) => `
          <div class="as-list-row">
            <span class="as-num">${j + 1}</span><span class="as-grow">${esc(byId[t]?.title || 'Ikke offentlig lenger — fjernes ved lagring')}</span>
            <button class="as-icon-btn" type="button" data-act="t-up" data-i="${i}" data-j="${j}" aria-label="Flytt opp" ${j === 0 ? 'disabled' : ''}>↑</button>
            <button class="as-icon-btn" type="button" data-act="t-down" data-i="${i}" data-j="${j}" aria-label="Flytt ned" ${j === tokens.length - 1 ? 'disabled' : ''}>↓</button>
            <button class="as-icon-btn" type="button" data-act="t-del" data-i="${i}" data-j="${j}" aria-label="Fjern">×</button>
          </div>`).join('');
        if (!S.shares.length) return '<p class="as-hint">Du har ingen offentlige låter ennå. Åpne menyen på en låt og velg «Gjør offentlig på Explore» — så kan du velge den her.</p>';
        return `${rows || '<p class="as-hint">Ingen låter valgt.</p>'}
          ${rest.length ? `<select data-act="t-add" data-i="${i}"><option value="">+ Legg til offentlig låt …</option>${rest.map(s => `<option value="${esc(s.id)}">${esc(s.data?.title || 'Uten tittel')}</option>`).join('')}</select>` : ''}`;
      }
      case 'gallery': {
        const ims = b.images || [];
        return `<div class="as-thumbs">${ims.map((src, j) => `
            <div class="as-thumb"><img src="${esc(src)}" alt="">
              <div class="as-thumb-tools">
                <button type="button" data-act="g-left" data-i="${i}" data-j="${j}" aria-label="Flytt til venstre" ${j === 0 ? 'disabled' : ''}>‹</button>
                <button type="button" data-act="g-del" data-i="${i}" data-j="${j}" aria-label="Fjern bildet">×</button>
                <button type="button" data-act="g-right" data-i="${i}" data-j="${j}" aria-label="Flytt til høyre" ${j === ims.length - 1 ? 'disabled' : ''}>›</button>
              </div>
            </div>`).join('')}</div>
          <button class="as-chip" type="button" data-act="g-add" data-i="${i}"><span class="ic ic-upload" aria-hidden="true"></span> Last opp bilder</button>`;
      }
      case 'links': {
        const ls = b.links || [];
        return `${ls.map((l, j) => `
          <div class="as-list-row as-link-row">
            <input data-b="${i}" data-k="link-label" data-j="${j}" value="${esc(l.label)}" placeholder="Navn (Spotify)" maxlength="40">
            <input data-b="${i}" data-k="link-url" data-j="${j}" value="${esc(l.url)}" placeholder="https://…" inputmode="url" spellcheck="false">
            <button class="as-icon-btn" type="button" data-act="l-del" data-i="${i}" data-j="${j}" aria-label="Fjern lenken">×</button>
          </div>`).join('')}
          <button class="as-chip" type="button" data-act="l-add" data-i="${i}">+ Lenke</button>`;
      }
      default: return '';
    }
  }

  // ── Forhåndsvisning + statuslinje ────────────────────────────────────────
  function drawPreview(){
    const host = document.getElementById('asPreview'), body = document.getElementById('asPreviewBody'); if (!host || !body) return;
    const page = { ...S.page, tracks: Object.fromEntries(S.shares.map(s => [s.id, s.data || {}])) };
    R().applyAccent(host, S.page.accent);
    host._apPage = page;
    body.innerHTML = R().html(page);
    body.querySelectorAll('a').forEach(a => { a.target = '_blank'; a.rel = 'noopener'; });
  }

  function bar(){
    const p = S.page, d = dirty();
    const st = document.getElementById('asStatus'), save = document.getElementById('asSave');
    if (!st) return;
    st.textContent = busy ? 'Laster opp bilde …' : d ? 'Ulagrede endringer' : (p.published ? 'Publisert — synlig for alle med lenken' : 'Utkast — ikke synlig for andre');
    st.classList.toggle('is-dirty', d || !!busy);
    save.disabled = !d || !!busy;
    document.getElementById('asPublished').checked = p.published;
    const live = S.exists && S.savedSlug;
    const a = document.getElementById('asOpen'), cp = document.getElementById('asCopy');
    a.toggleAttribute('hidden', !live); cp.toggleAttribute('hidden', !live);
    if (live) a.href = pageUrl(S.savedSlug);
    document.getElementById('asUrl').textContent = live ? pageUrl(S.savedSlug).replace(/^https?:\/\//, '') : 'Ikke lagret ennå';
  }

  const changed = (redrawEditor) => { if (redrawEditor) drawEditor(); drawPreview(); bar(); };

  // ── Hendelser ────────────────────────────────────────────────────────────
  function bindEvents(el){
    el.addEventListener('input', e => {
      const t = e.target, p = S && S.page; if (!p) return;
      if (t.dataset.f){
        p[t.dataset.f] = t.dataset.f === 'slug' ? t.value.toLowerCase() : t.value;
        if (t.dataset.f === 'accent') el.querySelectorAll('.as-swatch').forEach(s => s.setAttribute('aria-pressed', String(s.dataset.v === t.value.toLowerCase())));
        return changed(false);
      }
      if (t.dataset.b != null){
        const b = p.blocks[+t.dataset.b], k = t.dataset.k; if (!b) return;
        if (k === 'link-label' || k === 'link-url') b.links[+t.dataset.j][k === 'link-label' ? 'label' : 'url'] = t.value;
        else b[k] = t.value;
        changed(false);
      }
    });

    el.addEventListener('change', e => {
      const t = e.target; if (!S) return;
      if (t.id === 'asPublished'){ S.page.published = t.checked; return changed(false); }
      if (t.dataset.act === 't-add' && t.value){
        const b = S.page.blocks[+t.dataset.i]; (b.tokens = b.tokens || []).push(t.value); changed(true);
      }
    });

    el.addEventListener('click', async e => {
      const t = e.target.closest('button, [data-act]'); if (!t || !S) return;
      if (t.id === 'asSave') return save();
      if (t.id === 'asCopy') return navigator.clipboard.writeText(pageUrl(S.savedSlug)).then(() => toast('✓ Lenke kopiert'));
      const act = t.dataset.act; if (!act || t.tagName === 'SELECT') return;
      const p = S.page, i = +t.dataset.i, j = +t.dataset.j, b = p.blocks[i];
      const swap = (arr, a, c) => { if (c < 0 || c >= arr.length) return; [arr[a], arr[c]] = [arr[c], arr[a]]; };
      switch (act){
        case 'accent': p.accent = t.dataset.v; return changed(true);
        case 'clear':  p[t.dataset.target] = ''; return changed(true);
        case 'img': {
          const [f] = await pickFiles(false); if (!f) return;
          const url = await upload(f, t.dataset.target === 'banner_url' ? 2400 : 800); if (url){ p[t.dataset.target] = url; changed(true); }
          return;
        }
        case 'add': {
          const nb = { id: newId(), type: t.dataset.type };
          if (nb.type === 'tracks') nb.tokens = [];
          if (nb.type === 'gallery') nb.images = [];
          if (nb.type === 'links') nb.links = [{ label: '', url: '' }];
          p.blocks.push(nb); changed(true);
          const last = el.querySelector('.as-block:last-child'); last?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          last?.querySelector('input, textarea')?.focus({ preventScroll: true });
          return;
        }
        case 'up':   swap(p.blocks, i, i - 1); return changed(true);
        case 'down': swap(p.blocks, i, i + 1); return changed(true);
        case 'hide': b.hidden = !b.hidden; return changed(true);
        case 'del': {
          const hasContent = (b.text || '').trim() || (b.tokens || []).length || (b.images || []).length || (b.links || []).some(l => l.url);
          if (hasContent && !confirm(`Slette seksjonen «${(TYPES[b.type] || {}).label || b.type}»?`)) return;
          p.blocks.splice(i, 1); return changed(true);
        }
        case 't-up':   swap(b.tokens, j, j - 1); return changed(true);
        case 't-down': swap(b.tokens, j, j + 1); return changed(true);
        case 't-del':  b.tokens.splice(j, 1); return changed(true);
        case 'g-left':  swap(b.images, j, j - 1); return changed(true);
        case 'g-right': swap(b.images, j, j + 1); return changed(true);
        case 'g-del':   b.images.splice(j, 1); return changed(true);
        case 'g-add': {
          const files = await pickFiles(true);
          for (const f of files){ const url = await upload(f, 1600); if (url){ (b.images = b.images || []).push(url); changed(true); } }
          return;
        }
        case 'l-add': (b.links = b.links || []).push({ label: '', url: '' }); changed(true);
          el.querySelector(`.as-block[data-i="${i}"] .as-link-row:last-of-type input`)?.focus();
          return;
        case 'l-del': b.links.splice(j, 1); return changed(true);
      }
    });

    // Dra og slipp seksjoner (bare fra håndtaket, så tekstmarkering i feltene virker)
    el.addEventListener('pointerdown', e => { const c = e.target.closest('.as-block'); if (c) c.draggable = !!e.target.closest('.as-grip'); });
    el.addEventListener('dragstart', e => {
      const c = e.target.closest && e.target.closest('.as-block'); if (!c) return;
      dragFrom = +c.dataset.i; c.classList.add('is-dragging'); e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', String(dragFrom)); } catch(_){}
    });
    el.addEventListener('dragover', e => {
      const c = e.target.closest && e.target.closest('.as-block'); if (!c || dragFrom < 0) return;
      e.preventDefault();
      el.querySelectorAll('.as-block.is-over').forEach(x => x !== c && x.classList.remove('is-over'));
      c.classList.add('is-over');
    });
    el.addEventListener('drop', e => {
      const c = e.target.closest && e.target.closest('.as-block'); if (!c || dragFrom < 0) return;
      e.preventDefault();
      const to = +c.dataset.i, arr = S.page.blocks;
      if (to !== dragFrom){ const [m] = arr.splice(dragFrom, 1); arr.splice(to, 0, m); }
      dragFrom = -1; changed(true);
    });
    el.addEventListener('dragend', () => { dragFrom = -1; el.querySelectorAll('.is-dragging, .is-over').forEach(x => x.classList.remove('is-dragging', 'is-over')); });

    window.addEventListener('beforeunload', e => { if (dirty()){ e.preventDefault(); e.returnValue = ''; } });
  }

  // ── Bilder → R2 ──────────────────────────────────────────────────────────
  function pickFiles(multiple){
    return new Promise(res => {
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = 'image/*'; inp.multiple = multiple;
      inp.onchange = () => res([...inp.files]);
      inp.click();
    });
  }
  async function upload(file, max){
    if (!window.r2Storage || !window.r2Storage.ready()){ toast('Bildelagring er ikke tilgjengelig'); return null; }
    if (!/^image\//.test(file.type)){ toast('Velg en bildefil'); return null; }
    busy++; bar();
    try {
      const bmp = await createImageBitmap(file);
      const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
      const cv = document.createElement('canvas'); cv.width = Math.round(bmp.width * k); cv.height = Math.round(bmp.height * k);
      cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
      const blob = await new Promise(r => cv.toBlob(r, 'image/jpeg', 0.86));
      const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()))].slice(0, 8).map(x => x.toString(16).padStart(2, '0')).join('');
      return await window.r2Storage.uploadKey(`covers/${hash}.jpg`, blob);
    } catch(e){ toast('Kunne ikke laste opp bildet: ' + e.message); return null; }
    finally { busy--; bar(); }
  }

  // ── Lagre ────────────────────────────────────────────────────────────────
  const withScheme = u => { u = (u || '').trim(); return !u ? '' : /^[a-z][a-z0-9+.-]*:/i.test(u) ? u : 'https://' + u; };
  function cleanBlock(b){
    const o = { id: b.id, type: b.type };
    if (b.hidden) o.hidden = true;
    if (b.title) o.title = String(b.title).trim().slice(0, 60);
    if (b.type === 'bio' || b.type === 'text' || b.type === 'contact') o.text = String(b.text || '').slice(0, b.type === 'contact' ? 200 : 4000);
    if (b.type === 'tracks') o.tokens = (b.tokens || []).filter(t => S.shares.some(s => s.id === t));
    if (b.type === 'gallery') o.images = (b.images || []).filter(u => /^https:\/\//.test(u)).slice(0, 48);
    if (b.type === 'links') o.links = (b.links || []).map(l => ({ label: String(l.label || '').trim(), url: withScheme(l.url) })).filter(l => /^https?:\/\//i.test(l.url));
    return o;
  }

  async function save(){
    const p = S.page, st = document.getElementById('asStatus');
    const slug = (p.slug || '').trim().toLowerCase();
    const fail = m => { st.textContent = m; st.classList.add('is-dirty'); };
    if (!SLUG.test(slug)) return fail('Adressen må være 3–40 tegn: små bokstaver, tall og bindestrek.');
    if (!HEX.test(p.accent)) p.accent = '#d68155';
    const blocks = p.blocks.map(cleanBlock);
    const first = t => blocks.find(b => b.type === t && !b.hidden);
    const row = {
      user_id: S.uid, slug, display_name: p.display_name.trim(), photo_url: p.photo_url, banner_url: p.banner_url,
      accent: p.accent.toLowerCase(), blocks, published: p.published, updated_at: new Date().toISOString(),
      // Eldre felt holdes i synk (enkle visninger / bakoverkompatibilitet)
      bio: (first('bio')?.text || '').slice(0, 2000), contact: (first('contact')?.text || '').slice(0, 200),
      links: blocks.filter(b => b.type === 'links').flatMap(b => b.links),
      featured: [...new Set(blocks.filter(b => b.type === 'tracks').flatMap(b => b.tokens))],
    };
    document.getElementById('asSave').disabled = true; st.textContent = 'Lagrer …';
    const { error } = await client().from('artist_pages').upsert(row, { onConflict: 'user_id' });
    if (error){ bar(); return fail(/duplicate|unique/i.test(error.message) ? 'Den adressen er tatt — velg en annen.' : 'Kunne ikke lagre: ' + error.message); }
    p.slug = slug; p.blocks = blocks.map(b => ({ ...b, ...(b.type === 'links' ? { links: b.links.map(l => ({ ...l })) } : {}) }));
    S.exists = true; S.savedSlug = slug; S.saved = snap();
    toast(p.published ? '✓ Artistsiden er lagret og publisert' : '✓ Lagret som utkast (ikke synlig for andre)');
    changed(true);
  }

  window.mvArtistStudio = { open, reload: () => { S = null; return open(); }, state: () => S };
})();
