import Link from "next/link";
import { SiteNav } from "./components/site-nav";
import { getLatestVerifiedArtifact } from "../lib/download-artifact";
export const dynamic = "force-static";
export default function HomePage(){const artifact=getLatestVerifiedArtifact();return <main className="shell">
 <SiteNav current="home"/>
 <section className="hero" aria-labelledby="home-title"><div className="heroCopy">
  <img className="brandHeroLogo" src="/brand/companion.svg" width="64" height="64" alt=""/>
  <p className="eyebrow">ME+ 2.0 · YOUR DAY, WITH DIRECTION</p><h1 id="home-title">A calmer day.<br/><span>One useful next step.</span></h1>
  <p className="lede">Bring your priorities, plans and personal context together. Choose what matters now, capture a thought, and reflect on what you actually did.</p>
  <div className="heroActions"><Link href="/today" className="primaryButton">Open Today <span aria-hidden="true">→</span></Link><Link href="/download" className="secondaryButton">Get the Android app</Link></div>
  <div className="trustRow"><span>Clear priorities</span><span>Confirmed progress</span><span>You stay in control</span></div>
 </div><div className="workspacePreview" aria-label="Me+ workspace overview, illustrative only">
  <div className="previewHeading"><img src="/brand/companion.svg" width="48" height="48" alt=""/><div><strong>A little more clarity.</strong><small>Today · Plan · Capture · Review</small></div></div>
  <div className="previewFocus"><p className="eyebrow">NOW</p><h2>Make room for what matters.</h2><p>Your signed-in Today view uses your available actions and calendar context to suggest a next step.</p></div>
  <div className="previewRow"><span>01</span> See priorities in Today</div><div className="previewRow"><span>02</span> Keep a thought in Capture</div><div className="previewRow"><span>03</span> Review confirmed decisions</div><p className="previewLabel">An overview of the workspace. Sign in to see your own records.</p>
 </div></section>
 <section aria-labelledby="workspace-title"><div className="sectionHeading"><div><p className="eyebrow">ONE CONNECTED WORKSPACE</p><h2 id="workspace-title">Start where you are.</h2></div><p>The same light, focused Me+ 2.0 experience across phone and web.</p></div>
 <div className="featureGrid">{[["today","Today & Plan","Find the next useful action and see the priorities available to you."],["capture","Quick capture","Save a personal note with a confirmed receipt. Turn it into action when you choose."],["review","Daily review","Look back at recorded decisions and progress without invented scores."]].map(([path,title,copy])=><article className="appCard" key={path}><h3>{title}</h3><p style={{color:'var(--muted)'}}>{copy}</p><Link className="textLink" href={`/${path}`}>Open {path} →</Link></article>)}</div></section>
 <section className="closingFrame"><div><p className="eyebrow">ME+ ON ANDROID</p><h2 style={{marginBottom:8}}>Your companion, on your phone.</h2><p style={{color:'var(--muted)',marginBottom:0}}>Health Connect sync, personal priorities and quick capture.{artifact?` Current development build: ${artifact.version} (build ${artifact.versionCode}).`:''}</p></div><Link href="/download" className="primaryButton">Download Android</Link></section>
 <footer className="siteFooter"><div><strong className="footerBrand">Me+</strong><span>Personal intelligence, with you in control.</span></div><nav aria-label="Footer navigation"><Link href="/download">Android download</Link><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link></nav></footer>
 </main>}
