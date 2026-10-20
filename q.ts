/**
 * The quiet runner: a command's whole output kept in a log, one verdict line
 * printed, and on a failure the lines that matter (20 at most). The exit
 * code passes through, so `q.ts … | tail` is never needed and never hides
 * one. A passing `check` stamps the tree it ran on: the pre-push hook asks
 * for that stamp.
 *
 *   bun ../addon-kit/q.ts <name> -- <command...>
 *
 *   bun ../addon-kit/q.ts check -- bun run check   check: ok (41s) · stamped 3f2a1b9
 *   bun ../addon-kit/q.ts test -- bun test         test: FAILED (exit 1, 3s) · .cache/logs/test.log
 *                                                    (fail) the stamp > …
 *
 * The log: <repo>/.cache/logs/<name>.log, the command first, its exit last
 * (<repo>: the repository the command runs in; .cache/ is ignored by a
 * .gitignore of its own). The stamp: <git common dir>/harness/check-<tree>,
 * the tree of the working directory as the check found it (tracked and
 * untracked files, the ignored left out), shared by the repository's
 * worktrees: a commit of exactly that state pushes. Only the repository's
 * own check stamps (harness.check, else `bun run check` where package.json
 * has one), and a failing check on a stamped tree takes the stamp back.
 * The verdict line goes to the harness's event log too (events.ts).
 */
import { closeSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync, writeSync } from "node:fs";
import { constants, tmpdir } from "node:os";
import { join, relative } from "node:path";
import { logEvent, repoOf } from "./events";

export const MAX_LINES = 20;

// ── git ─────────────────────────────────────────────────────────────────────
function git(cwd: string, args: string[], env?: Record<string, string>): string | undefined {
  const p = Bun.spawnSync(["git", ...args], { cwd, env: env ? { ...process.env, ...env } : undefined, stderr: "ignore" });
  return p.exitCode === 0 ? p.stdout.toString().trim() : undefined;
}

export const topLevel = (cwd: string) => git(cwd, ["rev-parse", "--show-toplevel"]);
export const commonDir = (cwd: string) => git(cwd, ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
export const headTree = (cwd: string) => git(cwd, ["rev-parse", "--verify", "-q", "HEAD^{tree}"]);

// The tree a commit of everything in the working directory would have, read
// through an index of its own (the repository's index untouched).
export function workTree(cwd: string): string | undefined {
  const top = topLevel(cwd);
  const index = git(cwd, ["rev-parse", "--path-format=absolute", "--git-path", "index"]);
  if (!top || !index) return undefined;
  const tmp = mkdtempSync(join(tmpdir(), "q-index-"));
  try {
    const env = { GIT_INDEX_FILE: join(tmp, "index") };
    if (existsSync(index)) copyFileSync(index, env.GIT_INDEX_FILE);
    if (git(top, ["add", "-A"], env) === undefined) return undefined;
    return git(top, ["write-tree"], env);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

// The repository's check: harness.check, else `bun run check` where
// package.json has one (undefined: none known, any check stamps).
export function checkCommand(top: string): string | undefined {
  const set = git(top, ["config", "--get", "harness.check"]);
  if (set) return set;
  try {
    return JSON.parse(readFileSync(join(top, "package.json"), "utf8")).scripts?.check ? "bun run check" : undefined;
  } catch {
    return undefined;
  }
}

// ── the stamps ──────────────────────────────────────────────────────────────
export type Stamp = { tree: string; head?: string; at: string; command: string; seconds: number };

export const stampDir = (cwd: string) => {
  const common = commonDir(cwd);
  return common ? join(common, "harness") : undefined;
};

export function stampOf(cwd: string, tree: string | undefined): Stamp | undefined {
  const dir = stampDir(cwd);
  if (!dir || !tree) return undefined;
  const file = join(dir, `check-${tree}`);
  if (!existsSync(file)) return undefined;
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return { tree, at: new Date(statSync(file).mtimeMs).toISOString(), command: "?", seconds: 0 };
  }
}

// The newest stamp of a repository, whatever its tree.
export function lastStamp(cwd: string): Stamp | undefined {
  const dir = stampDir(cwd);
  if (!dir || !existsSync(dir)) return undefined;
  const newest = readdirSync(dir)
    .filter((f) => f.startsWith("check-"))
    .map((f) => ({ f, t: statSync(join(dir, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t)[0];
  return newest && stampOf(cwd, newest.f.slice("check-".length));
}

function stamp(cwd: string, s: Stamp) {
  const dir = stampDir(cwd)!;
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `check-${s.tree}`), JSON.stringify(s) + "\n");
}

function unstamp(cwd: string, tree: string) {
  const dir = stampDir(cwd);
  if (dir) rmSync(join(dir, `check-${tree}`), { force: true });
}

// ── the lines that matter, pure (harness.test.ts) ───────────────────────────
const ANSI = /\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07]*\x07/g;
const BAD =
  /\b(errors?|fail|failed|failures?|failing|assert|assertion|expected|received|traceback|exception|panic|fatal|refused|missing|cannot|can't|unable|not found|mismatch|stale|differs?)\b|✗|✘|×|❌|:\d+:(\d+:)?\s/i;
const FINE = /\b0 (errors?|fail(ed|ures?)?|problems?)\b|\bno errors?\b|^\s*at\s|^\s*\d+ pass\b/i;

export function clean(text: string): string[] {
  return text
    .replace(ANSI, "")
    .split("\n")
    .map((l) => l.split("\r").pop()!.trimEnd())
    .filter((l) => l.trim());
}

export function matters(lines: string[], max = MAX_LINES): string[] {
  const cut = (l: string) => (l.length > 200 ? `${l.slice(0, 199)}…` : l);
  let picked = lines.filter((l) => BAD.test(l) && !FINE.test(l));
  if (!picked.length) return lines.slice(-max).map(cut);
  picked = picked.filter((l, i) => l !== picked[i - 1]);
  if (picked.length <= max) return picked.map(cut);
  const tail = 5;
  const head = max - tail - 1;
  return [...picked.slice(0, head), `… ${picked.length - head - tail} more in the log`, ...picked.slice(-tail)].map(cut);
}

const secs = (ms: number) => (ms < 10_000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms / 1000)}s`);

export function verdict(name: string, code: number, ms: number, log?: string): string {
  return code === 0 ? `${name}: ok (${secs(ms)})` : `${name}: FAILED (exit ${code}, ${secs(ms)})${log ? ` · ${log}` : ""}`;
}

// <repo>/.cache/<sub>, made; a .cache/ the repository's .gitignore forgot
// still stays out of git (a .gitignore of its own).
export function cacheDir(top: string, sub: string): string {
  const cache = join(top, ".cache");
  mkdirSync(join(cache, sub), { recursive: true });
  if (!existsSync(join(cache, ".gitignore"))) writeFileSync(join(cache, ".gitignore"), "*\n");
  return join(cache, sub);
}

// ── the run ─────────────────────────────────────────────────────────────────
export function parse(argv: string[]): { name: string; command: string[] } | string {
  const dash = argv.indexOf("--");
  const name = argv[0];
  if (dash !== 1 || !name || dash === argv.length - 1) return "usage: bun q.ts <name> -- <command...>";
  if (!/^[\w.-]+$/.test(name)) return `a name of letters, digits, '.', '-' or '_', not ${name}`;
  return { name, command: argv.slice(dash + 1) };
}

export async function run(name: string, command: string[], cwd = process.cwd()): Promise<number> {
  const top = topLevel(cwd);
  const log = join(cacheDir(top ?? cwd, "logs"), `${name}.log`);
  const checking = name === "check" && top !== undefined;
  const before = checking ? workTree(cwd) : undefined;

  const fd = openSync(log, "w");
  writeSync(fd, `$ ${command.join(" ")}\n`);
  const start = performance.now();
  let code: number;
  try {
    const p = Bun.spawn(command, { cwd, stdin: "ignore", stdout: fd, stderr: fd, env: { ...process.env, NO_COLOR: "1" } });
    await p.exited;
    code = p.exitCode ?? 128 + (constants.signals[p.signalCode as keyof typeof constants.signals] ?? 0);
  } catch (e) {
    writeSync(fd, `${(e as Error).message}\n`);
    code = 127;
  }
  const ms = performance.now() - start;
  writeSync(fd, `\n[exit ${code}, ${secs(ms)}]\n`);
  closeSync(fd);

  const shown = relative(process.cwd(), log) || log;
  let line = verdict(name, code, ms, shown);
  if (checking && before) {
    const after = workTree(cwd);
    const expected = checkCommand(top!);
    if (code !== 0) unstamp(cwd, before);
    else if (expected && command.join(" ") !== expected) line += ` · not stamped: this repository's check is \`${expected}\``;
    else if (after !== before) line += " · not stamped: the files changed while it ran, run it again";
    else {
      stamp(cwd, { tree: before, head: git(cwd, ["rev-parse", "--verify", "-q", "HEAD"]), at: new Date().toISOString(), command: command.join(" "), seconds: Math.round(ms / 1000) });
      line += ` · stamped ${before.slice(0, 7)}`;
    }
  }
  console.log(line);
  logEvent(name, code !== 0 ? "fail" : line.includes("not stamped") ? "wait" : "ok", repoOf(cwd), line);
  if (code !== 0) {
    const out = clean(readFileSync(log, "utf8")).slice(1, -1);
    for (const l of matters(out)) console.log(`  ${l}`);
  }
  return code;
}

if (import.meta.main) {
  const args = parse(process.argv.slice(2));
  if (typeof args === "string") {
    console.error(args);
    process.exit(2);
  }
  process.exit(await run(args.name, args.command));
}
