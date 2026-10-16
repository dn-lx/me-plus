/** Real SDK/local App Server, ephemeral CI state only. No model invocation. */
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LettaAgentClient } from '@letta-ai/letta-agent-sdk';
import { openReadOnlyLettaSession, TOOL_NAME } from '../../integrations/agent-clients/letta/session.mjs';
import { createMcpHandler } from '../../supabase/functions/me-plus-mcp/mcp.ts';
if (process.env.GITHUB_ACTIONS !== 'true' || ['LETTA_API_KEY','OPENAI_API_KEY','ANTHROPIC_API_KEY','GOOGLE_API_KEY','MEPLUS_CLIENT_TOKEN'].some(k => process.env[k])) throw new Error('credential_free_ephemeral_ci_only');
const cwd=await mkdtemp(join(tmpdir(),'meplus-letta-contract-'));
// Model metadata is synthetic test configuration; no send()/query()/LLM call occurs.
const model='openai/gpt-5-mini';
const client=new LettaAgentClient({backend:'local',appServer:{startupTimeoutMs:45000,requestTimeoutMs:30000}});
let connection;
try {
 const agentId=await client.createAgent({name:'Me+ synthetic tool contract',model,baseTools:[],memfs:false,skillSources:[],permissionMode:'strict',dreaming:{trigger:'off'},persona:'Synthetic test fixture. No personal data. Never invoke inference.'});
 await client.close();
 const handler=createMcpHandler(async(_token,tool)=>tool===null?{ok:true,operations:['read_state'],data_scopes:['tasks']}:{contract:'meplus-workspace-v1',tasks:[]});
 connection=await openReadOnlyLettaSession({token:'meplus_'+'a'.repeat(64),agentId,cwd,approvedModel:model},{fetchImpl:(url,options)=>handler(new Request(url,options))});
 const state=await connection.session.bootstrapState();
 assert.equal(state.agentId,agentId);assert.equal(state.model,model);assert.deepEqual(state.tools,[TOOL_NAME]);
 assert.equal(state.messages.length,0);
 console.log('PASS actual Letta SDK/local App Server: tasks-only tool policy, no inference or provider credentials');
} finally {
 await connection?.close();await client.close();await rm(cwd,{recursive:true,force:true});
}
