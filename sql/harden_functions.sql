-- harden_functions.sql — sikkerhetsrydding av databasefunksjoner (15. nov 2026)
-- Applied to Supabase project ylvqkfdvijqnecuqznyr (migration: harden_trigger_functions).

-- 1) Fast search_path på triggerfunksjonene (Supabase-lint 0011)
alter function public.auto_revoke_beat_on_remove()        set search_path = public, pg_temp;
alter function public.auto_share_beat_on_collection_add() set search_path = public, pg_temp;
alter function public.auto_share_new_album()              set search_path = public, pg_temp;
alter function public.auto_share_new_beat()               set search_path = public, pg_temp;
alter function public.auto_share_new_mixtape()            set search_path = public, pg_temp;
alter function public.handle_new_user()                   set search_path = public, pg_temp;
alter function public.tg_docs_updated_at()                set search_path = public, pg_temp;

-- 2) Triggerfunksjoner skal ikke kunne kalles via /rest/v1/rpc (lint 0028/0029).
--    Triggere fyrer uavhengig av EXECUTE-rettighet.
revoke execute on function public.auto_revoke_beat_on_remove()        from public, anon, authenticated;
revoke execute on function public.auto_share_beat_on_collection_add() from public, anon, authenticated;
revoke execute on function public.auto_share_new_album()              from public, anon, authenticated;
revoke execute on function public.auto_share_new_beat()               from public, anon, authenticated;
revoke execute on function public.auto_share_new_mixtape()            from public, anon, authenticated;
revoke execute on function public.handle_new_user()                   from public, anon, authenticated;
revoke execute on function public.tg_docs_updated_at()                from public, anon, authenticated;

-- 3) KJØRES ETTER at lock.js med login-username er publisert (migration: revoke_lookup_login_email):
--    lookup_login_email ga e-posten bak et brukernavn til hvem som helst.
-- revoke execute on function public.lookup_login_email(text) from public, anon, authenticated;
