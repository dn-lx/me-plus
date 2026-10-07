import { withSupabase } from "npm:@supabase/server@^1";

const GATEWAY_VERSION = "gateway-v1.17.0";
const ALLOWED_CONTEXT_TOPICS = new Set(["state","goals","routines","actions","recommendations","guidance"]);

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
    if (topic==="guidance") tasks.push(admin.rpc("server_gateway_get_current_guidance",{p_user_id:userId,p_as_of:asOf}));
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

  const {data:guidance,error:guidanceError}=await admin.rpc("server_gateway_get_current_guidance",{
    p_user_id:userId,
    p_as_of:now.toISOString()
  });
  if(guidanceError) throw new Error("today_guidance: "+guidanceError.message);

  const {data:actions,error:actionsError}=await admin.from("actions")
    .select("id,goal_id,routine_event_id,recommendation_id,daily_plan_id,domain,origin,title,instructions,priority,version,status,estimated_minutes,available_from,due_at,planned_start,planned_end,reason,constraint_flags,surface_provider,surface_external_id,surface_state,surface_source,surface_policy,surface_must_remain_open,surface_continuous_required,updated_at")
    .eq("user_id",userId)
    .in("status",["proposed","planned","available","in_progress","partial"])
    .order("priority")
    .order("planned_start",{ascending:true,nullsFirst:false})
    .order("due_at",{ascending:true,nullsFirst:false});
  if(actionsError) throw actionsError;

  const localDayStart=zonedToUtc(planDate,"00:00:00",timeZone);
  const localDayEnd=zonedToUtc(planDate,"23:59:59",timeZone);

  const plannerAllowsToday=(a:any)=>{
    const planner=a?.constraint_flags?.daily_planner;
    if(!planner || typeof planner!=="object") return true;
    const validUntil=Date.parse(String(planner?.valid_until_utc ?? ""));
    if(!Number.isFinite(validUntil) || validUntil<=now.getTime()) return true;
    const protectedAction=a?.priority==="must" || a?.status==="in_progress" || a?.surface_must_remain_open===true || a?.surface_continuous_required===true;
    if(protectedAction) return true;
    return !["defer","omit_today"].includes(String(planner?.decision ?? ""));
  };

  const todayActions=(actions||[]).filter((a:any)=>{
    if(!plannerAllowsToday(a)) return false;
    const refs=[a.planned_start,a.available_from,a.due_at].filter(Boolean).map((x:string)=>Date.parse(x));
    if(!refs.length) return true;
    return refs.some((ms:number)=>ms>=localDayStart.getTime() && ms<=localDayEnd.getTime());
  });

  const {data:activePlan,error:activePlanError}=await admin.from("daily_plans")
    .select("id,personal_state_snapshot_id,plan_date,timezone,engine_version,status,summary,created_at,updated_at")
    .eq("user_id",userId).eq("plan_date",planDate).eq("status","active")
    .order("updated_at",{ascending:false}).limit(1).maybeSingle();
  if(activePlanError) throw activePlanError;

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
    guidance,
    daily_plan:activePlan??null,
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

function validIdempotencyKey(input:any) {
  const key = typeof input?.idempotency_key === "string" ? input.idempotency_key.trim() : "";
  return key.length > 0 && key.length <= 200;
}
function validScale(value:any) {
  return value === undefined || value === null || (Number.isInteger(Number(value)) && Number(value) >= 1 && Number(value) <= 5);
}
async function recordCheckin(admin:any,userId:string,input:any) {
  if(!validIdempotencyKey(input)) {
    return { __status:400, error:"invalid_request", message:"idempotency_key is required (1-200 chars)" };
  }
  const checkinType = String(input?.checkin_type ?? "ad_hoc");
  if(!["morning","evening","ad_hoc"].includes(checkinType)) {
    return { __status:400, error:"invalid_checkin_type" };
  }
  for (const key of ["mood","energy","stress","soreness","sleep_quality"]) {
    if(!validScale(input?.[key])) {
      return { __status:400, error:"invalid_checkin_scale", field:key, message:"check-in scales must be integers 1-5" };
    }
  }
  const hasValue = ["mood","energy","stress","soreness","sleep_quality"].some(k => input?.[k] !== undefined && input?.[k] !== null)
    || (typeof input?.note === "string" && input.note.trim().length > 0);
  if(!hasValue) return { __status:400, error:"empty_checkin" };
  if(input?.dry_run === true) {
    return { dry_run:true, valid:true, normalized:{checkin_type:checkinType, observed_at:input?.observed_at ?? null} };
  }
  const {data,error} = await admin.rpc("server_gateway_record_checkin",{p_user_id:userId,p_input:input});
  if(error) throw new Error("record_checkin: "+error.message);
  return data;
}
async function logMeal(admin:any,userId:string,input:any) {
  if(!validIdempotencyKey(input)) {
    return { __status:400, error:"invalid_request", message:"idempotency_key is required (1-200 chars)" };
  }
  if(typeof input?.eaten_at !== "string" || !input.eaten_at.trim()) {
    return { __status:400, error:"eaten_at_required" };
  }
  if(input?.items !== undefined && !Array.isArray(input.items)) {
    return { __status:400, error:"items_must_be_array" };
  }
  if(Array.isArray(input?.items) && input.items.length > 50) {
    return { __status:400, error:"too_many_meal_items" };
  }
  for (const item of (input?.items ?? [])) {
    if(!item || typeof item !== "object" || typeof item.food_name !== "string" || !item.food_name.trim()) {
      return { __status:400, error:"each_item_requires_food_name" };
    }
  }
  if(input?.estimate !== undefined && (!input.estimate || typeof input.estimate !== "object" || Array.isArray(input.estimate) || !input.estimate.values || typeof input.estimate.values !== "object" || Array.isArray(input.estimate.values))) {
    return { __status:400, error:"estimate_requires_values_object" };
  }
  if(input?.dry_run === true) {
    return { dry_run:true, valid:true, normalized:{eaten_at:input.eaten_at, meal_type:input?.meal_type ?? null, item_count:(input?.items ?? []).length, has_estimate:!!input?.estimate} };
  }
  const {data,error} = await admin.rpc("server_gateway_log_meal",{p_user_id:userId,p_input:input});
  if(error) throw new Error("log_meal: "+error.message);
  return data;
}

function boundedLimit(input:any, fallback=20, max=50) {
  const n=Number(input?.limit ?? fallback);
  return Math.max(1,Math.min(max,Number.isFinite(n)?Math.floor(n):fallback));
}
async function getHealthContext(admin:any,userId:string,input:any) {
  const asOf=typeof input?.as_of==="string"?input.as_of:new Date().toISOString();
  const {data,error}=await admin.rpc("get_health_context",{p_user_id:userId,p_as_of:asOf});
  if(error) throw new Error("get_health_context: "+error.message);
  return data;
}
async function getCalendarContext(admin:any,userId:string,input:any) {
  const now=new Date();
  const from=typeof input?.from==="string"?input.from:new Date(now.getTime()-86400000).toISOString();
  const to=typeof input?.to==="string"?input.to:new Date(now.getTime()+30*86400000).toISOString();
  if(Date.parse(to)-Date.parse(from)>90*86400000) return {__status:400,error:"calendar_window_too_large"};
  const {data,error}=await admin.from("calendar_events")
    .select("id,external_event_id,calendar_name,title,starts_at,ends_at,timezone,location_text,event_type,status,busy,metadata")
    .eq("user_id",userId).gte("ends_at",from).lte("starts_at",to).order("starts_at").limit(250);
  if(error) throw error;
  return {from,to,events:data||[]};
}
async function getCheckinContext(admin:any,userId:string,input:any) {
  const limit=boundedLimit(input,20,50);
  const {data,error}=await admin.from("daily_checkins")
    .select("id,checkin_type,observed_at,mood,energy,stress,soreness,sleep_quality,note")
    .eq("user_id",userId).order("observed_at",{ascending:false}).limit(limit);
  if(error) throw error;
  return {checkins:data||[]};
}
async function getNutritionContext(admin:any,userId:string,input:any) {
  const limit=boundedLimit(input,15,40);
  const [mealsRes,hydrationRes]=await Promise.all([
    admin.from("meals").select("id,eaten_at,meal_type,title,capture_method,note,calories_kcal,protein_g,carbohydrate_g,fat_g,fibre_g,confidence,provenance")
      .eq("user_id",userId).order("eaten_at",{ascending:false}).limit(limit),
    admin.from("hydration_events").select("id,observed_at,beverage_type,amount_ml,calories_kcal,caffeine_mg,electrolytes,capture_method,confidence,action_id")
      .eq("user_id",userId).order("observed_at",{ascending:false}).limit(Math.min(limit*2,50))
  ]);
  if(mealsRes.error) throw mealsRes.error;
  if(hydrationRes.error) throw hydrationRes.error;
  const mealIds=(mealsRes.data||[]).map((x:any)=>x.id);
  let items:any[]=[];
  if(mealIds.length){
    const r=await admin.from("meal_items").select("id,meal_id,item_order,food_name,quantity,unit,grams,calories_kcal,protein_g,carbohydrate_g,fat_g,fibre_g,estimate_status,confidence")
      .eq("user_id",userId).in("meal_id",mealIds).order("meal_id").order("item_order");
    if(r.error) throw r.error; items=r.data||[];
  }
  return {meals:mealsRes.data||[],meal_items:items,hydration:hydrationRes.data||[]};
}
async function getTrainingContext(admin:any,userId:string,input:any) {
  const limit=boundedLimit(input,10,30);
  const [workoutsRes,recoveryRes]=await Promise.all([
    admin.from("workouts").select("id,started_at,ended_at,workout_type,title,duration_minutes,perceived_exertion,calories_burned_kcal,distance_m,note,metadata,provenance")
      .eq("user_id",userId).order("started_at",{ascending:false}).limit(limit),
    admin.from("recovery_sessions").select("id,recovery_type,started_at,ended_at,duration_minutes,before_state,after_state,capture_method,confidence,note,metadata,action_id,temperature_c")
      .eq("user_id",userId).order("started_at",{ascending:false}).limit(limit)
  ]);
  if(workoutsRes.error) throw workoutsRes.error;
  if(recoveryRes.error) throw recoveryRes.error;
  const ids=(workoutsRes.data||[]).map((x:any)=>x.id);
  let exercises:any[]=[], sets:any[]=[];
  if(ids.length){
    const e=await admin.from("workout_exercises").select("id,workout_id,exercise_order,exercise_name,canonical_exercise_ref,exercise_type,duration_seconds,distance_m,calories_burned_kcal,note,equipment_name,max_weight_kg,primary_muscles,secondary_muscles,identification_confidence")
      .eq("user_id",userId).in("workout_id",ids).order("workout_id").order("exercise_order");
    if(e.error) throw e.error; exercises=e.data||[];
    const eids=exercises.map((x:any)=>x.id);
    if(eids.length){
      const s=await admin.from("exercise_sets").select("id,workout_exercise_id,set_order,set_type,reps,weight_kg,duration_seconds,distance_m,rest_seconds,rpe,rir,completed,note")
        .eq("user_id",userId).in("workout_exercise_id",eids).order("workout_exercise_id").order("set_order");
      if(s.error) throw s.error; sets=s.data||[];
    }
  }
  return {workouts:workoutsRes.data||[],exercises,sets,recovery_sessions:recoveryRes.data||[]};
}
async function getSkillsContext(admin:any,userId:string,input:any) {
  const limit=boundedLimit(input,20,50);
  const {data,error}=await admin.rpc("server_gateway_get_skills_context",{p_user_id:userId,p_limit:limit});
  if(error) throw new Error("get_skills_context: "+error.message);
  return data ?? {skills:[],subskills:[],drills:[],recent_practice_sessions:[],recent_assessments:[],resources:[],recent_progress_evidence:[]};
}
async function recordLearningCheckpoint(admin:any,userId:string,input:any) {
  if(!validIdempotencyKey(input)) return {__status:400,error:"invalid_request",message:"idempotency_key is required (1-200 chars)"};
  const {data,error}=await admin.rpc("server_gateway_record_learning_checkpoint",{p_user_id:userId,p_input:input});
  if(error) throw new Error("record_learning_checkpoint: "+error.message);
  return data;
}
async function resolveLearningUnit(admin:any,userId:string,input:any) {
  const courseKey=String(input?.course_key ?? "art_of_seduction_complete").trim() || "art_of_seduction_complete";
  const query=String(input?.query ?? input?.requested_unit ?? "").trim();
  if(!query) return {__status:400,error:"query_required"};
  const {data,error}=await admin.rpc("server_gateway_resolve_learning_unit",{
    p_user_id:userId,p_course_key:courseKey,p_query:query,p_limit:boundedLimit(input,5,10)
  });
  if(error) throw new Error("resolve_learning_unit: "+error.message);
  return data ?? {query,matches:[]};
}
async function getLearningContext(admin:any,userId:string,input:any) {
  const courseKey=String(input?.course_key ?? "art_of_seduction_complete").trim() || "art_of_seduction_complete";
  let requestedUnit=typeof input?.requested_unit==="string" && input.requested_unit.trim() ? input.requested_unit.trim() : null;
  const limit=boundedLimit(input,20,50);
  if(requestedUnit && !/^AOS-/i.test(requestedUnit)){
    const resolved=await resolveLearningUnit(admin,userId,{course_key:courseKey,query:requestedUnit,limit:5});
    const matches=Array.isArray(resolved?.matches)?resolved.matches:[];
    if(matches.length===0) return {__status:404,error:"learning_unit_not_found",query:requestedUnit};
    if(matches.length>1 && Number(matches[0]?.score)===Number(matches[1]?.score)) return {__status:409,error:"learning_unit_ambiguous",query:requestedUnit,matches};
    requestedUnit=String(matches[0].unit_key);
  }
  const {data,error}=await admin.rpc("server_gateway_get_learning_context",{
    p_user_id:userId,
    p_course_key:courseKey,
    p_requested_unit:requestedUnit,
    p_limit:limit
  });
  if(error) throw new Error("get_learning_context: "+error.message);
  return data ?? {found:false,course_key:courseKey};
}
async function getSpanishContext(admin:any,userId:string,input:any) {
  const language=String(input?.language_code ?? "es").toLowerCase();
  const p=await admin.from("language_profiles").select("id,skill_id,language_code,display_name,overall_cefr,target_cefr,support_language_code,display_mode,preferred_variant,settings")
    .eq("user_id",userId).eq("language_code",language).eq("active",true).maybeSingle();
  if(p.error) throw p.error; if(!p.data) return null;
  const profile=p.data;
  const [skill,subskills,states,mistakes,attempts,sessions]=await Promise.all([
    admin.from("skills").select("id,name,current_level,desired_outcome,metadata").eq("user_id",userId).eq("id",profile.skill_id).maybeSingle(),
    admin.from("subskills").select("id,name,current_level,priority,progression_criteria").eq("user_id",userId).eq("skill_id",profile.skill_id).order("priority"),
    admin.from("language_item_state").select("item_id,learning_stage,mastery_score,times_tested,correct_count,incorrect_count,next_review_at,suspended").eq("user_id",userId).eq("language_profile_id",profile.id).eq("suspended",false).order("next_review_at",{ascending:true,nullsFirst:true}).limit(30),
    admin.from("language_mistakes").select("id,subskill_id,error_type,error_key,description,example_incorrect,example_correct,occurrence_count,status,severity,confidence,next_review_at,last_seen_at").eq("user_id",userId).eq("language_profile_id",profile.id).in("status",["active","improving","monitor"]).order("last_seen_at",{ascending:false}).limit(20),
    admin.from("language_attempts").select("id,subskill_id,item_id,attempt_type,response_text,corrected_response,is_correct,score,feedback,attempted_at").eq("user_id",userId).eq("language_profile_id",profile.id).order("attempted_at",{ascending:false}).limit(30),
    admin.from("practice_sessions").select("id,started_at,ended_at,duration_minutes,perceived_difficulty,performance,note").eq("user_id",userId).eq("skill_id",profile.skill_id).order("started_at",{ascending:false}).limit(10)
  ]);
  for(const r of [skill,subskills,states,mistakes,attempts,sessions]) if(r.error) throw r.error;
  const itemIds=(states.data||[]).map((x:any)=>x.item_id);
  let items:any[]=[];
  if(itemIds.length){
    const r=await admin.from("language_items").select("id,item_type,content,meaning,cefr_level,topic,tags").eq("user_id",userId).in("id",itemIds);
    if(r.error) throw r.error; items=r.data||[];
  }
  return {profile,skill:skill.data,subskills:subskills.data||[],item_states:states.data||[],items,active_mistakes:mistakes.data||[],recent_attempts:attempts.data||[],recent_sessions:sessions.data||[]};
}
async function getFinanceContext(admin:any,userId:string,input:any) {
  const limit=boundedLimit(input,30,100);
  const [accounts,transactions,debts,commitments,snapshot]=await Promise.all([
    admin.from("financial_accounts").select("id,provider,account_type,display_name,currency,current_balance,available_balance,balance_as_of,active,metadata").eq("user_id",userId).eq("active",true).order("display_name"),
    admin.from("financial_transactions").select("id,financial_account_id,booked_at,value_at,amount,currency,merchant,description,category,transaction_type,recurring_candidate").eq("user_id",userId).order("booked_at",{ascending:false}).limit(limit),
    admin.from("debts").select("id,lender,debt_type,display_name,currency,original_principal,current_balance,interest_rate,minimum_payment,next_payment_on,status,metadata").eq("user_id",userId).order("display_name"),
    admin.from("recurring_financial_commitments").select("id,title,category,amount,currency,cadence,next_due_on,essential,active,source_refs,metadata").eq("user_id",userId).eq("active",true).order("next_due_on",{ascending:true,nullsFirst:false}),
    admin.from("financial_snapshots").select("id,as_of,currency,total_assets,total_liabilities,cash_available,monthly_income,monthly_committed_expenses,monthly_variable_expenses,snapshot").eq("user_id",userId).order("as_of",{ascending:false}).limit(1)
  ]);
  for(const r of [accounts,transactions,debts,commitments,snapshot]) if(r.error) throw r.error;
  return {accounts:accounts.data||[],recent_transactions:transactions.data||[],debts:debts.data||[],recurring_commitments:commitments.data||[],latest_snapshot:(snapshot.data||[])[0]??null};
}
async function getReflectionContext(admin:any,userId:string,input:any) {
  const limit=boundedLimit(input,20,50);
  const [journal,relationships,spiritual]=await Promise.all([
    admin.from("journal_entries").select("id,entry_type,occurred_at,title,content,mood,tags,metadata").eq("user_id",userId).order("occurred_at",{ascending:false}).limit(limit),
    admin.from("relationship_reflections").select("id,interaction_id,reflection_type,occurred_at,what_worked,what_to_try,connection_learning,mutual_interest_notes,boundary_or_consent_notes,next_step,metadata").eq("user_id",userId).order("occurred_at",{ascending:false}).limit(limit),
    admin.from("spiritual_sessions").select("id,spiritual_practice_id,started_at,ended_at,duration_minutes,intention,experience,before_state,after_state,insight,metadata").eq("user_id",userId).order("started_at",{ascending:false}).limit(limit)
  ]);
  for(const r of [journal,relationships,spiritual]) if(r.error) throw r.error;
  return {journal_entries:journal.data||[],relationship_reflections:relationships.data||[],spiritual_sessions:spiritual.data||[]};
}
async function getSettingsContext(admin:any,userId:string,input:any) {
  const {data,error}=await admin.from("preferences").select("id,key,value,scope,updated_at")
    .eq("user_id",userId).order("scope").order("key").limit(200);
  if(error) throw error;
  return {preferences:data||[]};
}
async function getSocialContext(admin:any,userId:string,input:any) {
  const limit=boundedLimit(input,30,100);
  const [people,interactions,reflections]=await Promise.all([
    admin.from("people").select("id,display_name,relationship_context,status,notes,metadata,updated_at").eq("user_id",userId).order("updated_at",{ascending:false}).limit(limit),
    admin.from("interactions").select("id,person_id,interaction_type,occurred_at,context,summary,connection_quality,comfort_level,mutuality_level,follow_up_intention,observations").eq("user_id",userId).order("occurred_at",{ascending:false}).limit(limit),
    admin.from("relationship_reflections").select("id,interaction_id,reflection_type,occurred_at,what_worked,what_to_try,connection_learning,mutual_interest_notes,boundary_or_consent_notes,next_step,metadata").eq("user_id",userId).order("occurred_at",{ascending:false}).limit(limit)
  ]);
  for(const r of [people,interactions,reflections]) if(r.error) throw r.error;
  return {people:people.data||[],interactions:interactions.data||[],relationship_reflections:reflections.data||[]};
}

async function getDailyPlanContext(admin:any,userId:string,input:any) {
  const limit=boundedLimit(input,7,30);
  const plans=await admin.from("daily_plans").select("id,personal_state_snapshot_id,plan_date,timezone,engine_version,status,summary,created_at,updated_at").eq("user_id",userId).order("plan_date",{ascending:false}).limit(limit);
  if(plans.error) throw plans.error;
  const ids=(plans.data||[]).map((x:any)=>x.id);
  let actions:any[]=[];
  if(ids.length){
    const r=await admin.from("actions").select("id,daily_plan_id,domain,title,priority,version,status,estimated_minutes,planned_start,planned_end,due_at,reason").eq("user_id",userId).in("daily_plan_id",ids).order("planned_start",{ascending:true,nullsFirst:false});
    if(r.error) throw r.error; actions=r.data||[];
  }
  return {plans:plans.data||[],actions};
}
async function getFeedbackContext(admin:any,userId:string,input:any) {
  const limit=boundedLimit(input,30,100);
  const [feedback,outcomes]=await Promise.all([
    admin.from("recommendation_feedback").select("id,recommendation_id,decision,helpfulness,reason_code,note,recorded_at").eq("user_id",userId).order("recorded_at",{ascending:false}).limit(limit),
    admin.from("outcomes").select("id,action_id,recommendation_id,outcome_type,observed_at,subjective_value,objective_refs,summary").eq("user_id",userId).order("observed_at",{ascending:false}).limit(limit)
  ]);
  if(feedback.error) throw feedback.error; if(outcomes.error) throw outcomes.error;
  return {recommendation_feedback:feedback.data||[],outcomes:outcomes.data||[]};
}
function mutationRequiredFields(operation:string) {
  const m:any={
    log_hydration:["amount_ml"],
    record_medication_supplement_adherence:["item_id"],
    log_workout:["started_at"],
    log_recovery_session:["recovery_type","started_at"],
    log_practice_session:["skill_id","started_at"],
    upsert_goal:[],
    upsert_routine:[],
    upsert_action:[],
    record_spanish_learning:[],
    upsert_financial_account:[],
    upsert_debt:[],
    upsert_recurring_commitment:[],
    record_financial_snapshot:[],
    record_financial_transaction:["financial_account_id","booked_at","amount"],
    log_journal_entry:["content"],
    log_relationship_reflection:[],
    log_spiritual_session:["started_at"],
    record_recommendation_feedback:["recommendation_id"],
    record_outcome:["outcome_type"],
    persist_daily_plan:["plan_date"],
    upsert_preference:["key"],
    upsert_person:[],
    log_interaction:["interaction_type"],
    upsert_skill:[],
    upsert_subskill:[],
    upsert_skill_drill:[],
    record_skill_assessment:["skill_id","assessor_type","scale"],
    upsert_skill_resource:["skill_id","resource_type","title"],
    record_skill_progress_evidence:["skill_id","evidence_type"],
    upsert_learning_unit:["skill_id","unit_key","name"],
    upsert_learning_lesson:["skill_id","unit_key","lesson_key","title","instructions"],
    upsert_learning_question:["skill_id","unit_key","question_key","dimension","prompt","rubric"],
    upsert_learning_state:["skill_id","course_key","course_version"],
    record_learning_exposure:["skill_id","unit_key"],
    record_learning_attempt:["skill_id","attempt_type"],
    upsert_spiritual_practice:[],
    record_health_observation:["observation_type"]
  };
  return m[operation]??[];
}
async function mutateOperation(admin:any,userId:string,operation:string,input:any) {
  if(!validIdempotencyKey(input)) return {__status:400,error:"invalid_request",message:"idempotency_key is required (1-200 chars)"};
  for(const field of mutationRequiredFields(operation)) {
    if(input?.[field]===undefined || input?.[field]===null || String(input[field]).trim()==="") return {__status:400,error:"missing_required_field",field};
  }
  if(input?.dry_run===true) return {dry_run:true,valid:true,operation};
  if(operation==="record_health_observation"){
    const {data,error}=await admin.rpc("server_gateway_record_health_observation",{p_user_id:userId,p_input:input});
    if(error) throw new Error(operation+": "+error.message); return data;
  }
  if(operation==="log_workout"){
    const {data,error}=await admin.rpc("server_gateway_log_workout",{p_user_id:userId,p_input:input});
    if(error) throw new Error(operation+": "+error.message); return data;
  }
  if(["upsert_skill_resource","record_skill_progress_evidence","upsert_learning_unit","upsert_learning_lesson","upsert_learning_question","upsert_learning_state","record_learning_exposure","record_learning_attempt"].includes(operation)){
    const {data,error}=await admin.rpc("server_gateway_mutate_learning",{p_user_id:userId,p_operation:operation,p_input:input});
    if(error) throw new Error(operation+": "+error.message); return data;
  }
  if(["upsert_preference","upsert_person","log_interaction","upsert_skill","upsert_subskill","upsert_skill_drill","record_skill_assessment","upsert_spiritual_practice"].includes(operation)){
    const {data,error}=await admin.rpc("server_gateway_mutate_aux",{p_user_id:userId,p_operation:operation,p_input:input});
    if(error) throw new Error(operation+": "+error.message); return data;
  }
  const {data,error}=await admin.rpc("server_gateway_mutate",{p_user_id:userId,p_operation:operation,p_input:input});
  if(error) throw new Error(operation+": "+error.message);
  return data;
}


function normalizeTextList(value:any) {
  if(!Array.isArray(value)) return [];
  return [...new Set(value.map((x:any)=>String(x ?? "").trim()).filter((x:string)=>x.length>0))].slice(0,50);
}

async function resolveSpecs(admin:any,input:any) {
  const topics=normalizeTextList(input?.topics ?? input?.domains ?? []);
  const {data,error}=await admin.rpc("server_gateway_resolve_specs",{p_topics:topics});
  if(error) throw new Error("resolve_specs: "+error.message);
  return {topics,specs:Array.isArray(data)?data:(data??[])};
}

async function getLatestCheckpoint(admin:any,userId:string,input:any) {
  const requestedDomains=normalizeTextList(input?.domains);
  const statuses=normalizeTextList(input?.statuses);
  const limit=Math.max(1,Math.min(50,Number(input?.scan_limit ?? 20)));
  let q=admin.from("interaction_sessions")
    .select("id,interface,external_session_ref,session_type,started_at,ended_at,status,domains,summary,decisions,new_facts,corrections,open_loops,next_actions,entity_refs,document_refs,source_refs,personal_state_snapshot_id,supersedes_id,checkpoint_version,model_provider,model_name,model_version,prompt_contract_version,metadata,created_at,updated_at")
    .eq("user_id",userId);
  if(statuses.length) q=q.in("status",statuses);
  if(requestedDomains.length) q=q.overlaps("domains",requestedDomains);
  q=q.order("updated_at",{ascending:false}).limit(limit);
  const {data,error}=await q;
  if(error) throw error;
  const rows=data||[];
  return {requested_domains:requestedDomains,checkpoint:rows[0]??null};
}


async function resolveIntent(admin:any,input:any) {
  const intent=typeof input?.intent==="string" ? input.intent.trim() : "";
  const topics=normalizeTextList(input?.topics ?? input?.domains ?? []);
  const limit=Math.max(1,Math.min(10,Number(input?.limit ?? 5)));
  const {data,error}=await admin.rpc("server_gateway_resolve_intent",{
    p_intent:intent || null,
    p_topics:topics,
    p_limit:limit
  });
  if(error) throw new Error("resolve_intent: "+error.message);
  return data ?? {intent,topics,selected:null,matches:[],fallback_required:true};
}

async function bootstrapContext(admin:any,userId:string,input:any) {
  const intent=typeof input?.intent==="string" ? input.intent.trim() : "";
  const topics=normalizeTextList(input?.topics ?? input?.domains ?? []);
  const checkpointDomains=normalizeTextList(input?.checkpoint_domains ?? []);
  const asOf=typeof input?.as_of==="string" ? input.as_of : new Date().toISOString();
  const requestedStateMode=typeof input?.state_mode==="string" ? input.state_mode.trim().toLowerCase() : "auto";
  const stateMode=["auto","none","summary","full"].includes(requestedStateMode) ? requestedStateMode : "auto";
  const dbStarted=performance.now();
  const {data,error}=await admin.rpc("server_gateway_bootstrap_context_v2",{
    p_user_id:userId,
    p_intent:intent || null,
    p_topics:topics,
    p_checkpoint_domains:checkpointDomains,
    p_as_of:asOf,
    p_state_mode:stateMode
  });
  if(error) throw new Error("bootstrap_context_v2: "+error.message);
  const dbElapsedMs=Math.round((performance.now()-dbStarted)*100)/100;
  const result=data ?? {
    contract_version:"bootstrap-context-v3",
    as_of:asOf,
    intent,
    topics,
    routing:{selected_route:null,candidates:[],fast_path:false,fallback_required:true,db_roundtrips:1},
    specs:[],
    checkpoint:null,
    state:null
  };
  const responseBytes=new TextEncoder().encode(JSON.stringify(result)).byteLength;
  return {
    ...result,
    telemetry:{
      ...(result?.telemetry ?? {}),
      gateway_db_elapsed_ms:dbElapsedMs,
      db_roundtrips:1,
      state_scope:result?.state_scope ?? stateMode,
      response_bytes:responseBytes,
      fast_path:Boolean(result?.routing?.fast_path),
      fallback_required:Boolean(result?.routing?.fallback_required),
      recommended_max_followup_calls:result?.routing?.recommended_max_followup_calls ?? null
    }
  };
}


async function getCrossDomainEvidenceContext(admin:any,userId:string,input:any) {
  const asOf=typeof input?.as_of==="string"?input.as_of:new Date().toISOString();
  const {data,error}=await admin.rpc("get_cross_domain_evidence_context",{p_user_id:userId,p_as_of:asOf});
  if(error) throw new Error("get_cross_domain_evidence_context: "+error.message);
  return data;
}

async function getAiRoutingConfig(admin:any) {
  const {data,error}=await admin.rpc("server_gateway_get_ai_routing_config");
  if(error) throw new Error("server_gateway_get_ai_routing_config: "+error.message);
  return data ?? {routing_policy_version:"meplus-ai-routing-v1",routes:[],models:[]};
}

async function getEngineeringIssue(admin:any,input:any) {
  const issueKey=String(input?.issue_key ?? "").trim();
  if(!issueKey) return {__status:400,error:"issue_key_required"};
  const {data,error}=await admin.rpc("server_gateway_get_engineering_issue",{p_issue_key:issueKey});
  if(error) throw new Error("server_gateway_get_engineering_issue: "+error.message);
  return {issue:data??null};
}

async function getSchedulerPolicy(admin:any,userId:string,input:any) {
  const policyKey=String(input?.policy_key ?? "").trim();
  if(!policyKey) return {__status:400,error:"policy_key_required"};
  const {data,error}=await admin.rpc("server_gateway_get_scheduler_policy",{
    p_user_id:userId,
    p_policy_key:policyKey
  });
  if(error) throw new Error("server_gateway_get_scheduler_policy: "+error.message);
  return {policy:data??null};
}

async function versionSchedulerPolicy(admin:any,userId:string,input:any) {
  const policyKey=String(input?.policy_key ?? "").trim();
  const expected=String(input?.expected_current_version ?? "").trim();
  const newVersion=String(input?.new_version ?? "").trim();
  const newPolicy=input?.policy;
  if(!policyKey || !newVersion || !newPolicy || typeof newPolicy!=="object") {
    return {__status:400,error:"policy_key_new_version_and_policy_required"};
  }
  const {data,error}=await admin.rpc("server_gateway_version_scheduler_policy",{
    p_user_id:userId,
    p_policy_key:policyKey,
    p_expected_current_version:expected || null,
    p_new_version:newVersion,
    p_new_policy:newPolicy
  });
  if(error) throw new Error("server_gateway_version_scheduler_policy: "+error.message);
  return {policy:data};
}

async function listEngineeringIssues(admin:any,input:any) {
  const statuses=normalizeTextList(input?.lifecycle_statuses);
  const limit=Math.max(1,Math.min(500,Number(input?.limit ?? 200)));
  const {data,error}=await admin.rpc("server_gateway_list_engineering_issues",{
    p_lifecycle_status:statuses.length?statuses:null,
    p_limit:limit
  });
  if(error) throw new Error("server_gateway_list_engineering_issues: "+error.message);
  return {issues:Array.isArray(data)?data:(data??[])};
}

async function upsertEngineeringIssue(admin:any,input:any) {
  const payload=input?.issue && typeof input.issue==="object" ? input.issue : input;
  const {data,error}=await admin.rpc("server_gateway_upsert_engineering_issue",{p_input:payload});
  if(error) throw new Error("server_gateway_upsert_engineering_issue: "+error.message);
  return data;
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
    const requestStarted=performance.now();
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
          operations:["capabilities","bootstrap_context","resolve_intent","resolve_specs","get_latest_checkpoint","get_ai_routing_config","get_cross_domain_evidence_context","get_engineering_issue","list_engineering_issues","upsert_engineering_issue","get_scheduler_policy","version_scheduler_policy","get_current_state","get_context","today","get_current_guidance","get_health_context","get_calendar_context","get_checkin_context","get_nutrition_context","get_training_context","get_skills_context","resolve_learning_unit","get_learning_context","get_spanish_context","get_finance_context","get_reflection_context","get_settings_context","get_social_context","get_daily_plan_context","get_feedback_context","complete_action","record_checkin","log_meal","record_health_observation","log_hydration","record_medication_supplement_adherence","log_workout","log_recovery_session","log_practice_session","upsert_goal","upsert_routine","upsert_action","record_spanish_learning","upsert_financial_account","upsert_debt","upsert_recurring_commitment","record_financial_snapshot","record_financial_transaction","log_journal_entry","log_relationship_reflection","log_spiritual_session","upsert_spiritual_practice","upsert_preference","upsert_person","log_interaction","upsert_skill","upsert_subskill","upsert_skill_drill","record_skill_assessment","upsert_skill_resource","record_skill_progress_evidence","upsert_learning_unit","upsert_learning_lesson","upsert_learning_question","upsert_learning_state","record_learning_exposure","record_learning_attempt","record_learning_checkpoint","record_recommendation_feedback","record_outcome","persist_daily_plan","weekly_review"],
          read_operations:["bootstrap_context","resolve_intent","resolve_specs","get_latest_checkpoint","get_ai_routing_config","get_cross_domain_evidence_context","get_engineering_issue","list_engineering_issues","get_scheduler_policy","get_current_state","get_context","today","get_current_guidance","get_health_context","get_calendar_context","get_checkin_context","get_nutrition_context","get_training_context","get_skills_context","resolve_learning_unit","get_learning_context","get_spanish_context","get_finance_context","get_reflection_context","get_settings_context","get_social_context","get_daily_plan_context","get_feedback_context"],
          write_operations:["upsert_engineering_issue","version_scheduler_policy","complete_action","record_checkin","log_meal","record_health_observation","log_hydration","record_medication_supplement_adherence","log_workout","log_recovery_session","log_practice_session","upsert_goal","upsert_routine","upsert_action","record_spanish_learning","upsert_financial_account","upsert_debt","upsert_recurring_commitment","record_financial_snapshot","record_financial_transaction","log_journal_entry","log_relationship_reflection","log_spiritual_session","upsert_spiritual_practice","upsert_preference","upsert_person","log_interaction","upsert_skill","upsert_subskill","upsert_skill_drill","record_skill_assessment","upsert_skill_resource","record_skill_progress_evidence","upsert_learning_unit","upsert_learning_lesson","upsert_learning_question","upsert_learning_state","record_learning_exposure","record_learning_attempt","record_learning_checkpoint","record_recommendation_feedback","record_outcome","persist_daily_plan","weekly_review"],
          context_topics:[...ALLOWED_CONTEXT_TOPICS],
          max_context_limit:50,
          complete_action_supports_dry_run:true
        };
      } else if(operation==="bootstrap_context"){
        result=await bootstrapContext(admin,String(userId),input);
      } else if(operation==="resolve_intent"){
        result=await resolveIntent(admin,input);
      } else if(operation==="resolve_specs"){
        result=await resolveSpecs(admin,input);
      } else if(operation==="get_latest_checkpoint"){
        result=await getLatestCheckpoint(admin,String(userId),input);
      } else if(operation==="get_engineering_issue"){
        result=await getEngineeringIssue(admin,input);
      } else if(operation==="list_engineering_issues"){
        result=await listEngineeringIssues(admin,input);
      } else if(operation==="upsert_engineering_issue"){
        result=await upsertEngineeringIssue(admin,input);
      } else if(operation==="get_scheduler_policy"){
        result=await getSchedulerPolicy(admin,String(userId),input);
      } else if(operation==="version_scheduler_policy"){
        result=await versionSchedulerPolicy(admin,String(userId),input);
      } else if(operation==="get_ai_routing_config"){
        result=await getAiRoutingConfig(admin);
      } else if(operation==="get_cross_domain_evidence_context"){
        result=await getCrossDomainEvidenceContext(admin,String(userId),input);
      } else if(operation==="get_current_state"){
        result=await getCurrentState(admin,String(userId),input);
      } else if(operation==="get_context"){
        result=await getContext(admin,String(userId),input);
      } else if(operation==="today"){
        result=await today(admin,String(userId));
      } else if(operation==="get_current_guidance"){
        const asOf = typeof input?.as_of === "string" ? input.as_of : new Date().toISOString();
        const {data,error}=await admin.rpc("server_gateway_get_current_guidance",{p_user_id:String(userId),p_as_of:asOf});
        if(error) throw new Error("get_current_guidance: "+error.message);
        result=data;
      } else if(operation==="get_health_context"){
        result=await getHealthContext(admin,String(userId),input);
      } else if(operation==="get_calendar_context"){
        result=await getCalendarContext(admin,String(userId),input);
      } else if(operation==="get_checkin_context"){
        result=await getCheckinContext(admin,String(userId),input);
      } else if(operation==="get_nutrition_context"){
        result=await getNutritionContext(admin,String(userId),input);
      } else if(operation==="get_training_context"){
        result=await getTrainingContext(admin,String(userId),input);
      } else if(operation==="get_skills_context"){
        result=await getSkillsContext(admin,String(userId),input);
      } else if(operation==="resolve_learning_unit"){
        result=await resolveLearningUnit(admin,String(userId),input);
      } else if(operation==="get_learning_context"){
        result=await getLearningContext(admin,String(userId),input);
      } else if(operation==="get_spanish_context"){
        result=await getSpanishContext(admin,String(userId),input);
      } else if(operation==="get_finance_context"){
        result=await getFinanceContext(admin,String(userId),input);
      } else if(operation==="get_reflection_context"){
        result=await getReflectionContext(admin,String(userId),input);
      } else if(operation==="get_settings_context"){
        result=await getSettingsContext(admin,String(userId),input);
      } else if(operation==="get_social_context"){
        result=await getSocialContext(admin,String(userId),input);
      } else if(operation==="get_daily_plan_context"){
        result=await getDailyPlanContext(admin,String(userId),input);
      } else if(operation==="get_feedback_context"){
        result=await getFeedbackContext(admin,String(userId),input);
      } else if(operation==="complete_action"){
        result=await completeAction(admin,String(userId),input);
      } else if(operation==="record_checkin"){
        result=await recordCheckin(admin,String(userId),input);
      } else if(operation==="log_meal"){
        result=await logMeal(admin,String(userId),input);
      } else if(operation==="record_health_observation"){
        result=await mutateOperation(admin,String(userId),operation,input);
      } else if(operation==="log_hydration"){
        result=await mutateOperation(admin,String(userId),operation,input);
      } else if(operation==="record_medication_supplement_adherence"){
        const {data,error}=await admin.rpc("server_gateway_record_medication_supplement_adherence",{p_user_id:String(userId),p_input:input});
        if(error) throw new Error("record_medication_supplement_adherence: "+error.message);
        result=data;
      } else if(operation==="log_workout"){
        result=await mutateOperation(admin,String(userId),operation,input);
      } else if(operation==="log_recovery_session"){
        result=await mutateOperation(admin,String(userId),operation,input);
      } else if(operation==="log_practice_session"){
        result=await mutateOperation(admin,String(userId),operation,input);
      } else if(operation==="upsert_goal"){
        result=await mutateOperation(admin,String(userId),operation,input);
      } else if(operation==="upsert_routine"){
        result=await mutateOperation(admin,String(userId),operation,input);
      } else if(operation==="upsert_action"){
        result=await mutateOperation(admin,String(userId),operation,input);
      } else if(operation==="record_spanish_learning"){
        result=await mutateOperation(admin,String(userId),operation,input);
      } else if(operation==="upsert_financial_account"){
        result=await mutateOperation(admin,String(userId),operation,input);
      } else if(operation==="upsert_debt"){
        result=await mutateOperation(admin,String(userId),operation,input);
      } else if(operation==="upsert_recurring_commitment"){
        result=await mutateOperation(admin,String(userId),operation,input);
      } else if(operation==="record_financial_snapshot"){
        result=await mutateOperation(admin,String(userId),operation,input);
      } else if(operation==="record_financial_transaction"){
        result=await mutateOperation(admin,String(userId),operation,input);
      } else if(operation==="log_journal_entry"){
        result=await mutateOperation(admin,String(userId),operation,input);
      } else if(operation==="log_relationship_reflection"){
        result=await mutateOperation(admin,String(userId),operation,input);
      } else if(operation==="log_spiritual_session"){
        result=await mutateOperation(admin,String(userId),operation,input);
      } else if(operation==="record_recommendation_feedback"){
        result=await mutateOperation(admin,String(userId),operation,input);
      } else if(operation==="record_outcome"){
        result=await mutateOperation(admin,String(userId),operation,input);
      } else if(operation==="persist_daily_plan"){
        result=await mutateOperation(admin,String(userId),operation,input);
      } else if(operation==="upsert_preference"){
        result=await mutateOperation(admin,String(userId),operation,input);
      } else if(operation==="upsert_person"){
        result=await mutateOperation(admin,String(userId),operation,input);
      } else if(operation==="log_interaction"){
        result=await mutateOperation(admin,String(userId),operation,input);
      } else if(operation==="upsert_skill"){
        result=await mutateOperation(admin,String(userId),operation,input);
      } else if(operation==="upsert_subskill"){
        result=await mutateOperation(admin,String(userId),operation,input);
      } else if(operation==="upsert_skill_drill"){
        result=await mutateOperation(admin,String(userId),operation,input);
      } else if(operation==="record_skill_assessment"){
        result=await mutateOperation(admin,String(userId),operation,input);
      } else if(operation==="upsert_skill_resource"){
        result=await mutateOperation(admin,String(userId),operation,input);
      } else if(operation==="record_skill_progress_evidence"){
        result=await mutateOperation(admin,String(userId),operation,input);
      } else if(["upsert_learning_unit","upsert_learning_lesson","upsert_learning_question","upsert_learning_state","record_learning_exposure","record_learning_attempt"].includes(operation)){
        result=await mutateOperation(admin,String(userId),operation,input);
      } else if(operation==="record_learning_checkpoint"){
        result=await recordLearningCheckpoint(admin,String(userId),input);
      } else if(operation==="upsert_spiritual_practice"){
        result=await mutateOperation(admin,String(userId),operation,input);
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

      const durationMs=Math.round((performance.now()-requestStarted)*100)/100;
      const selectedRoute=operation==="bootstrap_context" ? (result?.routing?.selected_route?.route_key ?? null) : null;
      await safeAudit(admin,String(userId),operation,requestId,"completed",{
        duration_ms:durationMs,
        route_key:selectedRoute,
        fallback_used:operation==="bootstrap_context" ? Boolean(result?.routing?.fallback_required) : null,
        db_roundtrips:operation==="bootstrap_context" ? 1 : null,
        gateway_db_elapsed_ms:operation==="bootstrap_context" ? (result?.telemetry?.gateway_db_elapsed_ms ?? null) : null,
        response_bytes:operation==="bootstrap_context" ? (result?.telemetry?.response_bytes ?? null) : null,
        state_scope:operation==="bootstrap_context" ? (result?.state_scope ?? null) : null,
        context_operation:operation==="bootstrap_context" ? (result?.routing?.context_operation ?? null) : null,
        recommended_max_followup_calls:operation==="bootstrap_context" ? (result?.routing?.recommended_max_followup_calls ?? null) : null
      });
      return json({ok:true,operation,gateway_version:GATEWAY_VERSION,request_id:requestId,duration_ms:durationMs,result});
    } catch (error:any) {
      console.error(JSON.stringify({event:"meplus_gateway_error",request_id:requestId,operation,error_type:error?.name ?? "Error",message:String(error?.message ?? error).slice(0,800)}));
      await safeAudit(admin,String(userId),operation,requestId,"failed",{
        error_type:error?.name ?? "Error",
        duration_ms:Math.round((performance.now()-requestStarted)*100)/100
      });
      return json({error:"gateway_operation_failed",operation,request_id:requestId},500);
    }
  })
};
