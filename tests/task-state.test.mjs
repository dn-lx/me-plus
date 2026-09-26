import test from 'node:test'
import assert from 'node:assert/strict'
import { extractTaskState, validateTaskState, START, END } from '../scripts/task-state.mjs'

const active = {
  task_id: 'REQ-123',
  repository: 'owner/repo',
  base: 'dev',
  branch: 'feature/example',
  pr: 42,
  status: 'implementing',
  last_verified_sha: '0123456789abcdef0123456789abcdef01234567',
  next_step: 'Run targeted tests.',
  updated_at: '2026-09-24T00:00:00Z',
}

const idle = {
  task_id: null,
  repository: null,
  base: 'dev',
  branch: null,
  pr: null,
  status: 'idle',
  last_verified_sha: null,
  next_step: null,
  updated_at: '2026-09-24T00:00:00Z',
}

test('extracts one machine-readable task state block', () => {
  const text = `# Handoff\n\n${START}\n${JSON.stringify(active, null, 2)}\n${END}\n`
  assert.deepEqual(extractTaskState(text), active)
})

test('rejects duplicate task state blocks', () => {
  const block = `${START}\n${JSON.stringify(active)}\n${END}`
  assert.throws(() => extractTaskState(`${block}\n${block}`), /exactly one/)
})

test('requires PR for implementation and validates branch binding', () => {
  const errors = validateTaskState({ ...active, pr: null, branch: 'dev' })
  assert.ok(errors.some(error => error.includes('pr must be a positive integer')))
  assert.ok(errors.includes('working branch must differ from base'))
})

test('accepts an idle template state', () => {
  assert.deepEqual(validateTaskState(idle, 'dev'), [])
})

test('rejects active task state bound to a stale integration branch', () => {
  const errors = validateTaskState({ ...active, base: 'develop' }, 'dev')
  assert.ok(errors.includes('base must match integration branch: dev'))
})

test('rejects idle task state bound to a stale integration branch', () => {
  const errors = validateTaskState({ ...idle, base: 'develop' }, 'dev')
  assert.ok(errors.includes('base must match integration branch: dev'))
})
