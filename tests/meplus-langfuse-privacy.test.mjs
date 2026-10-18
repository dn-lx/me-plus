import test from 'node:test';
import assert from 'node:assert/strict';
import {buildLangfusePayload,exportLangfuseTrace} from '../supabase/functions/me-plus-reasoning-worker/langfuse.ts';

const metrics={
 dispatchId:'7d7d590d-b4e6-49f9-a5a6-fc5884a42efa',attempt:1,
 startedAt:'2026-10-15T09:00:00.000Z',completedAt:'2026-10-15T09:00:02.500Z',
 route:'standard_guidance',model:'gpt-6.1-luna',status:'completed',
 inputTokens:1200,outputTokens:280,costUsd:0.0012,
 user_id:'SHOULD_NOT_LEAVE_SYSTEM',prompt:'PRIVATE_HEALTH_FINANCE_JOURNAL',
 output:'NEVER_EXPORT_RAW_RESPONSE'
};
test('Langfuse OTLP exports only allowlisted operational metadata',async()=>{
 const body=await buildLangfusePayload(metrics,['gpt-6.1-luna']);
 const serialized=JSON.stringify(body);
 assert.equal(body.resourceSpans.length,1);
 const span=body.resourceSpans[0].scopeSpans[0].spans[0];
 assert.match(span.traceId,/^[0-9a-f]{32}$/);
 assert.match(span.spanId,/^[0-9a-f]{16}$/);
 assert.equal(span.endTimeUnixNano,'1792054802500000000');
 assert.equal(span.startTimeUnixNano,'1792054800000000000');
 const attrs=span.attributes.map(a=>a.key);
 assert.ok(attrs.includes('langfuse.observation.type'));
 assert.ok(attrs.includes('langfuse.observation.model.name'));
 assert.ok(attrs.includes('gen_ai.usage.input_tokens'));
 assert.ok(attrs.includes('gen_ai.usage.cost'));
 for(const privateValue of ['SHOULD_NOT_LEAVE_SYSTEM','PRIVATE_HEALTH_FINANCE_JOURNAL','NEVER_EXPORT_RAW_RESPONSE']){
   assert.ok(!serialized.includes(privateValue));
 }
 assert.ok(!attrs.some(x=>/input|output|prompt|user\.id|finance|journal/i.test(x) && !x.startsWith('gen_ai.usage.')));
 assert.ok(!serialized.includes(metrics.dispatchId));
});
test('Langfuse is off without explicit opt-in and credentials',async()=>{
 assert.equal(await exportLangfuseTrace(metrics,{enabled:false}),false);
 assert.equal(await exportLangfuseTrace(metrics,{enabled:true}),false);
});
const config={enabled:true,privacyApproved:true,retentionApproved:true,approvedModels:['gpt-6.1-luna'],publicKey:'pk-lf-fixture0001',secretKey:'sk-lf-fixture0001',host:'https://example.invalid'};
test('Langfuse denies privacy gates, credentials and unsafe origins without network',async()=>{
 let calls=0;const denied=async()=>{calls++;throw Error('must not reach network');};
 for(const cfg of [{...config,privacyApproved:false},{...config,retentionApproved:false},{...config,approvedModels:[]},{...config,publicKey:'invalid'},
  ...['http://example.invalid','https://u:p@example.invalid','https://example.invalid/path','https://example.invalid?x=1','https://example.invalid#x','https://example.invalid:444'].map(host=>({...config,host}))])
  assert.equal(await exportLangfuseTrace(metrics,cfg,denied),false);
 assert.equal(calls,0);
});
test('Langfuse bounded acknowledgements and failures stay nonblocking',async()=>{
 let sent;
 const ok=async(url,init)=>{sent={url,init};return new Response('{}');};
 assert.equal(await exportLangfuseTrace(metrics,config,ok),true);assert.equal(sent.init.redirect,'error');
 assert.equal(sent.url,'https://example.invalid/api/public/otel/v1/traces');
 for(const response of [new Response('{}',{status:503}),new Response('{'),new Response('x'.repeat(16385)),new Response('{"partialSuccess":{"rejectedSpans":"1"}}'),new Response('{"partialSuccess":{"errorMessage":"rejected"}}')])
  assert.equal(await exportLangfuseTrace(metrics,config,async()=>response),false);
 assert.equal(await exportLangfuseTrace(metrics,config,async()=>{throw Error('offline');}),false);
});
test('untrusted trace metadata cannot escape through allowlisted attributes',async()=>{
 for(const change of [{dispatchId:'private-user-name'},{route:'PRIVATE_HEALTH_FINANCE_JOURNAL'},{model:'unapproved'},
   {inputTokens:Infinity},{outputTokens:-1},{costUsd:NaN},{attempt:101},{completedAt:'invalid'},{completedAt:'2026-10-14T00:00:00Z'}])
  await assert.rejects(buildLangfusePayload({...metrics,...change},config.approvedModels),/invalid_trace_metadata/);
});


test('reasoning worker preserves active Luna model routing and optional tracing',async()=>{
  const {readFile}=await import('node:fs/promises');
  const {fileURLToPath}=await import('node:url');
  const source=await readFile(fileURLToPath(new URL('../supabase/functions/me-plus-reasoning-worker/index.ts',import.meta.url)),'utf8');
  assert.match(source,/meplus-ai-routing-v4-luna-adaptive-effort/);
  assert.match(source,/const FALLBACK_MODEL = [^\n]*luna/);
  assert.match(source,/MEPLUS_LANGFUSE_ENABLED/);
  assert.match(source,/langfuse_trace_unavailable_nonblocking/);
});

