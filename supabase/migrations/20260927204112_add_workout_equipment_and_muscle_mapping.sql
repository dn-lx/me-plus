alter table public.workout_exercises
  add column if not exists equipment_name text,
  add column if not exists equipment_photo_ref text,
  add column if not exists primary_muscles text[] not null default '{}',
  add column if not exists secondary_muscles text[] not null default '{}',
  add column if not exists identification_confidence numeric,
  add constraint workout_exercises_identification_confidence_check check (identification_confidence is null or (identification_confidence >= 0 and identification_confidence <= 1));

create index if not exists workout_exercises_primary_muscles_gin_idx on public.workout_exercises using gin (primary_muscles);
create index if not exists workout_exercises_secondary_muscles_gin_idx on public.workout_exercises using gin (secondary_muscles);
