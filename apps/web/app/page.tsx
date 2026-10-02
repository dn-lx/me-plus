import { ME_PLUS_DOMAINS } from "@me-plus/domain";

const domainPresentation: Record<
  (typeof ME_PLUS_DOMAINS)[number],
  { eyebrow: string; title: string; description: string; image: string }
> = {
  learning: {
    eyebrow: "Learning & skills",
    title: "Keep momentum visible.",
    description:
      "Goals, practice, languages and progress shaped into the next useful learning action.",
    image:
      "https://images.unsplash.com/photo-1711843250800-270a113cb06b?auto=format&fit=crop&w=1400&q=82",
  },
  health: {
    eyebrow: "Health & recovery",
    title: "See the whole physical picture.",
    description:
      "Wearables, workouts, recovery and everyday signals brought into one calm context.",
    image:
      "https://images.unsplash.com/photo-1753240810506-9c01a7ac7631?auto=format&fit=crop&w=1400&q=82",
  },
  finance: {
    eyebrow: "Finance",
    title: "Turn numbers into decisions.",
    description:
      "Balances, transactions and obligations become practical context instead of another dashboard.",
    image:
      "https://images.unsplash.com/photo-1740662917840-cae94979484d?auto=format&fit=crop&w=1400&q=82",
  },
  time: {
    eyebrow: "Time & attention",
    title: "Make the day feel lighter.",
    description:
      "Routines, calendar context and priorities arranged around realistic capacity.",
    image:
      "https://images.unsplash.com/photo-1767716843242-b2f98460886f?auto=format&fit=crop&w=1400&q=82",
  },
};

export default function HomePage() {
  return (
    <main className="shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Me+ home">
          <span className="brandMark">M+</span>
          <span>Me+</span>
        </a>
        <div className="statusPill">
          <span className="statusDot" aria-hidden="true" />
          Private personal intelligence
        </div>
      </header>

      <section className="hero" aria-labelledby="hero-title">
        <div className="heroCopy">
          <p className="eyebrow">YOUR LIFE, IN CONTEXT</p>
          <h1 id="hero-title">
            Less dashboard.
            <span> More direction.</span>
          </h1>
          <p className="lede">
            Me+ brings your health, money, time and learning into one private
            intelligence layer, then turns the complexity into a small number
            of useful next actions.
          </p>

          <div className="heroActions">
            <a className="primaryButton" href="/finance/connect">
              Manage bank connection
              <span aria-hidden="true">↗</span>
            </a>
            <a className="secondaryButton" href="#domains-title">
              Explore the system
            </a>
          </div>

          <div className="trustRow" aria-label="Me+ principles">
            <span>Supabase-backed state</span>
            <span>Bounded reasoning</span>
            <span>You stay in control</span>
          </div>
        </div>

        <div className="heroVisual" aria-label="A calm workspace representing Me+">
          <div
            className="heroPhoto"
            aria-hidden="true"
            style={{
              backgroundImage:
                "url(https://images.unsplash.com/photo-1767716843242-b2f98460886f?auto=format&fit=crop&w=1800&q=88)",
            }}
          />
          <div className="visualTopLabel">
            <span>ME+</span>
            <span>NOW</span>
          </div>
          <div className="glassPanel">
            <p>What matters next</p>
            <strong>One clear action at a time.</strong>
            <div className="miniTimeline" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
          </div>
        </div>
      </section>

      <section className="principles" aria-label="Me+ operating principles">
        <article>
          <span>01</span>
          <div>
            <strong>Collect quietly</strong>
            <p>Use connected signals where they genuinely reduce manual work.</p>
          </div>
        </article>
        <article>
          <span>02</span>
          <div>
            <strong>Reason with context</strong>
            <p>Keep facts, uncertainty and recommendations clearly separated.</p>
          </div>
        </article>
        <article>
          <span>03</span>
          <div>
            <strong>Act simply</strong>
            <p>Surface a focused next step instead of another wall of metrics.</p>
          </div>
        </article>
      </section>

      <section className="domainSection" aria-labelledby="domains-title">
        <div className="sectionHeading">
          <div>
            <p className="eyebrow">ONE SYSTEM · FOUR VIEWS</p>
            <h2 id="domains-title">The parts of life that work together.</h2>
          </div>
          <p>
            Each domain keeps its own evidence and history while contributing
            only the context needed for a decision.
          </p>
        </div>

        <div className="domainGrid">
          {ME_PLUS_DOMAINS.map((domain) => {
            const presentation = domainPresentation[domain];

            return (
              <article className="domainCard" key={domain}>
                <div
                  className="domainImage"
                  aria-hidden="true"
                  style={{ backgroundImage: `url(${presentation.image})` }}
                >
                  <span>{presentation.eyebrow}</span>
                </div>
                <div className="domainBody">
                  <p className="domainLabel">{domain}</p>
                  <h3>{presentation.title}</h3>
                  <p>{presentation.description}</p>
                  <div className="cardRule" aria-hidden="true" />
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="closingFrame" aria-labelledby="closing-title">
        <div>
          <p className="eyebrow">BUILT TO DISAPPEAR INTO THE DAY</p>
          <h2 id="closing-title">The system can be complex. Your next step should not be.</h2>
        </div>
        <a className="textLink" href="/privacy">
          Privacy & data controls <span aria-hidden="true">→</span>
        </a>
      </section>

      <footer className="siteFooter">
        <div>
          <span className="footerBrand">Me+</span>
          <span>Private personal intelligence.</span>
        </div>
        <nav aria-label="Footer navigation">
          <a href="/finance/connect">N26</a>
          <a href="/privacy">Privacy</a>
          <a href="/terms">Terms</a>
        </nav>
      </footer>
    </main>
  );
}
