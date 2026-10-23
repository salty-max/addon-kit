/**
 * The family's git hooks (githooks/: commit-msg refuses an AI co-author or a
 * "generated with" line, pre-push a tree with no passing check), put in a
 * repository by pointing its core.hooksPath at them. A hooks folder the
 * repository had (husky's .husky/_, .git/hooks) is kept in harness.chain and
 * still runs after ours.
 *
 *   bun addon-kit/hooks.ts status                  every repository: its hooks, HEAD's check
 *   bun addon-kit/hooks.ts install <repo...>       folder names of the family or paths
 *   bun addon-kit/hooks.ts install --all           every repository
 *   bun addon-kit/hooks.ts uninstall <repo...>     its hooks as they were
 *
 * husky's prepare script (`bun install`) points core.hooksPath back at
 * .husky/_: status says so, install again. install does nothing in CI (CI
 * set): a job's push has no check stamp to show.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { headTree, stampOf } from "./q";
import { familyRoot } from "./root";

export const HOOKS = join(import.meta.dir, "githooks");

function git(cwd: string, ...args: string[]): string | undefined {
  const p = Bun.spawnSync(["git", ...args], { cwd, stderr: "ignore" });
  return p.exitCode === 0 ? p.stdout.toString().trim() : undefined;
}

export function repos(): string[] {
  const root = familyRoot();
  return readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(root, d.name, ".git")))
    .map((d) => join(root, d.name))
    .sort();
}

const target = (name: string) => (isAbsolute(name) || name.startsWith(".") ? resolve(name) : join(familyRoot(), name));

// The hooks a repository had before ours: its own hooksPath, else .git/hooks
// when it holds a hook that isn't a sample.
function previous(dir: string): string | undefined {
  const path = git(dir, "config", "--get", "core.hooksPath");
  if (path) return path;
  const own = join(git(dir, "rev-parse", "--path-format=absolute", "--git-common-dir")!, "hooks");
  const real = existsSync(own) && readdirSync(own).some((f) => !f.endsWith(".sample") && statSync(join(own, f)).mode & 0o111);
  return real ? own : undefined;
}

export type State = { dir: string; ours: boolean; hooksPath?: string; chain?: string; husky: boolean; checked?: boolean };

export function state(dir: string): State {
  const hooksPath = git(dir, "config", "--get", "core.hooksPath");
  const pkg = join(dir, "package.json");
  const tree = headTree(dir);
  return {
    dir,
    ours: !!hooksPath && resolve(dir, hooksPath) === HOOKS,
    hooksPath,
    chain: git(dir, "config", "--get", "harness.chain"),
    husky: existsSync(pkg) && /"prepare"\s*:\s*"[^"]*husky/.test(readFileSync(pkg, "utf8")),
    checked: tree ? !!stampOf(dir, tree) : undefined,
  };
}

export function install(dir: string): string {
  // (never in CI: a job has no check stamp, so the pre-push gate would refuse
  // its pushes; its own check and the pull request's checks gate it there)
  if (process.env.CI) return `${dir}: skipped in CI`;
  if (!existsSync(join(dir, ".git"))) return `${dir}: not a repository`;
  if (state(dir).ours) return `${dir}: already`;
  const prev = previous(dir);
  if (prev) git(dir, "config", "harness.chain", prev);
  git(dir, "config", "core.hooksPath", HOOKS);
  return `${dir}: installed${prev ? `, its own ${prev} chained` : ""}`;
}

export function uninstall(dir: string): string {
  const s = state(dir);
  if (!s.ours) return `${dir}: not installed`;
  const common = git(dir, "rev-parse", "--path-format=absolute", "--git-common-dir");
  if (s.chain && s.chain !== join(common!, "hooks")) git(dir, "config", "core.hooksPath", s.chain);
  else git(dir, "config", "--unset", "core.hooksPath");
  git(dir, "config", "--unset", "harness.chain");
  return `${dir}: uninstalled${s.chain ? `, ${s.chain} back` : ""}`;
}

function status(dirs: string[]) {
  const root = familyRoot();
  const name = (d: string) => (d.startsWith(root + "/") ? d.slice(root.length + 1) : d);
  const w = Math.max(...dirs.map((d) => name(d).length));
  for (const d of dirs) {
    const s = state(d);
    const hooks = s.ours ? `hooks ✓${s.chain ? ` (then ${s.chain})` : ""}` : s.hooksPath ? `hooks: ${s.hooksPath}${s.husky ? " (husky's: install again)" : ""}` : "hooks –";
    const check = s.checked === undefined ? "" : s.checked ? "HEAD checked ✓" : "HEAD unchecked";
    console.log(`${name(d).padEnd(w)}  ${check.padEnd(14)}  ${hooks}`);
  }
}

if (import.meta.main) {
  const [cmd, ...rest] = process.argv.slice(2);
  const dirs = rest.includes("--all") ? repos() : rest.map(target);
  if (cmd === "status") status(rest.length ? dirs : repos());
  else if ((cmd === "install" || cmd === "uninstall") && dirs.length) for (const d of dirs) console.log((cmd === "install" ? install : uninstall)(d));
  else {
    console.error("usage: bun hooks.ts status [repo...] | install <repo...|--all> | uninstall <repo...|--all>");
    process.exit(2);
  }
}
