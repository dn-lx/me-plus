import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, mkdtemp, writeFile, chmod, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { executePlan, normalizeResult, parseOptions, planTask, validateProfile } from '../scripts/agent-orchestrator.mjs'

const profile = JSON.parse(await readFile(new URL('../.agents/router-profile.example.json', import.meta.url)))
const packet = { version: 1, taskId: 'test', outcome: 'Scoped change', mode: 'implement' }
const success = stdout => ({ status: 0, stdout: JSON.stringify(stdout), stderr: '', error: null, signal: null })

test('all three interfaces can delegate to either allowlisted worker', () => {
  for (const caller of ['chatgpt', 'claude', 'gemini']) {
    for (const [modelClass, agent] of [['coding-high', 'claude'], ['long-context', 'gemini']]) {
      const plan = planTask({ packet, profile, interface: caller, modelClass })
      assert.equal(plan.agent, agent)
      const result = executePlan(plan, () => success(agent === 'claude' ? { result: 'done' } : { response: 'done' }))
      assert.equal(result.interface, caller)
      assert.equal(result.status, 'worker_completed')
      assert.equal(result.acceptanceVerified, false)
      assert.equal(result.response, 'done')
    }
  }
})

test('coordinator assignments never start a worker or pretend acceptance', () => {
  const plan = planTask({ packet: { ...packet, mode: 'review' }, profile })
  const result = executePlan(plan, () => assert.fail('Worker should not run'))
  assert.equal(plan.invocation, null)
  assert.equal(result.status, 'coordinator_required')
  assert.equal(result.acceptanceVerified, false)
})

test('profile budgets are applied, packet budgets override them', () => {
  const custom = structuredClone(profile)
  custom.policy.defaultMaxTurns = 3
  custom.policy.defaultTimeoutMs = 5000
  const plan = planTask({ packet, profile: custom })
  assert.equal(plan.invocation.timeoutMs, 5000)
  assert.equal(plan.invocation.args[plan.invocation.args.indexOf('--max-turns') + 1], '3')
  const overridden = planTask({ packet: { ...packet, budget: { timeoutMs: 6000 } }, profile: custom })
  assert.equal(overridden.invocation.timeoutMs, 6000)
})

test('invalid configuration and prototype properties fail before spawning', () => {
  for (const modelClass of ['missing', 'constructor', '__proto__']) {
    assert.throws(() => planTask({ packet, profile, modelClass }), /Unknown model class/)
  }
  assert.throws(() => planTask({ packet, profile, interface: 'bash' }), /interface/)
  const custom = structuredClone(profile)
  custom.modelClasses['coding-high'].agent = 'bash'
  assert.throws(() => validateProfile(custom), /Invalid agent/)
  custom.execution.allowedAgents.push('bash')
  assert.throws(() => validateProfile(custom), /allowedAgents/)
  const unsafe = structuredClone(profile)
  unsafe.policy.allowArbitraryShell = true
  assert.throws(() => validateProfile(unsafe), /policy/)
  for (const bad of [null, [], 'notes']) {
    assert.throws(() => planTask({ packet: { ...packet, context: bad }, profile }), /context/)
    assert.throws(() => planTask({ packet: { ...packet, budget: bad }, profile }), /budget/)
  }
  assert.throws(() => planTask({ packet: { ...packet, context: { notes: ['valid', {}] } }, profile }), /notes/)
})

test('process and provider failures do not trigger retries or report success', () => {
  const plan = planTask({ packet, profile })
  const failures = [
    { status: null, signal: null, error: 'spawn claude ENOENT' },
    { status: null, signal: 'SIGKILL', error: 'ETIMEDOUT' },
    { status: 1, stderr: 'Please sign in' },
    success({ is_error: true, result: 'Turn limit reached' }),
    success({ subtype: 'error_max_turns', result: 'Limit reached' }),
    success({ result: '' }),
    { status: 0, stdout: 'not json' },
    success([]), success(null),
  ]
  for (const failure of failures) {
    let calls = 0
    const result = executePlan(plan, () => { calls++; return failure })
    assert.equal(calls, 1)
    assert.equal(result.ok, false)
    assert.equal(result.acceptanceVerified, false)
  }
  assert.equal(normalizeResult('gemini', success({ response: 'partial', error: { message: 'auth failure' } })).ok, false)
})

test('CLI requires explicit execution and rejects ambiguous flags', () => {
  assert.equal(parseOptions(['--task', 'packet.json']).execute, false)
  assert.equal(parseOptions(['--task', 'packet.json', '--execute']).execute, true)
  for (const args of [['--task'], ['--unknown'], ['--task', 'x', '--execute', '--dry-run'], ['--task', 'x', '--task', 'y']]) {
    assert.throws(() => parseOptions(args))
  }
})

test('real subprocess path previews without credentials and preserves literal prompt text', { skip: process.platform === 'win32' }, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'model-orchestrator-'))
  const script = resolve('scripts/agent-orchestrator.mjs')
  const env = { ...process.env, PATH: `${dir}:/usr/bin:/bin` }
  const file = join(dir, 'task.json')
  const marker = join(dir, 'injected')
  try {
    await writeFile(file, JSON.stringify({ ...packet, outcome: `Literal $(touch ${marker}); echo ignored` }))
    const run = args => spawnSync(process.execPath, [script, '--task', file, '--cwd', dir, ...args], { env, encoding: 'utf8', timeout: 10000 })
    const preview = run([])
    assert.equal(preview.status, 0, preview.stderr)
    assert.equal(JSON.parse(preview.stdout).executed, false)
    const worker = join(dir, 'claude')
    await writeFile(worker, `#!${process.execPath}\nconst args = process.argv.slice(2); console.log(JSON.stringify({result: args[1], usage: {input_tokens: 1}}))\n`)
    await chmod(worker, 0o700)
    const executed = run(['--execute'])
    assert.equal(executed.status, 0, executed.stderr)
    const report = JSON.parse(executed.stdout)
    assert.equal(report.status, 'worker_completed')
    assert.ok(report.response.includes(`$(touch ${marker})`))
    await assert.rejects(readFile(marker), { code: 'ENOENT' })
    const geminiWorker = join(dir, 'gemini')
    await writeFile(geminiWorker, `#!${process.execPath}\nconsole.log(JSON.stringify({response:'Gemini response', stats:{tokens:1}}))\n`)
    await chmod(geminiWorker, 0o700)
    const gemini = run(['--class', 'long-context', '--interface', 'gemini', '--execute'])
    assert.equal(gemini.status, 0, gemini.stderr)
    assert.equal(JSON.parse(gemini.stdout).response, 'Gemini response')
    await writeFile(worker, `#!${process.execPath}\nconsole.log(JSON.stringify({is_error:true,result:'Not logged in'}))\n`)
    const failed = run(['--execute'])
    assert.equal(failed.status, 1)
    assert.equal(JSON.parse(failed.stdout).status, 'provider_error')
    await writeFile(worker, `#!${process.execPath}\nsetInterval(()=>{}, 1000)\n`)
    await writeFile(file, JSON.stringify({ ...packet, budget: { timeoutMs: 1000 } }))
    const timedOut = run(['--execute'])
    assert.equal(timedOut.status, 1)
    assert.equal(JSON.parse(timedOut.stdout).status, 'worker_failed')
    assert.equal(JSON.parse(timedOut.stdout).signal, 'SIGKILL')
    await writeFile(file, JSON.stringify({ ...packet, mode: 'review' }))
    assert.equal(JSON.parse(run(['--execute']).stdout).status, 'coordinator_required')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
