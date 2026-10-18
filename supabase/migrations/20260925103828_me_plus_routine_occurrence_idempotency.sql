
alter table public.routine_schedules
  add constraint routine_schedules_id_user_id_key unique (id,user_id);

alter table public.routine_schedules
  add constraint routine_schedules_type_check
  check (
    schedule_type in ('daily','weekly','once','rrule')
    and (schedule_type <> 'rrule' or rrule is not null)
  );

alter table public.routine_events
  add column routine_schedule_id uuid,
  add column occurrence_date date;

alter table public.routine_events
  add constraint routine_events_schedule_owner_fkey
  foreign key (routine_schedule_id,user_id)
  references public.routine_schedules(id,user_id)
  on delete set null;

create unique index routine_events_schedule_occurrence_uidx
  on public.routine_events(user_id,routine_schedule_id,occurrence_date)
  where routine_schedule_id is not null and occurrence_date is not null;

create index routine_events_schedule_user_idx
  on public.routine_events(routine_schedule_id,user_id);
