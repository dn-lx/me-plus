import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { nextBuildInvocation } from "../scripts/build-web.mjs";
import { hasNextLauncher, resolveNextBinary } from "../scripts/ensure-next-install.mjs";

function writeFakeNextPackage(root) {
  const nextRoot = join(root, "node_modules", "next");
  mkdirSync(join(nextRoot, "dist", "bin"), { recursive: true });
  writeFileSync(
    join(nextRoot, "package.json"),
    JSON.stringify({ name: "next", version: "0.0.0-test" }),
  );
  writeFileSync(join(nextRoot, "dist", "bin", "next"), "#!/usr/bin/env node\n");
}

test("a cached launcher with a missing Next.js target triggers repair", () => {
  const root = mkdtempSync(join(tmpdir(), "me-plus-next-"));
  try {
    const bin = join(root, "node_modules", ".bin");
    mkdirSync(bin, { recursive: true });
    symlinkSync("../next/dist/bin/next", join(bin, "next"));
    assert.equal(hasNextLauncher(root), false);

    writeFakeNextPackage(root);
    assert.equal(hasNextLauncher(root), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a broken web workspace launcher triggers repair even with a healthy root launcher", () => {
  const root = mkdtempSync(join(tmpdir(), "me-plus-next-workspace-"));
  try {
    const rootBin = join(root, "node_modules", ".bin");
    mkdirSync(rootBin, { recursive: true });
    writeFakeNextPackage(root);
    symlinkSync("../next/dist/bin/next", join(rootBin, "next"));
    assert.equal(hasNextLauncher(root), true);

    const workspaceBin = join(root, "apps", "web", "node_modules", ".bin");
    mkdirSync(workspaceBin, { recursive: true });
    symlinkSync("../missing-next/dist/bin/next", join(workspaceBin, "next"));
    assert.equal(hasNextLauncher(root), false);

    const workspaceTarget = join(
      root,
      "apps",
      "web",
      "node_modules",
      "missing-next",
      "dist",
      "bin",
      "next",
    );
    mkdirSync(
      join(root, "apps", "web", "node_modules", "missing-next", "dist", "bin"),
      { recursive: true },
    );
    writeFileSync(workspaceTarget, "#!/usr/bin/env node\n");
    assert.equal(hasNextLauncher(root), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a readable pnpm shim does not hide a missing Next.js package CLI", () => {
  const root = mkdtempSync(join(tmpdir(), "me-plus-next-shim-"));
  try {
    const bin = join(root, "node_modules", ".bin");
    mkdirSync(bin, { recursive: true });
    writeFileSync(
      join(bin, "next"),
      '#!/bin/sh\nnode "../.pnpm/next@broken/node_modules/next/dist/bin/next" "$@"\n',
    );

    assert.equal(hasNextLauncher(root), false);

    writeFakeNextPackage(root);
    assert.equal(hasNextLauncher(root), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("web build invokes the resolved Next.js CLI directly instead of a pnpm bin shim", () => {
  const root = mkdtempSync(join(tmpdir(), "me-plus-next-direct-"));
  try {
    writeFakeNextPackage(root);

    const expectedCli = join(root, "node_modules", "next", "dist", "bin", "next");
    assert.equal(resolveNextBinary(root), expectedCli);

    const invocation = nextBuildInvocation(root);
    assert.equal(invocation.command, process.execPath);
    assert.deepEqual(invocation.args, [expectedCli, "build"]);
    assert.equal(invocation.cwd, join(root, "apps", "web"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
