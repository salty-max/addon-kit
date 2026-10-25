/**
 * What a card costs: the tokens a task's session and its helpers spent, per
 * finished card and per commit (a session that carried several cards, one
 * after another, shares its cost among them; it is counted once), read from Claude Code's transcripts and
 * attributed by the card's session id (a card names its session; the
 * helpers' transcripts sit under theirs). The measure the builder pilot and
 * every model or effort change is judged against.
 *
 *   bun addon-kit/usage.ts                  the cards on the board (done, then the open ones)
 *   bun addon-kit/usage.ts --since 2026-10-20   only cards updated since
 *   bun addon-kit/usage.ts --json           the same as JSON
 *   bun addon-kit/usage.ts --baseline       also write docs/usage-baseline.md (today's numbers, to judge a change by)
 *
 * Cost is in input-token equivalents (millions, "M"): output 5, cache write
 * 1.25, cache read 0.1, then a factor by model family (MODEL_FACTOR: the
 * list-price ratio, edit it when the prices move). It is an estimate to
 * compare runs by, not an invoice. The commits of a card are those made in
 * its repositories between the session's first and last message: the board's
 * lock lets one card write a repository at a time, so the window is its own.
 * A session's transcripts are read once, the result cached per session in
 * the kit's .cache/usage/ (keyed by the files' sizes and times); the summary
 * status.ts shows is .cache/usage/summary.json.
 *
 * A floor, not a ceiling: a transcript Claude Code has deleted is gone, and a
 * card whose session id isn't a transcript's name (a name, a short id) is
 * left out and said so.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { cards, type Card } from "./board";
import { familyRoot } from "./root";

export type Tally = { in: number; out: number; cacheWrite: number; cacheRead: number; msgs: number };
export const zero = (): Tally => ({ in: 0, out: 0, cacheWrite: 0, cacheRead: 0, msgs: 0 });
export const add = (a: Tally, b: Tally): Tally => ({
  in: a.in + b.in,
  out: a.out + b.out,
  cacheWrite: a.cacheWrite + b.cacheWrite,
  cacheRead: a.cacheRead + b.cacheRead,
  msgs: a.msgs + b.msgs,
});

/** The price ratios against one input token (and by model family, the list-price ratio to Opus). */
export const RATIO = { in: 1, out: 5, cacheWrite: 1.25, cacheRead: 0.1 };
export const MODEL_FACTOR: Record<string, number> = { opus: 1, sonnet: 0.2, haiku: 0.07 };
export const family = (model: string) => /opus|sonnet|haiku/.exec(model)?.[0] ?? "other";

/** A tally in input-token equivalents, by the model family's factor. */
export function units(t: Tally, model: string): number {
  const f = MODEL_FACTOR[family(model)] ?? 1;
  return (t.in * RATIO.in + t.out * RATIO.out + t.cacheWrite * RATIO.cacheWrite + t.cacheRead * RATIO.cacheRead) * f;
}

export type Turn = { id: string; ts: string; model: string; tally: Tally };

/** The assistant messages of one transcript's lines, each once (a message id and request id seen already, in `seen`, is skipped). */
export function turns(lines: Iterable<string>, seen: Set<string>): Turn[] {
  const out: Turn[] = [];
  for (const line of lines) {
    if (!line.includes('"usage"')) continue;
    let o: any;
    try {
      o = JSON.parse(line);
    } catch {
      continue;
    }
    const msg = o?.message;
    const u = msg?.usage;
    if (!u || typeof o.timestamp !== "string") continue;
    const key = `${msg.id ?? ""}|${o.requestId ?? ""}`;
    if (key !== "|" && seen.has(key)) continue;
    seen.add(key);
    out.push({
      id: key,
      ts: o.timestamp,
      model: String(msg.model ?? "?"),
      tally: {
        in: u.input_tokens || 0,
        out: u.output_tokens || 0,
        cacheWrite: u.cache_creation_input_tokens || 0,
        cacheRead: u.cache_read_input_tokens || 0,
        msgs: 1,
      },
    });
  }
  return out;
}

export type Spend = {
  /** units by who spent them: "main" or "helper:<agent type>" */
  by: Record<string, number>;
  /** the raw tally by model family */
  models: Record<string, Tally>;
  units: number;
  first: string;
  last: string;
  /** main-session turns, and the context each re-read on average */
  turns: number;
  contextPerTurn: number;
  /** helper runs by agent type */
  helpers: Record<string, number>;
};

/** Where Claude Code keeps this family's transcripts (the folder and its worktrees', one project folder each). */
export function projectDirs(root = familyRoot(), config = process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), ".claude")): string[] {
  const base = join(config, "projects");
  if (!existsSync(base)) return [];
  const name = root.replace(/[/.]/g, "-");
  return readdirSync(base)
    .filter((d) => d === name || d.startsWith(`${name}-`))
    .sort()
    .map((d) => join(base, d));
}

/** A session's transcript files: its own, then every helper's with the agent type its meta names. */
export function sessionFiles(dirs: string[], sid: string): { file: string; kind: string }[] {
  const out: { file: string; kind: string }[] = [];
  for (const d of dirs) {
    const main = join(d, `${sid}.jsonl`);
    if (!existsSync(main)) continue;
    out.push({ file: main, kind: "main" });
    const sub = join(d, sid, "subagents");
    if (!existsSync(sub)) continue;
    for (const f of readdirSync(sub).filter((n) => n.endsWith(".jsonl"))) {
      let kind = "helper:?";
      try {
        const m = JSON.parse(readFileSync(join(sub, f.replace(/\.jsonl$/, ".meta.json")), "utf8"));
        kind = `helper:${m.agentType ?? m.subagent_type ?? m.type ?? "?"}`;
      } catch {}
      out.push({ file: join(sub, f), kind });
    }
  }
  return out;
}

/** A session's spend, from its transcripts (undefined when it has none). */
export function spend(files: { file: string; kind: string }[]): Spend | undefined {
  if (files.length === 0) return undefined;
  const seen = new Set<string>();
  const s: Spend = { by: {}, models: {}, units: 0, first: "", last: "", turns: 0, contextPerTurn: 0, helpers: {} };
  let context = 0;
  for (const { file, kind } of files) {
    if (kind !== "main") s.helpers[kind.slice(7)] = (s.helpers[kind.slice(7)] ?? 0) + 1;
    for (const t of turns(readFileSync(file, "utf8").split("\n"), seen)) {
      const fam = family(t.model);
      const u = units(t.tally, t.model);
      s.by[kind] = (s.by[kind] ?? 0) + u;
      s.models[fam] = add(s.models[fam] ?? zero(), t.tally);
      s.units += u;
      if (!s.first || t.ts < s.first) s.first = t.ts;
      if (t.ts > s.last) s.last = t.ts;
      if (kind === "main") {
        s.turns++;
        context += t.tally.in + t.tally.cacheRead + t.tally.cacheWrite;
      }
    }
  }
  s.contextPerTurn = s.turns ? Math.round(context / s.turns) : 0;
  return s.units || s.turns ? s : undefined;
}

// ── the per-session cache ───────────────────────────────────────────────────
const cacheDir = () => join(import.meta.dir, ".cache", "usage");
const stamp = (files: { file: string }[]) => files.map(({ file }) => `${basename(file)}:${statSync(file).size}:${Math.floor(statSync(file).mtimeMs)}`).join(",");

export function spendOf(dirs: string[], sid: string, dir = cacheDir()): Spend | undefined {
  const files = sessionFiles(dirs, sid);
  if (files.length === 0) return undefined;
  const key = stamp(files);
  const path = join(dir, `${sid}.json`);
  try {
    const c = JSON.parse(readFileSync(path, "utf8"));
    if (c.key === key) return c.spend;
  } catch {}
  const s = spend(files);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path, JSON.stringify({ key, spend: s ?? null }));
  return s;
}

// ── commits ─────────────────────────────────────────────────────────────────
/** Commits made in a repository between two instants (no merges). */
export function commitsIn(repoDir: string, from: string, to: string): number {
  if (!existsSync(join(repoDir, ".git"))) return 0;
  const p = Bun.spawnSync(["git", "log", "--no-merges", `--since=${from}`, `--until=${to}`, "--format=%H"], { cwd: repoDir, stderr: "ignore" });
  return p.exitCode === 0 ? p.stdout.toString().split("\n").filter(Boolean).length : 0;
}

// ── a card's cost ───────────────────────────────────────────────────────────
/** One session's cost: the cards it carried (a session may carry several, one after another). */
export type CardCost = {
  session: string;
  cards: number;
  title: string;
  status: string;
  repos: string[];
  units: number;
  helperShare: number;
  turns: number;
  contextPerTurn: number;
  commits: number;
  unitsPerCommit?: number;
  models: string[];
  first: string;
  last: string;
};

export function costOf(group: Pick<Card, "id" | "title" | "status" | "repos" | "repo" | "session">[], s: Spend, root: string): CardCost {
  const repos = [...new Set(group.flatMap((c) => (c.repos.length ? c.repos : [c.repo])))];
  const status = group.every((c) => c.status === "done") ? "done" : group.find((c) => c.status !== "done")!.status;
  // (a minute either side: a commit lands just after the last message)
  const to = new Date(Date.parse(s.last) + 60_000).toISOString();
  const commits = repos.reduce((n, r) => n + commitsIn(join(root, r), s.first, to), 0);
  const helpers = Object.entries(s.by).filter(([k]) => k !== "main").reduce((n, [, u]) => n + u, 0);
  return {
    session: group[0]!.session,
    cards: group.length,
    title: group.length > 1 ? `${group[0]!.title} (+${group.length - 1} more)` : group[0]!.title,
    status,
    repos,
    units: s.units,
    helperShare: s.units ? helpers / s.units : 0,
    turns: s.turns,
    contextPerTurn: s.contextPerTurn,
    commits,
    unitsPerCommit: commits ? s.units / commits : undefined,
    models: Object.keys(s.models).sort(),
    first: s.first,
    last: s.last,
  };
}

export type Summary = {
  at: string;
  /** sessions read, the cards they carried, and the done ones among them */
  sessions: number;
  cards: number;
  done: number;
  units: number;
  commits: number;
  unitsPerCommit?: number;
  medianUnitsPerDoneCard: number;
  helperShare: number;
  contextPerTurn: number;
  byModel: Record<string, number>;
  skipped: string[];
};

const median = (xs: number[]) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]! : 0);

export function summarise(costs: CardCost[], spends: Spend[], skipped: string[], at = new Date().toISOString()): Summary {
  const total = costs.reduce((n, c) => n + c.units, 0);
  const commits = costs.reduce((n, c) => n + c.commits, 0);
  const done = costs.filter((c) => c.status === "done");
  const perCard = done.flatMap((c) => Array<number>(c.cards).fill(c.units / c.cards));
  const byModel: Record<string, number> = {};
  let turns = 0;
  let context = 0;
  for (const s of spends) {
    for (const [fam, t] of Object.entries(s.models)) byModel[fam] = (byModel[fam] ?? 0) + units(t, fam);
    turns += s.turns;
    context += s.contextPerTurn * s.turns;
  }
  const helpers = costs.reduce((n, c) => n + c.units * c.helperShare, 0);
  return {
    at,
    sessions: costs.length,
    cards: costs.reduce((n, c) => n + c.cards, 0),
    done: done.reduce((n, c) => n + c.cards, 0),
    units: total,
    commits,
    unitsPerCommit: commits ? total / commits : undefined,
    medianUnitsPerDoneCard: median(perCard),
    helperShare: total ? helpers / total : 0,
    contextPerTurn: turns ? Math.round(context / turns) : 0,
    byModel,
    skipped,
  };
}

export const summaryPath = () => join(cacheDir(), "summary.json");
/** The last run's summary, for status.ts (never a scan). */
export function lastSummary(path = summaryPath()): Summary | undefined {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return undefined;
  }
}
export const M = (n: number) => `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M`;
/** One line for status.ts. */
export function line(s: Summary): string {
  const per = s.unitsPerCommit ? `, ${M(s.unitsPerCommit)} a commit` : "";
  return `${s.sessions} sessions, ${s.cards} cards (${s.done} done): ${M(s.units)} units, median ${M(s.medianUnitsPerDoneCard)} a done card${per}, helpers ${Math.round(s.helperShare * 100)}%, ${Math.round(s.contextPerTurn / 1000)}k context a turn (bun addon-kit/usage.ts, ${s.at.slice(0, 10)})`;
}

// ── the report ──────────────────────────────────────────────────────────────
export function report(costs: CardCost[], sum: Summary): string {
  const rows = [...costs].sort((a, b) => (a.status === "done" ? 0 : 1) - (b.status === "done" ? 0 : 1) || b.units - a.units);
  const out = ["status   units  help  turns  ctx/turn  commits  units/commit  cards  session"];
  for (const c of rows)
    out.push(
      `${c.status.padEnd(8)} ${M(c.units).padStart(6)} ${(Math.round(c.helperShare * 100) + "%").padStart(5)} ${String(c.turns).padStart(6)} ${(Math.round(c.contextPerTurn / 1000) + "k").padStart(8)} ${String(c.commits).padStart(8)} ${(c.unitsPerCommit ? M(c.unitsPerCommit) : "-").padStart(13)}  ${String(c.cards).padStart(5)}  ${c.title.slice(0, 60)} [${c.models.join("+")}]`,
    );
  out.push("", line(sum));
  out.push(`by model: ${Object.entries(sum.byModel).map(([k, v]) => `${k} ${M(v)}`).join(", ")}`);
  if (sum.skipped.length) out.push(`no transcript for: ${sum.skipped.join(", ")}`);
  return out.join("\n");
}

export function baseline(costs: CardCost[], sum: Summary): string {
  const done = costs.filter((c) => c.status === "done");
  const mix = Object.entries(sum.byModel).map(([k, v]) => `${k} ${M(v)}`).join(", ");
  return [
    `# Usage baseline, ${sum.at.slice(0, 10)}`,
    "",
    "What a card cost before the model and effort changes of 25 October 2026 (main sessions all on Opus,",
    "no helper builder). Cost is input-token equivalents, see `usage.ts`; the builder pilot and every",
    "later change is judged against these: units per done card and per commit, the helpers' share, the",
    "context re-read each turn. Regenerate with `bun addon-kit/usage.ts --baseline` (this file keeps",
    "the day it was written, so write it once and compare new runs against it).",
    "",
    `- sessions read: ${sum.sessions}, carrying ${sum.cards} cards (${sum.done} done), commits in their windows: ${sum.commits}`,
    `- total: ${M(sum.units)} units, by model: ${mix}`,
    `- median done card: ${M(sum.medianUnitsPerDoneCard)} units`,
    `- per commit: ${sum.unitsPerCommit ? M(sum.unitsPerCommit) : "-"} units`,
    `- helpers' share: ${Math.round(sum.helperShare * 100)}%`,
    `- context re-read per main turn: ${Math.round(sum.contextPerTurn / 1000)}k tokens`,
    sum.skipped.length ? `- no transcript (deleted or not an id): ${sum.skipped.length} cards` : "",
    "",
    "## Done cards",
    "",
    "| units | helpers | turns | commits | units/commit | cards | session |",
    "|---:|---:|---:|---:|---:|---:|---|",
    ...done.sort((a, b) => b.units - a.units).map((c) => `| ${M(c.units)} | ${Math.round(c.helperShare * 100)}% | ${c.turns} | ${c.commits} | ${c.unitsPerCommit ? M(c.unitsPerCommit) : "-"} | ${c.cards} | ${c.title} |`),
    "",
  ]
    .filter((l, i, a) => l !== "" || a[i - 1] !== "")
    .join("\n");
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const sinceAt = args.indexOf("--since");
  const since = sinceAt >= 0 ? args[sinceAt + 1] : undefined;
  const root = familyRoot();
  const dirs = projectDirs(root);
  const costs: CardCost[] = [];
  const spends: Spend[] = [];
  const skipped: string[] = [];
  const bySession = new Map<string, Card[]>();
  for (const card of cards(true)) {
    if (since && card.updated < since) continue;
    bySession.set(card.session, [...(bySession.get(card.session) ?? []), card]);
  }
  for (const [sid, group] of bySession) {
    const s = sid ? spendOf(dirs, sid) : undefined;
    if (!s) {
      skipped.push(...group.map((c) => c.id));
      continue;
    }
    spends.push(s);
    costs.push(costOf(group, s, root));
  }
  const sum = summarise(costs, spends, skipped);
  mkdirSync(cacheDir(), { recursive: true });
  writeFileSync(summaryPath(), JSON.stringify(sum));
  if (args.includes("--json")) console.log(JSON.stringify({ summary: sum, cards: costs }, null, 2));
  else console.log(report(costs, sum));
  if (args.includes("--baseline")) {
    const path = join(import.meta.dir, "docs", "usage-baseline.md");
    writeFileSync(path, baseline(costs, sum));
    console.log(`\nwrote ${path}`);
  }
}
