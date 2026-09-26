import { ME_PLUS_DOMAINS } from "@me-plus/domain";

const domainDescriptions: Record<(typeof ME_PLUS_DOMAINS)[number], string> = {
  learning: "Goals, plans, practice and progress.",
  health: "Wearables, activity, recovery and health records.",
  finance: "Financial context, plans and decision support.",
  time: "Tasks, routines, calendar context and attention.",
};

export default function HomePage() {
  return (
    <main className="shell">
      <header className="hero">
        <p className="eyebrow">ME+ CONTROL SURFACE</p>
        <h1>Your life data, reasoning and actions in one place.</h1>
        <p className="lede">
          This is the first runnable web shell. Canonical state will live in Supabase; model providers remain replaceable reasoning dependencies.
        </p>
      </header>

      <section aria-labelledby="domains-title">
        <div className="sectionHeading">
          <h2 id="domains-title">Domains</h2>
          <span>Foundation</span>
        </div>
        <div className="grid">
          {ME_PLUS_DOMAINS.map((domain) => (
            <article className="card" key={domain}>
              <h3>{domain}</h3>
              <p>{domainDescriptions[domain]}</p>
              <small>Shared contracts ready · runtime wiring next</small>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
