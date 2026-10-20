// ids.ts: a table naming saved ids never loses one (bun test).
import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { jsonIds, luaIds, missing, parseManifest, shipped, type Ids } from "./ids";

const made: string[] = [];
afterAll(() => {
  for (const dir of made) rmSync(dir, { recursive: true, force: true });
});
const temp = () => {
  const dir = mkdtempSync(join(tmpdir(), "kit-ids-"));
  made.push(dir);
  return dir;
};
const env = { ...process.env, GITHUB_STEP_SUMMARY: "" };
const run = (cwd: string, cmd: string[], more: Record<string, string> = {}) =>
  Bun.spawnSync(cmd, { cwd, env: { ...env, ...more }, stdout: "pipe", stderr: "pipe" });
const ids = (cwd: string, args: string[] = [], more: Record<string, string> = {}) => {
  const r = run(cwd, ["bun", join(import.meta.dir, "ids.ts"), "check", ...args], more);
  return { code: r.exitCode, out: r.stdout.toString() + r.stderr.toString() };
};
const write = (dir: string, file: string, text: string) => {
  mkdirSync(dirname(join(dir, file)), { recursive: true });
  writeFileSync(join(dir, file), text);
};
const commit = (dir: string, msg = "t") => {
  for (const cmd of [["git", "add", "-A"], ["git", "-c", "user.name=t", "-c", "user.email=t@t", "-c", "core.hooksPath=/dev/null", "commit", "-q", "-m", msg]])
    expect(run(dir, cmd).exitCode).toBe(0);
  return run(dir, ["git", "rev-parse", "HEAD"]).stdout.toString().trim();
};

// a generated Lua file as the game loads it: a function's tables, one behind another
const english = (live: number[], out: number[] = []) => `local _, ns = ...
function ns.englishNames()
  local out = { creatures = { ${out.map((id) => `[${id}]="Left ${id}"`).join(", ")} } }
  return { creatures = setmetatable({ ${live.map((id) => `[${id}]="Live ${id}"`).join(", ")} }, { __index = out.creatures }) }
end
`;
const names = (forever: number[], leftOut: number[] = []) =>
  JSON.stringify({ forever: Object.fromEntries(forever.map((id) => [id, `n${id}`])), foreverLeftOut: Object.fromEntries(leftOut.map((id) => [id, `n${id}`])), classic: {} });
const MANIFEST = {
  tables: {
    creatures: { lua: "addon/X/English_*.lua", at: "englishNames().creatures" },
    "creatures (Forever)": { json: "i18n/*/creatures.json", at: ["forever", "foreverLeftOut"] },
  },
  removed: [] as unknown[],
};
const repo = () => {
  const dir = temp();
  expect(run(dir, ["git", "init", "-q", "-b", "main"]).exitCode).toBe(0);
  write(dir, "saved-ids.json", JSON.stringify(MANIFEST));
  write(dir, "addon/X/English_Forever.lua", english([1, 2, 3]));
  write(dir, "i18n/enUS/creatures.json", names([10, 11, 12]));
  write(dir, "i18n/frFR/creatures.json", names([10, 11, 12]));
  commit(dir);
  return dir;
};

describe("ids, pure", () => {
  test("a json file's ids at its paths together, an array's items, nothing found told apart from empty", () => {
    expect([...jsonIds(names([1, 2], [3]), ["forever", "foreverLeftOut"])!].sort()).toEqual(["1", "2", "3"]);
    expect(jsonIds(names([1]), ["classic"])!.size).toBe(0);
    expect(jsonIds(names([1]), ["nowhere"])).toBeUndefined();
    expect([...jsonIds(JSON.stringify({ a: { b: [5, 6] } }), ["a.b"])!]).toEqual(["5", "6"]);
    expect([...jsonIds(JSON.stringify({ 7: "x" }), [""])!]).toEqual(["7"]);
  });

  test("a lua table's ids, its __index chain's too, a missing path told", () => {
    const [found, none] = luaIds(english([1, 2], [900]), ["englishNames().creatures", "englishNames().quests"]);
    expect([...found!].sort()).toEqual(["1", "2", "900"]);
    expect(none).toBeUndefined();
    expect(() => luaIds("local _, ns = ...\nns.x = {", ["x"], "Broken.lua")).toThrow(/Broken\.lua: luajit couldn't load it/);
    // (a string key that reads as a number isn't the number: t[123] misses it)
    const [mixed] = luaIds('local _, ns = ...\nns.t = { [123] = "a", ["124"] = "b", x = "c", [1.5] = "d" }', ["t"]);
    expect([...mixed!].sort()).toEqual(['"124"', "1.5", "123", "x"]);
  });

  test("what the base had and the head lacks, an approved removal let go", () => {
    const side = (t: Record<string, Record<string, string[]>>): Ids =>
      new Map(Object.entries(t).map(([k, files]) => [k, new Map(Object.entries(files).map(([f, s]) => [f, new Set(s)]))]));
    const before = side({ c: { "a.json": ["1", "2", "3"], "b.json": ["1"] } });
    const after = side({ c: { "a.json": ["1"] } });
    expect(missing(before, after)).toEqual([
      { table: "c", file: "a.json", ids: ["2", "3"] },
      { table: "c", file: "b.json", ids: ["1"] },
    ]);
    const removed = [
      { table: "c", file: "a.json", ids: [2], why: "w", approved: "a" },
      { table: "c", file: "b.*", ids: "*" as const, why: "w", approved: "a" },
    ];
    expect(missing(before, after, removed)).toEqual([{ table: "c", file: "a.json", ids: ["3"] }]);
  });

  test("the manifest kept out of the release by .pkgmeta", () => {
    const pkg = (ignore: string) => `package-as: X\n\nmove-folders:\n  X/addon/X: X\n\nignore:\n${ignore}\nmanual-changelog:\n  filename: .release-notes.md\n`;
    expect(shipped(undefined)).toBe(false);
    expect(shipped(pkg("  - package.json\n  - saved-ids.json\n"))).toBe(false);
    expect(shipped(pkg("  # the root's files\n  - \"saved-ids.json\"\n"))).toBe(false);
    expect(shipped(pkg("  - package.json\n"))).toBe(true);
    // (a list not indented, a comment on the key, Windows' line ends)
    expect(shipped("ignore:\n- docs\n- saved-ids.json\nmanual-changelog: x\n")).toBe(false);
    expect(shipped("ignore: # the root's files\n  - saved-ids.json\n")).toBe(false);
    expect(shipped("ignore:\r\n  - docs\r\n  - saved-ids.json\r\n")).toBe(false);
    expect(shipped("ignore:\n- docs\nmanual-changelog:\n  - saved-ids.json\n")).toBe(true);
    expect(shipped("ignore:\n  - docs\nother:\n  - saved-ids.json\n")).toBe(true);
  });

  test("a manifest's removal needs why and approved", () => {
    const m = (removed: unknown[]) => JSON.stringify({ tables: { c: { json: "x.json" } }, removed });
    expect(() => parseManifest(m([{ table: "c", ids: [1], why: "cut" }]), "m")).toThrow(/needs "why" and "approved"/);
    expect(parseManifest(m([{ table: "c", ids: [1], why: "cut", approved: "2026-10-21" }]), "m").removed).toHaveLength(1);
    expect(() => parseManifest(JSON.stringify({ tables: { c: { lua: "x.lua" } } }), "m")).toThrow(/needs "at"/);
  });
});

describe("ids, the check", () => {
  test("a regeneration that keeps every id passes, one that drops some fails and names them", () => {
    const dir = repo();
    expect(ids(dir)).toMatchObject({ code: 0 });
    expect(ids(dir).out).toMatch(/^ids: ok, 9 ids in 3 files, none missing against [0-9a-f]{7}/);
    write(dir, "addon/X/English_Forever.lua", english([1, 4]));
    write(dir, "i18n/frFR/creatures.json", names([10, 12, 13]));
    const r = ids(dir);
    expect(r.code).toBe(1);
    expect(r.out).toContain("ids: FAILED, 3 ids a saved file may hold missing");
    expect(r.out).toContain("creatures addon/X/English_Forever.lua: 2 missing (2, 3)");
    expect(r.out).toContain("creatures (Forever) i18n/frFR/creatures.json: 1 missing (11)");
    expect(r.out).not.toContain("enUS");
    const list = JSON.parse(readFileSync(join(dir, ".cache", "logs", "ids-missing.json"), "utf8"));
    expect(list.missing).toHaveLength(2);
  });

  test("an id kept behind its table (an alias) still decodes: the check passes", () => {
    const dir = repo();
    write(dir, "addon/X/English_Forever.lua", english([1], [2, 3]));
    write(dir, "i18n/enUS/creatures.json", names([10], [11, 12]));
    expect(ids(dir)).toMatchObject({ code: 0 });
  });

  test("a removal the user approved lets its ids go, a removal unapproved is refused", () => {
    const dir = repo();
    write(dir, "addon/X/English_Forever.lua", english([1, 2]));
    const removed = [{ table: "creatures", ids: [3], why: "a test npc", approved: "2026-10-21, the user's go" }];
    write(dir, "saved-ids.json", JSON.stringify({ ...MANIFEST, removed }));
    expect(ids(dir)).toMatchObject({ code: 0 });
    write(dir, "saved-ids.json", JSON.stringify({ ...MANIFEST, removed: [{ table: "creatures", ids: [3], why: "x" }] }));
    const r = ids(dir);
    expect(r.code).toBe(2);
    expect(r.out).toContain('needs "why" and "approved"');
  });

  test("a table taken out of the manifest, or a path out of a table, loses its ids too", () => {
    const dir = repo();
    write(dir, "saved-ids.json", JSON.stringify({ tables: { creatures: MANIFEST.tables.creatures } }));
    expect(ids(dir).out).toContain("creatures (Forever) i18n/enUS/creatures.json: 3 missing");
    const leftOut = repo();
    write(leftOut, "i18n/enUS/creatures.json", names([10], [11, 12]));
    commit(leftOut);
    write(leftOut, "saved-ids.json", JSON.stringify({ tables: { ...MANIFEST.tables, "creatures (Forever)": { json: "i18n/*/creatures.json", at: "forever" } } }));
    expect(ids(leftOut).out).toContain("creatures (Forever) i18n/enUS/creatures.json: 2 missing (11, 12)");
  });

  test("a table added with a regeneration that drops ids from it is compared too", () => {
    const dir = repo();
    write(dir, "addon/X/Data.lua", 'local _, ns = ...\nns.herbs = { [765] = 1, [785] = 1 }\n');
    commit(dir);
    write(dir, "addon/X/Data.lua", 'local _, ns = ...\nns.herbs = { [765] = 1 }\n');
    write(dir, "saved-ids.json", JSON.stringify({ ...MANIFEST, tables: { ...MANIFEST.tables, herbs: { lua: "addon/X/Data.lua", at: "herbs" } } }));
    expect(ids(dir).out).toContain("herbs addon/X/Data.lua: 1 missing (785)");
  });

  test("a branch is compared with origin's main, not its own pushed tip", () => {
    const origin = repo();
    const dir = temp();
    expect(run(dir, ["git", "clone", "-q", origin, "."]).exitCode).toBe(0);
    expect(run(dir, ["git", "checkout", "-q", "-b", "topic"]).exitCode).toBe(0);
    write(dir, "addon/X/English_Forever.lua", english([1, 2]));
    commit(dir, "drop");
    // (the branch's upstream its own tip: as if pushed with -u)
    expect(run(dir, ["git", "update-ref", "refs/remotes/origin/topic", "HEAD"]).exitCode).toBe(0);
    expect(run(dir, ["git", "branch", "-q", "--set-upstream-to=origin/topic"]).exitCode).toBe(0);
    expect(ids(dir).out).toContain("1 missing (3)");
  });

  test("a manifest .pkgmeta would ship fails", () => {
    const dir = repo();
    write(dir, ".pkgmeta", "package-as: X\n\nignore:\n  - docs\n");
    const r = ids(dir);
    expect(r.code).toBe(1);
    expect(r.out).toContain(".pkgmeta doesn't ignore saved-ids.json");
    write(dir, ".pkgmeta", "package-as: X\n\nignore:\n  - docs\n  - saved-ids.json\n");
    expect(ids(dir)).toMatchObject({ code: 0 });
  });

  test("a manifest naming what isn't there fails", () => {
    const dir = repo();
    write(dir, "saved-ids.json", JSON.stringify({ tables: { ...MANIFEST.tables, quests: { lua: "addon/X/English_*.lua", at: "englishNames().quests" }, places: { json: "nowhere/*.json" } } }));
    const r = ids(dir);
    expect(r.code).toBe(1);
    expect(r.out).toContain('"quests": nothing at englishNames().quests');
    expect(r.out).toContain('"places": no file matches nowhere/*.json');
  });

  test("a drop committed but not pushed still fails: the base is the fork point from origin/main", () => {
    const origin = repo();
    const dir = temp();
    expect(run(dir, ["git", "clone", "-q", origin, "."]).exitCode).toBe(0);
    write(dir, "addon/X/English_Forever.lua", english([1, 2]));
    commit(dir, "drop");
    const r = ids(dir);
    expect(r.code).toBe(1);
    expect(r.out).toContain("creatures addon/X/English_Forever.lua: 1 missing (3)");
    // (origin moved on, with more: what this branch never had isn't asked of it)
    write(origin, "i18n/enUS/creatures.json", names([10, 11, 12, 14]));
    commit(origin);
    expect(run(dir, ["git", "fetch", "-q"]).exitCode).toBe(0);
    expect(ids(dir).out).not.toContain("14");
  });

  test("two past revisions compared, today's manifest for a head without one, the run's summary written", () => {
    const dir = temp();
    expect(run(dir, ["git", "init", "-q", "-b", "main"]).exitCode).toBe(0);
    write(dir, "addon/X/English_Forever.lua", english([1, 2, 3]));
    write(dir, "i18n/enUS/creatures.json", names([10]));
    const a = commit(dir);
    write(dir, "addon/X/English_Forever.lua", english([1]));
    const b = commit(dir);
    write(dir, "addon/X/English_Forever.lua", english([1], [2, 3]));
    write(dir, "saved-ids.json", JSON.stringify(MANIFEST));
    commit(dir);
    const summary = join(temp(), "summary.md");
    const r = ids(dir, ["--base", a, "--head", b], { GITHUB_STEP_SUMMARY: summary });
    expect(r.code).toBe(1);
    expect(r.out).toContain("2 missing (2, 3)");
    expect(existsSync(summary) && readFileSync(summary, "utf8")).toContain("**creatures**, `addon/X/English_Forever.lua`, 2: 2, 3");
    expect(ids(dir, ["--base", a])).toMatchObject({ code: 0 });
    // (a past head without a manifest: today's tables, one not made yet no error)
    write(dir, "saved-ids.json", JSON.stringify({ tables: { ...MANIFEST.tables, quests: { lua: "addon/X/English_*.lua", at: "englishNames().quests" } } }));
    commit(dir);
    expect(ids(dir, ["--base", a, "--head", b]).out).not.toContain("nothing at englishNames().quests");
    expect(ids(dir).out).toContain('"quests": nothing at englishNames().quests');
  });
});
