import { createClient } from "npm:@supabase/supabase-js@2";

const H={"content-type":"application/json"}, TZ="Europe/Berlin", SCHED="google_calendar_sync";
const respond=(x:unknown,s=200)=>new Response(JSON.stringify(x),{status:s,headers:H});
const eventTime=(x:any)=>x?.dateTime||x?.date||null;

async function accessToken(){
  const id=Deno.env.get("GOOGLE_CALENDAR_CLIENT_ID");
  const sec=Deno.env.get("GOOGLE_CALENDAR_CLIENT_SECRET");
  const ref=Deno.env.get("GOOGLE_CALENDAR_REFRESH_TOKEN");
  if(!id||!sec||!ref) throw new Error("calendar_auth_unconfigured");
  const r=await fetch("https://oauth2.googleapis.com/token",{
    method:"POST",
    headers:{"content-type":"application/x-www-form-urlencoded"},
    body:new URLSearchParams({client_id:id,client_secret:sec,refresh_token:ref,grant_type:"refresh_token"})
  });
  if(!r.ok){
    let googleError="unknown", googleDescription="";
    try{
      const err=await r.json();
      googleError=String(err?.error||"unknown").replace(/[^a-zA-Z0-9_.-]/g,"_").slice(0,80);
      googleDescription=String(err?.error_description||"").replace(/[\r\n]+/g," ").slice(0,240);
    }catch{}
    throw new Error("calendar_token_refresh_"+r.status+":"+googleError+(googleDescription?":"+googleDescription:""));
  }
  const p=await r.json();
  if(!p.access_token) throw new Error("calendar_access_token_missing");
  return p.access_token as string;
}

async function googleJson(token:string,url:string){
  const r=await fetch(url,{headers:{authorization:"Bearer "+token}});
  if(!r.ok){
    let detail="";
    try{detail=String((await r.json())?.error?.message||"").replace(/[\r\n]+/g," ").slice(0,250)}catch{}
    throw new Error("google_calendar_"+r.status+(detail?":"+detail:""));
  }
  return await r.json();
}

async function listEvents(token:string,calendar:any,timeMin:string,timeMax:string){
  const out:any[]=[]; let page="";
  do{
    const q=new URLSearchParams({
      singleEvents:"true",
      orderBy:"startTime",
      showDeleted:"false",
      timeMin,
      timeMax,
      maxResults:"2500"
    });
    if(page) q.set("pageToken",page);
    const url="https://www.googleapis.com/calendar/v3/calendars/"+encodeURIComponent(calendar.id)+"/events?"+q;
    const data=await googleJson(token,url);
    for(const e of data.items||[]){
      const start=eventTime(e.start), end=eventTime(e.end);
      if(!e.id||!start||!end) continue;
      const self=(e.attendees||[]).find((a:any)=>a?.self===true);
      out.push({
        id:String(e.id),
        calendar_id:String(calendar.id),
        calendar_name:String(calendar.name||calendar.id),
        title:String(e.summary||"Untitled calendar event"),
        start,end,
        location:e.location?String(e.location):null,
        event_type:e.eventType?String(e.eventType):"default",
        status:e.status?String(e.status):"confirmed",
        transparency:e.transparency?String(e.transparency):"opaque",
        busy:String(e.transparency||"opaque")!=="transparent",
        recurring_event_id:e.recurringEventId?String(e.recurringEventId):null,
        original_start_time:eventTime(e.originalStartTime),
        my_response_status:self?.responseStatus?String(self.responseStatus):null
      });
    }
    page=data.nextPageToken||"";
  }while(page);
  return out;
}

function runKey(now:Date){
  const ms=15*60*1000;
  return "calendar:supabase:"+new Date(Math.floor(now.getTime()/ms)*ms).toISOString();
}

Deno.serve(async(req)=>{
  const url=Deno.env.get("SUPABASE_URL"), sr=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(!url||!sr) return respond({error:"supabase_runtime_unconfigured"},500);
  const db=createClient(url,sr,{auth:{persistSession:false,autoRefreshToken:false}});

  const wake=req.headers.get("x-meplus-calendar-wake-secret")||"";
  const {data:valid,error:authError}=await db.rpc("server_validate_calendar_wake",{p_secret:wake});
  if(authError||valid!==true) return respond({error:"unauthorized"},401);

  const {data:sources,error:sourceError}=await db.from("data_sources")
    .select("id,user_id,external_account_ref,metadata")
    .eq("provider","google-calendar-supabase")
    .eq("status","active");
  if(sourceError||!sources?.length) return respond({error:"calendar_source_not_configured",detail:sourceError?.message||null},500);

  const results:any[]=[];

  for(const source of sources){
    await db.rpc("record_scheduler_heartbeat",{
      p_user_id:source.user_id,p_scheduler_key:SCHED,p_status:"invoked",
      p_expected_cadence_minutes:15,p_allowed_lateness_minutes:10,
      p_automation_id:"supabase:google_calendar_sync"
    });

    try{
      const configured=(source.metadata as any)?.calendars;
      const calendarConfigs=Array.isArray(configured)&&configured.length
        ? configured
        : [{id:source.external_account_ref||"primary",name:"primary"}];

      const token=await accessToken();
      const now=new Date();
      const start=new Date(now.getTime()-14*86400000).toISOString();
      const end=new Date(now.getTime()+180*86400000).toISOString();

      const all:any[]=[];
      const counts:any[]=[];
      for(const cal of calendarConfigs){
        if(!cal?.id) continue;
        const es=await listEvents(token,cal,start,end);
        all.push(...es);
        counts.push({id:String(cal.id),name:String(cal.name||cal.id),events:es.length});
      }
      if(!calendarConfigs.length) throw new Error("calendar_ids_not_configured");

      const primary=calendarConfigs.find((c:any)=>c.primary===true)||calendarConfigs[0];
      const accountRef=String(primary?.id||source.external_account_ref||"primary");

      const {data:ing,error:ingError}=await db.rpc("server_ingest_google_calendar_snapshot",{
        p_user_id:source.user_id,
        p_account_ref:accountRef,
        p_timezone:TZ,
        p_window_start:start,
        p_window_end:end,
        p_events:all,
        p_run_key:runKey(now),
        p_complete:true,
        p_synced_at:now.toISOString()
      });
      if(ingError) throw new Error("calendar_ingest_failed:"+ingError.message);
      if(ing?.status!=="completed") throw new Error("calendar_ingest_"+String(ing?.status||"unknown")+":"+String(ing?.error||""));

      await db.from("data_sources").update({
        metadata:{
          ...((source.metadata as any)||{}),
          connector:"supabase_google_calendar",
          syncMode:"recurring_bounded_snapshot",
          authConfigured:true,
          authScope:"calendar.events",
          lastAuthError:null,
          lastAuthCheckedAt:now.toISOString(),
          expectedCadenceMinutes:15,
          lastCalendarApiCheckAt:now.toISOString(),
          lastCalendarCounts:counts,
          lastEventCount:all.length,
          lastWindowStart:start,
          lastWindowEnd:end
        }
      }).eq("id",source.id);

      await db.rpc("record_scheduler_heartbeat",{
        p_user_id:source.user_id,p_scheduler_key:SCHED,p_status:"completed",
        p_expected_cadence_minutes:15,p_allowed_lateness_minutes:10,
        p_automation_id:"supabase:google_calendar_sync"
      });

      results.push({status:"completed",eventCount:all.length,calendarCounts:counts,syncRunId:ing?.sync_run_id||null});
    }catch(e){
      const message=String(e).slice(0,700);
      if(
        message.includes("calendar_token_refresh_")
        || message.includes("calendar_auth_unconfigured")
        || message.includes("calendar_access_token_missing")
      ){
        await db.from("data_sources").update({
          metadata:{
            ...((source.metadata as any)||{}),
            authConfigured:false,
            lastAuthError:message,
            lastAuthCheckedAt:new Date().toISOString()
          }
        }).eq("id",source.id);
      }
      await db.rpc("record_scheduler_heartbeat",{
        p_user_id:source.user_id,p_scheduler_key:SCHED,p_status:"failed",
        p_error:{error_code:"calendar_sync_failed",message},
        p_expected_cadence_minutes:15,p_allowed_lateness_minutes:10,
        p_automation_id:"supabase:google_calendar_sync"
      });
      results.push({status:"failed",error:message});
    }
  }

  const failed=results.some(x=>x.status==="failed");
  return respond({status:failed?"partial_failure":"ok",results},failed?502:200);
});