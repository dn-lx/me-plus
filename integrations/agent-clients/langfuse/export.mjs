/** Optional metadata-only OTLP/HTTP exporter. No worker/routing coupling. */
import { createHash } from 'node:crypto';
const routes = new Set(['native_worker','letta_shadow','letta_review','synthetic_canary']);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const identifier = /^[a-zA-Z0-9][a-zA-Z0-9_.:/-]{0,99}$/;
const validInt = (n, max) => Number.isSafeInteger(n) && n >= 0 && n <= max;
const hash = (s, length) => createHash('sha256').update(s).digest('hex').slice(0,length);
const attribute = (key, value) => ({ key, value: typeof value === 'number' ? { doubleValue:value } : { stringValue:value } });
function invalid() { throw new Error('invalid_trace_metadata'); }
export function buildMetadataTrace(event, approvedModels) {
  if (!event || !uuid.test(event.dispatchId ?? '') || !validInt(event.attempt,100) || !routes.has(event.route) || !['completed','failed'].includes(event.status)
      || typeof event.model !== 'string' || !identifier.test(event.model) || !Array.isArray(approvedModels) || !approvedModels.includes(event.model)) invalid();
  const start=Date.parse(event.startedAt);const end=Date.parse(event.completedAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start<0 || end<start || end-start>86400000) invalid();
  for(const count of [event.inputTokens,event.outputTokens]) if(!validInt(count,10000000)) invalid();
  if(typeof event.costUsd!=='number'||!Number.isFinite(event.costUsd)||event.costUsd<0||event.costUsd>10000) invalid();
  const span={traceId:hash('meplus:v2:'+event.dispatchId,32),spanId:hash('meplus:v2:'+event.dispatchId+':'+event.attempt,16),
    name:'meplus.reasoning',kind:1,startTimeUnixNano:(BigInt(start)*1000000n).toString(),endTimeUnixNano:(BigInt(end)*1000000n).toString(),
    attributes:[attribute('langfuse.trace.name','meplus.reasoning'),attribute('langfuse.observation.type','generation'),
      attribute('langfuse.observation.model.name',event.model),attribute('langfuse.trace.metadata.route',event.route),
      attribute('langfuse.trace.metadata.outcome',event.status),
      {key:'gen_ai.usage.input_tokens',value:{intValue:String(event.inputTokens)}},
      {key:'gen_ai.usage.output_tokens',value:{intValue:String(event.outputTokens)}},attribute('gen_ai.usage.cost',event.costUsd)],status:{code:event.status==='completed'?1:2}};
  return {resourceSpans:[{resource:{attributes:[attribute('service.name','meplus-agent-bridge')]},scopeSpans:[{scope:{name:'meplus-metadata-only',version:'1'},spans:[span]}]}]};
}
export async function exportMetadataTrace(event, config = {}, fetchImpl = fetch) {
  if(config.enabled!==true)return {exported:false,reason:'disabled'};
  if(config.privacyApproved!==true || config.retentionApproved!==true)return {exported:false,reason:'privacy_gates_pending'};
  try {
    const origin=new URL(config.origin);
    if(origin.protocol!=='https:'||origin.username||origin.password||origin.pathname!=='/'||origin.search||origin.hash||origin.port)throw new Error();
    if(!/^pk-lf-[A-Za-z0-9_-]{8,200}$/.test(config.publicKey??'')||!/^sk-lf-[A-Za-z0-9_-]{8,200}$/.test(config.secretKey??''))throw new Error();
    const body=buildMetadataTrace(event,config.approvedModels);
    const response=await fetchImpl(origin.origin+'/api/public/otel/v1/traces',{method:'POST',redirect:'error',signal:AbortSignal.timeout(1500),
      headers:{'content-type':'application/json','x-langfuse-ingestion-version':'4',authorization:'Basic '+Buffer.from(config.publicKey+':'+config.secretKey,'utf8').toString('base64')},body:JSON.stringify(body)});
    if(!response.ok)return {exported:false,reason:'export_failed'};
    const reader=response.body?.getReader();let bytes=0;const chunks=[];
    if(reader)try{while(true){const r=await reader.read();if(r.done)break;bytes+=r.value.byteLength;if(bytes>16384){await reader.cancel();throw new Error();}chunks.push(r.value);}}finally{reader.releaseLock();}
    const result=bytes?JSON.parse(Buffer.concat(chunks).toString('utf8')):{};
    if(result.partialSuccess&&(Number(result.partialSuccess.rejectedSpans??0)!==0||result.partialSuccess.errorMessage))return {exported:false,reason:'partial_rejection'};
    return {exported:true};
  }catch{return {exported:false,reason:'export_failed'};}
}
