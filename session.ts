/**
 * A new task opened in a session of its own (the family's "one session per
 * task"): a session asked a task that isn't its own opens one here, tells
 * the user its name and how to attach, and writes nothing for it.
 *
 *   bun addon-kit/session.ts "<card title>" --repos a,b --kind code|prose [--plan] [--dry-run] -- "<the task>"
 *
 *   title     the new session's name and its card's title
 *   repos     every repository the task writes: its card's --repos, the
 *             first its repo
 *   kind      the family's models by kind: code (and mechanical work)
 *             opusplan, prose (voices, translations, design) opus. opusplan
 *             is Opus in plan mode and Sonnet otherwise: the session is told
 *             to plan in plan mode first when its task needs a plan
 *   plan      start the session in plan mode: it plans (on Opus) and writes
 *             nothing, its card included, until the user approves the plan
 *   dry-run   print the command and the prompt, start nothing
 *   the task  in the user's words, with what the opener knows
 *
 * It runs `claude --bg -n <title> --model <model> <prompt>` from the family
 * folder, without the running session's variables (CLAUDECODE and every
 * CLAUDE_*, but CLAUDE_BASH_MAINTAIN_PROJECT_WORKING_DIR and the user's
 * CLAUDE_CONFIG_DIR): the board's lock tells sessions apart by
 * CLAUDE_CODE_SESSION_ID, and a session that inherited the opener's would
 * write its card as the opener's. The prompt begins with the family's
 * CLAUDE.md and the card, then the task; it names the opener (its display
 * name, else its open card's title). It prints the new session's id and
 * how to attach, says which of its repositories another card holds now, and
 * logs the opening in the harness's event log.
 */
import { type Card, cards, holders, repoList, strangers } from "./board";
import { logEvent } from "./events";
import { familyRoot } from "./root";

export const KINDS = { code: "opusplan", prose: "opus" } as const;
export type Kind = keyof typeof KINDS;

export type Ask = { title: string; repos: string[]; kind: Kind; plan: boolean; dryRun: boolean; task: string };

const USAGE = 'usage: bun addon-kit/session.ts "<card title>" --repos a,b --kind code|prose [--plan] [--dry-run] -- "<the task>"';

export function parse(argv: string[]): Ask | string {
  const cut = argv.indexOf("--");
  const head = cut === -1 ? argv : argv.slice(0, cut);
  const task = cut === -1 ? "" : argv.slice(cut + 1).join(" ").trim();
  let title = "";
  let repos: string[] = [];
  let kind = "";
  let plan = false;
  let dryRun = false;
  for (let i = 0; i < head.length; i++) {
    const a = head[i];
    if (a === "--repos" || a === "--kind") {
      if (head[i + 1] === undefined) return `${a} takes a value`;
      if (a === "--repos") repos = repoList(head[++i]);
      else kind = head[++i];
    } else if (a === "--plan") plan = true;
    else if (a === "--dry-run") dryRun = true;
    else if (a.startsWith("-")) return `unknown option ${a}`;
    else if (title) return `one title (a second: ${a}); the task goes after --`;
    else title = a.trim();
  }
  if (!title) return "the card's title first";
  if (repos.length === 0) return "--repos names every repository the task writes";
  const odd = repos.find((r) => !/^[\w.-]+$/.test(r));
  if (odd) return `--repos takes folder names, a comma between them (not ${JSON.stringify(odd)})`;
  if (!(kind in KINDS)) return "--kind is code or prose";
  if (!task) return "the task after --, in the user's words";
  return { title, repos, kind: kind as Kind, plan, dryRun, task };
}

// (a shell's single quotes: what the prompt shows the new session to run)
const sq = (s: string) => (/^[\w./,:@-]+$/.test(s) ? s : `'${s.replace(/'/g, `'\\''`)}'`);
const dq = (s: string) => `"${s.replace(/(["\\$`])/g, "\\$1")}"`;

/** The new session's first words: the maps, its card, its model, the task, how it ends. */
export function prompt(a: Pick<Ask, "title" | "repos" | "kind" | "plan" | "task">, opener?: string): string {
  const [repo] = a.repos;
  const model =
    a.kind === "prose"
      ? a.plan
        ? "You run on Opus and start in plan mode: plan first, and write nothing (your card included) until the user approves the plan."
        : "You run on Opus (prose, voices, translations, design)."
      : a.plan
        ? "You run on opusplan and start in plan mode: Opus plans, nothing is written (your card included) until the user approves the plan, then Sonnet carries it out."
        : "You run on opusplan: Sonnet, and Opus in plan mode. If the task needs a plan (a design to settle, a change across files), plan it in plan mode first and write once the user approves it."
  return [
    `A new task from the user. ${opener ? `The session "${opener}"` : "Another session"} opened this one for it (the family's one session per task).`,
    `Read ~/code/wow-addons/CLAUDE.md first, then the CLAUDE.md of each repository you write (${a.repos.join(", ")}).`,
    `Your first write, before any file, is your card:\n\n  bun addon-kit/board.ts add ${repo} ${dq(a.title)} --repos ${a.repos.join(",")} --status running --try "…" --committed "(none yet)" --left "…"\n\nThis session already carries the card's title. Check the card's \`session\` is this session's own id ($CLAUDE_CODE_SESSION_ID), not the opener's: if it isn't, say so first.`,
    model,
    `The task:\n\n${a.task}`,
    "You run in the background: narrate briefly, move your card at each stop, and end with a `result:` line.",
  ].join("\n\n");
}

/** The command, without the prompt (its last argument). */
export function command(a: Pick<Ask, "title" | "kind" | "plan">): string[] {
  return ["claude", "--bg", "-n", a.title, "--model", KINDS[a.kind], ...(a.plan ? ["--permission-mode", "plan"] : [])];
}

const KEEP = new Set(["CLAUDE_BASH_MAINTAIN_PROJECT_WORKING_DIR", "CLAUDE_CONFIG_DIR"]);
/** The environment without the running session's own variables. */
export function cleanEnv(env: Record<string, string | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(env)) if (v !== undefined && (!/^CLAUDE/.test(k) || KEEP.has(k))) out[k] = v;
  return out;
}
export const dropped = (env: Record<string, string | undefined>) => Object.keys(env).filter((k) => /^CLAUDE/.test(k) && !KEEP.has(k)).sort();

/** The short id `claude --bg` prints (`backgrounded · 1f8f36b9 · <name>`), the one `claude attach` takes. */
export function idOf(out: string): string | undefined {
  return out.match(/backgrounded\s+·\s+([0-9a-f]{6,})\b/i)?.[1];
}

/**
 * The opener's name: its display name (`claude agents --json`, matched by
 * its session id: what the user and SendMessage know it by), else the
 * title of its newest card still open (running, or waiting on the user).
 * Never a card it finished: a session's done cards are older tasks it
 * carried.
 */
export function openerOf(session: string, agents: unknown, list: Pick<Card, "session" | "status" | "title" | "updated">[]): string | undefined {
  const row = Array.isArray(agents) ? agents.find((r) => r && typeof r === "object" && (r as { sessionId?: unknown }).sessionId === session) : undefined;
  const name = (row as { name?: unknown } | undefined)?.name;
  if (typeof name === "string" && name.trim()) return name.trim();
  return list.filter((c) => c.session === session && c.status !== "done").sort((a, b) => b.updated.localeCompare(a.updated))[0]?.title;
}

function openerName(session: string | undefined, root: string): string | undefined {
  if (!session) return undefined;
  let agents: unknown;
  try {
    const run = Bun.spawnSync(["claude", "agents", "--json"], { cwd: root, env: cleanEnv(process.env), stdout: "pipe", stderr: "ignore", timeout: 20_000 });
    if (run.exitCode === 0) agents = JSON.parse(run.stdout.toString());
  } catch {}
  try {
    return openerOf(session, agents, cards());
  } catch {
    return undefined;
  }
}

/** What the new session will meet: its repositories another card holds now, a name that is no family folder. */
function notes(repos: string[]): string[] {
  const out = strangers(repos).map((r) => `note: ${r} is no family folder yet`);
  try {
    for (const h of holders(cards(), repos))
      if (h.kind === "held") out.push(`note: ${h.repo} is held by ${h.card.id} (running): the new session will block on it until it's free`);
  } catch {}
  return out;
}

if (import.meta.main) {
  const a = parse(process.argv.slice(2));
  if (typeof a === "string") {
    console.error(`${a}\n${USAGE}`);
    process.exit(2);
  }
  const root = familyRoot();
  const text = prompt(a, openerName(process.env.CLAUDE_CODE_SESSION_ID, root));
  const cmd = command(a);
  for (const n of notes(a.repos)) console.error(n);
  if (a.dryRun) {
    console.log(`would run, from ${root}:\n  ${cmd.map(sq).join(" ")} "$PROMPT"`);
    const gone = dropped(process.env);
    console.log(`without ${gone.length ? gone.join(" ") : "(no CLAUDE_* to drop)"}`);
    console.log(`PROMPT:\n${text}`);
    process.exit(0);
  }
  const run = Bun.spawnSync([...cmd, text], { cwd: root, env: cleanEnv(process.env), stdout: "pipe", stderr: "pipe", timeout: 60_000 });
  const out = `${run.stdout.toString()}${run.stderr.toString()}`.trim();
  const id = idOf(out);
  if (run.exitCode !== 0 || !id) {
    if (out) console.error(out);
    // (claude said yes without an id: the session may run all the same, a second try would open it twice)
    const why = run.exitCode !== 0 ? `claude --bg failed (exit ${run.exitCode ?? run.signalCode})` : "claude --bg answered without a session id";
    console.error(run.exitCode === 0 ? `${why}: it may have started all the same. Look in \`claude agents\` before opening it again` : why);
    logEvent("session", "fail", a.repos[0], `${a.title}: ${why}`);
    process.exit(run.exitCode || 1);
  }
  logEvent("session", "ok", a.repos[0], `${a.title} opened (${KINDS[a.kind]}${a.plan ? ", plan mode" : ""}) as ${id}`);
  console.log(`opened "${a.title}" (${KINDS[a.kind]}${a.plan ? ", plan mode" : ""}) as ${id}
  claude attach ${id}    join it (Ctrl+Z leaves it running)
  claude logs ${id}      its recent output
  its card, once written: bun addon-kit/board.ts list`);
}
