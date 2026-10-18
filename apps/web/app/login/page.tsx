"use client";

import { Suspense, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "../../lib/supabase/client";
import { SiteNav } from "../components/site-nav";

const ALLOWED_NEXT_PATHS = ["/today", "/plan", "/capture", "/review", "/more"] as const;

function sanitizeNextPath(raw: string | null): string {
  if (!raw) return "/today";
  if (ALLOWED_NEXT_PATHS.includes(raw as (typeof ALLOWED_NEXT_PATHS)[number])) {
    return raw;
  }
  return "/today";
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextTarget = sanitizeNextPath(searchParams.get("next"));

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSignIn(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");

    try {
      const client = createClient();
      const { error: authError } = await client.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (authError) {
        setError("Unable to sign in. Please check your credentials and try again.");
        setBusy(false);
        return;
      }

      router.replace(nextTarget);
      router.refresh();
    } catch {
      setError("Unable to connect to the authentication service. Please retry.");
      setBusy(false);
    }
  }

  return (
    <div style={{ maxWidth: 460, margin: "40px auto 0" }}>
      <section className="appCard" aria-labelledby="login-title">
        <h1 id="login-title" style={{ fontSize: "1.75rem", marginBottom: 6 }}>
          Sign in to Me+
        </h1>
        <p style={{ color: "var(--muted)", marginBottom: 24, fontSize: "0.9rem" }}>
          Sign in to view your private Me+ priorities.
        </p>

        <form onSubmit={handleSignIn}>
          <div className="formGroup">
            <label className="formLabel" htmlFor="login-email">
              Email Address
            </label>
            <input
              id="login-email"
              type="email"
              autoComplete="email"
              required
              disabled={busy}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="formInput"
              placeholder="you@example.com"
            />
          </div>

          <div className="formGroup">
            <label className="formLabel" htmlFor="login-password">
              Password
            </label>
            <input
              id="login-password"
              type="password"
              autoComplete="current-password"
              required
              disabled={busy}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="formInput"
            />
          </div>

          {error ? (
            <div
              role="alert"
              style={{
                padding: "10px 14px",
                marginBottom: 16,
                borderRadius: 10,
                background: "rgba(248, 113, 113, 0.14)",
                border: "1px solid rgba(248, 113, 113, 0.3)",
                color: "#a12836",
                fontSize: "0.85rem",
              }}
            >
              {error}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={busy}
            className="primaryButton"
            style={{ width: "100%", marginTop: 8 }}
          >
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </section>
    </div>
  );
}

export default function LoginPage() {
  return (
    <main className="shell">
      <SiteNav current="login" />
      <Suspense fallback={<div className="emptyState">Loading…</div>}>
        <LoginForm />
      </Suspense>

      <footer className="siteFooter" style={{ marginTop: 64 }}>
        <div>
          <span className="footerBrand">Me+</span>
          <span>Private personal intelligence.</span>
        </div>
        <nav aria-label="Footer navigation">
          <Link href="/">Home</Link>
          <Link href="/download">Download Android</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
        </nav>
      </footer>
    </main>
  );
}
