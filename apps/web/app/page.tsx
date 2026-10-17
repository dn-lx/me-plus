import Link from "next/link";
import { ME_PLUS_DOMAINS } from "@me-plus/domain";
import { SiteNav } from "./components/site-nav";
import { getLatestVerifiedArtifact } from "../lib/download-artifact";

const domainPresentation: Record<
  (typeof ME_PLUS_DOMAINS)[number],
  { eyebrow: string; title: string; description: string }
> = {
  learning: {
    eyebrow: "Learning & skills",
    title: "Keep momentum visible.",
    description:
      "Goals, practice, languages and progress shaped into the next useful learning action.",
  },
  health: {
    eyebrow: "Health & recovery",
    title: "See the whole physical picture.",
    description:
      "Wearables, workouts, recovery and everyday signals brought into one calm context.",
  },
  finance: {
    eyebrow: "Finance",
    title: "Turn numbers into decisions.",
    description:
      "Balances, transactions and obligations become practical context instead of another dashboard.",
  },
  time: {
    eyebrow: "Time & attention",
    title: "Make the day feel lighter.",
    description:
      "Routines, calendar context and priorities arranged around realistic capacity.",
  },
};

export const dynamic = "force-static";

export default function HomePage() {
  const artifact = getLatestVerifiedArtifact();

  return (
    <main className="shell">
      <SiteNav current="home" />

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
            <Link className="primaryButton" href="/today">
              Open Today
              <span aria-hidden="true">→</span>
            </Link>
            <Link className="secondaryButton" href="/download">
              Download Android
            </Link>
            <Link className="secondaryButton" href="/review">
              Daily Review
            </Link>
          </div>

          {artifact ? (
            <div
              style={{
                marginBottom: 26,
                padding: "12px 16px",
                border: "1px solid rgba(167, 228, 196, 0.28)",
                borderRadius: 14,
                background: "rgba(167, 228, 196, 0.06)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: 10,
              }}
            >
              <div style={{ fontSize: "0.85rem", color: "var(--soft)" }}>
                <span
                  style={{
                    color: "var(--mint-strong)",
                    fontWeight: 700,
                    marginRight: 8,
                  }}
                >
                  Android APK:
                </span>
                Me+ {artifact.version} (versionCode {artifact.versionCode}) · {artifact.architecture} · {artifact.sizeFormatted}
              </div>
              <Link
                href="/download"
                style={{
                  fontSize: "0.85rem",
                  fontWeight: 700,
                  color: "var(--mint-strong)",
                  textDecoration: "underline",
                  textUnderlineOffset: 3,
                }}
              >
                Get {artifact.filename} →
              </Link>
            </div>
          ) : null}

          <div className="trustRow" aria-label="Me+ principles">
            <span>Your priorities, together</span>
            <span>Context for the next step</span>
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
                <div className="domainBody">
                  <p className="domainLabel">{presentation.eyebrow}</p>
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
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center" }}>
          <Link className="primaryButton" href="/today">
            Open Today
          </Link>
          <Link className="textLink" href="/download">
            Download Android APK <span aria-hidden="true">→</span>
          </Link>
        </div>
      </section>

      <footer className="siteFooter">
        <div>
          <span className="footerBrand">Me+</span>
          <span>Private personal intelligence.</span>
        </div>
        <nav aria-label="Footer navigation">
          <Link href="/today">Today</Link>
          <Link href="/review">Daily Review</Link>
          <Link href="/download">Android APK</Link>
          <Link href="/finance/connect">N26</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/login">Sign in</Link>
        </nav>
      </footer>
    </main>
  );
}
