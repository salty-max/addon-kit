/**
 * Ids stay decodable: a table naming the ids a saved file keeps (a journal's
 * creatures, quests, places, flights, recipes...) never loses one when it is
 * regenerated. The tables are the repository's `saved-ids.json`; the check
 * compares each one's ids, file by file, before and after: the fork point
 * from origin/main (what the players' files were written against), and the
 * working directory. An id gone fails the check, so a daily game-data job
 * stops before its pull request and tells the owner.
 *
 *   bun ../addon-kit/ids.ts check [--base REV] [--head REV]
 *   bun ../addon-kit/ids.ts list [--head REV]
 *   (from an addon: bun scripts/root.ts --run addon-kit/ids.ts check)
 *
 *   ids: ok, 41,230 ids in 38 files, none missing against 7f41c74
 *   ids: FAILED, 245 ids a saved file may hold missing against 7f41c74 …
 *     creatures addon/Hearthtale/English_Forever.lua: 217 missing (202093, …)
 *
 * --base: the revision before (the fork point by default), --head: a revision
 * instead of the working directory (an audit of a past change).
 *
 * saved-ids.json:
 *
 *   { "tables": {
 *       "creatures": { "lua": "addon/X/English_*.lua", "at": "englishNames().creatures" },
 *       "creatures (Forever)": { "json": "i18n/*\/creatures.json", "at": ["forever", "foreverLeftOut"] } },
 *     "removed": [
 *       { "table": "creatures (Forever)", "file": "i18n/frFR/creatures.json", "ids": [123],
 *         "why": "…", "approved": "2026-10-21, the user's go" } ] }
 *
 *   lua: a glob of generated Lua files, each run in LuaJIT as the game loads
 *   it (`local _, ns = ...`); at: a path from ns, "()" calling a function on
 *   the way. The ids are the table's keys and its __index chain's (a name
 *   behind the table, found by id alone, still decodes).
 *   json: a glob of JSON files; at: a key path ("" the file itself), or
 *   several, their ids together (an id moved from one to another stays). An
 *   object's keys are the ids, an array's items.
 *   removed: an id leaving on purpose, only with the user's go: the table,
 *   the file (a glob; every file when left out), the ids ("*": all), why,
 *   and when the user approved it. Both are required.
 *
 * Each side reads its own saved-ids.json (a past head without one the
 * working directory's), the base the head's new tables besides: a table left
 * out of the manifest, or a path taken from it, loses its ids, and a table
 * added with a regeneration that drops ids from it is compared. The whole
 * list of what is missing: .cache/logs/ids-missing.json, and the run's
 * summary on GitHub.
 */
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cacheDir, topLevel } from "./q";

export const MANIFEST = "saved-ids.json";

export type Table = { lua?: string; json?: string; at?: string | string[] };
export type Removal = { table: string; file?: string; ids: (string | number)[] | "*"; why: string; approved: string };
export type Manifest = { tables: Record<string, Table>; removed?: Removal[] };
/** One revision's ids: table -> file -> ids (undefined: nothing at any path). */
export type Ids = Map<string, Map<string, Set<string> | undefined>>;
export type Missing = { table: string; file: string; ids: string[] };

// ── git ─────────────────────────────────────────────────────────────────────
function git(cwd: string, args: string[]): string | undefined {
  const p = Bun.spawnSync(["git", ...args], { cwd, stderr: "ignore" });
  return p.exitCode === 0 ? p.stdout.toString() : undefined;
}

/** The fork point from the branch the players' files came from: origin's main, else the upstream, else HEAD
 * (a branch's own pushed tip is no base: a loss pushed there would pass). */
export function forkPoint(top: string): string | undefined {
  for (const ref of ["origin/HEAD", "origin/main", "@{upstream}"]) {
    const base = git(top, ["merge-base", "HEAD", ref])?.trim();
    if (base) return base;
  }
  return git(top, ["rev-parse", "--verify", "-q", "HEAD"])?.trim();
}

/** A revision's files, or the working directory's (rev undefined). */
export class Side {
  private listed?: string[];
  constructor(
    readonly top: string,
    readonly rev?: string,
  ) {}
  files(pattern: string): string[] {
    const glob = new Bun.Glob(pattern);
    if (this.rev === undefined) return [...glob.scanSync({ cwd: this.top, onlyFiles: true, dot: false })].sort();
    this.listed ??= (git(this.top, ["ls-tree", "-r", "-z", "--name-only", this.rev]) ?? "").split("\0").filter(Boolean);
    return this.listed.filter((f) => glob.match(f)).sort();
  }
  read(file: string): string | undefined {
    if (this.rev === undefined) return existsSync(join(this.top, file)) ? readFileSync(join(this.top, file), "utf8") : undefined;
    return git(this.top, ["show", `${this.rev}:${file}`]);
  }
  get name(): string {
    return this.rev === undefined ? "the working directory" : this.rev.slice(0, 7);
  }
}

// ── the manifest ─────────────────────────────────────────────────────────────
export function parseManifest(text: string, where: string): Manifest {
  const m = JSON.parse(text) as Manifest;
  if (!m || typeof m.tables !== "object") throw new Error(`${where}: no "tables"`);
  for (const [name, t] of Object.entries(m.tables)) {
    if (!t.lua === !t.json) throw new Error(`${where}: table "${name}" needs one of "lua" or "json"`);
    if (t.lua && !t.at) throw new Error(`${where}: table "${name}" (lua) needs "at"`);
  }
  for (const r of m.removed ?? []) {
    if (typeof r.table !== "string" || !r.table) throw new Error(`${where}: a removal without its table`);
    if (!r.why?.trim() || !r.approved?.trim())
      throw new Error(`${where}: the removal from "${r.table}" needs "why" and "approved" (when the user said yes)`);
    if (r.ids !== "*" && !Array.isArray(r.ids)) throw new Error(`${where}: the removal from "${r.table}": "ids" a list or "*"`);
  }
  return m;
}

const paths = (t: Table): string[] => (Array.isArray(t.at) ? t.at : [t.at ?? ""]);

// ── reading ids ──────────────────────────────────────────────────────────────
/** A JSON file's ids at the paths, together (undefined: none of them there). */
export function jsonIds(text: string, at: string[]): Set<string> | undefined {
  const doc = JSON.parse(text);
  let found = false;
  const ids = new Set<string>();
  for (const path of at) {
    let v: unknown = doc;
    for (const seg of path ? path.split(".") : []) v = v && typeof v === "object" ? (v as Record<string, unknown>)[seg] : undefined;
    if (v === undefined || v === null || typeof v !== "object") continue;
    found = true;
    if (Array.isArray(v)) for (const x of v) ids.add(String(x));
    else for (const k of Object.keys(v)) ids.add(k);
  }
  return found ? ids : undefined;
}

// (the file on stdin, the paths in IDS_AT, one a line; out: "@ok" or
// "@missing" for each path, then its ids, each "=" first)
const LUA = String.raw`
local src = io.read("*a")
local chunk, err = loadstring(src, "=" .. (os.getenv("IDS_FILE") or "?"))
if not chunk then io.stderr:write(err, "\n") os.exit(2) end
local ns = {}
local ok, e = pcall(chunk, "Addon", ns)
if not ok then io.stderr:write(tostring(e), "\n") os.exit(2) end
local memo = {}
local function at(path)
  local v, sofar = ns, ""
  for seg in path:gmatch("[^.]+") do
    local name, call = seg:match("^(.-)(%(%))$")
    name = name or seg
    sofar = sofar .. "." .. seg
    if type(v) ~= "table" then return nil end
    if call then
      if memo[sofar] == nil then
        local f = v[name]
        if type(f) ~= "function" then return nil end
        memo[sofar] = f()
      end
      v = memo[sofar]
    else
      v = v[name]
    end
  end
  return v
end
local function key(k)
  if type(k) == "number" and k == math.floor(k) then return string.format("%.0f", k) end
  -- (a string that reads as a number quoted: ["123"] never finds [123])
  if type(k) == "string" and tonumber(k) then return '"' .. k .. '"' end
  return (tostring(k):gsub("\n", "\\n"))
end
local out = {}
for path in (os.getenv("IDS_AT") or ""):gmatch("[^\n]+") do
  local t = at(path)
  if type(t) ~= "table" then
    out[#out + 1] = "@missing"
  else
    out[#out + 1] = "@ok"
    local seen, depth = {}, 0
    while type(t) == "table" and depth < 16 do
      for k in pairs(t) do
        local s = key(k)
        if not seen[s] then seen[s] = true out[#out + 1] = "=" .. s end
      end
      local mt = getmetatable(t)
      t = mt and type(mt.__index) == "table" and mt.__index or nil
      depth = depth + 1
    end
  end
end
io.write(table.concat(out, "\n"), "\n")
`;

/** A generated Lua file's ids at each path, as the game loads it. */
export function luaIds(text: string, at: string[], file = "?"): (Set<string> | undefined)[] {
  const p = Bun.spawnSync(["luajit", "-e", LUA], {
    stdin: new TextEncoder().encode(text),
    env: { ...process.env, IDS_AT: at.join("\n"), IDS_FILE: file },
  });
  if (p.exitCode !== 0) throw new Error(`${file}: luajit couldn't load it: ${p.stderr.toString().trim()}`);
  const result: (Set<string> | undefined)[] = [];
  let cur: Set<string> | undefined;
  for (const line of p.stdout.toString().split("\n")) {
    if (line === "@ok") result.push((cur = new Set()));
    else if (line === "@missing") result.push((cur = undefined));
    else if (line.startsWith("=") && cur) cur.add(line.slice(1));
  }
  return result;
}

/** Every table's ids on one side, file by file. */
export function readIds(side: Side, manifest: Manifest): Ids {
  const out: Ids = new Map();
  for (const [name, t] of Object.entries(manifest.tables)) {
    const files = new Map<string, Set<string> | undefined>();
    for (const file of side.files((t.lua ?? t.json)!)) {
      const text = side.read(file);
      if (text === undefined) continue;
      try {
        if (t.json) files.set(file, jsonIds(text, paths(t)));
        else {
          // (one run a file: its paths together, a union like a json table's)
          const sets = luaIds(text, paths(t), `${side.name}:${file}`);
          const found = sets.filter((s): s is Set<string> => s !== undefined);
          files.set(file, found.length ? new Set(found.flatMap((s) => [...s])) : undefined);
        }
      } catch (e) {
        throw new Error(`${side.name}: ${(e as Error).message.startsWith(file) ? "" : `${file}: `}${(e as Error).message}`);
      }
    }
    out.set(name, files);
  }
  return out;
}

// ── comparing ────────────────────────────────────────────────────────────────
const allowed = (removed: Removal[], table: string, file: string, id: string) =>
  removed.some((r) => r.table === table && (!r.file || new Bun.Glob(r.file).match(file)) && (r.ids === "*" || r.ids.some((x) => String(x) === id)));

/** What the base had and the head lacks, the removals approved let go. */
export function missing(before: Ids, after: Ids, removed: Removal[] = []): Missing[] {
  const out: Missing[] = [];
  for (const [table, files] of before) {
    for (const [file, ids] of files) {
      if (!ids) continue;
      const now = after.get(table)?.get(file);
      const gone = [...ids].filter((id) => !now?.has(id) && !allowed(removed, table, file, id));
      if (gone.length) out.push({ table, file, ids: gone.sort((a, b) => Number(a) - Number(b) || a.localeCompare(b)) });
    }
  }
  return out;
}

/** The manifest kept out of the release: the BigWigs packager ships every root file .pkgmeta doesn't ignore. */
export function shipped(pkgmeta: string | undefined): boolean {
  if (pkgmeta === undefined) return false;
  const ignore = pkgmeta.match(/^ignore:[ \t]*(?:#.*)?\r?\n((?:[ \t]*-.*\r?\n?|\s*#.*\n?|\s*\n)*)/m)?.[1] ?? "";
  return !ignore.split("\n").some((l) => l.replace(/#.*/, "").trim().replace(/^-\s*/, "").replace(/^["']|["']$/g, "") === MANIFEST);
}

/** A manifest path that finds nothing in any of its table's files: stale. */
export function stale(manifest: Manifest, after: Ids): string[] {
  const out: string[] = [];
  for (const [name, t] of Object.entries(manifest.tables)) {
    const files = after.get(name);
    if (!files?.size) out.push(`"${name}": no file matches ${t.lua ?? t.json}`);
    else if (![...files.values()].some((s) => s !== undefined)) out.push(`"${name}": nothing at ${paths(t).join(", ") || "the file itself"} in ${t.lua ?? t.json}`);
  }
  return out;
}

const count = (ids: Ids) => [...ids.values()].reduce((n, files) => n + [...files.values()].reduce((m, s) => m + (s?.size ?? 0), 0), 0);
const fileCount = (ids: Ids) => new Set([...ids.values()].flatMap((files) => [...files.keys()])).size;
const shown = (ids: string[], max = 8) => ids.slice(0, max).join(", ") + (ids.length > max ? `, … +${ids.length - max}` : "");

export function report(lost: Missing[], base: string): string[] {
  const total = lost.reduce((n, m) => n + m.ids.length, 0);
  return [
    `ids: FAILED, ${total.toLocaleString("en")} ids a saved file may hold missing against ${base}`,
    ...lost.map((m) => `  ${m.table} ${m.file}: ${m.ids.length} missing (${shown(m.ids)})`),
    "  An id stays decodable: keep it as an alias (wow-data's left_out, the generator keeping",
    `  old ids), or, with the user's go, list it under "removed" in ${MANIFEST} (why, approved).`,
  ];
}

// ── the command ──────────────────────────────────────────────────────────────
function option(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

function manifestOf(side: Side): Manifest | undefined {
  const text = side.read(MANIFEST);
  return text === undefined ? undefined : parseManifest(text, `${side.name}:${MANIFEST}`);
}

export function main(args: string[], cwd = process.cwd()): number {
  const [command = "check"] = args;
  const top = topLevel(cwd);
  if (!top) throw new Error(`${cwd}: not in a git repository`);
  const headRev = option(args, "--head");
  const head = new Side(top, headRev && (git(top, ["rev-parse", "--verify", "-q", `${headRev}^{commit}`])?.trim() ?? headRev));
  // (a past revision without one: today's, its tables maybe not made yet)
  const own = manifestOf(head);
  const manifest = own ?? (head.rev === undefined ? undefined : manifestOf(new Side(top)));
  if (!manifest) throw new Error(`${top}: no ${MANIFEST}`);
  const after = readIds(head, manifest);

  if (command === "list") {
    for (const [table, files] of after)
      for (const [file, ids] of files) console.log(`${table}\t${file}\t${ids === undefined ? "nothing at its paths" : ids.size}`);
    return 0;
  }
  if (command !== "check") throw new Error("usage: ids.ts check [--base REV] [--head REV] | list [--head REV]");

  const problems = own ? stale(manifest, after) : [];
  if (head.rev === undefined && shipped(head.read(".pkgmeta"))) problems.push(`.pkgmeta doesn't ignore ${MANIFEST}: the release would ship it`);
  if (problems.length) {
    console.log(`ids: FAILED, ${MANIFEST} wrong (${head.name}):`);
    for (const p of problems) console.log(`  ${p}`);
    return 1;
  }
  const baseRev = option(args, "--base") ?? forkPoint(top);
  if (!baseRev) {
    console.log(`ids: ok, ${count(after).toLocaleString("en")} ids in ${fileCount(after)} files, nothing before them (no commit yet)`);
    return 0;
  }
  const base = new Side(top, git(top, ["rev-parse", "--verify", "-q", `${baseRev}^{commit}`])?.trim() ?? baseRev);
  // (the base's own tables, and the head's new ones: a table added with a
  // regeneration that drops ids from it is compared too)
  const old = manifestOf(base);
  const before = readIds(base, old ? { ...old, tables: { ...manifest.tables, ...old.tables } } : manifest);
  const lost = missing(before, after, manifest.removed);
  if (!lost.length) {
    console.log(`ids: ok, ${count(after).toLocaleString("en")} ids in ${fileCount(after)} files, none missing against ${base.name}`);
    return 0;
  }
  const lines = report(lost, base.name);
  for (const l of lines) console.log(l);
  const file = join(cacheDir(top, "logs"), "ids-missing.json");
  writeFileSync(file, `${JSON.stringify({ base: base.rev, head: head.rev ?? "working directory", missing: lost }, null, 1)}\n`);
  console.log(`  The whole list: ${file.slice(top.length + 1)}`);
  const summary = process.env.GITHUB_STEP_SUMMARY;
  if (summary) {
    appendFileSync(
      summary,
      [
        `### Ids a saved file may hold, missing (against ${base.name})`,
        "",
        ...lines.slice(-2).map((l) => l.trim()),
        "",
        ...lost.map((m) => `- **${m.table}**, \`${m.file}\`, ${m.ids.length}: ${m.ids.join(", ")}`),
        "",
      ].join("\n"),
    );
  }
  return 1;
}

if (import.meta.main) {
  try {
    process.exit(main(process.argv.slice(2)));
  } catch (e) {
    console.log(`ids: FAILED, ${(e as Error).message}`);
    process.exit(2);
  }
}
