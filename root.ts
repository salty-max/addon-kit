/**
 * The family folder (~/code/wow-addons, the one holding addon-kit/ and
 * wow-data/), found from anywhere, a worktree outside it included:
 *
 *   1. WOW_ADDONS_ROOT, when set (an error if it isn't a family folder);
 *   2. up from the working directory;
 *   3. up from the repository's main checkout (git's common dir: a worktree
 *      anywhere on the disk still belongs to ~/code/wow-addons/<repo>/.git);
 *   4. up from this file.
 *
 *   bun addon-kit/root.ts            the family folder
 *   bun addon-kit/root.ts wow-data   a folder in it
 *   bun scripts/root.ts --run addon-kit/sync.ts --check addon/X
 *                                    a script of the family run with bun, its
 *                                    exit code kept (an error, never a silent
 *                                    `bun ""`, when there is no family folder)
 *
 *   import { familyPath } from "./root";   (an addon's scripts/root.ts, the kit's copy)
 *   familyPath("wow-data", "src")
 *
 * root.py is its twin for the Python scripts (the same order, the same
 * answers). kit:sync copies both into an addon's scripts/ (sync.ts): a
 * worktree can't reach the kit before it knows where the family folder is.
 */
import { existsSync, statSync } from "node:fs";
import { constants as osConstants } from "node:os";
import { dirname, join, resolve } from "node:path";

const isDir = (p: string) => existsSync(p) && statSync(p).isDirectory();

export function isFamily(dir: string): boolean {
  return isDir(join(dir, "addon-kit")) && isDir(join(dir, "wow-data"));
}

export function findUp(from: string): string | undefined {
  let dir = resolve(from);
  for (;;) {
    if (isFamily(dir)) return dir;
    const up = dirname(dir);
    if (up === dir) return undefined;
    dir = up;
  }
}

function commonDir(from: string): string | undefined {
  if (!isDir(from)) return undefined;
  const p = Bun.spawnSync(["git", "rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd: from, stderr: "ignore" });
  return p.exitCode === 0 ? p.stdout.toString().trim() : undefined;
}

export function familyRoot(from: string = process.cwd()): string {
  const env = process.env.WOW_ADDONS_ROOT;
  if (env) {
    if (isFamily(env)) return resolve(env);
    throw new Error(`WOW_ADDONS_ROOT=${env} holds no addon-kit/ and wow-data/`);
  }
  const common = commonDir(from);
  const found = findUp(from) ?? (common && findUp(dirname(common))) ?? findUp(import.meta.dir);
  if (found) return found;
  throw new Error(`no family folder (addon-kit/ and wow-data/ side by side) above ${from}: set WOW_ADDONS_ROOT`);
}

export const familyPath = (...parts: string[]) => join(familyRoot(), ...parts);

if (import.meta.main) {
  const args = process.argv.slice(2);
  try {
    if (args[0] === "--run") {
      const [script, ...rest] = args.slice(1);
      if (!script) throw new Error("usage: root.ts --run <a script in the family folder> [args...]");
      const path = familyPath(script);
      if (!existsSync(path)) throw new Error(`${path}: no such script`);
      const run = Bun.spawnSync([process.execPath, path, ...rest], { stdio: ["inherit", "inherit", "inherit"] });
      // (a script killed by a signal exits as a shell says it: 128 and the signal's number)
      const signal = run.signalCode ? osConstants.signals[run.signalCode as keyof typeof osConstants.signals] : undefined;
      process.exit(run.exitCode ?? (signal ? 128 + signal : 1));
    }
    console.log(familyPath(...args));
  } catch (e) {
    console.error((e as Error).message);
    process.exit(1);
  }
}
