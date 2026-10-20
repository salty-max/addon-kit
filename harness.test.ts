// The harness: q.ts, the stamp, the git hooks, root.ts and root.py,
// packet.ts and board.ts (bun test). Each test makes its repositories in a
// family folder of its own under the system's temp folder, git kept from the
// user's own configuration.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { add, before, cards, conflicts, format, holders, isHeld, lines, options, parseCard, repoList, set, setSection, slug, strangers, waitingOn, warnings } from "./board";
import { eventLine, eventsPath, logEvent, repoOf } from "./events";
import { HOOKS } from "./hooks";
import { changedLines, packet, riddles, subjectProblem, touched, trailerProblem } from "./packet";
import { clean, headTree, matters, parse, stampDir, stampOf, verdict, workTree } from "./q";
import { parseReview, record, reviewOf } from "./review";
import { familyRoot } from "./root";

const KIT = import.meta.dir;
const GIT_ENV = {
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_AUTHOR_NAME: "test",
  GIT_AUTHOR_EMAIL: "test@example.com",
  GIT_COMMITTER_NAME: "test",
  GIT_COMMITTER_EMAIL: "test@example.com",
};
const saved: Record<string, string | undefined> = {};
let tmp: string;
// Every tool's event line goes here, never into the family folder's log.
let events: string;

beforeAll(() => {
  for (const k of [...Object.keys(GIT_ENV), "WOW_ADDONS_ROOT", "HARNESS_EVENTS"]) saved[k] = process.env[k];
  Object.assign(process.env, GIT_ENV);
  delete process.env.WOW_ADDONS_ROOT;
  tmp = realpathSync(mkdtempSync(join(tmpdir(), "harness-test-")));
  events = join(tmp, "events.log");
  process.env.HARNESS_EVENTS = events;
});

// The event lines written since the last call, as [source, tone, repo, text].
function newEvents(): string[][] {
  if (!existsSync(events)) return [];
  const rows = readFileSync(events, "utf8").trimEnd().split("\n").filter(Boolean).map((l) => l.split("\t").slice(1));
  rmSync(events);
  return rows;
}
afterAll(() => {
  for (const [k, v] of Object.entries(saved)) if (v === undefined) delete process.env[k];
  else process.env[k] = v;
  rmSync(tmp, { recursive: true, force: true });
});

function run(cwd: string, cmd: string[], env: Record<string, string> = {}) {
  const p = Bun.spawnSync(cmd, { cwd, env: { ...process.env, ...env }, stdout: "pipe", stderr: "pipe" });
  return { code: p.exitCode, out: p.stdout.toString(), err: p.stderr.toString() };
}
const git = (cwd: string, ...args: string[]) => run(cwd, ["git", ...args]);
const q = (cwd: string, ...args: string[]) => run(cwd, ["bun", join(KIT, "q.ts"), ...args]);

let n = 0;
// A family folder (addon-kit/, wow-data/) holding one repository with a commit.
function family(files: Record<string, string> = { "a.txt": "one\n" }) {
  const root = join(tmp, `family-${++n}`);
  mkdirSync(join(root, "addon-kit"), { recursive: true });
  mkdirSync(join(root, "wow-data"), { recursive: true });
  const repo = join(root, "repo");
  mkdirSync(repo);
  git(repo, "init", "-q", "-b", "main");
  for (const [f, text] of Object.entries(files)) {
    mkdirSync(join(repo, f, ".."), { recursive: true });
    writeFileSync(join(repo, f), text);
  }
  git(repo, "add", "-A");
  git(repo, "commit", "-q", "-m", "chore: first");
  return { root, repo };
}

describe("q", () => {
  test("the lines that matter", () => {
    expect(matters(clean("building\n\x1b[31mx.lua:12: attempt to index nil\x1b[0m\n 3 pass\n 1 fail\n 0 errors\n"))).toEqual([
      "x.lua:12: attempt to index nil",
      " 1 fail",
    ]);
    // nothing that looks like an error: the end of the output
    const plain = Array.from({ length: 30 }, (_, i) => `line ${i}`);
    expect(matters(plain)).toEqual(plain.slice(-20));
    // more than 20: the first ones, how many were left out, the last five
    const many = matters(Array.from({ length: 50 }, (_, i) => `error ${i}`));
    expect(many).toHaveLength(20);
    expect(many[14]).toBe("… 31 more in the log");
    expect(many.at(-1)).toBe("error 49");
    expect(clean("10%\r50%\r100%\n\n")).toEqual(["100%"]);
  });

  test("the verdict line and the arguments", () => {
    expect(verdict("check", 0, 41_200)).toBe("check: ok (41s)");
    expect(verdict("test", 1, 3_000, ".cache/logs/test.log")).toBe("test: FAILED (exit 1, 3.0s) · .cache/logs/test.log");
    expect(parse(["check", "--", "bun", "run", "check"])).toEqual({ name: "check", command: ["bun", "run", "check"] });
    expect(parse(["check", "bun"])).toBeString();
    expect(parse(["check", "--"])).toBeString();
    expect(parse(["a/b", "--", "true"])).toBeString();
  });

  test("the exit code passes through, the output to the log", () => {
    const { repo } = family();
    const ok = q(repo, "demo", "--", "sh", "-c", "echo fine");
    expect(ok.code).toBe(0);
    expect(ok.out).toMatch(/^demo: ok \(\d+\.\ds\)\n$/);
    const bad = q(repo, "demo", "--", "sh", "-c", "echo building; echo 'x.lua:3: boom' >&2; exit 3");
    expect(bad.code).toBe(3);
    expect(bad.out.split("\n")[0]).toMatch(/^demo: FAILED \(exit 3, .*\) · \.cache\/logs\/demo\.log$/);
    expect(bad.out).toContain("  x.lua:3: boom");
    expect(bad.out).not.toContain("building");
    const log = readFileSync(join(repo, ".cache", "logs", "demo.log"), "utf8");
    expect(log).toContain("$ sh -c echo building");
    expect(log).toContain("building\nx.lua:3: boom\n");
    expect(log).toContain("[exit 3,");
    // the cache stays out of git, the repository's .gitignore untouched
    expect(git(repo, "status", "--porcelain").out).toBe("");
    expect(q(repo, "demo", "--", "no-such-command-anywhere").code).toBe(127);
    // twenty lines at most under the verdict
    const loud = q(repo, "demo", "--", "sh", "-c", "for i in $(seq 40); do echo error $i; done; exit 1");
    expect(loud.out.trimEnd().split("\n")).toHaveLength(21);
    expect(q(repo, "demo").code).toBe(2);
    // killed by a signal: 128 and its number, as a shell says it
    expect(q(repo, "demo", "--", "sh", "-c", "kill -TERM $$").code).toBe(143);
  });

  test("a passing check stamps the tree it ran on, a failing one takes it back", () => {
    const { repo } = family();
    const tree = headTree(repo)!;
    expect(q(repo, "check", "--", "true").out).toContain(`stamped ${tree.slice(0, 7)}`);
    expect(stampOf(repo, tree)).toMatchObject({ tree, command: "true" });
    // another name never stamps
    expect(q(repo, "test", "--", "true").out).not.toContain("stamped");
    expect(q(repo, "check", "--", "false").code).toBe(1);
    expect(stampOf(repo, tree)).toBeUndefined();
    // the working files, uncommitted: their tree, the one their commit has
    writeFileSync(join(repo, "b.txt"), "two\n");
    q(repo, "check", "--", "true");
    git(repo, "add", "-A");
    git(repo, "commit", "-q", "-m", "feat: two");
    expect(stampOf(repo, headTree(repo))).toBeDefined();
    // a check that changes the files isn't stamped
    const moving = q(repo, "check", "--", "sh", "-c", "echo three > c.txt");
    expect(moving.out).toContain("not stamped");
    expect(stampOf(repo, workTree(repo))).toBeUndefined();
  });

  test("only the repository's own check stamps", () => {
    const { repo } = family({ "package.json": '{"scripts":{"check":"true"}}\n' });
    const tree = headTree(repo)!;
    expect(q(repo, "check", "--", "true").out).toContain("not stamped: this repository's check is `bun run check`");
    expect(stampOf(repo, tree)).toBeUndefined();
    expect(q(repo, "check", "--", "bun", "run", "check").out).toContain("stamped");
    git(repo, "config", "harness.check", "sh -c true");
    q(repo, "check", "--", "false");
    expect(q(repo, "check", "--", "bun", "run", "check").out).toContain("not stamped");
    expect(q(repo, "check", "--", "sh", "-c", "true").out).toContain("stamped");
  });
});

describe("events", () => {
  test("a line of five fields, no tab or line break inside one", () => {
    const at = new Date("2026-10-20T12:00:00.000Z");
    expect(eventLine("check", "ok", "yonder", "check: ok\t(41s)\n· stamped", at)).toBe("2026-10-20T12:00:00.000Z\tcheck\tok\tyonder\tcheck: ok (41s) · stamped\n");
  });

  test("the family folder's .cache by default, another file or none by HARNESS_EVENTS", () => {
    const { root, repo } = family();
    try {
      delete process.env.HARNESS_EVENTS;
      process.env.WOW_ADDONS_ROOT = root;
      expect(eventsPath()).toBe(join(root, ".cache", "harness", "events.log"));
      logEvent("board", "wait", "yonder", "a card");
      expect(readFileSync(join(root, ".cache", "harness", "events.log"), "utf8")).toContain("\tboard\twait\tyonder\ta card\n");
      process.env.HARNESS_EVENTS = "off";
      expect(eventsPath()).toBeUndefined();
      logEvent("board", "wait", "yonder", "nothing written");
    } finally {
      delete process.env.WOW_ADDONS_ROOT;
      process.env.HARNESS_EVENTS = events;
    }
    expect(repoOf(repo)).toBe("repo");
    // A worktree is its main checkout's repository.
    const wt = join(tmp, `wt-${n}`);
    git(repo, "worktree", "add", "-q", wt);
    expect(repoOf(wt)).toBe("repo");
  });

  test("a long log keeps its last 500 lines", () => {
    const file = join(tmp, "long.log");
    process.env.HARNESS_EVENTS = file;
    try {
      for (let i = 0; i < 2200; i++) logEvent("check", "ok", "r", `run ${i} ${"x".repeat(100)}`);
    } finally {
      process.env.HARNESS_EVENTS = events;
    }
    const lines = readFileSync(file, "utf8").trimEnd().split("\n");
    expect(lines.length).toBeLessThanOrEqual(2200);
    expect(lines.length).toBeGreaterThanOrEqual(500);
    expect(lines.at(-1)).toContain("run 2199");
  });

  test("q, review and board write theirs: a verdict, a stamp, a card added and moved", () => {
    const { root, repo } = family();
    newEvents();
    q(repo, "check", "--", "true");
    q(repo, "check", "--", "false");
    q(repo, "test", "--", "true");
    expect(newEvents().map((e) => [e[0], e[1], e[2], e[3]!.replace(/\(.*?\)/, "(t)")])).toEqual([
      ["check", "ok", "repo", expect.stringMatching(/^check: ok \(t\) · stamped [0-9a-f]{7}$/)],
      ["check", "fail", "repo", "check: FAILED (t) · .cache/logs/check.log"],
      ["test", "ok", "repo", "test: ok (t)"],
    ]);
    record(repo, "2 findings");
    expect(newEvents()).toEqual([["review", "", "repo", `${git(repo, "rev-parse", "--short=7", "HEAD").out.trim()} 2 findings`]]);
    process.env.WOW_ADDONS_ROOT = root;
    try {
      const card = add("yonder", "Eight riddles", { status: "waiting-test" });
      set(card.id, { try: "nothing moved" });
      set(card.id, { status: "done" });
    } finally {
      delete process.env.WOW_ADDONS_ROOT;
    }
    expect(newEvents()).toEqual([
      ["board", "wait", "yonder", "Eight riddles added, waiting-test"],
      ["board", "ok", "yonder", "Eight riddles waiting-test → done"],
    ]);
  });
});

describe("git hooks", () => {
  function hooked() {
    const f = family();
    expect(run(f.repo, ["bun", join(KIT, "hooks.ts"), "install", f.repo]).out).toContain("installed");
    expect(git(f.repo, "config", "core.hooksPath").out.trim()).toBe(HOOKS);
    const remote = join(f.root, "remote.git");
    git(f.root, "init", "-q", "--bare", remote);
    git(f.repo, "remote", "add", "origin", remote);
    return { ...f, remote };
  }
  const commit = (repo: string, msg: string) => {
    writeFileSync(join(repo, "a.txt"), `${Math.random()}\n`);
    git(repo, "add", "-A");
    return git(repo, "commit", "-q", "-m", msg);
  };

  test("commit-msg refuses an AI co-author or a generated-with line", () => {
    const { repo } = hooked();
    const coauthor = commit(repo, "feat: x\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>");
    expect(coauthor.code).not.toBe(0);
    expect(coauthor.err).toContain("Co-Authored-By: Claude Opus 5.5");
    expect(commit(repo, "feat: x\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)").code).not.toBe(0);
    expect(commit(repo, "fix: y\n\nGenerated by GitHub Copilot").code).not.toBe(0);
    for (const line of ["Co-Authored-By: Claude", "Generated with Claude", "Generated-by: Claude Code", "Assisted-by: Claude Opus", "Co-authored-by: Cursor Agent <cursoragent@cursor.com>"])
      expect([line, commit(repo, `fix: y\n\n${line}`).code]).not.toEqual([line, 0]);
    expect(git(repo, "log", "--format=%s").out.trim()).toBe("chore: first");
    const refused = newEvents();
    expect(refused.length).toBeGreaterThanOrEqual(8);
    expect(refused[0]).toEqual(["hook", "fail", "repo", "commit-msg refused an AI trailer: Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"]);
    // a person, a generated file: fine
    expect(commit(repo, "chore: Text_frFR generated with locales.ts").code).toBe(0);
    expect(commit(repo, "feat: z\n\nGenerated with scripts/build.ts, then read.\n\nCo-authored-by: Egypt Smith <e@example.com>").code).toBe(0);
    expect(commit(repo, "feat(pages): the codex's\ngenerated with locales.ts, the Codex's own pages\n- generated by the cursor helper").code).toBe(0);
    newEvents();
    // packet.ts asking the hook about old commits writes no refusal
    expect(trailerProblem("feat: a\n\nCo-Authored-By: Claude <noreply@anthropic.com>\n")).toContain("Claude");
    expect(trailerProblem("feat: a\n")).toBeUndefined();
    expect(newEvents()).toEqual([]);
  });

  test("pre-push refuses an unchecked tree and lets a checked one through", () => {
    const { repo, remote } = hooked();
    const refused = git(repo, "push", "-q", "origin", "main");
    expect(refused.code).not.toBe(0);
    expect(refused.err).toContain("pre-push: no passing check");
    expect(refused.err).toContain(`bun ${KIT}/q.ts check -- `);
    expect(newEvents()).toEqual([["hook", "fail", "repo", expect.stringMatching(/^pre-push refused main \([0-9a-f]+\): no passing check$/)]]);
    expect(git(remote, "rev-parse", "-q", "--verify", "main").code).not.toBe(0);
    q(repo, "check", "--", "true");
    expect(git(repo, "push", "-q", "origin", "main").code).toBe(0);
    expect(git(remote, "rev-parse", "main").out).toBe(git(repo, "rev-parse", "HEAD").out);
    // a commit after the check: refused again; a branch deleted: no tree to check
    commit(repo, "feat: later");
    expect(git(repo, "push", "-q", "origin", "main").code).not.toBe(0);
    expect(git(repo, "push", "-q", "origin", "--delete", "main").code).toBe(0);
  });

  test("the repository's own hooks still run, and come back on uninstall", () => {
    const { repo } = family();
    mkdirSync(join(repo, ".husky", "_"), { recursive: true });
    writeFileSync(join(repo, ".husky", "_", "pre-commit"), "#!/bin/sh\necho ran >> \"$(git rev-parse --show-toplevel)/.git/marker\"\n", { mode: 0o755 });
    git(repo, "config", "core.hooksPath", ".husky/_");
    expect(run(repo, ["bun", join(KIT, "hooks.ts"), "install", repo]).out).toContain(".husky/_ chained");
    writeFileSync(join(repo, "a.txt"), "changed\n");
    git(repo, "commit", "-qam", "fix: one");
    expect(readFileSync(join(repo, ".git", "marker"), "utf8")).toBe("ran\n");
    run(repo, ["bun", join(KIT, "hooks.ts"), "uninstall", repo]);
    expect(git(repo, "config", "core.hooksPath").out.trim()).toBe(".husky/_");
    expect(git(repo, "config", "harness.chain").code).not.toBe(0);
  });
});

describe("root", () => {
  test("the family folder from a worktree anywhere, in TypeScript and Python", () => {
    const { root, repo } = family();
    const outside = join(tmp, `elsewhere-${n}`, "wt");
    expect(git(repo, "worktree", "add", "-q", outside).code).toBe(0);
    expect(familyRoot(join(repo, "."))).toBe(root);
    expect(familyRoot(outside)).toBe(root);
    expect(run(outside, ["bun", join(KIT, "root.ts"), "wow-data"]).out.trim()).toBe(join(root, "wow-data"));
    expect(run(outside, ["python3", join(KIT, "root.py"), "wow-data"]).out.trim()).toBe(join(root, "wow-data"));
    process.env.WOW_ADDONS_ROOT = root;
    try {
      expect(familyRoot("/")).toBe(root);
      process.env.WOW_ADDONS_ROOT = tmp;
      expect(() => familyRoot()).toThrow("holds no addon-kit");
      expect(run(outside, ["python3", join(KIT, "root.py")]).code).toBe(1);
    } finally {
      delete process.env.WOW_ADDONS_ROOT;
    }
  });
});

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

describe("packet", () => {
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

  test("commit subjects", () => {
    expect(subjectProblem("feat(expeditions): eight riddles more")).toBeUndefined();
    expect(subjectProblem("fix: Pool of Tears's quests")).toContain("capital");
    expect(subjectProblem("Added riddles")).toBe("not a Conventional Commit");
  });

  test("the packet: commits, files, the stamp, the cards of the riddles touched", () => {
    const { root, repo } = family({ "expeditions/zone.md": ZONE, "a.txt": "one\n" });
    writeFileSync(join(repo, "expeditions", "zone.md"), ZONE.replace("A pool.", "A pool, rewritten."));
    git(repo, "commit", "-qam", "feat(expeditions): the pool rewritten\n\nCo-Authored-By: Claude <noreply@anthropic.com>");
    q(repo, "check", "--", "true");
    writeFileSync(join(repo, "new.txt"), "untracked\n");

    // without wow-data's card.ts: the commands to run, nothing drawn
    let res = packet(repo);
    if (typeof res === "string") throw new Error(res);
    let text = readFileSync(res.file, "utf8");
    expect(res.file).toBe(join(repo, ".cache", "review", `${git(repo, "rev-parse", "HEAD").out.slice(0, 12)}.md`));
    expect(text).toContain("Range: the last commit (no upstream) and the uncommitted files.");
    expect(text).toContain("- check: passed on HEAD's tree");
    expect(text).toContain("- the uncommitted files have no passing check of their own.");
    expect(text).toContain("feat(expeditions): the pool rewritten");
    expect(text).toContain('trailers: AI co-author or "generated with" found');
    expect(text).toContain("- M expeditions/zone.md");
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
  });
});

describe("review", () => {
  test("a verdict recorded for HEAD, first line first", () => {
    const { repo } = family();
    const head = git(repo, "rev-parse", "HEAD").out.trim();
    expect(reviewOf(repo)).toBeUndefined();
    expect(packet(repo)).not.toBeString();
    const r = record(repo, "2 findings,\n fixed");
    if (typeof r === "string") throw new Error(r);
    const text = readFileSync(join(stampDir(repo)!, `review-${head}`), "utf8");
    expect(text.split("\n")[0]).toBe("verdict: 2 findings, fixed");
    expect(text).toContain(`packet: ${join(repo, ".cache", "review", `${head.slice(0, 12)}.md`)}`);
    expect(reviewOf(repo)).toMatchObject({ verdict: "2 findings, fixed", head });
    expect(run(repo, ["bun", join(KIT, "review.ts"), repo]).out).toStartWith("2 findings, fixed (");
    expect(record(repo, "  ")).toBe("the verdict is empty");
    expect(parseReview("verdict: clean\nhead: abc\n")).toEqual({ verdict: "clean", head: "abc", tree: undefined, at: undefined, packet: undefined });
    git(repo, "commit", "-q", "--allow-empty", "-m", "chore: later");
    expect(reviewOf(repo)).toBeUndefined();
  });
});

describe("board", () => {
  test("a card's text round-trips", () => {
    const card = { id: "yonder-x", repo: "yonder", title: "Eight riddles: the review's fixes", status: "waiting-test" as const, session: "", updated: "2026-10-20T09:00:00+02:00", repos: ["yonder"], waits: "", since: {}, body: "## Try\n\nFreewind\n" };
    const text = format(card);
    expect(text).toContain('title: "Eight riddles: the review\'s fixes"');
    expect(text).toContain('updated: "2026-10-20T09:00:00+02:00"');
    expect(parseCard("x", '---\ntitle: "A: b" # a note\n---\n').title).toBe("A: b");
    expect(text).toContain('session: ""');
    expect(parseCard("yonder-x", text)).toEqual(card);
    expect(format({ ...card, title: "true" })).toContain('title: "true"');
    expect(slug("Yonder: Kel'Theril, à nouveau")).toBe("yonder-keltheril-a-nouveau");
    // A card's own repo is its repos, unwritten (every older card reads so); others and a wait are written.
    expect(text).not.toContain("repos:");
    const wide = { ...card, status: "blocked" as const, repos: ["wow-data", "mealbook", "yonder"], waits: "yonder-y" };
    expect(format(wide)).toContain('repos: wow-data, mealbook, yonder\nwaits: yonder-y\n');
    expect(parseCard("yonder-x", format(wide))).toEqual(wide);
    expect(parseCard("x", "---\nrepo: every repo\n---\n").repos).toEqual([]);
    expect(parseCard("x", "---\nrepo: root .claude\n---\n").repos).toEqual([]);
    expect(repoList(" yonder,wow-data , yonder,")).toEqual(["yonder", "wow-data"]);
  });

  test("the board is the lock: the first to hold a repository holds it, a stopped card only notes its unpushed work", () => {
    const card = (id: string, status: string, session: string, repos: string[], since = "2026-10-20T21:00:00+02:00", waits = "") =>
      parseCard(id, `---\nrepo: ${repos[0]}\nstatus: ${status}\nsession: ${session}\nupdated: "${since}"\nrepos: "${repos.join(", ")}"\nsince: "${since}"\n${waits ? `waits: ${waits}\n` : ""}---\n`);
    const a = card("yonder-riddles", "running", "A", ["yonder"], "2026-10-20T20:00:00+02:00");
    const c = card("codex-german", "waiting-test", "C", ["lorekeepers-codex"]);
    const old = card("yonder-older", "ready-to-push", "D", ["yonder"]);
    const done = card("yonder-done", "done", "E", ["yonder"]);
    const mine = card("wow-data-other", "running", "B", ["wow-data"]);
    const b = card("mealbook-trainers", "running", "B", ["wow-data", "mealbook", "yonder", "lorekeepers-codex"], "2026-10-20T21:00:00+02:00");
    const list = [a, c, old, done, mine, b];
    const found = conflicts(b, list);
    expect(found.held.map((x) => [x.card.id, x.repos])).toEqual([["yonder-riddles", ["yonder"]]]);
    expect(found.pending.map((x) => x.card.id)).toEqual(["codex-german", "yonder-older"]);
    expect(warnings(b, list)).toEqual([
      "held: yonder by yonder-riddles (there since 20:00, session A): drop yonder (set mealbook-trainers --repos wow-data,mealbook,lorekeepers-codex) and go on, or set mealbook-trainers --on yonder-riddles and write nothing until it's free",
      "note: lorekeepers-codex has codex-german (waiting-test) with unpushed work: its commits go out with the next push",
      "note: yonder has yonder-older (ready-to-push) with unpushed work: its commits go out with the next push",
    ]);
    // The first to hold is told nothing to wait for, only that B came after.
    expect(warnings(a, list)).toEqual([
      "note: yonder has mealbook-trainers running there since after this card: it was told to wait",
      "note: yonder has yonder-older (ready-to-push) with unpushed work: its commits go out with the next push",
    ]);
    expect(warnings(c, list)).toEqual([]);

    // B blocked on A: it holds nothing, so A is never told to block on its waiter.
    const blocked = { ...b, status: "blocked" as const, waits: "yonder-riddles", since: {} };
    const withB = [a, blocked, old];
    expect(warnings(a, withB).some((w) => w.startsWith("held:"))).toBe(false);
    expect(warnings(blocked, withB)).toEqual(["still held: yonder by yonder-riddles (running): write nothing until it's free"]);
    expect(waitingOn("yonder-riddles", withB)).toEqual([blocked]);
    expect([isHeld("yonder", withB, "B"), isHeld("yonder", withB, "A")]).toEqual([true, false]);

    // A stops: B and C, both blocked on it, are both free; the first to run again holds, the other waits on it.
    const aStopped = { ...a, status: "waiting-test" as const, since: {} };
    const cBlocked = card("codex-yonder", "blocked", "C2", ["yonder"], "2026-10-20T21:05:00+02:00", "yonder-riddles");
    const freed = [aStopped, blocked, cBlocked];
    expect(warnings(blocked, freed)).toEqual(["free: yonder-riddles is waiting-test: set mealbook-trainers --status running (held again if another got there first)"]);
    expect([isHeld("yonder", freed, "B"), isHeld("yonder", freed, "C2")]).toEqual([false, false]);
    const bRuns = { ...blocked, status: "running" as const, waits: "", since: { yonder: "2026-10-20T22:00:00+02:00" } };
    const cRuns = { ...cBlocked, status: "running" as const, waits: "", since: { yonder: "2026-10-20T22:00:05+02:00" } };
    expect(warnings(cRuns, [aStopped, bRuns, cRuns])[0]).toStartWith("held: yonder by mealbook-trainers");
    expect(warnings(bRuns, [aStopped, bRuns, cRuns]).some((w) => w.startsWith("held:"))).toBe(false);
    expect([isHeld("yonder", [aStopped, bRuns, cRuns], "B"), isHeld("yonder", [aStopped, bRuns, cRuns], "C2")]).toEqual([false, true]);
    // Two adds in the same second: the id breaks the tie, one of them waits.
    const x = { ...cRuns, id: "x", since: bRuns.since };
    expect([before(bRuns, x, "yonder"), before(x, bRuns, "yonder")]).toEqual([true, false]);

    // Widening queues the new repository at the back: A, in the Codex since 10:00, adds yonder at 10:30,
    // where B has run since 10:15. A is held, B isn't (the reviewer's case).
    const wide = { ...card("a-codex", "running", "A", ["lorekeepers-codex", "yonder"]), since: { "lorekeepers-codex": "2026-10-20T10:00:00+02:00", yonder: "2026-10-20T10:30:00+02:00" } };
    const bYonder = card("b-yonder", "running", "B", ["yonder"], "2026-10-20T10:15:00+02:00");
    expect(warnings(wide, [wide, bYonder])[0]).toStartWith("held: yonder by b-yonder (there since 10:15");
    expect([isHeld("yonder", [wide, bYonder], "A"), isHeld("yonder", [wide, bYonder], "B")]).toEqual([true, false]);
    // Times compare as times: across the clock change, 02:50+02:00 came before 02:10+01:00.
    const summer = card("summer", "running", "S", ["yonder"], "2026-10-25T02:50:00+02:00");
    const winter = card("winter", "running", "W", ["yonder"], "2026-10-25T02:10:00+01:00");
    expect(before(summer, winter, "yonder")).toBe(true);

    expect(holders(list, ["yonder"]).map((h) => [h.card.id, h.kind])).toEqual([
      ["yonder-riddles", "held"],
      ["mealbook-trainers", "held"],
      ["yonder-older", "pending"],
    ]);
    expect(lines([blocked], Date.parse("2026-10-20T21:00:00+02:00"))[0]).toBe("blocked        wow-data+mealbook+yonder+lorekeepers-codex  mealbook-trainers  mealbook-trainers (on yonder-riddles)  0m");
  });

  test("a section replaced in its place", () => {
    const body = "## Try\n\nold\n\n## Committed\n\nabc\n\n## Left\n\n";
    expect(setSection(body, "Try", "new")).toBe("## Try\n\nnew\n\n## Committed\n\nabc\n\n## Left\n");
    expect(setSection("## Left\n\nmore\n", "Try", "go")).toBe("## Try\n\ngo\n\n## Left\n\nmore\n");
  });

  test("add, set, list", () => {
    const { root } = family();
    process.env.WOW_ADDONS_ROOT = root;
    try {
      const a = add("yonder", "Eight riddles", { status: "waiting-test", try: "Freewind at night" });
      expect(a.id).toBe("yonder-eight-riddles");
      expect(add("yonder", "Eight riddles").id).toBe("yonder-eight-riddles-2");
      const b = set("yonder-eight-riddles", { status: "ready-to-push", committed: "f4ab31a", session: "s1" });
      if (typeof b === "string") throw new Error(b);
      const back = parseCard(b.id, readFileSync(join(root, "board", `${b.id}.md`), "utf8"));
      expect(back).toMatchObject({ repo: "yonder", title: "Eight riddles", status: "ready-to-push", session: "s1" });
      expect(back.body).toBe("## Try\n\nFreewind at night\n\n## Committed\n\nf4ab31a\n\n## Left\n");
      expect(set("nope", {})).toContain("no card nope");
      set("yonder-eight-riddles-2", { status: "done" });
      expect(cards().map((c) => c.id)).toEqual(["yonder-eight-riddles"]);
      expect(cards(true)).toHaveLength(2);
      expect(lines(cards())[0]).toMatch(/^ready-to-push +yonder +yonder-eight-riddles +Eight riddles +0m$/);
      expect(readdirSync(join(root, "board"))).toHaveLength(2);
      expect(options(["--status", "later"])).toBeString();
      expect(options(["--nope"])).toBeString();
      expect(options(["--on", "x", "--status", "running"])).toBeString();
      expect(options(["--repos", " , "])).toBeString();
      // --on blocks a card on another; leaving blocked forgets it.
      const c = set("yonder-eight-riddles", { on: "wow-data-x", repos: "yonder, wow-data" });
      if (typeof c === "string") throw new Error(c);
      expect([c.status, c.waits, c.repos]).toEqual(["blocked", "wow-data-x", ["yonder", "wow-data"]]);
      expect(set("yonder-eight-riddles", { on: "yonder-eight-riddles" })).toContain("can't wait on itself");
      const d = set("yonder-eight-riddles", { status: "running" });
      if (typeof d === "string") throw new Error(d);
      // Running again: its wait forgotten, its place in each queue taken now.
      expect([d.status, d.waits, d.since]).toEqual(["running", "", { yonder: d.updated, "wow-data": d.updated }]);
      const e = set("yonder-eight-riddles", { committed: "abc" });
      if (typeof e === "string") throw new Error(e);
      expect(e.since).toEqual(d.since);
      // Widened, the new repository queues now, the others keep their place; written and read back so.
      Bun.sleepSync(1100);
      const f = set("yonder-eight-riddles", { repos: "yonder,wow-data,mealbook" });
      if (typeof f === "string") throw new Error(f);
      expect([f.since.yonder, f.since["wow-data"], f.since.mealbook === f.updated, f.since.mealbook > d.updated]).toEqual([d.updated, d.updated, true, true]);
      expect(parseCard(f.id, readFileSync(join(root, "board", `${f.id}.md`), "utf8")).since).toEqual(f.since);
      set("yonder-eight-riddles", { status: "ready-to-push" });
      mkdirSync(join(root, "yonder"), { recursive: true });
      expect(strangers(["yonder", "yondr"])).toEqual(["yondr"]);
      expect(existsSync(join(root, "board", "yonder-eight-riddles.md"))).toBe(true);
    } finally {
      delete process.env.WOW_ADDONS_ROOT;
    }
  });
});
