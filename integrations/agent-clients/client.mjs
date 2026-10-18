/** Server-side integration transport. Never log remote bodies or credentials. */
export const MCP_URL = 'https://wbqnctrvxohxwiaignhg.supabase.co/functions/v1/me-plus-mcp';
export const PROTOCOL = '2025-11-25';
export class SetupError extends Error {
  constructor(code) { super(code); this.name = 'SetupError'; }
}
export const fail = code => { throw new SetupError(code); };
export function credential(value, name) {
  if (typeof value !== 'string' || !value.trim() || /[\r\n]/.test(value)) fail(`missing_or_invalid_${name}`);
  return value;
}
export function scopedToken(value) {
  if (!/^meplus_[0-9a-f]{64}$/.test(value ?? '')) fail('missing_or_invalid_MEPLUS_CLIENT_TOKEN');
  return value;
}
export function httpsOrigin(value) {
  let url; try { url = new URL(value); } catch { fail('invalid_runtime_origin'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash || url.port) fail('invalid_runtime_origin');
  return url.origin;
}
export async function jsonRequest(url, options = {}, fetchImpl = fetch) {
  try {
    const response = await fetchImpl(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(15000) });
    if (!response.ok) fail(`remote_http_${response.status}`);
    if (response.status === 202 || response.status === 204) return null;
    const reader = response.body?.getReader(); if (!reader) fail('empty_response');
    const chunks = []; let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        size += value.byteLength;
        if (size > 262144) { await reader.cancel(); fail('response_too_large'); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch (error) {
    if (error instanceof SetupError) throw error;
    fail('remote_request_failed');
  }
}
export async function mcpRequest(token, method, params, fetchImpl = fetch) {
  scopedToken(token);
  const result = await jsonRequest(MCP_URL, { method: 'POST', headers: {
    authorization: `Bearer ${token}`, 'content-type': 'application/json',
    accept: 'application/json, text/event-stream', 'mcp-protocol-version': PROTOCOL,
  }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) }, fetchImpl);
  if (!result || result.jsonrpc !== '2.0' || result.id !== 1 || result.error || !result.result || result.result.isError) fail('mcp_request_failed');
  return result.result;
}
export async function verifyReadOnlyAccess(token, fetchImpl = fetch) {
  const init = await mcpRequest(token, 'initialize', { protocolVersion: PROTOCOL, capabilities: {}, clientInfo: { name: 'meplus-integration-setup', version: '1' } }, fetchImpl);
  if (init.protocolVersion !== PROTOCOL) fail('mcp_protocol_mismatch');
  await jsonRequest(MCP_URL, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', 'mcp-protocol-version': PROTOCOL }, body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) }, fetchImpl);
  const list = await mcpRequest(token, 'tools/list', {}, fetchImpl);
  if (!Array.isArray(list.tools) || list.tools.length !== 1 || list.tools[0].name !== 'read_state') fail('read_only_token_required');
  const scopes = list._meta?.['meplus/data-scopes'];
  if (!Array.isArray(scopes) || scopes.length !== 1 || scopes[0] !== 'tasks') fail('tasks_only_token_required');
  const read = await mcpRequest(token, 'tools/call', { name: 'read_state', arguments: { sections: ['tasks'], limit: 1 } }, fetchImpl);
  let state; try { state = JSON.parse(read.content[0].text); } catch { fail('invalid_workspace_response'); }
  if (state.contract !== 'meplus-workspace-v1' || !Array.isArray(state.tasks)) fail('invalid_workspace_response');
  return { protocol_verified: true, task_read_verified: true };
}
