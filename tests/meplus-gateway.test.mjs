import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const gatewayPath = resolve(root, 'supabase/functions/me-plus-gateway/index.ts')
const routingMigrationPath = resolve(root, 'supabase/migrations/20261006124722_eng_007_routing_fast_path_v1.sql')
const compactMigrationPath = resolve(root, 'supabase/migrations/20261006125132_eng_007_bootstrap_compact_state_v1.sql')
const scopedBootstrapMigrationPath = resolve(root, 'supabase/migrations/20261006211800_eng_007_route_scoped_bootstrap_v2.sql')
const multiTopicMigrationPath = resolve(root, 'supabase/migrations/20261006211903_eng_007_multi_topic_routing_v1.sql')

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
  for (const operation of [
    'capabilities',
    'bootstrap_context',
    'resolve_intent',
    'resolve_specs',
    'get_latest_checkpoint',
    'get_ai_routing_config',
    'get_cross_domain_evidence_context',
    'list_engineering_issues',
    'upsert_engineering_issue',
    'get_scheduler_policy',
    'version_scheduler_policy',
    'get_current_state',
    'get_context',
    'today',
    'complete_action',
    'weekly_review',
  ]) {
    assert.ok(source.includes(`"${operation}"`), `gateway capability missing ${operation}`)
  }

  const todayStart = source.indexOf('async function today(')
  const todayEnd = source.indexOf('async function completeAction(', todayStart)
  assert.ok(todayStart >= 0 && todayEnd > todayStart, 'today() function must be present')

  const todaySource = source.slice(todayStart, todayEnd)
  assert.doesNotMatch(todaySource, /\.insert\(/, 'today() must not insert rows')
  assert.doesNotMatch(todaySource, /\.update\(/, 'today() must not update rows')
  assert.match(todaySource, /source:\"canonical_scheduler_state\"/, 'today() must identify canonical scheduler state as its source')
})


test('checkpoint lookup filters domains before limiting results', async () => {
  const source = await readFile(gatewayPath, 'utf8')
  const start = source.indexOf('async function getLatestCheckpoint(')
  const end = source.indexOf('async function bootstrapContext(', start)
  assert.ok(start >= 0 && end > start, 'getLatestCheckpoint() must be present')

  const fn = source.slice(start, end)
  const domainFilter = fn.indexOf('.overlaps("domains",requestedDomains)')
  const orderLimit = fn.indexOf('.order("updated_at",{ascending:false}).limit(limit)')
  assert.ok(domainFilter >= 0, 'checkpoint lookup must push domain overlap into the bounded query')
  assert.ok(orderLimit > domainFilter, 'checkpoint domain filtering must happen before ordering/limit')
  assert.doesNotMatch(fn, /rows\.find\(/, 'checkpoint filtering must not happen after the limit')
})

test('bootstrap context uses one bounded database roundtrip for known intents', async () => {
  const source = await readFile(gatewayPath, 'utf8')
  const start = source.indexOf('async function bootstrapContext(')
  const end = source.indexOf('async function getCrossDomainEvidenceContext(', start)
  assert.ok(start >= 0 && end > start, 'bootstrapContext() must be present')

  const fn = source.slice(start, end)
  assert.match(fn, /server_gateway_bootstrap_context_v2/)
  assert.match(fn, /p_state_mode:stateMode/)
  assert.doesNotMatch(fn, /Promise\.all\(/, 'bootstrap must not fan out into multiple database calls')
  assert.doesNotMatch(fn, /resolveSpecs\(/, 'bootstrap must not separately resolve specs')
  assert.doesNotMatch(fn, /getLatestCheckpoint\(/, 'bootstrap must not separately query checkpoints')
  assert.doesNotMatch(fn, /getCurrentState\(/, 'bootstrap must not separately build full state')
})

test('ENG-007 migration keeps routing private and fallback explicit', async () => {
  const [routing, compact] = await Promise.all([
    readFile(routingMigrationPath, 'utf8'),
    readFile(compactMigrationPath, 'utf8'),
  ])

  assert.match(routing, /create table if not exists private\.intent_routing_registry/)
  assert.match(routing, /enable row level security/)
  assert.match(routing, /revoke all on table private\.intent_routing_registry from public/)
  assert.match(routing, /server_gateway_resolve_intent/)
  assert.match(routing, /server_gateway_bootstrap_context_v2/)
  assert.match(routing, /fallback_required/)
  assert.match(routing, /grant execute on function public\.server_gateway_resolve_intent[\s\S]*service_role/)
  assert.match(routing, /grant execute on function public\.server_gateway_bootstrap_context_v2[\s\S]*service_role/)
  assert.match(compact, /p_state_mode text default 'auto'/)
  assert.match(compact, /get_personal_state_summary/)
  assert.match(compact, /v_state_mode := 'summary'/)
})

test('ENG-007 live v3 provenance keeps route-scoped state and multi-topic routing', async () => {
  const [scoped, multi] = await Promise.all([
    readFile(scopedBootstrapMigrationPath, 'utf8'),
    readFile(multiTopicMigrationPath, 'utf8'),
  ])

  assert.match(scoped, /private\.get_latest_checkpoint_compact/)
  assert.match(scoped, /bootstrap-context-v3/)
  assert.match(scoped, /v_effective_state_mode[\s\S]*'none'/)
  assert.match(scoped, /checkpoint_compact/)
  assert.match(multi, /topic_set/)
  assert.match(multi, /routing-fast-path-regression-v2/)
})

test('live fast-path bootstrap resolves a known intent', { skip: !(process.env.MEPLUS_GATEWAY_URL && process.env.MEPLUS_GATEWAY_API_KEY) }, async () => {
  const result = await callGateway(
    gatewayUrl,
    'bootstrap_context',
    { intent: 'start my meditation', state_mode: 'summary' },
    gatewayKey,
  )
  assert.equal(result.response.status, 200)
  assert.equal(result.body?.ok, true)
  assert.equal(result.body?.gateway_version, 'gateway-v1.17.0')
  assert.equal(result.body?.result?.contract_version, 'bootstrap-context-v3')
  assert.equal(result.body?.result?.state_scope, 'summary')
  assert.equal(result.body?.result?.routing?.selected_route?.route_key, 'meditation_start')
  assert.equal(result.body?.result?.routing?.fallback_required, false)
  assert.equal(result.body?.result?.telemetry?.db_roundtrips, 1)
  assert.ok(result.body?.result?.telemetry?.response_bytes > 0)
  assert.ok(result.body?.duration_ms >= 0)
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
  for (const operation of [
    'bootstrap_context',
    'resolve_intent',
    'resolve_specs',
    'get_latest_checkpoint',
    'get_ai_routing_config',
    'get_cross_domain_evidence_context',
    'list_engineering_issues',
    'upsert_engineering_issue',
    'get_scheduler_policy',
    'version_scheduler_policy',
    'get_current_state',
    'today',
  ]) {
    assert.ok(capabilities.body?.result?.operations?.includes(operation), `live capability missing ${operation}`)
  }

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


test('Me+ 2.0 action decisions share an atomic, owner-scoped path', async () => {
  const sql = await readFile(resolve(root,'supabase/migrations/20261015110000_meplus_2_unified_atomic_action_execution.sql'),'utf8');
  const gateway = await readFile(gatewayPath,'utf8');
  const web = await readFile(resolve(root,'apps/web/app/today/action-decisions.ts'),'utf8');
  assert.match(sql,/FOR UPDATE/i);
  assert.match(sql,/UPDATE public\.actions/i);
  assert.match(sql,/UPDATE public\.routine_events/i);
  assert.match(sql,/INSERT INTO public\.action_events/i);
  assert.match(sql,/IF v_action\.status = p_decision THEN/i);
  assert.match(sql,/auth\.uid\(\)/i);
  assert.match(sql,/user_id = p_user_id FOR UPDATE/i);
  assert.match(sql,/TO service_role/i);
  const start=gateway.indexOf('async function completeAction(');
  const end=gateway.indexOf('function validIdempotencyKey(',start);
  const completion=gateway.slice(start,end);
  assert.match(completion,/server_gateway_complete_action_atomic/);
  assert.doesNotMatch(completion,/\.update\(/);
  assert.doesNotMatch(completion,/\.insert\(/);
  assert.match(web,/db\.auth\.getUser\(\)/);
  assert.match(web,/record_meplus_action_decision/);
});

test('Me+ Daily Review is a private read-only event view', async () => {
  const source = await readFile(resolve(root,'apps/web/app/review/page.tsx'),'utf8');
  assert.match(source,/action_events/);
  assert.match(source,/Intl\.DateTimeFormat/);
  assert.match(source,/db\.auth\.getUser\(\)/);
  assert.doesNotMatch(source,/\.insert\(/);
  assert.doesNotMatch(source,/\.update\(/);
});


test('STAGING ONLY: action owner, cross-user isolation, and idempotent replay', {
  skip: !(process.env.MEPLUS_STAGING_E2E_URL && process.env.MEPLUS_STAGING_E2E_REF &&
    process.env.MEPLUS_STAGING_E2E_ANON_KEY && process.env.MEPLUS_STAGING_E2E_OWNER_JWT &&
    process.env.MEPLUS_STAGING_E2E_OTHER_JWT && process.env.MEPLUS_STAGING_E2E_ACTION_ID &&
    process.env.MEPLUS_STAGING_E2E_ALLOW_MUTATION === 'yes'),
  timeout: 60000
}, async () => {
  const ref=process.env.MEPLUS_STAGING_E2E_REF;
  const base=process.env.MEPLUS_STAGING_E2E_URL.replace(/\/$/,'');
  assert.notEqual(ref,'wbqnctrvxohxwiaignhg','primary Me+ project is excluded');
  assert.equal(new URL(base).hostname,ref+'.supabase.co');
  const id=process.env.MEPLUS_STAGING_E2E_ACTION_ID;
  assert.match(id,/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i);
  const key=process.env.MEPLUS_STAGING_E2E_ANON_KEY;
  const owner=process.env.MEPLUS_STAGING_E2E_OWNER_JWT;
  const other=process.env.MEPLUS_STAGING_E2E_OTHER_JWT;
  const call=async(path,jwt,body)=>{
    const response=await fetch(base+path,{
      method:body===undefined?'GET':'POST',
      headers:{apikey:key,authorization:'Bearer '+(jwt||key),
        accept:'application/json',...(body===undefined?{}:{'content-type':'application/json'})},
      ...(body===undefined?{}:{body:JSON.stringify(body)})
    });
    const raw=await response.text();
    let value;try{value=JSON.parse(raw);}catch{value=raw;}
    return {response,value};
  };
  const get=async(jwt,path)=>{
    const {response,value}=await call(path,jwt);
    assert.equal(response.status,200);
    assert.ok(Array.isArray(value));
    return value;
  };
  const actionPath='/rest/v1/actions?id=eq.'+id+'&select=id,user_id,status';
  const eventsPath='/rest/v1/action_events?action_id=eq.'+id+'&select=id,event_type';
  const decide=(jwt,status)=>call('/rest/v1/rpc/record_meplus_action_decision',jwt,
    {p_action_id:id,p_decision:status});
  const before=await get(owner,actionPath);
  assert.equal(before.length,1);
  assert.ok(['available','planned'].includes(before[0].status),'use a fresh disposable staging fixture');
  assert.deepEqual(await get(other,actionPath),[]);
  assert.deepEqual(await get(owner,eventsPath),[]);
  assert.equal((await decide(null,'completed')).response.ok,false);
  assert.equal((await decide(other,'completed')).response.ok,false);
  assert.equal((await decide(owner,'invalid')).response.ok,false);
  assert.equal((await get(owner,actionPath))[0].status,before[0].status);
  const saved=await decide(owner,'completed');
  assert.equal(saved.response.status,200);
  assert.equal(saved.value?.ok,true);
  assert.equal(saved.value?.replayed,false);
  assert.equal((await get(owner,actionPath))[0].status,'completed');
  assert.equal((await get(owner,eventsPath)).length,1);
  const again=await decide(owner,'completed');
  assert.equal(again.response.status,200);
  assert.equal(again.value?.replayed,true);
  assert.equal((await get(owner,eventsPath)).length,1);
});
