import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { measureContextPacket, parseContextPacketArgs } from '../scripts/context-packet.mjs'

test('task context packet deduplicates paths and respects budget', async () => {
  const root = await mkdtemp(join(tmpdir(), 'context-packet-'))
  try {
    const a = join(root, 'a.txt')
    const b = join(root, 'b.txt')
    await writeFile(a, 'a'.repeat(400))
    await writeFile(b, 'b'.repeat(800))
    const result = await measureContextPacket([a, a, b], { budget: 400 })
    assert.equal(result.files.length, 2)
    assert.equal(result.total, 300)
    assert.equal(result.ok, true)
    const over = await measureContextPacket([a, b], { budget: 299 })
    assert.equal(over.ok, false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('context packet CLI parsing preserves file paths with and without a budget flag', () => {
  assert.deepEqual(parseContextPacketArgs(['a.md', 'b.md']), {
    check: false,
    budget: undefined,
    paths: ['a.md', 'b.md'],
  })
  assert.deepEqual(parseContextPacketArgs(['--check', '--budget', '5000', 'a.md']), {
    check: true,
    budget: 5000,
    paths: ['a.md'],
  })
})
