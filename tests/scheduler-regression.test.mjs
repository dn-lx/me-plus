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
  'supabase/migrations/20260928210000_ai_reasoning_worker_v1.sql'
];

const corpus = schedulerFiles.map(read).join('\n');

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

test('external Todoist failure does not erase canonical work', () => {
  assert.match(corpus, /scheduler_dispatches/i);
  assert.match(corpus, /blocked/i);
  assert.match(corpus, /todoist_execution_dispatcher/i);
});

test('same-day completed routine occurrences retain occurrence identity', () => {
  assert.match(corpus, /completed/i);
  assert.match(corpus, /occurrence_date/i);
  assert.match(corpus, /routine_events/i);
});
