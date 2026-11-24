// ════════════════════════════════════════════════════════════════════════════
// i18n.js — språkbytte (norsk ⇄ engelsk) for hele nettsiden.
//
// Appen er skrevet på norsk. Når engelsk er valgt, oversetter dette laget all
// STANDARDTEKST på siden — tekstnoder, placeholder/title/aria-label/alt,
// dokumenttittel og confirm/alert/prompt — også innhold som tegnes senere
// (MutationObserver). Ordboken ligger i js/i18n-en.js.
//
// Ordboken har tre slags oppføringer:
//   add({ 'norsk tekst': 'English text' })                 — hele tekstnoden
//   pat([['{0} låter', n => …], ['Lagt i «{0}»', 'Added to “{0}”']]) — med variabler
//   prefix({ 'Kunne ikke lagre: ': 'Couldn’t save: ' })     — tekst som starter slik
//
// Brukerens egne tekster oversettes aldri: felt (input/textarea), redigerbart
// innhold og alt innenfor [data-no-i18n] hoppes over, og ellers oversettes en
// tekst bare når den er nøyaktig lik (eller følger mønsteret til) en standardtekst.
//
// Valget lagres lokalt (mv_lang) og på kontoen (user_settings.lang).
// Offentlige sider (deling/mixtape/artist) uten valg følger nettleserens språk.
// ════════════════════════════════════════════════════════════════════════════
(function(){
  'use strict';
  const KEY = 'mv_lang';
  const read = () => { try { return localStorage.getItem(KEY); } catch(e){ return null; } };
  const write = v => { try { localStorage.setItem(KEY, v); } catch(e){} };
  const isPublicPage = /(share|mixtape|artist)\.html$/i.test(location.pathname);
  const browserEn = () => !/^(nb|nn|no)\b/i.test(navigator.language || 'no');
  let lang = read() || (isPublicPage && browserEn() ? 'en' : 'no');
  if (lang !== 'en') lang = 'no';

  // ── Ordbok ───────────────────────────────────────────────────────────────
  const norm = s => String(s).replace(/\s+/g, ' ').trim();
  const dict = new Map(), pats = [], prefixes = [];
  const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  function add(obj){ for (const k in obj) dict.set(norm(k), obj[k]); }
  function pat(list){
    for (const [src, en] of list){
      // {0} = hva som helst (også tomt), {#0} = bare et tall
      const parts = norm(src).split(/\{(#?\d+)\}/);
      let re = '^', lit = '';
      parts.forEach((p, i) => { if (i % 2) re += p[0] === '#' ? '(\\d[\\d\\s.,]*)' : '(.*?)'; else { re += escRe(p); if (p.trim().length > lit.length) lit = p.trim(); } });
      pats.push({ re: new RegExp(re + '$'), lit, en, spec: norm(src).replace(/\{#?\d+\}/g, '').length });
    }
    pats.sort((a, b) => b.spec - a.spec);   // mest presise mønster først
  }
  function prefix(obj){ for (const k in obj) prefixes.push([norm(k), obj[k]]); prefixes.sort((a, b) => b[0].length - a[0].length); }

  const inner = x => tr(x);   // variabler kan selv være standardtekst («3 demoer», «Ferdig»)
  function tr(s){
    if (lang !== 'en' || s == null) return s;
    const str = String(s), n = norm(str);
    if (!n || !/[A-Za-zÆØÅæøå]/.test(n)) return s;
    let out = dict.get(n);
    if (out == null){
      for (const p of pats){
        if (p.lit && !n.includes(p.lit)) continue;
        const m = p.re.exec(n);
        if (m){ out = typeof p.en === 'function' ? p.en(...m.slice(1)) : p.en.replace(/\{(\d+)\}/g, (_, i) => inner(m[+i + 1] ?? '')); break; }
      }
    }
    if (out == null){
      // nøkkel og verdi skrives uten avsluttende mellomrom; resten beholder sitt eget
      for (const [k, v] of prefixes){ if (n.startsWith(k)){ out = v + n.slice(k.length); break; } }
    }
    if (out == null || out === n) return s;
    const lead = str.match(/^\s*/)[0], trail = str.match(/\s*$/)[0];
    return lead + out + trail;
  }

  // ── DOM ──────────────────────────────────────────────────────────────────
  const ATTRS = ['placeholder', 'title', 'aria-label', 'alt', 'data-tip', 'data-ph', 'data-placeholder'];
  const SKIP_SEL = 'script,style,textarea,code,pre,[contenteditable=""],[contenteditable="true"],[data-no-i18n]';
  const orig = new WeakMap();          // tekstnode → original norsk tekst
  const last = new WeakMap();          // tekstnode → det vi satte sist
  const origAttr = new WeakMap();      // element → { attr: original, _attr: oversatt }
  const skipped = el => !!(el && el.closest && el.closest(SKIP_SEL));
  // Attributter på tekstfelt (placeholder o.l.) er standardtekst og oversettes; bare redigerbart innhold og [data-no-i18n] hoppes over
  const ATTR_SKIP = '[contenteditable=""],[contenteditable="true"],[data-no-i18n],script,style';
  // Selve redigerbare element (f.eks. Lyric Lab-seksjonen) kan ha oversettbar data-placeholder; elementer INNI redigerbart innhold aldri
  const skippedAttr = el => !!(el && el.closest && (el.closest('[data-no-i18n],script,style') || (el.parentElement && el.parentElement.closest(SKIP_SEL))));

  function doText(node){
    if (last.get(node) === node.data) return;                     // vår egen endring
    const parent = node.parentElement; if (!parent || skipped(parent)) return;
    const src = node.data, out = tr(src);
    if (out !== src){ orig.set(node, src); last.set(node, out); node.data = out; }
  }
  function doAttrs(el){
    if (skippedAttr(el)) return;
    let o = origAttr.get(el);
    for (const a of ATTRS){
      if (!el.hasAttribute(a)) continue;
      const v = el.getAttribute(a);
      if (o && o['_' + a] === v) continue;                          // vår egen endring
      const out = tr(v);
      if (out !== v){ o = o || {}; o[a] = v; o['_' + a] = out; origAttr.set(el, o); el.setAttribute(a, out); }
    }
    if (el.tagName === 'INPUT' && /^(button|submit|reset)$/i.test(el.type) && el.value){ const out = tr(el.value); if (out !== el.value) el.value = out; }
  }
  function walk(root){
    if (!root) return;
    if (root.nodeType === 3){ doText(root); return; }
    if (root.nodeType !== 1 && root.nodeType !== 9 && root.nodeType !== 11) return;
    if (root.nodeType === 1){ if (root.matches('textarea,[contenteditable]')) doAttrs(root); if (skipped(root)) return; doAttrs(root); }
    const tw = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode: n => { if (n.nodeType === 1 && n.matches(SKIP_SEL)){ if (n.matches('textarea,[contenteditable]')) doAttrs(n); return NodeFilter.FILTER_REJECT; } return NodeFilter.FILTER_ACCEPT; }
    });
    let n; while ((n = tw.nextNode())){ if (n.nodeType === 3) doText(n); else doAttrs(n); }
  }
  function title(){ const t = tr(document.title); if (t !== document.title) document.title = t; }

  let mo = null;
  function startObserver(){
    if (mo || !document.documentElement) return;
    mo = new MutationObserver(list => {
      if (lang !== 'en') return;
      for (const m of list){
        if (m.type === 'childList') m.addedNodes.forEach(walk);
        else if (m.type === 'characterData') doText(m.target);
        else if (m.type === 'attributes') doAttrs(m.target);
      }
      title();
    });
    mo.observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  }
  function restoreAll(){
    const tw = document.createTreeWalker(document.documentElement, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    let n; while ((n = tw.nextNode())){
      if (n.nodeType === 3){ const o = orig.get(n); if (o != null && last.get(n) === n.data){ n.data = o; orig.delete(n); last.delete(n); } }
      else { const o = origAttr.get(n); if (o){ ATTRS.forEach(a => { if (a in o && n.getAttribute(a) === o['_' + a]) n.setAttribute(a, o[a]); }); origAttr.delete(n); } }
    }
    if (window.__mvTitleNo) document.title = window.__mvTitleNo;
  }

  // ── Dialoger og datoer ───────────────────────────────────────────────────
  ['alert', 'confirm', 'prompt'].forEach(fn => {
    const native = window[fn] && window[fn].bind(window); if (!native) return;
    window[fn] = (msg, ...rest) => native(lang === 'en' && typeof msg === 'string' ? msg.split('\n').map(l => tr(l)).join('\n') : msg, ...rest);
  });
  const NO_LOC = /^(no|nb|nn)(-NO)?$/i;
  const loc = l => lang === 'en' && (l == null || (typeof l === 'string' && NO_LOC.test(l))) ? 'en-GB' : l;
  ['toLocaleDateString', 'toLocaleTimeString', 'toLocaleString'].forEach(fn => {
    const native = Date.prototype[fn];
    Date.prototype[fn] = function(l, o){ return native.call(this, loc(l), o); };
  });

  // ── Språkvalg ────────────────────────────────────────────────────────────
  function applyLang(){
    document.documentElement.lang = lang === 'en' ? 'en' : 'no';
    if (lang === 'en'){ startObserver(); walk(document.body || document.documentElement); title(); }
    else restoreAll();
  }
  function setLang(l, opts){
    l = l === 'en' ? 'en' : 'no';
    if (l === lang) return;
    lang = l; write(l); applyLang();
    if (!(opts && opts.fromAccount)) saveToAccount();
    try { window.mvTheme && window.mvTheme.renderControls && window.mvTheme.renderControls(); } catch(e){}
    try { document.dispatchEvent(new CustomEvent('mv:lang', { detail: { lang } })); } catch(e){}
  }

  let saveTimer = null;
  function saveToAccount(){
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      const c = window.supabaseClient; if (!c || isPublicPage) return;
      const id = (await c.auth.getSession()).data?.session?.user?.id; if (!id) return;
      const { error } = await c.from('user_settings').upsert({ user_id: id, lang, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
      if (error) console.warn('[Språk] Kunne ikke lagre på kontoen:', error.message);
    }, 300);
  }
  let synced = false;
  async function syncFromAccount(){
    const c = window.supabaseClient; if (synced || !c) return;
    const id = (await c.auth.getSession()).data?.session?.user?.id; if (!id) return;
    synced = true;
    const { data, error } = await c.from('user_settings').select('lang').eq('user_id', id).maybeSingle();
    if (error){ synced = false; return; }
    if (!data || !data.lang){ if (read()) saveToAccount(); return; }
    if (!read()) { setLang(data.lang, { fromAccount: true }); return; }  // ny enhet: kontoen bestemmer
    if (data.lang !== lang) setLang(data.lang, { fromAccount: true });
  }

  window.mvI18n = {
    t: tr, add, pat, prefix, setLang, syncFromAccount,
    get lang(){ return lang; },
    // Utviklerhjelp: synlig tekst som fortsatt ser norsk ut med engelsk valgt
    missing(){
      const out = new Set(), tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let n; while ((n = tw.nextNode())){
        const p = n.parentElement; if (!p || skipped(p) || !p.getClientRects().length) continue;
        const t = norm(n.data);
        if (t && /[æøå]|\b(og|ikke|på|til|med|eller|låt|låter|sang|sanger|lagre|slett|legg|vis|ingen|alle|ny|nytt|siste|spill|velg|åpne|lukk|ferdig|laster|mangler|uten)\b/i.test(t)) out.add(t);
      }
      return [...out];
    }
  };
  document.addEventListener('DOMContentLoaded', () => { window.__mvTitleNo = document.title; });
  if (lang === 'en') document.documentElement.lang = 'en';
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', applyLang); else applyLang();
})();
