import { spawnSync } from "node:child_process";
import { accessSync, constants, lstatSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function resolveNextBinary(root) {
  const webRequire = createRequire(join(root, "apps", "web", "package.json"));
  const nextPackageJson = webRequire.resolve("next/package.json");
  return join(dirname(nextPackageJson), "dist", "bin", "next");
}

export function hasNextLauncher(root) {
  const workspaceLauncher = join(root, "apps", "web", "node_modules", ".bin", "next");
  const rootLauncher = join(root, "node_modules", ".bin", "next");

  // pnpm may link the executable in the workspace or at the hoisted root.
  // A stale workspace launcher wins during filtered package scripts.
  let launcher = rootLauncher;
  try {
    lstatSync(workspaceLauncher);
    launcher = workspaceLauncher;
  } catch {
    // No workspace launcher exists; pnpm will use the root one.
  }

  try {
    accessSync(realpathSync(launcher), constants.R_OK);
    accessSync(realpathSync(resolveNextBinary(root)), constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  if (!hasNextLauncher(root)) {
    console.error(
      "Next.js launcher or package CLI is missing after dependency restore; repairing the install.",
    );
    const repair = spawnSync("pnpm", ["install", "--force", "--frozen-lockfile"], {
      cwd: root,
      stdio: "inherit",
    });
    if (repair.error || repair.status !== 0 || !hasNextLauncher(root)) {
      console.error("Next.js package CLI remains unavailable after reinstall.");
      process.exit(1);
    }
  }
}
