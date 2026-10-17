import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import test from "node:test";
import {
  compareSemver,
  formatBytes,
  getLatestVerifiedArtifact,
  parseSemver,
  validateReleaseMetadata,
  verifyArtifactFile,
} from "../apps/web/lib/download-artifact.ts";

const VALID_SAMPLE_META = {
  app: "me-plus",
  platform: "android",
  architecture: "arm64-v8a",
  version: "0.3.1",
  displayVersion: "0.3.1",
  filename: "me-plus-0.3.1.apk",
  sha256: "0b2ea0577b39bbf0a6b5f561fc49327cf50feadde827714aa71e7e60521f7c6b",
  signerCertificateSha256: "fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c",
  embeddedJavascriptBundle: true,
  upgradeSignerVerified: true,
  sizeBytes: 44362126,
  packageName: "app.meplus.mobile",
  versionCode: 4,
  buildType: "release",
  sourceCommit: "0cb985a9af41acf0d42d5931f4ec913b5fd8938c",
  publicDownloadPath: "/downloads/me-plus-0.3.1.apk",
};

test("validateReleaseMetadata validates required fields and exact shape", () => {
  const parsed = validateReleaseMetadata(VALID_SAMPLE_META);
  assert.ok(parsed);
  assert.equal(parsed.version, "0.3.1");
  assert.equal(parsed.versionCode, 4);
  assert.equal(parsed.filename, "me-plus-0.3.1.apk");
  assert.equal(parsed.sha256, "0b2ea0577b39bbf0a6b5f561fc49327cf50feadde827714aa71e7e60521f7c6b");
});

test("validateReleaseMetadata rejects invalid architecture, unstable semver, and missing signature flags", () => {
  // Reject x86 architecture
  assert.equal(
    validateReleaseMetadata({ ...VALID_SAMPLE_META, architecture: "x86_64" }),
    null,
  );

  // Reject unstable or pre-release semver
  assert.equal(
    validateReleaseMetadata({ ...VALID_SAMPLE_META, version: "0.4.0-beta.1" }),
    null,
  );
  assert.equal(
    validateReleaseMetadata({ ...VALID_SAMPLE_META, version: "v0.3.1" }),
    null,
  );

  // Reject unverified upgrade signer
  assert.equal(
    validateReleaseMetadata({ ...VALID_SAMPLE_META, upgradeSignerVerified: false }),
    null,
  );

  // Reject missing embedded Javascript bundle flag
  assert.equal(
    validateReleaseMetadata({ ...VALID_SAMPLE_META, embeddedJavascriptBundle: false }),
    null,
  );

  // Reject unsafe / corrupt file size bounds (<10MB or >250MB)
  assert.equal(
    validateReleaseMetadata({ ...VALID_SAMPLE_META, sizeBytes: 1024 }),
    null,
  );
  assert.equal(
    validateReleaseMetadata({ ...VALID_SAMPLE_META, sizeBytes: 500 * 1024 * 1024 }),
    null,
  );

  // Reject invalid sha256
  assert.equal(
    validateReleaseMetadata({ ...VALID_SAMPLE_META, sha256: "not-a-sha256" }),
    null,
  );
});

test("validateReleaseMetadata rejects path traversal and mismatched filename patterns", () => {
  // Filename doesn't match version
  assert.equal(
    validateReleaseMetadata({
      ...VALID_SAMPLE_META,
      filename: "me-plus-0.4.0.apk",
    }),
    null,
  );

  // Directory traversal in filename
  assert.equal(
    validateReleaseMetadata({
      ...VALID_SAMPLE_META,
      filename: "../me-plus-0.3.1.apk",
    }),
    null,
  );
  assert.equal(
    validateReleaseMetadata({
      ...VALID_SAMPLE_META,
      filename: "me-plus-0.3.1.apk/malicious",
    }),
    null,
  );
});

test("semver comparison orders releases correctly", () => {
  assert.equal(compareSemver("0.3.1", "0.3.0") > 0, true);
  assert.equal(compareSemver("0.4.0", "0.3.1") > 0, true);
  assert.equal(compareSemver("0.3.1", "0.3.1"), 0);
  assert.equal(compareSemver("0.2.9", "0.3.0") < 0, true);
  assert.deepEqual(parseSemver("0.3.1"), [0, 3, 1]);
});

test("formatBytes formats file sizes correctly", () => {
  assert.equal(formatBytes(44362126), "42.3 MB");
  assert.equal(formatBytes(1048576), "1.0 MB");
  assert.equal(formatBytes(0), "0 B");
});

test("real repository check: committed 0.3.1 bytes and checksum match provenance", () => {
  const raw = fs.readFileSync(path.join(process.cwd(), "releases/android/0.3.1.json"),"utf8").replace(/^\uFEFF/, "");
  const artifact = verifyArtifactFile(validateReleaseMetadata(JSON.parse(raw)),path.join(process.cwd(), "apps/web/public/downloads"));
  assert.ok(artifact, "Committed 0.3.1 release must be verified and returned");
  assert.equal(artifact.version, "0.3.1");
  assert.equal(artifact.versionCode, 4);
  assert.equal(artifact.filename, "me-plus-0.3.1.apk");
  assert.equal(
    artifact.sha256,
    "0b2ea0577b39bbf0a6b5f561fc49327cf50feadde827714aa71e7e60521f7c6b",
  );
  assert.equal(artifact.sizeBytes, 44362126);
  assert.equal(artifact.verified, true);
});

test("synthetic fixture: verifyArtifactFile detects missing file, size mismatch, and hash tampering", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "meplus-test-downloads-"));
  try {
    // 1. Missing file fails
    const resMissing = verifyArtifactFile(VALID_SAMPLE_META, tempDir);
    assert.equal(resMissing, null, "Must fail when APK file does not exist on disk");

    // 2. Size mismatch fails
    const fakeContent = Buffer.alloc(11 * 1024 * 1024, 0xaa); // 11MB
    const targetFile = path.join(tempDir, VALID_SAMPLE_META.filename);
    fs.writeFileSync(targetFile, fakeContent);

    // Meta expects 44362126 bytes
    const resSizeMismatch = verifyArtifactFile(VALID_SAMPLE_META, tempDir);
    assert.equal(resSizeMismatch, null, "Must fail when file size does not match metadata");

    // 3. Hash mismatch fails (matching size, but corrupted content)
    const testSize = 12 * 1024 * 1024;
    const testBuf = Buffer.alloc(testSize, 0xbb);
    fs.writeFileSync(targetFile, testBuf);
    const testMeta = {
      ...VALID_SAMPLE_META,
      sizeBytes: testSize,
      sha256: "0000000000000000000000000000000000000000000000000000000000000000",
    };
    const resHashMismatch = verifyArtifactFile(testMeta, tempDir);
    assert.equal(resHashMismatch, null, "Must fail when hash does not match computed bytes");

    // 4. Exact matching bytes and hash succeeds
    const correctHash = crypto.createHash("sha256").update(testBuf).digest("hex");
    const validTestMeta = {
      ...testMeta,
      sha256: correctHash,
    };
    fs.writeFileSync(targetFile + ".sha256", `${correctHash}  ${validTestMeta.filename}\n`);
    const resValid = verifyArtifactFile(validTestMeta, tempDir);
    assert.ok(resValid, "Must succeed when size and hash exactly match");
    assert.equal(resValid.version, "0.3.1");
    assert.equal(resValid.verified, true);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("synthetic fixture: newer version without verified APK falls back to latest verified semver", () => {
  const tempReleasesDir = fs.mkdtempSync(path.join(os.tmpdir(), "meplus-test-releases-"));
  const tempDownloadsDir = fs.mkdtempSync(path.join(os.tmpdir(), "meplus-test-downloads-"));

  try {
    // Write 0.3.1 verified release
    const size31 = 12 * 1024 * 1024;
    const buf31 = Buffer.alloc(size31, 0x31);
    const hash31 = crypto.createHash("sha256").update(buf31).digest("hex");
    fs.writeFileSync(path.join(tempDownloadsDir, "me-plus-0.3.1.apk"), buf31);

    fs.writeFileSync(path.join(tempDownloadsDir, "me-plus-0.3.1.apk.sha256"), `${hash31}  me-plus-0.3.1.apk\n`);
    const meta31 = {
      ...VALID_SAMPLE_META,
      version: "0.3.1",
      filename: "me-plus-0.3.1.apk",
      sizeBytes: size31,
      sha256: hash31,
      publicDownloadPath: "/downloads/me-plus-0.3.1.apk",
    };
    fs.writeFileSync(
      path.join(tempReleasesDir, "0.3.1.json"),
      "\uFEFF" + JSON.stringify(meta31),
    );

    // Write a hypothetical 0.4.0 release metadata whose APK file is missing / not yet built!
    const meta40 = {
      ...VALID_SAMPLE_META,
      version: "0.4.0",
      versionCode: 5,
      filename: "me-plus-0.4.0.apk",
      sizeBytes: 15 * 1024 * 1024,
      sha256: "1111111111111111111111111111111111111111111111111111111111111111",
      publicDownloadPath: "/downloads/me-plus-0.4.0.apk",
    };
    fs.writeFileSync(
      path.join(tempReleasesDir, "0.4.0.json"),
      JSON.stringify(meta40),
    );

    // Call getLatestVerifiedArtifact on the synthetic dirs
    const selected = getLatestVerifiedArtifact(tempReleasesDir, tempDownloadsDir);
    assert.ok(selected, "Must find and return verified release");
    // Must select 0.3.1, NOT nonexistent 0.4.0!
    assert.equal(selected.version, "0.3.1", "0.3.1 must remain available when 0.4.0 APK is missing");
    assert.equal(selected.filename, "me-plus-0.3.1.apk");
    assert.equal(selected.verified, true);
  } finally {
    fs.rmSync(tempReleasesDir, { recursive: true, force: true });
    fs.rmSync(tempDownloadsDir, { recursive: true, force: true });
  }
});


test("metadata rejects noncanonical versions, wrong package and nonnumeric version codes",()=>{
 for(const patch of [{version:"00.3.1"},{versionCode:"6"},{packageName:"other.package"},{versionCode:2100000001}]) {
  assert.equal(validateReleaseMetadata({...VALID_SAMPLE_META,...patch}),null);
 }
});
