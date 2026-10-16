REVOKE EXECUTE ON FUNCTION public.server_gateway_record_medication_supplement_adherence(uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_health_context(uuid, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.server_gateway_record_medication_supplement_adherence(uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_health_context(uuid, timestamptz) TO service_role;