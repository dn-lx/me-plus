create or replace function public.scheduler_requeue_external_after_ai_completion()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.status='completed'
     and jsonb_array_length(coalesce(new.payload#>'{ai_reasoning,action_ids}','[]'::jsonb)) > 0
     and old.external_status in ('completed','not_required') then
    new.external_status := 'pending';
    new.external_available_at := clock_timestamp();
    new.external_claimed_at := null;
    new.external_completed_at := null;
    new.external_last_error := null;
  end if;
  return new;
end;
$$;

create trigger scheduler_requeue_external_after_ai_completion
before update of status,payload on public.scheduler_dispatches
for each row execute function public.scheduler_requeue_external_after_ai_completion();
