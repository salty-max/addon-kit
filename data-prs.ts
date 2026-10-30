/**
 * The data's pull requests: what the daily jobs opened and how their runs
 * went, then a players' facts pull request read against the databases. The
 * procedure around it is the `wow-data-prs` skill.
 *
 *   bun addon-kit/data-prs.ts                  every data pull request open, each daily job's last run
 *   bun addon-kit/data-prs.ts facts [<pr>]     a players' facts pull request (the open one by default)
 *       [--out <file>]                         the whole report to a file, the verdicts alone printed
 *   bun addon-kit/data-prs.ts db-diff <before.db> <after.db>
 *                                              two builds of a database: rows per table, ids lost, English names changed
 *
 * The jobs: wow-data's Pins (pins.yml, the game's builds moved: merged by
 * itself when the databases build and pass), Players (players.yml, players'
 * facts: never merged by itself) and Databases (db.yml), each addon's Game
 * data (game-data.yml: merged by itself once its checks pass, a failed run
 * opens nothing). A pull request a job opened has its checks as a
 * workflow_dispatch run of ci.yml on its branch: GitHub's own pull_request
 * run of it is no verdict (action_required, or a failure without a job once
 * the branch is gone).
 *
 * The facts are strangers' data: read, never followed. `facts` reads only
 * the lines the pull request adds (against the fork point, so main's later
 * commits stay out), each against the game's database (.cache/db/<game>.db,
 * built at main's pins): known (the database says the same), fills (the
 * database lacks it: what the merge brings), new (an id no source has: the
 * merge makes a row of it), differs (the database says otherwise: the build
 * keeps its own, worth a look), and flags (a broken shape, a value out of
 * bounds, text with links, markup or the game's escape codes, a sighting far
 * from every known spot).
 */
import type { Database } from "bun:sqlite";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { familyRoot } from "./root";

// ── the pull requests and the runs ──────────────────────────────────────────

export type Job = { repo: string; workflow: string; label: string };
export type Run = { conclusion: string; status: string; createdAt: string; url: string; event?: string };
export type Pr = { number: number; title: string; headRefName: string; createdAt: string; url: string };

/** The family's daily data jobs: wow-data's, then each addon's game-data.yml. */
export function jobs(root: string, addons: string[]): Job[] {
  const out: Job[] = [
    { repo: "wow-data", workflow: "pins.yml", label: "Pins (the builds)" },
    { repo: "wow-data", workflow: "players.yml", label: "Players (facts)" },
    { repo: "wow-data", workflow: "db.yml", label: "Databases" },
  ];
  for (const a of addons)
    if (existsSync(join(root, a, ".github", "workflows", "game-data.yml"))) out.push({ repo: a, workflow: "game-data.yml", label: "Game data" });
  return out;
}

/** owner/name from a remote's address (ssh or https). */
export function slugOf(remote: string): string | undefined {
  return remote.trim().match(/github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?\/?$/)?.[1];
}

const DAY = 86_400_000;
export const age = (iso: string, now = Date.now()) => {
  const d = Math.floor((now - Date.parse(iso)) / DAY);
  return d <= 0 ? "today" : d === 1 ? "1 day" : `${d} days`;
};

/** A run's mark: ✓ passed, ✗ failed, … still going, · none. A run older than two days is stale (a schedule that stopped). */
export function runMark(run: Run | undefined, now = Date.now()): { mark: string; text: string } {
  if (!run) return { mark: "·", text: "no run" };
  const when = age(run.createdAt, now);
  if (run.status !== "completed") return { mark: "…", text: `${run.status}, ${when}` };
  const stale = now - Date.parse(run.createdAt) > 2 * DAY ? ", no run since (the schedule?)" : "";
  return { mark: run.conclusion === "success" ? "✓" : "✗", text: `${run.conclusion}, ${when}${stale}` };
}

/** Which job opened a pull request, by its branch. */
export function prKind(pr: Pr): "pins" | "players" | "game-data" | "other" {
  return pr.headRefName === "pins" || pr.headRefName === "players" || pr.headRefName === "game-data" ? pr.headRefName : "other";
}

// ── the facts ───────────────────────────────────────────────────────────────

export type Line = [kind: string, entity: string, field: string, value: string, build: string | null, who: string[]];
export type Verdict = "known" | "fills" | "new" | "differs" | "flag";
export type Judged = { game: string; locale: string; line: Line; verdict: Verdict; why: string; more?: boolean };

const KINDS = new Set(["npc", "quest", "loot", "say", "gossip"]);
const RANKS = new Set(["normal", "trivial", "minus", "elite", "rareelite", "worldboss", "rare"]);
const QUEST_TEXTS = new Set(["details", "objectives", "request", "reward"]);
const FAR = 15; // (percent of a zone's map: a sighting is where the player stood, not the creature)

/** The facts a diff of data/players adds, file by file; a line whose key a removed line shares is one more player of a known fact. */
export function addedFacts(diff: string): { game: string; locale: string; line: unknown; raw: string; more: boolean }[] {
  const out: { game: string; locale: string; line: unknown; raw: string; more: boolean }[] = [];
  let file: { game: string; locale: string } | undefined;
  let removed = new Set<string>();
  const added: { game: string; locale: string; line: unknown; raw: string }[] = [];
  const flush = () => {
    for (const a of added) out.push({ ...a, more: Array.isArray(a.line) && removed.has(key(a.line as unknown[])) });
    added.length = 0;
    removed = new Set();
  };
  for (const text of diff.split("\n")) {
    const head = text.match(/^\+\+\+ b\/data\/players\/([^/]+)\/([a-z]{2}[A-Z]{2})\.json$/);
    if (text.startsWith("diff --git")) {
      flush();
      file = undefined;
    }
    if (head) file = { game: head[1], locale: head[2] };
    if (!file || text.startsWith("+++") || text.startsWith("---")) continue;
    const body = text.slice(1).replace(/,$/, "");
    if (!body.startsWith("[")) continue;
    let line: unknown;
    try {
      line = JSON.parse(body);
    } catch {
      line = undefined;
    }
    if (text.startsWith("-") && Array.isArray(line)) removed.add(key(line));
    else if (text.startsWith("+")) added.push({ ...file, line, raw: body });
  }
  flush();
  return out;
}
const key = (l: unknown[]) => l.slice(0, 4).map(String).join("\u0000");

/** What a shape or a text alone says is wrong, else nothing. */
export function shapeProblem(line: unknown): string | undefined {
  if (!Array.isArray(line) || line.length !== 6) return "not a fact's shape (6 fields)";
  const [kind, entity, field, value, build, who] = line;
  if (typeof kind !== "string" || !KINDS.has(kind)) return `kind ${JSON.stringify(kind)} the build doesn't know`;
  if (typeof entity !== "string" || !(kind === "loot" ? /^(npc|object):\d{1,8}$/ : /^\d{1,8}$/).test(entity)) return `entity ${JSON.stringify(entity)}`;
  if (typeof field !== "string" || !/^[a-zA-Z]{1,20}$/.test(field)) return `field ${JSON.stringify(field)}`;
  if (typeof value !== "string") return "value not a string";
  if (build !== null && (typeof build !== "string" || !/^\d{4,6}$/.test(build))) return `build ${JSON.stringify(build)}`;
  if (!Array.isArray(who) || who.length < 1 || who.length > 20 || !who.every((w) => typeof w === "string" && /^[0-9a-f]{8}$/.test(w)))
    return "who: not 1 to 20 hashes";
  return textProblem(value);
}

/** Text a reader might be meant to read (a link, markup, the game's escape codes), hidden characters, or a wall. */
export function textProblem(value: string): string | undefined {
  if (value.length > 4000) return `${value.length} characters`;
  if (/https?:|www\.|\.(com|net|org|gg|io)\b/i.test(value)) return "a link";
  if (/\|[cHhTtKAr]/.test(value)) return "the game's escape codes (|c, |H, |T...)";
  if (/<\/?[a-z!]/i.test(value)) return "markup";
  if (/[\u0000-\u0009\u000b-\u001f\u007f​-‏‪-‮⁦-⁩﻿]/.test(value)) return "hidden or control characters";
  return undefined;
}

/** The database's side of a fact, as `judge` asks it (a fake in the tests). */
export interface Facts {
  creature(id: number): { min_level: number | null; max_level: number | null; rank: number | null; type_id: number | null; family_id: number | null } | undefined;
  object(id: number): boolean;
  quest(id: number): boolean;
  item(id: number): boolean;
  name(kind: string, id: number, locale: string): string | undefined;
  questText(id: number, locale: string, field: string): string | undefined;
  relations(id: number, role: "start" | "end"): string[]; // "npc:123", "object:4"
  line(npc: number, locale: string, kind: string, text: string): "same" | "variant" | undefined; // (the build's row is the exact text: a variant is a row more)
  looted(kind: "creature" | "object", id: number): boolean;
  spots(npc: number, uiMap: number): [number, number][]; // the creature's spawns on that map, in its percent
}

const RANK_OF: Record<string, number> = { normal: 0, trivial: 0, minus: 0, elite: 1, rareelite: 2, worldboss: 3, rare: 4 };
const same = (a: string, b: string) => a.replace(/\s+/g, " ").trim().toLowerCase() === b.replace(/\s+/g, " ").trim().toLowerCase();
// (a text as the game wrote it: $B a new line, $N/$C/$R the reader's name, class
// and race, $g male:female; the reader's word in a player's copy, a mark of the
// collector's ($C{Hunter}), or the token itself)
const TOKEN = "\u0001";
const flat = (s: string) =>
  s
    .replace(/\$[bB]/g, " ")
    .replace(/\$[gG][^;$]*;/g, TOKEN)
    .replace(/\$[nNcCrR](\{[^}]*\})?/g, TOKEN)
    .replace(/[^\p{L}\p{N}\u0001]+/gu, " ")
    .trim()
    .toLowerCase();
export function sameText(player: string, db: string): boolean {
  if (same(player, db)) return true;
  const theirs = flat(player);
  const pattern = flat(db)
    .split(TOKEN)
    .map((p) => p.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join(".{0,40}?");
  return new RegExp(`^${pattern}$`, "u").test(theirs);
}
const short = (s: string, n = 70) => (s.length > n ? `${s.slice(0, n - 1)}…` : s).replace(/\n/g, "⏎");

function position(value: string): [number, number, number] | undefined {
  try {
    const p = JSON.parse(value);
    if (Array.isArray(p) && p.length === 3 && Number.isInteger(p[0]) && p[0] >= 1 && p[0] <= 100_000 && [p[1], p[2]].every((n) => typeof n === "number" && n >= 0 && n <= 100))
      return p as [number, number, number];
  } catch {}
  return undefined;
}

/** One added fact against the database. */
export function judge(game: string, locale: string, raw: unknown, db: Facts): Judged {
  const problem = shapeProblem(raw);
  const line = (Array.isArray(raw) ? raw : ["?", "?", "?", "?", null, []]) as Line;
  const out = (verdict: Verdict, why: string): Judged => ({ game, locale, line, verdict, why });
  if (problem) return out("flag", problem);
  const [kind, entity, field, value] = line;
  if (kind === "loot") {
    const [what, sid] = entity.split(":");
    const id = Number(sid);
    if (!/^\d+$/.test(value)) return out("flag", `item ${JSON.stringify(value)}`);
    if (!db.item(Number(value))) return out("flag", `item ${value} no source has`);
    const has = what === "npc" ? !!db.creature(id) : db.object(id);
    if (!has) return out("new", `${what} ${id} no source has`);
    return db.looted(what === "npc" ? "creature" : "object", id) ? out("known", "its loot known already (the build keeps it)") : out("fills", "loot no source gives");
  }
  const id = Number(entity);
  if (kind === "say" || kind === "gossip") {
    if (!db.creature(id)) return out("new", `creature ${id} no source has`);
    const have = db.line(id, locale, kind === "gossip" ? "gossip" : field, value);
    return have === "same" ? out("known", "the same line") : out("fills", `${have === "variant" ? "a variant of a known line" : "a line"}: ${short(value)}`);
  }
  if (kind === "quest") {
    if (!db.quest(id)) return out("new", `quest ${id} no source has${field === "title" ? `: ${short(value)}` : ""}`);
    if (field === "title") {
      const have = db.name("quest", id, locale);
      return !have ? out("fills", `title ${short(value)}`) : same(have, value) ? out("known", "") : out("differs", `"${short(value)}", the database "${short(have)}"`);
    }
    if (QUEST_TEXTS.has(field)) {
      const have = db.questText(id, locale, field);
      return !have ? out("fills", `${field}: ${short(value)}`) : sameText(value, have) ? out("known", "") : out("differs", `${field} "${short(value)}", the database "${short(have)}"`);
    }
    if (field === "giver" || field === "ender") {
      const m = value.match(/^(npc|object):(\d+)$/);
      if (!m) return out("flag", `${field} ${JSON.stringify(value)}`);
      const known = m[1] === "npc" ? !!db.creature(Number(m[2])) : db.object(Number(m[2]));
      const have = db.relations(id, field === "giver" ? "start" : "end");
      if (have.includes(value)) return out("known", "");
      if (!known) return out("new", `${field} ${value} no source has`);
      return have.length ? out("differs", `${field} ${value}, the database ${have.join(", ")}`) : out("fills", `${field} ${value}`);
    }
    if (field === "where") return position(value) ? out("known", "where the player stood (not loaded)") : out("flag", `where ${value} out of bounds`);
    return out("known", `${field}: the build doesn't load it`);
  }
  // (npc)
  const c = db.creature(id);
  if (field === "where") {
    const p = position(value);
    if (!p) return out("flag", `where ${value} out of bounds`);
    if (!c) return out("new", `creature ${id} no source has, seen on map ${p[0]}`);
    const spots = db.spots(id, p[0]);
    if (!spots.length) return out("fills", `a sighting on map ${p[0]}, where no source puts it`);
    const near = Math.min(...spots.map(([x, y]) => Math.hypot(x - p[1], y - p[2])));
    return near > FAR ? out("flag", `seen ${near.toFixed(0)}% of the map from its nearest spawn`) : out("fills", "a sighting near its spawns (creature_sighting, never a spawn)");
  }
  if (!c) return out("new", `creature ${id} no source has${field === "name" ? `: ${short(value)}` : ""}`);
  if (field === "name") {
    const have = db.name("creature", id, locale);
    return !have ? out("fills", `name ${short(value)}`) : same(have, value) ? out("known", "") : out("differs", `"${short(value)}", the database "${short(have)}"`);
  }
  if (field === "level") {
    let r: unknown;
    try {
      r = JSON.parse(value);
    } catch {}
    if (!Array.isArray(r) || r.length !== 2 || !r.every((n) => Number.isInteger(n) && n >= 1 && n <= 100) || r[0] > r[1]) return out("flag", `level ${value}`);
    const [lo, hi] = r as [number, number];
    if (c.min_level === null || c.max_level === null) return out("fills", `level ${lo}-${hi}`);
    return lo >= c.min_level && hi <= c.max_level ? out("known", "") : out("differs", `level ${lo}-${hi}, the database ${c.min_level}-${c.max_level}`);
  }
  if (field === "rank") {
    if (!RANKS.has(value)) return out("flag", `rank ${JSON.stringify(value)}`);
    if (c.rank === null) return out("fills", `rank ${value}`);
    return RANK_OF[value] === c.rank ? out("known", "") : out("differs", `rank ${value}, the database ${c.rank}`);
  }
  if (field === "typeId" || field === "familyId") {
    if (!/^\d{1,4}$/.test(value)) return out("flag", `${field} ${JSON.stringify(value)}`);
    const have = field === "typeId" ? c.type_id : c.family_id;
    return have === null ? out("fills", `${field} ${value}`) : have === Number(value) ? out("known", "") : out("differs", `${field} ${value}, the database ${have}`);
  }
  return out("known", `${field}: ${short(value, 40)}`);
}

/** The database through `Facts`. */
export function factsOf(db: Database): Facts {
  const q = <T>(sql: string) => db.query<T, (string | number)[]>(sql);
  const creature = q<{ min_level: number | null; max_level: number | null; rank: number | null; type_id: number | null; family_id: number | null }>(
    "SELECT min_level, max_level, rank, type_id, family_id FROM creature WHERE id = ?",
  );
  const exists = (table: string) => q<{ 1: number }>(`SELECT 1 FROM ${table} WHERE id = ?`);
  const object = exists("object"),
    quest = exists("quest"),
    item = exists("item");
  const name = q<{ name: string }>("SELECT name FROM name WHERE kind = ? AND id = ? AND locale = ?");
  const text = q<{ text: string }>("SELECT text FROM quest_text WHERE quest_id = ? AND locale = ? AND field = ?");
  const rel = q<{ kind: string; entity_id: number }>("SELECT DISTINCT kind, entity_id FROM quest_relation WHERE quest_id = ? AND role = ?");
  const line = q<{ text: string }>("SELECT text FROM npc_line WHERE npc_id = ? AND locale = ? AND kind = ?");
  const looted = q<{ 1: number }>(
    "SELECT 1 FROM loot WHERE kind = ? AND source_id = coalesce((SELECT loot_id FROM creature WHERE ? = 'creature' AND id = ?), (SELECT loot_id FROM object WHERE ? = 'object' AND id = ?), ?)",
  );
  // (a spawn's percent is on its ui map, else on its zone's: the zones a ui map shows)
  const spots = q<{ ux: number; uy: number }>(
    `SELECT ux, uy FROM spawn WHERE kind = 'creature' AND entity_id = ? AND ux IS NOT NULL
       AND (ui_map_id = ? OR (ui_map_id IS NULL AND area_id IN (SELECT AreaID FROM client_UiMapAssignment WHERE UiMapID = ? AND AreaID > 0)))`,
  );
  return {
    creature: (id) => creature.get(id) ?? undefined,
    object: (id) => !!object.get(id),
    quest: (id) => !!quest.get(id),
    item: (id) => !!item.get(id),
    name: (kind, id, locale) => name.get(kind, id, locale)?.name,
    questText: (id, locale, field) => text.get(id, locale, field)?.text,
    relations: (id, role) => rel.all(id, role).map((r) => `${r.kind === "creature" ? "npc" : r.kind}:${r.entity_id}`),
    line: (npc, locale, kind, value) => {
      const texts = line.all(npc, locale, kind).map((l) => l.text);
      // (as the build writes it: players.ts's gameText)
      return texts.includes(value.replace(/\r?\n/g, "$B")) ? "same" : texts.some((t) => sameText(value, t)) ? "variant" : undefined;
    },
    looted: (kind, id) => !!looted.get(kind, kind, id, kind, id, id),
    spots: (npc, map) => spots.all(npc, map, map).map((s) => [s.ux, s.uy]),
  };
}

/** The report: counts by verdict, then every line but the known ones (the merge changes nothing for those). */
export function report(judged: Judged[], pins: Record<string, string>): string[] {
  const out: string[] = [];
  const groups = new Map<string, Judged[]>();
  for (const j of judged) groups.set(`${j.game}/${j.locale}`, [...(groups.get(`${j.game}/${j.locale}`) ?? []), j]);
  for (const [file, js] of groups) {
    const n = (v: Verdict) => js.filter((j) => j.verdict === v).length;
    const builds = [...new Set(js.map((j) => j.line[4]).filter(Boolean))].sort();
    const pin = pins[js[0].game];
    const ahead = builds.filter((b) => pin && Number(b) > Number(pin));
    out.push(
      `${file}: ${js.length} lines (${js.filter((j) => j.more).length} one more player of a known fact), ${n("known")} known, ${n("fills")} fill a gap, ${n("new")} new ids, ${n("differs")} differ, ${n("flag")} flagged`,
      `  builds ${builds.join(", ") || "none"}${pin ? ` (pinned ${pin}${ahead.length ? `: ${ahead.join(", ")} ahead of the pin` : ""})` : ""}`,
    );
  }
  for (const v of ["flag", "differs", "new", "fills"] as Verdict[]) {
    const js = judged.filter((j) => j.verdict === v);
    if (!js.length) continue;
    out.push("", `${{ flag: "Flagged", differs: "Differs from the database", new: "New ids", fills: "Fills a gap" }[v]} (${js.length}):`);
    for (const j of js) out.push(`  ${j.game}/${j.locale} ${j.line[0]} ${j.line[1]} ${j.line[2]}: ${j.why}`);
  }
  return out;
}

// ── two builds of a database ────────────────────────────────────────────────

const tables = (db: Database) =>
  (db.query("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as { name: string }[]).map((t) => t.name);
const hasId = (db: Database, table: string) =>
  (db.query(`PRAGMA table_info("${table}")`).all() as { name: string; pk: number }[]).some((c) => c.name === "id" && c.pk === 1);
const listed = (ids: (string | number)[], n = 10) => `${ids.slice(0, n).join(", ")}${ids.length > n ? ", …" : ""}`;

/** What moved between two builds of a game's database: rows by table, the ids a table lost (a saved id may be one), English names changed or gone. */
export function dbDiff(before: Database, after: Database): string[] {
  const out: string[] = [];
  const tag = (db: Database) => {
    try {
      return (db.query("SELECT value FROM meta WHERE key = 'tag'").get() as { value: string } | null)?.value ?? "no tag";
    } catch {
      return "no tag";
    }
  };
  out.push(`Built: before ${tag(before)}, after ${tag(after)} (main's must be main's: bun wow-data/bin/get.ts <game> when it isn't)`);
  const a = new Set(tables(before)),
    b = new Set(tables(after));
  const count = (db: Database, t: string) => (db.query(`SELECT count(*) AS n FROM "${t}"`).get() as { n: number }).n;
  const rows: string[] = [];
  for (const t of [...new Set([...a, ...b])].sort()) {
    if (!b.has(t)) rows.push(`  ${t}: gone (${count(before, t)} rows)`);
    else if (!a.has(t)) rows.push(`  ${t}: new (${count(after, t)} rows)`);
    else {
      const [x, y] = [count(before, t), count(after, t)];
      if (x !== y) rows.push(`  ${t}: ${x} → ${y} (${y > x ? "+" : ""}${y - x})`);
    }
  }
  out.push(rows.length ? "Rows by table:" : "Rows by table: the same in every table", ...rows);
  const lost: string[] = [];
  for (const t of [...a].filter((t) => b.has(t) && hasId(before, t) && hasId(after, t))) {
    const now = new Set((after.query(`SELECT id FROM "${t}"`).all() as { id: number }[]).map((r) => r.id));
    const gone = (before.query(`SELECT id FROM "${t}" ORDER BY id`).all() as { id: number }[]).map((r) => r.id).filter((id) => !now.has(id));
    if (gone.length) lost.push(`  ! ${t}: ${gone.length} ids gone (${listed(gone)})`);
  }
  out.push(lost.length ? "Ids lost (a journal may hold one: each addon's ids check says):" : "Ids lost: none", ...lost);
  if (a.has("name") && b.has("name")) {
    const names = (db: Database) =>
      new Map((db.query("SELECT kind, id, name FROM name WHERE locale = 'enUS'").all() as { kind: string; id: number; name: string }[]).map((r) => [`${r.kind} ${r.id}`, r.name]));
    const [x, y] = [names(before), names(after)];
    const changed: string[] = [];
    const gone: string[] = [];
    for (const [k, n] of x) {
      const m = y.get(k);
      if (m === undefined) gone.push(k);
      else if (m !== n) changed.push(`${k} "${n}" → "${m}"`);
    }
    out.push(`English names: ${changed.length} changed, ${gone.length} gone, ${[...y.keys()].filter((k) => !x.has(k)).length} new`);
    for (const c of changed.slice(0, 20)) out.push(`  ${c}`);
    if (changed.length > 20) out.push(`  … ${changed.length - 20} more`);
    if (gone.length) out.push(`  gone: ${listed(gone, 20)}`);
  }
  return out;
}

// ── the command ─────────────────────────────────────────────────────────────

function sh(cmd: string[], cwd?: string): string {
  const p = Bun.spawnSync(cmd, { cwd, stdout: "pipe", stderr: "pipe" });
  if (p.exitCode !== 0) throw new Error(`${cmd.slice(0, 3).join(" ")}: ${p.stderr.toString().trim()}`);
  return p.stdout.toString();
}
const ghJson = <T>(...args: string[]): T => JSON.parse(sh(["gh", ...args]) || "null") as T;
// (one repository's failure said on its line, the rest still listed)
function tried<T>(f: () => T): T | Error {
  try {
    return f();
  } catch (e) {
    return e instanceof Error ? e : new Error(String(e));
  }
}

const ADDONS = ["hearthtale", "lorekeepers-codex", "yonder", "second-wind", "palaver", "mealbook", "goodwill", "yours-truly"];

function status(root: string) {
  const slugs = new Map<string, string>();
  const slug = (repo: string) => {
    if (!slugs.has(repo)) slugs.set(repo, slugOf(sh(["git", "-C", join(root, repo), "remote", "get-url", "origin"])) ?? repo);
    return slugs.get(repo) as string;
  };
  console.log("Runs (each job's last):");
  for (const j of jobs(root, ADDONS)) {
    const runs = tried(() => ghJson<Run[]>("run", "list", "-R", slug(j.repo), "--workflow", j.workflow, "--limit", "1", "--json", "conclusion,status,createdAt,url"));
    if (runs instanceof Error) {
      console.log(`  ? ${j.repo.padEnd(18)} ${j.label.padEnd(18)} ${runs.message}`);
      continue;
    }
    const run = runs[0];
    const { mark, text } = runMark(run);
    console.log(`  ${mark} ${j.repo.padEnd(18)} ${j.label.padEnd(18)} ${text}${mark === "✗" ? `  ${run?.url}` : ""}`);
  }
  console.log("\nOpen pull requests:");
  let any = false;
  for (const repo of ["wow-data", ...ADDONS.filter((a) => existsSync(join(root, a)))]) {
    const prs = tried(() => ghJson<Pr[]>("pr", "list", "-R", slug(repo), "--state", "open", "--json", "number,title,headRefName,createdAt,url"));
    if (prs instanceof Error) {
      console.log(`  ? ${repo}: ${prs.message}`);
      continue;
    }
    for (const pr of prs) {
      any = true;
      const kind = prKind(pr);
      let checks = "";
      if (kind === "pins" || kind === "players") {
        const ci = tried(() => ghJson<Run[]>("run", "list", "-R", slug(repo), "--workflow", "ci.yml", "--branch", pr.headRefName, "--event", "workflow_dispatch", "--limit", "1", "--json", "conclusion,status,createdAt,url"));
        checks = ci instanceof Error ? `, its checks ? ${ci.message}` : `, its checks ${runMark(ci[0]).mark} ${runMark(ci[0]).text}`;
      }
      const next = { pins: "the builds moved and didn't merge: the skill's Pins part", players: "strangers' facts: data-prs.ts facts, then the user's go", "game-data": "a game-data pull request left open: read why", other: "not a data job's" }[kind];
      console.log(`  ${repo} #${pr.number} ${pr.title} (${pr.headRefName}, opened ${age(pr.createdAt)} ago${checks})\n      ${next}  ${pr.url}`);
    }
  }
  if (!any) console.log("  none");
}

async function facts(root: string, args: string[]) {
  const data = join(root, "wow-data");
  const outAt = args.indexOf("--out");
  const outFile = outAt >= 0 ? args[outAt + 1] : undefined;
  const asked = args.find((a, i) => /^\d+$/.test(a) && args[i - 1] !== "--out");
  const prs = ghJson<(Pr & { baseRefName: string })[]>("pr", "list", "-R", "salty-max/wow-data", "--state", "open", "--json", "number,title,headRefName,baseRefName,createdAt,url");
  const pr = asked ? prs.find((p) => p.number === Number(asked)) : prs.find((p) => p.headRefName === "players");
  if (!pr) {
    console.log(asked ? `wow-data #${asked}: not an open pull request` : "No players' facts pull request open.");
    return;
  }
  sh(["git", "-C", data, "fetch", "--quiet", "origin", `+refs/heads/${pr.headRefName}:refs/remotes/origin/${pr.headRefName}`, `+refs/heads/${pr.baseRefName}:refs/remotes/origin/${pr.baseRefName}`]);
  const range = `origin/${pr.baseRefName}...origin/${pr.headRefName}`;
  const diff = sh(["git", "-C", data, "diff", "--unified=0", range, "--", "data/players"]);
  const other = sh(["git", "-C", data, "diff", "--name-only", range]).split("\n").filter((f) => f && !f.startsWith("data/players/"));
  console.log(`wow-data #${pr.number} ${pr.title}, opened ${age(pr.createdAt)} ago (${range})`);
  if (other.length) console.log(`  ! it changes more than data/players: ${other.join(", ")}`);
  const odd = sh(["git", "-C", data, "diff", "--name-only", range, "--", "data/players"])
    .split("\n")
    .filter((f) => f && !/^data\/players\/[^/]+\/[a-z]{2}[A-Z]{2}\.json$/.test(f));
  if (odd.length) console.log(`  ! files under data/players this reader doesn't take (read them by hand): ${odd.join(", ")}`);
  const added = addedFacts(diff);
  if (!added.length) {
    console.log("  Nothing added against main: the facts are main's already. Close it (the next day with facts opens another).");
    return;
  }
  const pins = JSON.parse(readFileSync(join(data, "pins.json"), "utf8")).builds as Record<string, { build: string }>;
  // (wow-data's own opening: it says when a database isn't this checkout's)
  const { openDb } = (await import(join(data, "src", "db.ts"))) as { openDb: (game: string) => Database };
  const dbs = new Map<string, Facts>();
  const judged = added.map((a) => {
    if (!dbs.has(a.game)) dbs.set(a.game, factsOf(openDb(a.game)));
    return { ...judge(a.game, a.locale, a.line, dbs.get(a.game) as Facts), more: a.more };
  });
  const lines = report(judged, Object.fromEntries(Object.entries(pins).map(([g, p]) => [g, p.build.split(".").pop() as string])));
  if (outFile) {
    mkdirSync(dirname(outFile), { recursive: true });
    writeFileSync(outFile, `${lines.join("\n")}\n`);
    console.log(lines.filter((l) => l && (!l.startsWith("  ") || l.startsWith("  builds"))).join("\n"));
    console.log(`  the whole report: ${outFile}`);
  } else console.log(lines.join("\n"));
}

if (import.meta.main) {
  const [command, ...rest] = process.argv.slice(2);
  const root = familyRoot();
  if (!command) status(root);
  else if (command === "facts") await facts(root, rest);
  else if (command === "db-diff" && rest.length === 2) {
    const { Database: Db } = await import("bun:sqlite");
    for (const f of rest) if (!existsSync(f)) throw new Error(`${f}: no such database`);
    console.log(dbDiff(new Db(rest[0], { readonly: true }), new Db(rest[1], { readonly: true })).join("\n"));
  }
  else {
    console.error("usage: data-prs.ts [facts [<pr>] [--out <file>] | db-diff <before.db> <after.db>]");
    process.exit(2);
  }
}
