/**
 * Launch night's rules (launch.ts): what is green, amber or red,
 * the ticks and notes file, the notes as Markdown. Pure functions and one small
 * file, so launch.test.ts reads them without a server.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export type Light = "green" | "amber" | "red" | "grey";
export type Row = { mark: string; label: string; text: string };
export type Verdict = { light: Light; reasons: string[] };

// (grey, nothing read yet, ranks above green: an unread source never passes for ready)
const RANK: Record<Light, number> = { green: 0, grey: 1, amber: 2, red: 3 };
export const worst = (...lights: Light[]): Light => lights.reduce((a, b) => (RANK[b] > RANK[a] ? b : a), "green" as Light);

// ── an addon's readiness, from preflight's rows ─────────────────────────────
// Only the rows that bear on launch night. Languages, cold reads, terms, notes
// and the review are left out: German and Spanish are hidden from the zips.
const LAUNCH_ROWS = new Set(["git", "version", "interface", "store ids", "live", "CI", "game data", "check", "test zip", "kit", "stores"]);
// A ✗ on these is red. A ✗ on the others, and any "!", is amber.
const RED_ROWS = new Set(["git", "version", "interface", "CI", "game data"]);

export function readiness(rows: Row[]): Verdict {
  const reasons: string[] = [];
  let light: Light = "green";
  for (const r of rows) {
    if (!LAUNCH_ROWS.has(r.label)) continue;
    if (r.mark === "✗") {
      light = worst(light, RED_ROWS.has(r.label) ? "red" : "amber");
      reasons.push(`${r.label}: ${r.text}`);
    } else if (r.mark === "!") {
      light = worst(light, "amber");
      reasons.push(`${r.label}: ${r.text}`);
    }
  }
  return { light, reasons };
}

// ── an addon's in-game checks, from the user's ticks ────────────────────────
export type Tick = "ok" | "broken";
export type Ticks = Record<string, Tick>; // "<addon>/<check>"

export function inGame(addon: string, checkIds: string[], ticks: Ticks): Verdict {
  const mine = checkIds.map((c) => ticks[`${addon}/${c}`]);
  const broken = mine.filter((t) => t === "broken").length;
  const ok = mine.filter((t) => t === "ok").length;
  if (broken) return { light: "red", reasons: [`${broken} check${broken > 1 ? "s" : ""} broken`] };
  if (ok === checkIds.length && ok > 0) return { light: "green", reasons: [] };
  if (ok === 0) return { light: "grey", reasons: ["not tested yet"] };
  return { light: "amber", reasons: [`${checkIds.length - ok} of ${checkIds.length} checks left`] };
}

// ── the Forever build: the pin against wago.tools ───────────────────────────
// `latest.ts` says "- forever: wowf 1.60.1.70707 → **1.60.1.70753**" or
// "- forever: wowf 1.60.1.70707, the latest".
export type Build = { pin: string; latest: string };

export function parseBuild(out: string): Build | undefined {
  const m = out.match(/^- forever: \S+ (\d+(?:\.\d+)+)(?:, the latest| → \*\*(\d+(?:\.\d+)+)\*\*)/m);
  return m ? { pin: m[1], latest: m[2] ?? m[1] } : undefined;
}

// 1.60.1 → 16001, 1.15.9 → 11509 (the major, then two digits each)
export const interfaceFor = (build: string): number => {
  const [a, b, c] = build.split(".").map(Number);
  return a * 10000 + b * 100 + c;
};

export function buildLight(b: Build | undefined, toc: number): Verdict {
  if (!b) return { light: "amber", reasons: ["wago.tools was not read"] };
  const fam = (v: string) => v.split(".").slice(0, 3).join(".");
  const reasons: string[] = [];
  const latestInterface = interfaceFor(b.latest);
  if (latestInterface !== toc) {
    reasons.push(`wago.tools has ${fam(b.latest)}: its interface is ${latestInterface}, our TOCs say ${toc}`);
    return { light: "red", reasons };
  }
  if (b.latest !== b.pin) {
    reasons.push(`a newer build, ${b.latest} (pinned ${b.pin}): the pins job carries it at 04:17 UTC`);
    return { light: "amber", reasons };
  }
  return { light: "green", reasons: [] };
}

// ── the data chain, from status.ts's latest runs ────────────────────────────
export type Run = { workflow: string; status: string; conclusion: string };
export type RepoState = { name: string; runs?: Run[]; prs?: { number: number; title: string }[] };

export function chain(repos: RepoState[], now: number, chainCheckAt: number): Verdict {
  const reasons: string[] = [];
  let light: Light = "green";
  for (const r of repos) {
    // (gh gave nothing for it: the runs are unknown, not fine)
    if (!r.runs && !r.prs) {
      light = worst(light, "grey");
      reasons.push(`${r.name}: runs not read (gh)`);
      continue;
    }
    for (const run of r.runs ?? []) {
      if (run.status !== "completed") {
        light = worst(light, "amber");
        reasons.push(`${r.name}: ${run.workflow} is running`);
      } else if (!["success", "skipped", "cancelled"].includes(run.conclusion)) {
        light = worst(light, "red");
        reasons.push(`${r.name}: ${run.workflow} ${run.conclusion}`);
      }
    }
    for (const pr of r.prs ?? []) {
      light = worst(light, now > chainCheckAt ? "red" : "amber");
      reasons.push(`${r.name}: #${pr.number} ${pr.title} is waiting`);
    }
  }
  return { light, reasons };
}

// ── the site and the inbox ──────────────────────────────────────────────────
export type Probe = { name: string; url: string; status: number; ms: number; error?: string };

export function infra(probes: Probe[]): Verdict {
  const reasons: string[] = [];
  let light: Light = "green";
  for (const p of probes) {
    if (p.error || p.status === 0 || p.status >= 500) {
      light = "red";
      reasons.push(`${p.name}: ${p.error ?? `HTTP ${p.status}`}`);
    } else if (p.ms > 3000 || p.status >= 400) {
      light = worst(light, "amber");
      reasons.push(`${p.name}: ${p.status >= 400 ? `HTTP ${p.status}` : `slow, ${p.ms} ms`}`);
    }
  }
  return { light, reasons };
}

// ── the board ───────────────────────────────────────────────────────────────
export type Card = { id: string; title: string; status: string; repos?: string[] };

export function board(cards: Card[], launchRepos: Set<string>): Verdict {
  const reasons: string[] = [];
  let light: Light = "green";
  for (const c of cards) {
    if (c.status === "done") continue;
    const touches = (c.repos ?? []).some((r) => launchRepos.has(r));
    if (!touches) continue;
    if (c.status === "blocked") {
      light = worst(light, "red");
      reasons.push(`${c.title}: blocked`);
    } else if (c.status !== "ready-to-push") {
      light = worst(light, "amber");
      reasons.push(`${c.title}: ${c.status}`);
    }
  }
  return { light, reasons };
}

// ── the ticks and notes file ────────────────────────────────────────────────
export type Severity = "blocker" | "bug" | "nit";
export type Note = { id: string; at: string; addon: string; severity: Severity; text: string; shot?: string };
export type State = {
  ticks: Ticks;
  steps: Record<string, boolean>;
  answers: Record<string, { done: boolean; text: string }>;
  notes: Note[];
};

export const emptyState = (): State => ({ ticks: {}, steps: {}, answers: {}, notes: [] });

export function readState(file: string): State {
  try {
    if (!existsSync(file)) return emptyState();
    return { ...emptyState(), ...JSON.parse(readFileSync(file, "utf8")) };
  } catch {
    return emptyState();
  }
}

/** Written beside, then renamed: a crash never leaves half a file. */
export function writeState(file: string, state: State): void {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(state, null, 2)}\n`);
  renameSync(tmp, file);
}

const OK_TICK = (v: unknown): v is Tick | "untested" => v === "ok" || v === "broken" || v === "untested";
const SEVERITIES = new Set<Severity>(["blocker", "bug", "nit"]);

/** One change from the page, checked: nothing it sends is trusted. Returns the new state, or the reason it was refused. */
export function apply(state: State, change: Record<string, unknown>, now = new Date()): State | string {
  const next: State = structuredClone(state);
  const str = (v: unknown, max = 2000) => (typeof v === "string" ? v.slice(0, max) : undefined);
  switch (change.op) {
    case "tick": {
      const key = str(change.key, 120);
      if (!key || !/^[\w-]+\/[\w-]+$/.test(key) || !OK_TICK(change.value)) return "tick: a key and ok, broken or untested";
      if (change.value === "untested") delete next.ticks[key];
      else next.ticks[key] = change.value;
      return next;
    }
    case "step": {
      const id = str(change.id, 80);
      if (!id || typeof change.done !== "boolean") return "step: an id and done";
      if (change.done) next.steps[id] = true;
      else delete next.steps[id];
      return next;
    }
    case "answer": {
      const id = str(change.id, 80);
      if (!id || typeof change.done !== "boolean") return "answer: an id and done";
      next.answers[id] = { done: change.done, text: str(change.text, 1000) ?? "" };
      return next;
    }
    case "note": {
      const text = str(change.text)?.trim();
      const addon = str(change.addon, 80);
      if (!text || !addon || !SEVERITIES.has(change.severity as Severity)) return "note: an addon, a severity and some text";
      const shot = str(change.shot, 300);
      next.notes.push({ id: `n${now.getTime().toString(36)}${next.notes.length}`, at: now.toISOString(), addon, severity: change.severity as Severity, text, ...(shot ? { shot } : {}) });
      return next;
    }
    case "drop": {
      const id = str(change.id, 80);
      next.notes = next.notes.filter((n) => n.id !== id);
      return next;
    }
    default:
      return `unknown change ${String(change.op)}`;
  }
}

// ── the night as Markdown, for the morning's session ────────────────────────
type Content = { addons: { id: string; name: string; checks: { id: string; look: string; todo: string; fix: string }[] }[]; questions: { id: string; title: string }[] };

export function notesMarkdown(state: State, content: Content): string {
  const out: string[] = ["# Launch night", ""];
  const broken = content.addons.flatMap((a) => a.checks.filter((c) => state.ticks[`${a.id}/${c.id}`] === "broken").map((c) => ({ a, c })));
  out.push("## Broken checks", "");
  if (!broken.length) out.push("None ticked broken.");
  for (const { a, c } of broken) out.push(`- **${a.name}**: ${c.look}. To do: ${c.todo} (${c.fix})`);
  out.push("", "## Notes", "");
  if (!state.notes.length) out.push("None written.");
  for (const n of state.notes) out.push(`- [${n.severity}] **${n.addon}** ${n.at.slice(11, 16)}Z: ${n.text}${n.shot ? ` (screenshot: ${n.shot})` : ""}`);
  out.push("", "## Open questions", "");
  for (const q of content.questions) {
    const a = state.answers[q.id];
    out.push(`- ${a?.done ? "[x]" : "[ ]"} ${q.title}${a?.text ? `: ${a.text}` : ""}`);
  }
  const untested = content.addons.filter((a) => a.checks.some((c) => !state.ticks[`${a.id}/${c.id}`]));
  out.push("", "## Not fully tested", "");
  out.push(untested.length ? untested.map((a) => a.name).join(", ") : "Every check ticked.");
  return `${out.join("\n")}\n`;
}
