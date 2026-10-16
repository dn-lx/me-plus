import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMetadataTrace,exportMetadataTrace } from '../integrations/agent-clients/langfuse/export.mjs';
const event={dispatchId:'11111111-2222-3333-4444-555555555555',attempt:1,route:'synthetic_canary',model:'approved/model',status:'completed',startedAt:'2026-10-16T08:00:00Z',completedAt:'2026-10-16T08:00:01Z',inputTokens:10,outputTokens:5,costUsd:0.001,
 prompt:'PRIVATE_PROMPT',output:'PRIVATE_OUTPUT',user_id:'PRIVATE_USER',health:{weight:'PRIVATE_HEALTH'},finance:'PRIVATE_FINANCE',error:'PRIVATE_SECRET'};
const cfg={enabled:true,privacyApproved:true,retentionApproved:true,origin:'https://langfuse.example.invalid',publicKey:'pk-lf-synthetic-public',secretKey:'sk-lf-synthetic-secret',approvedModels:['approved/model']};
test('Langfuse builds a deterministic allowlisted OTLP span without raw IDs or extra content',()=>{
 const payload=buildMetadataTrace(event,cfg.approvedModels);const span=payload.resourceSpans[0].scopeSpans[0].spans[0];
 assert.match(span.traceId,/^[a-f0-9]{32}$/);assert.match(span.spanId,/^[a-f0-9]{16}$/);
 assert.deepEqual(buildMetadataTrace(event,cfg.approvedModels),payload);
 assert.notEqual(buildMetadataTrace({...event,attempt:2},cfg.approvedModels).resourceSpans[0].scopeSpans[0].spans[0].spanId,span.spanId);
 assert.equal(span.endTimeUnixNano,'1792137601000000000');
 for(const value of [event.dispatchId,'PRIVATE_',cfg.secretKey,cfg.publicKey])assert.ok(!JSON.stringify(payload).includes(value));
 assert.equal(span.attributes.length,8);
});
test('Langfuse rejects freeform metadata, malformed identifiers and invalid counts/times',()=>{
 for(const patch of [{dispatchId:'PRIVATE_USER'},{route:'PRIVATE_HEALTH'},{model:'PRIVATE_SECRET'},{inputTokens:NaN},{outputTokens:-1},{costUsd:Infinity},{attempt:1.5},{completedAt:'bad'},{completedAt:'2026-10-15T08:00:00Z'}])assert.throws(()=>buildMetadataTrace({...event,...patch},cfg.approvedModels),/invalid_trace_metadata/);
});
test('Langfuse defaults off and privacy gates prevent any request',async()=>{
 for(const config of [{},{enabled:false},{enabled:true},{...cfg,privacyApproved:false},{...cfg,retentionApproved:false}]){
  const result=await exportMetadataTrace(event,config,()=>assert.fail('unapproved export'));assert.equal(result.exported,false);
 }
});
test('Langfuse uses current OTLP headers and no redirects, retry, prompt or output',async()=>{
 let calls=0;const result=await exportMetadataTrace(event,cfg,async(url,options)=>{
  calls++;assert.equal(url,cfg.origin+'/api/public/otel/v1/traces');assert.equal(options.redirect,'error');assert.ok(options.signal);
  assert.equal(options.headers['x-langfuse-ingestion-version'],'4');assert.match(options.headers.authorization,/^Basic /);assert.ok(!options.body.includes('PRIVATE_'));
  return new Response('{}');
 });assert.deepEqual(result,{exported:true});assert.equal(calls,1);
});
test('Langfuse errors and partial acknowledgements remain nonblocking and sanitized',async()=>{
 for(const response of [()=>{throw new Error('PRIVATE_SECRET')},()=>new Response('PRIVATE_SECRET',{status:401}),()=>new Response(JSON.stringify({partialSuccess:{rejectedSpans:1,errorMessage:'PRIVATE_SECRET'}})),()=>new Response('x'.repeat(16385))]){
  const result=await exportMetadataTrace(event,cfg,response);assert.equal(result.exported,false);assert.ok(!JSON.stringify(result).includes('PRIVATE_SECRET'));
 }
});
test('Langfuse refuses unsafe/unconfigured destinations or credentials without fetching',async()=>{
 for(const patch of [{origin:'http://host.invalid'},{origin:'https://secret@host.invalid'},{origin:'https://host.invalid/path'},{origin:'https://host.invalid?key=SECRET'},{publicKey:''},{secretKey:''}])assert.equal((await exportMetadataTrace(event,{...cfg,...patch},()=>assert.fail('unsafe export'))).exported,false);
});
