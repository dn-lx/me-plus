import test from 'node:test'
import assert from 'node:assert/strict'
import { estimateTokens, extractImports, measureStartupContext, checkStartupContext, DEFAULT_CONTEXT_BUDGET_TOKENS, DEFAULT_AGENTS_BUDGET_TOKENS } from '../scripts/context-budget.mjs'

test('token estimate is deterministic and import parsing is narrow', () => {
  assert.equal(estimateTokens('12345678'), 2)
  assert.deepEqual(
    extractImports('# bootstrap\n@AGENTS.md\n@./docs/PROJECT-MEMORY.md\ntext'),
    ['AGENTS.md', 'docs/PROJECT-MEMORY.md'],
  )
})

test('host startup context stays progressive and inside the default budget', async () => {
  const results = await measureStartupContext(process.cwd())
  for (const [host, info] of Object.entries(results)) {
    assert.ok(!info.paths.includes('docs/AGENT-PLATFORM-WORKFLOWS.md'), `${host} must not preload platform workflows`)
    assert.ok(info.paths.includes('AGENTS.md'))
    assert.ok(info.paths.includes('docs/PROJECT-MEMORY.md'))
    assert.ok(info.paths.includes('docs/CURRENT-HANDOFF.md'))
    assert.ok(info.estimated_tokens <= DEFAULT_CONTEXT_BUDGET_TOKENS, `${host} startup context exceeds default budget`)
  }
  const checked = await checkStartupContext()
  assert.equal(checked.ok, true)
  assert.ok(checked.agentsTokens <= DEFAULT_AGENTS_BUDGET_TOKENS)
})
