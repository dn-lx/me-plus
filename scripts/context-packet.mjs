import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { estimateTokens } from './context-budget.mjs'

export const DEFAULT_TASK_CONTEXT_BUDGET_TOKENS = 10000

export async function measureContextPacket(paths, {
  budget = Number(process.env.TASK_CONTEXT_BUDGET_TOKENS || DEFAULT_TASK_CONTEXT_BUDGET_TOKENS),
} = {}) {
  if (!Array.isArray(paths) || paths.length === 0) throw new Error('Provide at least one file path')
  if (!Number.isFinite(budget) || budget <= 0) throw new Error('Task context budget must be a positive number')

  const unique = [...new Set(paths)]
  const files = []
  let total = 0
  for (const path of unique) {
    const text = await readFile(path, 'utf8')
    const tokens = estimateTokens(text)
    files.push({ path, tokens })
    total += tokens
  }
  return { files, total, budget, ok: total <= budget }
}

export function parseContextPacketArgs(args) {
  const check = args.includes('--check')
  const budgetIndex = args.indexOf('--budget')
  const budget = budgetIndex >= 0 ? Number(args[budgetIndex + 1]) : undefined
  const paths = args.filter((arg, index) =>
    arg !== '--check' &&
    arg !== '--budget' &&
    !(budgetIndex >= 0 && index === budgetIndex + 1)
  )
  return { check, budget, paths }
}

const isMain = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url
if (isMain) {
  const { check, budget, paths } = parseContextPacketArgs(process.argv.slice(2))
  const result = await measureContextPacket(paths, budget === undefined ? {} : { budget })
  for (const file of result.files) console.log(`${file.path}: ~${file.tokens} tokens`)
  console.log(`Task packet: ~${result.total} / ${result.budget} tokens [${result.ok ? 'OK' : 'OVER'}]`)
  console.log('This is a context-efficiency guard, not a correctness limit. Broaden context when evidence requires it.')
  if (check && !result.ok) process.exit(1)
}
