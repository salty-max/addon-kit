/**
 * The reviewer's packet: what a review needs before its first turn, in one
 * file, so the reviewer spends its turns on judgement. The commits, the diff
 * stat, the files, what's uncommitted, what scripts already checked (the
 * check's stamp, the commit subjects, the trailers) and, for Yonder's
 * riddle files, the lookup cards of the subjects of the riddles the change
 * touches (wow-data's bin/card.ts).
 *
 *   bun addon-kit/packet.ts <repo> [range]
 *
 *   repo   a folder of the family (yonder) or a path
 *   range  a..b, a...b, or one commit; by default everything not on GitHub
 *          yet: @{u}..HEAD and the uncommitted files (with no upstream, the
 *          last commit and the uncommitted files)
 *
 * Writes <repo>/.cache/review/<sha>.md (<sha>: the range's tip) and prints
 * its path and one line.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { cacheDir, stampOf, workTree, type Stamp } from "./q";
import { familyRoot } from "./root";

const EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";
const MAX_CARDS = 16;
const MAX_COMMITS = 100;

function git(cwd: string, ...args: string[]): string | undefined {
  const p = Bun.spawnSync(["git", ...args], { cwd, stderr: "ignore" });
  return p.exitCode === 0 ? p.stdout.toString().trimEnd() : undefined;
}

// ── the range ───────────────────────────────────────────────────────────────
export type Range = { base: string; tip: string; label: string; working: boolean };

export function range(dir: string, arg?: string): Range | string {
  const rev = (r: string) => git(dir, "rev-parse", "--verify", "-q", `${r}^{commit}`);
  if (arg) {
    const [a, b] = arg.includes("...") ? arg.split("...") : arg.includes("..") ? arg.split("..") : [`${arg}^`, arg];
    const tip = rev(b || "HEAD");
    if (!tip) return `no commit ${b || "HEAD"}`;
    const base = arg.includes("...") ? git(dir, "merge-base", a, tip) : rev(a) ?? (arg.includes("..") ? undefined : EMPTY_TREE);
    if (!base) return `no commit ${a}`;
    return { base, tip, label: arg, working: false };
  }
  const tip = rev("HEAD");
  if (!tip) return "no commit yet";
  const up = git(dir, "rev-parse", "--abbrev-ref", "@{u}");
  if (up) return { base: git(dir, "merge-base", up, tip)!, tip, label: `${up}..HEAD and the uncommitted files`, working: true };
  return { base: rev("HEAD^") ?? EMPTY_TREE, tip, label: "the last commit (no upstream) and the uncommitted files", working: true };
}

// ── the rules a script checks, pure (harness.test.ts) ───────────────────────
const CONVENTIONAL = /^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\([\w./-]+\))?!?: \S/;

export function subjectProblem(subject: string): string | undefined {
  if (!CONVENTIONAL.test(subject)) return "not a Conventional Commit";
  const rest = subject.slice(subject.indexOf(": ") + 2);
  if (/^[A-Z][a-z]/.test(rest)) return "starts with a capital (fine if it's a name)";
  return undefined;
}

// The commit-msg hook's own check (githooks/commit-msg, its chain left out).
export function trailerProblem(message: string): string | undefined {
  const tmp = mkdtempSync(join(tmpdir(), "packet-"));
  try {
    writeFileSync(join(tmp, "msg"), message);
    const p = Bun.spawnSync(["sh", join(import.meta.dir, "githooks", "commit-msg"), join(tmp, "msg")], {
      env: { ...process.env, HARNESS_NO_CHAIN: "1" },
      stdout: "ignore",
      stderr: "pipe",
    });
    if (p.exitCode === 0) return undefined;
    return p.stderr.toString().split("\n").filter((l) => l.startsWith("  ")).map((l) => l.trim()).join(" | ");
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

// ── Yonder's riddles, pure (harness.test.ts) ────────────────────────────────
export type Subject = { kind: "npc" | "object" | "place"; arg: string };
export type Riddle = { id: string; spans: [number, number][]; subjects: Subject[]; landmark?: string };

// A riddle file's riddles: each one's lines (its front matter entry and its
// prose section, 1-based, inclusive) and the subjects the cards are for.
export function riddles(text: string): { game: "classic" | "forever"; list: Riddle[] } {
  const lines = text.split("\n");
  const byId = new Map<string, Riddle>();
  const get = (id: string) => byId.get(id) ?? byId.set(id, { id, spans: [], subjects: [] }).get(id)!;
  let game: "classic" | "forever" = "classic";
  let cur: Riddle | undefined;
  let start = 0;
  const close = (end: number) => {
    if (cur) cur.spans.push([start, end]);
    cur = undefined;
  };
  const add = (r: Riddle, kind: Subject["kind"], arg: string) => {
    if (!r.subjects.some((s) => s.kind === kind && s.arg === arg)) r.subjects.push({ kind, arg });
  };
  const fmEnd = lines[0] === "---" ? lines.indexOf("---", 1) : -1;
  for (let i = 0; i < lines.length; i++) {
    const n = i + 1;
    const l = lines[i];
    if (i <= fmEnd) {
      if (/^client:\s*forever\b/.test(l)) game = "forever";
      const riddle = l.match(/^\s{2}- id:\s*([\w-]+)/);
      if (riddle || /^\S/.test(l)) close(n - 1);
      if (riddle) [cur, start] = [get(riddle[1]), n];
      else if (/^quarry:/.test(l)) [cur, start] = [get("quarry"), n];
      if (!cur) continue;
      const v = l.replace(/\s+#.*$/, "");
      let m: RegExpMatchArray | null;
      if ((m = v.match(/^\s+object:\s*(\d+)\s*$/))) add(cur, "object", m[1]);
      else if ((m = v.match(/^\s+creature:\s*(\d+)\s*$/))) add(cur, "npc", m[1]);
      else if ((m = v.match(/^\s+area:\s*(.+?)\s*$/))) add(cur, "place", m[1].replace(/^["']|["']$/g, ""));
      else if ((m = v.match(/^\s+anchor:\s*\{\s*(object|creature):\s*(\d+)/))) add(cur, m[1] === "object" ? "object" : "npc", m[2]);
      else if ((m = v.match(/^\s+companions:\s*\[([^\]]*)\]/))) for (const id of m[1].match(/\d+/g) ?? []) add(cur, "npc", id);
      else if ((m = v.match(/^\s+landmark:\s*(\S+)/))) cur.landmark = m[1];
      else if (cur.id === "quarry" && (m = v.match(/^\s+id:\s*(\d+)/))) add(cur, "npc", m[1]);
      continue;
    }
    const section = l.match(/^## ([\w-]+)/);
    if (section) {
      close(n - 1);
      [cur, start] = [get(section[1]), n];
    }
  }
  close(lines.length);
  return { game, list: [...byId.values()] };
}

// The new side's changed lines of a -U0 diff (a deletion marks the lines
// around it).
export function changedLines(diff: string): number[] {
  const out: number[] = [];
  for (const m of diff.matchAll(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/gm)) {
    const start = Number(m[1]);
    const count = m[2] === undefined ? 1 : Number(m[2]);
    if (count === 0) out.push(start, start + 1);
    else for (let i = 0; i < count; i++) out.push(start + i);
  }
  return out;
}

export const touched = (list: Riddle[], lines: number[]) =>
  list.filter((r) => r.spans.some(([a, b]) => lines.some((n) => n >= a && n <= b)));

// The repository's check, as the pre-push hook names it.
export function checkCommand(top: string): string {
  const set = git(top, "config", "--get", "harness.check");
  if (set) return set;
  const pkg = join(top, "package.json");
  return existsSync(pkg) && JSON.parse(readFileSync(pkg, "utf8")).scripts?.check ? "bun run check" : "<the repository's check>";
}

// ── the packet ──────────────────────────────────────────────────────────────
const when = (s: Stamp) => s.at.replace("T", " ").slice(0, 16);
const stampLine = (what: string, s: Stamp | undefined) =>
  s ? `- check: passed on ${what}, ${when(s)} UTC (\`${s.command}\`, ${s.seconds}s). Don't run it again.` : undefined;

function cards(dir: string, r: Range, files: string[], out: string[]): number {
  const riddleFiles = files.filter((f) => /^expeditions\/[^/]+\.md$/.test(f));
  if (!riddleFiles.length) return 0;
  const root = familyRoot(dir);
  const card = join(root, "wow-data", "bin", "card.ts");
  const wanted: { riddle: string; game: string; s: Subject }[] = [];
  const landmarks: string[] = [];
  for (const f of riddleFiles) {
    const text = r.working ? (existsSync(join(dir, f)) ? readFileSync(join(dir, f), "utf8") : undefined) : git(dir, "show", `${r.tip}:${f}`);
    if (text === undefined) continue;
    const diff = r.working ? git(dir, "diff", "-U0", r.base, "--", f) : git(dir, "diff", "-U0", r.base, r.tip, "--", f);
    const isNew = git(dir, "cat-file", "-e", `${r.base}:${f}`) === undefined;
    const { game, list } = riddles(text);
    for (const rd of isNew ? list : touched(list, changedLines(diff ?? ""))) {
      if (rd.landmark) landmarks.push(`${rd.id}: landmark ${rd.landmark} (wow-data's landmark table, no card)`);
      for (const s of rd.subjects) if (!wanted.some((w) => w.s.kind === s.kind && w.s.arg === s.arg && w.game === game)) wanted.push({ riddle: rd.id, game, s });
    }
  }
  if (!wanted.length && !landmarks.length) return 0;
  out.push("", "## Cards: the subjects of the riddles this change touches", "");
  const arg = (a: string) => (/^[\w.-]+$/.test(a) ? a : JSON.stringify(a));
  const cmd = (w: (typeof wanted)[number]) => `bun wow-data/bin/card.ts ${w.s.kind} ${arg(w.s.arg)} --game ${w.game}`;
  if (!existsSync(card)) {
    out.push("wow-data/bin/card.ts isn't there yet: the facts below are yours to look up, one card each when it lands:", "");
    for (const w of wanted) out.push(`- ${w.riddle}: \`${cmd(w)}\``);
  } else {
    for (const w of wanted.slice(0, MAX_CARDS)) {
      const p = Bun.spawnSync(["bun", card, w.s.kind, w.s.arg, "--game", w.game], { cwd: root, timeout: 60_000, stderr: "pipe" });
      out.push(`### ${w.riddle}: ${w.s.kind} ${w.s.arg} (${w.game})`, "");
      if (p.exitCode === 0) out.push("```", p.stdout.toString().trimEnd(), "```", "");
      else out.push(`card failed (exit ${p.exitCode}): ${p.stderr.toString().trim().split("\n")[0] ?? ""}`, "");
    }
    for (const w of wanted.slice(MAX_CARDS)) out.push(`- not drawn (${MAX_CARDS} at most): ${w.riddle}: \`${cmd(w)}\``);
  }
  for (const l of landmarks) out.push(`- ${l}`);
  return wanted.length;
}

export function packet(dir: string, arg?: string): { file: string; summary: string } | string {
  const top = git(dir, "rev-parse", "--show-toplevel");
  if (!top) return `${dir}: not a repository`;
  const r = range(top, arg);
  if (typeof r === "string") return r;
  const name = top.split("/").pop()!;
  const revs = r.base === EMPTY_TREE ? r.tip : `${r.base}..${r.tip}`;
  const commits = (git(top, "log", `--max-count=${MAX_COMMITS}`, "--format=%h %s", revs) ?? "").split("\n").filter(Boolean);
  const diffArgs = r.working ? [r.base] : [r.base, r.tip];
  const status = r.working ? (git(top, "status", "--porcelain", "-uall") ?? "").split("\n").filter(Boolean) : [];
  const nameStatus = (git(top, "diff", "--name-status", ...diffArgs) ?? "").split("\n").filter(Boolean);
  const untracked = status.filter((l) => l.startsWith("??")).map((l) => l.slice(3));
  const files = [...nameStatus.map((l) => l.split("\t").pop()!), ...untracked];

  const out = [
    `# Review packet: ${name} ${r.tip.slice(0, 12)}`,
    "",
    `Made ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC by addon-kit/packet.ts. Range: ${r.label}.`,
    `The change: \`git -C ${top} diff ${r.base === EMPTY_TREE ? r.base : r.base.slice(0, 12)}${r.working ? "" : ` ${r.tip.slice(0, 12)}`}\`${r.working ? " (the working files against the base)" : ""}.`,
    `Read first: ${top}/${existsSync(join(top, "CLAUDE.md")) ? "CLAUDE.md" : "README.md"} (the family's CLAUDE.md is in your context).`,
    "",
    "## Already checked (a script's work: don't redo it)",
    "",
  ];
  const tipTree = git(top, "rev-parse", `${r.tip}^{tree}`);
  const dirty = status.length > 0;
  const now = r.working && dirty ? workTree(top) : undefined;
  const checks = [
    stampLine(r.working ? "HEAD's tree" : "the range's tip", stampOf(top, tipTree)),
    now ? stampLine("the working files as they are now", stampOf(top, now)) : undefined,
  ].filter(Boolean) as string[];
  out.push(...(checks.length ? checks : [`- check: no passing check on ${r.working ? "HEAD's tree" : "the range's tip"}: run the repository's check once (\`bun ${join(import.meta.dir, "q.ts")} check -- ${checkCommand(top)}\`) and say what it printed.`]));
  if (r.working && dirty && !(now && stampOf(top, now))) out.push("- the uncommitted files have no passing check of their own.");

  const subjects: string[] = [];
  const trailers: string[] = [];
  for (const c of commits) {
    const [sha, ...words] = c.split(" ");
    const problem = subjectProblem(words.join(" "));
    if (problem) subjects.push(`${sha} ${problem}: ${words.join(" ")}`);
    const t = trailerProblem(git(top, "log", "-1", "--format=%B", sha) ?? "");
    if (t) trailers.push(`${sha}: ${t}`);
  }
  out.push(subjects.length ? `- commit subjects (Conventional, lowercase): look at\n${subjects.map((s) => `  - ${s}`).join("\n")}` : "- commit subjects: Conventional, lowercase.");
  out.push(trailers.length ? `- trailers: AI co-author or "generated with" found\n${trailers.map((s) => `  - ${s}`).join("\n")}` : '- trailers: no AI co-author, no "generated with".');

  out.push("", `## Commits (${commits.length}${commits.length === MAX_COMMITS ? "+" : ""})`, "", ...(commits.length ? commits.map((c) => `- ${c}`) : ["(none)"]));
  out.push("", `## Diff stat${r.working ? " (commits and uncommitted files)" : ""}`, "", "```", git(top, "diff", "--stat=100", ...diffArgs) || "(nothing)", "```");
  out.push("", "## Files", "", ...nameStatus.map((l) => `- ${l.replaceAll("\t", " ")}`), ...untracked.map((f) => `- A ${f} (untracked)`));
  if (dirty) out.push("", "## Uncommitted", "", "```", ...status, "```");
  const drawn = cards(top, r, files, out);

  const file = join(cacheDir(top, "review"), `${r.tip.slice(0, 12)}.md`);
  writeFileSync(file, out.join("\n") + "\n");
  const checked = checks.length ? "check ✓" : "no check";
  return { file, summary: `${commits.length} commit${commits.length === 1 ? "" : "s"}, ${files.length} file${files.length === 1 ? "" : "s"}${dirty ? ` (${status.length} uncommitted)` : ""}, ${checked}${drawn ? `, ${drawn} cards` : ""}` };
}

if (import.meta.main) {
  const [repo, arg] = process.argv.slice(2);
  if (!repo) {
    console.error("usage: bun packet.ts <repo> [range]");
    process.exit(2);
  }
  const dir = isAbsolute(repo) || repo.startsWith(".") ? resolve(repo) : join(familyRoot(), repo);
  const res = packet(dir, arg);
  if (typeof res === "string") {
    console.error(res);
    process.exit(1);
  }
  console.log(`${res.file}\n${res.summary}`);
}
