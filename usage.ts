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
 * Cost is dollars at list price (PRICE below: per million tokens, by model
 * family, cache writes at the 5-minute or the 1-hour rate as the transcript
 * says), an estimate to compare runs by, not an invoice (a subscription
 * isn't billed by the token). The commits of a card are those its session
 * made: the `git commit` commands of its own transcript that did not fail
 * (a time window would catch other sessions' work).
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

/** cacheWrite1h is the part of cacheWrite kept an hour (the rest five minutes). */
export type Tally = { in: number; out: number; cacheWrite: number; cacheWrite1h: number; cacheRead: number; msgs: number };
export const zero = (): Tally => ({ in: 0, out: 0, cacheWrite: 0, cacheWrite1h: 0, cacheRead: 0, msgs: 0 });
export const add = (a: Tally, b: Tally): Tally => ({
  in: a.in + b.in,
  out: a.out + b.out,
  cacheWrite: a.cacheWrite + b.cacheWrite,
  cacheWrite1h: a.cacheWrite1h + b.cacheWrite1h,
  cacheRead: a.cacheRead + b.cacheRead,
  msgs: a.msgs + b.msgs,
});

/** List prices in dollars per million tokens by model family (the API price list of 25 October 2026: Opus 5.5 $4/$20, Sonnet 5.5 $2/$10, Haiku 5.5 $0.10/$0.50, Fable $10/$50; cache read as listed, a five-minute write 1.25x and an hour's 2x the input price; Haiku's read is its tenth, assumed). Edit when the prices move. */
export const PRICE: Record<string, { in: number; out: number; read: number; write5m: number; write1h: number }> = {
  opus: { in: 4, out: 20, read: 0.2, write5m: 5, write1h: 8 },
  sonnet: { in: 2, out: 10, read: 0.2, write5m: 2.5, write1h: 4 },
  haiku: { in: 0.1, out: 0.5, read: 0.01, write5m: 0.125, write1h: 0.2 },
  fable: { in: 10, out: 50, read: 0.25, write5m: 12.5, write1h: 20 },
};
export const family = (model: string) => /opus|sonnet|haiku|fable|mythos/.exec(model)?.[0].replace("mythos", "fable") ?? "other";

/** A tally in dollars at list price (a synthetic or unknown model costs nothing). */
export function units(t: Tally, model: string): number {
  const p = PRICE[family(model)];
  if (!p) return 0;
  const w1h = Math.min(t.cacheWrite1h, t.cacheWrite);
  return (t.in * p.in + t.out * p.out + t.cacheRead * p.read + (t.cacheWrite - w1h) * p.write5m + w1h * p.write1h) / 1e6;
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
        cacheWrite1h: u.cache_creation?.ephemeral_1h_input_tokens || 0,
        cacheRead: u.cache_read_input_tokens || 0,
        msgs: 1,
      },
    });
  }
  return out;
}

export type Spend = {
  /** dollars by who spent them: "main" or "helper:<agent type>" */
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
  /** commits the session made: its `git commit` commands that did not fail */
  commits: number;
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

/** A shell command that commits: some segment (split on && ; | and newlines) starts `git [-C dir] commit`, no --amend (it adds none). */
export function isCommit(command: string): boolean {
  return command.split(/&&|\|\||[;|\n]/).some((seg) => /^\s*git(\s+-C\s+\S+)*\s+commit\b/.test(seg) && !/--amend\b/.test(seg));
}

/** The commits a session made: its Bash `git commit` commands whose result was not an error (a hook's refusal is one; a commit the hooks let through prints nothing reliable, `-q` hides it, so the commands are counted, not the shas). */
export function commitCount(lines: Iterable<string>): number {
  const commands = new Set<string>();
  let made = 0;
  for (const line of lines) {
    if (line.includes('"tool_use"') && line.includes("commit")) {
      let o: any;
      try {
        o = JSON.parse(line);
      } catch {
        continue;
      }
      for (const c of Array.isArray(o?.message?.content) ? o.message.content : [])
        if (c?.type === "tool_use" && c.name === "Bash" && isCommit(String(c.input?.command ?? ""))) commands.add(c.id);
    } else if (commands.size && line.includes('"tool_result"')) {
      let o: any;
      try {
        o = JSON.parse(line);
      } catch {
        continue;
      }
      for (const c of Array.isArray(o?.message?.content) ? o.message.content : [])
        if (c?.type === "tool_result" && commands.delete(c.tool_use_id) && !c.is_error) made++;
    }
  }
  return made;
}

/** A session's spend, from its transcripts (undefined when it has none). */
export function spend(files: { file: string; kind: string }[]): Spend | undefined {
  if (files.length === 0) return undefined;
  const seen = new Set<string>();
  const s: Spend = { by: {}, models: {}, units: 0, first: "", last: "", turns: 0, contextPerTurn: 0, helpers: {}, commits: 0 };
  let context = 0;
  for (const { file, kind } of files) {
    if (kind !== "main") s.helpers[kind.slice(7)] = (s.helpers[kind.slice(7)] ?? 0) + 1;
    const text = readFileSync(file, "utf8").split("\n");
    if (kind === "main") s.commits += commitCount(text);
    for (const t of turns(text, seen)) {
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
  const key = `v2|${stamp(files)}`;
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

export function costOf(group: Pick<Card, "id" | "title" | "status" | "repos" | "repo" | "session">[], s: Spend): CardCost {
  const repos = [...new Set(group.flatMap((c) => (c.repos.length ? c.repos : [c.repo])))];
  const status = group.every((c) => c.status === "done") ? "done" : group.find((c) => c.status !== "done")!.status;
  const commits = s.commits;
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
export const M = (n: number) => `$${n >= 100 ? n.toFixed(0) : n.toFixed(2)}`;
/** One line for status.ts. */
export function line(s: Summary): string {
  const per = s.unitsPerCommit ? `, ${M(s.unitsPerCommit)} a commit` : "";
  return `${s.sessions} sessions, ${s.cards} cards (${s.done} done): ${M(s.units)}, median ${M(s.medianUnitsPerDoneCard)} a done card${per}, helpers ${Math.round(s.helperShare * 100)}%, ${Math.round(s.contextPerTurn / 1000)}k context a turn (bun addon-kit/usage.ts, ${s.at.slice(0, 10)})`;
}

// ── the report ──────────────────────────────────────────────────────────────
export function report(costs: CardCost[], sum: Summary): string {
  const rows = [...costs].sort((a, b) => (a.status === "done" ? 0 : 1) - (b.status === "done" ? 0 : 1) || b.units - a.units);
  const out = ["status       $  help  turns  ctx/turn  commits  $/commit  cards  session"];
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
    "no helper builder). Cost is dollars at list price, see `usage.ts`; the builder pilot and every",
    "later change is judged against these: dollars per done card and per commit, the helpers' share, the",
    "context re-read each turn. Written once (`usage.ts --baseline` refuses while this file exists):",
    "a later run is compared against it, not written over it.",
    "",
    `- sessions read: ${sum.sessions}, carrying ${sum.cards} cards (${sum.done} done), commits: ${sum.commits}`,
    `- total: ${M(sum.units)}, by model: ${mix}`,
    `- median done card: ${M(sum.medianUnitsPerDoneCard)}`,
    `- per commit: ${sum.unitsPerCommit ? M(sum.unitsPerCommit) : "-"}`,
    `- helpers' share: ${Math.round(sum.helperShare * 100)}%`,
    `- context re-read per main turn: ${Math.round(sum.contextPerTurn / 1000)}k tokens`,
    sum.skipped.length ? `- no transcript (deleted or not an id): ${sum.skipped.length} cards` : "",
    "",
    "## Done cards",
    "",
    "| $ | helpers | turns | commits | $/commit | cards | session |",
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
    costs.push(costOf(group, s));
  }
  const sum = summarise(costs, spends, skipped);
  mkdirSync(cacheDir(), { recursive: true });
  writeFileSync(summaryPath(), JSON.stringify(sum));
  if (args.includes("--json")) console.log(JSON.stringify({ summary: sum, cards: costs }, null, 2));
  else console.log(report(costs, sum));
  if (args.includes("--baseline")) {
    const path = join(import.meta.dir, "docs", "usage-baseline.md");
    if (existsSync(path)) {
      console.error(`\n${path} exists: the baseline is written once (delete it by hand to write a new one)`);
      process.exit(1);
    }
    writeFileSync(path, baseline(costs, sum));
    console.log(`\nwrote ${path}`);
  }
}
