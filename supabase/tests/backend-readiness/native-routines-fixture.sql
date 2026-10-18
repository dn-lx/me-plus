CREATE SCHEMA auth; CREATE SCHEMA private;
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE TABLE auth.users(id uuid PRIMARY KEY, aud text, role text, raw_user_meta_data jsonb);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
GRANT USAGE ON SCHEMA auth,public TO authenticated,anon;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
CREATE TABLE public.action_events (id uuid NOT NULL DEFAULT gen_random_uuid(), user_id uuid NOT NULL, action_id uuid NOT NULL, event_type text NOT NULL, occurred_at timestamp with time zone NOT NULL DEFAULT now(), reason_code text, note text, metadata jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamp with time zone NOT NULL DEFAULT now());
ALTER TABLE public.action_events ADD PRIMARY KEY (id);
ALTER TABLE public.action_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_read ON public.action_events FOR SELECT TO authenticated USING (user_id=auth.uid());
GRANT SELECT ON public.action_events TO authenticated;
CREATE TABLE public.actions (id uuid NOT NULL DEFAULT gen_random_uuid(), user_id uuid NOT NULL, goal_id uuid, routine_event_id uuid, recommendation_id uuid, domain text NOT NULL, origin text NOT NULL, title text NOT NULL, instructions text, priority text NOT NULL, version text NOT NULL DEFAULT 'full'::text, status text NOT NULL DEFAULT 'proposed'::text, estimated_minutes integer, available_from timestamp with time zone, due_at timestamp with time zone, planned_start timestamp with time zone, planned_end timestamp with time zone, reason text, constraint_flags jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamp with time zone NOT NULL DEFAULT now(), updated_at timestamp with time zone NOT NULL DEFAULT now(), daily_plan_id uuid, surface_provider text, surface_external_id text, surface_last_external_id text, surface_project_id text, surface_parent_external_id text, surface_bundle_key text, surface_state text, surface_source text, surface_completion_source text, surface_surfaced_at timestamp with time zone, surface_completed_at timestamp with time zone, surface_removed_at timestamp with time zone, surface_unsurface_requested_at timestamp with time zone, surface_last_unsurfaced_at timestamp with time zone, surface_last_sync_at timestamp with time zone, surface_unsurface_reason text, surface_scheduler_controls boolean NOT NULL DEFAULT false, surface_must_remain_open boolean NOT NULL DEFAULT false, surface_continuous_required boolean NOT NULL DEFAULT false, surface_policy text, surface_user_directive text, surface_contract_version smallint NOT NULL DEFAULT 1);
ALTER TABLE public.actions ADD CHECK (((due_at IS NULL) OR (available_from IS NULL) OR (due_at >= available_from)));
ALTER TABLE public.actions ADD CHECK (((estimated_minutes IS NULL) OR (estimated_minutes >= 0)));
ALTER TABLE public.actions ADD UNIQUE (id, user_id);
ALTER TABLE public.actions ADD PRIMARY KEY (id);
ALTER TABLE public.actions ADD CHECK (((planned_end IS NULL) OR (planned_start IS NULL) OR (planned_end >= planned_start)));
ALTER TABLE public.actions ADD CHECK ((priority = ANY (ARRAY['must'::text, 'should'::text, 'bonus'::text])));
ALTER TABLE public.actions ADD CHECK ((status = ANY (ARRAY['proposed'::text, 'planned'::text, 'available'::text, 'in_progress'::text, 'completed'::text, 'partial'::text, 'skipped'::text, 'cancelled'::text, 'expired'::text])));
ALTER TABLE public.actions ADD CHECK ((surface_contract_version >= 1));
ALTER TABLE public.actions ADD CHECK (((surface_external_id IS NULL) OR (surface_provider IS NOT NULL)));
ALTER TABLE public.actions ADD CHECK (((surface_provider IS NULL) OR (btrim(surface_provider) <> ''::text)));
ALTER TABLE public.actions ADD CHECK (((surface_state IS NULL) OR (surface_state = ANY (ARRAY['pending'::text, 'surfaced'::text, 'unsurfaced'::text, 'completed'::text, 'removed_by_user_reset'::text]))));
ALTER TABLE public.actions ADD CHECK ((version = ANY (ARRAY['full'::text, 'reduced'::text, 'minimum'::text])));
ALTER TABLE public.actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_read ON public.actions FOR SELECT TO authenticated USING (user_id=auth.uid());
GRANT SELECT ON public.actions TO authenticated;
CREATE TABLE public.profiles (id uuid NOT NULL, display_name text, timezone text NOT NULL DEFAULT 'UTC'::text, locale text, onboarding_completed_at timestamp with time zone, created_at timestamp with time zone NOT NULL DEFAULT now(), updated_at timestamp with time zone NOT NULL DEFAULT now());
ALTER TABLE public.profiles ADD PRIMARY KEY (id);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_read ON public.profiles FOR SELECT TO authenticated USING (id=auth.uid());
GRANT SELECT ON public.profiles TO authenticated;
CREATE TABLE public.recommendation_feedback (id uuid NOT NULL DEFAULT gen_random_uuid(), user_id uuid NOT NULL, recommendation_id uuid NOT NULL, decision text, helpfulness smallint, reason_code text, note text, recorded_at timestamp with time zone NOT NULL DEFAULT now(), created_at timestamp with time zone NOT NULL DEFAULT now());
ALTER TABLE public.recommendation_feedback ADD CHECK (((decision IS NULL) OR (decision = ANY (ARRAY['accepted'::text, 'dismissed'::text, 'ignored'::text]))));
ALTER TABLE public.recommendation_feedback ADD CHECK (((helpfulness IS NULL) OR ((helpfulness >= 1) AND (helpfulness <= 5))));
ALTER TABLE public.recommendation_feedback ADD PRIMARY KEY (id);
ALTER TABLE public.recommendation_feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_read ON public.recommendation_feedback FOR SELECT TO authenticated USING (user_id=auth.uid());
GRANT SELECT ON public.recommendation_feedback TO authenticated;
CREATE TABLE public.recommendations (id uuid NOT NULL DEFAULT gen_random_uuid(), user_id uuid NOT NULL, personal_state_snapshot_id uuid, recommendation_type text NOT NULL, domain text NOT NULL, generated_at timestamp with time zone NOT NULL DEFAULT now(), expires_at timestamp with time zone, title text NOT NULL, rationale text NOT NULL, confidence text NOT NULL, priority smallint, proposed_action jsonb NOT NULL DEFAULT '{}'::jsonb, evidence jsonb NOT NULL DEFAULT '[]'::jsonb, constraints_considered jsonb NOT NULL DEFAULT '[]'::jsonb, policy_version text NOT NULL, model_provider text, model_name text, model_version text, prompt_contract_version text, created_at timestamp with time zone NOT NULL DEFAULT now());
ALTER TABLE public.recommendations ADD CHECK ((confidence = ANY (ARRAY['high'::text, 'medium'::text, 'experimental'::text, 'insufficient_data'::text])));
ALTER TABLE public.recommendations ADD CHECK (((expires_at IS NULL) OR (expires_at >= generated_at)));
ALTER TABLE public.recommendations ADD UNIQUE (id, user_id);
ALTER TABLE public.recommendations ADD PRIMARY KEY (id);
ALTER TABLE public.recommendations ADD CHECK (((priority IS NULL) OR ((priority >= 1) AND (priority <= 5))));
ALTER TABLE public.recommendations ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_read ON public.recommendations FOR SELECT TO authenticated USING (user_id=auth.uid());
GRANT SELECT ON public.recommendations TO authenticated;
CREATE TABLE public.routine_events (id uuid NOT NULL DEFAULT gen_random_uuid(), user_id uuid NOT NULL, routine_id uuid NOT NULL, scheduled_for timestamp with time zone NOT NULL, window_start timestamp with time zone, window_end timestamp with time zone, status text NOT NULL DEFAULT 'due'::text, selected_version text, completed_at timestamp with time zone, skip_reason text, created_at timestamp with time zone NOT NULL DEFAULT now(), updated_at timestamp with time zone NOT NULL DEFAULT now(), routine_schedule_id uuid, occurrence_date date);
ALTER TABLE public.routine_events ADD UNIQUE (id, user_id);
ALTER TABLE public.routine_events ADD PRIMARY KEY (id);
ALTER TABLE public.routine_events ADD CHECK (((selected_version IS NULL) OR (selected_version = ANY (ARRAY['full'::text, 'reduced'::text, 'minimum'::text]))));
ALTER TABLE public.routine_events ADD CHECK ((status = ANY (ARRAY['due'::text, 'completed'::text, 'partial'::text, 'skipped'::text, 'missed'::text])));
ALTER TABLE public.routine_events ADD CHECK (((window_end IS NULL) OR (window_start IS NULL) OR (window_end >= window_start)));
ALTER TABLE public.routine_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_read ON public.routine_events FOR SELECT TO authenticated USING (user_id=auth.uid());
GRANT SELECT ON public.routine_events TO authenticated;
CREATE TABLE public.routine_schedules (id uuid NOT NULL DEFAULT gen_random_uuid(), user_id uuid NOT NULL, routine_id uuid NOT NULL, schedule_type text NOT NULL, rrule text, local_time time without time zone, timezone text, window_start_local time without time zone, window_end_local time without time zone, schedule_config jsonb NOT NULL DEFAULT '{}'::jsonb, starts_on date, ends_on date, created_at timestamp with time zone NOT NULL DEFAULT now(), updated_at timestamp with time zone NOT NULL DEFAULT now());
ALTER TABLE public.routine_schedules ADD CHECK (((ends_on IS NULL) OR (starts_on IS NULL) OR (ends_on >= starts_on)));
ALTER TABLE public.routine_schedules ADD UNIQUE (id, user_id);
ALTER TABLE public.routine_schedules ADD PRIMARY KEY (id);
ALTER TABLE public.routine_schedules ADD CHECK (((schedule_type = ANY (ARRAY['daily'::text, 'weekly'::text, 'once'::text, 'rrule'::text])) AND ((schedule_type <> 'rrule'::text) OR (rrule IS NOT NULL))));
ALTER TABLE public.routine_schedules ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_read ON public.routine_schedules FOR SELECT TO authenticated USING (user_id=auth.uid());
GRANT SELECT ON public.routine_schedules TO authenticated;
CREATE TABLE public.routines (id uuid NOT NULL DEFAULT gen_random_uuid(), user_id uuid NOT NULL, goal_id uuid, domain text NOT NULL, title text NOT NULL, instructions text, importance smallint NOT NULL DEFAULT 3, normal_duration_minutes integer, reduced_duration_minutes integer, minimum_duration_minutes integer, normal_definition jsonb NOT NULL DEFAULT '{}'::jsonb, reduced_definition jsonb, minimum_definition jsonb, skip_conditions jsonb NOT NULL DEFAULT '{}'::jsonb, notification_policy jsonb NOT NULL DEFAULT '{}'::jsonb, active boolean NOT NULL DEFAULT true, created_at timestamp with time zone NOT NULL DEFAULT now(), updated_at timestamp with time zone NOT NULL DEFAULT now());
ALTER TABLE public.routines ADD UNIQUE (id, user_id);
ALTER TABLE public.routines ADD CHECK (((importance >= 1) AND (importance <= 5)));
ALTER TABLE public.routines ADD CHECK (((minimum_duration_minutes IS NULL) OR (minimum_duration_minutes >= 0)));
ALTER TABLE public.routines ADD CHECK (((normal_duration_minutes IS NULL) OR (normal_duration_minutes >= 0)));
ALTER TABLE public.routines ADD PRIMARY KEY (id);
ALTER TABLE public.routines ADD CHECK (((reduced_duration_minutes IS NULL) OR (reduced_duration_minutes >= 0)));
ALTER TABLE public.routines ADD CHECK (((char_length(title) >= 1) AND (char_length(title) <= 200)));
ALTER TABLE public.routines ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_read ON public.routines FOR SELECT TO authenticated USING (user_id=auth.uid());
GRANT SELECT ON public.routines TO authenticated;
CREATE OR REPLACE FUNCTION public.scheduler_materialize_routine_action(p_user_id uuid, p_routine_id uuid, p_schedule_id uuid, p_occurrence_date date, p_scheduler_run_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_routine public.routines%rowtype;
  v_schedule public.routine_schedules%rowtype;
  v_event_id uuid;
  v_action_id uuid;
  v_tz text;
  v_scheduled_for timestamptz;
  v_window_start timestamptz;
  v_window_end timestamptz;
  v_priority text;
begin
  select * into v_routine
  from public.routines
  where id=p_routine_id and user_id=p_user_id and active;

  if not found then
    raise exception 'Unknown/inactive routine % for user %',p_routine_id,p_user_id;
  end if;

  select * into v_schedule
  from public.routine_schedules
  where id=p_schedule_id and user_id=p_user_id and routine_id=p_routine_id;

  if not found then
    raise exception 'Unknown schedule % for routine %',p_schedule_id,p_routine_id;
  end if;

  v_tz := coalesce(v_schedule.timezone,'Europe/Berlin');

  v_window_start := case
    when v_schedule.window_start_local is not null
      then ((p_occurrence_date + v_schedule.window_start_local) at time zone v_tz)
    when v_schedule.local_time is not null
      then ((p_occurrence_date + v_schedule.local_time) at time zone v_tz)
    else (p_occurrence_date::timestamp at time zone v_tz)
  end;

  v_window_end := case
    when v_schedule.window_end_local is not null
      then ((p_occurrence_date + v_schedule.window_end_local) at time zone v_tz)
    when v_schedule.local_time is not null
      then ((p_occurrence_date + v_schedule.local_time) at time zone v_tz)
    else ((p_occurrence_date + 1)::timestamp at time zone v_tz)
  end;

  v_scheduled_for := case
    when v_schedule.local_time is not null
      then ((p_occurrence_date + v_schedule.local_time) at time zone v_tz)
    else v_window_start
  end;

  insert into public.routine_events(
    user_id,routine_id,scheduled_for,window_start,window_end,status,
    selected_version,routine_schedule_id,occurrence_date
  )
  values(
    p_user_id,p_routine_id,v_scheduled_for,v_window_start,v_window_end,'due',
    'full',p_schedule_id,p_occurrence_date
  )
  on conflict (user_id,routine_schedule_id,occurrence_date)
    where routine_schedule_id is not null and occurrence_date is not null
  do update set updated_at=public.routine_events.updated_at
  returning id into v_event_id;

  select id into v_action_id
  from public.actions
  where user_id=p_user_id and routine_event_id=v_event_id
  order by created_at
  limit 1;

  if v_action_id is null then
    v_priority := case
      when v_routine.importance >= 5 then 'must'
      when v_routine.importance >= 3 then 'should'
      else 'bonus'
    end;

    insert into public.actions(
      user_id,origin,title,instructions,domain,priority,
      available_from,due_at,estimated_minutes,version,status,
      routine_event_id,reason,constraint_flags
    )
    values(
      p_user_id,'routine',v_routine.title,v_routine.instructions,v_routine.domain,v_priority,
      v_window_start,v_window_end,v_routine.normal_duration_minutes,'full','planned',
      v_event_id,
      'Due configured routine materialized by the Hourly task scheduler.',
      jsonb_build_object(
        'routine_id',p_routine_id,
        'routine_schedule_id',p_schedule_id,
        'occurrence_date',p_occurrence_date,
        'scheduler_run_id',p_scheduler_run_id
      )
    )
    returning id into v_action_id;
  end if;

  return jsonb_build_object(
    'routine_event_id',v_event_id,
    'action_id',v_action_id,
    'routine_id',p_routine_id,
    'schedule_id',p_schedule_id,
    'occurrence_date',p_occurrence_date,
    'scheduled_for',v_scheduled_for,
    'window_start',v_window_start,
    'window_end',v_window_end
  );
end;
$function$;

CREATE UNIQUE INDEX routine_events_schedule_occurrence_uq ON public.routine_events(user_id,routine_schedule_id,occurrence_date)
WHERE routine_schedule_id IS NOT NULL AND occurrence_date IS NOT NULL;
CREATE FUNCTION public.record_scheduler_heartbeat(uuid,text,text,text,jsonb,integer,integer,uuid,text) RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;
