import test from 'node:test';
import assert from 'node:assert/strict';
import {createMcpHandler,TOOLS} from '../supabase/functions/me-plus-mcp/mcp.ts';
const key='meplus_'+'a'.repeat(64);
const req=(body,extra={})=>new Request('https://example.invalid/mcp',{method:'POST',headers:{authorization:'Bearer '+key,'content-type':'application/json',...extra},body:JSON.stringify(body)});
const rpc=(method,params={})=>({jsonrpc:'2.0',id:1,method,params});
const fixture=(operations=TOOLS.map(t=>t.name))=>{const calls=[];return {calls,handler:createMcpHandler(async(token,tool,args)=>{calls.push({token,tool,args});return tool===null?{ok:true,operations,data_scopes:['tasks']}:{ok:true,action_id:'fixture'};})};};
test('MCP denies missing credentials and untrusted browser origins before executing tools',async()=>{
 const f=fixture();let r=await f.handler(new Request('https://example.invalid/mcp',{method:'POST'}));assert.equal(r.status,401);
 r=await f.handler(req(rpc('tools/list'),{origin:'https://evil.invalid'}));assert.equal(r.status,403);assert.equal(f.calls.length,0);
});
test('MCP negotiates a supported protocol and lists only granted operations',async()=>{
 const f=fixture(['read_state']);let r=await f.handler(req(rpc('initialize',{protocolVersion:'2025-11-25'})));assert.equal((await r.json()).result.protocolVersion,'2025-11-25');
 r=await f.handler(req(rpc('tools/list')));assert.deepEqual((await r.json()).result.tools.map(x=>x.name),['read_state']);
});
test('MCP rejects unsupported protocol, batch messages, bad JSON and unsupported methods',async()=>{
 const f=fixture();assert.equal((await f.handler(req(rpc('ping'),{'mcp-protocol-version':'invalid'}))).status,400);
 assert.equal((await f.handler(req([rpc('ping')]))).status,400);
 assert.equal((await f.handler(new Request('https://example.invalid/mcp',{method:'GET'}))).status,405);
 const r=await f.handler(new Request('https://example.invalid/mcp',{method:'POST',headers:{authorization:'Bearer '+key,'content-type':'application/json'},body:'{'}));assert.equal(r.status,400);
});
test('MCP validates mutation schemas and does not allow owner or SQL injection fields',async()=>{
 const f=fixture();for(const args of [{title:'Missing request ID'},{request_id:'invalid',title:'Bad UUID'},{request_id:'00000000-0000-0000-0000-000000000001',title:'Denied',user_id:'other'},{sql:'select 1'}]){
 const r=await f.handler(req(rpc('tools/call',{name:'create_task',arguments:args})));assert.equal((await r.json()).error.code,-32602);
 }assert.ok(f.calls.every(c=>c.tool===null));
});
test('MCP forwards only typed arguments and preserves request identity',async()=>{
 const f=fixture();const args={request_id:'00000000-0000-0000-0000-000000000001',title:'Valid task'};
 const r=await f.handler(req(rpc('tools/call',{name:'create_task',arguments:args})));assert.equal(r.status,200);assert.equal((await r.json()).result.isError,false);
 assert.deepEqual(f.calls.at(-1),{token:key,tool:'create_task',args});
});
test('MCP cannot call operations omitted from token grants',async()=>{
 const f=fixture(['read_state']);const r=await f.handler(req(rpc('tools/call',{name:'complete_task',arguments:{}})));assert.equal((await r.json()).error.code,-32602);assert.equal(f.calls.length,1);
});
test('MCP returns tool failures without exposing backend exceptions or credentials',async()=>{
 let handler=createMcpHandler(async()=>{throw new Error('PRIVATE DATABASE ERROR SECRET');});let r=await handler(req(rpc('ping')));assert.equal(r.status,500);assert.ok(!(await r.text()).includes('SECRET'));
 handler=createMcpHandler(async(_token,tool)=>tool===null?{ok:true,operations:['read_state']}:{ok:false,error:'forbidden'});
 r=await handler(req(rpc('tools/call',{name:'read_state'})));const body=await r.json();assert.equal(body.result.isError,true);assert.ok(!JSON.stringify(body).includes(key));
});
test('MCP rejects revoked tokens and propagates rate limits',async()=>{
 for(const [error,status] of [['unauthorized',401],['rate_limited',429]]){const handler=createMcpHandler(async()=>({ok:false,error}));assert.equal((await handler(req(rpc('ping')))).status,status);}
});
test('MCP bounds streamed bodies even without Content-Length',async()=>{
 const f=fixture();const r=await f.handler(req(rpc('ping',{large:'x'.repeat(66000)})));assert.equal(r.status,413);assert.equal(f.calls.length,0);
});
test('MCP notifications acknowledge without a JSON-RPC reply and do not invoke a tool',async()=>{
 const f=fixture();const r=await f.handler(req({jsonrpc:'2.0',method:'notifications/initialized'}));assert.equal(r.status,202);assert.equal(await r.text(),'');assert.equal(f.calls.length,1);
});
