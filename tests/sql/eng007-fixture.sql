-- Disposable PostgreSQL fixture only. NEVER run on Me+ shared infrastructure.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema private;
grant usage on schema private to service_role;
create table private.spec_registry(spec_key text primary key,status text,drive_file_id text,drive_url text,last_verified_at timestamptz);
create table private.intent_routing_registry(route_key text primary key,aliases text[],topics text[],spec_keys text[],checkpoint_domains text[],context_operation text,context_input jsonb default '{}'::jsonb,execution_surface text default 'me-plus-gateway',stable_refs jsonb default '{}'::jsonb,priority smallint,status text default 'active',route_version text default '1.0',metadata jsonb default '{"bootstrap_state_mode":"none","max_followup_calls":2}'::jsonb);
alter table private.spec_registry enable row level security;
alter table private.intent_routing_registry enable row level security;
revoke all on all tables in schema private from public,anon,authenticated;
insert into private.spec_registry select k,'active','fixture-'||k,'https://docs.google.com/document/d/fixture-'||k||'/edit',statement_timestamp()
from unnest(array['daily_action_engine','data_foundation','intelligence_contract','master_blueprint','meditation_six_phase','romantic_connection_learning','scheduler_automation','seduction_learning','spanish_learning','supabase_schema']) k;
insert into private.intent_routing_registry(route_key,aliases,topics,spec_keys,checkpoint_domains,context_operation,priority)
select k,string_to_array(a,'|'),string_to_array(t,'|'),string_to_array(s,'|'),string_to_array(t,'|'),op,pri from (values
('meditation_start','meditation|start my meditation|guided meditation|six phase meditation|6 phase meditation|evening meditation|short meditation','meditation|spirituality','meditation_six_phase','get_settings_context',10),
('today_now','what should i do now|what should i do today|today plan|today|my day|next action','today|daily|actions|routines','daily_action_engine|intelligence_contract','today',10),
('health_current','health|health status|steps|steps today|how many steps|sleep|recovery|heart rate|hrv','health|steps|sleep|recovery','data_foundation|intelligence_contract','get_health_context',20),
('finance_current','finance|financial|money|bank|n26|debt|debts|budget|spending','finance|money|debt|banking','data_foundation|intelligence_contract','get_finance_context',20),
('skills_current','skills|skill|guitar|singing|bachata|salsa|dance|dancing','skills|learning','data_foundation|intelligence_contract','get_skills_context',30),
('spanish_learning','spanish|spanish lesson|practice spanish|learn spanish|spanish course','spanish|language|learning','spanish_learning','get_spanish_context',10),
('todoist_execution','todoist|tasks|task list|me+ tasks','todoist|actions|tasks','daily_action_engine|scheduler_automation','get_context',25),
('calendar_context','calendar|schedule|appointments|events|availability','calendar|schedule','daily_action_engine|intelligence_contract','get_calendar_context',25),
('engineering_issue','engineering issue|engineering issues|eng-007|eng-','engineering|architecture|routing|performance','master_blueprint|supabase_schema','list_engineering_issues',15),
('romantic_connection_learning','romantic relationships|romantic relationship|romantic connection|relationship course|dating course|anxiously attached|models|how to not die alone','romantic relationships|romantic connection|relationship learning|dating|attachment','romantic_connection_learning','get_learning_context',8),
('art_of_seduction_learning','art of seduction|the art of seduction|seductive process|seduction course','art of seduction|seduction learning','seduction_learning','get_learning_context',9),
('current_guidance','guidance|me+ guidance|current guidance|what do you recommend|recommendation','guidance|recommendations|intelligence','intelligence_contract|scheduler_automation','get_current_guidance',12),
('routines_due','routine|routines|due routines|morning routine|evening routine','routines|daily','daily_action_engine|intelligence_contract','get_context',25),
('nutrition_current','nutrition|food|meal|meals|protein|calories|hydration|water','nutrition|food|hydration','data_foundation|intelligence_contract','get_nutrition_context',21),
('training_current','training|workout|workouts|gym|exercise|fitness','fitness|training|workout','data_foundation|intelligence_contract','get_training_context',22),
('scheduler_runtime','scheduler|automation|watchdog|runtime health','scheduler|automation|runtime','scheduler_automation',null,30),
('meplus_architecture','me+ architecture|me plus architecture|me+ system|me plus system|architecture','architecture|system|integration','master_blueprint|intelligence_contract|supabase_schema',null,40)
) v(k,a,t,s,op,pri);
