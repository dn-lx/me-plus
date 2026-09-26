import test from 'node:test'
import assert from 'node:assert/strict'
import { validateDocs, findLegacyBranchTerms } from '../scripts/validate-docs.mjs'

test('current documentation is internally consistent', async () => {
  const result = await validateDocs(process.cwd())
  assert.deepEqual(result.errors, [])
  assert.equal(result.ok, true)
  assert.ok(result.markdownCount > 20)
  assert.ok(result.skillCount > 10)
})

test('legacy branch wording is detected against configured policy', () => {
  assert.deepEqual(findLegacyBranchTerms('merge into `develop`, then `develop → main`', 'dev', 'prod'), ['develop', 'main'])
  assert.deepEqual(findLegacyBranchTerms('feature → `dev → prod`', 'dev', 'prod'), [])
  assert.deepEqual(findLegacyBranchTerms('feature → `dev → prod`', 'develop', 'main'), ['dev', 'prod'])
})
