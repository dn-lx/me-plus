import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, writeFile, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { bootstrapProject } from '../scripts/bootstrap-project.mjs'

const config = {
  projectName: 'Me Plus',
  purpose: 'Personal operating system',
  primaryUsers: 'Authenticated end users',
  repository: 'dn-lx/me-plus',
  ownerTeam: 'dn-lx',
  branches: { integration: 'dev', production: 'prod' },
  architecture: { backend: 'Supabase Edge Functions', database: 'PostgreSQL', authentication: 'Supabase Auth' },
  capabilities: {
    sourceControl: { status: 'Required', provider: 'GitHub' },
    database: { status: 'Required', provider: 'Supabase' },
  },
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'agent-starter-bootstrap-'))
  await mkdir(join(root, '.agents/skills/project-template'), { recursive: true })
  await mkdir(join(root, '.claude/skills/project-template'), { recursive: true })
  await mkdir(join(root, 'docs'), { recursive: true })
  await writeFile(join(root, '.agents/skills/project-template/SKILL.md'), 'template', 'utf8')
  await writeFile(join(root, '.claude/skills/project-template/SKILL.md'), 'template', 'utf8')
  await writeFile(
    join(root, '.agents/SKILL-INDEX.md'),
    '# Skill Index\n\n| Trigger | Skill |\n| --- | --- |\n| Branch/release mechanics | `release-workflow` |\n| Starter placeholder project knowledge | `project-template` |\n',
    'utf8',
  )
  await writeFile(
    join(root, 'docs/PROJECT-BOOTSTRAP-CHECKLIST.md'),
    '- [ ] Replace `.agents/skills/project-template/` with a real `.agents/skills/<project-name>/SKILL.md`; remove its obsolete generated `.claude/skills/project-template/` adapter and regenerate Claude adapters.\n',
    'utf8',
  )
  return root
}

test('bootstrap generates deterministic project configuration and removes template skill', async () => {
  const root = await fixture()
  const result = await bootstrapProject(config, { root })
  assert.equal(result.config.slug, 'me-plus')

  const policy = JSON.parse(await readFile(join(root, '.agents/project-policy.json'), 'utf8'))
  assert.equal(policy.branches.integration, 'dev')
  assert.equal(policy.branches.production, 'prod')

  const memory = await readFile(join(root, 'docs/PROJECT-MEMORY.md'), 'utf8')
  assert.match(memory, /Project name:\*\* Me Plus/)
  assert.match(memory, /Supabase Edge Functions/)

  const mcp = await readFile(join(root, 'docs/MCP-SETUP.md'), 'utf8')
  assert.match(mcp, /Database\/auth\/storage \| Required/)
  assert.match(mcp, /Supabase/)

  const skill = await readFile(join(root, '.agents/skills/me-plus/SKILL.md'), 'utf8')
  assert.match(skill, /name: me-plus/)

  const skillIndex = await readFile(join(root, '.agents/SKILL-INDEX.md'), 'utf8')
  assert.match(skillIndex, /Project-specific durable guidance \| `me-plus`/)

  await assert.rejects(access(join(root, '.agents/skills/project-template/SKILL.md')))
  await assert.rejects(access(join(root, '.claude/skills/project-template/SKILL.md')))
})

test('dry run reports targets without writing them', async () => {
  const root = await fixture()
  const result = await bootstrapProject(config, { root, dryRun: true })
  assert.ok(result.changed.includes('docs/PROJECT-MEMORY.md'))
  await assert.rejects(access(join(root, 'docs/PROJECT-MEMORY.md')))
})

test('bootstrap rejects invalid capability state and branch collision', async () => {
  const root = await fixture()
  await assert.rejects(
    bootstrapProject({ ...config, branches: { integration: 'dev', production: 'dev' } }, { root }),
    /must differ/,
  )
  await assert.rejects(
    bootstrapProject({ ...config, capabilities: { sourceControl: { status: 'Maybe' } } }, { root }),
    /Invalid capability status/,
  )
})

test('bootstrap trims branch names before comparing and writing them', async () => {
  const root = await fixture()
  const result = await bootstrapProject({
    ...config,
    branches: { integration: ' dev ', production: ' prod ' },
  }, { root })
  assert.deepEqual(result.config.branches, { integration: 'dev', production: 'prod' })
  const policy = JSON.parse(await readFile(join(root, '.agents/project-policy.json'), 'utf8'))
  assert.deepEqual(policy.branches.integration, 'dev')
  assert.deepEqual(policy.branches.production, 'prod')
})

test('bootstrap rejects branch names that would leave fixed workflow gates inconsistent', async () => {
  const root = await fixture()
  await assert.rejects(
    bootstrapProject({ ...config, branches: { integration: 'develop', production: 'main' } }, { root }),
    /supports dev → prod only/,
  )
  await assert.rejects(access(join(root, '.agents/project-policy.json')))
})

test('bootstrap rejects a slug that collides with a canonical skill', async () => {
  const root = await fixture()
  await assert.rejects(
    bootstrapProject({ ...config, slug: 'release-workflow' }, { root }),
    /collides with canonical skill/,
  )
})

test('bootstrap rejects changing an existing generated project slug', async () => {
  const root = await fixture()
  await bootstrapProject(config, { root })
  await assert.rejects(
    bootstrapProject({ ...config, slug: 'me-plus-renamed' }, { root }),
    /changing it .* requires an explicit migration/,
  )
})
