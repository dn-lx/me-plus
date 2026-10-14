-- SEC-008: restrict privileged gateway RPC execution to the server role.
-- The Me+ Gateway invokes these functions using its server-side Supabase
-- admin client. Neither anonymous nor ordinary authenticated clients
-- should be able to supply an arbitrary p_user_id to either function.
-- No function body or user data is changed in this migration.

REVOKE EXECUTE ON FUNCTION
  public.server_gateway_record_medication_supplement_adherence(uuid, jsonb)
  FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION
  public.get_health_context(uuid, timestamptz)
  FROM PUBLIC, anon, authenticated;

-- Preserve existing authorized Me+ Gateway functionality.
GRANT EXECUTE ON FUNCTION
  public.server_gateway_record_medication_supplement_adherence(uuid, jsonb)
  TO service_role;

GRANT EXECUTE ON FUNCTION
  public.get_health_context(uuid, timestamptz)
  TO service_role;
