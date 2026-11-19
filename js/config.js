// ════════════════════════════════════════════════════════════════════════════
// config.js — ÉN plass for offentlige innstillinger. Lastes FØRST i index.html,
// share.html og mixtape.html. Bytt prosjekt/worker her, ikke i hver fil.
//
// Alt her er offentlig: anon-nøkkelen er laget for nettleseren og beskyttes av
// RLS i databasen. Service-nøkkelen ligger bare i Supabase Edge Functions.
// (Cloudflare-workeren har sin egen kopi i worker/wrangler.toml.)
// ════════════════════════════════════════════════════════════════════════════
window.MV_CONFIG = Object.freeze({
  SUPABASE_URL: 'https://ylvqkfdvijqnecuqznyr.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlsdnFrZmR2aWpxbmVjdXF6bnlyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgzMzA4MzIsImV4cCI6MjA5MzkwNjgzMn0.bYPTaxQK8n7I7w5Ri2DVYW5_LbFHg2IXkuhHsLTDDqc',
  R2_WORKER_URL: 'https://beat-vault.marcus-aas-mekiassen.workers.dev',
});
window.R2_WORKER_URL = window.MV_CONFIG.R2_WORKER_URL;
