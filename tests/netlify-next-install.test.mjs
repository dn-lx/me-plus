import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { hasNextLauncher } from "../scripts/ensure-next-install.mjs";

test("a cached launcher with a missing Next.js target triggers repair", () => {
  const root = mkdtempSync(join(tmpdir(), "me-plus-next-"));
  try {
    const bin = join(root, "node_modules", ".bin");
    mkdirSync(bin, { recursive: true });
    symlinkSync("../next/dist/bin/next", join(bin, "next"));
    assert.equal(hasNextLauncher(root), false);

    const target = join(root, "node_modules", "next", "dist", "bin", "next");
    mkdirSync(join(root, "node_modules", "next", "dist", "bin"), { recursive: true });
    writeFileSync(target, "#!/usr/bin/env node\n");
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
    const rootTarget = join(root, "node_modules", "next", "dist", "bin", "next");
    mkdirSync(join(root, "node_modules", "next", "dist", "bin"), { recursive: true });
    writeFileSync(rootTarget, "#!/usr/bin/env node\n");
    symlinkSync("../next/dist/bin/next", join(rootBin, "next"));
    assert.equal(hasNextLauncher(root), true);

    const workspaceBin = join(root, "apps", "web", "node_modules", ".bin");
    mkdirSync(workspaceBin, { recursive: true });
    symlinkSync("../missing-next/dist/bin/next", join(workspaceBin, "next"));
    assert.equal(hasNextLauncher(root), false);

    const workspaceTarget = join(root, "apps", "web", "node_modules", "missing-next", "dist", "bin", "next");
    mkdirSync(join(root, "apps", "web", "node_modules", "missing-next", "dist", "bin"), { recursive: true });
    writeFileSync(workspaceTarget, "#!/usr/bin/env node\n");
    assert.equal(hasNextLauncher(root), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
