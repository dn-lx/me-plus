"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";

import { createClient } from "../../../lib/supabase/client";

export default function ConnectN26Page() {
  const [supabase] = useState(() => createClient());
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => {
        if (active) setSession(nextSession);
      },
    );

    void supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) setMessage("Could not restore your sign-in. Please try again.");
      else setSession(data.session);
    });

    const params = new URLSearchParams(window.location.search);
    const result = params.get("n26");
    const syncState = params.get("sync");

    if (result === "connected" && syncState === "started") {
      setMessage("N26 connected. The initial read-only sync is running in the background and may take about a minute.");
    } else if (result === "connected") {
      setMessage("N26 connected.");
    }
    if (result === "cancelled") setMessage("N26 authorization was cancelled.");
    if (result === "error") setMessage("N26 connection did not complete. Please try again.");

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) throw error;
      setPassword("");
    } catch {
      setMessage("Could not sign in. Check your email and password.");
    } finally {
      setBusy(false);
    }
  }

  async function connectN26() {
    setBusy(true);
    setMessage("");
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error || !data.session) {
        setMessage("Your sign-in expired. Please sign in again.");
        return;
      }

      const response = await fetch("/api/finance/n26/connect", {
        method: "POST",
        headers: { Authorization: `Bearer ${data.session.access_token}` },
      });

      const payload: unknown = await response.json();

      if (!response.ok) {
        if (payload && typeof payload === "object" && "reason" in payload) {
          const reason = payload.reason;
          if (reason === "invalid_private_key") {
            setMessage("The Enable Banking private key configuration is invalid.");
            return;
          }

          if (reason === "provider_rejected_request") {
            const status =
              "providerStatus" in payload && typeof payload.providerStatus === "number"
                ? payload.providerStatus
                : null;
            const code =
              "providerError" in payload && typeof payload.providerError === "string"
                ? payload.providerError
                : null;
            setMessage(
              `Enable Banking rejected the authorization request${status ? ` (HTTP ${status}` : ""}${code ? `: ${code}` : ""}${status ? ")" : ""}.`,
            );
            return;
          }
        }

        setMessage("Could not start N26 authorization. Please try again.");
        return;
      }

      if (
        !payload ||
        typeof payload !== "object" ||
        !("authorizationUrl" in payload) ||
        typeof payload.authorizationUrl !== "string"
      ) {
        throw new Error("Missing authorization URL");
      }
      const authorizationUrl = new URL(payload.authorizationUrl);
      if (authorizationUrl.protocol !== "https:") {
        throw new Error("Unexpected authorization URL");
      }
      window.location.assign(authorizationUrl.href);
    } catch {
      setMessage("Could not start N26 authorization. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    setBusy(true);
    const { error } = await supabase.auth.signOut();
    if (error) setMessage("Could not sign out. Please try again.");
    else setSession(null);
    setBusy(false);
  }

  return (
    <main className="shell">
      <header className="hero">
        <p className="eyebrow">ME+ FINANCE</p>
        <h1>Connect N26</h1>
        <p className="lede">
          Authorize read-only access to your linked N26 account. Me+ reads
          balances and transactions; it cannot initiate payments.
        </p>
      </header>

      <section className="card connectionCard" aria-label="N26 connection">
        {session ? (
          <>
            <p>Signed in as {session.user.email ?? "your Me+ account"}.</p>
            <div className="connectionActions">
              <button type="button" onClick={connectN26} disabled={busy}>
                {busy ? "Working…" : "Continue to N26"}
              </button>
              <button className="secondaryButton" type="button" onClick={signOut} disabled={busy}>
                Sign out
              </button>
            </div>
          </>
        ) : (
          <>
            <h2>Sign in to Me+</h2>
            <p>Use your existing Me+ account to connect N26.</p>
            <form onSubmit={signIn} className="connectionForm">
              <label htmlFor="email">Email address</label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              <button type="submit" disabled={busy}>
                {busy ? "Signing in…" : "Sign in"}
              </button>
            </form>
          </>
        )}
        {message && <p className="connectionMessage" role="status">{message}</p>}
      </section>

      <footer className="siteFooter">
        <a href="/">Home</a>
        <a href="/privacy">Privacy</a>
        <a href="/terms">Terms</a>
      </footer>
    </main>
  );
}
