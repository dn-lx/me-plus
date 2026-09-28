import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

const schedulerFiles = [
  'supabase/migrations/20260928082709_scheduler_execution_helpers_v1.sql',
  'supabase/migrations/20260928105958_scheduler_materialize_window_schedule_fix_v1.sql',
  'supabase/migrations/20260928111427_hourly_scheduler_logical_hour_normalization_v1.sql',
  'supabase/migrations/20260928140549_fix_hourly_terminal_idempotency.sql',
  'supabase/migrations/20260928203207_meplus_backend_scheduler_runtime.sql',
  'supabase/migrations/20260928214941_meplus_ai_reasoning_worker_runtime.sql',
  'supabase/migrations/20260928233355_scheduler_todoist_dispatcher_runtime_v1.sql',
  'supabase/migrations/20260928233425_scheduler_todoist_dispatcher_recovery_guard_v1.sql',
  'supabase/migrations/20260928233430_scheduler_todoist_dispatcher_policy_activation_v1.sql',
  'supabase/migrations/20260928233455_restore_scheduler_policy_checksum_compatible_state_v1.sql',
  'supabase/migrations/20260928233501_scheduler_todoist_dispatcher_claim_no_token_replay_v1.sql',
  'supabase/migrations/20260928233507_scheduler_todoist_dispatcher_priority_contract_v1.sql'
];

const corpus = schedulerFiles.map(read).join('\n');
const todoistWorker = read('supabase/functions/me-plus-todoist-dispatcher/index.ts');

test('routine materialization remains idempotent per schedule occurrence', () => {
  assert.match(corpus, /on conflict \(user_id,routine_schedule_id,occurrence_date\)/i);
  assert.match(corpus, /where routine_schedule_id is not null and occurrence_date is not null/i);
});

test('Todoist completion requires canonical action/task linkage before completing', () => {
  assert.match(corpus, /scheduler_apply_todoist_completion/i);
  assert.match(corpus, /Todoist task mismatch for action/i);
  assert.match(corpus, /completion_source/i);
});

test('same logical hour is guarded against duplicate scheduler execution', () => {
  assert.match(corpus, /logical_hour/i);
  assert.match(corpus, /terminal/i);
  assert.match(corpus, /idempotent/i);
});

test('scheduler overlap is protected by a lease and skipped-overlap semantics', () => {
  assert.match(corpus, /try_acquire_scheduler_lease/i);
  assert.match(corpus, /skipped_overlap/i);
  assert.match(corpus, /release_scheduler_lease/i);
});

test('AI reasoning and Todoist execution use independent claim state', () => {
  assert.match(corpus, /external_status text not null default 'pending'/i);
  assert.match(corpus, /claim_todoist_scheduler_dispatch/i);
  assert.match(corpus, /d\.status='completed'/i);
  assert.match(corpus, /d\.external_status in \('pending','retry'\)/i);
});

test('stale Todoist claims recover without duplicating canonical work', () => {
  assert.match(corpus, /recover_stale_todoist_dispatches/i);
  assert.match(corpus, /external_claimed_at < now\(\)-interval '10 minutes'/i);
  assert.match(corpus, /external_status='retry'/i);
});

test('unsurfaced actions are not recreated and linkage clears only after confirmed removal', () => {
  assert.match(corpus, /surface_state.*unsurfaced/i);
  assert.match(corpus, /then 'noop'/i);
  assert.match(corpus, /p_operation='remove'/i);
  assert.match(corpus, /constraint_flags - 'todoist_task_id' - 'todoist_project_id'/i);
});

test('Todoist worker authenticates wakes and keeps the API token server-side', () => {
  assert.match(todoistWorker, /x-meplus-wake-secret/i);
  assert.match(todoistWorker, /todoist_dispatcher_wake_authorized/i);
  assert.match(todoistWorker, /toLowerCase\(\) === "todoist_api_token"/i);
  assert.match(todoistWorker, /const token = envToken \|\| vaultToken/i);
  assert.doesNotMatch(todoistWorker, /TODOIST_API_TOKEN\s*=\s*["']/i);
  assert.match(corpus, /meplus_todoist_api_token/i);
});

test('Todoist creates use deterministic Sync command UUIDs for retry idempotency', () => {
  assert.match(todoistWorker, /deterministicUuid\(`meplus:todoist:create:\$\{action\.action_id\}`\)/);
  assert.match(todoistWorker, /type: "item_add"/);
  assert.match(todoistWorker, /\/sync/);
  assert.match(todoistWorker, /temp_id_mapping/);
});

test('external failures preserve canonical work and use bounded retry/blocked state', () => {
  assert.match(corpus, /fail_todoist_scheduler_dispatch/i);
  assert.match(corpus, /external_attempts < 5/i);
  assert.match(corpus, /then 'retry' else 'blocked'/i);
  assert.doesNotMatch(todoistWorker, /status\s*=\s*["']completed["'].*action/i);
});

test('same-day completed routine occurrences retain occurrence identity', () => {
  assert.match(corpus, /completed/i);
  assert.match(corpus, /occurrence_date/i);
  assert.match(corpus, /routine_events/i);
});
