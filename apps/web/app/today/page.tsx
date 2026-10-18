import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "../../lib/supabase/server";
import {
  isRecommendationValid,
  type CalendarEventLike,
  type NowCandidate,
  type RecommendationLike,
} from "../../lib/now-ranking";
import { selectTodayNow } from "../../lib/today-snapshot";
import { SiteNav } from "../components/site-nav";
import { ActionControls } from "./action-controls";
import { RecommendationRating } from "./rating";

export const dynamic = "force-dynamic";

type Action = NowCandidate & {
  title: string;
  instructions: string | null;
};

type Recommendation = RecommendationLike;

export default async function TodayPage() {
  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) {
    redirect("/login?next=%2Ftoday");
  }

  const queryStart = new Date();
  const queryStartIso = queryStart.toISOString();
  const horizon24h = new Date(queryStart.getTime() - 86400000).toISOString();

  // Bounded owner-filtered queries with session RLS
  const [actionsResult, guidanceResult, calendarResult] = await Promise.all([
    supabase
      .from("actions")
      .select("id,title,priority,status,estimated_minutes,instructions,due_at,available_from")
      .eq("user_id", auth.user.id)
      .in("status", ["available", "planned", "in_progress", "partial"])
      .order("due_at", { ascending: true, nullsFirst: false })
      .limit(40),
    supabase
      .from("recommendations")
      .select("id,title,rationale,confidence,generated_at,expires_at")
      .eq("user_id", auth.user.id)
      .gte("generated_at", horizon24h)
      .or(`expires_at.is.null,expires_at.gt.${queryStartIso}`)
      .order("generated_at", { ascending: false })
      .limit(3),
    supabase
      .from("calendar_events")
      .select("starts_at,ends_at")
      .eq("user_id", auth.user.id)
      .eq("busy", true)
      .gt("ends_at", queryStartIso)
      .order("starts_at", { ascending: true })
      .limit(12),
  ]);

  // Evaluate current time strictly AFTER reads complete
  const clock = new Date();
  const clockFormatted = clock.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Europe/Berlin",
  });
  const dateFormatted = clock.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "Europe/Berlin",
  });

  const queryError = actionsResult.error || guidanceResult.error;
  const actions = (actionsResult.data ?? []) as Action[];
  const rawGuidance = (guidanceResult.data ?? []) as Recommendation[];

  // Filter recommendations using shared validity check
  const guidance = rawGuidance.filter((r) => isRecommendationValid(r, clock));

  // Evaluate calendar availability using shared domain logic
  const calendarEvents = (calendarResult.data ?? []) as CalendarEventLike[];
  const { availability, now, nowReason } = selectTodayNow(actions, calendarEvents, clock, calendarResult.error);

  const groups = ["must", "should", "bonus"] as const;

  return (
    <main className="shell">
      <SiteNav current="today" user={auth.user} />

      <header style={{ marginBottom: 24 }}>
        <p className="eyebrow">DAILY EXECUTION</p>
        <h1 style={{ marginBottom: 6 }}>Today</h1>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", color: "var(--muted)", fontSize: "0.85rem" }}>
          <span>Signed in as <strong style={{ color: "var(--soft)" }}>{auth.user.email ?? "owner"}</strong></span>
          <span>·</span>
          <span>As of {dateFormatted} at {clockFormatted} (Europe/Berlin)</span>
        </div>
      </header>

      {queryError ? (
        <section className="appCard calmAlert" role="alert">
          <h2 style={{ fontSize: "1.15rem", marginBottom: 6, color: "#a12836" }}>
            Unable to Load Priorities
          </h2>
          <p style={{ margin: 0 }}>
            We couldn&apos;t load your current Me+ priorities. Please refresh or try again later.
          </p>
        </section>
      ) : (
        <>
          <section className="appCard nowCard" aria-labelledby="now-heading">
            <div className="nowEyebrow">
              <span className="statusDot" aria-hidden="true" />
              What Matters Now
            </div>

            {now ? (
              <div>
                <h2 id="now-heading" className="nowTitle">
                  {now.title}
                </h2>
                <div className="nowMeta">
                  <span
                    className={`priorityPill ${
                      now.priority === "must"
                        ? "pillMust"
                        : now.priority === "should"
                          ? "pillShould"
                          : "pillBonus"
                    }`}
                  >
                    {now.priority.toUpperCase()}
                  </span>
                  {now.estimated_minutes ? (
                    <span>{now.estimated_minutes} min duration</span>
                  ) : null}
                  {availability.minutesAvailable !== null ? (
                    <span>{availability.minutesAvailable} min available until next commitment</span>
                  ) : null}
                  <span>Status: {now.status}</span>
                </div>
                {now.instructions ? (
                  <p className="nowInstructions">{now.instructions}</p>
                ) : null}
                <div style={{ marginTop: 16 }}>
                  <ActionControls id={now.id} title={now.title} />
                </div>
              </div>
            ) : (
              <div>
                <h2 id="now-heading" className="nowTitle" style={{ fontSize: "1.35rem" }}>
                  {nowReason === "calendar_unavailable"
                    ? "Calendar Verification Incomplete"
                    : nowReason === "in_commitment"
                      ? "In Calendar Commitment"
                      : nowReason === "no_fit"
                        ? "No Action Fits Current Window"
                        : "No Active Actions Available"}
                </h2>
                <p style={{ color: "var(--soft)", margin: 0 }}>
                  {nowReason === "calendar_unavailable"
                    ? "Calendar availability could not be verified. Recommendations are paused until calendar availability is restored."
                    : nowReason === "in_commitment"
                      ? "You are currently in a calendar commitment. Recommendations resume when free time is available."
                      : nowReason === "no_fit"
                        ? availability.minutesAvailable !== null
                          ? `No open actions fit within your remaining ${availability.minutesAvailable} minutes before the next commitment.`
                          : "No open actions fit your current availability window."
                        : "There are no pending actions in your queue."}
                </p>
              </div>
            )}
          </section>

          {groups.map((priority) => {
            const items = actions.filter((a) => a.priority === priority);
            const pillClass =
              priority === "must"
                ? "pillMust"
                : priority === "should"
                  ? "pillShould"
                  : "pillBonus";

            return (
              <section
                key={priority}
                className="prioritySection"
                aria-labelledby={`${priority}-heading`}
              >
                <div className="priorityHeader">
                  <h2 id={`${priority}-heading`}>
                    {priority}
                    <span className={`priorityPill ${pillClass}`}>
                      {items.length}
                    </span>
                  </h2>
                </div>

                {items.length === 0 ? (
                  <div className="emptyState">Nothing here right now.</div>
                ) : (
                  <ul className="actionList">
                    {items.map((item) => (
                      <li key={item.id} className="actionItem">
                        <div className="actionHeader">
                          <h3 className="actionTitle">{item.title}</h3>
                          <span className={`priorityPill ${pillClass}`}>
                            {item.status}
                          </span>
                        </div>
                        <div className="actionSub">
                          {item.estimated_minutes
                            ? `${item.estimated_minutes} min estimated`
                            : "Flexible duration"}
                          {item.due_at
                            ? ` · Due ${new Date(item.due_at).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}`
                            : ""}
                        </div>
                        {item.instructions ? (
                          <p className="actionInstructions">{item.instructions}</p>
                        ) : null}
                        <ActionControls id={item.id} title={item.title} />
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}

          <section className="prioritySection" aria-labelledby="guidance-heading">
            <div className="priorityHeader">
              <h2 id="guidance-heading">
                Guidance
                <span className="priorityPill pillBonus">{guidance.length}</span>
              </h2>
            </div>

            {guidance.length === 0 ? (
              <div className="emptyState">No recent recommendations available.</div>
            ) : (
              <ul className="actionList">
                {guidance.map((rec) => (
                  <li key={rec.id} className="actionItem">
                    <div className="actionHeader">
                      <h3 className="actionTitle">{rec.title}</h3>
                      {rec.confidence ? (
                        <span className="priorityPill pillBonus">
                          Confidence: {rec.confidence}
                        </span>
                      ) : null}
                    </div>
                    {rec.rationale ? (
                      <p className="actionInstructions">{rec.rationale}</p>
                    ) : null}
                    <RecommendationRating id={rec.id} />
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
          <Link href="/review">Daily Review</Link>
          <Link href="/download">Download Android</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
        </nav>
      </footer>
    </main>
  );
}
