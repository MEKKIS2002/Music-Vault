// ════════════════════════════════════════════════════════════════
// Music Vault — Cloudflare Worker (R2 proxy)
// Deploy this on workers.cloudflare.com
//
// Environment variables to set in Worker settings:
//   BUCKET        → R2 bucket binding (name it "BUCKET" when binding)
//   ALLOWED_ORIGIN → your GitHub Pages URL, e.g. https://mekkis2002.github.io
// ════════════════════════════════════════════════════════════════

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowed = env.ALLOWED_ORIGIN || '*';

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders(allowed) });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      // PUT /upload/:key
      if (request.method === 'PUT' && path.startsWith('/upload/')) {
        const key = decodeURIComponent(path.slice('/upload/'.length));
        if (!key) return err('Mangler key', 400, allowed);
        const body = await request.arrayBuffer();
        const contentType = request.headers.get('Content-Type') || 'audio/mpeg';
        await env.BUCKET.put(key, body, { httpMetadata: { contentType } });
        const publicUrl = `${url.origin}/file/${encodeURIComponent(key)}`;
        return json({ ok: true, url: publicUrl }, allowed);
      }

      // GET /file/:key — stream with range support (audio seek)
      if (request.method === 'GET' && path.startsWith('/file/')) {
        const key = decodeURIComponent(path.slice('/file/'.length));
        const obj = await env.BUCKET.get(key);
        if (!obj) return err('Ikke funnet', 404, allowed);
        const headers = {
          ...corsHeaders(allowed),
          'Content-Type': obj.httpMetadata?.contentType || 'audio/mpeg',
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

      // DELETE /delete/:key
      if (request.method === 'DELETE' && path.startsWith('/delete/')) {
        const key = decodeURIComponent(path.slice('/delete/'.length));
        await env.BUCKET.delete(key);
        return json({ ok: true }, allowed);
      }

      // POST /move — flytt fil (arkiver / gjenopprett)
      if (request.method === 'POST' && path === '/move') {
        const { from, to } = await request.json();
        if (!from || !to) return err('Mangler from/to', 400, allowed);
        const src = await env.BUCKET.get(from);
        if (!src) return err(`Kildefil ikke funnet: ${from}`, 404, allowed);
        const body = await src.arrayBuffer();
        await env.BUCKET.put(to, body, { httpMetadata: src.httpMetadata });
        await env.BUCKET.delete(from);
        const publicUrl = `${url.origin}/file/${encodeURIComponent(to)}`;
        return json({ ok: true, url: publicUrl }, allowed);
      }

      return err('Ukjent endepunkt', 404, allowed);
    } catch (e) {
      console.error(e);
      return err(`Serverfeil: ${e.message}`, 500, allowed);
    }
  },
};

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, PUT, DELETE, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Range',
    'Access-Control-Expose-Headers': 'Content-Range, Content-Length',
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
