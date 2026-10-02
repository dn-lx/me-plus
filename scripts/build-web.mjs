import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { resolveNextBinary } from "./ensure-next-install.mjs";

export function nextBuildInvocation(root) {
  return {
    command: process.execPath,
    args: [resolveNextBinary(root), "build"],
    cwd: join(root, "apps", "web"),
  };
}

export function runNextBuild(root) {
  const invocation = nextBuildInvocation(root);
  return spawnSync(invocation.command, invocation.args, {
    cwd: invocation.cwd,
    stdio: "inherit",
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const result = runNextBuild(root);

  if (result.error) {
    console.error("Unable to start Next.js build:", result.error);
    process.exit(1);
  }

  process.exit(result.status ?? 1);
}
