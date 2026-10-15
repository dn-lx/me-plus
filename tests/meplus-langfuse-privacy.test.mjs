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
 const body=await buildLangfusePayload(metrics);
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
});
test('Langfuse is off without explicit opt-in and credentials',async()=>{
 assert.equal(await exportLangfuseTrace(metrics,{enabled:false}),false);
 assert.equal(await exportLangfuseTrace(metrics,{enabled:true}),false);
});
test('Langfuse rejects cleartext export destinations',async()=>{
 await assert.rejects(exportLangfuseTrace(metrics,{
  enabled:true,publicKey:'test-key',secretKey:'test-secret',host:'http://example.invalid'
 }),/HTTPS/);
});
