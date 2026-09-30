import { accessSync, constants, lstatSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

export function hasNextLauncher(root) {
  const workspaceLauncher = join(root, "apps", "web", "node_modules", ".bin", "next");
  const rootLauncher = join(root, "node_modules", ".bin", "next");

  // pnpm may link the executable in the workspace or at the hoisted root.
  // A stale workspace symlink wins during `pnpm --filter @me-plus/web build`,
  // even if the root launcher still points to a healthy Next.js install.
  let launcher = rootLauncher;
  try {
    lstatSync(workspaceLauncher);
    launcher = workspaceLauncher;
  } catch {
    // No workspace launcher exists; pnpm will use the root one.
  }
  try {
    const target = realpathSync(launcher);
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
