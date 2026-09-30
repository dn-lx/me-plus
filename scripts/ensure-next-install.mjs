import { accessSync, constants, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

export function hasNextLauncher(root) {
  try {
    const target = realpathSync(join(root, "node_modules", ".bin", "next"));
    accessSync(target, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  if (!hasNextLauncher(root)) {
    console.error("Next.js launcher is missing after dependency restore; repairing the install.");
    const repair = spawnSync("pnpm", ["install", "--force", "--frozen-lockfile"], {
      cwd: root,
      stdio: "inherit",
    });
    if (repair.error || repair.status !== 0 || !hasNextLauncher(root)) {
      console.error("Next.js launcher remains unavailable after reinstall.");
      process.exit(1);
    }
  }
}
