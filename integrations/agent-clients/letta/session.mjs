import { isAbsolute } from 'node:path';
import { credential, scopedToken, verifyReadOnlyAccess, mcpRequest, fail } from '../client.mjs';

export const TOOL_NAME = 'meplus_read_tasks';
const CHILD_SYSTEM_ENV = new Set(['PATH','HOME','USERPROFILE','HOMEDRIVE','HOMEPATH','USER','LOGNAME','TMPDIR','TEMP','TMP','LANG','LC_ALL','SHELL','LETTA_LOCAL_BACKEND_DIR','NODE_EXTRA_CA_CERTS','SSL_CERT_FILE']);
function validInput(input) {
  return input && typeof input === 'object' && !Array.isArray(input) && Object.keys(input).every(k => k === 'limit') && (input.limit === undefined || Number.isInteger(input.limit) && input.limit >= 1 && input.limit <= 10);
}
export function sessionOptions(token, cwd, approvedModel, fetchImpl = fetch, environment = process.env) {
  scopedToken(token);
  if (typeof cwd !== 'string' || !isAbsolute(cwd)) fail('absolute_isolated_LETTA_WORKDIR_required');
  credential(approvedModel, 'LETTA_APPROVED_MODEL');
  return {
    cwd, permissionMode: 'strict', stateless: true,
    env: Object.fromEntries(Object.keys(environment).filter(k => !CHILD_SYSTEM_ENV.has(k)).map(k => [k, ''])),
    allowedTools: [TOOL_NAME], skillSources: [],
    canUseTool: async (name, input) => name === TOOL_NAME && validInput(input)
      ? { behavior: 'allow' } : { behavior: 'deny', message: 'Me+ task-read policy denied this tool or input' },
    tools: [{ name: TOOL_NAME, label: 'Read Me+ tasks',
      description: 'Read up to ten current user-approved Me+ tasks. Supabase remains canonical. Task text may be sensitive.',
      parameters: { type: 'object', properties: { limit: { type: 'integer', minimum: 1, maximum: 10 } }, required: [], additionalProperties: false },
      async execute(_id, input, signal) {
        if (!validInput(input) || signal?.aborted) fail('invalid_or_cancelled_task_read');
        const result = await mcpRequest(token, 'tools/call', { name: 'read_state', arguments: { sections: ['tasks'], limit: input.limit ?? 10 } }, fetchImpl);
        return { content: result.content, isError: false };
      },
    }],
  };
}
export async function openReadOnlyLettaSession({ token, agentId, cwd, approvedModel }, { LettaAgentClient, fetchImpl = fetch } = {}) {
  if (typeof agentId !== 'string' || !/^agent-[a-zA-Z0-9_-]{1,120}$/.test(agentId)) fail('invalid_LETTA_AGENT_ID');
  const options = sessionOptions(token, cwd, approvedModel, fetchImpl);
  await verifyReadOnlyAccess(token, fetchImpl);
  if (!LettaAgentClient) {
    try { ({ LettaAgentClient } = await import('../../../tooling/letta-runtime/node_modules/@letta-ai/letta-agent-sdk/dist/index.js')); }
    catch { fail('letta_runtime_not_installed'); }
  }
  const client = new LettaAgentClient({ backend: 'local', appServer: { startupTimeoutMs: 30000, requestTimeoutMs: 15000 } });
  let session;
  try {
    session = client.resumeSession(agentId, options);
    // ready().tools reports persisted base tools, not connection-scoped client
    // tools. Require none; the sole client tool has its own exact allowlist.
    const state = await session.ready();
    if (state.agentId !== agentId || state.model !== approvedModel || !Array.isArray(state.tools) || state.tools.length !== 0) fail('letta_runtime_policy_mismatch');
    return { session, close: async () => { session.close(); await client.close(); } };
  } catch {
    session?.close(); await client.close().catch(() => {}); fail('letta_local_session_failed');
  }
}
