// Optional metadata-only exporter. No prompt/output/person/health/finance values.
export type MeplusTrace = {
  dispatchId: string; attempt: number; startedAt: string; completedAt: string;
  route: string; model: string; status: 'completed' | 'failed';
  inputTokens?: number; outputTokens?: number; costUsd?: number | null;
};
export type LangfuseConfig = {
  enabled: boolean; privacyApproved?: boolean; retentionApproved?: boolean;
  approvedModels?: string[]; publicKey?: string; secretKey?: string; host?: string;
};
const routes = new Set(['standard_guidance','fast_operational','deep_cross_domain','critical_review']);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const validInt = (n: number, max: number) => Number.isSafeInteger(n) && n >= 0 && n <= max;
function attr(key: string, value: string | number) {
  return { key, value: typeof value === 'number' ? { doubleValue: value } : { stringValue: value } };
}
async function digestPrefix(value: string, bytes: number) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)));
  return Array.from(digest.slice(0,bytes),b=>b.toString(16).padStart(2,'0')).join('');
}
export async function buildLangfusePayload(t: MeplusTrace, approvedModels: string[] = []) {
  const start=Date.parse(t.startedAt),end=Date.parse(t.completedAt);
  const input=t.inputTokens??0,output=t.outputTokens??0,cost=t.costUsd??0;
  if(!uuid.test(t.dispatchId)||!validInt(t.attempt,100)||!routes.has(t.route)||
    !['completed','failed'].includes(t.status)||!approvedModels.includes(t.model)||
    !/^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,99}$/.test(t.model)||
    !Number.isFinite(start)||!Number.isFinite(end)||start<0||end<start||end-start>86400000||
    !validInt(input,10000000)||!validInt(output,10000000)||!Number.isFinite(cost)||cost<0||cost>10000)
    throw new Error('invalid_trace_metadata');
  return {resourceSpans:[{resource:{attributes:[attr('service.name','meplus-reasoning-worker')]},
    scopeSpans:[{scope:{name:'meplus-observability',version:'2'},spans:[{
      traceId:await digestPrefix('meplus:v2:'+t.dispatchId,16),
      spanId:await digestPrefix('meplus:v2:'+t.dispatchId+':'+t.attempt,8),
      name:'meplus.reasoning',kind:1,startTimeUnixNano:(BigInt(start)*1000000n).toString(),
      endTimeUnixNano:(BigInt(end)*1000000n).toString(),
      attributes:[attr('langfuse.trace.name','meplus.reasoning'),attr('langfuse.observation.type','generation'),
        attr('langfuse.observation.model.name',t.model),attr('langfuse.trace.metadata.reasoning_route',t.route),
        attr('langfuse.trace.metadata.outcome',t.status),
        {key:'gen_ai.usage.input_tokens',value:{intValue:String(input)}},
        {key:'gen_ai.usage.output_tokens',value:{intValue:String(output)}},attr('gen_ai.usage.cost',cost)],
      status:{code:t.status==='completed'?1:2}
    }]}]}]};
}
export async function exportLangfuseTrace(t: MeplusTrace,cfg: LangfuseConfig,fetchImpl: typeof fetch=fetch): Promise<boolean> {
  if(!cfg.enabled||cfg.privacyApproved!==true||cfg.retentionApproved!==true) return false;
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),1500);
  try {
    const host=new URL(cfg.host??'https://cloud.langfuse.com');
    if(host.protocol!=='https:'||host.username||host.password||host.pathname!=='/'||host.search||host.hash||host.port||
      !/^pk-lf-[A-Za-z0-9_-]{8,200}$/.test(cfg.publicKey??'')||!/^sk-lf-[A-Za-z0-9_-]{8,200}$/.test(cfg.secretKey??'')) return false;
    const body=await buildLangfusePayload(t,cfg.approvedModels);
    const response=await fetchImpl(host.origin+'/api/public/otel/v1/traces',{
      method:'POST',redirect:'error',signal:controller.signal,
      headers:{'content-type':'application/json','authorization':'Basic '+btoa(cfg.publicKey+':'+cfg.secretKey),'x-langfuse-ingestion-version':'4'},
      body:JSON.stringify(body)});
    if(!response.ok) return false;
    const reader=response.body?.getReader();let bytes=0,text='';const decoder=new TextDecoder();
    if(reader)try{for(;;){const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;
      if(bytes>16384){await reader.cancel();return false;}text+=decoder.decode(part.value,{stream:true});}
    }finally{reader.releaseLock();}
    text+=decoder.decode();const ack=text?JSON.parse(text):{};
    if(ack.partialSuccess&&(Number(ack.partialSuccess.rejectedSpans??0)!==0||ack.partialSuccess.errorMessage)) return false;
    return true;
  }catch{return false;}finally{clearTimeout(timer);}
}
