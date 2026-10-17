import Link from "next/link";
import { SignOutButton } from "./sign-out-button";

export type NavPage = "home" | "today" | "review" | "download" | "login" | "privacy" | "terms";

export function SiteNav({
  current,
  user,
}: {
  current?: NavPage;
  user?: { email?: string | null } | null;
}) {
  return (
    <header className="topbar">
      <Link href="/" className="brand" aria-label="Me+ home">
        <span className="brandMark" aria-hidden="true">
          M+
        </span>
        <span>Me+</span>
      </Link>

      <nav className="navLinks" aria-label="Main navigation">
        <Link
          href="/today"
          className="navLink"
          aria-current={current === "today" ? "page" : undefined}
        >
          Today
        </Link>
        <Link
          href="/review"
          className="navLink"
          aria-current={current === "review" ? "page" : undefined}
        >
          Daily Review
        </Link>
        <Link
          href="/download"
          className="navLink"
          aria-current={current === "download" ? "page" : undefined}
        >
          Download Android
        </Link>

        {user ? (
          <div className="userBadge" style={{ marginLeft: 6 }}>
            <span style={{ fontSize: "0.82rem", color: "var(--muted)" }}>
              {user.email ? user.email : "Signed in"}
            </span>
            <SignOutButton />
          </div>
        ) : (
          <Link
            href="/login"
            className="navLink"
            aria-current={current === "login" ? "page" : undefined}
          >
            Sign in
          </Link>
        )}
      </nav>
    </header>
  );
}
