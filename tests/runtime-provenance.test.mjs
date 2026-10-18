import assert from 'node:assert/strict'
import test from 'node:test'
import { access, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))

async function readJson(path) {
  return JSON.parse(await readFile(resolve(root, path), 'utf8'))
}

test('every expected active production Edge Function has repository source', async () => {
  const manifest = await readJson('supabase/functions/deployed-manifest.json')
  const active = Object.entries(manifest.functions)
    .filter(([, value]) => value.expected_runtime === 'active')
    .map(([slug]) => slug)

  assert.ok(active.length >= 6)

  for (const slug of active) {
    await access(resolve(root, 'supabase/functions', slug, 'index.ts'))
  }
})

test('latest production engineering-contract migrations are source controlled', async () => {
  const manifest = await readJson('supabase/production-migration-manifest.json')
  const required = manifest.migrations
    .filter((migration) => migration.version >= '20261003225310')
    .map((migration) => `${migration.version}_${migration.name}.sql`)

  assert.deepEqual(required, [
    '20261003225310_harden_ai_routing_and_engineering_issue_contracts_v1.sql',
    '20261003231024_enforce_engineering_issue_dependency_contract_v1.sql',
    '20261003231224_add_gateway_issue_lookup_and_policy_versioning_v1.sql',
  ])

  for (const filename of required) {
    await access(resolve(root, 'supabase/migrations', filename))
  }
})
