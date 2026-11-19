import { readFile, stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { buildInvocation, ROUTER_AGENTS, runInvocation, validateTaskPacket } from './local-agent-router.mjs'

export const INTERFACES = Object.freeze(['chatgpt', 'claude', 'gemini'])
const DEFAULT_PROFILE = new URL('../.agents/router-profile.example.json', import.meta.url)

export function validateProfile(profile) {
  if (!profile || profile.version !== 1) throw new Error('Routing profile version must be 1')
  if (profile.execution?.mode !== 'local-router') throw new Error('execution.mode must be local-router')
  const allowed = profile.execution.allowedAgents
  if (!Array.isArray(allowed) || !allowed.length || allowed.some(agent => !Object.hasOwn(ROUTER_AGENTS, agent))) {
    throw new Error('execution.allowedAgents must contain only claude and/or gemini')
  }
  if (!profile.modelClasses || typeof profile.modelClasses !== 'object' || Array.isArray(profile.modelClasses)) {
    throw new Error('modelClasses must be an object')
  }
  for (const [name, route] of Object.entries(profile.modelClasses)) {
    if (!route || (route.agent !== 'coordinator' && !allowed.includes(route.agent))) {
      throw new Error(`Invalid agent for model class: ${name}`)
    }
  }
  const policy = profile.policy
  if (!policy || policy.nativeConnectorFirst !== true || policy.githubViaLocalRouter !== false ||
      policy.allowArbitraryShell !== false || policy.requireScopedTaskPacket !== true) {
    throw new Error('Routing profile must preserve connector, shell and scoped-packet policy')
  }
  validateTaskPacket({ version: 1, taskId: 'profile', outcome: 'Validate budgets', mode: 'plan',
    budget: { maxTurns: policy.defaultMaxTurns, timeoutMs: policy.defaultTimeoutMs } })
  return profile
}

export function planTask({ packet, profile, interface: caller = 'chatgpt', modelClass, cwd = process.cwd() }) {
  validateProfile(profile)
  validateTaskPacket(packet)
  if (!INTERFACES.includes(caller)) throw new Error('interface must be chatgpt, claude, or gemini')
  // Implementations use a coding worker by default; planning/review stays with
  // the coordinator unless a capability class is selected explicitly.
  const selectedClass = modelClass ?? (packet?.mode === 'implement' ? 'coding-high' : 'reasoning-high')
  if (!Object.hasOwn(profile.modelClasses, selectedClass)) throw new Error(`Unknown model class: ${selectedClass}`)
  const task = validateTaskPacket({ ...packet, budget: {
    maxTurns: profile.policy.defaultMaxTurns, timeoutMs: profile.policy.defaultTimeoutMs, ...packet?.budget,
  } })
  const agent = profile.modelClasses[selectedClass].agent
  return {
    version: 1, taskId: task.taskId, interface: caller, mode: task.mode,
    modelClass: selectedClass, agent, cwd: resolve(cwd),
    invocation: agent === 'coordinator' ? null : buildInvocation(agent, task, resolve(cwd)),
  }
}

export function normalizeResult(agent, result) {
  if (result.error || result.signal || result.status !== 0) {
    return { ok: false, status: 'worker_failed', exitCode: result.status,
      signal: result.signal, error: result.error || result.stderr || `Provider exited with status ${result.status}` }
  }
  let envelope
  try { envelope = JSON.parse(result.stdout) } catch {
    return { ok: false, status: 'invalid_provider_output', error: 'Provider did not return a JSON object' }
  }
  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) {
    return { ok: false, status: 'invalid_provider_output', error: 'Provider did not return a JSON object' }
  }
  if (envelope.is_error === true || envelope.error ||
      (agent === 'claude' && envelope.subtype && envelope.subtype !== 'success')) {
    return { ok: false, status: 'provider_error', error: envelope.error || envelope.result || envelope.subtype }
  }
  const response = agent === 'claude' ? envelope.result : envelope.response
  if (typeof response !== 'string' || !response.trim()) {
    return { ok: false, status: 'invalid_provider_output', error: 'Provider returned no final response' }
  }
  // Preserve only the useful final answer/usage. Do not persist raw envelopes,
  // prompts, session identifiers, stderr, or transcripts automatically.
  return { ok: true, status: 'worker_completed', response,
    usage: agent === 'claude' ? envelope.usage ?? null : envelope.stats ?? null }
}

export function executePlan(plan, runner = runInvocation) {
  const summary = { version: 1, taskId: plan.taskId, interface: plan.interface,
    mode: plan.mode, modelClass: plan.modelClass, agent: plan.agent,
    acceptanceVerified: false }
  if (plan.agent === 'coordinator') {
    return { ...summary, ok: true, status: 'coordinator_required',
      nextStep: 'Handle this task in the calling interface; no worker was started.' }
  }
  const result = normalizeResult(plan.agent, runner(plan.invocation))
  return { ...summary, ...result,
    nextStep: result.ok ? 'Coordinator must inspect the diff, run required checks and verify acceptance.' :
      'Resolve the provider failure before retrying; no fallback or automatic retry was performed.' }
}

export function parseOptions(args) {
  const options = { interface: 'chatgpt', execute: false, cwd: process.cwd() }
  const names = { '--task': 'taskPath', '--profile': 'profilePath', '--interface': 'interface',
    '--class': 'modelClass', '--cwd': 'cwd' }
  const seen = new Set()
  for (let i = 0; i < args.length; i++) {
    const flag = args[i]
    if (seen.has(flag)) throw new Error(`Duplicate option: ${flag}`)
    seen.add(flag)
    if (flag === '--execute') options.execute = true
    else if (flag === '--dry-run') options.dryRun = true
    else if (flag === '--help') options.help = true
    else if (Object.hasOwn(names, flag)) {
      if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error(`Missing value for ${flag}`)
      options[names[flag]] = args[++i]
    } else throw new Error(`Unknown option: ${flag}`)
  }
  if (options.execute && options.dryRun) throw new Error('Choose --execute or --dry-run')
  if (!options.help && !options.taskPath) throw new Error('Provide --task <task-packet.json>')
  return options
}

export async function main(args) {
  const options = parseOptions(args)
  if (options.help) {
    console.log('Usage: node scripts/agent-orchestrator.mjs --task packet.json [--interface chatgpt|claude|gemini] [--class capability] [--profile profile.json] [--cwd project] [--execute|--dry-run]')
    return
  }
  if (!(await stat(options.cwd)).isDirectory()) throw new Error('--cwd must be a project directory')
  const profile = JSON.parse(await readFile(options.profilePath ?? DEFAULT_PROFILE, 'utf8'))
  const packet = JSON.parse(await readFile(options.taskPath, 'utf8'))
  const plan = planTask({ ...options, packet, profile })
  const report = options.execute ? executePlan(plan) : { ...plan, status: 'preview', executed: false }
  console.log(JSON.stringify(report, null, 2))
  if (report.ok === false) process.exitCode = 1
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main(process.argv.slice(2)).catch(error => {
    console.log(JSON.stringify({ version: 1, ok: false, status: 'configuration_error', error: error.message }))
    process.exitCode = 1
  })
}
