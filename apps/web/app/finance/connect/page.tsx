"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";

import { createClient } from "../../../lib/supabase/client";

export default function ConnectN26Page() {
  const [supabase] = useState(() => createClient());
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState("");
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

    const result = new URLSearchParams(window.location.search).get("n26");
    if (result === "connected") setMessage("N26 connected. The read-only sync completed.");
    if (result === "cancelled") setMessage("N26 authorization was cancelled.");
    if (result === "error") setMessage("N26 connection did not complete. Please try again.");

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  async function sendSignInLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
          shouldCreateUser: false,
        },
      });
      if (error) throw error;
      setMessage("Check your email for the Me+ sign-in link.");
    } catch {
      setMessage("Could not send the sign-in link. Check the email and try again.");
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
      if (!response.ok) throw new Error("Connection start failed");

      const payload: unknown = await response.json();
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
    await supabase.auth.signOut();
    setSession(null);
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
            <p>Use the email already registered with your Me+ account.</p>
            <form onSubmit={sendSignInLink} className="connectionForm">
              <label htmlFor="email">Email address</label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
              <button type="submit" disabled={busy}>
                {busy ? "Sending…" : "Email me a sign-in link"}
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
