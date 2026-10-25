/**
 * A review's verdict, kept beside the check stamps: once the reviewer
 * helper has reported, the main session records what it said, and the
 * desktop panel shows it. The reviewer itself stays read-only.
 *
 *   bun addon-kit/review.ts <repo> "<verdict>"   recorded for HEAD
 *   bun addon-kit/review.ts <repo>               HEAD's verdict, if any
 *   bun addon-kit/review.ts <repo> --again "<verdict>"   replace HEAD's verdict
 *
 * It refuses while tracked files have uncommitted changes (commit first: the
 * verdict would land on the commit before) and when HEAD already has a verdict
 * (the old one is printed; --again overwrites).
 *
 *   bun addon-kit/review.ts yonder "clean"
 *   bun addon-kit/review.ts yonder "2 findings, fixed in 1d0646a"
 *
 * The file: <git common dir>/harness/review-<HEAD sha>, its first line
 * "verdict: <verdict>", then the head, its tree, when, and the packet the
 * reviewer read with its range's base and tip: HEAD's own packet
 * (packet.ts's .cache/review/<sha12>.md), else the newest one whose tip HEAD
 * is built on and isn't pushed yet (a verdict recorded on the commit that
 * fixed its findings). The panel counts a review only when that base is
 * already on the upstream and that tip isn't: the review reached all a push
 * sends. The commits after that tip, which the reviewer didn't read, are
 * written down (`after:`) and said, louder when one isn't a fix: a feature
 * after the review wants a packet and a review of its own. The harness's
 * event log gets a line (events.ts).
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { logEvent, repoOf } from "./events";
import { packetRange } from "./packet";
import { stampDir } from "./q";
import { familyRoot } from "./root";

function git(cwd: string, ...args: string[]): string | undefined {
  const p = Bun.spawnSync(["git", ...args], { cwd, stderr: "ignore" });
  return p.exitCode === 0 ? p.stdout.toString().trim() : undefined;
}

export type Review = { verdict: string; head: string; tree?: string; at?: string; packet?: string; base?: string; tip?: string; after?: string[] };

export function parseReview(text: string): Review | undefined {
  const fields: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const m = line.match(/^(\w+):\s*(.*)$/);
    if (m && !(m[1] in fields)) fields[m[1]] = m[2].trim();
  }
  return fields.verdict === undefined
    ? undefined
    : {
        verdict: fields.verdict,
        head: fields.head ?? "",
        tree: fields.tree,
        at: fields.at,
        packet: fields.packet,
        base: fields.base,
        tip: fields.tip,
        ...(fields.after ? { after: fields.after.split(" | ") } : {}),
      };
}

// The packet the reviewer read: HEAD's own, else the newest whose tip HEAD is
// built on and isn't pushed yet (one from an earlier push read none of what
// this one sends); none when no packet's range was written down (an older packet).
export function packetFor(top: string, head: string): { path: string; base: string; tip: string } | undefined {
  const dir = join(top, ".cache", "review");
  if (!existsSync(dir)) return undefined;
  const sent = git(top, "rev-parse", "--verify", "-q", "@{u}") ? ["@{u}"] : git(top, "remote") ? ["--remotes"] : null;
  const isPushed = (sha: string) => sent !== null && git(top, "rev-list", "--count", sha, "--not", ...sent) === "0";
  const files = readdirSync(dir)
    .filter((f) => /^[0-9a-f]{12}\.md$/.test(f))
    .map((f) => ({ path: join(dir, f), at: statSync(join(dir, f)).mtimeMs, isHead: f === `${head.slice(0, 12)}.md` }))
    .sort((a, b) => Number(b.isHead) - Number(a.isHead) || b.at - a.at);
  for (const f of files) {
    const r = packetRange(readFileSync(f.path, "utf8"));
    if (!r || isPushed(r.tip)) continue;
    if (r.tip === head || Bun.spawnSync(["git", "merge-base", "--is-ancestor", r.tip, head], { cwd: top, stderr: "ignore" }).exitCode === 0) return { path: f.path, ...r };
  }
  return undefined;
}

export function reviewOf(dir: string, sha?: string): Review | undefined {
  const head = sha ?? git(dir, "rev-parse", "--verify", "-q", "HEAD");
  const stamps = stampDir(dir);
  if (!head || !stamps) return undefined;
  const file = join(stamps, `review-${head}`);
  return existsSync(file) ? parseReview(readFileSync(file, "utf8")) : undefined;
}

export function record(dir: string, verdict: string, again = false): Review | string {
  const head = git(dir, "rev-parse", "--verify", "-q", "HEAD");
  const stamps = stampDir(dir);
  const top = git(dir, "rev-parse", "--show-toplevel");
  if (!head || !stamps || !top) return `${dir}: not a repository with a commit`;
  const one = verdict.replace(/\s+/g, " ").trim();
  if (!one) return "the verdict is empty";
  // A verdict belongs to a commit: with the fix still uncommitted it would land on the one before.
  if (git(dir, "status", "--porcelain", "--untracked-files=no")) return "tracked files have uncommitted changes: commit first, the verdict is recorded for HEAD";
  const old = reviewOf(dir);
  if (old && !again) return `HEAD ${head.slice(0, 7)} already has a verdict (${old.verdict}): --again to overwrite it`;
  const p = packetFor(top, head);
  const after = p && p.tip !== head ? (git(top, "log", "--format=%h %s", `${p.tip}..${head}`) ?? "").split("\n").filter(Boolean) : [];
  const r: Review = {
    verdict: one,
    head,
    tree: git(dir, "rev-parse", "HEAD^{tree}"),
    at: new Date().toISOString(),
    packet: p?.path,
    base: p?.base,
    tip: p?.tip,
    ...(after.length ? { after } : {}),
  };
  mkdirSync(stamps, { recursive: true });
  const lines = [
    `verdict: ${r.verdict}`,
    `head: ${r.head}`,
    `tree: ${r.tree}`,
    `at: ${r.at}`,
    ...(p ? [`packet: ${p.path}`, `base: ${p.base}`, `tip: ${p.tip}`] : []),
    ...(after.length ? [`after: ${after.join(" | ")}`] : []),
  ];
  writeFileSync(join(stamps, `review-${head}`), lines.join("\n") + "\n");
  logEvent("review", "", repoOf(dir), `${head.slice(0, 7)} ${r.verdict}`);
  return r;
}

if (import.meta.main) {
  const [repo, ...rest] = process.argv.slice(2);
  const again = rest.includes("--again");
  const words = rest.filter((w) => w !== "--again");
  if (!repo) {
    console.error('usage: bun review.ts <repo> [--again] ["<verdict>"]');
    process.exit(2);
  }
  const dir = isAbsolute(repo) || repo.startsWith(".") ? resolve(repo) : join(familyRoot(), repo);
  if (!words.length) {
    const r = reviewOf(dir);
    console.log(r ? `${r.verdict} (${r.at ?? "?"})` : "no verdict for HEAD");
  } else {
    const r = record(dir, words.join(" "), again);
    if (typeof r === "string") {
      console.error(r);
      process.exit(1);
    }
    console.log(`${repo} ${r.head.slice(0, 7)}: ${r.verdict}`);
    if (r.after?.length) {
      console.error(`note: ${r.after.length} commit${r.after.length > 1 ? "s" : ""} after the packet the reviewer read (${r.tip?.slice(0, 7)}):`);
      for (const c of r.after) console.error(`  ${c}`);
      const others = r.after.filter((c) => !/^\w+ (fix|docs|style|test|chore)(\(|!|:)/.test(c));
      if (others.length) console.error("not fixes among them: make a packet again (packet.ts) and have the reviewer read them before the push");
    }
  }
}
