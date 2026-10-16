import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { runInNewContext } from 'node:vm';
import { openReadOnlyLettaSession, sessionOptions, TOOL_NAME } from '../integrations/agent-clients/letta/session.mjs';
import { setup } from '../integrations/agent-clients/setup.mjs';
import { jsonRequest, verifyReadOnlyAccess, httpsOrigin, MCP_URL } from '../integrations/agent-clients/client.mjs';
import { createMcpHandler } from '../supabase/functions/me-plus-mcp/mcp.ts';
const token = 'meplus_' + 'c'.repeat(64);
const env = { MEPLUS_CLIENT_TOKEN: token, LETTA_API_KEY: 'synthetic_letta_key', LETTA_AGENT_ID: 'agent-fixture', N8N_API_ORIGIN: 'https://n8n.example.invalid', N8N_API_KEY: 'synthetic_n8n_key', N8N_MEPLUS_CREDENTIAL_ID: 'fixtureCredential' };
const workspace = { contract: 'meplus-workspace-v1', tasks: [{ id: 'fixture', title: 'SYNTHETIC_PRIVATE_TASK' }] };
const json = value => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });
function mcpFixture(operations = ['read_state'], scopes = ['tasks']) {
  const calls = [];
  const handler = createMcpHandler(async (_token, tool, args) => { calls.push({ tool, args }); return tool === null ? { ok: true, operations, data_scopes: scopes } : workspace; });
  return { calls, fetchImpl: async (url, options) => handler(new Request(url, options)) };
}
const workflow = JSON.parse(await readFile(new URL('../integrations/agent-clients/n8n/tasks-readonly.json', import.meta.url), 'utf8'));
test('all default setup commands are offline and disclose no environment credentials', async () => {
  for (const action of ['plan','letta','n8n','verify']) {
    const result = await setup(action, { env, fetchImpl: () => assert.fail('default made network request') });
    assert.equal(result.runtime_connected, false);
    for (const value of [token, env.LETTA_API_KEY, env.N8N_API_KEY]) assert.ok(!JSON.stringify(result).includes(value));
  }
});
test('missing credentials fail before any fetch; CLI emits only a stable error', async () => {
  for (const action of ['verify','letta','n8n']) await assert.rejects(setup(action, { apply: true, env: {}, fetchImpl: () => assert.fail('missing credentials made request') }));
  assert.throws(() => execFileSync(process.execPath, ['integrations/agent-clients/setup.mjs','letta','--apply'], { env: {}, stdio: 'pipe' }), e => e.stdout.length === 0 && e.stderr.toString().includes('missing_or_invalid_MEPLUS_CLIENT_TOKEN'));
});
test('client negotiates with the real Me+ handler and reads only bounded tasks', async () => {
  const f = mcpFixture(); const result = await verifyReadOnlyAccess(token, f.fetchImpl);
  assert.equal(result.task_read_verified, true);
  assert.deepEqual(f.calls.filter(x => x.tool !== null), [{ tool: 'read_state', args: { sections: ['tasks'], limit: 1 } }]);
  assert.ok(!JSON.stringify(result).includes('SYNTHETIC_PRIVATE_TASK'));
  await assert.rejects(verifyReadOnlyAccess(token, mcpFixture(['read_state','create_task']).fetchImpl), /read_only_token_required/);
});
test('revocation/rate limits and malformed MCP success bodies cannot count as verification', async () => {
  for (const status of [401,429,500]) await assert.rejects(verifyReadOnlyAccess(token, async () => new Response('SECRET', { status })), new RegExp(`remote_http_${status}`));
  await assert.rejects(verifyReadOnlyAccess(token, async () => json({ jsonrpc: '2.0', id: 1, result: {} })), /mcp_protocol_mismatch/);
});
test('transport bounds responses, blocks redirects, redacts exceptions and does not retry', async () => {
  let count = 0;
  await assert.rejects(jsonRequest('https://example.invalid', {}, async (_u, o) => { count++; assert.equal(o.redirect, 'error'); assert.ok(o.signal); throw new Error('SENSITIVE_KEY'); }), /remote_request_failed/);
  assert.equal(count, 1);
  await assert.rejects(jsonRequest('https://example.invalid', {}, async () => new Response('x'.repeat(262145))), /response_too_large/);
  for (const url of ['http://n8n.example.invalid','https://secret@host.invalid','https://host.invalid/path','https://host.invalid?token=secret','https://host.invalid:8443']) assert.throws(() => httpsOrigin(url), /invalid_runtime_origin/);
});
test('n8n exported workflow is manual-only, credential-free and minimizes retained data', () => {
  assert.equal(workflow.active, false); assert.equal(workflow.nodes.length, 3);
  assert.deepEqual(workflow.nodes.map(n => n.type), ['n8n-nodes-base.manualTrigger','n8n-nodes-base.httpRequest','n8n-nodes-base.code']);
  const read = workflow.nodes[1]; assert.equal(read.parameters.url, MCP_URL); assert.equal(read.parameters.genericAuthType, 'httpHeaderAuth');
  assert.equal(read.credentials, undefined); assert.equal(read.retryOnFail, false);
  assert.equal(read.parameters.options.redirect.redirect.followRedirects, false);
  const body = JSON.parse(read.parameters.jsonBody);
  assert.deepEqual(body.params, { name: 'read_state', arguments: { sections: ['tasks'], limit: 10 } });
  assert.equal(workflow.settings.saveDataErrorExecution, 'none'); assert.equal(workflow.settings.saveDataSuccessExecution, 'none'); assert.equal(workflow.settings.saveManualExecutions, false); assert.equal(workflow.settings.saveExecutionProgress, false);
  assert.deepEqual(workflow.pinData, {});
});
test('actual n8n request and validation code accept MCP success, reject errors, and return counts only', async () => {
  const read = workflow.nodes[1];
  const response = await mcpFixture().fetchImpl(read.parameters.url, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', accept: 'application/json' }, body: read.parameters.jsonBody });
  const execute = value => runInNewContext('(function(){'+workflow.nodes[2].parameters.jsCode+'})()', { $input: { first: () => ({ json: value }) } });
  const result = execute(await response.json());
  assert.equal(result[0].json.task_count, 1); assert.ok(!JSON.stringify(result).includes('SYNTHETIC_PRIVATE_TASK'));
  for (const bad of [{ error: { message: 'SECRET' } }, { jsonrpc: '2.0', id: 1, result: { isError: true } }, { jsonrpc: '2.0', id: 1, result: { content: [{ text: '{}' }] } }]) assert.throws(() => execute(bad), /Me\+ read failed|Unexpected Me\+ contract/);
});
test('n8n API import binds an existing credential and verifies inactive privacy settings', async () => {
  const calls = []; let created;
  const fetchImpl = async (url, options) => {
    calls.push({ url, options }); assert.ok(url.startsWith(env.N8N_API_ORIGIN + '/api/v1/'));
    if (url.includes('?limit=')) return json({ data: [], nextCursor: null });
    if (options.method === 'POST') { created = JSON.parse(options.body); return json({ id: 'workflowFixture' }); }
    return json({ id: 'workflowFixture', active: false, activeVersionId: null, ...created });
  };
  const result = await setup('n8n', { apply: true, env, fetchImpl });
  assert.equal(result.active, false); assert.equal(result.hosted_execution_verified, false);
  assert.equal(calls.length, 3); assert.equal(created.active, undefined); assert.equal(created.pinData, undefined);
  assert.equal(created.nodes[1].credentials.httpHeaderAuth.id, env.N8N_MEPLUS_CREDENTIAL_ID);
  assert.ok(!JSON.stringify(created).includes(token));
});
test('n8n import refuses duplicates across pages and never activates or overwrites a workflow', async () => {
  let calls = 0;
  await assert.rejects(setup('n8n', { apply: true, env, fetchImpl: async (u,o) => {
    calls++; assert.equal(o.method, 'GET');
    return json(calls === 1 ? { data: [], nextCursor: 'page2' } : { data: [{ name: workflow.name }], nextCursor: null });
  }}), /n8n_workflow_already_exists/); assert.equal(calls, 2);
});

test('read_state with extra data scopes fails before any tool read or provider export', async () => {
  const f = mcpFixture(['read_state'], ['tasks','health']);
  await assert.rejects(verifyReadOnlyAccess(token, f.fetchImpl), /tasks_only_token_required/);
  assert.equal(f.calls.filter(c => c.tool !== null).length, 0);
});

test('local Letta policy exposes only bounded task reads and denies shell, filesystem and malformed calls', async () => {
  const f=mcpFixture(); const options=sessionOptions(token,'/isolated/meplus','approved/synthetic-model',f.fetchImpl);
  assert.equal(options.permissionMode,'strict');assert.equal(options.stateless,true);
  assert.deepEqual(options.allowedTools,[TOOL_NAME]);assert.deepEqual(options.skillSources,[]);
  assert.equal((await options.canUseTool(TOOL_NAME,{limit:2})).behavior,'allow');
  for(const name of ['Bash','Read','WebSearch','memory','meplus_write']) assert.equal((await options.canUseTool(name,{})).behavior,'deny');
  for(const input of [{sections:['health']},{limit:11},{limit:0},{limit:1,user_id:'other'},null,[]]){
    assert.equal((await options.canUseTool(TOOL_NAME,input)).behavior,'deny');
    await assert.rejects(options.tools[0].execute('fixture',input),/invalid_or_cancelled_task_read/);
  }
  await options.tools[0].execute('fixture',{limit:2});
  assert.deepEqual(f.calls.at(-1),{tool:'read_state',args:{sections:['tasks'],limit:2}});
});
test('local Letta session uses local backend, closes safely and performs no inference', async()=>{
  let closed=false;let clientClosed=false;let initialized=false;
  class Client {
    constructor(options){assert.equal(options.backend,'local');assert.equal(options.apiKey,undefined);}
    resumeSession(id,options){assert.equal(id,'agent-fixture');assert.deepEqual(options.allowedTools,[TOOL_NAME]);return {bootstrapState:async()=>{initialized=true;return {model:'approved/synthetic-model',tools:[TOOL_NAME]};},close:()=>{closed=true;},send:()=>assert.fail('inference not authorized')};}
    async close(){clientClosed=true;}
  }
  const c=await openReadOnlyLettaSession({token,agentId:'agent-fixture',cwd:'/isolated/meplus',approvedModel:'approved/synthetic-model'},{LettaAgentClient:Client,fetchImpl:mcpFixture().fetchImpl});
  assert.equal(initialized,true);await c.close();assert.equal(closed,true);assert.equal(clientClosed,true);
});
test('local Letta requires explicit existing agent, isolated directory and approved model',async()=>{
  for(const overrides of [{agentId:'../bad'},{cwd:'relative'},{approvedModel:''}]) await assert.rejects(openReadOnlyLettaSession({token,agentId:'agent-fixture',cwd:'/isolated/meplus',approvedModel:'approved/synthetic-model',...overrides},{fetchImpl:()=>assert.fail('bad policy made request')}));
});
