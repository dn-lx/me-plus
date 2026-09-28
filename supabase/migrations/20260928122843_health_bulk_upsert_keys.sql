
create unique index if not exists raw_events_source_external_full_uidx
  on public.raw_events (data_source_id, external_record_id);

create unique index if not exists observations_raw_event_type_uidx
  on public.observations (raw_event_id, observation_type);

-- Historical production-state cleanup intentionally omitted from replay.
-- The original remote migration also closed one timed-out sync-run row.
