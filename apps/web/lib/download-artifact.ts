import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export type ReleaseMetadata = {
  app: string;
  platform: string;
  architecture: string;
  version: string;
  displayVersion?: string;
  filename: string;
  sha256: string;
  signerCertificateSha256: string;
  embeddedJavascriptBundle: boolean;
  upgradeSignerVerified: boolean;
  sizeBytes: number;
  packageName: string;
  versionCode: number;
  buildType?: string;
  pnpmVersion?: string;
  ninjaVersion?: string;
  cmakeVersion?: string;
  ndkVersion?: string;
  sourceCommit: string;
  githubRunId?: string;
  githubRunAttempt?: string;
  buildPath?: string;
  runnerName?: string;
  publishTarget?: string;
  publicDownloadPath: string;
};

export type DownloadArtifact = {
  version: string;
  displayVersion: string;
  versionCode: number;
  filename: string;
  downloadPath: string;
  sha256: string;
  signerCertificateSha256: string;
  sizeBytes: number;
  sizeFormatted: string;
  architecture: string;
  sourceCommit: string;
  verified: boolean;
  androidMinVersion: string;
  packageName: string;
};

const HEX_64_REGEX = /^[0-9a-f]{64}$/i;
const HEX_40_REGEX = /^[0-9a-f]{40}$/i;
const STABLE_SEMVER_REGEX = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export function parseSemver(v: string): [number, number, number] | null {
  const match = STABLE_SEMVER_REGEX.exec(v);
  if (!match) return null;
  const parts = v.split(".").map(Number);
  if (!parts.every(Number.isSafeInteger)) return null;
  return [parts[0]!, parts[1]!, parts[2]!];
}

export function compareSemver(a: string, b: string): number {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  if (!pa || !pb) return 0;
  if (pa[0] !== pb[0]) return pa[0] - pb[0];
  if (pa[1] !== pb[1]) return pa[1] - pb[1];
  return pa[2] - pb[2];
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const val = (bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1);
  return `${val} ${units[i]}`;
}

export function validateReleaseMetadata(input: unknown): ReleaseMetadata | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return null;
  }
  const meta = input as Record<string, unknown>;

  if (meta.app !== "me-plus") return null;
  if (meta.platform !== "android") return null;

  const arch = String(meta.architecture ?? "");
  if (!["arm64-v8a", "arm64"].includes(arch.toLowerCase())) return null;

  const version = String(meta.version ?? "");
  if (!parseSemver(version)) return null;
  if (meta.packageName !== "app.meplus.mobile") return null;

  const versionCode = meta.versionCode;
  if (typeof versionCode !== "number" || !Number.isInteger(versionCode) || versionCode <= 0 || versionCode > 2100000000) return null;

  const filename = String(meta.filename ?? "");
  if (filename !== `me-plus-${version}.apk`) return null;
  if (filename.includes("/") || filename.includes("\\") || filename.includes("..")) {
    return null;
  }

  const sha256 = String(meta.sha256 ?? "").toLowerCase();
  if (!HEX_64_REGEX.test(sha256)) return null;

  const signerCert = String(meta.signerCertificateSha256 ?? "").toLowerCase();
  if (!HEX_64_REGEX.test(signerCert)) return null;

  if (meta.upgradeSignerVerified !== true) return null;
  if (meta.embeddedJavascriptBundle !== true) return null;

  const sizeBytes = Number(meta.sizeBytes);
  // Safe size bounds: 10MB to 100MB
  if (
    !Number.isInteger(sizeBytes) ||
    sizeBytes < 10 * 1024 * 1024 ||
    sizeBytes > 100 * 1024 * 1024
  ) {
    return null;
  }

  const sourceCommit = String(meta.sourceCommit ?? "").toLowerCase();
  if (!HEX_40_REGEX.test(sourceCommit)) return null;

  const publicDownloadPath = String(meta.publicDownloadPath ?? "");
  if (publicDownloadPath !== `/downloads/${filename}`) return null;

  return {
    app: meta.app as string,
    platform: meta.platform as string,
    architecture: arch,
    version,
    displayVersion: version,
    filename,
    sha256,
    signerCertificateSha256: signerCert,
    embeddedJavascriptBundle: true,
    upgradeSignerVerified: true,
    sizeBytes,
    packageName: String(meta.packageName ?? "app.meplus.mobile"),
    versionCode,
    ...(typeof meta.buildType === "string" ? {buildType: meta.buildType} : {}),
    sourceCommit,
    ...(typeof meta.githubRunId === "string" ? {githubRunId: meta.githubRunId} : {}),
    publicDownloadPath,
  };
}

export function getDefaultReleasesDir(): string {
  const cwd = process.cwd();
  const c1 = path.resolve(cwd, "releases", "android");
  if (fs.existsSync(/* turbopackIgnore: true */ c1)) return c1;
  const c2 = path.resolve(cwd, "..", "..", "releases", "android");
  if (fs.existsSync(/* turbopackIgnore: true */ c2)) return c2;
  return c1;
}

export function getDefaultDownloadsDir(): string {
  const cwd = process.cwd();
  const c1 = path.resolve(cwd, "apps", "web", "public", "downloads");
  if (fs.existsSync(/* turbopackIgnore: true */ c1)) return c1;
  const c2 = path.resolve(cwd, "public", "downloads");
  if (fs.existsSync(/* turbopackIgnore: true */ c2)) return c2;
  return c2;
}

export function verifyArtifactFile(
  metadata: ReleaseMetadata,
  downloadsDir: string,
): DownloadArtifact | null {
  const resolvedDir = path.resolve(downloadsDir);
  const targetPath = path.resolve(resolvedDir, metadata.filename);

  // Safe path containment check: ensure targetPath is within resolvedDir
  if (
    !targetPath.startsWith(resolvedDir + path.sep) &&
    targetPath !== path.join(resolvedDir, metadata.filename)
  ) {
    return null;
  }

  if (!fs.existsSync(/* turbopackIgnore: true */ targetPath)) {
    return null;
  }

  let stat: fs.Stats;
  try {
    stat = fs.statSync(/* turbopackIgnore: true */ targetPath);
  } catch {
    return null;
  }

  if (stat.size !== metadata.sizeBytes) {
    return null;
  }

  let fileBuffer: Buffer;
  try {
    fileBuffer = fs.readFileSync(/* turbopackIgnore: true */ targetPath);
  } catch {
    return null;
  }

  try {
    const checksum = fs.readFileSync(/* turbopackIgnore: true */ targetPath + ".sha256", "utf8").trim().split(/\s+/);
    if (checksum[0]?.toLowerCase() !== metadata.sha256.toLowerCase() || checksum[1] !== metadata.filename) return null;
  } catch { return null; }

  const computedHash = crypto.createHash("sha256").update(fileBuffer).digest("hex").toLowerCase();
  if (computedHash !== metadata.sha256.toLowerCase()) {
    return null;
  }

  return {
    version: metadata.version,
    displayVersion: metadata.displayVersion ?? metadata.version,
    versionCode: metadata.versionCode,
    filename: metadata.filename,
    downloadPath: metadata.publicDownloadPath,
    sha256: metadata.sha256.toLowerCase(),
    signerCertificateSha256: metadata.signerCertificateSha256,
    sizeBytes: metadata.sizeBytes,
    sizeFormatted: formatBytes(metadata.sizeBytes),
    architecture: "ARM64 (arm64-v8a)",
    sourceCommit: metadata.sourceCommit,
    verified: true,
    androidMinVersion: "Android 8.0+ (Oreo, API 26+)",
    packageName: metadata.packageName,
  };
}

export function getLatestVerifiedArtifact(
  customReleasesDir?: string,
  customDownloadsDir?: string,
): DownloadArtifact | null {
  const releasesDir = customReleasesDir ?? getDefaultReleasesDir();
  const downloadsDir = customDownloadsDir ?? getDefaultDownloadsDir();

  if (!fs.existsSync(/* turbopackIgnore: true */ releasesDir)) {
    return null;
  }

  let entries: string[];
  try {
    entries = fs.readdirSync(/* turbopackIgnore: true */ releasesDir);
  } catch {
    return null;
  }

  const jsonFiles = entries.filter(
    (f) => f.endsWith(".json") && f !== "latest.json" && !f.startsWith("."),
  );

  const candidateMetas: ReleaseMetadata[] = [];
  for (const file of jsonFiles) {
    try {
      const fullPath = path.resolve(releasesDir, file);
      const raw = fs.readFileSync(/* turbopackIgnore: true */ fullPath, "utf-8");
      const parsed = JSON.parse(raw.replace(/^\uFEFF/, ""));
      const meta = validateReleaseMetadata(parsed);
      if (meta) {
        candidateMetas.push(meta);
      }
    } catch {}
  }

  if (candidateMetas.length === 0) {
    return null;
  }

  // Sort descending by semver: latest version first
  candidateMetas.sort((a, b) => compareSemver(b.version, a.version));

  for (const meta of candidateMetas) {
    const verified = verifyArtifactFile(meta, downloadsDir);
    if (verified) {
      return verified;
    }
  }

  return null;
}
