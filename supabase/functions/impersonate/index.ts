// impersonate — lar en ADMIN se appen som en annen bruker (som WordPress
// «User Switching»). Deployet til Supabase (ylvqkfdvijqnecuqznyr), verify_jwt = true.
//
// Klienten sender ADMINENS eget access-token i Authorization.
//   POST { action: "list" }                → { users: [{id, username, role, package}] }
//   POST { action: "switch", target_id }   → { access_token, refresh_token, user: {...} }
//
// Sikkerhet:
// - Kalleren må ha role = 'admin' i profiles (sjekkes med service-nøkkelen,
//   ikke med noe klienten selv sier).
// - Sesjonen for målbrukeren lages med en engangs magiclink-token som
//   verifiseres her på serveren — ingen e-post sendes, ingen passord brukes.
// - Hvert bytte logges i public.impersonation_log.
// - Klienten (js/impersonate.js) blokkerer alle skrivekall mens man ser som
//   en annen bruker.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const svc = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function callerIsAdmin(req: Request): Promise<string | null> {
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return null;
  const u = await fetch(`${SB_URL}/auth/v1/user`, { headers: { apikey: ANON, Authorization: auth } });
  if (!u.ok) return null;
  const user = await u.json();
  if (!user?.id || !UUID.test(user.id)) return null;
  const p = await fetch(`${SB_URL}/rest/v1/profiles?select=role&id=eq.${user.id}`, { headers: svc });
  const rows = p.ok ? await p.json() : [];
  return rows?.[0]?.role === "admin" ? user.id : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const adminId = await callerIsAdmin(req);
  if (!adminId) return json({ error: "Bare admin kan bytte bruker." }, 403);

  let body: { action?: string; target_id?: string } = {};
  try { body = await req.json(); } catch { return json({ error: "Ugyldig forespørsel." }, 400); }

  if (body.action === "list") {
    const r = await fetch(`${SB_URL}/rest/v1/profiles?select=id,username,role,package&order=username.asc`, { headers: svc });
    if (!r.ok) return json({ error: "Kunne ikke hente brukere." }, 500);
    return json({ users: await r.json() });
  }

  if (body.action === "switch") {
    const target = String(body.target_id ?? "");
    if (!UUID.test(target)) return json({ error: "Ugyldig bruker." }, 400);
    const p = await fetch(`${SB_URL}/rest/v1/profiles?select=id,email,username,role,package&id=eq.${target}`, { headers: svc });
    const prof = (p.ok ? await p.json() : [])?.[0];
    if (!prof?.email) return json({ error: "Fant ikke brukeren." }, 404);

    // 1) Engangs-token for målbrukeren (sender ingen e-post)
    const g = await fetch(`${SB_URL}/auth/v1/admin/generate_link`, {
      method: "POST",
      headers: { ...svc, "Content-Type": "application/json" },
      body: JSON.stringify({ type: "magiclink", email: prof.email }),
    });
    const link = g.ok ? await g.json() : null;
    const tokenHash = link?.hashed_token ?? link?.properties?.hashed_token;
    if (!tokenHash) return json({ error: "Kunne ikke lage innlogging." }, 500);

    // 2) Bytt tokenet mot en sesjon her på serveren
    const v = await fetch(`${SB_URL}/auth/v1/verify`, {
      method: "POST",
      headers: { apikey: ANON, "Content-Type": "application/json" },
      body: JSON.stringify({ type: "magiclink", token_hash: tokenHash }),
    });
    const s = v.ok ? await v.json() : null;
    if (!s?.access_token) return json({ error: "Kunne ikke logge inn som brukeren." }, 500);

    // 3) Logg byttet
    await fetch(`${SB_URL}/rest/v1/impersonation_log`, {
      method: "POST",
      headers: { ...svc, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ admin_id: adminId, target_id: target }),
    });

    return json({
      access_token: s.access_token,
      refresh_token: s.refresh_token,
      user: { id: prof.id, username: prof.username, role: prof.role, package: prof.package },
    });
  }

  return json({ error: "Ukjent handling." }, 400);
});
