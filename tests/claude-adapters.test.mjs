import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { sync, adapter } from '../scripts/sync-claude-skills.mjs'

const source = '---\nname: example\ndescription: Use for an example task.\n---\nCanonical procedure.\n'
test('adapters preserve metadata and point resources at canonical source', () => {
  const text = adapter('example', source)
  assert.ok(text.includes('description: Use for an example task.'))
  assert.ok(text.includes('.agents/skills/example/SKILL.md'))
  assert.ok(!text.includes('Canonical procedure.'))
  assert.throws(() => adapter('../escape', source))
  assert.throws(() => adapter('mismatch', source))
})
test('sync checks drift, refreshes generated metadata and preserves custom skills', async () => {
  const root = await mkdtemp(join(tmpdir(), 'adapter-test-'))
  try {
    const canonical = join(root, '.agents/skills/example')
    const target = join(root, '.claude/skills/example/SKILL.md')
    await mkdir(canonical, { recursive: true })
    await writeFile(join(canonical, 'SKILL.md'), source)
    await assert.rejects(sync(root), /Missing\/stale/)
    assert.equal(await sync(root, true), 1)
    assert.equal(await sync(root), 1)
    await writeFile(target, (await readFile(target, 'utf8')).replaceAll('\n', '\r\n'))
    assert.equal(await sync(root), 1)
    await writeFile(join(canonical, 'SKILL.md'), source.replace('example task', 'changed task'))
    await assert.rejects(sync(root), /Missing\/stale/)
    await sync(root, true)
    assert.ok((await readFile(target, 'utf8')).includes('changed task'))
    await writeFile(target, 'custom skill')
    await assert.rejects(sync(root, true), /Refusing to overwrite/)
    assert.equal(await readFile(target, 'utf8'), 'custom skill')
    await mkdir(join(root, '.claude/skills/obsolete'))
    await assert.rejects(sync(root, true), /Unmapped Claude skill/)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('sync rejects linked target ancestors and files without external writes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'adapter-links-'))
  const outside = await mkdtemp(join(tmpdir(), 'adapter-outside-'))
  try {
    await mkdir(join(root, '.agents/skills/example'), { recursive: true })
    await writeFile(join(root, '.agents/skills/example/SKILL.md'), source)
    await symlink(outside, join(root, '.claude'), 'dir')
    await assert.rejects(sync(root, true), /non-regular adapter path/)
    await rm(join(root, '.claude'))
    await sync(root, true)
    const target = join(root, '.claude/skills/example/SKILL.md')
    await rm(target)
    const external = join(outside, 'external.md')
    await writeFile(external, 'unchanged')
    await symlink(external, target, 'file')
    await assert.rejects(sync(root, true), /non-regular adapter path/)
    assert.equal(await readFile(external, 'utf8'), 'unchanged')
  } finally {
    await rm(root, { recursive: true, force: true })
    await rm(outside, { recursive: true, force: true })
  }
})
