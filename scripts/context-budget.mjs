import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

export const DEFAULT_CONTEXT_BUDGET_TOKENS = 6000
export const DEFAULT_AGENTS_BUDGET_TOKENS = 2800

export function estimateTokens(text) {
  return Math.ceil(Buffer.byteLength(text, 'utf8') / 4)
}

export function extractImports(text) {
  return text
    .split(/\r?\n/)
    .filter(line => line.startsWith('@'))
    .map(line => line.slice(1).replace(/^\.\//, '').trim())
    .filter(Boolean)
}

async function read(root, path) {
  return readFile(join(root, path), 'utf8')
}

export async function measureStartupContext(root = process.cwd()) {
  const specs = {
    claude: { bootstrap: 'CLAUDE.md', imports: true },
    gemini: { bootstrap: 'GEMINI.md', imports: true },
    copilot: {
      bootstrap: '.github/copilot-instructions.md',
      explicit: ['AGENTS.md', 'docs/PROJECT-MEMORY.md', 'docs/CURRENT-HANDOFF.md'],
    },
  }

  const results = {}
  for (const [host, spec] of Object.entries(specs)) {
    const bootstrapText = await read(root, spec.bootstrap)
    const paths = [spec.bootstrap]
    if (spec.imports) paths.push(...extractImports(bootstrapText))
    if (spec.explicit) paths.push(...spec.explicit)

    const uniquePaths = [...new Set(paths)]
    const texts = await Promise.all(uniquePaths.map(path => read(root, path)))
    const combined = texts.join('\n')

    results[host] = {
      paths: uniquePaths,
      characters: combined.length,
      utf8_bytes: Buffer.byteLength(combined, 'utf8'),
      estimated_tokens: estimateTokens(combined),
    }
  }
  return results
}

export async function checkStartupContext({
  root = process.cwd(),
  budget = Number(process.env.CONTEXT_BUDGET_TOKENS || DEFAULT_CONTEXT_BUDGET_TOKENS),
  agentsBudget = Number(process.env.AGENTS_CONTEXT_BUDGET_TOKENS || DEFAULT_AGENTS_BUDGET_TOKENS),
} = {}) {
  if (!Number.isFinite(budget) || budget <= 0) throw new Error('CONTEXT_BUDGET_TOKENS must be a positive number')
  if (!Number.isFinite(agentsBudget) || agentsBudget <= 0) throw new Error('AGENTS_CONTEXT_BUDGET_TOKENS must be a positive number')

  const results = await measureStartupContext(root)
  let ok = true

  for (const [host, info] of Object.entries(results)) {
    const status = info.estimated_tokens <= budget ? 'OK' : 'OVER'
    console.log(`${host}: ~${info.estimated_tokens} tokens, ${info.utf8_bytes} UTF-8 bytes, ${info.paths.length} startup files [${status}]`)
    if (info.estimated_tokens > budget) ok = false
  }

  const agentsText = await read(root, 'AGENTS.md')
  const agentsTokens = estimateTokens(agentsText)
  const agentsStatus = agentsTokens <= agentsBudget ? 'OK' : 'OVER'
  console.log(`AGENTS.md: ~${agentsTokens} / ${agentsBudget} tokens [${agentsStatus}]`)
  if (agentsTokens > agentsBudget) ok = false

  console.log(`Startup context budget: ~${budget} estimated tokens per host.`)
  console.log('Estimate uses roughly 4 UTF-8 bytes per token and is for regression control, not provider billing.')
  return { ok, budget, agentsBudget, agentsTokens, results }
}

const isMain = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url
if (isMain) {
  const check = process.argv.includes('--check')
  const { ok } = await checkStartupContext()
  if (check && !ok) process.exit(1)
}
