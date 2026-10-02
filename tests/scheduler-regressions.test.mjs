import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const migration = name => read(`supabase/migrations/${name}`);

const runtime = migration('20260929115343_move_scheduler_runtime_state_to_private_tables.sql');
const terminal = migration('20260928140549_fix_hourly_terminal_idempotency.sql');
const typed = migration('20260929122615_fix_db_001_typed_action_execution_surface_state.sql');
const marker = migration('20260928140635_close_completion_reconciliation_acceptance_run.sql');
const n26Daily = migration('20261002114500_n26_daily_provider_sync.sql');
const n26Worker = read('netlify/functions/n26-sync-background.mts');
const reducedCadences = migration('20261002100938_reduce_background_scheduler_cadences.sql');
const hourlyBackstops = migration('20261002101621_hourly_recovery_backstops.sql');

test('SCH-003: Todoist completion is reconciled into canonical action and routine state before surface cleanup', () => {
  assert.match(typed, /scheduler_reconcile_todoist_completion/);
  assert.match(typed, /scheduler_apply_todoist_completion/);
  assert.match(typed, /set status='completed'[\s\S]*surface_state='completed'/);
  assert.match(typed, /update public\.routine_events[\s\S]*status='completed'/);
  assert.match(typed, /if v_action\.status='completed'/);
});

test('SCH-006: same-day routine materialization suppresses regeneration after any occurrence event', () => {
  assert.match(runtime, /re\.occurrence_date=v_local_date/);
  assert.match(runtime, /and not exists \([\s\S]*from public\.routine_events re[\s\S]*re\.routine_id=r\.id/);
});

test('SCH-006: terminal hourly runs are idempotent and overlap is lease-protected', () => {
  assert.match(terminal, /v_existing_status in \('completed','no_op','failed'\)/);
  assert.match(terminal, /reason','idempotent_terminal_run'/);
  assert.match(terminal, /try_acquire_scheduler_lease/);
  assert.match(terminal, /status','skipped_overlap'/);
});

test('SCH-006: Todoist dispatcher claims work with skip-locked semantics and stale-claim recovery', () => {
  assert.match(typed, /for update skip locked/);
  assert.match(typed, /external_claimed_at < now\(\) - interval '10 minutes'/);
  assert.match(typed, /external_status in \('pending','retry'\)/);
});

test('SCH-005: historical production acceptance state is never replayed from Git', () => {
  assert.match(marker, /Historical migration marker only/);
  assert.match(marker, /Dynamic user\/run state is intentionally not replayed from Git/);
  assert.doesNotMatch(marker, /insert\s+into\s+(public\.)?(actions|routine_events|scheduler_run_log)/i);
  assert.doesNotMatch(marker, /update\s+(public\.)?(actions|routine_events|scheduler_run_log)/i);
});


test('N26 provider sync is daily and its watchdog cadence matches the clock', () => {
  assert.match(n26Daily, /schedule := '15 5 \* \* \*'/);
  assert.match(n26Daily, /expected_cadence_minutes = 1440/);
  assert.match(n26Daily, /'cadence', 'daily'/);
  assert.match(n26Daily, /'expected_cadence_minutes', 1440/);
  assert.doesNotMatch(n26Daily, /\*\/6/);
  assert.match(n26Worker, /const CADENCE_MINUTES = 1440;/);
});


test('Initial background polling reduction migration remains tracked', () => {
  assert.ok(reducedCadences.includes("schedule := '0 */2 * * *'"));
  assert.ok(reducedCadences.includes("schedule := '*/15 5-19 * * *'"));
  assert.ok(reducedCadences.includes("schedule := '*/15 10-11,16-17,22-23 * * *'"));
  assert.ok(reducedCadences.includes("'healthsync_drive_ingestion','invoked',null,null,120,10"));
  assert.ok(reducedCadences.includes("interval '2 hours'"));
});


test('Recovery backstops are hourly without removing their clocks', () => {
  assert.ok(hourlyBackstops.includes("schedule := '30 5-19 * * *'"));
  assert.ok(hourlyBackstops.includes("schedule := '30 10-11,16-17,22-23 * * *'"));
  assert.ok(hourlyBackstops.includes("recovery cron runs once per hour at minute 30"));
  assert.ok(hourlyBackstops.includes("Once per hour at minute 30"));
});


test('DST edge planner preserves hourly AI recovery and removes expired same-day edge jobs', () => {
  assert.ok(hourlyBackstops.includes("when 'ai' then format('30 %s %s %s *'"));
  assert.ok(hourlyBackstops.includes("where user_id=p_user_id and local_day <= v_day"));
  assert.ok(hourlyBackstops.includes("v_tomorrow := private.meplus_ensure_edge_cron_day(p_user_id,v_day+1)"));
});
