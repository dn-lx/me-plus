import Link from "next/link";
import { SignOutButton } from "./sign-out-button";
export type NavPage = "home" | "today" | "plan" | "capture" | "review" | "more" | "download" | "login" | "privacy" | "terms";
const links = [["today", "Today"], ["plan", "Plan"], ["capture", "Capture"], ["review", "Review"], ["more", "More"]] as const;
export function SiteNav({ current, user }: {
    current?: NavPage;
    user?: {
        email?: string | null;
    } | null;
}) {
    return <header className="topbar">
  <Link href="/" className="brand" aria-label="Me+ home"><img className="brandMark" src="/brand/companion.svg" width="44" height="44" alt=""/><span>Me+<small>Your personal companion</small></span></Link>
  <nav className="navLinks" aria-label="Main navigation">{links.map(([path, label]) => <Link key={path} href={`/${path}`} className="navLink" aria-current={current === path ? 'page' : undefined}>{label}</Link>)}
   {user ? <div className="userBadge"><span style={{ fontSize: '.78rem', color: 'var(--muted)' }}>{user.email ?? 'Signed in'}</span><SignOutButton /></div> : <Link href="/login" className="navLink navAuth" aria-current={current === 'login' ? 'page' : undefined}>Sign in</Link>}
  </nav>
 </header>;
}
