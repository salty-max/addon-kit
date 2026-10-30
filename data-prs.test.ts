// data-prs.ts's pure parts (bun test).
import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { addedFacts, age, dbDiff, type Facts, factsOf, judge, prKind, report, runMark, sameText, shapeProblem, slugOf, textProblem } from "./data-prs";

const NOW = Date.parse("2026-10-30T12:00:00Z");

describe("the runs and the pull requests", () => {
  test("a remote's owner/name", () => {
    expect(slugOf("git@github.com:salty-max/wow-data.git\n")).toBe("salty-max/wow-data");
    expect(slugOf("https://github.com/salty-max/yonder")).toBe("salty-max/yonder");
    expect(slugOf("/some/local/path")).toBeUndefined();
  });
  test("a run's mark, a stale schedule said", () => {
    expect(runMark(undefined, NOW).mark).toBe("·");
    expect(runMark({ conclusion: "success", status: "completed", createdAt: "2026-10-30T04:17:00Z", url: "" }, NOW)).toEqual({ mark: "✓", text: "success, today" });
    expect(runMark({ conclusion: "failure", status: "completed", createdAt: "2026-10-29T04:17:00Z", url: "" }, NOW).text).toBe("failure, 1 day");
    expect(runMark({ conclusion: "success", status: "completed", createdAt: "2026-10-25T04:17:00Z", url: "" }, NOW).text).toContain("no run since");
    expect(runMark({ conclusion: "", status: "in_progress", createdAt: "2026-10-30T11:00:00Z", url: "" }, NOW).mark).toBe("…");
    expect(age("2026-10-25T09:26:07Z", NOW)).toBe("5 days");
  });
  test("which job opened a pull request", () => {
    const pr = (headRefName: string) => ({ number: 1, title: "", headRefName, createdAt: "", url: "" });
    expect(prKind(pr("players"))).toBe("players");
    expect(prKind(pr("pins"))).toBe("pins");
    expect(prKind(pr("game-data"))).toBe("game-data");
    expect(prKind(pr("feat/x"))).toBe("other");
  });
});

const DIFF = `diff --git a/data/players/classic/enUS.json b/data/players/classic/enUS.json
--- a/data/players/classic/enUS.json
+++ b/data/players/classic/enUS.json
@@ -10 +10 @@
-["npc","713","name","Balir Frosthammer","70003",["aaaaaaaa"]],
+["npc","713","name","Balir Frosthammer","70576",["aaaaaaaa","bbbbbbbb"]],
@@ -20,0 +21,2 @@
+["gossip","658","text","Ah, well.",null,["cccccccc"]],
+["npc","99999","name","Nobody","70576",["dddddddd"]]
diff --git a/data/players/forever/frFR.json b/data/players/forever/frFR.json
--- a/data/players/forever/frFR.json
+++ b/data/players/forever/frFR.json
@@ -1,0 +2 @@
+not json
`;

describe("the facts a diff adds", () => {
  test("by file, one more player of a known fact told apart", () => {
    const a = addedFacts(DIFF);
    expect(a.map((x) => [x.game, x.locale, x.more])).toEqual([
      ["classic", "enUS", true],
      ["classic", "enUS", false],
      ["classic", "enUS", false],
    ]);
    expect((a[2].line as string[])[1]).toBe("99999");
  });
  test("an empty diff adds nothing", () => expect(addedFacts("")).toEqual([]));
});

describe("shapes and texts", () => {
  const ok = ["npc", "713", "name", "Balir", "70576", ["aaaaaaaa"]];
  test("a fact's shape", () => {
    expect(shapeProblem(ok)).toBeUndefined();
    expect(shapeProblem(["npc", "713", "name"])).toContain("shape");
    expect(shapeProblem(["spell", "1", "name", "x", null, ["aaaaaaaa"]])).toContain("kind");
    expect(shapeProblem(["loot", "713", "item", "1", null, ["aaaaaaaa"]])).toContain("entity");
    expect(shapeProblem(["loot", "npc:713", "item", "1", null, ["aaaaaaaa"]])).toBeUndefined();
    expect(shapeProblem(["npc", "713", "name", "x", "1.15", ["aaaaaaaa"]])).toContain("build");
    expect(shapeProblem(["npc", "713", "name", "x", null, []])).toContain("who");
    expect(shapeProblem(["npc", "713", "name", "x", null, Array(21).fill("aaaaaaaa")])).toContain("who");
  });
  test("text meant for a reader, hidden characters, walls", () => {
    expect(textProblem("Thank you, $N.\n\nWell met.")).toBeUndefined();
    expect(textProblem("visit https://example.com")).toBe("a link");
    expect(textProblem("buy gold at goldshop.com now")).toBe("a link");
    expect(textProblem("|cffff0000red|r")).toContain("escape");
    expect(textProblem("<script>")).toBe("markup");
    expect(textProblem("a‮b")).toContain("hidden");
    expect(textProblem("x".repeat(4001))).toContain("characters");
  });
  test("the game's tokens against a player's copy", () => {
    expect(sameText("I hope you're here to lend us a hand, warrior. After", "I hope you're here to lend us a hand, $c. After")).toBe(true);
    expect(sameText("boar hunting, eh?\n\nThough", "boar hunting, eh?$B$BThough")).toBe(true);
    expect(sameText("a favor for me, lad? A", "a favor for me, $g lad : lass; ? A")).toBe(true);
    expect(sameText("Well met, $C{Hunter}.", "Well met, $c.")).toBe(true);
    expect(sameText("Blast it's cold today, ain't it?", "Blast it's cold today, aint it?")).toBe(false);
    expect(sameText("Something else entirely.", "Well met, $c.")).toBe(false);
  });
});

// (a database as the build makes it, the few tables judge reads)
function fakeDb(): Facts {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE creature (id INTEGER PRIMARY KEY, min_level INTEGER, max_level INTEGER, rank INTEGER, type_id INTEGER, family_id INTEGER, loot_id INTEGER);
    CREATE TABLE object (id INTEGER PRIMARY KEY, loot_id INTEGER);
    CREATE TABLE quest (id INTEGER PRIMARY KEY);
    CREATE TABLE item (id INTEGER PRIMARY KEY);
    CREATE TABLE name (kind TEXT, id INTEGER, locale TEXT, name TEXT);
    CREATE TABLE quest_text (quest_id INTEGER, locale TEXT, field TEXT, text TEXT);
    CREATE TABLE quest_relation (quest_id INTEGER, role TEXT, kind TEXT, entity_id INTEGER);
    CREATE TABLE npc_line (npc_id INTEGER, locale TEXT, kind TEXT, text TEXT);
    CREATE TABLE loot (kind TEXT, source_id INTEGER, item_id INTEGER);
    CREATE TABLE spawn (kind TEXT, entity_id INTEGER, ui_map_id INTEGER, area_id INTEGER, ux REAL, uy REAL);
    CREATE TABLE client_UiMapAssignment (UiMapID INTEGER, AreaID INTEGER);
    INSERT INTO creature VALUES (713, 6, 6, 0, 7, NULL, 713), (658, NULL, NULL, NULL, NULL, NULL, NULL);
    INSERT INTO quest VALUES (170);
    INSERT INTO item VALUES (2652);
    INSERT INTO name VALUES ('creature', 713, 'enUS', 'Balir Frosthammer'), ('quest', 170, 'enUS', 'A New Threat');
    INSERT INTO quest_text VALUES (170, 'enUS', 'details', 'Lend us a hand, $c.');
    INSERT INTO quest_relation VALUES (170, 'start', 'creature', 713);
    INSERT INTO loot VALUES ('creature', 713, 2652);
    INSERT INTO npc_line VALUES (713, 'enUS', 'gossip', 'Well met,$Bfriend.');
    INSERT INTO spawn VALUES ('creature', 713, NULL, 1, 29.7, 71.2);
    INSERT INTO client_UiMapAssignment VALUES (1426, 1);
  `);
  return factsOf(db);
}

describe("a fact against the database", () => {
  const db = fakeDb();
  const v = (line: unknown[]) => judge("classic", "enUS", line, db);
  const L = (kind: string, entity: string, field: string, value: string) => [kind, entity, field, value, "70576", ["aaaaaaaa"]];
  test("known, fills, new, differs", () => {
    expect(v(L("npc", "713", "name", "Balir Frosthammer")).verdict).toBe("known");
    expect(v(L("npc", "713", "name", "Balir Hammer")).verdict).toBe("differs");
    expect(v(L("npc", "658", "level", "[3,4]")).verdict).toBe("fills");
    expect(v(L("npc", "713", "level", "[6,6]")).verdict).toBe("known");
    expect(v(L("npc", "713", "level", "[7,9]")).verdict).toBe("differs");
    expect(v(L("npc", "713", "rank", "normal")).verdict).toBe("known");
    expect(v(L("npc", "713", "rank", "elite")).verdict).toBe("differs");
    expect(v(L("npc", "99999", "name", "Nobody")).verdict).toBe("new");
    expect(v(L("quest", "170", "title", "A New Threat")).verdict).toBe("known");
    expect(v(L("quest", "170", "details", "Lend us a hand, warrior.")).verdict).toBe("known");
    expect(v(L("quest", "170", "giver", "npc:713")).verdict).toBe("known");
    expect(v(L("quest", "170", "ender", "npc:713")).verdict).toBe("fills");
    expect(v(L("quest", "170", "ender", "npc:424242")).verdict).toBe("new");
    expect(v(L("quest", "171", "title", "A Quest Nobody Has")).verdict).toBe("new");
    expect(v(L("loot", "npc:713", "item", "2652")).verdict).toBe("known");
    expect(v(L("loot", "npc:658", "item", "2652")).verdict).toBe("fills");
    expect(v(L("loot", "npc:713", "item", "9")).verdict).toBe("flag");
    expect(v(L("gossip", "658", "text", "Ah, well.")).verdict).toBe("fills");
    expect(v(L("gossip", "713", "text", "Well met,\nfriend.")).verdict).toBe("known");
    expect(v(L("gossip", "713", "text", "Well met, friend")).why).toContain("a variant of a known line");
    expect(v(L("say", "713", "text", "Well met,\nfriend.")).verdict).toBe("fills");
  });
  test("sightings: bounds, and how far from the known spawns (on the zone's map)", () => {
    expect(v(L("npc", "713", "where", "[1426,29.8,71.4]")).why).toContain("near its spawns");
    expect(v(L("npc", "713", "where", "[1426,70,20]")).verdict).toBe("flag");
    expect(v(L("npc", "713", "where", "[1411,50,50]")).verdict).toBe("fills");
    expect(v(L("npc", "713", "where", "[1426,101,5]")).verdict).toBe("flag");
    expect(v(L("npc", "713", "where", "[0,5,5]")).verdict).toBe("flag");
  });
  test("a broken line is flagged, not judged", () => {
    expect(v(["npc", "713", "name", "visit www.gold.example", "70576", ["aaaaaaaa"]]).verdict).toBe("flag");
    expect(judge("classic", "enUS", undefined, db).verdict).toBe("flag");
  });
  test("the report: counts by file, every line but the known ones", () => {
    const judged = [v(L("npc", "713", "name", "Balir Frosthammer")), v(L("npc", "713", "name", "Balir Hammer")), v(L("npc", "658", "level", "[3,4]"))];
    const r = report(judged, { classic: "70003" });
    expect(r[0]).toBe("classic/enUS: 3 lines (0 one more player of a known fact), 1 known, 1 fill a gap, 0 new ids, 1 differ, 0 flagged");
    expect(r[1]).toContain("70576 ahead of the pin");
    expect(r.join("\n")).toContain("Differs from the database (1):");
    expect(r.filter((l) => l.includes("npc 713 name"))).toHaveLength(1); // (the known line not listed)
  });
});

describe("two builds of a database", () => {
  test("rows by table, ids lost, English names changed", () => {
    const make = (sql: string) => {
      const db = new Database(":memory:");
      db.exec(`CREATE TABLE creature (id INTEGER PRIMARY KEY); CREATE TABLE name (kind TEXT, id INTEGER, locale TEXT, name TEXT); ${sql}`);
      return db;
    };
    const before = make(`CREATE TABLE old (x); INSERT INTO creature VALUES (1), (2), (3);
      INSERT INTO name VALUES ('creature', 1, 'enUS', 'Kobold'), ('creature', 2, 'enUS', 'Wolf'), ('creature', 2, 'frFR', 'Loup')`);
    const after = make(`INSERT INTO creature VALUES (1), (3), (4);
      INSERT INTO name VALUES ('creature', 1, 'enUS', 'Kobold Vermin'), ('creature', 4, 'enUS', 'Bear')`);
    expect(dbDiff(before, after)).toEqual([
      "Built: before no tag, after no tag (main's must be main's: bun wow-data/bin/get.ts <game> when it isn't)",
      "Rows by table:",
      "  name: 3 → 2 (-1)",
      "  old: gone (0 rows)",
      "Ids lost (a journal may hold one: each addon's ids check says):",
      "  ! creature: 1 ids gone (2)",
      "English names: 1 changed, 1 gone, 1 new",
      '  creature 1 "Kobold" → "Kobold Vermin"',
      "  gone: creature 2",
    ]);
    expect(dbDiff(after, after)[1]).toBe("Rows by table: the same in every table");
  });
});
