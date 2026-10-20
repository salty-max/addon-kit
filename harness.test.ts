// The harness: q.ts, the stamp, the git hooks, root.ts and root.py,
// packet.ts and board.ts (bun test). Each test makes its repositories in a
// family folder of its own under the system's temp folder, git kept from the
// user's own configuration.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { add, cards, format, lines, options, parseCard, set, setSection, slug } from "./board";
import { HOOKS } from "./hooks";
import { changedLines, packet, riddles, subjectProblem, touched, trailerProblem } from "./packet";
import { clean, headTree, matters, parse, stampOf, verdict, workTree } from "./q";
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

beforeAll(() => {
  for (const k of [...Object.keys(GIT_ENV), "WOW_ADDONS_ROOT"]) saved[k] = process.env[k];
  Object.assign(process.env, GIT_ENV);
  delete process.env.WOW_ADDONS_ROOT;
  tmp = realpathSync(mkdtempSync(join(tmpdir(), "harness-test-")));
});
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
    // a person, a generated file: fine
    expect(commit(repo, "chore: Text_frFR generated with locales.ts").code).toBe(0);
    expect(commit(repo, "feat: z\n\nGenerated with scripts/build.ts, then read.\n\nCo-authored-by: Egypt Smith <e@example.com>").code).toBe(0);
    expect(commit(repo, "feat(pages): the codex's\ngenerated with locales.ts, the Codex's own pages\n- generated by the cursor helper").code).toBe(0);
    expect(trailerProblem("feat: a\n\nCo-Authored-By: Claude <noreply@anthropic.com>\n")).toContain("Claude");
    expect(trailerProblem("feat: a\n")).toBeUndefined();
  });

  test("pre-push refuses an unchecked tree and lets a checked one through", () => {
    const { repo, remote } = hooked();
    const refused = git(repo, "push", "-q", "origin", "main");
    expect(refused.code).not.toBe(0);
    expect(refused.err).toContain("pre-push: no passing check");
    expect(refused.err).toContain(`bun ${KIT}/q.ts check -- `);
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

describe("board", () => {
  test("a card's text round-trips", () => {
    const card = { id: "yonder-x", repo: "yonder", title: "Eight riddles: the review's fixes", status: "waiting-test" as const, session: "", updated: "2026-10-20T09:00:00+02:00", body: "## Try\n\nFreewind\n" };
    const text = format(card);
    expect(text).toContain('title: "Eight riddles: the review\'s fixes"');
    expect(text).toContain('updated: "2026-10-20T09:00:00+02:00"');
    expect(parseCard("x", '---\ntitle: "A: b" # a note\n---\n').title).toBe("A: b");
    expect(text).toContain('session: ""');
    expect(parseCard("yonder-x", text)).toEqual(card);
    expect(format({ ...card, title: "true" })).toContain('title: "true"');
    expect(slug("Yonder: Kel'Theril, à nouveau")).toBe("yonder-keltheril-a-nouveau");
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
      expect(existsSync(join(root, "board", "yonder-eight-riddles.md"))).toBe(true);
    } finally {
      delete process.env.WOW_ADDONS_ROOT;
    }
  });
});
