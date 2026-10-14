"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../../lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function signIn(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setError("");
    const client = createClient();
    const { error: authError } = await client.auth.signInWithPassword({ email, password });
    if (authError) { setError("Sign-in failed. Check your credentials."); setBusy(false); return; }
    router.replace("/today"); router.refresh();
  }
  return <main style={{maxWidth:440,margin:"10vh auto",padding:24,fontFamily:"system-ui"}}>
    <h1>Sign in to Me+</h1><p>Your personal state stays private.</p>
    <form onSubmit={signIn} style={{display:"grid",gap:14}}>
      <label>Email<input type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)} style={{display:"block",width:"100%",padding:12}} /></label>
      <label>Password<input type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)} style={{display:"block",width:"100%",padding:12}} /></label>
      {error && <p role="alert">{error}</p>}
      <button type="submit" disabled={busy} style={{padding:14}}>{busy?"Signing in…":"Sign in"}</button>
    </form>
  </main>;
}
