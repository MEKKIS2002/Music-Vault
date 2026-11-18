// ════════════════════════════════════════════════════════════════
// Music Vault — Cloudflare Worker «beat-vault» (R2 proxy + AI-hjelpere)
// Deploy: `npx wrangler deploy` fra worker/ (se wrangler.toml)
//
// Bindings / variabler (wrangler.toml + secrets):
//   BUCKET            → R2 bucket «music-vault-audio»
//   ALLOWED_ORIGIN    → https://mekkis2002.github.io
//   SUPABASE_URL      → https://ylvqkfdvijqnecuqznyr.supabase.co
//   SUPABASE_ANON_KEY → den offentlige anon-nøkkelen
//   ANTHROPIC_API_KEY → secret (wrangler secret put ANTHROPIC_API_KEY)
//
// Sikkerhet (2026-11-18):
//   Offentlig:  GET /file/:key  (avspilling + delingslenker)
//               GET /share/:id  (gamle lenker → videresendes til mixtape.html)
//   Innlogget:  PUT /upload, DELETE /delete, POST /move  (+ må eie filen)
//               GET /stats, POST /rhyme, POST /inspire
//   Admin:      GET /list
//   Eierskap: beats.owner_id (lest med brukerens eget token, så RLS gjelder);
//   for filer uten synlig beat-rad brukes customMetadata.owner på R2-objektet.
// ════════════════════════════════════════════════════════════════

const MAX_UPLOAD_BYTES = 300 * 1024 * 1024;   // 300 MB
const SAFE_TYPE = /^(audio|image)\/[a-z0-9.+-]+$/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHARE_PAGE = 'https://mekkis2002.github.io/Music-Vault/mixtape.html?t=';

export default {
  async fetch(request, env) {
    const allowed = env.ALLOWED_ORIGIN || '*';

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders(allowed) });
    }

    const url  = new URL(request.url);
    const path = url.pathname;

    try {
      // ── Offentlig ────────────────────────────────────────────────

      // GET /file/:key — stream with range support
      if (request.method === 'GET' && path.startsWith('/file/')) {
        const key = decodeURIComponent(path.slice('/file/'.length));
        const rangeHeader = request.headers.get('Range');
        const safeHeaders = (ct) => ({
          ...corsHeaders(allowed),
          'Content-Type': SAFE_TYPE.test(ct) ? ct : 'application/octet-stream',
          'Content-Disposition': 'inline',
          'X-Content-Type-Options': 'nosniff',
          'Content-Security-Policy': "default-src 'none'; sandbox",
          'Cache-Control': 'public, max-age=31536000',
          'Accept-Ranges': 'bytes',
        });

        if (rangeHeader) {
          const headObj = await env.BUCKET.head(key);
          if (!headObj) return err('Ikke funnet', 404, allowed);
          const size = headObj.size;
          const match = rangeHeader.match(/bytes=(\d*)-(\d*)/) || [];
          const from = match[1] ? parseInt(match[1]) : 0;
          const to   = match[2] ? Math.min(parseInt(match[2]), size - 1) : size - 1;
          if (from > to) return err('Ugyldig range', 416, allowed);
          const obj = await env.BUCKET.get(key, { range: { offset: from, length: to - from + 1 } });
          if (!obj) return err('Ikke funnet', 404, allowed);
          return new Response(obj.body, {
            status: 206,
            headers: {
              ...safeHeaders(obj.httpMetadata?.contentType || 'audio/mpeg'),
              'Content-Range': `bytes ${from}-${to}/${size}`,
              'Content-Length': String(to - from + 1),
            },
          });
        }

        const obj = await env.BUCKET.get(key);
        if (!obj) return err('Ikke funnet', 404, allowed);
        return new Response(obj.body, {
          headers: {
            ...safeHeaders(obj.httpMetadata?.contentType || 'audio/mpeg'),
            'Content-Length': String(obj.size),
          },
        });
      }

      // GET /share/:id — gamle Worker-lenker → ny delingsside (samme token)
      if (request.method === 'GET' && path.startsWith('/share/')) {
        const id = path.slice('/share/'.length);
        if (!id) return err('Mangler id', 400, allowed);
        return Response.redirect(SHARE_PAGE + encodeURIComponent(id), 302);
      }

      // ── Krever innlogget bruker ──────────────────────────────────
      const user = await requireUser(request, env);
      if (!user) return err('Ikke innlogget', 401, allowed);

      // PUT /upload/:key
      if (request.method === 'PUT' && path.startsWith('/upload/')) {
        const key = cleanKey(decodeURIComponent(path.slice('/upload/'.length)));
        if (!key) return err('Ugyldig key', 400, allowed);
        const len = Number(request.headers.get('Content-Length') || 0);
        if (len > MAX_UPLOAD_BYTES) return err('Filen er for stor', 413, allowed);
        if (!(await mayWrite(env, key, user))) return err('Ingen tilgang til denne filen', 403, allowed);
        const body = await request.arrayBuffer();
        if (body.byteLength > MAX_UPLOAD_BYTES) return err('Filen er for stor', 413, allowed);
        const reqType = request.headers.get('Content-Type') || 'audio/mpeg';
        const contentType = SAFE_TYPE.test(reqType) ? reqType : 'application/octet-stream';
        await env.BUCKET.put(key, body, { httpMetadata: { contentType }, customMetadata: { owner: user.id } });
        return json({ ok: true, url: `${url.origin}/file/${encodeURIComponent(key)}` }, allowed);
      }

      // DELETE /delete/:key
      if (request.method === 'DELETE' && path.startsWith('/delete/')) {
        const key = cleanKey(decodeURIComponent(path.slice('/delete/'.length)));
        if (!key) return err('Ugyldig key', 400, allowed);
        if (!(await mayWrite(env, key, user))) return err('Ingen tilgang til denne filen', 403, allowed);
        await env.BUCKET.delete(key);
        return json({ ok: true }, allowed);
      }

      // POST /move — arkiver / gjenopprett
      if (request.method === 'POST' && path === '/move') {
        const b = await request.json();
        const from = cleanKey(b?.from), to = cleanKey(b?.to);
        if (!from || !to) return err('Mangler/ugyldig from/to', 400, allowed);
        if (!(await mayWrite(env, from, user)) || !(await mayWrite(env, to, user))) {
          return err('Ingen tilgang til denne filen', 403, allowed);
        }
        const src = await env.BUCKET.get(from);
        if (!src) return err('Kildefil ikke funnet', 404, allowed);
        const body = await src.arrayBuffer();
        await env.BUCKET.put(to, body, { httpMetadata: src.httpMetadata, customMetadata: { owner: user.id } });
        await env.BUCKET.delete(from);
        return json({ ok: true, url: `${url.origin}/file/${encodeURIComponent(to)}` }, allowed);
      }

      // GET /stats
      if (request.method === 'GET' && path === '/stats') {
        let totalBytes = 0, activeBytes = 0, archivedBytes = 0, fileCount = 0;
        let cursor = undefined;
        do {
          const list = await env.BUCKET.list({ cursor, limit: 1000 });
          for (const obj of list.objects) {
            totalBytes += obj.size;
            fileCount++;
            if (obj.key.startsWith('archived/')) archivedBytes += obj.size;
            else activeBytes += obj.size;
          }
          cursor = list.truncated ? list.cursor : undefined;
        } while (cursor);
        return json({ totalBytes, activeBytes, archivedBytes, fileCount }, allowed);
      }

      // POST /rhyme — rimbank via Claude API
      if (request.method === 'POST' && path === '/rhyme') {
        const { word } = await request.json();
        if (!word || typeof word !== 'string') return err('Mangler word', 400, allowed);
        const w = word.slice(0, 60);

        const resp = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': env.ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 400,
            messages: [{
              role: 'user',
              content: `Gi meg rimord for det norske ordet "${w}". Svar KUN med JSON: {"perfekte":["ord1","ord2"],"nesten":["ord3","ord4"]}. Perfekte rim = samme slutt-lyd. 6-8 ord per kategori. Bare norske ord.`
            }]
          })
        });

        const data = await resp.json();
        const text = data.content?.[0]?.text || '{}';
        return json({ text }, allowed);
      }

      // POST /inspire — AI-generert inspirasjonslinje basert på sangtekst
      if (request.method === 'POST' && path === '/inspire') {
        const { beatName, lyrics } = await request.json();
        if (!lyrics || typeof lyrics !== 'string') return err('Mangler lyrics', 400, allowed);

        const resp = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': env.ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 150,
            system: `Du er en kreativ norsk hiphop-tekstforfatter kjent for kule punchlines og wordplay. Du skriver på norsk gateslang og hiphop-stil.`,
            messages: [{
              role: 'user',
              content: `Her er teksten fra sangen "${String(beatName || 'ukjent').slice(0, 100)}":\n\n${lyrics.slice(0, 800)}\n\nBaser deg på viben, temaene og stilen i denne teksten. Skriv 1-2 HELT NYE linjer med en kul punchline, wordplay eller dobbeltmening. Fang stemningen men skriv noe originalt. Svar med BARE linjene — ingen forklaring, ingen hermetegn, ingen tittel.`
            }]
          })
        });

        const data = await resp.json();
        const text = (data.content?.[0]?.text || '').trim();
        if (!text) return err('Tom respons fra Claude', 500, allowed);
        return json({ text }, allowed);
      }

      // GET /list — alle R2-nøkler (gjenoppretting) — kun admin
      if (request.method === 'GET' && path === '/list') {
        if (!(await isAdmin(env, user))) return err('Kun admin', 403, allowed);
        const keys = [];
        let cursor = undefined;
        do {
          const list = await env.BUCKET.list({ cursor, limit: 1000 });
          for (const obj of list.objects) {
            keys.push({ key: obj.key, size: obj.size, uploaded: obj.uploaded });
          }
          cursor = list.truncated ? list.cursor : undefined;
        } while (cursor);
        return json({ keys }, allowed);
      }

      return err('Ukjent endepunkt', 404, allowed);
    } catch (e) {
      console.error(e);
      return err('Serverfeil', 500, allowed);
    }
  },
};

// ── Hjelpere ───────────────────────────────────────────────────────

function sbUrl(env) { return env.SUPABASE_URL || 'https://ylvqkfdvijqnecuqznyr.supabase.co'; }

// Returnerer { id, auth } hvis Authorization-headeren har et gyldig Supabase-token.
async function requireUser(request, env) {
  const auth = request.headers.get('Authorization') || '';
  if (!auth.startsWith('Bearer ')) return null;
  const r = await fetch(`${sbUrl(env)}/auth/v1/user`, {
    headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: auth },
  });
  if (!r.ok) return null;
  const u = await r.json();
  return u?.id && UUID.test(u.id) ? { id: u.id, auth } : null;
}

// Spørring mot Supabase som brukeren selv (RLS gjelder).
async function sbAsUser(env, user, pathAndQuery) {
  const r = await fetch(`${sbUrl(env)}/rest/v1/${pathAndQuery}`, {
    headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: user.auth },
  });
  return r.ok ? r.json() : null;
}

async function isAdmin(env, user) {
  const rows = await sbAsUser(env, user, `profiles?select=role&id=eq.${user.id}`);
  return rows?.[0]?.role === 'admin';
}

// Godtar bare kjente navnerom: active/{id}, archived/{id}, raw/{id}/{fil}
function cleanKey(key) {
  if (typeof key !== 'string' || key.length > 300) return null;
  if (key.includes('..')) return null;
  return /^(active|archived|raw)\/[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)?$/.test(key) ? key : null;
}

// Kan brukeren skrive til nøkkelen?
//  1) Ser brukeren beat-raden (RLS)? Da avgjør beats.owner_id.
//  2) Ellers (ny beat, ikke synket ennå / ikke synlig): bare hvis filen ikke finnes,
//     eller hvis R2-objektet er merket med brukeren som eier.
async function mayWrite(env, key, user) {
  const beatId = key.split('/')[1];
  if (!beatId) return false;
  const rows = await sbAsUser(env, user, `beats?select=owner_id&id=eq.${encodeURIComponent(beatId)}`);
  if (rows === null) return false;            // Supabase-feil → nekt
  if (rows.length) return rows[0].owner_id === user.id;
  const head = await env.BUCKET.head(key);
  if (!head) return true;
  return head.customMetadata?.owner === user.id;
}

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, PUT, DELETE, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Range, Authorization',
    'Access-Control-Expose-Headers': 'Content-Range, Content-Length',
    'Vary': 'Origin',
  };
}
function json(data, origin) {
  return new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
  });
}
function err(msg, status, origin) {
  return new Response(JSON.stringify({ error: msg }), {
    status, headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
  });
}
