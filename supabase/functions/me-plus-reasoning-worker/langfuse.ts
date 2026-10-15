// Optional metadata-only Langfuse exporter. Do not pass prompts, responses,
// user identifiers, Personal State, medical, finance or journal payloads.
export type MeplusTrace = {
  dispatchId: string; attempt: number; startedAt: string; completedAt: string;
  route: string; model: string; status: "completed" | "failed";
  inputTokens?: number; outputTokens?: number; costUsd?: number | null;
};
export type LangfuseConfig = {
  enabled: boolean; publicKey?: string; secretKey?: string; host?: string;
};

function attr(key: string, value: string | number) {
  return {key, value: typeof value === "number" ?
    {doubleValue: value} : {stringValue: value}};
}
function countAttr(key: string, n: number | undefined) {
  return {key, value:{intValue: String(Math.max(0,Math.round(n ?? 0)))}};
}
async function digestPrefix(text: string, bytes: number): Promise<string> {
  const raw = new TextEncoder().encode(text);
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256",raw));
  return Array.from(hash.slice(0,bytes)).map(b=>b.toString(16).padStart(2,"0")).join("");
}

export async function buildLangfusePayload(t: MeplusTrace) {
  const traceId = await digestPrefix("meplus:v2:"+t.dispatchId,16);
  const spanId = await digestPrefix("meplus:v2:"+t.dispatchId+":"+t.attempt,8);
  const start = BigInt(new Date(t.startedAt).getTime())*1000000n;
  const finish = BigInt(new Date(t.completedAt).getTime())*1000000n;
  const attributes = [
    attr("langfuse.trace.name","meplus.reasoning"),
    attr("langfuse.observation.type","generation"),
    attr("langfuse.observation.model.name",String(t.model).slice(0,100)),
    attr("langfuse.trace.metadata.dispatch_id",String(t.dispatchId).slice(0,64)),
    attr("langfuse.trace.metadata.reasoning_route",String(t.route).slice(0,80)),
    attr("langfuse.trace.metadata.outcome",t.status),
    countAttr("gen_ai.usage.input_tokens",t.inputTokens),
    countAttr("gen_ai.usage.output_tokens",t.outputTokens),
  ];
  if (Number.isFinite(t.costUsd) && (t.costUsd ?? -1) >= 0) {
    attributes.push(attr("gen_ai.usage.cost",Number(t.costUsd)));
  }
  return {resourceSpans:[{
    resource:{attributes:[attr("service.name","meplus-reasoning-worker")]},
    scopeSpans:[{scope:{name:"meplus-observability",version:"1"},
      spans:[{traceId,spanId,name:"meplus.reasoning",kind:1,
        startTimeUnixNano:start.toString(),
        endTimeUnixNano:(finish>start?finish:start).toString(),
        attributes,status:{code:t.status==="completed"?1:2}}]}]
  }]};
}

// Return false when disabled or unconfigured; never throw for missing config.
// Callers must also isolate exporter errors from canonical dispatch completion.
export async function exportLangfuseTrace(t: MeplusTrace, cfg: LangfuseConfig): Promise<boolean> {
  if (!cfg.enabled || !cfg.publicKey || !cfg.secretKey) return false;
  const host = (cfg.host || "https://cloud.langfuse.com").replace(/\/$/,"");
  if (!host.startsWith("https://")) throw new Error("Langfuse host must use HTTPS");
  const body = await buildLangfusePayload(t);
  const controller = new AbortController();
  const timer = setTimeout(()=>controller.abort(),1500);
  try {
    const response = await fetch(host+"/api/public/otel/v1/traces",{
      method:"POST",signal:controller.signal,
      headers:{
        "content-type":"application/json",
        "authorization":"Basic "+btoa(cfg.publicKey+":"+cfg.secretKey),
        "x-langfuse-ingestion-version":"4"
      },
      body:JSON.stringify(body)
    });
    if(!response.ok) throw new Error("Langfuse export failed: HTTP "+response.status);
    return true;
  } finally {clearTimeout(timer);}
}
