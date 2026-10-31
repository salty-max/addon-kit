// base.ts: the gate German and Spanish wait behind (bun test).
import { describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { baseline, freeze, readBase, refusals, statusOf } from "./base";
import { record } from "./coldread";
import { family, git, KIT, run, useFixtures } from "./test-fixtures";

useFixtures();

const put = (repo: string, path: string, body: string) => {
  mkdirSync(join(repo, path, ".."), { recursive: true });
  writeFileSync(join(repo, path), body);
};
const commit = (repo: string, msg: string) => {
  git(repo, "add", "-A");
  git(repo, "commit", "-q", "-m", msg);
};
const read = (repo: string, verdict: string, lang: string) => {
  const r = record(repo, verdict, [lang]);
  if (typeof r === "string") throw new Error(r);
};

function addon() {
  const { repo } = family();
  put(repo, "content/page.md", "A page.\n");
  put(repo, "i18n/words.json", '{"a":""}\n');
  put(repo, "i18n/frFR/meta.json", "{}\n");
  put(repo, "i18n/frFR/words.json", '{"a":"un"}\n');
  commit(repo, "feat: english and french");
  return repo;
}

describe("base", () => {
  test("no record: German and Spanish wait", () => {
    const repo = addon();
    expect(statusOf(repo).status).toBe("none");
    const r = run(repo, ["bun", join(KIT, "base.ts"), repo]);
    expect(r.code).toBe(1);
    expect(r.out).toContain("no base record");
    expect(r.out).toContain("wait");
  });

  test("a freeze is refused until both languages are read (French by the user) and nothing is uncommitted", () => {
    const repo = addon();
    expect(refusals(repo).join("\n")).toContain("enUS: no cold read recorded");
    read(repo, "prose-reader: 3 fixed", "enUS");
    read(repo, "prose-reader: 2 fixed", "frFR");
    expect(refusals(repo)).toEqual(["frFR: the cold read is not the user's (\"prose-reader: 2 fixed\"): record theirs, \"read by Max: …\""]);
    read(repo, "read by Max: fine", "frFR");
    expect(refusals(repo)).toEqual([]);
    put(repo, "content/page.md", "Changed.\n");
    expect(refusals(repo).join("\n")).toContain("uncommitted");
    commit(repo, "fix: english");
    expect(refusals(repo).join("\n")).toContain("enUS: authored text changed since its cold read");
    expect(freeze(repo)).toBeArray();
    expect(readBase(repo)).toBeUndefined();
  });

  test("a freeze writes the record; the gate opens, and closes again when English or French moves", () => {
    const repo = addon();
    read(repo, "prose-reader: ok", "enUS");
    read(repo, "read by Max: ok", "frFR");
    const base = freeze(repo);
    if (Array.isArray(base)) throw new Error(base.join("; "));
    const head = git(repo, "rev-parse", "HEAD").out.trim();
    expect([base.en, base.frFR, base.sha, base.read]).toEqual(["final", "final", head, { en: "prose-reader: ok", frFR: "read by Max: ok" }]);
    commit(repo, "chore: the base record");
    expect(statusOf(repo).status).toBe("final");
    expect(run(repo, ["bun", join(KIT, "base.ts"), repo]).code).toBe(0);
    // a German change is nobody's business here, English and French are
    put(repo, "i18n/deDE/words.json", '{"a":"eins"}\n');
    commit(repo, "feat: german");
    expect(statusOf(repo).status).toBe("final");
    put(repo, "content/page.md", "A page, moved.\n");
    commit(repo, "fix: english");
    const s = statusOf(repo);
    expect([s.status, s.movedFiles]).toEqual(["moved", ["content/page.md"]]);
    const r = run(repo, ["bun", join(KIT, "base.ts"), repo]);
    expect(r.code).toBe(1);
    expect(r.out).toContain("moved since: content/page.md");
    put(repo, "i18n/frFR/words.json", '{"a":"une"}\n');
    commit(repo, "fix: french");
    expect(statusOf(repo).movedFiles.sort()).toEqual(["content/page.md", "i18n/frFR/words.json"]);
  });

  test("a freeze is refused while the terms check warns, and the baseline keeps what was recorded", () => {
    const repo = addon();
    put(repo, "i18n/words.json", '{"Hardcore":""}\n');
    put(repo, "i18n/frFR/words.json", '{"Hardcore":"Hardcore"}\n');
    commit(repo, "fix: a drift");
    read(repo, "ok", "enUS");
    read(repo, "read by Max: ok", "frFR");
    expect(refusals(repo).join("\n")).toContain("terms.ts has");
    const head = git(repo, "rev-parse", "HEAD").out.trim();
    const b = baseline(repo);
    if (typeof b === "string") throw new Error(b);
    expect(b.translatedFrom).toEqual({ deDE: head, esES: head });
    expect([b.en, b.frFR]).toEqual(["draft", "draft"]);
    const first = git(repo, "rev-parse", "HEAD~1").out.trim();
    expect(baseline(repo, { deDE: first })).toMatchObject({ translatedFrom: { deDE: first, esES: head } });
    expect(baseline(repo, { itIT: "x" })).toContain("only deDE and esES");
    expect(baseline(repo, { deDE: "nonesuch" })).toContain("not a commit");
  });
});
