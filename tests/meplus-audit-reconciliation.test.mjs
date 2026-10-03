import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const read = path => readFile(resolve(root, path), 'utf8')

test('reasoning routing separates generic health evidence from sleep evidence', async () => {
  const source = await read('supabase/functions/me-plus-reasoning-worker/index.ts')
  const start = source.indexOf('function detectObservedDomains(')
  const end = source.indexOf('function hasMaterialUncertainty(', start)
  assert.ok(start >= 0 && end > start, 'detectObservedDomains() must be present')
  const fn = source.slice(start, end)

  assert.match(fn, /if\(arrayLen\(healthLatest\)>0 \|\| state\?\.health\?\.body_state\) domains\.add\("health"\)/)
  assert.match(fn, /if\(state\?\.health\?\.sleep\) domains\.add\("sleep"\)/)
  assert.doesNotMatch(fn, /body_state[^\n]*domains\.add\("sleep"\)/)
})

test('fast operational routing requires structural authenticated Todoist intent', async () => {
  const source = await read('supabase/functions/me-plus-reasoning-worker/index.ts')
  const start = source.indexOf('function isSimpleAuthenticatedRoutineComment(')
  const end = source.indexOf('async function loadRouting(', start)
  assert.ok(start >= 0 && end > start, 'isSimpleAuthenticatedRoutineComment() must be present')
  const fn = source.slice(start, end)

  assert.match(fn, /signal_type[^\n]*todoist_routine_comment_intent/)
  assert.match(fn, /payload\?\.authenticated_user===true/)
  assert.match(fn, /payload\?\.comment_text===\"string\"/)
  assert.doesNotMatch(fn, /serializedContext\(/)
})

test('Todoist attachment evidence-only flag is true only when there is no instruction text', async () => {
  const source = await read('supabase/functions/me-plus-todoist-dispatcher/index.ts')
  assert.match(source, /attachment_evidence_only:\s*!text\s*&&\s*Boolean\(attachment\)/)
  assert.match(source, /attachment_instruction_authority:\s*false/)
})
