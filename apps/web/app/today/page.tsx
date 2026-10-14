import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "../../lib/supabase/server";

export const dynamic = "force-dynamic";

type Action = { id: string; title: string; priority: string; status: string; estimated_minutes: number | null; instructions: string | null };
type Recommendation = { id: string; title: string; rationale: string | null; confidence: string | null; generated_at: string };

export default async function TodayPage() {
  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) redirect("/login?next=%2Ftoday");

  // User-scoped Supabase session + RLS. Never use service-role credentials in this view.
  const [actionsResult, guidanceResult] = await Promise.all([
    supabase.from("actions").select("id,title,priority,status,estimated_minutes,instructions")
      .eq("user_id", auth.user.id).in("status", ["available", "planned", "in_progress", "partial"])
      .order("due_at", { ascending: true, nullsFirst: false }).limit(40),
    supabase.from("recommendations").select("id,title,rationale,confidence,generated_at")
      .eq("user_id", auth.user.id).order("generated_at", { ascending: false }).limit(3)
  ]);

  const error = actionsResult.error || guidanceResult.error;
  const actions = (actionsResult.data ?? []) as Action[];
  const guidance = (guidanceResult.data ?? []) as Recommendation[];
  const groups = ["must", "should", "bonus"] as const;

  return (
    <main style={{ maxWidth: 850, margin: "0 auto", padding: "clamp(20px,5vw,48px)", fontFamily: "system-ui", lineHeight: 1.5 }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <Link href="/" aria-label="Me+ home" style={{ fontWeight: 800, fontSize: 22 }}>Me+</Link>
        <span style={{ fontSize: 13, opacity: 0.7 }}>Private · Read-only preview</span>
      </header>
      <h1 style={{ fontSize: "clamp(32px,7vw,52px)", marginBottom: 4 }}>Today</h1>
      <p style={{ opacity: 0.75 }}>Your current priorities from Me+. No changes are made from this screen.</p>
      {error ? (
        <section role="alert" style={{ padding: 20, border: "1px solid currentColor", borderRadius: 12 }}>
          We couldn't load your current Me+ state. Please refresh or try again later.
        </section>
      ) : (
        <>
          <section aria-labelledby="now-heading" style={{ padding: 24, border: "1px solid #7775", borderRadius: 16, marginTop: 28 }}>
            <h2 id="now-heading">What matters now</h2>
            {actions.length ? (
              <p><strong>{actions.find(a => a.priority === "must")?.title ?? actions[0].title}</strong></p>
            ) : <p>No active actions are currently available.</p>}
          </section>
          {groups.map(priority => {
            const items = actions.filter(a => a.priority === priority);
            return (
              <section key={priority} aria-labelledby={priority + "-heading"} style={{ marginTop: 32 }}>
                <h2 id={priority + "-heading"} style={{ textTransform: "capitalize" }}>{priority} <small>({items.length})</small></h2>
                {items.length === 0 ? <p style={{ opacity: 0.65 }}>Nothing here right now.</p> :
                  <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 10 }}>
                    {items.map(a => <li key={a.id} style={{ padding: 18, border: "1px solid #7775", borderRadius: 12 }}>
                      <strong>{a.title}</strong>
                      <div style={{ opacity: 0.75, fontSize: 13 }}>{a.status}{a.estimated_minutes ? ` · ${a.estimated_minutes} min` : ""}</div>
                      {a.instructions ? <p style={{ marginBottom: 0 }}>{a.instructions}</p> : null}
                    </li>)}
                  </ul>}
              </section>
            );
          })}
          <section aria-labelledby="guidance-heading" style={{ marginTop: 32 }}>
            <h2 id="guidance-heading">Guidance</h2>
            {guidance.length === 0 ? <p>No recent recommendations.</p> :
              <ul style={{ paddingLeft: 20 }}>{guidance.map(r => <li key={r.id} style={{ marginBottom: 16 }}>
                <strong>{r.title}</strong>{r.rationale ? <p>{r.rationale}</p> : null}
                <small>Confidence: {r.confidence ?? "not available"}</small>
              </li>)}</ul>}
          </section>
        </>
      )}
    </main>
  );
}
