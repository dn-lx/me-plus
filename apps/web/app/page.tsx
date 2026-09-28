import { ME_PLUS_DOMAINS } from "@me-plus/domain";

const domainDescriptions: Record<(typeof ME_PLUS_DOMAINS)[number], string> = {
  learning: "Goals, plans, practice and progress.",
  health: "Wearables, activity, recovery and health records.",
  finance: "Financial context, plans and decision support.",
  time: "Tasks, routines, calendar context and attention.",
};

const androidBuild = {
  version: "0.2.0",
  displayVersion: "0.2",
  filename: "me-plus-0.2.apk",
  href: "/downloads/me-plus-0.2.apk",
  checksumHref: "/downloads/me-plus-0.2.apk.sha256",
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

      <section aria-labelledby="android-download-title" className="downloadSection">
        <div className="sectionHeading">
          <h2 id="android-download-title">Android app</h2>
          <span>Development build</span>
        </div>
        <article className="card downloadCard">
          <div>
            <h3>Me+ {androidBuild.displayVersion}</h3>
            <p>
              Install the Android build to validate Health Connect directly on your phone.
            </p>
            <small>
              Version {androidBuild.version} · {androidBuild.filename}
            </small>
          </div>
          <div className="downloadActions">
            <a className="downloadButton" href={androidBuild.href} download>
              Download APK
            </a>
            <a className="checksumLink" href={androidBuild.checksumHref}>
              SHA-256
            </a>
          </div>
        </article>
      </section>

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

      <footer className="siteFooter">
        <a href="/finance/connect">Connect N26</a>
        <a href="/privacy">Privacy</a>
        <a href="/terms">Terms</a>
      </footer>
    </main>
  );
}
