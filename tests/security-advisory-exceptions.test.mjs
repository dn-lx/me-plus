import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const read = path => readFile(resolve(root, path), 'utf8')

const allowed = ['GHSA-86w9-cpqp-85rv', 'GHSA-vfj7-8cjw-p6xm']

test('dependency audit exceptions are explicit, documented and narrowly scoped', async () => {
  const workspace = await read('pnpm-workspace.yaml')
  const docs = await read('docs/SECURITY-ADVISORY-EXCEPTIONS.md')

  const ignored = [...workspace.matchAll(/- (GHSA-[a-z0-9-]+)/g)].map(match => match[1])
  assert.deepEqual(ignored.sort(), [...allowed].sort())

  for (const ghsa of allowed) {
    assert.ok(docs.includes(ghsa), `missing documentation for ${ghsa}`)
  }

  assert.doesNotMatch(workspace, /ignore-unfixable/)
  assert.match(docs, /Remove an exception as soon as an upstream release/)
})
