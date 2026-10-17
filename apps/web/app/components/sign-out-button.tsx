"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../../lib/supabase/client";

export function SignOutButton({
  className = "secondaryButton",
}: {
  className?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSignOut() {
    setBusy(true);
    setError(null);
    try {
      const supabase = createClient();
      const { error: signOutError } = await supabase.auth.signOut({
        scope: "local",
      });
      if (signOutError) {
        setError("Unable to disconnect from Me+. Please retry.");
        setBusy(false);
        return;
      }
      router.replace("/login");
      router.refresh();
    } catch {
      setError("Unable to disconnect from Me+. Please retry.");
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
      <button
        type="button"
        onClick={handleSignOut}
        disabled={busy}
        className={className}
        style={{ minHeight: 44, padding: "8px 16px", cursor: busy ? "wait" : "pointer" }}
        aria-label="Sign out of Me+"
      >
        {busy ? "Signing out…" : "Sign out"}
      </button>
      {error ? (
        <span role="alert" style={{ color: "#f87171", fontSize: "0.8rem" }}>
          {error}
        </span>
      ) : null}
    </div>
  );
}
