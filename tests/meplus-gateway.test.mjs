import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const gatewayPath = resolve(root, 'supabase/functions/me-plus-gateway/index.ts')

async function callGateway(url, operation, input = {}, key = null) {
  const headers = { 'content-type': 'application/json' }
  if (key) headers['x-meplus-api-key'] = key

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ operation, input }),
  })

  let body = null
  try {
    body = await response.json()
  } catch {}

  return { response, body }
}

test('gateway source keeps Today read-only and bounded', async () => {
  const source = await readFile(gatewayPath, 'utf8')

  assert.match(source, /server_authenticate_meplus_gateway/)
  assert.match(source, /server_gateway_build_personal_state/)
  assert.match(source, /source:"canonical_scheduler_state"/)
  assert.match(source, /operations:\["capabilities","get_current_state","get_context","today","complete_action","weekly_review"\]/)

  const todayStart = source.indexOf('async function today(')
  const todayEnd = source.indexOf('async function completeAction(', todayStart)
  assert.ok(todayStart >= 0 && todayEnd > todayStart, 'today() function must be present')

  const todaySource = source.slice(todayStart, todayEnd)
  assert.doesNotMatch(todaySource, /\.insert\(/, 'today() must not insert rows')
  assert.doesNotMatch(todaySource, /\.update\(/, 'today() must not update rows')
  assert.doesNotMatch(todaySource, /daily_plans/, 'today() must not create or depend on legacy daily plans')
})

const gatewayUrl = process.env.MEPLUS_GATEWAY_URL
const gatewayKey = process.env.MEPLUS_GATEWAY_API_KEY
const liveEnabled = Boolean(gatewayUrl && gatewayKey)

test('live gateway rejects missing and invalid credentials', { skip: !liveEnabled }, async () => {
  const missing = await callGateway(gatewayUrl, 'capabilities')
  assert.equal(missing.response.status, 401)

  const invalid = await callGateway(gatewayUrl, 'capabilities', {}, 'x'.repeat(64))
  assert.equal(invalid.response.status, 401)
})

test('live gateway exposes bounded capabilities and state', { skip: !liveEnabled }, async () => {
  const capabilities = await callGateway(gatewayUrl, 'capabilities', {}, gatewayKey)
  assert.equal(capabilities.response.status, 200)
  assert.equal(capabilities.body?.ok, true)
  assert.deepEqual(capabilities.body?.result?.operations, [
    'capabilities',
    'get_current_state',
    'get_context',
    'today',
    'complete_action',
    'weekly_review',
  ])

  const state = await callGateway(gatewayUrl, 'get_current_state', {}, gatewayKey)
  assert.equal(state.response.status, 200)
  assert.equal(state.body?.ok, true)
  assert.ok(state.body?.result?.state)

  const context = await callGateway(
    gatewayUrl,
    'get_context',
    { topics: ['goals', 'routines', 'actions', 'recommendations'], limit: 3 },
    gatewayKey,
  )
  assert.equal(context.response.status, 200)
  assert.equal(context.body?.ok, true)
  assert.deepEqual(context.body?.result?.topics, ['goals', 'routines', 'actions', 'recommendations'])
})

test('live Today route is scheduler-backed', { skip: !liveEnabled }, async () => {
  const today = await callGateway(gatewayUrl, 'today', {}, gatewayKey)
  assert.equal(today.response.status, 200)
  assert.equal(today.body?.ok, true)
  assert.equal(today.body?.result?.source, 'canonical_scheduler_state')
  assert.ok(today.body?.result?.plan_date)
  assert.ok(Array.isArray(today.body?.result?.actions))
})

test('live complete_action dry-run validates without mutation', {
  skip: !(liveEnabled && process.env.MEPLUS_GATEWAY_TEST_ACTION_ID),
}, async () => {
  const result = await callGateway(
    gatewayUrl,
    'complete_action',
    {
      action_id: process.env.MEPLUS_GATEWAY_TEST_ACTION_ID,
      status: 'completed',
      dry_run: true,
    },
    gatewayKey,
  )

  assert.equal(result.response.status, 200)
  assert.equal(result.body?.ok, true)
  assert.equal(result.body?.result?.dry_run, true)
  assert.equal(result.body?.result?.valid, true)
})

test('live gateway rejects unknown operations', { skip: !liveEnabled }, async () => {
  const result = await callGateway(gatewayUrl, 'not_a_real_operation', {}, gatewayKey)
  assert.equal(result.response.status, 404)
  assert.equal(result.body?.error, 'unknown_operation')
})
