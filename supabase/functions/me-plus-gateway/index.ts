import { withSupabase } from "npm:@supabase/server@^1";

const GATEWAY_VERSION = "gateway-v1.0.0";
const ALLOWED_CONTEXT_TOPICS = new Set(["state","goals","routines","actions","recommendations"]);

function json(data: any, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "authorization, x-meplus-api-key, content-type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "X-MePlus-Gateway-Version": GATEWAY_VERSION,
      "Cache-Control": "no-store"
    }
  });
}

function extractGatewayKey(req: Request) {
  const direct = req.headers.get("x-meplus-api-key")?.trim();
  if (direct) return direct;
  const auth = req.headers.get("authorization")?.trim() ?? "";
  if (/^Bearer\s+/i.test(auth)) return auth.replace(/^Bearer\s+/i, "").trim();
  return null;
}

async function safeAudit(admin: any, userId: string, operation: string, requestId: string, status: string, detail: any = {}) {
  try {
    await admin.from("audit_events").insert({
      user_id: userId,
      actor_type: "meplus_gateway",
      actor_id: null,
      event_type: "gateway_request",
      entity_type: "gateway_operation",
      entity_id: null,
      occurred_at: new Date().toISOString(),
      metadata: {
        operation,
        request_id: requestId,
        status,
        gateway_version: GATEWAY_VERSION,
        ...detail
      }
    });
  } catch (_) {}
}

function partsInZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone, year:"numeric", month:"2-digit", day:"2-digit",
    hour:"2-digit", minute:"2-digit", second:"2-digit", hourCycle:"h23",
  }).formatToParts(date);
  const get=(t:string)=>Number(parts.find(p=>p.type===t)?.value ?? 0);
  return {year:get("year"),month:get("month"),day:get("day"),hour:get("hour"),minute:get("minute"),second:get("second")};
}
function dateKey(date: Date, timeZone: string) {
  const p=partsInZone(date,timeZone);
  return String(p.year)+"-"+String(p.month).padStart(2,"0")+"-"+String(p.day).padStart(2,"0");
}
function zonedToUtc(date:string,time:string,timeZone:string) {
  const [y,m,d]=date.split("-").map(Number);
  const [h=0,mi=0,s=0]=time.split(":").map(Number);
  const naive=Date.UTC(y,m-1,d,h,mi,s);
  let guess=new Date(naive);
  for(let i=0;i<2;i++){
    const p=partsInZone(guess,timeZone);
    const represented=Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute,p.second);
    guess=new Date(guess.getTime()+(naive-represented));
  }
  return guess;
}
function avg(values:(number|null|undefined)[]) {
  const xs=values.filter((v):v is number=>typeof v==="number");
  return xs.length?Math.round((xs.reduce((a,b)=>a+b,0)/xs.length)*10)/10:null;
}
function startOfWindow(days=7){ return new Date(Date.now()-days*86400000).toISOString(); }

async function getCurrentState(admin:any,userId:string,input:any) {
  const asOf = typeof input?.as_of === "string" ? input.as_of : new Date().toISOString();
  const { data, error } = await admin.rpc("server_gateway_build_personal_state", { p_user_id:userId, p_as_of:asOf });
  if (error) throw new Error("build_personal_state: "+error.message);
  return { state:data, as_of:asOf };
}

async function getContext(admin:any,userId:string,input:any) {
  const requested = Array.isArray(input?.topics) ? input.topics.map((x:any)=>String(x)) : ["state"];
  const topics = [...new Set(requested.filter((x:string)=>ALLOWED_CONTEXT_TOPICS.has(x)))];
  if (!topics.length) return { topics:[], context:{} };
  const asOf = typeof input?.as_of === "string" ? input.as_of : new Date().toISOString();
  const limit = Math.max(1,Math.min(50,Number(input?.limit ?? 20)));
  const tasks:any[] = [];
  const labels:string[] = [];
  for (const topic of topics) {
    labels.push(topic);
    if (topic==="state") tasks.push(admin.rpc("server_gateway_build_personal_state",{p_user_id:userId,p_as_of:asOf}));
    if (topic==="goals") tasks.push(admin.rpc("server_gateway_get_active_goals",{p_user_id:userId}));
    if (topic==="routines") tasks.push(admin.rpc("server_gateway_get_due_routines",{p_user_id:userId,p_as_of:asOf}));
    if (topic==="actions") tasks.push(admin.rpc("server_gateway_get_recent_actions",{p_user_id:userId,p_limit:limit}));
    if (topic==="recommendations") tasks.push(admin.rpc("server_gateway_get_recommendation_history",{p_user_id:userId,p_limit:limit}));
  }
  const results = await Promise.all(tasks);
  const context:any = {};
  for (let i=0;i<results.length;i++) {
    const r=results[i];
    if (r.error) throw new Error(labels[i]+": "+r.error.message);
    context[labels[i]]=r.data;
  }
  return { topics, as_of:asOf, context };
}

async function today(admin:any,userId:string) {
  const now = new Date();
  const {data:profile,error:profileError}=await admin.from("profiles")
    .select("id,timezone,locale,onboarding_completed_at")
    .eq("id",userId).maybeSingle();
  if(profileError) throw profileError;
  if(!profile) return { __status:409, error:"onboarding_required", message:"Create your Me+ profile before reading Today." };

  const timeZone=profile.timezone || "UTC";
  const planDate=dateKey(now,timeZone);

  const {data:state,error:stateError}=await admin.rpc("server_gateway_build_personal_state",{
    p_user_id:userId,
    p_as_of:now.toISOString()
  });
  if(stateError) throw new Error("today_state: "+stateError.message);

  const {data:actions,error:actionsError}=await admin.from("actions")
    .select("id,goal_id,routine_event_id,recommendation_id,domain,origin,title,instructions,priority,version,status,estimated_minutes,available_from,due_at,planned_start,planned_end,reason,constraint_flags,surface_provider,surface_external_id,surface_state,surface_source,surface_policy,updated_at")
    .eq("user_id",userId)
    .in("status",["proposed","planned","available","in_progress","partial"])
    .order("priority")
    .order("planned_start",{ascending:true,nullsFirst:false})
    .order("due_at",{ascending:true,nullsFirst:false});
  if(actionsError) throw actionsError;

  const localDayStart=zonedToUtc(planDate,"00:00:00",timeZone);
  const localDayEnd=zonedToUtc(planDate,"23:59:59",timeZone);

  const todayActions=(actions||[]).filter((a:any)=>{
    const refs=[a.planned_start,a.available_from,a.due_at].filter(Boolean).map((x:string)=>Date.parse(x));
    if(!refs.length) return true;
    return refs.some((ms:number)=>ms>=localDayStart.getTime() && ms<=localDayEnd.getTime());
  });

  const grouped={must:[] as any[],should:[] as any[],bonus:[] as any[]};
  for(const a of todayActions){
    const p=(a.priority==="must"||a.priority==="bonus")?a.priority:"should";
    grouped[p].push(a);
  }

  return {
    plan_date:planDate,
    timezone:timeZone,
    generated_at:now.toISOString(),
    source:"canonical_scheduler_state",
    state,
    actions:todayActions,
    priorities:grouped,
    counts:{
      total:todayActions.length,
      must:grouped.must.length,
      should:grouped.should.length,
      bonus:grouped.bonus.length
    }
  };
}

async function completeAction(admin:any,userId:string,input:any) {
  const EXECUTION_STATUSES = new Set(["completed","partial","skipped"]);
  const actionId=input?.action_id;
  const status=input?.status;
  if(!actionId || !EXECUTION_STATUSES.has(status)) return { __status:400, error:"invalid_request", message:"action_id and status completed|partial|skipped are required" };
  if(input?.outcome && typeof input.outcome==="object" && !input.outcome.outcome_type) {
    return { __status:400, error:"invalid_outcome", message:"outcome.outcome_type is required when outcome is provided" };
  }
  const {data:action,error:readError}=await admin.from("actions")
    .select("id,user_id,routine_event_id,recommendation_id,status,version,title,domain")
    .eq("user_id",userId).eq("id",actionId).maybeSingle();
  if(readError) throw readError;
  if(!action) return { __status:404, error:"action_not_found" };
  if(input?.dry_run===true) return { dry_run:true, valid:true, action:{id:action.id,status:action.status,version:action.version,title:action.title,domain:action.domain}, requested_status:status };

  const patch:any={status};
  if(input.version && ["full","reduced","minimum"].includes(input.version)) patch.version=input.version;
  if(input.planned_start!==undefined) patch.planned_start=input.planned_start;
  if(input.planned_end!==undefined) patch.planned_end=input.planned_end;

  const {data:updated,error:updateError}=await admin.from("actions").update(patch)
    .eq("user_id",userId).eq("id",actionId).select().single();
  if(updateError) throw updateError;

  const now=new Date().toISOString();
  if(action.routine_event_id){
    const eventPatch:any={
      status,
      selected_version:patch.version ?? action.version,
      completed_at: status==="completed" || status==="partial" ? now : null,
      skip_reason: status==="skipped" ? (input.reason_code ?? input.note ?? null) : null,
    };
    const {error:eventError}=await admin.from("routine_events").update(eventPatch)
      .eq("user_id",userId).eq("id",action.routine_event_id);
    if(eventError) throw eventError;
  }

  const {data:event,error:eventInsertError}=await admin.from("action_events").insert({
    user_id:userId,action_id:actionId,event_type:status,occurred_at:now,
    reason_code:input.reason_code ?? null,note:input.note ?? null,
    metadata:{previous_status:action.status,version:patch.version ?? action.version}
  }).select().single();
  if(eventInsertError) throw eventInsertError;

  let outcome=null;
  if(input.outcome && typeof input.outcome==="object"){
    const o=input.outcome;
    const {data:created,error:outcomeError}=await admin.from("outcomes").insert({
      user_id:userId,action_id:actionId,recommendation_id:action.recommendation_id,
      outcome_type:o.outcome_type,observed_at:o.observed_at ?? now,
      subjective_value:o.subjective_value ?? null,objective_refs:o.objective_refs ?? null,
      summary:o.summary ?? null
    }).select().single();
    if(outcomeError) throw outcomeError;
    outcome=created;
  }
  return {action:updated,action_event:event,outcome};
}

async function weeklyReview(admin:any,userId:string) {
  const from=startOfWindow(7), now=new Date().toISOString();
  const [actionsRes,checkinsRes,goalsRes,feedbackRes] = await Promise.all([
    admin.from("actions").select("id,domain,priority,status,version,title,updated_at").eq("user_id",userId).gte("updated_at",from),
    admin.from("daily_checkins").select("mood,energy,stress,soreness,sleep_quality,observed_at").eq("user_id",userId).gte("observed_at",from),
    admin.from("goals").select("id,domain,title,priority,status,target_date").eq("user_id",userId).eq("status","active"),
    admin.from("recommendation_feedback").select("decision,helpfulness,recorded_at").eq("user_id",userId).gte("recorded_at",from)
  ]);
  for (const r of [actionsRes,checkinsRes,goalsRes,feedbackRes]) if (r.error) throw r.error;
  const actions=actionsRes.data||[], checkins=checkinsRes.data||[], goals=goalsRes.data||[], feedback=feedbackRes.data||[];

  const executed=actions.filter((a:any)=>["completed","partial","skipped"].includes(a.status));
  const completed=executed.filter((a:any)=>a.status==="completed").length;
  const partial=executed.filter((a:any)=>a.status==="partial").length;
  const skipped=executed.filter((a:any)=>a.status==="skipped").length;
  const byDomain:any={};
  for(const a of executed){
    const d=a.domain||"other"; byDomain[d]??={completed:0,partial:0,skipped:0,total:0};
    byDomain[d][a.status]++; byDomain[d].total++;
  }
  const skippedDomains=Object.entries(byDomain)
    .map(([domain,v]:any)=>({domain,skipped:v.skipped,total:v.total,skip_rate:v.total?Math.round(v.skipped/v.total*100):0}))
    .filter((x:any)=>x.skipped>0).sort((a:any,b:any)=>b.skip_rate-a.skip_rate);

  const review={
    window:{from,to:now,days:7},
    execution:{
      total:executed.length,completed,partial,skipped,
      completion_rate:executed.length?Math.round(completed/executed.length*100):null,
      by_domain:byDomain,
      most_skipped_domains:skippedDomains.slice(0,3)
    },
    state:{
      checkins:checkins.length,
      mood_avg:avg(checkins.map((x:any)=>x.mood)),
      energy_avg:avg(checkins.map((x:any)=>x.energy)),
      stress_avg:avg(checkins.map((x:any)=>x.stress)),
      soreness_avg:avg(checkins.map((x:any)=>x.soreness)),
      sleep_quality_avg:avg(checkins.map((x:any)=>x.sleep_quality))
    },
    goals:{active:goals},
    recommendation_feedback:{
      count:feedback.length,
      helpfulness_avg:avg(feedback.map((x:any)=>x.helpfulness)),
      accepted:feedback.filter((x:any)=>x.decision==="accepted").length,
      dismissed:feedback.filter((x:any)=>x.decision==="dismissed").length
    }
  };

  const {data:snapshot,error}=await admin.from("personal_state_snapshots").insert({
    user_id:userId,state_type:"weekly_review",as_of:now,schema_version:"0.1.0",
    state:review,input_refs:[],builder_version:"weekly-gateway-v1.0.0"
  }).select().single();
  if(error) throw error;
  return {review,state_snapshot_id:snapshot.id};
}

export default {
  fetch: withSupabase({ auth: "none" }, async (req:any, ctx:any) => {
    if(req.method==="OPTIONS") return json({ok:true});
    if(req.method!=="POST") return json({error:"method_not_allowed"},405);

    const requestId=crypto.randomUUID();
    const contentLength=Number(req.headers.get("content-length") ?? "0");
    if(Number.isFinite(contentLength) && contentLength > 65536) return json({error:"payload_too_large",request_id:requestId},413);

    const key=extractGatewayKey(req);
    if(!key) return json({error:"unauthorized",request_id:requestId},401);

    const admin=ctx.supabaseAdmin;
    const {data:userId,error:authError}=await admin.rpc("server_authenticate_meplus_gateway",{p_api_key:key});
    if(authError || !userId) return json({error:"unauthorized",request_id:requestId},401);

    let body:any={};
    try { body=await req.json(); } catch { return json({error:"invalid_json",request_id:requestId},400); }
    const operation=String(body?.operation ?? "").trim();
    const input=body?.input && typeof body.input==="object" ? body.input : {};

    if(!operation) return json({error:"operation_required",request_id:requestId},400);

    try {
      let result:any;
      if(operation==="capabilities"){
        result={
          gateway_version:GATEWAY_VERSION,
          operations:["capabilities","get_current_state","get_context","today","complete_action","weekly_review"],
          context_topics:[...ALLOWED_CONTEXT_TOPICS],
          max_context_limit:50,
          complete_action_supports_dry_run:true
        };
      } else if(operation==="get_current_state"){
        result=await getCurrentState(admin,String(userId),input);
      } else if(operation==="get_context"){
        result=await getContext(admin,String(userId),input);
      } else if(operation==="today"){
        result=await today(admin,String(userId));
      } else if(operation==="complete_action"){
        result=await completeAction(admin,String(userId),input);
      } else if(operation==="weekly_review"){
        result=await weeklyReview(admin,String(userId));
      } else {
        await safeAudit(admin,String(userId),operation,requestId,"rejected",{reason:"unknown_operation"});
        return json({error:"unknown_operation",operation,request_id:requestId},404);
      }

      if(result && typeof result==="object" && Number.isInteger(result.__status)){
        const status=result.__status;
        const copy={...result}; delete copy.__status;
        await safeAudit(admin,String(userId),operation,requestId,"rejected",{http_status:status});
        return json({...copy,request_id:requestId},status);
      }

      await safeAudit(admin,String(userId),operation,requestId,"completed");
      return json({ok:true,operation,gateway_version:GATEWAY_VERSION,request_id:requestId,result});
    } catch (error:any) {
      console.error(JSON.stringify({event:"meplus_gateway_error",request_id:requestId,operation,error_type:error?.name ?? "Error",message:String(error?.message ?? error).slice(0,800)}));
      await safeAudit(admin,String(userId),operation,requestId,"failed",{error_type:error?.name ?? "Error"});
      return json({error:"gateway_operation_failed",operation,request_id:requestId},500);
    }
  })
};
