import { readFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

export const ROUTER_AGENTS = Object.freeze({
  claude: {
    command: 'claude',
    buildArgs: ({ prompt, mode, maxTurns }) => [
      '-p', prompt,
      '--output-format', 'json',
      '--max-turns', String(maxTurns),
      '--permission-mode', mode === 'implement' ? 'acceptEdits' : 'plan',
    ],
  },
  gemini: {
    command: 'gemini',
    buildArgs: ({ prompt, mode }) => [
      '-p', prompt,
      '--output-format', 'json',
      '--approval-mode', mode === 'implement' ? 'auto_edit' : 'plan',
    ],
  },
})

export function validateTaskPacket(packet) {
  if (!packet || typeof packet !== 'object' || Array.isArray(packet)) throw new Error('Task packet must be a JSON object')
  if (packet.version !== 1) throw new Error('Task packet version must be 1')
  if (typeof packet.taskId !== 'string' || !packet.taskId.trim()) throw new Error('taskId is required')
  if (typeof packet.outcome !== 'string' || !packet.outcome.trim()) throw new Error('outcome is required')
  if (!['plan', 'implement', 'review'].includes(packet.mode)) throw new Error('mode must be plan, implement, or review')
  if (packet.context?.files && !Array.isArray(packet.context.files)) throw new Error('context.files must be an array')
  if (packet.constraints && !Array.isArray(packet.constraints)) throw new Error('constraints must be an array')
  if (packet.acceptanceCriteria && !Array.isArray(packet.acceptanceCriteria)) throw new Error('acceptanceCriteria must be an array')
  if (packet.checks && !Array.isArray(packet.checks)) throw new Error('checks must be an array')

  const maxTurns = packet.budget?.maxTurns ?? 12
  const timeoutMs = packet.budget?.timeoutMs ?? 15 * 60 * 1000
  if (!Number.isInteger(maxTurns) || maxTurns < 1 || maxTurns > 50) throw new Error('budget.maxTurns must be an integer from 1 to 50')
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 60 * 60 * 1000) throw new Error('budget.timeoutMs must be from 1000 to 3600000')

  return { ...packet, budget: { ...packet.budget, maxTurns, timeoutMs } }
}

export function buildPrompt(packet) {
  const lines = [
    'You are a delegated local coding agent invoked through a restricted router.',
    'Security boundary: do not create or merge pull requests; do not commit, push, fetch, rebase, or otherwise mutate GitHub; do not run gh commands; do not change git branches.',
    'Work only on the scoped task and local project files needed for that task. GitHub operations are owned by the external coordinator through the native GitHub connector.',
    'Return a concise result describing files changed or proposed, checks run, failures, and any follow-up needed.',
    '',
    `Task ID: ${packet.taskId}`,
    `Mode: ${packet.mode}`,
    `Outcome: ${packet.outcome}`,
  ]

  const appendList = (label, values = []) => {
    if (!values.length) return
    lines.push('', `${label}:`)
    for (const value of values) lines.push(`- ${value}`)
  }

  appendList('Relevant files', packet.context?.files)
  appendList('Context notes', packet.context?.notes)
  appendList('Constraints', packet.constraints)
  appendList('Acceptance criteria', packet.acceptanceCriteria)
  appendList('Checks to run when permitted', packet.checks)

  return lines.join('\n')
}

export function buildInvocation(agent, packet, cwd = process.cwd()) {
  const adapter = ROUTER_AGENTS[agent]
  if (!adapter) throw new Error(`Unsupported agent: ${agent}. Allowed agents: ${Object.keys(ROUTER_AGENTS).join(', ')}`)
  const validated = validateTaskPacket(packet)
  const prompt = buildPrompt(validated)
  return {
    command: adapter.command,
    args: adapter.buildArgs({ prompt, mode: validated.mode, maxTurns: validated.budget.maxTurns }),
    cwd,
    timeoutMs: validated.budget.timeoutMs,
  }
}

export function runInvocation(invocation) {
  const result = spawnSync(invocation.command, invocation.args, {
    cwd: invocation.cwd,
    encoding: 'utf8',
    shell: false,
    timeout: invocation.timeoutMs,
    env: process.env,
  })

  return {
    status: result.status,
    signal: result.signal,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    error: result.error?.message || null,
  }
}

export function parseArgs(args) {
  const readValue = flag => {
    const index = args.indexOf(flag)
    return index >= 0 ? args[index + 1] : undefined
  }
  return {
    agent: readValue('--agent'),
    taskPath: readValue('--task'),
    cwd: readValue('--cwd') || process.cwd(),
    dryRun: args.includes('--dry-run'),
  }
}

export async function loadTaskPacket(path) {
  if (!path) throw new Error('Provide --task <task-packet.json>')
  return validateTaskPacket(JSON.parse(await readFile(path, 'utf8')))
}

const isMain = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url
if (isMain) {
  const options = parseArgs(process.argv.slice(2))
  if (!options.agent) throw new Error('Provide --agent claude|gemini')
  const packet = await loadTaskPacket(options.taskPath)
  const invocation = buildInvocation(options.agent, packet, options.cwd)

  if (options.dryRun) {
    console.log(JSON.stringify({ command: invocation.command, args: invocation.args, cwd: invocation.cwd, timeoutMs: invocation.timeoutMs }, null, 2))
  } else {
    const result = runInvocation(invocation)
    if (result.stdout) process.stdout.write(result.stdout)
    if (result.stderr) process.stderr.write(result.stderr)
    if (result.error) console.error(result.error)
    if (result.status !== 0) process.exitCode = result.status ?? 1
  }
}
