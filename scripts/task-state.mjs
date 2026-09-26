import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

export const START = '<!-- AGENT_TASK_STATE_START -->'
export const END = '<!-- AGENT_TASK_STATE_END -->'

export const TASK_STATUSES = new Set([
  'idle',
  'planning',
  'implementing',
  'testing',
  'reviewing',
  'blocked',
  'interrupted',
  'ready_to_merge',
  'merged',
  'cancelled',
])

export function extractTaskState(text) {
  const start = text.indexOf(START)
  const end = text.indexOf(END)
  if (start < 0 || end < 0 || end <= start) throw new Error('Current Handoff must contain one AGENT_TASK_STATE block')

  const secondStart = text.indexOf(START, start + START.length)
  const secondEnd = text.indexOf(END, end + END.length)
  if (secondStart >= 0 || secondEnd >= 0) throw new Error('Current Handoff must contain exactly one AGENT_TASK_STATE block')

  const raw = text.slice(start + START.length, end).trim()
  try {
    return JSON.parse(raw)
  } catch (error) {
    throw new Error(`AGENT_TASK_STATE must be valid JSON: ${error.message}`)
  }
}

export function validateTaskState(state, expectedBase = null) {
  const errors = []
  if (!state || typeof state !== 'object' || Array.isArray(state)) return ['task state must be a JSON object']
  if (!TASK_STATUSES.has(state.status)) errors.push(`unsupported status: ${state.status}`)

  if (state.status === 'idle') {
    for (const key of ['task_id', 'repository', 'branch', 'pr', 'last_verified_sha', 'next_step']) {
      if (state[key] !== null) errors.push(`${key} must be null while status is idle`)
    }
  } else {
    if (typeof state.task_id !== 'string' || !state.task_id.trim()) errors.push('task_id is required')
    if (typeof state.repository !== 'string' || !/^[\w.-]+\/[\w.-]+$/.test(state.repository)) errors.push('repository must be owner/name')
    if (typeof state.branch !== 'string' || !state.branch.trim()) errors.push('branch is required')
    if (state.branch === state.base) errors.push('working branch must differ from base')

    const prRequired = !['planning', 'cancelled'].includes(state.status)
    if (prRequired && (!Number.isInteger(state.pr) || state.pr <= 0)) errors.push(`pr must be a positive integer while status is ${state.status}`)
    if (state.pr !== null && (!Number.isInteger(state.pr) || state.pr <= 0)) errors.push('pr must be null or a positive integer')

    if (state.last_verified_sha !== null && (typeof state.last_verified_sha !== 'string' || !/^[a-f0-9]{40}$/i.test(state.last_verified_sha))) {
      errors.push('last_verified_sha must be null or a 40-character commit SHA')
    }

    const terminal = ['merged', 'cancelled'].includes(state.status)
    if (!terminal && (typeof state.next_step !== 'string' || !state.next_step.trim())) errors.push('next_step is required for active tasks')
  }

  if (typeof state.base !== 'string' || !state.base.trim()) errors.push('base is required')
  if (expectedBase && state.base !== expectedBase) errors.push(`base must match integration branch: ${expectedBase}`)
  if (typeof state.updated_at !== 'string' || Number.isNaN(Date.parse(state.updated_at))) errors.push('updated_at must be an ISO-compatible date/time string')

  return [...new Set(errors)]
}

export async function checkTaskState(path = 'docs/CURRENT-HANDOFF.md', expectedBase = null) {
  const text = await readFile(path, 'utf8')
  const state = extractTaskState(text)
  const errors = validateTaskState(state, expectedBase)
  if (errors.length) {
    for (const error of errors) console.error(`Task state error: ${error}`)
    return { ok: false, state, errors }
  }

  const task = state.status === 'idle' ? 'idle' : `${state.task_id} on ${state.branch} (PR #${state.pr ?? 'pending'})`
  console.log(`Task state valid: ${task}; status=${state.status}`)
  return { ok: true, state, errors: [] }
}

const isMain = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url
if (isMain) {
  const pathArgIndex = process.argv.indexOf('--file')
  const path = pathArgIndex >= 0 ? process.argv[pathArgIndex + 1] : 'docs/CURRENT-HANDOFF.md'
  const { ok } = await checkTaskState(path)
  if (process.argv.includes('--check') && !ok) process.exit(1)
}
