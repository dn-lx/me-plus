import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const capabilities = [
  'implementation-planning',
  'test-engineering',
  'frontend-verification',
  'performance-budget',
  'analytics-contract',
]

test('workflow-gap capabilities are canonical and routed from AGENTS', async () => {
  const agents = await readFile('AGENTS.md', 'utf8')
  for (const name of capabilities) {
    const skill = await readFile(`.agents/skills/${name}/SKILL.md`, 'utf8')
    assert.ok(skill.includes(`name: ${name}`), `${name} must have matching frontmatter`)
    assert.ok(agents.includes(name), `AGENTS.md must route ${name}`)
  }
})

test('quality, delivery and PR contracts enforce the new evidence layers', async () => {
  const quality = await readFile('.agents/skills/quality-gates/SKILL.md', 'utf8')
  const finish = await readFile('.agents/superpowers/finish-feature/SUPERPOWER.md', 'utf8')
  const pr = await readFile('.github/PULL_REQUEST_TEMPLATE.md', 'utf8')
  for (const name of ['test-engineering', 'frontend-verification', 'performance-budget', 'analytics-contract']) {
    assert.ok(quality.includes(name), `quality-gates must reference ${name}`)
  }
  assert.ok(finish.includes('implementation-planning'))
  assert.ok(finish.includes('frontend-verification'))
  assert.ok(pr.includes('Browser/runtime verification'))
  assert.ok(pr.includes('Performance budget'))
  assert.ok(pr.includes('Analytics contract/wiring'))
})

test('frontend verification contains focused visual-sanity protections', async () => {
  const frontend = await readFile('.agents/skills/frontend-verification/SKILL.md', 'utf8')
  const routing = await readFile('.agents/skills/task-routing/SKILL.md', 'utf8')
  const index = await readFile('.agents/SKILL-INDEX.md', 'utf8')
  for (const phrase of ['contrast', 'alignment', 'overflow', 'clipping', 'getBoundingClientRect']) {
    assert.ok(frontend.includes(phrase), `frontend verification must cover ${phrase}`)
  }
  assert.ok(routing.includes('focused visual defect'))
  assert.ok(index.includes('Focused UI bug'))
})

test('reusable templates exist for planning, verification and analytics', async () => {
  for (const path of [
    'docs/templates/IMPLEMENTATION-PLAN-TEMPLATE.md',
    'docs/templates/VERIFICATION-EVIDENCE-TEMPLATE.md',
    'docs/templates/ANALYTICS-EVENT-CONTRACT-TEMPLATE.md',
    'docs/templates/FRONTEND-VISUAL-QA-TEMPLATE.md',
    'docs/templates/PLAYWRIGHT-VISUAL-SANITY.md',
  ]) {
    const content = await readFile(path, 'utf8')
    assert.ok(content.length > 100, `${path} should contain a usable template`)
  }
})
