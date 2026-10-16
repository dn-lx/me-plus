import { readFile } from 'node:fs/promises';
import { openReadOnlyLettaSession } from './letta/session.mjs';
import { pathToFileURL } from 'node:url';
import { MCP_URL, credential, scopedToken, httpsOrigin, jsonRequest, verifyReadOnlyAccess, SetupError, fail } from './client.mjs';
const load = async path => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));
const safeId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,120}$/.test(value) ? value : fail('invalid_remote_id');
export async function setup(action = 'plan', { env = process.env, fetchImpl = fetch, apply = false } = {}) {
  if (!['plan','verify','letta','n8n'].includes(action)) fail('unknown_action');
  if (action === 'plan' || !apply) return {
    mode: 'plan', setup_ready: ['letta_local_app_server_task_tool','n8n_inactive_manual_workflow','langfuse_disabled_metadata_only_exporter'],
    endpoint: MCP_URL, permissions: { operations: ['read_state'], data_scopes: ['tasks'] },
    required_env: action === 'letta' ? ['MEPLUS_CLIENT_TOKEN','LETTA_AGENT_ID','LETTA_WORKDIR','LETTA_APPROVED_MODEL'] : action === 'n8n' ? ['N8N_API_ORIGIN','N8N_API_KEY','N8N_MEPLUS_CREDENTIAL_ID'] : ['MEPLUS_CLIENT_TOKEN'],
    runtime_connected: false, authorization: 'deferred', paid_resources_created: false,
  };
  if (action === 'verify') return verifyReadOnlyAccess(scopedToken(env.MEPLUS_CLIENT_TOKEN), fetchImpl);
  if (action === 'letta') {
    const connection = await openReadOnlyLettaSession({
      token: scopedToken(env.MEPLUS_CLIENT_TOKEN), agentId: env.LETTA_AGENT_ID,
      cwd: env.LETTA_WORKDIR, approvedModel: env.LETTA_APPROVED_MODEL,
    }, { fetchImpl });
    await connection.close();
    return { local_session_verified: true, task_tool_configured: true, inference_run: false, production_acceptance: false };
  }

  const origin = httpsOrigin(env.N8N_API_ORIGIN);
  const key = credential(env.N8N_API_KEY, 'N8N_API_KEY');
  const credentialId = safeId(credential(env.N8N_MEPLUS_CREDENTIAL_ID, 'N8N_MEPLUS_CREDENTIAL_ID'));
  const api = (path, method = 'GET', body) => jsonRequest(origin + '/api/v1/' + path, { method, headers: { 'X-N8N-API-KEY': key, 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) }, fetchImpl);
  const template = await load('./n8n/tasks-readonly.json');
  template.nodes.find(n => n.id === 'read').credentials = { httpHeaderAuth: { id: credentialId, name: 'Me+ tasks read-only' } };
  const matches = []; let cursor; let pages = 0;
  do {
    if (++pages > 20) fail('n8n_list_limit');
    const list = await api('workflows?limit=100' + (cursor ? '&cursor=' + encodeURIComponent(cursor) : ''));
    if (!Array.isArray(list.data)) fail('unexpected_n8n_list');
    matches.push(...list.data.filter(w => w.name === template.name));
    cursor = list.nextCursor;
    if (cursor && (typeof cursor !== 'string' || cursor.length > 2048)) fail('invalid_n8n_cursor');
  } while (cursor);
  if (matches.length) fail('n8n_workflow_already_exists_review_in_editor');
  // active and pinData are export-only/read-only fields; API creation never publishes.
  const { name, nodes, connections, settings } = template;
  const created = await api('workflows', 'POST', { name, nodes, connections, settings });
  const id = safeId(created?.id);
  const actual = await api(`workflows/${id}`);
  if (actual.active || actual.activeVersionId || actual.settings?.saveDataErrorExecution !== 'none' || actual.settings?.saveDataSuccessExecution !== 'none' || actual.settings?.saveManualExecutions !== false || actual.settings?.saveExecutionProgress !== false) fail('n8n_privacy_or_activation_mismatch_review_in_editor');
  return { workflow_imported: true, active: false, hosted_execution_verified: false };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2); const action = args[0] ?? 'plan';
  try {
    if (args.slice(1).some(x => x !== '--apply') || args.filter(x => x === '--apply').length > 1) fail('invalid_arguments');
    console.log(JSON.stringify(await setup(action, { apply: args.includes('--apply') })));
  } catch (error) {
    console.error(error instanceof SetupError ? error.message : 'integration_setup_failed'); process.exitCode = 1;
  }
}
