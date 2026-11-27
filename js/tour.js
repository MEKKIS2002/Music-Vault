// tour.js — kort «Kom i gang»-veiledning (som i NOVOOI Romplanlegger) og små «?»-forklaringer.
//
// Veiledningen lyser opp én knapp om gangen og sier nøyaktig hva du skal trykke på.
// Den starter av seg selv første gang du er innlogget, og kan startes igjen fra
// tannhjulmenyen («Kom i gang»). «?»-knappene (mvHelp) forklarer ett begrep med en
// eller to setninger der det trengs (Pipeline, Lyric Lab, albumets steg).
(function () {
  'use strict';
  const SEEN = 'mv-tour-v1';
  const mobile = () => matchMedia('(max-width: 768px)').matches;
  const visible = el => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
  const first = sels => sels.map(s => document.querySelector(s)).find(visible) || null;

  // Hvert steg: tittel, kort tekst, og hva som lyses opp (desktop / mobil)
  const STEPS = [
    { title: 'Last opp en låt', body: 'Trykk her og velg en lydfil. Låten havner i Beats.',
      target: () => first(['.dash-quick .dq-btn.accent', '#mvMobFab', '.beats-upload-btn']) },
    { title: 'Skriv tekst', body: 'Åpne Lyric Lab, velg låten og skriv teksten i seksjonene.',
      target: () => first(mobile() ? ['.mv-mob-btn[data-mob-tab="lyriclab"]'] : ['.mv-tabs .tab-btn[data-tab="lyriclab"]']) },
    { title: 'Lag et album', body: 'Samle låtene dine i et album her.',
      target: () => first(mobile() ? ['.mv-mob-btn[data-mob-tab="albums"]'] : ['.mv-tabs .tab-btn[data-tab="albums"]']) },
    { title: 'Følg med mot release', body: 'I Pipeline ser du hvor langt albumet er kommet, og hvilke låter som ikke er ferdige.',
      mobileBody: 'Under Meny finner du Pipeline. Der ser du hvor langt albumet er kommet, og hvilke låter som ikke er ferdige.',
      target: () => first(mobile() ? ['#mvMobMenuBtn'] : ['.mv-tabs .tab-btn[data-tab="pipeline"]']) },
    { title: 'Trenger du hjelp?', body: 'Trykk på ? der den står for en kort forklaring. Denne veiledningen finner du under Innstillinger → Kom i gang.',
      target: () => first(['#mvGearBtn']) },
  ];

  let root = null, step = 0, frame = 0, lastFocus = null;

  function goHome() {
    const t = document.querySelector('.tab-btn[data-tab="hjem"]');
    if (t && !t.classList.contains('active')) t.click();
  }

  function place() {
    if (!root) return;
    const s = STEPS[step], el = s.target(), spot = root.querySelector('.mv-tour-spot'), card = root.querySelector('.mv-tour-card');
    if (!spot || !card) return;
    const vw = innerWidth, vh = innerHeight, edge = 16, gap = 16;
    const cw = Math.min(320, vw - edge * 2);
    card.style.width = cw + 'px';
    const ch = card.offsetHeight;
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    if (!el) { spot.style.display = 'none'; card.style.left = (vw - cw) / 2 + 'px'; card.style.top = Math.max(edge, (vh - ch) / 2) + 'px'; return; }
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const r = el.getBoundingClientRect(), pad = 6;
    Object.assign(spot.style, { display: 'block', left: r.left - pad + 'px', top: r.top - pad + 'px', width: r.width + pad * 2 + 'px', height: r.height + pad * 2 + 'px' });
    const options = [
      { left: r.right + gap, top: clamp(r.top, edge, vh - ch - edge) },          // høyre
      { left: clamp(r.left, edge, vw - cw - edge), top: r.bottom + gap },       // under
      { left: clamp(r.left, edge, vw - cw - edge), top: r.top - gap - ch },     // over
      { left: r.left - gap - cw, top: clamp(r.top, edge, vh - ch - edge) },     // venstre
    ];
    const fits = p => p.left >= edge && p.top >= edge && p.left + cw <= vw - edge && p.top + ch <= vh - edge;
    const p = options.find(fits) || { left: clamp((vw - cw) / 2, edge, vw - cw - edge), top: edge };
    card.style.left = p.left + 'px'; card.style.top = p.top + 'px';
  }

  function render() {
    if (!root) return;
    const s = STEPS[step], last = step === STEPS.length - 1;
    const body = mobile() && s.mobileBody ? s.mobileBody : s.body;
    root.innerHTML = `<div class="mv-tour-spot" aria-hidden="true"></div>
      <section class="mv-tour-card" role="dialog" aria-modal="false" aria-labelledby="mvTourTitle" aria-describedby="mvTourBody">
        <div class="mv-tour-head"><span class="mv-tour-count">${step + 1} av ${STEPS.length}</span><button type="button" class="mv-tour-x" data-tour="close" aria-label="Lukk veiledningen">✕</button></div>
        <div class="mv-tour-progress" aria-hidden="true">${STEPS.map((_, i) => `<i class="${i <= step ? 'on' : ''}"></i>`).join('')}</div>
        <h2 id="mvTourTitle">${s.title}</h2>
        <p id="mvTourBody">${body}</p>
        <div class="mv-tour-nav">
          ${step ? '<button type="button" class="ghost-btn" data-tour="back">Tilbake</button>' : '<button type="button" class="ghost-btn" data-tour="close">Hopp over</button>'}
          <button type="button" class="primary-btn" data-tour="next">${last ? 'Ferdig' : 'Neste'}</button>
        </div>
      </section>`;
    if (window.mvI18n && typeof mvI18n.translate === 'function') { try { mvI18n.translate(root); } catch (e) {} }
    requestAnimationFrame(() => { place(); root?.querySelector('[data-tour="next"]')?.focus(); });
  }

  function close() {
    if (!root) return;
    try { localStorage.setItem(SEEN, '1'); } catch (e) {}
    root.remove(); root = null;
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  function start() {
    document.getElementById('mvGearMenu')?.classList.remove('open');
    if (root) { step = 0; render(); return; }
    lastFocus = document.activeElement;
    goHome();
    step = 0;
    root = document.createElement('div');
    root.id = 'mvTour';
    root.addEventListener('click', e => {
      const a = e.target.closest('[data-tour]')?.dataset.tour; if (!a) return;
      if (a === 'close') close();
      else if (a === 'back') { step = Math.max(0, step - 1); render(); }
      else if (a === 'next') { if (step === STEPS.length - 1) close(); else { step++; render(); } }
    });
    document.body.appendChild(root);
    setTimeout(render, 120);   // la Hjem tegnes først
  }
  window.mvStartTour = start;

  addEventListener('keydown', e => { if (e.key === 'Escape' && root) { e.preventDefault(); close(); } });
  addEventListener('resize', () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(place); });

  // Første gang: start når appen er låst opp (låseskjermen er borte)
  function autoStart() {
    let seen = '1'; try { seen = localStorage.getItem(SEEN); } catch (e) {}
    if (seen) return;
    let tries = 0;
    const t = setInterval(() => {
      const lock = document.getElementById('lockScreen');
      const unlocked = sessionStorage.getItem('mv_unlocked') === '1' && (!lock || getComputedStyle(lock).display === 'none');
      if (unlocked && document.querySelector('.mv-tabs .tab-btn')) { clearInterval(t); setTimeout(start, 900); }
      else if (++tries > 240) clearInterval(t);   // gi opp etter ~2 min
    }, 500);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', autoStart); else autoStart();

  // ── «?»: kort forklaring ved et begrep ────────────────────────────────────
  const HELP = {
    release: ['Klar for release', 'Fremdrift er hvor ferdig en låt er, fra 0 til 100 %. Du setter den selv. Albumet er klart for release når alle låtene er 100 %. Båndet viser snittet.'],
    lyriclab: ['Steg og fremdrift', 'Steg viser hvor låten er: idé, skriving, innspilling, miks, master eller ferdig. Fremdrift er hvor ferdig låten er i prosent, og den setter du selv. Tekst skrevet teller seksjonene som har tekst.'],
    albumstage: ['Albumets steg', 'Steget viser hvor albumet er akkurat nå. Det endrer ikke låtene. Hver låt har sitt eget steg og sin egen fremdrift.'],
  };
  let pop = null;
  function closeHelp() { if (pop) { pop.btn.setAttribute('aria-expanded', 'false'); pop.el.remove(); pop = null; } }
  window.mvHelp = function (btn, key) {
    if (pop && pop.btn === btn) { closeHelp(); return; }
    closeHelp();
    const h = HELP[key]; if (!h) return;
    const el = document.createElement('div');
    el.className = 'mv-help-pop'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', h[0]);
    el.innerHTML = `<b>${h[0]}</b><p>${h[1]}</p>`;
    document.body.appendChild(el);
    if (window.mvI18n && typeof mvI18n.translate === 'function') { try { mvI18n.translate(el); } catch (e) {} }
    const r = btn.getBoundingClientRect(), w = Math.min(280, innerWidth - 24);
    el.style.width = w + 'px';
    el.style.left = Math.max(12, Math.min(innerWidth - w - 12, r.left + r.width / 2 - w / 2)) + 'px';
    const below = r.bottom + 8, ph = el.offsetHeight;
    el.style.top = (below + ph > innerHeight - 12 ? r.top - 8 - ph : below) + 'px';
    btn.setAttribute('aria-expanded', 'true');
    pop = { btn, el };
  };
  window.mvHelpBtn = (key, label) => `<button type="button" class="mv-help-btn" aria-label="${label || 'Forklaring'}" aria-expanded="false" onclick="event.stopPropagation();mvHelp(this,'${key}')">?</button>`;
  document.addEventListener('click', e => { if (pop && !pop.el.contains(e.target) && e.target !== pop.btn) closeHelp(); });
  addEventListener('keydown', e => { if (e.key === 'Escape' && pop) closeHelp(); });
  addEventListener('scroll', closeHelp, true);
})();
