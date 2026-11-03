/**
 * Launch night's dashboard, a page on this computer: `bun addon-kit/launch.ts`
 * (from ~/code/wow-addons) serves it on 127.0.0.1 and opens it in its own window.
 * It runs the family's own tools on timers (preflight, status, the board,
 * wow-data), so it needs no Claude session and costs nothing while it runs.
 *
 *   bun addon-kit/launch.ts            serve and open (ctrl-c to stop)
 *   bun addon-kit/launch.ts --demo     made-up state (ticks go to a temp file, never the real one)
 *   bun addon-kit/launch.ts --once     one gather, the snapshot as JSON, then exit
 *   bun addon-kit/launch.ts notes      the night's ticks and notes as Markdown
 *
 * The ticks and notes live in addon-kit/.cache/launch-night.json (LAUNCH_STATE
 * moves it). The checklist itself is launch-night.json: data, not code. The
 * rules (green, amber, red) are launch-rules.ts. Actions are the harmless ones:
 * refresh a source, a store page's dry run, a card's status. A push, a release
 * and store.ts --apply stay with the sessions and the user's go.
 *
 * The server answers this machine only (127.0.0.1, its Host checked) and a key
 * made at each start, carried by the page, guards every call.
 */
import { randomBytes } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, join } from "node:path";
import { Database } from "bun:sqlite";
import * as rules from "./launch-rules";
import { page } from "./launch-ui";

const HERE = import.meta.dir;
const ROOT = join(HERE, "..");
const CONTENT_FILE = join(HERE, "launch-night.json");
const ICLOUD_DRIVE = join(homedir(), "Library", "Mobile Documents", "com~apple~CloudDocs");

export type Content = {
  launch: string;
  chainCheckAt: string;
  timeline: { id: string; at: string; title: string; detail: string }[];
  questions: { id: string; title: string; ask: string; ok: string }[];
  addons: { id: string; name: string; slash: string; rank: number; risk: string; checks: { id: string; look: string; ok: string; todo: string; fix: string }[] }[];
};

export const loadContent = (): Content => JSON.parse(readFileSync(CONTENT_FILE, "utf8"));

// ── running the family's tools ──────────────────────────────────────────────
async function run(cmd: string[], ms: number): Promise<{ out: string; code: number; timedOut: boolean }> {
  const p = Bun.spawn(cmd, { cwd: ROOT, stdout: "pipe", stderr: "pipe", env: { ...process.env, NO_COLOR: "1" } });
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    p.kill();
  }, ms);
  const [out, err] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text()]);
  const code = await p.exited;
  clearTimeout(timer);
  return { out: out || err, code, timedOut };
}

const json = async (cmd: string[], ms: number) => {
  const r = await run(cmd, ms);
  if (r.timedOut) throw new Error(`gave up after ${Math.round(ms / 1000)} s`);
  try {
    return JSON.parse(r.out);
  } catch {
    throw new Error(`no JSON from ${cmd.slice(0, 3).join(" ")}: ${r.out.trim().split("\n").slice(-2).join(" ").slice(0, 200)}`);
  }
};

// ── the sources, each with its own rhythm ───────────────────────────────────
type Cell = { at: number; ms: number; data?: unknown; error?: string };
type Source = { every: number; get: () => Promise<unknown> };

const PROBES = [
  { name: "hearthtale.app", url: "https://hearthtale.app/" },
  { name: "ravenpost-inbox", url: "https://ravenpost-inbox.vercel.app/" },
];

async function probe(p: { name: string; url: string }): Promise<rules.Probe> {
  const t = Date.now();
  try {
    const res = await fetch(p.url, { method: "GET", redirect: "follow", signal: AbortSignal.timeout(8000) });
    return { ...p, status: res.status, ms: Date.now() - t };
  } catch (e) {
    return { ...p, status: 0, ms: Date.now() - t, error: e instanceof Error ? e.message : String(e) };
  }
}

const ZONES = ["Zephras Isle", "Shen'dralas", "Riverglades", "Mount Hyjal", "Gilneas"];

function coverage() {
  const file = join(ROOT, "wow-data", ".cache", "db", "forever.db");
  if (!existsSync(file) || statSync(file).size < 1e6) throw new Error("forever.db not built (bun wow-data/bin/get.ts)");
  const db = new Database(file, { readonly: true });
  try {
    const one = (sql: string, ...a: string[]) => (db.query(sql).get(...a) as { n: number }).n;
    const zones = ZONES.map((z) => ({
      zone: z,
      quests: one("select count(*) n from quest where zone_id in (select id from name where kind='area' and locale='enUS' and name=?)", z),
    }));
    const kinds = Object.fromEntries(
      (db.query("select kind, count(*) n from name where locale='enUS' and kind in ('creature','quest','object','item','faction') group by kind").all() as { kind: string; n: number }[]).map((r) => [r.kind, r.n]),
    );
    const meta = Object.fromEntries((db.query("select key, value from meta").all() as { key: string; value: string }[]).map((r) => [r.key, r.value]));
    return { zones, kinds, builtAt: meta.built_at, pins: meta.pins ? JSON.parse(meta.pins).builds?.forever?.build : undefined };
  } finally {
    db.close();
  }
}

/** The images in iCloud Drive's root since an hour before launch: the user's screenshots. */
function screenshots(since: number) {
  let names: string[];
  try {
    names = readdirSync(ICLOUD_DRIVE);
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    throw new Error(`${code ?? "unreadable"}: iCloud Drive's root can't be read from here${code === "EPERM" ? " (a background session has no access: run this from your own terminal)" : ""}`);
  }
  return names
    .filter((n) => /\.(png|jpe?g|webp)$/i.test(n))
    .map((n) => ({ name: n, mtime: statSync(join(ICLOUD_DRIVE, n)).mtimeMs }))
    .filter((f) => f.mtime >= since)
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, 40);
}

const MIN = 60_000;
const sources = (content: Content): Record<string, Source> => ({
  board: { every: MIN, get: () => json(["bun", "addon-kit/board.ts", "list", "--json"], 20_000) },
  // (status.ts reads the CI runs and pull requests through gh whether or not it fetches, so one source: every two minutes)
  remote: { every: 2 * MIN, get: () => json(["bun", "addon-kit/status.ts", "--json"], 150_000) },
  preflight: {
    every: 15 * MIN,
    get: async () => {
      const r = await run(["bun", "addon-kit/preflight.ts", "--json"], 240_000);
      if (r.timedOut) throw new Error("gave up after 240 s");
      try {
        return JSON.parse(r.out); // (exit 1 while an ✗ stands: still the report)
      } catch {
        throw new Error(`no JSON from preflight: ${r.out.trim().split("\n").slice(-2).join(" ").slice(0, 200)}`);
      }
    },
  },
  build: {
    every: 15 * MIN,
    get: async () => {
      const r = await run(["bun", "wow-data/bin/latest.ts"], 90_000);
      const b = rules.parseBuild(r.out);
      if (!b) throw new Error("latest.ts did not say the Forever build");
      return b;
    },
  },
  infra: { every: 5 * MIN, get: () => Promise.all(PROBES.map(probe)) },
  data: { every: 15 * MIN, get: async () => coverage() },
  shots: { every: 20_000, get: async () => screenshots(Date.parse(content.launch) - 3600_000) },
});

// ── the engine: cells filled on timers ──────────────────────────────────────
export class Engine {
  cells: Record<string, Cell> = {};
  private inflight = new Map<string, Promise<void>>();
  private timers: ReturnType<typeof setInterval>[] = [];
  constructor(private defs: Record<string, Source>) {}

  refresh(name: string): Promise<void> {
    const def = this.defs[name];
    if (!def) return Promise.reject(new Error(`no source ${name}`));
    const running = this.inflight.get(name);
    if (running) return running;
    const t = Date.now();
    const p = def
      .get()
      .then((data) => {
        this.cells[name] = { at: Date.now(), ms: Date.now() - t, data };
      })
      .catch((e) => {
        // (an old answer stays, marked with the new error)
        this.cells[name] = { ...this.cells[name], at: this.cells[name]?.at ?? Date.now(), ms: Date.now() - t, error: e instanceof Error ? e.message : String(e) };
      })
      .finally(() => this.inflight.delete(name));
    this.inflight.set(name, p);
    return p;
  }

  start() {
    for (const [name, def] of Object.entries(this.defs)) {
      void this.refresh(name);
      this.timers.push(setInterval(() => void this.refresh(name), def.every));
    }
  }
  stop() {
    for (const t of this.timers) clearInterval(t);
  }
  busy = () => [...this.inflight.keys()];
}

// ── the view the page draws ─────────────────────────────────────────────────
type PreflightReport = { name: string; rows: rules.Row[]; version?: string; tag?: string };
type StatusRepo = { name: string; ahead: number; behind: number; dirty: number; head: string; runs?: rules.Run[]; prs?: { number: number; title: string }[] };

export function view(content: Content, cells: Record<string, Cell>, state: rules.State, busy: string[], now = Date.now()) {
  const preflight = (cells.preflight?.data as PreflightReport[] | undefined) ?? [];
  const status = (cells.remote?.data as StatusRepo[] | undefined) ?? [];
  const build = cells.build?.data as rules.Build | undefined;

  const tocFor = (rows: rules.Row[]) => Number(rows.find((r) => r.label === "interface")?.text.match(/forever (\d+)/)?.[1]) || 16001;
  const toc = tocFor(preflight.flatMap((p) => p.rows));
  const buildV = rules.buildLight(build, toc);

  const addons = [...content.addons]
    .sort((a, b) => a.rank - b.rank)
    .map((a) => {
      const report = preflight.find((p) => p.name === a.id);
      const ready = report ? rules.readiness(report.rows) : { light: "grey" as const, reasons: [cells.preflight?.error ?? "preflight has not answered yet"] };
      const game = rules.inGame(a.id, a.checks.map((c) => c.id), state.ticks);
      const repo = status.find((s) => s.name === a.id);
      const zip = report?.rows.find((r) => r.label === "test zip");
      return {
        ...a,
        version: report?.version,
        tag: report?.tag,
        head: repo?.head,
        ci: repo?.runs?.find((r) => r.workflow === "CI")?.conclusion,
        zip: zip ? { mark: zip.mark, text: zip.text } : undefined,
        readiness: ready,
        inGame: game,
        // (in game, "not tested" is grey and never lowers a card: readiness is what the tools can say before launch)
        light: rules.worst(ready.light, game.light === "grey" ? "green" : game.light),
        checks: a.checks.map((c) => ({ ...c, tick: state.ticks[`${a.id}/${c.id}`] ?? "untested" })),
      };
    });

  const chain = cells.remote?.data
    ? rules.chain(
        status.filter((s) => s.name === "wow-data" || content.addons.some((a) => a.id === s.name)).map((s) => ({ name: s.name, runs: s.runs, prs: s.prs })),
        now,
        Date.parse(content.chainCheckAt),
      )
    : { light: "grey" as const, reasons: [cells.remote?.error ?? "status.ts has not answered yet"] };
  const infra = cells.infra?.data ? rules.infra(cells.infra.data as rules.Probe[]) : { light: "grey" as const, reasons: ["not probed yet"] };
  const launchRepos = new Set([...content.addons.map((a) => a.id), "ravenpost", "wow-data", "addon-kit"]);
  const cards = ((cells.board?.data as rules.Card[] | undefined) ?? []).filter((c) => c.status !== "done");
  const boardV = rules.board(cards, launchRepos);

  const lights = [buildV.light, chain.light, infra.light, boardV.light, ...addons.map((a) => a.light)];
  const overall = rules.worst(...lights);

  let next = true;
  const timeline = content.timeline
    .map((t) => ({ ...t, ms: Date.parse(t.at) }))
    .sort((a, b) => a.ms - b.ms)
    .map((t) => {
      const done = !!state.steps[t.id];
      const isNext = !done && next && t.ms >= now - 3600_000 ? ((next = false), true) : false;
      return { id: t.id, at: t.at, title: t.title, detail: t.detail, done, past: t.ms < now, next: isNext };
    });

  return {
    now,
    launch: content.launch,
    overall,
    build: { ...buildV, pin: build?.pin, latest: build?.latest, toc },
    addons,
    timeline,
    questions: content.questions.map((q) => ({ ...q, done: state.answers[q.id]?.done ?? false, text: state.answers[q.id]?.text ?? "" })),
    data: { ...(cells.data?.data as object | undefined), error: cells.data?.error },
    chain,
    infra: { ...infra, probes: cells.infra?.data as rules.Probe[] | undefined },
    board: { ...boardV, cards: cards.map((c) => ({ id: c.id, title: c.title, status: c.status, repos: c.repos })) },
    notes: state.notes,
    shots: { list: (cells.shots?.data as { name: string; mtime: number }[] | undefined) ?? [], error: cells.shots?.error },
    ages: Object.fromEntries(Object.entries(cells).map(([k, c]) => [k, { at: c.at, ms: c.ms, error: c.error }])),
    busy,
    applicable: Object.keys(cells),
  };
}

// ── the server ──────────────────────────────────────────────────────────────
export type Deps = {
  content: Content;
  engine: { cells: Record<string, Cell>; refresh(name: string): Promise<void>; busy(): string[] };
  stateFile: string;
  /** The harmless actions' commands: injected so the tests run none. */
  exec: (cmd: string[], ms: number) => Promise<{ out: string; code: number }>;
  shotsDir: string;
  demo?: boolean;
};

const CARD_STATUSES = new Set(["running", "blocked", "waiting-test", "waiting-review", "ready-to-push", "done"]);

export function handler(deps: Deps, key: string, port: number) {
  const hosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
  const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
  return async (req: Request): Promise<Response> => {
    const url = new URL(req.url);
    // (this machine only: another name pointed at 127.0.0.1 is refused)
    if (!hosts.has(req.headers.get("host") ?? "")) return new Response("not here", { status: 403 });

    if (req.method === "GET" && url.pathname === "/") {
      return new Response(page(key, deps.demo === true), {
        headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-frame-options": "DENY", "content-security-policy": "frame-ancestors 'none'" },
      });
    }
    // (an <img> can't send a header: the screenshots take the key in the query)
    if (req.method === "GET" && url.pathname === "/shot") {
      if (url.searchParams.get("k") !== key) return new Response("this page's key, or nothing", { status: 403 });
      const name = url.searchParams.get("f") ?? "";
      const known = ((deps.engine.cells.shots?.data as { name: string }[] | undefined) ?? []).some((s) => s.name === name);
      if (!known || name !== basename(name)) return new Response("no such picture", { status: 404 });
      const file = Bun.file(join(deps.shotsDir, name));
      return new Response(file, { headers: { "cache-control": "private, max-age=300" } });
    }
    if (req.headers.get("x-launch-key") !== key) return new Response("this page's key, or nothing", { status: 403 });

    if (req.method === "GET" && url.pathname === "/api/state") {
      return respond(view(deps.content, deps.engine.cells, rules.readState(deps.stateFile), deps.engine.busy()));
    }
    if (req.method !== "POST") return new Response("no such page", { status: 404 });
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    if (url.pathname === "/api/change") {
      const next = rules.apply(rules.readState(deps.stateFile), body);
      if (typeof next === "string") return respond({ error: next }, 400);
      rules.writeState(deps.stateFile, next);
      return respond({ ok: true });
    }

    if (url.pathname === "/api/refresh") {
      const name = String(body.source ?? "");
      try {
        await deps.engine.refresh(name);
      } catch (e) {
        return respond({ error: e instanceof Error ? e.message : String(e) }, 400);
      }
      return respond({ ok: true });
    }

    if (url.pathname === "/api/action") {
      const known = new Set(deps.content.addons.map((a) => a.id));
      if (body.name === "store-dry") {
        const repo = String(body.repo ?? "");
        if (!known.has(repo)) return respond({ error: "which addon" }, 400);
        const r = await deps.exec(["bun", "addon-kit/store.ts", repo], 180_000);
        return respond({ ok: r.code === 0, out: r.out.slice(-6000) });
      }
      if (body.name === "card") {
        const id = String(body.id ?? "");
        const status = String(body.status ?? "");
        if (!/^[\w-]+$/.test(id) || !CARD_STATUSES.has(status)) return respond({ error: "a card id and a status" }, 400);
        const r = await deps.exec(["bun", "addon-kit/board.ts", "set", id, "--status", status], 30_000);
        await deps.engine.refresh("board");
        return respond({ ok: r.code === 0, out: r.out.slice(-2000) });
      }
      return respond({ error: "unknown action" }, 400);
    }
    return new Response("no such page", { status: 404 });
  };
}

// ── made-up state, to try the page (--demo) ─────────────────────────────────
export function demoCells(content: Content, now = Date.now()): Record<string, Cell> {
  const row = (mark: string, label: string, text: string) => ({ mark, label, text });
  const ok = [row("✓", "git", "main, clean, in sync with origin"), row("✓", "version", "0.15.0 in all 3 TOCs, the last tag's"), row("✓", "interface", "classic 11509, the pinned 1.15.9.70576 · forever 16001, the pinned 1.60.1.70707"), row("✓", "CI", "success on HEAD"), row("✓", "game data", "success"), row("✓", "test zip", "current")];
  const preflight = content.addons.map((a, i) => ({
    name: a.id,
    version: `0.${10 + i}.0`,
    tag: `v0.${10 + i}.0`,
    rows:
      a.id === "yonder"
        ? [...ok.slice(0, 5), row("!", "test zip", "none in iCloud: bun run package, the zip alone")]
        : a.id === "keyring"
          ? [row("✗", "CI", "failure on HEAD"), ...ok.filter((r) => r.label !== "CI")]
          : ok,
  }));
  const run = (workflow: string, conclusion = "success") => ({ workflow, status: "completed", conclusion, sha: "abc", at: new Date(now).toISOString() });
  const status = [...content.addons.map((a) => ({ name: a.id, ahead: 0, behind: 0, dirty: 0, head: "abc1234 chore(release)", runs: [run("CI", a.id === "keyring" ? "failure" : "success"), run("Game data")], prs: [] })), { name: "wow-data", ahead: 0, behind: 0, dirty: 0, head: "x", runs: [run("Pins"), run("Databases")], prs: [] }];
  const cell = (data: unknown): Cell => ({ at: now - 90_000, ms: 1200, data });
  return {
    preflight: cell(preflight),
    remote: cell(status),
    build: cell({ pin: "1.60.1.70707", latest: "1.60.1.70753" }),
    infra: cell([{ name: "hearthtale.app", url: "", status: 200, ms: 240 }, { name: "ravenpost-inbox", url: "", status: 200, ms: 410 }]),
    board: cell([{ id: "demo-card", title: "the 5 Nov patch wave", status: "waiting-test", repos: ["yonder", "keyring"] }]),
    data: cell({ zones: [{ zone: "Zephras Isle", quests: 110 }, { zone: "Shen'dralas", quests: 19 }, { zone: "Riverglades", quests: 1 }, { zone: "Mount Hyjal", quests: 0 }, { zone: "Gilneas", quests: 0 }], kinds: { creature: 13675, quest: 5241, object: 12057, item: 25206, faction: 253 }, builtAt: "2026-10-30T22:56:45.016Z", pins: "1.60.1.70707" }),
    shots: cell([]),
  };
}

const notesCommand = (stateFile: string) => rules.notesMarkdown(rules.readState(stateFile), loadContent());

// ── the command ─────────────────────────────────────────────────────────────
if (import.meta.main) {
  const args = process.argv.slice(2);
  const demo = args.includes("--demo");
  const content = loadContent();
  const stateFile = process.env.LAUNCH_STATE ?? (demo ? join(tmpdir(), "launch-night-demo.json") : join(HERE, ".cache", "launch-night.json"));

  if (args[0] === "notes") {
    process.stdout.write(notesCommand(stateFile));
  } else if (args.includes("--once")) {
    const engine = new Engine(demo ? {} : sources(content));
    if (demo) engine.cells = demoCells(content);
    else await Promise.all(Object.keys(sources(content)).map((n) => engine.refresh(n)));
    console.log(JSON.stringify(view(content, engine.cells, rules.readState(stateFile), []), null, 2));
  } else {
    const engine = new Engine(demo ? {} : sources(content));
    if (demo) engine.cells = demoCells(content);
    else engine.start();
    const port = Number(process.env.LAUNCH_UI_PORT ?? 4191);
    const key = randomBytes(18).toString("base64url");
    const deps: Deps = { content, engine, stateFile, shotsDir: ICLOUD_DRIVE, demo, exec: async (cmd, ms) => run(cmd, ms) };
    Bun.serve({ hostname: "127.0.0.1", port, fetch: handler(deps, key, port), idleTimeout: 255 });
    const url = `http://127.0.0.1:${port}/`;
    console.log(`launch night: ${url}${demo ? " (made-up state, ticks kept in a temp file)" : ""}  (ctrl-c to stop)`);
    if (!process.env.LAUNCH_UI_NO_BROWSER) {
      // (Chrome's app window when there is one: no tabs, its own Dock icon. Else the default browser.)
      const chrome = "/Applications/Google Chrome.app";
      Bun.spawn(existsSync(chrome) ? ["open", "-na", "Google Chrome", "--args", `--app=${url}`, "--window-size=1500,950"] : ["open", url]);
    }
  }
}
