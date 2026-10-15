"use client";
import { useActionState } from "react";
import { recordActionDecision, type ActionDecisionState } from "./action-decisions";
const initial: ActionDecisionState = { ok:false, message:"" };
export function ActionControls({id}:{id:string}) {
 const [state,submit,pending]=useActionState(recordActionDecision,initial);
 return <form action={submit} style={{marginTop:12}}>
  <input type="hidden" name="action_id" value={id}/>
  <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
   <button disabled={pending} type="submit" name="decision" value="completed">Complete</button>
   <button disabled={pending} type="submit" name="decision" value="partial">Partial</button>
   <button disabled={pending} type="submit" name="decision" value="skipped">Skip</button>
  </div>
  {state.message && <p role="status" style={{fontSize:13}}>{state.message}</p>}
 </form>;
}
