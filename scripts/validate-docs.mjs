import { access, readFile, readdir } from 'node:fs/promises'
import { dirname, join, normalize, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'

const IGNORE_DIRS = new Set(['.git', 'node_modules', '.graphify', '.venv', '.venv-graphify'])

function unix(path) {
  return path.split(sep).join('/')
}

async function walk(root, current = '.') {
  const abs = resolve(root, current)
  const entries = await readdir(abs, { withFileTypes: true })
  const files = [], dirs = []
  for (const entry of entries) {
    if (entry.name.startsWith('.') && !['.agents', '.claude', '.github'].includes(entry.name)) {
      if (entry.isDirectory()) continue
    }
    if (entry.isDirectory() && IGNORE_DIRS.has(entry.name)) continue
    const rel = unix(join(current, entry.name)).replace(/^\.\//, '')
    if (entry.isDirectory()) {
      dirs.push(rel)
      const nested = await walk(root, rel)
      files.push(...nested.files)
      dirs.push(...nested.dirs)
    } else {
      files.push(rel)
    }
  }
  return { files, dirs }
}

function isExternal(target) {
  return /^(?:https?:|mailto:|tel:|data:|#)/i.test(target)
}

function cleanTarget(target) {
  const value = target.trim().replace(/^<|>$/g, '')
  return value.split('#')[0].split('?')[0].replace(/\/+$/, '')
}

function skipTemplatePath(target) {
  return !target || /[<>{}*]/.test(target) || target.includes('...')
}

export function findLegacyBranchTerms(content, integration, production) {
  const configured = new Set([integration, production])
  const knownBranchNames = ['dev', 'prod', 'develop', 'main', 'master']
  const findings = new Set()

  const codeSpans = [...content.matchAll(/`([^`]+)`/g)].map(match => match[1])
  for (const span of codeSpans) {
    for (const branch of knownBranchNames) {
      if (configured.has(branch)) continue
      if (new RegExp(`(^|[^A-Za-z0-9_.-])${branch}([^A-Za-z0-9_.-]|$)`).test(span)) findings.add(branch)
    }
  }

  const phrasePatterns = [
    /\bmerge(?:s|d)?\s+(?:only\s+)?into\s+([A-Za-z0-9._/-]+)\b/gi,
    /\brelease(?:s|d)?\s+(?:only\s+)?to\s+([A-Za-z0-9._/-]+)\b/gi,
  ]
  for (const pattern of phrasePatterns) {
    for (const match of content.matchAll(pattern)) {
      const branch = match[1]
      if (knownBranchNames.includes(branch) && !configured.has(branch)) findings.add(branch)
    }
  }

  return [...findings]
}

export async function validateDocs(root = process.cwd(), { strictProject = false } = {}) {
  const errors = []
  const { files, dirs } = await walk(root)
  const pathSet = new Set([...files, ...dirs])

  const markdown = files.filter(path => path.endsWith('.md'))
  const contents = new Map()
  for (const path of markdown) contents.set(path, await readFile(resolve(root, path), 'utf8'))

  // Markdown links are relative to the document containing them.
  for (const [path, content] of contents) {
    const linkPattern = /\[[^\]]*\]\(([^)]+)\)/g
    let match
    while ((match = linkPattern.exec(content))) {
      const raw = match[1].trim().split(/\s+["']/)[0]
      if (isExternal(raw)) continue
      const target = cleanTarget(raw)
      if (skipTemplatePath(target)) continue
      const resolved = unix(normalize(join(dirname(path), target)))
      if (!pathSet.has(resolved)) errors.push(`${path}: broken markdown link -> ${raw}`)
    }

    // Backticked repository-root paths are common in agent instructions.
    const repoPathPattern = /`((?:\.agents\/|docs\/|scripts\/|tests\/|\.github\/)[^`\s]+|AGENTS\.md|README\.md|REVIEW\.md|CLAUDE\.md|GEMINI\.md|CHANGELOG\.md|VERSION)`/g
    while ((match = repoPathPattern.exec(content))) {
      const target = cleanTarget(match[1].replace(/[),.;:]+$/, ''))
      if (skipTemplatePath(target)) continue
      if (!pathSet.has(target)) errors.push(`${path}: missing referenced repository path -> ${target}`)
    }
  }

  const policy = JSON.parse(await readFile(resolve(root, '.agents/project-policy.json'), 'utf8'))
  const integration = policy.branches?.integration
  const production = policy.branches?.production
  const branchPolicyDocs = [
    'AGENTS.md',
    'README.md',
    'REVIEW.md',
    '.github/PULL_REQUEST_TEMPLATE.md',
    'docs/AGENT-PLATFORM-WORKFLOWS.md',
    'docs/BRANCH-LIFECYCLE.md',
    'docs/PROJECT-BOOTSTRAP-CHECKLIST.md',
    'docs/PROJECT-MEMORY.md',
    'docs/TASK-LIFECYCLE.md',
    'docs/VERSIONING.md',
    '.agents/skills/dependency-maintenance/SKILL.md',
    '.agents/skills/project-bootstrap/SKILL.md',
    '.agents/skills/quality-gates/SKILL.md',
    '.agents/skills/release-readiness/SKILL.md',
    '.agents/skills/release-workflow/SKILL.md',
    '.agents/skills/task-continuity/SKILL.md',
    '.agents/superpowers/finish-feature/SUPERPOWER.md',
    '.agents/superpowers/resume-project/SUPERPOWER.md',
    '.agents/superpowers/ship-release/SUPERPOWER.md',
  ]
  for (const path of branchPolicyDocs) {
    const content = contents.get(path)
    if (!content) continue
    const legacy = findLegacyBranchTerms(content, integration, production)
    for (const term of legacy) errors.push(`${path}: stale branch token "${term}" conflicts with policy ${integration} → ${production}`)
  }

  for (const path of [
    '.github/workflows/agent-stack-validation.yml',
    '.github/workflows/guard-prod-production.yml',
    '.github/workflows/security.yml',
    '.github/workflows/version-validation.yml',
  ]) {
    const content = await readFile(resolve(root, path), 'utf8')
    if (!new RegExp(`\\b${integration}\\b`).test(content)) errors.push(`${path}: integration branch ${integration} is not represented`)
    if (!new RegExp(`\\b${production}\\b`).test(content)) errors.push(`${path}: production branch ${production} is not represented`)
  }

  const skillDirs = (await readdir(resolve(root, '.agents/skills'), { withFileTypes: true }))
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .sort()
  const skillIndex = await readFile(resolve(root, '.agents/SKILL-INDEX.md'), 'utf8')
  for (const skill of skillDirs) {
    if (!skillIndex.includes(`\`${skill}\``)) errors.push(`.agents/SKILL-INDEX.md: missing skill ${skill}`)
  }

  const superpowerDirs = (await readdir(resolve(root, '.agents/superpowers'), { withFileTypes: true }))
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .sort()
  const superpowerIndex = await readFile(resolve(root, '.agents/superpowers/README.md'), 'utf8')
  for (const superpower of superpowerDirs) {
    if (!superpowerIndex.includes(`\`${superpower}\``)) errors.push(`.agents/superpowers/README.md: missing superpower ${superpower}`)
  }

  const docsIndex = await readFile(resolve(root, 'docs/INDEX.md'), 'utf8')
  const topLevelDocs = markdown.filter(path => /^docs\/[^/]+\.md$/.test(path) && path !== 'docs/INDEX.md')
  for (const path of topLevelDocs) {
    if (!docsIndex.includes(`\`${path}\``)) errors.push(`docs/INDEX.md: missing top-level document ${path}`)
  }

  if (strictProject) {
    const memory = contents.get('docs/PROJECT-MEMORY.md') || ''
    if (/\bTODO\b/.test(memory)) errors.push('docs/PROJECT-MEMORY.md: unresolved TODO placeholder in strict project mode')

    const mcp = contents.get('docs/MCP-SETUP.md') || ''
    if (/\|\s*TODO(?:\s*\/[^|]*)?\s*\|/.test(mcp)) {
      errors.push('docs/MCP-SETUP.md: unresolved table TODO placeholder in strict project mode')
    }
    const requirements = contents.get('docs/REQUIREMENTS.md') || ''
    if (/YYYY-MM-DD|Short requirement title|Example foundational work|Example product work|Example QA\/release work/.test(requirements)) {
      errors.push('docs/REQUIREMENTS.md: starter examples/placeholders remain in strict project mode')
    }
    const readme = contents.get('README.md') || ''
    if (/^# Agent Project Starter\s*$/m.test(readme)) errors.push('README.md: starter identity remains in strict project mode')
    try {
      await access(resolve(root, '.agents/skills/project-template/SKILL.md'))
      errors.push('.agents/skills/project-template/SKILL.md: replace/remove the placeholder project skill in strict project mode')
    } catch {}
  }

  return { ok: errors.length === 0, errors, markdownCount: markdown.length, skillCount: skillDirs.length, superpowerCount: superpowerDirs.length }
}

const isMain = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url
if (isMain) {
  const strictProject = process.argv.includes('--strict-project')
  const result = await validateDocs(process.cwd(), { strictProject })
  if (!result.ok) {
    console.error(`Documentation validation failed with ${result.errors.length} issue(s):`)
    for (const error of result.errors) console.error(`- ${error}`)
    process.exit(1)
  }
  console.log(`Documentation valid: ${result.markdownCount} markdown files; ${result.skillCount} canonical skills; ${result.superpowerCount} superpowers.`)
  if (!strictProject) console.log('Run with --strict-project after adapting the starter to detect unresolved starter placeholders.')
}
