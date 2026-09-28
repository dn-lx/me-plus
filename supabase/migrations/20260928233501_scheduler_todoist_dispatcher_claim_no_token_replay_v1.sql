-- The dispatcher configuration is deliberately credential-agnostic at schema level.
-- The actual Todoist token must exist in Vault under meplus_todoist_api_token;
-- no credential value is ever committed in migrations or source.
comment on function public.get_todoist_dispatcher_config() is
'Returns server-only Todoist dispatcher configuration. Reads the API token only from Supabase Vault; never from scheduler payloads or Git source.';
