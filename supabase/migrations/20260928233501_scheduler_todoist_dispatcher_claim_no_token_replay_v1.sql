-- The dispatcher configuration is deliberately credential-agnostic at schema level.
-- The actual Todoist token may be supplied by the Edge Function secret path; Vault remains a server-side fallback.
-- No credential value is ever committed in migrations or source.
comment on function public.get_todoist_dispatcher_config() is
'Returns server-only Todoist dispatcher configuration. Vault may provide a fallback API token; the Edge Function secret is preferred by the dispatcher. Credentials never come from scheduler payloads or Git source.';
