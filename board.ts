/**
 * The task board: one Markdown card per task in ~/code/wow-addons/board/,
 * written and listed here so no session hand-edits its front matter (repo,
 * title, status, session, updated). Its body says what to try, what's
 * committed and what's left. The desktop panel reads the same files.
 *
 *   bun addon-kit/board.ts add <repo> "<title>" [--status s] [--session id] [fields]
 *   bun addon-kit/board.ts set <id> [--status s] [--title t] [--session id] [fields]
 *   bun addon-kit/board.ts list [--all] [--json]
 *
 *   fields   --try "…" --committed "…" --left "…" (each its section of the
 *            body, replaced), --body "…" (the whole body)
 *   status   running, waiting-test, waiting-review, ready-to-push, done
 *            (add: running); list puts what waits on the user first and
 *            leaves done out unless --all
 *   session  the session's name or id (add: $CLAUDE_CODE_SESSION_ID)
 *
 * add prints the card's id: <repo>-<a slug of the title>.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { familyPath } from "./root";

// (in the order the list shows them: what waits on the user first)
export const STATUSES = ["waiting-test", "waiting-review", "ready-to-push", "running", "done"] as const;
export type Status = (typeof STATUSES)[number];
export type Card = { id: string; repo: string; title: string; status: Status; session: string; updated: string; body: string };
const KEYS = ["repo", "title", "status", "session", "updated"] as const;
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

export function format(c: Card): string {
  return `---\n${KEYS.map((k) => `${k}: ${quote(c[k])}`).join("\n")}\n---\n${c.body.replace(/^\n+/, "").trimEnd()}\n`;
}

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

export function lines(list: Card[], from = Date.now()): string[] {
  const w = (k: "id" | "repo") => Math.max(0, ...list.map((c) => c[k].length));
  const [wi, wr] = [w("id"), w("repo")];
  return list.map((c) => `${c.status.padEnd(14)} ${c.repo.padEnd(wr)}  ${c.id.padEnd(wi)}  ${c.title}  ${ago(c.updated, from)}`.trimEnd());
}

type Opts = Partial<Record<"status" | "title" | "session" | "body" | keyof typeof SECTIONS, string>> & { all?: boolean; json?: boolean };

export function options(argv: string[]): { rest: string[]; o: Opts } | string {
  const o: Opts = {};
  const rest: string[] = [];
  const valued = ["status", "title", "session", "body", ...Object.keys(SECTIONS)];
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
  return { rest, o };
}

function apply(c: Card, o: Opts): Card {
  const next = { ...c };
  if (o.status) next.status = o.status as Status;
  if (o.title) next.title = o.title;
  if (o.session !== undefined) next.session = o.session;
  if (o.body !== undefined) next.body = o.body;
  for (const [k, heading] of Object.entries(SECTIONS)) {
    const v = o[k as keyof typeof SECTIONS];
    if (v !== undefined) next.body = setSection(next.body, heading, v);
  }
  next.updated = now();
  return next;
}

export function add(repo: string, title: string, o: Opts = {}): Card {
  const dir = boardDir();
  mkdirSync(dir, { recursive: true });
  const base = slug(`${repo} ${title}`) || "task";
  let id = base;
  for (let n = 2; existsSync(join(dir, `${id}.md`)); n++) id = `${base}-${n}`;
  const blank = Object.values(SECTIONS).map((h) => `## ${h}\n\n`).join("\n");
  const card = apply({ id, repo, title, status: "running", session: process.env.CLAUDE_CODE_SESSION_ID ?? "", updated: "", body: blank }, o);
  writeFileSync(join(dir, `${id}.md`), format(card));
  return card;
}

export function set(id: string, o: Opts): Card | string {
  const file = join(boardDir(), `${id}.md`);
  if (!existsSync(file)) return `no card ${id} (bun addon-kit/board.ts list --all)`;
  const card = apply(parseCard(id, readFileSync(file, "utf8")), o);
  writeFileSync(file, format(card));
  return card;
}

if (import.meta.main) {
  const [cmd, ...argv] = process.argv.slice(2);
  const parsed = options(argv);
  const fail = (msg: string) => {
    console.error(msg);
    process.exit(2);
  };
  if (typeof parsed === "string") fail(parsed);
  const { rest, o } = parsed as Exclude<typeof parsed, string>;
  if (cmd === "add" && rest.length === 2) console.log(add(rest[0], rest[1], o).id);
  else if (cmd === "set" && rest.length === 1) {
    const r = set(rest[0], o);
    if (typeof r === "string") fail(r);
    else console.log(`${r.id}: ${r.status}`);
  } else if (cmd === "list" && !rest.length) {
    const list = cards(o.all);
    if (o.json) console.log(JSON.stringify(list, null, 2));
    else console.log(list.length ? lines(list).join("\n") : "the board is empty");
  } else fail('usage: bun board.ts add <repo> "<title>" [options] | set <id> [options] | list [--all] [--json]');
}
