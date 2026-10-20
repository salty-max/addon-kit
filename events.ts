/**
 * The harness's event log: one line for each thing a tool did that the
 * desktop panel's log shows (harness-view). The tools whose own files keep
 * only the latest state append here as they act: q.ts (a run's verdict, the
 * stamp), review.ts (a verdict), board.ts (a card added or moved), and the
 * git hooks (a refusal, written by the shell). Helpers and the push or
 * release prompts the user answered come from the transcripts instead.
 *
 *   <ISO time>\t<source>\t<tone>\t<repo>\t<text>
 *
 *   tone   ok, wait, fail, info, or empty: the panel reads it from the words
 *
 *   bun addon-kit/events.ts [n]     the last n events (10), newest last
 *
 * The file: ~/code/wow-addons/.cache/harness/events.log (HARNESS_EVENTS:
 * another file, "off": none), trimmed to its last 500 lines past 256 KB
 * (a line another tool appends while the trim rewrites the file is lost:
 * rare, and only a line of the log). Writing it never fails the tool that
 * writes.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname } from "node:path";
import { familyPath } from "./root";

export type Tone = "ok" | "wait" | "fail" | "info" | "";

const MAX_BYTES = 256 * 1024;
const KEEP_LINES = 500;

export function eventsPath(): string | undefined {
  const set = process.env.HARNESS_EVENTS;
  if (set === "off") return undefined;
  if (set) return set;
  try {
    return familyPath(".cache", "harness", "events.log");
  } catch {
    return undefined;
  }
}

// One field of a line: no tab, no line break.
const field = (text: string) => text.replace(/[\t\r\n]+/g, " ").trim();

export function eventLine(source: string, tone: Tone, repo: string, text: string, at = new Date()): string {
  return `${[at.toISOString(), field(source), tone, field(repo), field(text)].join("\t")}\n`;
}

export function logEvent(source: string, tone: Tone, repo: string, text: string): void {
  const file = eventsPath();
  if (!file) return;
  try {
    mkdirSync(dirname(file), { recursive: true });
    appendFileSync(file, eventLine(source, tone, repo, text));
    if (statSync(file).size > MAX_BYTES) {
      const lines = readFileSync(file, "utf8").split("\n").filter(Boolean);
      writeFileSync(file, `${lines.slice(-KEEP_LINES).join("\n")}\n`);
    }
  } catch {}
}

// A repository by its main checkout's folder name, a worktree's too.
export function repoOf(cwd: string): string {
  const p = Bun.spawnSync(["git", "rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd, stderr: "ignore" });
  const common = p.exitCode === 0 ? p.stdout.toString().trim() : "";
  return common.endsWith("/.git") ? basename(dirname(common)) : basename(cwd);
}

if (import.meta.main) {
  const n = Number(process.argv[2] ?? 10);
  const file = eventsPath();
  if (!file || !existsSync(file)) console.log("no events yet");
  else console.log(readFileSync(file, "utf8").trimEnd().split("\n").slice(-n).join("\n"));
}
