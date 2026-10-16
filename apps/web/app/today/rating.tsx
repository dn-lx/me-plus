"use client";
import { useActionState } from "react";
import { rateRecommendation, type FeedbackState } from "./actions";

const initial: FeedbackState = { ok: false, message: "" };
export function RecommendationRating({ id }: { id: string }) {
  const [state, action, pending] = useActionState(rateRecommendation, initial);
  return <form action={action} aria-label="Rate recommendation usefulness">
    <input type="hidden" name="recommendation_id" value={id} />
    <fieldset disabled={pending} style={{border:0,padding:0,margin:"10px 0"}}>
      <legend style={{fontSize:13}}>How useful was this recommendation?</legend>
      <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
        {[1,2,3,4,5].map(n => <button key={n} type="submit" name="stars" value={n}
          aria-label={`Rate ${n} out of 5 stars`}
          style={{padding:"8px 12px",borderRadius:8,border:"1px solid #8886",cursor:"pointer"}}>
          {n} ★
        </button>)}
      </div>
    </fieldset>
    {state.message ? <p role="status" style={{fontSize:13}}>{state.message}</p> : null}
  </form>;
}
