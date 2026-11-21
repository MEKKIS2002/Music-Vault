// ════════════════════════════════════════════════════════════════════════════
// cover-viewer.js — trykk på albumcoveret → stort cover i HD.
//
// - Coveret flyr opp fra der det står (FLIP) og vinylen glir ut bak det.
// - Musen/fingeren vipper coveret og platen litt i 3D, med et lysskjær som følger.
// - Trykk hvor som helst (eller Esc) → lukkes og flyr tilbake.
// - HD: album.cover_hd (2048 px i R2, lastes opp sammen med nye cover i db.js).
//   Mangler den, vises den vanlige 600 px-versjonen.
// - «Reduser bevegelse» respekteres: ingen vipping og ingen flyve-animasjon.
// Utløses av [data-cover-viewer] i albumheaderen (js/app.js).
// ════════════════════════════════════════════════════════════════════════════
(function(){
  'use strict';

  const MAX_TILT = 9;                                  // grader
  const reduced = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  let open = null;                                     // { root, source, onKey }

  function currentAlbum(){
    const st = window.state || (typeof state !== 'undefined' ? state : null);
    const id = typeof currentAlbumId !== 'undefined' ? currentAlbumId : null;
    return st && id ? (st.albums || []).find(a => a.id === id) : null;
  }

  function show(source, viaKeyboard){
    if (open) return;
    const album = currentAlbum();
    if (!album || !album.cover) return;

    const root = document.createElement('div');
    root.className = 'mv-cover-viewer';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', 'Albumcover: ' + (album.name || album.title || ''));
    root.tabIndex = -1;
    root.innerHTML = `
      <div class="mv-cv-stage">
        <div class="mv-cv-tilt">
          <div class="mv-cv-disc" aria-hidden="true">
            <div class="mv-cv-disc-label" style="background-image:url('${esc(album.cover)}')"></div>
          </div>
          <div class="mv-cv-sleeve">
            <img src="${esc(album.cover)}" alt="${esc(album.name || '')}" draggable="false">
            <div class="mv-cv-glare" aria-hidden="true"></div>
          </div>
        </div>
      </div>
      <div class="mv-cv-hint">Trykk for å lukke</div>`;
    document.body.appendChild(root);
    document.documentElement.classList.add('mv-cv-lock');

    // HD i bakgrunnen: vis 600 px med en gang, bytt når HD-filen er lastet.
    const img = root.querySelector('.mv-cv-sleeve img');
    // Bare hvis HD-filen hører til coveret som står der nå (se mvCoverFingerprint i db.js).
    const fp = window.mvCoverFingerprint;
    const hdMatches = album.cover_hd && (!fp || !album.cover_hd_for || album.cover_hd_for === fp(album.cover));
    if (hdMatches && album.cover_hd !== album.cover) {
      const hd = new Image();
      hd.onload = () => { img.src = hd.src; root.classList.add('is-hd'); };
      hd.src = album.cover_hd;
    }

    const tilt = root.querySelector('.mv-cv-tilt');
    const sleeve = root.querySelector('.mv-cv-sleeve');

    // ── Vipping etter musen ────────────────────────────────────────────────
    if (!reduced()) {
      root.addEventListener('pointermove', e => {
        const r = sleeve.getBoundingClientRect();
        const x = Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / (r.width / 2)));
        const y = Math.max(-1, Math.min(1, (e.clientY - (r.top + r.height / 2)) / (r.height / 2)));
        tilt.style.setProperty('--ry', (x * MAX_TILT).toFixed(2) + 'deg');
        tilt.style.setProperty('--rx', (-y * MAX_TILT).toFixed(2) + 'deg');
        tilt.style.setProperty('--gx', (50 + x * 40).toFixed(1) + '%');
        tilt.style.setProperty('--gy', (50 + y * 40).toFixed(1) + '%');
        tilt.classList.add('is-tilting');
      });
      root.addEventListener('pointerleave', () => {
        tilt.style.setProperty('--rx', '0deg'); tilt.style.setProperty('--ry', '0deg');
        tilt.classList.remove('is-tilting');
      });
    }

    // ── Lukk: trykk hvor som helst eller Esc ───────────────────────────────
    root.addEventListener('click', close);
    const onKey = e => {
      if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); close(); }
      else if (e.key === 'Tab') { e.preventDefault(); }   // fokus blir i dialogen
    };
    document.addEventListener('keydown', onKey, true);
    open = { root, source, onKey, viaKeyboard: !!viaKeyboard };
    root.focus({ preventScroll: true });

    // ── Fly opp fra coveret i headeren (FLIP) ──────────────────────────────
    requestAnimationFrame(() => {
      root.classList.add('is-open');
      flip(tilt, source, false);
    });
  }

  // Animer cover + plate SAMMEN (hele .mv-cv-tilt) mellom kilde-rektangelet i
  // headeren og plassen i visningen. Før fløy bare coveret, så platen ble stående
  // stor midt på skjermen ved lukking.
  // Åpning: fill 'none' — etterpå tar CSS over igjen, så vippingen virker.
  // Lukking: fill 'forwards' — står i mål til visningen fjernes (ingen hopp).
  function flip(el, source, reverse){
    if (reduced() || !source || !el.animate) return Promise.resolve();
    const a = source.getBoundingClientRect(), b = el.getBoundingClientRect();
    if (!a.width || !b.width) return Promise.resolve();
    const atSource = `translate(${(a.left + a.width / 2) - (b.left + b.width / 2)}px, ${(a.top + a.height / 2) - (b.top + b.height / 2)}px) scale(${a.width / b.width})`;
    const frames = reverse ? [{ transform: 'none' }, { transform: atSource }] : [{ transform: atSource }, { transform: 'none' }];
    const anim = el.animate(frames, {
      duration: reverse ? 380 : 440,
      easing: reverse ? 'cubic-bezier(.45,0,.2,1)' : 'cubic-bezier(.22,1,.36,1)',   // myk inn og ut / ease-out-quint
      fill: reverse ? 'forwards' : 'none',
    });
    return anim.finished.catch(() => {});
  }

  function close(){
    if (!open) return;
    const { root, onKey, viaKeyboard } = open; let { source } = open;
    open = null;
    document.removeEventListener('keydown', onKey, true);
    root.classList.remove('is-open');
    root.classList.add('is-closing');
    const sleeve = root.querySelector('.mv-cv-sleeve');
    const tilt = root.querySelector('.mv-cv-tilt');
    tilt.style.setProperty('--rx', '0deg'); tilt.style.setProperty('--ry', '0deg');
    // Headeren kan ha blitt tegnet på nytt mens visningen var åpen — bruk da det nye kortet.
    if (!source || !source.isConnected) source = document.querySelector('[data-cover-viewer]');
    const sourceVisible = source && source.isConnected && source.getBoundingClientRect().width > 0;
    let finished = false;
    const done = () => {
      if (finished) return; finished = true;
      root.remove();
      document.documentElement.classList.remove('mv-cv-lock');
      // Fokus tilbake bare ved tastatur — med mus ga det en fokusring (boks) rundt coveret.
      if (sourceVisible && viaKeyboard) source.focus({ preventScroll: true });
    };
    // Platen glir inn bak coveret (CSS .is-closing) mens begge flyr tilbake,
    // og bakgrunnen tones ut i samme tempo. Fjern først når alt har landet.
    void sleeve;
    flip(tilt, sourceVisible ? source : null, true).then(() => {
      if (!sourceVisible){ root.classList.add('is-gone'); setTimeout(done, 220); } else done();
    });
    setTimeout(done, 900);                               // sikkerhetsnett
  }

  // ── Åpne fra albumheaderen (delegert, overlever re-render) ────────────────
  document.addEventListener('click', e => {
    const card = e.target.closest && e.target.closest('[data-cover-viewer]');
    if (!card) return;
    e.preventDefault(); e.stopPropagation();
    show(card, false);
  });
  document.addEventListener('keydown', e => {
    if (open || (e.key !== 'Enter' && e.key !== ' ')) return;
    const card = e.target.closest && e.target.closest('[data-cover-viewer]');
    if (!card) return;
    e.preventDefault();
    show(card, true);
  });

  window.mvCoverViewer = { show, close };
})();
