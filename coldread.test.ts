// coldread.ts: the cold read measured from the last one, not the tag (bun test).
import { describe, expect, test } from "bun:test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { authoredChanged, coldBase, coldReadOf, languages, record as recordColdRead } from "./coldread";
import { stampDir } from "./q";
import { family, git, KIT, run, useFixtures } from "./test-fixtures";

useFixtures();

describe("cold read", () => {
  const commitAll = (repo: string, msg: string) => {
    git(repo, "add", "-A");
    git(repo, "commit", "-q", "-m", msg);
  };
  const text = (repo: string, lang: string, file: string, body: string) => {
    mkdirSync(join(repo, "i18n", lang), { recursive: true });
    writeFileSync(join(repo, "i18n", lang, file), body);
  };

  test("measured from the last cold read, not the tag: it clears, and clears again after the next change", () => {
    const { repo } = family();
    text(repo, "frFR", "meta.json", "{}\n");
    text(repo, "frFR", "words.json", '{"a":"un"}\n');
    text(repo, "frFR", "creatures.json", "{}\n"); // (a script's: not authored)
    commitAll(repo, "feat: french");
    git(repo, "tag", "v1.0.0");
    expect(languages(repo)).toEqual(["frFR"]);
    // after the tag, authored text changed: flagged from the tag, nothing read yet
    text(repo, "frFR", "words.json", '{"a":"un","b":"deux"}\n');
    commitAll(repo, "fix: more french");
    expect(coldReadOf(repo, "frFR")).toBeUndefined();
    expect(coldBase(repo, "frFR", "v1.0.0")).toEqual({ base: "v1.0.0" });
    expect(authoredChanged(repo, "frFR", "v1.0.0")).toEqual(["i18n/frFR/words.json"]);
    // the cold read recorded for HEAD: nothing authored changed since it
    const head = git(repo, "rev-parse", "HEAD").out.trim();
    const r = recordColdRead(repo, "read cold,\n2 fixed");
    if (typeof r === "string") throw new Error(r);
    expect(readFileSync(join(stampDir(repo)!, "coldread-frFR"), "utf8").split("\n")[0]).toBe("verdict: read cold, 2 fixed");
    const from = coldBase(repo, "frFR", "v1.0.0");
    expect([from.base, from.read?.verdict]).toEqual([head, "read cold, 2 fixed"]);
    expect(authoredChanged(repo, "frFR", from.base)).toEqual([]);
    // a script's file or a harness commit changes nothing; authored text does
    text(repo, "frFR", "creatures.json", '{"x":1}\n');
    commitAll(repo, "chore(data): names");
    expect(authoredChanged(repo, "frFR", from.base)).toEqual([]);
    text(repo, "frFR", "words.json", '{"a":"une"}\n');
    commitAll(repo, "fix: a word");
    expect(authoredChanged(repo, "frFR", coldBase(repo, "frFR", "v1.0.0").base)).toEqual(["i18n/frFR/words.json"]);
    // the CLI prints each language's read
    expect(run(repo, ["bun", join(KIT, "coldread.ts"), repo]).out).toContain("frFR: read cold, 2 fixed");
  });

  test("refuses uncommitted authored text, an unknown language, an empty verdict; a rewritten history falls back to the tag", () => {
    const { repo } = family();
    text(repo, "frFR", "meta.json", "{}\n");
    text(repo, "deDE", "meta.json", "{}\n");
    text(repo, "frFR", "words.json", '{"a":"un"}\n');
    commitAll(repo, "feat: languages");
    git(repo, "tag", "v1.0.0");
    expect(recordColdRead(repo, "  ")).toBe("the verdict is empty");
    expect(recordColdRead(repo, "clean", ["itIT"])).toContain("not a language of this repository");
    text(repo, "frFR", "words.json", '{"a":"un!"}\n');
    expect(recordColdRead(repo, "clean")).toContain("frFR: authored text has uncommitted changes");
    commitAll(repo, "fix: bang");
    expect(recordColdRead(repo, "clean", ["deDE"])).not.toBeString(); // (only the language named is read)
    expect([coldReadOf(repo, "deDE")?.verdict, coldReadOf(repo, "frFR")]).toEqual(["clean", undefined]);
    // the stamp's commit leaves HEAD's history: the tag measures again
    git(repo, "reset", "-q", "--hard", "v1.0.0");
    expect(coldBase(repo, "deDE", "v1.0.0")).toEqual({ base: "v1.0.0" });
  });
});

