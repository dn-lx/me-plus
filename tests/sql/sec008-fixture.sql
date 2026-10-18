-- Disposable ACL fixture only; never run against a Me+ database.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
CREATE FUNCTION public.get_health_context(uuid, timestamptz)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = ''
AS $$ SELECT '{"fixture":true}'::jsonb $$;
CREATE FUNCTION public.server_gateway_record_medication_supplement_adherence(uuid, jsonb)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = ''
AS $$ SELECT '{"fixture":true}'::jsonb $$;
-- Reproduce both inherited PUBLIC access and explicit client grants.
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated;
