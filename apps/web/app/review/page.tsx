import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "../../lib/supabase/server";
import { SiteNav } from "../components/site-nav";

export const dynamic = "force-dynamic";

type ExecutionEvent = {
  id: string;
  action_id: string;
  event_type: string;
  occurred_at: string;
};

type ExecutableAction = {
  id: string;
  title: string;
  status: string;
  priority: string;
  due_at: string | null;
};

function localDate(iso: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(iso));
  const find = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return [find("year"), find("month"), find("day")].join("-");
}

function safeTimeZone(candidate: string | null): string {
  try {
    const tz = candidate || "UTC";
    new Intl.DateTimeFormat("en", { timeZone: tz }).format();
    return tz;
  } catch {
    return "UTC";
  }
}

export default async function ReviewPage() {
  const db = await createClient();
  const { data: auth, error: authError } = await db.auth.getUser();
  if (authError || !auth.user) {
    redirect("/login?next=%2Freview");
  }

  const since = new Date(Date.now() - 9 * 86400000).toISOString();
  const [profileResult, eventResult, actionsResult, openResult] = await Promise.all([
    db.from("profiles").select("timezone").eq("id", auth.user.id).maybeSingle(),
    db
      .from("action_events")
      .select("id,action_id,event_type,occurred_at")
      .eq("user_id", auth.user.id)
      .gte("occurred_at", since)
      .order("occurred_at", { ascending: false })
      .limit(500),
    db
      .from("actions")
      .select("id,title,status,priority,due_at")
      .eq("user_id", auth.user.id)
      .gte("updated_at", since)
      .limit(350),
    db
      .from("actions")
      .select("id,title,status,priority,due_at")
      .eq("user_id", auth.user.id)
      .in("status", ["available", "planned", "in_progress", "partial"])
      .order("due_at", { ascending: true, nullsFirst: false })
      .limit(20),
  ]);

  const queryError =
    eventResult.error || actionsResult.error || openResult.error || profileResult.error;

  const tz = safeTimeZone(profileResult.data?.timezone ?? null);
  const today = localDate(new Date().toISOString(), tz);
  const [year = 1970, month = 1, day = 1] = today.split("-").map(Number);
  const dates = Array.from({ length: 7 }, (_, i) =>
    new Date(Date.UTC(year, month - 1, day - i, 12)).toISOString().slice(0, 10),
  );

  const events = ((eventResult.data ?? []) as ExecutionEvent[]).filter((e) =>
    ["completed", "partial", "skipped"].includes(e.event_type),
  );
  const titles = new Map(
    ((actionsResult.data ?? []) as ExecutableAction[]).map((a) => [a.id, a.title]),
  );

  const counts = dates.map((date) => {
    const relevant = events.filter((e) => localDate(e.occurred_at, tz) === date);
    return {
      date,
      completed: relevant.filter((e) => e.event_type === "completed").length,
      partial: relevant.filter((e) => e.event_type === "partial").length,
      skipped: relevant.filter((e) => e.event_type === "skipped").length,
    };
  });

  const totals = counts.reduce(
    (a, d) => ({
      completed: a.completed + d.completed,
      partial: a.partial + d.partial,
      skipped: a.skipped + d.skipped,
    }),
    { completed: 0, partial: 0, skipped: 0 },
  );

  const open = (openResult.data ?? []) as ExecutableAction[];

  return (
    <main className="shell">
      <SiteNav current="review" user={auth.user} />

      <header style={{ marginBottom: 28 }}>
        <p className="eyebrow">REFLECTION & AUDIT</p>
        <h1 style={{ marginBottom: 6 }}>Daily Review</h1>
        <p style={{ color: "var(--soft)", maxWidth: 640 }}>
          Seven days of recorded execution, grounded in verified actions. Scheduled tasks are not
          counted as completed until confirmed.
        </p>
      </header>

      {queryError ? (
        <section className="appCard calmAlert" role="alert">
          <h2 style={{ fontSize: "1.15rem", marginBottom: 6, color: "#a12836" }}>
            Review Unavailable
          </h2>
          <p style={{ margin: 0 }}>
            Your review could not be loaded at this time. No records were modified.
          </p>
        </section>
      ) : (
        <>
          <section className="appCard" aria-labelledby="week-heading">
            <h2 id="week-heading" style={{ fontSize: "1.25rem", marginBottom: 8 }}>
              Last Seven Days
            </h2>
            <div
              style={{
                display: "flex",
                gap: 16,
                flexWrap: "wrap",
                marginBottom: 20,
                fontSize: "0.95rem",
                color: "var(--soft)",
              }}
            >
              <span>
                <strong style={{ color: "var(--mint-strong)" }}>{totals.completed}</strong>{" "}
                completed
              </span>
              <span>·</span>
              <span>
                <strong style={{ color: "#835800" }}>{totals.partial}</strong> partial
              </span>
              <span>·</span>
              <span>
                <strong style={{ color: "var(--muted)" }}>{totals.skipped}</strong> skipped
              </span>
            </div>

            <div className="reviewTableWrapper">
              <table className="reviewTable">
                <thead>
                  <tr>
                    <th scope="col">Date</th>
                    <th scope="col">Completed</th>
                    <th scope="col">Partial</th>
                    <th scope="col">Skipped</th>
                  </tr>
                </thead>
                <tbody>
                  {counts.map((d) => (
                    <tr key={d.date}>
                      <th scope="row" style={{ fontWeight: 600 }}>
                        {d.date === today ? "Today" : d.date}
                      </th>
                      <td>{d.completed}</td>
                      <td>{d.partial}</td>
                      <td>{d.skipped}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p style={{ fontSize: "0.78rem", color: "var(--muted)", margin: "14px 0 0" }}>
              Timezone: {tz} · Limited to the latest 500 execution events.
            </p>
          </section>

          <section className="prioritySection" aria-labelledby="remaining-heading">
            <div className="priorityHeader">
              <h2 id="remaining-heading">
                Still Open
                <span className="priorityPill pillShould">
                  {open.length}
                  {open.length === 20 ? "+" : ""}
                </span>
              </h2>
            </div>

            {open.length === 0 ? (
              <div className="emptyState">No open actions found.</div>
            ) : (
              <ul className="actionList">
                {open.map((a) => (
                  <li key={a.id} className="actionItem">
                    <div className="actionHeader">
                      <h3 className="actionTitle">{a.title}</h3>
                      <span className="priorityPill pillShould">{a.status}</span>
                    </div>
                    {a.due_at ? (
                      <div className="actionSub">
                        Due {new Date(a.due_at).toLocaleDateString([], { month: "short", day: "numeric" })}
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="prioritySection" aria-labelledby="history-heading">
            <div className="priorityHeader">
              <h2 id="history-heading">Recent Decisions</h2>
            </div>

            {events.length === 0 ? (
              <div className="emptyState">No execution events recorded in this window.</div>
            ) : (
              <ul className="actionList">
                {events.slice(0, 12).map((e) => (
                  <li key={e.id} className="actionItem">
                    <div className="actionHeader">
                      <h3 className="actionTitle">
                        {titles.get(e.action_id) ?? "Action"}
                      </h3>
                      <span
                        className={`priorityPill ${
                          e.event_type === "completed"
                            ? "pillMust"
                            : e.event_type === "partial"
                              ? "pillShould"
                              : "pillBonus"
                        }`}
                      >
                        {e.event_type}
                      </span>
                    </div>
                    <div className="actionSub">Recorded {localDate(e.occurred_at, tz)}</div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      <footer className="siteFooter" style={{ marginTop: 56 }}>
        <div>
          <span className="footerBrand">Me+</span>
          <span>Private personal intelligence.</span>
        </div>
        <nav aria-label="Footer navigation">
          <Link href="/">Home</Link>
          <Link href="/today">Today</Link>
          <Link href="/download">Download Android</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
        </nav>
      </footer>
    </main>
  );
}
