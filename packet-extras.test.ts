// The family's packet extension: a riddle file's riddles, and the cards of the subjects a change touches (bun test).
import { describe, expect, test } from "bun:test";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { packet, packetRange } from "./packet";
import { changedLines, riddles, touched } from "./packet-extras";
import { family, git, q, useFixtures } from "./test-fixtures";

useFixtures();

const ZONE = `---
zone: 1
client: both
riddles:
  - id: z-plaque
    tier: off
    object: 2082   # the plaque
    hint_area: { x: 1, y: 2, r: 8 }
  - id: z-pool
    tier: off
    area: Pool of Tears   # placed
    anchor: { creature: 763 }
  - id: z-sire
    creature: 10582
    companions: [11, 12]
quarry:
  id: 12037   # Ursol'lok
---
## z-plaque
A plaque.
= text

## z-pool
A pool.

## z-sire
A dog.

## quarry
A bear.
`;


describe("packet extension", () => {
  test("a riddle file's riddles, their lines and subjects", () => {
    const { games, list } = riddles(ZONE);
    expect(games).toEqual(["classic", "forever"]);
    expect(riddles(ZONE.replace("client: both", "client: forever")).games).toEqual(["forever"]);
    expect(riddles(ZONE.replace("client: both", "client: classic")).games).toEqual(["classic"]);
    const byId = Object.fromEntries(list.map((r) => [r.id, r]));
    expect(Object.keys(byId)).toEqual(["z-plaque", "z-pool", "z-sire", "quarry"]);
    expect(byId["z-plaque"].subjects).toEqual([{ kind: "object", arg: "2082" }]);
    expect(byId["z-pool"].subjects).toEqual([
      { kind: "place", arg: "Pool of Tears" },
      { kind: "npc", arg: "763" },
    ]);
    expect(byId["z-sire"].subjects.map((s) => s.arg)).toEqual(["10582", "11", "12"]);
    expect(byId.quarry.subjects).toEqual([{ kind: "npc", arg: "12037" }]);
    expect(byId["z-plaque"].spans).toEqual([
      [5, 8],
      [19, 22],
    ]);
    expect(touched(list, [24]).map((r) => r.id)).toEqual(["z-pool"]);
    expect(changedLines("@@ -3 +3 @@\n@@ -10,0 +11,0 @@\n@@ -20,2 +21,3 @@")).toEqual([3, 11, 12, 21, 22, 23]);
  });

  test("the packet: commits, files, the stamp, the cards of the riddles touched", () => {
    const { root, repo } = family({ "expeditions/zone.md": ZONE, "a.txt": "one\n" });
    // (pushed once: its first commit on a remote, a branch of its own never pushed)
    git(repo, "update-ref", "refs/remotes/origin/main", "HEAD");
    writeFileSync(join(repo, "expeditions", "zone.md"), ZONE.replace("A pool.", "A pool, rewritten."));
    git(repo, "commit", "-qam", "feat(expeditions): the pool rewritten\n\nCo-Authored-By: Claude <noreply@anthropic.com>");
    q(repo, "check", "--", "true");
    writeFileSync(join(repo, "new.txt"), "untracked\n");

    // without wow-data's card.ts: the commands to run, nothing drawn
    let res = packet(repo);
    if (typeof res === "string") throw new Error(res);
    let text = readFileSync(res.file, "utf8");
    expect(res.file).toBe(join(repo, ".cache", "review", `${git(repo, "rev-parse", "HEAD").out.slice(0, 12)}.md`));
    expect(text).toContain("Range: everything no remote has (no upstream) and the uncommitted files.");
    // Its range written for review.ts, whole.
    expect(packetRange(text)).toEqual({ base: git(repo, "rev-parse", "HEAD~1").out.trim(), tip: git(repo, "rev-parse", "HEAD").out.trim() });
    expect(text).toContain("- check: passed on HEAD's tree");
    expect(text).toContain("- the uncommitted files have no passing check of their own.");
    expect(text).toContain("feat(expeditions): the pool rewritten");
    expect(text).toContain('trailers: AI co-author or "generated with" found');
    expect(text).toContain("- M expeditions/zone.md");
    expect(text).toMatch(/Size: 2 files, \+2 −1 lines\. Read every changed file's diff/);
    expect(text).toContain("- A new.txt (untracked)");
    expect(text).toContain("card.ts isn't there yet");
    expect(text).toContain('z-pool: `bun wow-data/bin/card.ts place "Pool of Tears" --game classic`');
    expect(text).toContain("bun wow-data/bin/card.ts npc 763 --game classic");
    expect(text).toContain("bun wow-data/bin/card.ts npc 763 --game forever");
    expect(text).not.toContain("z-plaque");
    expect(text).not.toContain("10582");

    // with it: each card drawn
    mkdirSync(join(root, "wow-data", "bin"));
    writeFileSync(join(root, "wow-data", "bin", "card.ts"), 'console.log(`CARD ${process.argv.slice(2).join(" ")}`);\n');
    res = packet(repo, "HEAD~1..HEAD");
    if (typeof res === "string") throw new Error(res);
    text = readFileSync(res.file, "utf8");
    expect(text).toContain("Range: HEAD~1..HEAD.");
    expect(text).toContain(`\`git -C ${repo} diff ${git(repo, "rev-parse", "HEAD~1").out.slice(0, 12)} ${git(repo, "rev-parse", "HEAD").out.slice(0, 12)}\``);
    expect(text).not.toContain("new.txt");
    expect(text).toContain("### z-pool: place Pool of Tears (classic)");
    expect(text).toContain("CARD place Pool of Tears --game classic");
    expect(text).toContain("CARD npc 763 --game classic");
    expect(text).toContain("### z-pool: npc 763 (forever)");
    expect(res.summary).toContain("4 cards");
    expect(git(repo, "status", "--porcelain").out).toBe("?? new.txt\n");
    expect(packetRange("# Review packet\n\nno range here\n")).toBeUndefined();
  });
});
