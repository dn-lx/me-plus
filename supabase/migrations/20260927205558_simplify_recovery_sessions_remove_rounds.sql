alter table public.recovery_sessions add column if not exists temperature_c numeric;
alter table public.recovery_sessions drop column if exists rounds;
drop table if exists public.recovery_session_rounds;
