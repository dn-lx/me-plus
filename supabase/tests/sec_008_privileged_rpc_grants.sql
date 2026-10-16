-- SEC-008 regression: privileged RPCs must not be client-callable.
-- Run after migration 20261014151223_sec_008_restrict_privileged_rpc_grants.sql.
-- Pure privilege inspection; no mutations or personal data reads.

BEGIN;

DO $security_assertions$
DECLARE
  v_function regprocedure;
  v_role text;
BEGIN
  FOREACH v_function IN ARRAY ARRAY[
    'public.server_gateway_record_medication_supplement_adherence(uuid,jsonb)'::regprocedure,
    'public.get_health_context(uuid,timestamp with time zone)'::regprocedure
  ]
  LOOP
    FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated']
    LOOP
      IF has_function_privilege(v_role, v_function::oid, 'EXECUTE') THEN
        RAISE EXCEPTION 'SEC-008 FAIL: % may execute %', v_role, v_function;
      END IF;
    END LOOP;

    IF NOT has_function_privilege('service_role', v_function::oid, 'EXECUTE') THEN
      RAISE EXCEPTION 'SEC-008 FAIL: service_role cannot execute %', v_function;
    END IF;
  END LOOP;
END
$security_assertions$;

ROLLBACK;

SELECT 'PASS: SEC-008 privileged RPCs are service-role-only' AS result;

-- Separate release-gate checks (not covered by role-grant assertions):
-- 1. Me+ Gateway get_health_context still returns owner-scoped data.
-- 2. Me+ Gateway record_medication_supplement_adherence still succeeds
--    for a permitted fixture and remains idempotent on retry.
-- 3. Direct unauthenticated/authenticated RPC calls are denied.
-- 4. Supabase security advisors no longer flag the two RPCs.
-- 5. Cross-user denial tests use isolated synthetic users, not live records.
