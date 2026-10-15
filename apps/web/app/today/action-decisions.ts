"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "../../lib/supabase/server";
export type ActionDecisionState = {ok:boolean;message:string};
export async function recordActionDecision(_previous:ActionDecisionState, form:FormData):Promise<ActionDecisionState> {
 const id=String(form.get("action_id")??"");
 const decision=String(form.get("decision")??"");
 if(!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/.test(id)||!["completed","partial","skipped"].includes(decision))
  return {ok:false,message:"Invalid action decision."};
 const db=await createClient();
 const {data:{user},error:authError}=await db.auth.getUser();
 if(authError||!user) return {ok:false,message:"Please sign in."};
 const {data:action,error:readError}=await db.from("actions").select("id,status").eq("id",id).eq("user_id",user.id).maybeSingle();
 if(readError||!action||!["available","planned","in_progress","partial"].includes(action.status))
  return {ok:false,message:"Action is unavailable or already closed."};
 // Never update actions directly: the event must pass through the canonical action engine.
 // Until the authorized atomic RPC is confirmed, fail closed rather than creating inconsistent history.
 return {ok:false,message:"Completion recording is awaiting the verified Me+ action gateway. No change was made."};
}
