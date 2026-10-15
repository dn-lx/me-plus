import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "../../lib/supabase/server";

export const dynamic = "force-dynamic";

type ExecutionEvent = {
  id: string; action_id: string; event_type: string; occurred_at: string;
};
type ExecutableAction = {
  id: string; title: string; status: string; priority: string; due_at: string | null;
};

function localDate(iso: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date(iso));
  const find = (type: string) => parts.find(p => p.type === type)?.value ?? "";
  return [find("year"), find("month"), find("day")].join("-");
}
function safeTimeZone(candidate: string | null): string {
  try {
    const tz = candidate || "UTC";
    new Intl.DateTimeFormat("en", {timeZone: tz}).format();
    return tz;
  } catch { return "UTC"; }
}

export default async function ReviewPage() {
  const db = await createClient();
  const {data: auth, error: authError} = await db.auth.getUser();
  if (authError || !auth.user) redirect("/login?next=%2Freview");

  const since = new Date(Date.now() - 9 * 86400000).toISOString();
  const [profileResult, eventResult, actionsResult, openResult] = await Promise.all([
    db.from("profiles").select("timezone").eq("id", auth.user.id).maybeSingle(),
    db.from("action_events").select("id,action_id,event_type,occurred_at")
      .eq("user_id", auth.user.id).gte("occurred_at", since)
      .order("occurred_at", {ascending: false}).limit(500),
    db.from("actions").select("id,title,status,priority,due_at")
      .eq("user_id", auth.user.id).gte("updated_at", since).limit(350),
    db.from("actions").select("id,title,status,priority,due_at")
      .eq("user_id", auth.user.id)
      .in("status", ["available","planned","in_progress","partial"])
      .order("due_at", {ascending: true, nullsFirst: false}).limit(20),
  ]);
  const error = eventResult.error || actionsResult.error || openResult.error || profileResult.error;
  const tz = safeTimeZone(profileResult.data?.timezone ?? null);
  const today = localDate(new Date().toISOString(), tz);
  const [year, month, day] = today.split("-").map(Number);
  const dates = Array.from({length: 7}, (_, i) =>
    new Date(Date.UTC(year, month - 1, day - i, 12)).toISOString().slice(0, 10)
  );
  const events = ((eventResult.data ?? []) as ExecutionEvent[])
    .filter(e => ["completed","partial","skipped"].includes(e.event_type));
  const titles = new Map(((actionsResult.data ?? []) as ExecutableAction[])
    .map(a => [a.id,a.title]));
  const counts = dates.map(date => {
    const relevant = events.filter(e => localDate(e.occurred_at,tz) === date);
    return {date,
      completed: relevant.filter(e => e.event_type === "completed").length,
      partial: relevant.filter(e => e.event_type === "partial").length,
      skipped: relevant.filter(e => e.event_type === "skipped").length};
  });
  const totals = counts.reduce((a, d) => ({
    completed: a.completed + d.completed,
    partial: a.partial + d.partial,
    skipped: a.skipped + d.skipped,
  }), {completed: 0,partial: 0,skipped: 0});
  const open = (openResult.data ?? []) as ExecutableAction[];
  return <main style={{maxWidth:850,margin:"auto",padding:"clamp(20px,5vw,48px)",fontFamily:"system-ui",lineHeight:1.5}}>
    <header style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12}}>
      <Link href="/today">← Today</Link><span style={{fontSize:13,opacity:0.7}}>Private · {tz}</span>
    </header>
    <h1>Daily Review</h1>
    <p>Seven days of recorded execution, not inferred activity. A scheduled task is not counted as completed.</p>
    {error ? <p role="alert">Your review could not be loaded. No records were changed.</p> :
    <>
      <section aria-labelledby="week-heading">
        <h2 id="week-heading">Last seven days</h2>
        <p><strong>{totals.completed}</strong> completed · <strong>{totals.partial}</strong> partial · <strong>{totals.skipped}</strong> skipped</p>
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",textAlign:"left"}}>
            <thead><tr><th scope="col">Date</th><th scope="col">Completed</th><th scope="col">Partial</th><th scope="col">Skipped</th></tr></thead>
            <tbody>{counts.map(d=><tr key={d.date} style={{borderTop:"1px solid #8885"}}>
              <th scope="row" style={{padding:"10px 0"}}>{d.date === today ? "Today" : d.date}</th>
              <td>{d.completed}</td><td>{d.partial}</td><td>{d.skipped}</td>
            </tr>)}</tbody>
          </table>
        </div>
      </section>
      <section aria-labelledby="remaining-heading" style={{marginTop:32}}>
        <h2 id="remaining-heading">Still open ({open.length}{open.length===20?"+":""})</h2>
        {open.length ? <ul>{open.map(a=><li key={a.id}>{a.title} <small>({a.status})</small></li>)}</ul>
          : <p>No open actions found.</p>}
      </section>
      <section aria-labelledby="history-heading" style={{marginTop:32}}>
        <h2 id="history-heading">Recent decisions</h2>
        {events.length ? <ul>{events.slice(0,12).map(e=><li key={e.id}>
          {titles.get(e.action_id) ?? "Action"} — {e.event_type}
          <small> · {localDate(e.occurred_at,tz)}</small>
        </li>)}</ul> : <p>No execution events recorded in this window.</p>}
      </section>
      <p style={{fontSize:13,opacity:0.65}}>Counts represent action events; an action may appear on more than one day after partial progress. Results are limited to the latest 500 events.</p>
    </>}
  </main>;
}
