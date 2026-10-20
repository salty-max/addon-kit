/**
 * A review's verdict, kept beside the check stamps: once the reviewer
 * helper has reported, the main session records what it said, and the
 * desktop panel shows it. The reviewer itself stays read-only.
 *
 *   bun addon-kit/review.ts <repo> "<verdict>"   recorded for HEAD
 *   bun addon-kit/review.ts <repo>               HEAD's verdict, if any
 *
 *   bun addon-kit/review.ts yonder "clean"
 *   bun addon-kit/review.ts yonder "2 findings, fixed in 1d0646a"
 *
 * The file: <git common dir>/harness/review-<HEAD sha>, its first line
 * "verdict: <verdict>", then the head, its tree, when, and the packet
 * (packet.ts's .cache/review/<sha12>.md) when there is one.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { stampDir } from "./q";
import { familyRoot } from "./root";

function git(cwd: string, ...args: string[]): string | undefined {
  const p = Bun.spawnSync(["git", ...args], { cwd, stderr: "ignore" });
  return p.exitCode === 0 ? p.stdout.toString().trim() : undefined;
}

export type Review = { verdict: string; head: string; tree?: string; at?: string; packet?: string };

export function parseReview(text: string): Review | undefined {
  const fields: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const m = line.match(/^(\w+):\s*(.*)$/);
    if (m && !(m[1] in fields)) fields[m[1]] = m[2].trim();
  }
  return fields.verdict === undefined ? undefined : { verdict: fields.verdict, head: fields.head ?? "", tree: fields.tree, at: fields.at, packet: fields.packet };
}

export function reviewOf(dir: string, sha?: string): Review | undefined {
  const head = sha ?? git(dir, "rev-parse", "--verify", "-q", "HEAD");
  const stamps = stampDir(dir);
  if (!head || !stamps) return undefined;
  const file = join(stamps, `review-${head}`);
  return existsSync(file) ? parseReview(readFileSync(file, "utf8")) : undefined;
}

export function record(dir: string, verdict: string): Review | string {
  const head = git(dir, "rev-parse", "--verify", "-q", "HEAD");
  const stamps = stampDir(dir);
  const top = git(dir, "rev-parse", "--show-toplevel");
  if (!head || !stamps || !top) return `${dir}: not a repository with a commit`;
  const one = verdict.replace(/\s+/g, " ").trim();
  if (!one) return "the verdict is empty";
  const packet = join(top, ".cache", "review", `${head.slice(0, 12)}.md`);
  const r: Review = { verdict: one, head, tree: git(dir, "rev-parse", "HEAD^{tree}"), at: new Date().toISOString(), packet: existsSync(packet) ? packet : undefined };
  mkdirSync(stamps, { recursive: true });
  const lines = [`verdict: ${r.verdict}`, `head: ${r.head}`, `tree: ${r.tree}`, `at: ${r.at}`, ...(r.packet ? [`packet: ${r.packet}`] : [])];
  writeFileSync(join(stamps, `review-${head}`), lines.join("\n") + "\n");
  return r;
}

if (import.meta.main) {
  const [repo, ...words] = process.argv.slice(2);
  if (!repo) {
    console.error('usage: bun review.ts <repo> ["<verdict>"]');
    process.exit(2);
  }
  const dir = isAbsolute(repo) || repo.startsWith(".") ? resolve(repo) : join(familyRoot(), repo);
  if (!words.length) {
    const r = reviewOf(dir);
    console.log(r ? `${r.verdict} (${r.at ?? "?"})` : "no verdict for HEAD");
  } else {
    const r = record(dir, words.join(" "));
    if (typeof r === "string") {
      console.error(r);
      process.exit(1);
    }
    console.log(`${repo} ${r.head.slice(0, 7)}: ${r.verdict}`);
  }
}
