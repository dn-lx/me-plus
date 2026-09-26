import test from 'node:test'
import assert from 'node:assert/strict'
import { buildInvocation, buildPrompt, ROUTER_AGENTS, validateTaskPacket } from '../scripts/local-agent-router.mjs'

const packet = {
  version: 1,
  taskId: 'router-test',
  mode: 'implement',
  outcome: 'Make a scoped implementation change',
  context: { files: ['src/example.js'], notes: ['Keep the API stable'] },
  constraints: ['No GitHub operations'],
  acceptanceCriteria: ['Change is testable'],
  checks: ['node --test'],
  budget: { maxTurns: 7, timeoutMs: 30000 },
}

test('router executable allowlist contains only Claude and Gemini', () => {
  assert.deepEqual(Object.keys(ROUTER_AGENTS), ['claude', 'gemini'])
  assert.deepEqual(Object.values(ROUTER_AGENTS).map(agent => agent.command), ['claude', 'gemini'])
})

test('task packets are validated and receive bounded defaults', () => {
  const validated = validateTaskPacket({
    version: 1,
    taskId: 'x',
    mode: 'review',
    outcome: 'Review the change',
  })
  assert.equal(validated.budget.maxTurns, 12)
  assert.equal(validated.budget.timeoutMs, 900000)
  assert.throws(() => validateTaskPacket({ ...packet, mode: 'deploy' }), /mode must be/)
  assert.throws(() => validateTaskPacket({ ...packet, budget: { maxTurns: 100 } }), /maxTurns/)
})

test('unsupported agents cannot become arbitrary commands', () => {
  assert.throws(() => buildInvocation('bash', packet), /Unsupported agent/)
  assert.throws(() => buildInvocation('git', packet), /Unsupported agent/)
  assert.throws(() => buildInvocation('gh', packet), /Unsupported agent/)
})

test('delegated prompt reserves GitHub mutations for native connector', () => {
  const prompt = buildPrompt(validateTaskPacket(packet))
  assert.match(prompt, /do not create or merge pull requests/i)
  assert.match(prompt, /do not commit, push, fetch, rebase/i)
  assert.match(prompt, /do not run gh commands/i)
  assert.match(prompt, /native GitHub connector/i)
})

test('Claude and Gemini invocations use non-interactive structured output', () => {
  const claude = buildInvocation('claude', packet, '/tmp/project')
  assert.equal(claude.command, 'claude')
  assert.deepEqual(claude.args.slice(0, 1), ['-p'])
  assert.ok(claude.args.includes('--output-format'))
  assert.ok(claude.args.includes('--max-turns'))
  assert.ok(claude.args.includes('acceptEdits'))
  assert.equal(claude.cwd, '/tmp/project')

  const gemini = buildInvocation('gemini', packet, '/tmp/project')
  assert.equal(gemini.command, 'gemini')
  assert.deepEqual(gemini.args.slice(0, 1), ['-p'])
  assert.ok(gemini.args.includes('--output-format'))
  assert.ok(gemini.args.includes('--approval-mode'))
  assert.ok(gemini.args.includes('auto_edit'))
})
