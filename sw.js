// sw.js — gjør at Music Vault åpner uten nett.
//
// - Sidene (navigasjon): nett først, mellomlagret kopi hvis du er offline.
//   Da får du alltid nyeste versjon når du er på nett.
// - Egne filer (css/js/bilder) og biblioteker/fonter fra CDN: vises fra lageret
//   med en gang og oppdateres i bakgrunnen. Filene har versjon i adressen
//   (?v=…), så en ny utgivelse gir nye adresser og blir aldri stående gammel.
// - Supabase, R2 og Cloudflare-workeren røres IKKE (data og lyd går som før;
//   lyd for offline ligger i appens egen audioDB).
const SHELL = 'mv-shell-v1';
const CDN = /^https:\/\/(cdn\.jsdelivr\.net|fonts\.googleapis\.com|fonts\.gstatic\.com)\//;
const MAX_ENTRIES = 250;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(['./', './index.html', './manifest.json']).catch(() => {})).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('mv-shell-') && k !== SHELL).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

async function trim(cache){
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - MAX_ENTRIES; i++) await cache.delete(keys[i]);
}
async function networkFirst(req){
  const cache = await caches.open(SHELL);
  try{
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  }catch(e){
    return (await cache.match(req, { ignoreSearch: true })) || (await cache.match('./index.html')) || Response.error();
  }
}
async function staleWhileRevalidate(req, event){
  const cache = await caches.open(SHELL);
  const hit = await cache.match(req);
  const update = fetch(req).then(res => {
    if (res.ok || res.type === 'opaque'){ cache.put(req, res.clone()).then(() => trim(cache)); }
    return res;
  }).catch(() => null);
  if (hit){ event.waitUntil(update); return hit; }
  return (await update) || Response.error();
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (req.mode === 'navigate' && url.origin === location.origin){ e.respondWith(networkFirst(req)); return; }
  if (url.origin === location.origin){
    if (req.headers.has('range')) return;                     // lyd/video med spoling: la nettleseren ta seg av det
    e.respondWith(staleWhileRevalidate(req, e)); return;
  }
  if (CDN.test(req.url)){ e.respondWith(staleWhileRevalidate(req, e)); return; }
  // Alt annet (Supabase, R2, workers.dev …) går rett til nettet
});
