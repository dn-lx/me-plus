update private.engineering_issues
set validation_contract = jsonb_build_object(
  'acceptance', jsonb_build_array(
    'reproduce_or_confirm_current_state',
    'verify_declared_dependencies_and_conflicts',
    'apply_smallest_bounded_fix',
    'retest_issue_and_regression_surface',
    'verify_canonical_state_and_external_surface_when_affected',
    'reconcile_spec_and_repository_provenance_when_behavior_changed'
  ),
  'closure_rule', 'do_not_close_without_recorded_acceptance_evidence'
)
where validation_contract = '{}'::jsonb;

create or replace function private.validate_engineering_issue_relations()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_missing text[];
  v_overlap text[];
  v_cycle boolean := false;
begin
  new.depends_on := coalesce(
    array(select distinct x from unnest(coalesce(new.depends_on,'{}'::text[])) x where btrim(x)<>'' order by x),
    '{}'::text[]
  );
  new.conflicts_with := coalesce(
    array(select distinct x from unnest(coalesce(new.conflicts_with,'{}'::text[])) x where btrim(x)<>'' order by x),
    '{}'::text[]
  );
  new.regression_surface := coalesce(
    array(select distinct x from unnest(coalesce(new.regression_surface,'{}'::text[])) x where btrim(x)<>'' order by x),
    '{}'::text[]
  );

  if new.issue_key = any(new.depends_on) or new.issue_key = any(new.conflicts_with) then
    raise exception 'engineering_issue_self_reference:%', new.issue_key;
  end if;

  select array_agg(x order by x)
    into v_overlap
  from (
    select unnest(new.depends_on)
    intersect
    select unnest(new.conflicts_with)
  ) q(x);

  if coalesce(cardinality(v_overlap),0) > 0 then
    raise exception 'engineering_issue_dependency_conflict_overlap:%:%', new.issue_key, array_to_string(v_overlap,',');
  end if;

  select array_agg(ref order by ref)
    into v_missing
  from (
    select ref
    from unnest(new.depends_on || new.conflicts_with) ref
    left join private.engineering_issues e on e.issue_key=ref
    where e.issue_key is null
  ) q;

  if coalesce(cardinality(v_missing),0) > 0 then
    raise exception 'engineering_issue_missing_reference:%:%', new.issue_key, array_to_string(v_missing,',');
  end if;

  if tg_op='UPDATE' and new.depends_on is distinct from old.depends_on then
    with recursive walk(issue_key) as (
      select unnest(new.depends_on)
      union
      select unnest(e.depends_on)
      from private.engineering_issues e
      join walk w on e.issue_key=w.issue_key
    )
    select exists(select 1 from walk where issue_key=new.issue_key) into v_cycle;

    if v_cycle then
      raise exception 'engineering_issue_dependency_cycle:%', new.issue_key;
    end if;
  end if;

  if jsonb_typeof(new.validation_contract) <> 'object' then
    raise exception 'engineering_issue_validation_contract_must_be_object:%', new.issue_key;
  end if;

  return new;
end;
$$;

revoke all on function private.validate_engineering_issue_relations() from public, anon, authenticated, service_role;

drop trigger if exists engineering_issues_relation_guard on private.engineering_issues;
create trigger engineering_issues_relation_guard
before insert or update of depends_on, conflicts_with, regression_surface, validation_contract
on private.engineering_issues
for each row execute function private.validate_engineering_issue_relations();
