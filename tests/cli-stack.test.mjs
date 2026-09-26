import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { curatedHosts } from '../scripts/agent-cli-doctor.mjs'

test('optional CLI host list stays intentionally small', () => {
  assert.deepEqual(
    curatedHosts.map(host => host.command),
    ['claude', 'codex', 'gemini', 'opencode'],
  )
})

test('CLI stack documents optional Claude tools and non-duplication rule', async () => {
  const doc = await readFile('docs/CLI-AGENT-STACK.md', 'utf8')
  for (const phrase of ['Ponytail', 'Superpowers', 'Code Review', 'claude-mem', 'Obsidian', 'REVIEW.md']) {
    assert.match(doc, new RegExp(phrase.replace('-', '\\-'), 'i'))
  }
  assert.match(doc, /does not auto-enable third-party Claude plugins/i)
  assert.match(doc, /Do\s*(?:\*\*)?not(?:\*\*)?\s+add Aider, Goose, Qwen Code, Kiro/i)
})

test('review contract uses dev to prod repository invariants', async () => {
  const review = await readFile('REVIEW.md', 'utf8')
  assert.match(review, /correctness/i)
  assert.match(review, /deterministic check results/i)
  assert.match(review, /dev/i)
  assert.match(review, /prod/i)
})
