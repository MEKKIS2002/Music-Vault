// ════════════════════════════════════════════════════════════════════════════
// artist-render.js — tegner den offentlige artistsiden. Brukes av artist.html
// og av forhåndsvisningen i fanen «Artistside», så de alltid ser like ut.
//
//   mvArtistRender.html(page)        → HTML-streng (innhold i .ap-page)
//   mvArtistRender.bind(root, page)  → kobler avspilling
//   mvArtistRender.defaultBlocks(p)  → seksjoner fra eldre felt (bio/featured/links/contact)
//
// page.blocks: [{ id, type: bio|tracks|gallery|text|links|contact, hidden, title, text, tokens[], images[], links[] }]
// page.tracks: { <song_share-token>: { title, cover, artist, audio_url, bpm } }
// ════════════════════════════════════════════════════════════════════════════
(function(){
  'use strict';
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const url = u => /^https:\/\//i.test(u || '') ? u : '';
  const img = u => url(u) || (/^data:image\//.test(u || '') ? u : '');
  const TITLES = { bio: 'Om', tracks: 'Låter', gallery: 'Bilder', text: '', links: 'Lenker', contact: 'Kontakt' };

  function defaultBlocks(p){
    const b = [];
    b.push({ id: 'bio', type: 'bio', text: p.bio || '' });
    b.push({ id: 'tracks', type: 'tracks', tokens: Array.isArray(p.featured) ? p.featured : [] });
    if ((p.links || []).length) b.push({ id: 'links', type: 'links', links: p.links });
    if (p.contact) b.push({ id: 'contact', type: 'contact', text: p.contact });
    return b;
  }

  function block(b, page){
    const title = b.title != null && b.title !== '' ? b.title : TITLES[b.type];
    const head = title ? `<h2 class="ap-section-title">${esc(title)}</h2>` : '';
    switch (b.type){
      case 'bio': return b.text ? `<section class="ap-section">${head}<p class="ap-prose is-lead">${esc(b.text)}</p></section>` : '';
      case 'text': return (b.text || b.title) ? `<section class="ap-section">${head}<p class="ap-prose">${esc(b.text)}</p></section>` : '';
      case 'tracks': {
        const list = (b.tokens || []).map(t => ({ t, d: (page.tracks || {})[t] })).filter(x => x.d && url(x.d.audio_url));
        if (!list.length) return '';
        return `<section class="ap-section">${head}<div class="ap-tracks">${list.map(({ t, d }) => {
          const c = img(d.cover);
          return `<div class="ap-track" data-token="${esc(t)}">${c ? `<img src="${esc(c)}" alt="">` : '<span class="ap-ph" aria-hidden="true"></span>'}
            <div class="ap-meta"><div class="ap-t">${esc(d.title || 'Uten tittel')}</div><div class="ap-s">${esc([d.artist, d.bpm ? d.bpm + ' BPM' : ''].filter(Boolean).join(' · '))}</div></div>
            <button class="ap-play" data-token="${esc(t)}" aria-label="Spill ${esc(d.title || '')}">▶</button></div>`;
        }).join('')}</div></section>`;
      }
      case 'gallery': {
        const ims = (b.images || []).map(img).filter(Boolean);
        return ims.length ? `<section class="ap-section">${head}<div class="ap-gallery">${ims.map(s => `<img src="${esc(s)}" alt="" loading="lazy">`).join('')}</div></section>` : '';
      }
      case 'links': {
        const ls = (b.links || []).filter(l => l && /^https?:\/\//i.test(l.url || ''));
        return ls.length ? `<section class="ap-section">${head}<div class="ap-links">${ls.map(l => `<a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label || l.url.replace(/^https?:\/\/(www\.)?/, ''))}</a>`).join('')}</div></section>` : '';
      }
      case 'contact': return b.text ? `<section class="ap-section ap-contact">${head}${/@/.test(b.text) && !/\s/.test(b.text.trim()) ? `<a href="mailto:${esc(b.text.trim())}">${esc(b.text.trim())}</a>` : `<p class="ap-prose">${esc(b.text)}</p>`}</section>` : '';
      default: return '';
    }
  }

  function html(page){
    const p = page || {};
    const blocks = (Array.isArray(p.blocks) && p.blocks.length ? p.blocks : defaultBlocks(p)).filter(b => !b.hidden);
    const banner = img(p.banner_url), photo = img(p.photo_url), name = p.display_name || p.slug || 'Artist';
    return `
      <div class="ap-banner${banner ? '' : ' is-empty'}" ${banner ? `style="background-image:url('${esc(banner)}')"` : ''}></div>
      <div class="ap-inner">
        <header class="ap-head">
          ${photo ? `<img class="ap-avatar" src="${esc(photo)}" alt="">` : `<div class="ap-avatar is-empty" aria-hidden="true">${esc(name.slice(0, 1).toUpperCase())}</div>`}
          <div><div class="ap-kicker">Artist</div><h1 class="ap-name">${esc(name)}</h1></div>
        </header>
        ${blocks.map(b => block(b, p)).join('')}
        <footer class="ap-foot">Laget med <a href="./">Music Vault</a></footer>
      </div>`;
  }

  // Avspilling: ett lydelement, knappene bytter mellom ▶ og ❚❚.
  function bind(root, page){
    let audio = root.querySelector('audio.ap-audio');
    if (!audio){ audio = document.createElement('audio'); audio.className = 'ap-audio'; audio.preload = 'none'; root.appendChild(audio); }
    let current = null;
    const icons = () => root.querySelectorAll('.ap-play').forEach(b => {
      const on = b.dataset.token === current && !audio.paused;
      b.textContent = on ? '❚❚' : '▶';
      b.closest('.ap-track')?.classList.toggle('is-playing', b.dataset.token === current);
    });
    root.addEventListener('click', e => {
      const b = e.target.closest && e.target.closest('.ap-play'); if (!b) return;
      const t = b.dataset.token, d = (root._apPage || page).tracks?.[t]; if (!d) return;
      if (current === t && !audio.paused){ audio.pause(); return; }
      if (current !== t){ audio.src = d.audio_url; current = t; }
      audio.play().catch(() => {});
    });
    ['play', 'pause', 'ended'].forEach(ev => audio.addEventListener(ev, icons));
  }

  // Profilens aksent + lesbar farge oppå den (mørk tekst på lyse aksenter, lys på mørke).
  function applyAccent(el, hex){
    const h = /^#[0-9a-f]{6}$/i.test(hex || '') ? hex : '#d68155';
    const [r, g, b] = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(c => c <= .03928 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4);
    el.style.setProperty('--ap-accent', h);
    el.style.setProperty('--ap-on-accent', (.2126 * r + .7152 * g + .0722 * b) > .22 ? '#14120f' : '#fff8ef');
  }

  window.mvArtistRender = { html, bind, defaultBlocks, applyAccent, TITLES };
})();
