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
