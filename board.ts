/**
 * The task board: one Markdown card per task in ~/code/wow-addons/board/,
 * written and listed here so no session hand-edits its front matter (repo,
 * title, status, session, updated, repos, waits). Its body says what to
 * try, what's committed and what's left. The desktop panel reads the same
 * files.
 *
 *   bun addon-kit/board.ts add <repo> "<title>" [--repos a,b] [--status s] [--on id] [--session id] [fields]
 *   bun addon-kit/board.ts set <id> [--repos a,b] [--status s] [--on id] [--title t] [--session id] [fields]
 *   bun addon-kit/board.ts list [--all] [--json]
 *   bun addon-kit/board.ts held [repo…]
 *
 *   repos    every repository the task writes (add: the card's repo); a
 *            card holds them while it is running or blocked
 *   fields   --try "…" --committed "…" --left "…" (each its section of the
 *            body, replaced), --body "…" (the whole body)
 *   status   running, blocked, waiting-test, waiting-review, ready-to-push,
 *            done (add: running); list puts what waits on the user first
 *            and leaves done out unless --all
 *   on       blocked: the card it waits on (cleared when it leaves blocked)
 *   session  the session's name or id (add: $CLAUDE_CODE_SESSION_ID)
 *
 * The board is the lock of "two sessions never write the same repository at
 * once". A card that comes to hold a repository another session's running or
 * blocked card holds is written, and warned about on stderr: the session
 * sets it blocked --on the holder and waits. Cards waiting on the user in
 * the same repository are a note: their commits go out with the next push.
 * `held` lists who holds what (each repository named, or all), exit 1 when
 * another session's card holds one named. Moving a card to done names the
 * blocked cards it frees.
 *
 * add prints the card's id: <repo>-<a slug of the title>. A card added or
 * moved to another status gets a line in the harness's event log (events.ts).
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { logEvent, type Tone } from "./events";
import { familyPath } from "./root";

// (in the order the list shows them: what waits on the user first, then
// what waits on another card, then what runs)
export const STATUSES = ["waiting-test", "waiting-review", "ready-to-push", "blocked", "running", "done"] as const;
export type Status = (typeof STATUSES)[number];
export type Card = { id: string; repo: string; title: string; status: Status; session: string; updated: string; repos: string[]; waits: string; body: string };
const KEYS = ["repo", "title", "status", "session", "updated"] as const;
/** A card in the middle of its task: it holds its repositories. */
export const HOLDS: readonly Status[] = ["running", "blocked"];
/** A card waiting on the user: its commits are in its repositories, unpushed. */
export const WAITS: readonly Status[] = ["waiting-test", "waiting-review", "ready-to-push"];
const SECTIONS = { try: "Try", committed: "Committed", left: "Left" } as const;

export const boardDir = () => familyPath("board");

// ── the card's text, pure (harness.test.ts) ─────────────────────────────────
// (bare where any YAML reads it back as the same string, quoted elsewhere:
// a date or a number too, which YAML 1.1 would turn into one)
const quote = (v: string) =>
  /^[\w./][\w ./@+(),':-]*$/.test(v) && !/(: |:$| $)/.test(v) && !/^(true|false|null|yes|no|on|off|[\d.+-]+)$/i.test(v) && !/^\d{4}-\d\d-\d\d/.test(v)
    ? v
    : JSON.stringify(v);

// A value as written, quoted or not, a comment after a quoted one left out.
function unquote(v: string): string {
  if (!v.startsWith('"')) return v.replace(/^'(.*)'$/, "$1");
  try {
    return JSON.parse(v);
  } catch {
    const m = v.match(/^"((?:[^"\\]|\\.)*)"/);
    return m ? JSON.parse(`"${m[1]}"`) : v;
  }
}

// A card's repositories as written: none when they are its repo alone (every older card).
const isOwn = (c: Pick<Card, "repo" | "repos">) => c.repos.length === 1 && c.repos[0] === c.repo;

export function format(c: Card): string {
  const keys = KEYS.map((k) => `${k}: ${quote(c[k])}`);
  if (c.repos.length > 0 && !isOwn(c)) keys.push(`repos: ${quote(c.repos.join(", "))}`);
  if (c.waits) keys.push(`waits: ${quote(c.waits)}`);
  return `---\n${keys.join("\n")}\n---\n${c.body.replace(/^\n+/, "").trimEnd()}\n`;
}

/** `a, b` or `a,b` as a list; a repo that names one folder is its own list (`every repo` names none). */
export function repoList(text: string): string[] {
  return [...new Set(text.split(",").map((r) => r.trim()).filter(Boolean))];
}
const ownRepos = (repo: string) => (/^[a-z0-9][\w.-]*$/i.test(repo) && repo !== "every-repo" ? [repo] : []);

export function parseCard(id: string, text: string): Card {
  const m = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  const fields: Record<string, string> = {};
  for (const line of (m?.[1] ?? "").split("\n")) {
    const kv = line.match(/^(\w+):\s*(.*)$/);
    if (!kv) continue;
    const v = kv[2].trim();
    fields[kv[1]] = unquote(v);
  }
  return {
    id,
    repo: fields.repo ?? "",
    title: fields.title ?? id,
    status: (STATUSES as readonly string[]).includes(fields.status) ? (fields.status as Status) : "running",
    session: fields.session ?? "",
    updated: fields.updated ?? "",
    repos: fields.repos !== undefined ? repoList(fields.repos) : ownRepos(fields.repo ?? ""),
    waits: fields.waits ?? "",
    body: m ? m[2] : text,
  };
}

// A section of the body (## Try, ## Committed, ## Left) replaced, or added
// in its place among the three.
export function setSection(body: string, heading: string, text: string): string {
  const order = Object.values(SECTIONS) as string[];
  const parts = new Map<string, string>();
  const head: string[] = [];
  let cur: string | undefined;
  for (const line of body.split("\n")) {
    const h = line.match(/^## (.+)$/);
    if (h) parts.set((cur = h[1].trim()), "");
    else if (cur) parts.set(cur, parts.get(cur) + line + "\n");
    else head.push(line);
  }
  parts.set(heading, text.trim() + "\n");
  const names = [...parts.keys()].sort((a, b) => {
    const [i, j] = [order.indexOf(a), order.indexOf(b)];
    return i < 0 || j < 0 ? 0 : i - j;
  });
  const top = head.join("\n").trim();
  return [top, ...names.map((n) => `## ${n}\n\n${parts.get(n)!.trim()}\n`)].filter(Boolean).join("\n").trimEnd() + "\n";
}

export function slug(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f'\u2019]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40)
    .replace(/-$/, "");
}

export function now(d = new Date()): string {
  const off = -d.getTimezoneOffset();
  const pad = (n: number) => String(Math.abs(n)).padStart(2, "0");
  const local = new Date(d.getTime() + off * 60_000).toISOString().slice(0, 19);
  return `${local}${off >= 0 ? "+" : "-"}${pad(Math.trunc(off / 60))}:${pad(off % 60)}`;
}

export function ago(iso: string, from = Date.now()): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const m = Math.round((from - t) / 60_000);
  return m < 60 ? `${m}m` : m < 48 * 60 ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)}d`;
}

// ── the board ───────────────────────────────────────────────────────────────
export function cards(all = false): Card[] {
  const dir = boardDir();
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => parseCard(f.slice(0, -3), readFileSync(join(dir, f), "utf8")))
    .filter((c) => all || c.status !== "done")
    .sort((a, b) => STATUSES.indexOf(a.status) - STATUSES.indexOf(b.status) || b.updated.localeCompare(a.updated));
}

/** The repositories as a list says them: the repo, its others after a +. */
export function where(c: Card): string {
  const others = c.repos.filter((r) => r !== c.repo);
  return others.length ? `${c.repo}+${others.join("+")}` : c.repo;
}

export function lines(list: Card[], from = Date.now()): string[] {
  const wi = Math.max(0, ...list.map((c) => c.id.length));
  const wr = Math.max(0, ...list.map((c) => where(c).length));
  return list.map((c) => `${c.status.padEnd(14)} ${where(c).padEnd(wr)}  ${c.id.padEnd(wi)}  ${c.title}${c.waits ? ` (on ${c.waits})` : ""}  ${ago(c.updated, from)}`.trimEnd());
}

/**
 * What stands in the way of `card` writing its repositories: another
 * session's cards in the middle of a task there (`held`: it waits for them),
 * and cards waiting on the user there (`pending`: their commits go out with
 * the next push). A card of the same session, or the card itself, is neither.
 */
export function conflicts(card: Pick<Card, "id" | "session" | "repos">, list: Card[]): { held: Card[]; pending: Card[] } {
  const isOther = (c: Card) => c.id !== card.id && !(card.session && c.session === card.session);
  const shares = (c: Card) => c.repos.some((r) => card.repos.includes(r));
  const near = list.filter((c) => isOther(c) && shares(c));
  return { held: near.filter((c) => HOLDS.includes(c.status)), pending: near.filter((c) => WAITS.includes(c.status)) };
}

/** The warnings a session reads when its card comes to hold a repository: what to do, and why. */
export function warnings(card: Card, list: Card[]): string[] {
  if (!HOLDS.includes(card.status)) return [];
  const { held, pending } = conflicts(card, list);
  const shared = (c: Card) => c.repos.filter((r) => card.repos.includes(r)).join(", ");
  const out = held.map((c) => `held: ${shared(c)} by ${c.id} (${c.status}, session ${c.session || "?"}): set ${card.id} --status blocked --on ${c.id} and wait`);
  for (const c of pending) out.push(`note: ${shared(c)} has ${c.id} (${c.status}) waiting on the user: its commits go out with the next push`);
  return out;
}

type Opts = Partial<Record<"status" | "title" | "session" | "body" | "repos" | "on" | keyof typeof SECTIONS, string>> & { all?: boolean; json?: boolean };

export function options(argv: string[]): { rest: string[]; o: Opts } | string {
  const o: Opts = {};
  const rest: string[] = [];
  const valued = ["status", "title", "session", "body", "repos", "on", ...Object.keys(SECTIONS)];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--all" || a === "--json") o[a.slice(2) as "all" | "json"] = true;
    else if (a.startsWith("--") && valued.includes(a.slice(2))) {
      if (argv[i + 1] === undefined) return `${a} takes a value`;
      (o as Record<string, string>)[a.slice(2)] = argv[++i];
    } else if (a.startsWith("--")) return `unknown option ${a}`;
    else rest.push(a);
  }
  if (o.status && !(STATUSES as readonly string[]).includes(o.status)) return `status is one of ${STATUSES.join(", ")}`;
  if (o.on !== undefined && o.status !== undefined && o.status !== "blocked") return "--on goes with --status blocked";
  if (o.repos !== undefined && repoList(o.repos).length === 0) return "--repos names one repository at least";
  return { rest, o };
}

function apply(c: Card, o: Opts): Card {
  const next = { ...c };
  if (o.status) next.status = o.status as Status;
  if (o.title) next.title = o.title;
  if (o.session !== undefined) next.session = o.session;
  if (o.repos !== undefined) next.repos = repoList(o.repos);
  if (o.on !== undefined) next.status = "blocked";
  if (o.on !== undefined) next.waits = o.on;
  if (next.status !== "blocked") next.waits = "";
  if (o.body !== undefined) next.body = o.body;
  for (const [k, heading] of Object.entries(SECTIONS)) {
    const v = o[k as keyof typeof SECTIONS];
    if (v !== undefined) next.body = setSection(next.body, heading, v);
  }
  next.updated = now();
  return next;
}

// A card added or moved, in the harness's event log: what waits on the user amber, done green.
function logCard(c: Card, text: string) {
  const tone: Tone = c.status === "done" ? "ok" : c.status === "running" ? "info" : "wait";
  logEvent("board", tone, c.repo, text);
}

export function add(repo: string, title: string, o: Opts = {}): Card {
  const dir = boardDir();
  mkdirSync(dir, { recursive: true });
  const base = slug(`${repo} ${title}`) || "task";
  let id = base;
  for (let n = 2; existsSync(join(dir, `${id}.md`)); n++) id = `${base}-${n}`;
  const blank = Object.values(SECTIONS).map((h) => `## ${h}\n\n`).join("\n");
  const session = process.env.CLAUDE_CODE_SESSION_ID ?? "";
  const card = apply({ id, repo, title, status: "running", session, updated: "", repos: ownRepos(repo), waits: "", body: blank }, o);
  writeFileSync(join(dir, `${id}.md`), format(card));
  // (the status last: the panel's log shows a line's last word as its figure)
  logCard(card, `${card.title}${card.waits ? ` (on ${card.waits})` : ""} added, ${card.status}`);
  return card;
}

/** Repository names that aren't a folder of the family's (a typo holds nothing). */
export function strangers(repos: string[]): string[] {
  return repos.filter((r) => {
    try {
      return !statSync(familyPath(r)).isDirectory();
    } catch {
      return true;
    }
  });
}

/** Who holds each repository: every one some card names, or those asked. */
export function holders(list: Card[], only: string[] = []): { repo: string; card: Card; kind: "held" | "pending" }[] {
  const out: { repo: string; card: Card; kind: "held" | "pending" }[] = [];
  for (const c of list) {
    const kind = HOLDS.includes(c.status) ? "held" : WAITS.includes(c.status) ? "pending" : null;
    if (!kind) continue;
    for (const repo of c.repos) if (!only.length || only.includes(repo)) out.push({ repo, card: c, kind });
  }
  return out.sort((a, b) => a.repo.localeCompare(b.repo) || (a.kind === b.kind ? 0 : a.kind === "held" ? -1 : 1));
}

export function set(id: string, o: Opts): Card | string {
  const file = join(boardDir(), `${id}.md`);
  if (!existsSync(file)) return `no card ${id} (bun addon-kit/board.ts list --all)`;
  const was = parseCard(id, readFileSync(file, "utf8"));
  const card = apply(was, o);
  writeFileSync(file, format(card));
  if (card.status !== was.status) logCard(card, `${card.title}${card.waits ? ` (on ${card.waits})` : ""} ${was.status} → ${card.status}`);
  return card;
}

/** The blocked cards waiting on `id`: freed once it is done. */
export const waitingOn = (id: string, list: Card[]) => list.filter((c) => c.status === "blocked" && c.waits === id);

if (import.meta.main) {
  const [cmd, ...argv] = process.argv.slice(2);
  const parsed = options(argv);
  const fail = (msg: string) => {
    console.error(msg);
    process.exit(2);
  };
  if (typeof parsed === "string") fail(parsed);
  const { rest, o } = parsed as Exclude<typeof parsed, string>;
  // What a session reads after writing its card: a repository held or a typo, cards it frees.
  const tell = (card: Card) => {
    const list = cards();
    for (const r of strangers(card.repos)) console.error(`note: ${r} is no folder of the family's: it holds nothing`);
    for (const w of warnings(card, list)) console.error(w);
    if (card.waits && !list.some((c) => c.id === card.waits)) console.error(`note: ${card.waits} is no open card: nothing to wait on`);
    if (card.status === "blocked" && !card.waits) console.error(`note: ${card.id} is blocked on nothing: name the card with --on <id>`);
    if (card.status === "done") for (const c of waitingOn(card.id, list)) console.error(`frees ${c.id} (blocked on it, session ${c.session || "?"})`);
  };
  if (cmd === "add" && rest.length === 2) {
    const card = add(rest[0], rest[1], o);
    console.log(card.id);
    tell(card);
  } else if (cmd === "set" && rest.length === 1) {
    const r = set(rest[0], o);
    if (typeof r === "string") fail(r);
    else {
      console.log(`${r.id}: ${r.status}${r.waits ? ` on ${r.waits}` : ""}`);
      tell(r);
    }
  } else if (cmd === "held") {
    const session = process.env.CLAUDE_CODE_SESSION_ID ?? "";
    const found = holders(cards(), rest);
    for (const h of found) console.log(`${h.repo.padEnd(18)} ${h.kind.padEnd(8)} ${h.card.status.padEnd(14)} ${h.card.id}${h.card.session === session && session ? " (this session)" : ""}`);
    if (!found.length) console.log(rest.length ? `${rest.join(", ")}: free` : "nothing held");
    // Scriptable: named repositories another session holds fail.
    if (rest.length && found.some((h) => h.kind === "held" && !(session && h.card.session === session))) process.exit(1);
  } else if (cmd === "list" && !rest.length) {
    const list = cards(o.all);
    if (o.json) console.log(JSON.stringify(list, null, 2));
    else console.log(list.length ? lines(list).join("\n") : "the board is empty");
  } else fail('usage: bun board.ts add <repo> "<title>" [options] | set <id> [options] | list [--all] [--json] | held [repo…]');
}
