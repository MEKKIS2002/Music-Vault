// login-username — logger inn med brukernavn + passord uten å sende e-postadressen
// til nettleseren. Erstatter RPC-en lookup_login_email (som lot hvem som helst
// slå opp e-posten bak et brukernavn).
// Deployet til Supabase (ylvqkfdvijqnecuqznyr), verify_jwt = true (klienten sender anon-nøkkelen).
//
// POST { username, password } → { access_token, refresh_token } | { error }
// Ukjent brukernavn og feil passord gir SAMME svar, så brukernavn ikke kan kartlegges.
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
const FAIL = { error: "Feil brukernavn eller passord." };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let username = "", password = "";
  try {
    const b = await req.json();
    username = String(b?.username ?? "").trim();
    password = String(b?.password ?? "");
  } catch { return json({ error: "Ugyldig forespørsel." }, 400); }
  if (!username || !password || username.length > 64 || password.length > 256) return json(FAIL, 400);
  // PostgREST tolker * som jokertegn i like/ilike — brukernavn har aldri *, så avvis.
  if (username.includes("*")) return json(FAIL, 400);

  // 1) Slå opp e-post med service-nøkkelen (forlater aldri serveren).
  //    ilike med escapede jokertegn = eksakt treff uten hensyn til store/små bokstaver.
  const pattern = username.replace(/[\\%_]/g, (c) => "\\" + c);
  const r = await fetch(
    `${SB_URL}/rest/v1/profiles?select=email&username=ilike.${encodeURIComponent(pattern)}&limit=2`,
    { headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` } },
  );
  const rows = r.ok ? await r.json() : [];
  const email = Array.isArray(rows) && rows.length === 1 ? rows[0]?.email : null;
  if (!email) return json(FAIL, 400);

  // 2) Vanlig passord-innlogging mot Auth. Videresend klientens IP så
  //    Auths egen hastighetsbegrensning gjelder per bruker, ikke per funksjon.
  const fwd = req.headers.get("x-forwarded-for") ?? "";
  const t = await fetch(`${SB_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: ANON,
      "Content-Type": "application/json",
      ...(fwd ? { "X-Forwarded-For": fwd } : {}),
    },
    body: JSON.stringify({ email, password }),
  });
  if (t.status === 429) return json({ error: "For mange forsøk. Vent litt og prøv igjen." }, 429);
  if (!t.ok) return json(FAIL, 400);
  const s = await t.json();
  return json({ access_token: s.access_token, refresh_token: s.refresh_token });
});
