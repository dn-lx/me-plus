import { readFile, access } from 'node:fs/promises'

const required = [
  '.agents/project-policy.json',
  '.agents/SKILL-INDEX.md',
  '.agents/router-profile.example.json',
  'AGENTS.md',
  'REVIEW.md',
  'VERSION',
  'CHANGELOG.md',
  'CLAUDE.md',
  'GEMINI.md',
  '.github/copilot-instructions.md',
  '.github/PULL_REQUEST_TEMPLATE.md',
  '.github/dependabot.yml',
  '.github/workflows/agent-stack-validation.yml',
  '.github/workflows/guard-prod-production.yml',
  '.github/workflows/version-validation.yml',
  'docs/PROJECT-MEMORY.md',
  'docs/INDEX.md',
  'docs/OPERATIONS-RECOVERY.md',
  'docs/CURRENT-HANDOFF.md',
  'docs/REQUIREMENTS.md',
  'docs/MCP-SETUP.md',
  'docs/AGENT-PLATFORM-WORKFLOWS.md',
  'docs/AGENT-ORCHESTRATION.md',
  'docs/EXECUTION-ROUTING-POLICY.md',
  'docs/LOCAL-AGENT-ROUTER.md',
  'docs/MEMORY-CONTEXT-POLICY.md',
  'docs/DOCUMENTATION_POLICY.md',
  'docs/STACK-RESPONSIBILITY-MAP.md',
  'docs/DESIGN-STACK.md',
  'docs/BRANCH-LIFECYCLE.md',
  'docs/TASK-LIFECYCLE.md',
  'docs/VERSIONING.md',
  'docs/templates/REVIEW-PACKET-TEMPLATE.md',
  'docs/templates/RELEASE-SUMMARY-TEMPLATE.md',
  'docs/templates/OPERATIONS-RUNBOOK-TEMPLATE.md',
  'docs/templates/IMPLEMENTATION-PLAN-TEMPLATE.md',
  'docs/templates/VERIFICATION-EVIDENCE-TEMPLATE.md',
  'docs/templates/ANALYTICS-EVENT-CONTRACT-TEMPLATE.md',
  'docs/templates/FRONTEND-VISUAL-QA-TEMPLATE.md',
  'docs/templates/PLAYWRIGHT-VISUAL-SANITY.md',
  'scripts/context-budget.mjs',
  'scripts/validate-docs.mjs',
  'scripts/context-packet.mjs',
  'scripts/local-agent-router.mjs',
  'scripts/task-state.mjs',
  'scripts/sync-claude-skills.mjs',
  'scripts/validate-version.mjs',
  'tests/context-budget.test.mjs',
  'tests/documentation-consistency.test.mjs',
  'tests/context-packet.test.mjs',
  'tests/local-agent-router.test.mjs',
  'tests/task-state.test.mjs',
  'tests/lifecycle.test.mjs',
  'tests/workflow-capabilities.test.mjs',
  '.agents/skills/project-bootstrap/SKILL.md',
  '.agents/skills/task-routing/SKILL.md',
  '.agents/skills/task-continuity/SKILL.md',
  '.agents/skills/execution-routing/SKILL.md',
  '.agents/skills/memory-context/SKILL.md',
  '.agents/skills/mcp-usage/SKILL.md',
  '.agents/skills/implementation-planning/SKILL.md',
  '.agents/skills/test-engineering/SKILL.md',
  '.agents/skills/frontend-verification/SKILL.md',
  '.agents/skills/performance-budget/SKILL.md',
  '.agents/skills/analytics-contract/SKILL.md',
  '.agents/skills/design-stack/SKILL.md',
  '.agents/skills/motion-runtime/SKILL.md',
  '.agents/skills/quality-gates/SKILL.md',
  '.agents/skills/security-boundary-review/SKILL.md',
  '.agents/skills/release-readiness/SKILL.md',
  '.agents/skills/release-workflow/SKILL.md',
  '.agents/superpowers/README.md',
  '.agents/superpowers/resume-project/SUPERPOWER.md',
  '.agents/superpowers/finish-feature/SUPERPOWER.md',
  '.agents/superpowers/fix-until-green/SUPERPOWER.md',
  '.agents/superpowers/recover-production/SUPERPOWER.md',
  '.agents/superpowers/full-qa/SUPERPOWER.md',
  '.agents/superpowers/ship-release/SUPERPOWER.md',
  '.agents/superpowers/project-doctor/SUPERPOWER.md',
]

const missing = []
for (const path of required) {
  try { await access(path) } catch { missing.push(path) }
}
if (missing.length) {
  console.error('Missing required core agent-stack files:')
  for (const path of missing) console.error(`- ${path}`)
  process.exit(1)
}

const policy = JSON.parse(await readFile('.agents/project-policy.json', 'utf8'))
if (policy.schema_version !== 1) throw new Error('Unsupported project-policy schema_version')
const integration = policy.branches?.integration
const production = policy.branches?.production
if (!integration || !production || integration === production) throw new Error('project-policy must define distinct integration and production branches')
if (!Array.isArray(policy.branches?.work_prefixes) || policy.branches.work_prefixes.length === 0) {
  throw new Error('project-policy must define work_prefixes')
}

const routerProfile = JSON.parse(await readFile('.agents/router-profile.example.json', 'utf8'))
if (routerProfile.version !== 1) throw new Error('Unsupported router profile version')
if (routerProfile.execution?.mode !== 'local-router') throw new Error('Router profile must demonstrate local-router mode')
if (JSON.stringify(routerProfile.execution?.allowedAgents) !== JSON.stringify(['claude', 'gemini'])) {
  throw new Error('Local router allowlist must contain only claude and gemini')
}
if (routerProfile.policy?.githubViaLocalRouter !== false || routerProfile.policy?.allowArbitraryShell !== false) {
  throw new Error('Router profile must forbid GitHub-through-local-router and arbitrary shell execution')
}

for (const adapter of ['CLAUDE.md', 'GEMINI.md', '.github/copilot-instructions.md']) {
  const content = await readFile(adapter, 'utf8')
  if (!content.includes('AGENTS.md')) throw new Error(`${adapter} must point back to canonical AGENTS.md`)
}

const agents = await readFile('AGENTS.md', 'utf8')
for (const phrase of [
  '.agents/project-policy.json',
  integration,
  production,
  'docs/PROJECT-MEMORY.md',
  'docs/CURRENT-HANDOFF.md',
  'docs/REQUIREMENTS.md',
  'docs/MCP-SETUP.md',
  'task-routing',
  'task-continuity',
  'execution-routing',
  'quality-gates',
  'security-boundary-review',
  'release-workflow',
  'design-stack',
  'motion-runtime',
  'implementation-planning',
  'test-engineering',
  'frontend-verification',
  'performance-budget',
  'analytics-contract',
  '.agents/superpowers/',
]) {
  if (!agents.includes(phrase)) throw new Error(`AGENTS.md is missing required reference: ${phrase}`)
}

try {
  await access('.github/pull_request_template.md')
  throw new Error('Duplicate PR template found: keep only .github/PULL_REQUEST_TEMPLATE.md')
} catch (error) {
  if (error.code !== 'ENOENT') throw error
}

const { checkTaskState } = await import('./task-state.mjs')
const taskState = await checkTaskState(undefined, integration)
if (!taskState.ok) process.exit(1)

for (const file of ['CLAUDE.md', 'GEMINI.md']) {
  const content = await readFile(file, 'utf8')
  const imports = content.split(/\r?\n/).filter(line => line.startsWith('@')).map(line => line.slice(1).replace(/^\.\//, ''))
  for (const path of ['AGENTS.md', 'docs/PROJECT-MEMORY.md', 'docs/CURRENT-HANDOFF.md']) {
    if (!imports.includes(path)) throw new Error(`${file} must explicitly import ${path}`)
    await access(path)
  }
  if (imports.includes('docs/AGENT-PLATFORM-WORKFLOWS.md')) {
    throw new Error(`${file} must load platform workflows on demand, not in static startup context`)
  }
}

const { sync } = await import('./sync-claude-skills.mjs')
console.log(`Claude adapters verified: ${await sync(process.cwd())}`)

const { checkStartupContext } = await import('./context-budget.mjs')
const context = await checkStartupContext()
if (!context.ok) process.exit(1)

console.log(`Core agent stack valid: ${required.length} required files; branch policy ${integration} → ${production}.`)
