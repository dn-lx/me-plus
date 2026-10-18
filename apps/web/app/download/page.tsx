import type { Metadata } from "next";
import Link from "next/link";
import { SiteNav } from "../components/site-nav";
import { getLatestVerifiedArtifact } from "../../lib/download-artifact";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Download Android APK · Me+",
  description: "Download the verified Me+ Android application package.",
};

export default function DownloadPage() {
  const artifact = getLatestVerifiedArtifact();

  return (
    <main className="shell">
      <SiteNav current="download" />

      <header className="hero downloadHero">
        <div className="heroCopy" style={{ paddingBottom: 0 }}>
          <p className="eyebrow">ANDROID RELEASE</p>
          <h1>Download Me+</h1>
          <p className="lede">
            Install the native Me+ Android client directly on your 64-bit Android device.
            Every build is signed, verified, and distributed with cryptographic checksums.
          </p>
        </div>
      </header>

      {artifact ? (
        <section className="appCard" aria-labelledby="artifact-heading">
          <div className="nowEyebrow">
            <span className="statusDot" aria-hidden="true" />
            Verified Android build
          </div>
          <h2 id="artifact-heading" className="nowTitle">
            Me+ {artifact.version}
          </h2>
          <p style={{ color: "var(--soft)", marginBottom: 20 }}>
            Signed Android installer. Check the version below before updating.
          </p>

          <div style={{ marginBottom: 28 }}>
            <a
              className="primaryButton"
              href={artifact.downloadPath}
              download={artifact.filename}
              aria-label={`Download ${artifact.filename} (${artifact.sizeFormatted})`}
              style={{ fontSize: "1rem", minHeight: 52, padding: "14px 24px" }}
            >
              Download {artifact.filename}
              <span aria-hidden="true">↓</span>
            </a>
          </div>

          <div className="specGrid">
            <div className="specItem">
              <div className="specLabel">Version</div>
              <div className="specValue">
                {artifact.version} (build {artifact.versionCode})
              </div>
            </div>
            <div className="specItem">
              <div className="specLabel">Architecture</div>
              <div className="specValue">{artifact.architecture}</div>
            </div>
            <div className="specItem">
              <div className="specLabel">File Size</div>
              <div className="specValue">
                {artifact.sizeFormatted} ({artifact.sizeBytes.toLocaleString()} bytes)
              </div>
            </div>
            <div className="specItem">
              <div className="specLabel">OS Requirement</div>
              <div className="specValue">{artifact.androidMinVersion}</div>
            </div>
            <div className="specItem">
              <div className="specLabel">Package Name</div>
              <div className="specValue">{artifact.packageName}</div>
            </div>
            <div className="specItem">
              <div className="specLabel">Source Commit</div>
              <div className="specValue" style={{ fontFamily: "monospace" }}>
                {artifact.sourceCommit.slice(0, 10)}
              </div>
            </div>
          </div>

          <div style={{ marginTop: 24 }}>
            <div className="specLabel">SHA-256 Integrity Checksum</div>
            <div
              className="codeBox"
              aria-label="SHA-256 Checksum"
              tabIndex={0}
              role="region"
            >
              {artifact.sha256}
            </div>
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center" }}>
              <a
                className="textLink"
                href={`${artifact.downloadPath}.sha256`}
                download={`${artifact.filename}.sha256`}
              >
                Download checksum file (.sha256)
              </a>
            </div>
          </div>

          <div style={{ marginTop: 32, borderTop: "1px solid var(--line)", paddingTop: 24 }}>
            <h3 style={{ fontSize: "1.1rem", marginBottom: 12 }}>Installation Instructions</h3>
            <ol className="stepList">
              <li>
                <strong>Download APK:</strong> Tap the download button above on your Android phone.
              </li>
              <li>
                <strong>Allow Unknown Sources:</strong> If your browser prompts you, tap Settings and allow
                installing apps from this browser.
              </li>
              <li>
                <strong>Install or Update:</strong> Open the downloaded file from your notifications or
                Downloads folder and confirm the installation. Use the update option when Android offers it; keep the existing app installed.
              </li>
              <li>
                <strong>Verify Integrity (Optional):</strong> Verify that the SHA-256 hash matches the string
                above using a checksum utility or terminal before installation.
              </li>
            </ol>
          </div>
        </section>
      ) : (
        <section className="appCard calmAlert" role="alert">
          <h2 style={{ fontSize: "1.2rem", marginBottom: 8, color: "#a12836" }}>
            Android Package Unavailable
          </h2>
          <p style={{ margin: 0 }}>
            A verified Android release package matching current integrity requirements is not currently
            available for download. No unverified or speculative artifacts will be offered.
          </p>
        </section>
      )}

      <footer className="siteFooter" style={{ marginTop: 56 }}>
        <div>
          <span className="footerBrand">Me+</span>
          <span>Private personal intelligence.</span>
        </div>
        <nav aria-label="Footer navigation">
          <Link href="/">Home</Link>
          <Link href="/today">Today</Link>
          <Link href="/review">Daily Review</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
        </nav>
      </footer>
    </main>
  );
}
