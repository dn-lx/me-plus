-- Actual role-switch calls supplement privilege introspection.
BEGIN;
SET LOCAL ROLE anon;
DO $$ BEGIN
  BEGIN
    PERFORM public.get_health_context('00000000-0000-0000-0000-000000000001', now());
    RAISE EXCEPTION 'SEC-008: anonymous health call unexpectedly allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.server_gateway_record_medication_supplement_adherence('00000000-0000-0000-0000-000000000001', '{}'::jsonb);
    RAISE EXCEPTION 'SEC-008: anonymous medication call unexpectedly allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  BEGIN
    PERFORM public.get_health_context('00000000-0000-0000-0000-000000000002', now());
    RAISE EXCEPTION 'SEC-008: authenticated health call unexpectedly allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.server_gateway_record_medication_supplement_adherence('00000000-0000-0000-0000-000000000002', '{}'::jsonb);
    RAISE EXCEPTION 'SEC-008: authenticated medication call unexpectedly allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SET LOCAL ROLE service_role;
DO $$ BEGIN
  IF public.get_health_context('00000000-0000-0000-0000-000000000001', now()) <> '{"fixture":true}'::jsonb
    OR public.server_gateway_record_medication_supplement_adherence('00000000-0000-0000-0000-000000000001', '{}'::jsonb) <> '{"fixture":true}'::jsonb THEN
    RAISE EXCEPTION 'SEC-008: server call failed';
  END IF;
END $$;
ROLLBACK;
