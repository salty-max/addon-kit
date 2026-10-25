/**
 * Every repository beside the kit (~/code/wow-addons) at a glance: where it
 * stands against GitHub, what's left uncommitted, each workflow's last run on
 * its branch, the pull requests open, and whether its test build in iCloud
 * (the addon's zip, Ravenpost's Windows exe) is its HEAD, whether a check
 * passed on HEAD's tree (q.ts's stamp), and the task board's open cards.
 * What wants a hand is listed last. A script, not a model: every answer here is mechanical.
 *
 *   bun addon-kit/status.ts             fetch first, then the table
 *   bun addon-kit/status.ts --no-fetch  as the checkouts know it
 *   bun addon-kit/status.ts --json      the same as JSON
 *
 * Needs git; gh (signed in) for the workflows and pull requests, left out
 * and said so without it. Every git and gh call gives up after 20 seconds
 * (a stalled remote), said so too. The family's git hooks are checked:
 * a repository whose hooks are gone or not ours wants a hand.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { cards, lines } from "./board";
import { hooksWant, state } from "./hooks";
import { checkCommand, headTree, stampOf } from "./q";
import { familyRoot } from "./root";
import { lastSummary, line as usageLine } from "./usage";

// the family folder, from a worktree too (root.ts); found when first asked,
// so the module loads (and its pure parts are tested) outside one
let root: string | undefined;
const ROOT = () => (root ??= familyRoot());
const TIMEOUT_MS = 20_000;
const ICLOUD = join(homedir(), "Library", "Mobile Documents", "com~apple~CloudDocs", "Hearthtale test");

export type Run = { workflow: string; status: string; conclusion: string; sha: string; at: string };
export type Build = { file: string; version: string; state: "current" | "behind" | "unknown"; behind?: number };
export type Repo = {
  name: string;
  branch: string;
  upstream?: string;
  ahead: number;
  behind: number;
  dirty: number;
  head: string;
  slug?: string;
  runs?: Run[];
  prs?: { number: number; title: string }[];
  build?: Build;
  checked?: boolean;
  ghFailed?: boolean;
  /** The repository's own check, as a push's gate names it. */
  check?: string;
  /** What its git hooks want (gone, not ours), else none. */
  hooks?: string;
  /** git couldn't read it (HEAD gone, a broken .git). */
  unreadable?: boolean;
  /** Calls that gave up after TIMEOUT_MS. */
  timedOut?: string[];
  /** The fetch failed: ahead and behind are against origin as last fetched. */
  fetchFailed?: boolean;
};

// ── helpers, pure (tools.test.ts) ───────────────────────────────────────────
// owner/repo from a GitHub remote, ssh or https.
export function slugOf(url: string): string | undefined {
  const m = url.trim().match(/github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?\/?$/);
  return m ? `${m[1]}/${m[2]}` : undefined;
}

// Each workflow's newest run (gh lists newest first).
export function latestPerWorkflow(runs: Run[]): Run[] {
  const seen = new Map<string, Run>();
  for (const r of runs) if (!seen.has(r.workflow)) seen.set(r.workflow, r);
  return [...seen.values()].sort((a, b) => a.workflow.localeCompare(b.workflow));
}

// A test build's version from its file name: <Name>-<version>.zip, or
// Ravenpost's ravenpost-<version>-windows-x64.exe.
export function buildVersion(file: string, name: string): string | undefined {
  if (name === "ravenpost") return file.match(/^ravenpost-(.+)-windows-x64\.exe$/)?.[1];
  const prefix = `${name}-`;
  return file.startsWith(prefix) && file.endsWith(".zip") ? file.slice(prefix.length, -4) : undefined;
}

export function mark(r: Run): string {
  if (r.status !== "completed") return "…";
  return r.conclusion === "success" ? "✓" : r.conclusion === "skipped" || r.conclusion === "cancelled" ? "–" : "✗";
}

// What wants a hand, one line each.
export function attention(r: Repo): string[] {
  const out: string[] = [];
  if (r.unreadable) return ["not a readable repository (git rev-parse HEAD failed)"];
  if (r.hooks) out.push(`hooks: ${r.hooks}`);
  for (const t of r.timedOut ?? []) out.push(`${t} gave up after ${TIMEOUT_MS / 1000}s (a stalled remote?)`);
  if (r.fetchFailed && !r.timedOut?.includes("git fetch")) out.push("git fetch failed: ahead and behind as last fetched");
  if (r.dirty) out.push(`${r.dirty} file${r.dirty > 1 ? "s" : ""} uncommitted`);
  if (!r.upstream) out.push("no upstream (local only)");
  if (r.ahead) out.push(`${r.ahead} commit${r.ahead > 1 ? "s" : ""} to push`);
  if (r.behind) out.push(`${r.behind} commit${r.behind > 1 ? "s" : ""} to pull`);
  if (r.ahead && r.checked === false) out.push(`no passing check on HEAD's tree (bun ../addon-kit/q.ts check -- ${r.check ?? "bun run check"})`);
  for (const run of r.runs ?? []) {
    if (run.status === "completed" && !["success", "skipped", "cancelled"].includes(run.conclusion))
      out.push(`${run.workflow}: ${run.conclusion} (${run.sha.slice(0, 7)})`);
  }
  for (const pr of r.prs ?? []) out.push(`pull request #${pr.number} open: ${pr.title}`);
  if (r.build?.state === "behind") out.push(`test build ${r.build.file} is ${r.build.behind} commit${r.build.behind === 1 ? "" : "s"} behind HEAD`);
  if (r.build?.state === "unknown") out.push(`test build ${r.build.file}: not a commit of this repository`);
  return out;
}

// What ships, as git pathspecs: the addon's folders (not its store page or
// its tests), Ravenpost's app (not its inbox, a site of its own, nor its
// tests and docs). A test build is behind only where these changed.
export function ships(name: string): string[] {
  return name === "ravenpost"
    ? [".", ":(exclude)inbox", ":(exclude)testdata", ":(exclude)*_test.go", ":(exclude)*.md"]
    : ["addon", ":(exclude)addon/CURSEFORGE.md", ":(exclude)addon/test"];
}

// ── reading the repositories ────────────────────────────────────────────────
// (a program missing is a failure, never a crash; a call past TIMEOUT_MS is killed and said so)
async function run(cmd: string[], cwd: string): Promise<{ ok: boolean; out: string; timedOut?: boolean }> {
  let p: ReturnType<typeof Bun.spawn>;
  try {
    p = Bun.spawn(cmd, { cwd, stdout: "pipe", stderr: "pipe", timeout: TIMEOUT_MS });
  } catch {
    return { ok: false, out: "" };
  }
  const out = await new Response(p.stdout as ReadableStream).text();
  const code = await p.exited;
  return { ok: code === 0, out: out.trim(), ...(p.signalCode === "SIGTERM" && code !== 0 ? { timedOut: true } : {}) };
}
const git = (cwd: string, ...args: string[]) => run(["git", ...args], cwd);

// The addon's package name (its zip's): scripts/package.ts's NAME, else the
// folder under addon/ holding a TOC; Ravenpost's exe by the repo's name.
function buildName(dir: string, name: string): string | undefined {
  if (name === "ravenpost") return name;
  const pkg = join(dir, "scripts", "package.ts");
  if (existsSync(pkg)) {
    const m = readFileSync(pkg, "utf8").match(/^const NAME = "([^"]+)"/m);
    if (m) return m[1];
  }
  const addon = join(dir, "addon");
  if (!existsSync(addon)) return undefined;
  for (const d of readdirSync(addon, { withFileTypes: true })) {
    if (d.isDirectory() && readdirSync(join(addon, d.name)).some((f) => f.endsWith(".toc"))) return d.name;
  }
  return undefined;
}

async function build(dir: string, name: string): Promise<Build | undefined> {
  const pkg = buildName(dir, name);
  if (!pkg || !existsSync(ICLOUD)) return undefined;
  // (one build an addon, the rule; should two be there, the newest)
  const found = readdirSync(ICLOUD)
    .map((file) => ({ file, version: buildVersion(file, pkg) }))
    .filter((b): b is { file: string; version: string } => !!b.version)
    .sort((a, b) => statSync(join(ICLOUD, b.file)).mtimeMs - statSync(join(ICLOUD, a.file)).mtimeMs);
  if (!found.length) return undefined;
  const { file, version } = found[0];
  const sha = await git(dir, "rev-parse", "--verify", "-q", `${version.replace(/-dirty$/, "")}^{commit}`);
  if (!sha.ok) {
    // (WoWLocker names its zip by the addon's version, its tags the site's:
    // the TOC's version, then)
    const toc = tocVersion(dir, pkg);
    return { file, version, state: toc && version.replace(/^v/, "") === toc ? "current" : "unknown" };
  }
  const count = await git(dir, "rev-list", "--count", `${sha.out}..HEAD`, "--", ...ships(name));
  const behind = Number(count.out) || 0;
  return { file, version, state: behind ? "behind" : "current", behind };
}

function tocVersion(dir: string, pkg: string): string | undefined {
  const folder = join(dir, "addon", pkg);
  if (!existsSync(folder)) return undefined;
  const toc = readdirSync(folder).find((f) => f.endsWith(".toc"));
  return toc ? readFileSync(join(folder, toc), "utf8").match(/^## Version: *(\S+)/m)?.[1] : undefined;
}

async function github(r: Repo) {
  if (!r.slug) return;
  const branch = r.upstream?.split("/").slice(1).join("/") || r.branch;
  const [runs, prs] = await Promise.all([
    run(["gh", "run", "list", "-R", r.slug, "-b", branch, "-L", "30", "--json", "workflowName,status,conclusion,headSha,createdAt"], ROOT()),
    run(["gh", "pr", "list", "-R", r.slug, "--state", "open", "--json", "number,title"], ROOT()),
  ]);
  if (runs.timedOut || prs.timedOut) (r.timedOut ??= []).push("gh");
  if (!runs.ok && !prs.ok) {
    r.ghFailed = true;
    return;
  }
  if (runs.ok) {
    const list = JSON.parse(runs.out || "[]") as { workflowName: string; status: string; conclusion: string; headSha: string; createdAt: string }[];
    r.runs = latestPerWorkflow(
      list.map((x) => ({ workflow: x.workflowName, status: x.status, conclusion: x.conclusion, sha: x.headSha, at: x.createdAt })),
    );
  }
  if (prs.ok) r.prs = JSON.parse(prs.out || "[]");
}

export async function read(name: string, fetch: boolean): Promise<Repo> {
  const dir = join(ROOT(), name);
  const fetched = fetch ? await git(dir, "fetch", "-q", "origin") : undefined;
  const [branch, upstream, dirty, head, remote] = await Promise.all([
    git(dir, "rev-parse", "--abbrev-ref", "HEAD"),
    git(dir, "rev-parse", "--abbrev-ref", "@{u}"),
    git(dir, "status", "--porcelain"),
    git(dir, "log", "-1", "--format=%h %s"),
    git(dir, "remote", "get-url", "origin"),
  ]);
  const r: Repo = {
    name,
    branch: branch.out,
    upstream: upstream.ok ? upstream.out : undefined,
    ahead: 0,
    behind: 0,
    dirty: dirty.out ? dirty.out.split("\n").length : 0,
    head: head.out,
    slug: remote.ok ? slugOf(remote.out) : undefined,
  };
  if (fetched?.timedOut) r.timedOut = ["git fetch"];
  if (fetched && !fetched.ok) r.fetchFailed = true;
  if (!branch.ok) return { ...r, unreadable: true };
  r.check = checkCommand(dir);
  r.hooks = hooksWant(state(dir));
  if (r.upstream) {
    const counts = await git(dir, "rev-list", "--left-right", "--count", "HEAD...@{u}");
    const [a, b] = counts.out.split(/\s+/).map(Number);
    r.ahead = a || 0;
    r.behind = b || 0;
  }
  await github(r);
  r.build = await build(dir, name);
  const tree = headTree(dir);
  if (tree) r.checked = !!stampOf(dir, tree);
  return r;
}

function table(repos: Repo[]) {
  const w = Math.max(...repos.map((r) => r.name.length));
  for (const r of repos) {
    const sync = !r.upstream ? "local" : r.ahead || r.behind ? `↑${r.ahead} ↓${r.behind}` : "=";
    const runs = (r.runs ?? []).map((x) => `${x.workflow} ${mark(x)}`).join("  ");
    const check = r.checked === undefined ? "" : r.checked ? "check ✓" : "check –";
    const zip = r.build ? (r.build.state === "current" ? "zip ✓" : r.build.state === "behind" ? `zip −${r.build.behind}` : "zip ?") : "";
    console.log(
      `${r.name.padEnd(w)}  ${sync.padEnd(7)} ${r.dirty ? `±${r.dirty}`.padEnd(4) : "    "} ${check.padEnd(7)} ${zip.padEnd(7)} ${runs}`,
    );
  }
  const todo = repos.flatMap((r) => attention(r).map((a) => `${r.name}: ${a}`));
  console.log(todo.length ? `\nWants a hand:\n${todo.map((t) => `  - ${t}`).join("\n")}` : "\nNothing wants a hand.");
  const board = cards();
  console.log(board.length ? `\nBoard:\n${lines(board).map((l) => `  ${l}`).join("\n")}` : "\nThe board is empty.");
  const spent = lastSummary();
  if (spent) console.log(`\nCost: ${usageLine(spent)}`);
  const silent = repos.filter((r) => r.ghFailed).map((r) => r.name);
  if (silent.length) console.log(`\n(gh gave nothing for ${silent.join(", ")}: workflows and pull requests left out there. \`gh auth status\`)`);
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const names = readdirSync(ROOT(), { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(ROOT(), d.name, ".git")))
    .map((d) => d.name)
    .sort();
  const repos = await Promise.all(names.map((n) => read(n, !args.includes("--no-fetch"))));
  if (args.includes("--json")) console.log(JSON.stringify(repos, null, 2));
  else table(repos);
}
