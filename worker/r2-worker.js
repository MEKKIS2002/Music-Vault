// ════════════════════════════════════════════════════════════════
// Music Vault — Cloudflare Worker (R2 proxy)
// Deploy this on workers.cloudflare.com
//
// Bindings / variables in Worker settings:
//   BUCKET            → R2 bucket binding (name it "BUCKET" when binding)
//   ALLOWED_ORIGIN    → your GitHub Pages URL, e.g. https://mekkis2002.github.io
//   SUPABASE_URL      → https://ylvqkfdvijqnecuqznyr.supabase.co
//   SUPABASE_ANON_KEY → the public anon key (same as in the app)
//   SUPABASE_SERVICE_ROLE_KEY → SECRET (Settings → Variables → "Encrypt").
//                       Used only to look up who owns a beat.
//
// Sikkerhet (2026-11-18):
// - GET /file/:key er offentlig (delingslenker og avspilling trenger det).
// - PUT /upload, DELETE /delete og POST /move krever innlogget Supabase-bruker
//   (Authorization: Bearer <access_token>), og brukeren må eie filen:
//     • nye filer får customMetadata.owner = bruker-id
//     • eldre filer uten owner sjekkes mot beats.owner_id via service-nøkkelen
// - Bare lyd/bilde-typer lagres med sin egen Content-Type; alt annet lagres som
//   application/octet-stream, så ingen kan laste opp HTML/JS som kjører på dette
//   domenet. GET sender også X-Content-Type-Options: nosniff.
// - /rhyme og /stats (finnes bare i den deployede Workeren) bør bruke
//   requireUser() på samme måte — se «Sikkerhet» i worker/SETUP.md.
// ════════════════════════════════════════════════════════════════

const MAX_UPLOAD_BYTES = 300 * 1024 * 1024;   // 300 MB
const SAFE_TYPE = /^(audio|image)\/[a-z0-9.+-]+$/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default {
  async fetch(request, env) {
    const allowed = env.ALLOWED_ORIGIN || '*';

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders(allowed) });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      // GET /file/:key — offentlig, stream with range support (audio seek)
      if (request.method === 'GET' && path.startsWith('/file/')) {
        const key = decodeURIComponent(path.slice('/file/'.length));
        const obj = await env.BUCKET.get(key);
        if (!obj) return err('Ikke funnet', 404, allowed);
        const ct = obj.httpMetadata?.contentType || 'audio/mpeg';
        const headers = {
          ...corsHeaders(allowed),
          'Content-Type': SAFE_TYPE.test(ct) ? ct : 'application/octet-stream',
          'X-Content-Type-Options': 'nosniff',
          'Content-Security-Policy': "default-src 'none'; sandbox",
          'Cache-Control': 'public, max-age=31536000',
          'Accept-Ranges': 'bytes',
        };
        const rangeHeader = request.headers.get('Range');
        if (rangeHeader) {
          const size = obj.size;
          const [, start, end] = rangeHeader.match(/bytes=(\d*)-(\d*)/) || [];
          const from = start ? parseInt(start) : 0;
          const to   = end   ? parseInt(end)   : size - 1;
          headers['Content-Range'] = `bytes ${from}-${to}/${size}`;
          headers['Content-Length'] = String(to - from + 1);
          return new Response(obj.body, { status: 206, headers });
        }
        return new Response(obj.body, { headers });
      }

      // ── Alt under krever innlogget bruker ──────────────────────────
      const isWrite =
        (request.method === 'PUT' && path.startsWith('/upload/')) ||
        (request.method === 'DELETE' && path.startsWith('/delete/')) ||
        (request.method === 'POST' && path === '/move');
      if (!isWrite) return err('Ukjent endepunkt', 404, allowed);

      const userId = await requireUser(request, env);
      if (!userId) return err('Ikke innlogget', 401, allowed);

      // PUT /upload/:key
      if (request.method === 'PUT') {
        const key = cleanKey(decodeURIComponent(path.slice('/upload/'.length)));
        if (!key) return err('Ugyldig key', 400, allowed);
        const len = Number(request.headers.get('Content-Length') || 0);
        if (len > MAX_UPLOAD_BYTES) return err('Filen er for stor', 413, allowed);
        if (!(await mayWrite(env, key, userId))) return err('Ingen tilgang til denne filen', 403, allowed);
        const body = await request.arrayBuffer();
        if (body.byteLength > MAX_UPLOAD_BYTES) return err('Filen er for stor', 413, allowed);
        const reqType = request.headers.get('Content-Type') || 'audio/mpeg';
        const contentType = SAFE_TYPE.test(reqType) ? reqType : 'application/octet-stream';
        await env.BUCKET.put(key, body, { httpMetadata: { contentType }, customMetadata: { owner: userId } });
        const publicUrl = `${url.origin}/file/${encodeURIComponent(key)}`;
        return json({ ok: true, url: publicUrl }, allowed);
      }

      // DELETE /delete/:key
      if (request.method === 'DELETE') {
        const key = cleanKey(decodeURIComponent(path.slice('/delete/'.length)));
        if (!key) return err('Ugyldig key', 400, allowed);
        if (!(await mayWrite(env, key, userId))) return err('Ingen tilgang til denne filen', 403, allowed);
        await env.BUCKET.delete(key);
        return json({ ok: true }, allowed);
      }

      // POST /move — flytt fil (arkiver / gjenopprett)
      const { from: rawFrom, to: rawTo } = await request.json();
      const from = cleanKey(rawFrom), to = cleanKey(rawTo);
      if (!from || !to) return err('Mangler from/to', 400, allowed);
      if (!(await mayWrite(env, from, userId)) || !(await mayWrite(env, to, userId))) {
        return err('Ingen tilgang til denne filen', 403, allowed);
      }
      const src = await env.BUCKET.get(from);
      if (!src) return err('Kildefil ikke funnet', 404, allowed);
      const body = await src.arrayBuffer();
      await env.BUCKET.put(to, body, { httpMetadata: src.httpMetadata, customMetadata: { owner: userId } });
      await env.BUCKET.delete(from);
      const publicUrl = `${url.origin}/file/${encodeURIComponent(to)}`;
      return json({ ok: true, url: publicUrl }, allowed);
    } catch (e) {
      console.error(e);
      return err('Serverfeil', 500, allowed);
    }
  },
};

// Returnerer bruker-id hvis Authorization-headeren har et gyldig Supabase-token.
export async function requireUser(request, env) {
  const auth = request.headers.get('Authorization') || '';
  if (!auth.startsWith('Bearer ')) return null;
  const r = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: auth },
  });
  if (!r.ok) return null;
  const user = await r.json();
  return user?.id && UUID.test(user.id) ? user.id : null;
}

// Godtar bare kjente navnerom: active/{id}, archived/{id}, raw/{id}/{fil}
function cleanKey(key) {
  if (typeof key !== 'string' || key.length > 300) return null;
  if (key.includes('..') || key.startsWith('/')) return null;
  return /^(active|archived|raw)\/[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)?$/.test(key) ? key : null;
}

function beatIdOf(key) { return key.split('/')[1] || null; }

// Brukeren kan skrive til en nøkkel hvis:
//  - objektet finnes og er merket med owner = brukeren, eller
//  - objektet ikke er merket og beaten (hvis den finnes i Supabase) eies av brukeren.
async function mayWrite(env, key, userId) {
  const head = await env.BUCKET.head(key);
  const tagged = head?.customMetadata?.owner;
  if (tagged) return tagged === userId;

  const beatId = beatIdOf(key);
  if (!beatId) return false;
  const r = await fetch(
    `${env.SUPABASE_URL}/rest/v1/beats?select=owner_id&id=eq.${encodeURIComponent(beatId)}`,
    { headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` } },
  );
  if (!r.ok) return false;
  const rows = await r.json();
  if (!rows.length) return !head;           // ny beat, ikke synket ennå: bare ny fil er lov
  return rows[0].owner_id === userId;
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
