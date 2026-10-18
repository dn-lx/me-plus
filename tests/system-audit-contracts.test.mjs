import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const migration = read(
  'supabase/migrations/20261001013608_audit_unify_quality_state_signal_and_routine_lifecycle_v1.sql',
);
const viewSecurity = read(
  'supabase/migrations/20261001014026_fix_personal_state_view_security_invoker_v1.sql',
);

test('health quality uses the canonical decision-rejection vocabulary end to end', () => {
  assert.match(migration, /new\.quality:='rejected_for_decision_use'/);
  assert.doesNotMatch(migration, /new\.quality:='rejected';/);
  assert.match(migration, /quality='rejected_for_decision_use'[\s\S]*quality='rejected'/);
  assert.match(
    migration,
    /not in\s*\(\s*'rejected','rejected_for_decision_use','corrected\/superseded'\s*\)/,
  );
});

test('Personal State v2 derives its summary and due-routine array from one as-of contract', () => {
  assert.match(migration, /create or replace function public\.get_personal_state_summary/);
  assert.match(migration, /v_due:=public\.get_due_routines\(p_user_id,p_as_of\)/);
  assert.match(migration, /'due_routine_count',jsonb_array_length\(coalesce\(v_due,'\[\]'::jsonb\)\)/);
  assert.match(migration, /'schema_version','v2'/);
  assert.doesNotMatch(
    migration.match(/create or replace function public\.get_due_routines[\s\S]*?\$\$;/)?.[0] ?? '',
    /me_scheduler_probe/,
  );
});

test('Personal State compatibility view remains caller-RLS scoped', () => {
  assert.match(
    viewSecurity,
    /alter view public\.current_personal_state_inputs set \(security_invoker = true\)/,
  );
});

test('stale routine occurrences become terminal once their local occurrence day is over', () => {
  assert.match(migration, /create or replace function private\.reconcile_stale_routine_occurrences/);
  assert.match(migration, /re\.occurrence_date<v_local_date/);
  assert.match(migration, /set status='expired'/);
  assert.match(migration, /set status='missed'/);
  assert.match(
    migration,
    /perform private\.reconcile_stale_routine_occurrences\(p_user_id,v_logical_hour\)/,
  );
});

test('completed reasoning dispatches consume the scheduler signals they evaluated', () => {
  assert.match(migration, /mark_completed_dispatch_signals_processed/);
  assert.match(migration, /new\.status='completed'/);
  assert.match(migration, /set status='processed'/);
  assert.match(migration, /trg_scheduler_dispatch_process_signals/);
  assert.match(migration, /pending_scheduler_signals/);
});

test('new foreign keys introduced by runtime control planes retain covering indexes', () => {
  assert.match(migration, /scheduler_runtime_exceptions_user_id_idx/);
  assert.match(migration, /source_sync_leases_data_source_id_idx/);
  assert.match(migration, /source_sync_leases_sync_run_id_idx/);
});
