create table public.meals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  data_source_id uuid null references public.data_sources(id) on delete set null,
  raw_event_id uuid null references public.raw_events(id) on delete set null,
  eaten_at timestamptz not null,
  meal_type text null,
  title text null,
  capture_method text not null default 'manual',
  photo_ref text null,
  note text null,
  calories_kcal numeric null check (calories_kcal is null or calories_kcal >= 0),
  protein_g numeric null check (protein_g is null or protein_g >= 0),
  carbohydrate_g numeric null check (carbohydrate_g is null or carbohydrate_g >= 0),
  fat_g numeric null check (fat_g is null or fat_g >= 0),
  fibre_g numeric null check (fibre_g is null or fibre_g >= 0),
  micronutrients jsonb not null default '{}'::jsonb,
  confidence numeric null check (confidence is null or (confidence >= 0 and confidence <= 1)),
  provenance jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.meal_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  meal_id uuid not null references public.meals(id) on delete cascade,
  item_order integer null check (item_order is null or item_order >= 0),
  food_name text not null,
  canonical_food_ref text null,
  quantity numeric null check (quantity is null or quantity >= 0),
  unit text null,
  grams numeric null check (grams is null or grams >= 0),
  calories_kcal numeric null check (calories_kcal is null or calories_kcal >= 0),
  protein_g numeric null check (protein_g is null or protein_g >= 0),
  carbohydrate_g numeric null check (carbohydrate_g is null or carbohydrate_g >= 0),
  fat_g numeric null check (fat_g is null or fat_g >= 0),
  fibre_g numeric null check (fibre_g is null or fibre_g >= 0),
  micronutrients jsonb not null default '{}'::jsonb,
  estimate_status text not null default 'estimated',
  confidence numeric null check (confidence is null or (confidence >= 0 and confidence <= 1)),
  provenance jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.nutrition_estimates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  meal_id uuid null references public.meals(id) on delete cascade,
  meal_item_id uuid null references public.meal_items(id) on delete cascade,
  observed_at timestamptz not null default now(),
  estimate_type text not null default 'nutrition',
  capture_method text null,
  model_or_source text null,
  values jsonb not null,
  confidence numeric null check (confidence is null or (confidence >= 0 and confidence <= 1)),
  quality text null,
  supersedes_id uuid null references public.nutrition_estimates(id) on delete set null,
  is_authoritative boolean not null default false,
  note text null,
  provenance jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check ((meal_id is not null) or (meal_item_id is not null))
);

create table public.hydration_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  data_source_id uuid null references public.data_sources(id) on delete set null,
  raw_event_id uuid null references public.raw_events(id) on delete set null,
  observed_at timestamptz not null,
  beverage_type text not null default 'water',
  amount_ml numeric not null check (amount_ml > 0),
  calories_kcal numeric null check (calories_kcal is null or calories_kcal >= 0),
  caffeine_mg numeric null check (caffeine_mg is null or caffeine_mg >= 0),
  electrolytes jsonb not null default '{}'::jsonb,
  capture_method text not null default 'manual',
  confidence numeric null check (confidence is null or (confidence >= 0 and confidence <= 1)),
  provenance jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index meals_user_eaten_idx on public.meals(user_id, eaten_at desc);
create index meals_data_source_idx on public.meals(data_source_id);
create index meal_items_user_meal_idx on public.meal_items(user_id, meal_id);
create index nutrition_estimates_user_time_idx on public.nutrition_estimates(user_id, observed_at desc);
create index nutrition_estimates_meal_idx on public.nutrition_estimates(meal_id);
create index nutrition_estimates_meal_item_idx on public.nutrition_estimates(meal_item_id);
create index hydration_events_user_time_idx on public.hydration_events(user_id, observed_at desc);

create trigger meals_set_updated_at before update on public.meals for each row execute function public.set_updated_at();
create trigger meal_items_set_updated_at before update on public.meal_items for each row execute function public.set_updated_at();
create trigger hydration_events_set_updated_at before update on public.hydration_events for each row execute function public.set_updated_at();

alter table public.meals enable row level security;
alter table public.meal_items enable row level security;
alter table public.nutrition_estimates enable row level security;
alter table public.hydration_events enable row level security;

revoke all on table public.meals, public.meal_items, public.nutrition_estimates, public.hydration_events from anon, authenticated;
grant select, insert, update, delete on table public.meals, public.meal_items, public.nutrition_estimates, public.hydration_events to authenticated;

create policy meals_select on public.meals for select to authenticated using ((select auth.uid()) = user_id);
create policy meals_insert on public.meals for insert to authenticated with check ((select auth.uid()) = user_id);
create policy meals_update on public.meals for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy meals_delete on public.meals for delete to authenticated using ((select auth.uid()) = user_id);

create policy meal_items_select on public.meal_items for select to authenticated using ((select auth.uid()) = user_id);
create policy meal_items_insert on public.meal_items for insert to authenticated with check ((select auth.uid()) = user_id and exists (select 1 from public.meals m where m.id = meal_id and m.user_id = (select auth.uid())));
create policy meal_items_update on public.meal_items for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id and exists (select 1 from public.meals m where m.id = meal_id and m.user_id = (select auth.uid())));
create policy meal_items_delete on public.meal_items for delete to authenticated using ((select auth.uid()) = user_id);

create policy nutrition_estimates_select on public.nutrition_estimates for select to authenticated using ((select auth.uid()) = user_id);
create policy nutrition_estimates_insert on public.nutrition_estimates for insert to authenticated with check ((select auth.uid()) = user_id);
create policy nutrition_estimates_update on public.nutrition_estimates for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy nutrition_estimates_delete on public.nutrition_estimates for delete to authenticated using ((select auth.uid()) = user_id);

create policy hydration_events_select on public.hydration_events for select to authenticated using ((select auth.uid()) = user_id);
create policy hydration_events_insert on public.hydration_events for insert to authenticated with check ((select auth.uid()) = user_id);
create policy hydration_events_update on public.hydration_events for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy hydration_events_delete on public.hydration_events for delete to authenticated using ((select auth.uid()) = user_id);
