// session.ts: its parts, and the whole run with `claude` stubbed on the PATH (no real session).
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { cleanEnv, command, idOf, openerOf, parse, prompt } from "./session";

describe("session: its parts", () => {
  test("the title, the repositories, the kind and the task after --", () => {
    expect(parse(["Eight riddles", "--repos", "yonder, wow-data", "--kind", "code", "--", "Write", "eight riddles"])).toEqual({
      title: "Eight riddles",
      repos: ["yonder", "wow-data"],
      kind: "code",
      plan: false,
      dryRun: false,
      task: "Write eight riddles",
    });
    expect(parse(["T", "--repos", "a", "--kind", "prose", "--plan", "--dry-run", "--", "x"])).toMatchObject({ kind: "prose", plan: true, dryRun: true });
    expect(parse(["--repos", "a", "--kind", "code", "--", "x"])).toBe("the card's title first");
    expect(parse(["T", "--kind", "code", "--", "x"])).toBe("--repos names every repository the task writes");
    expect(parse(["T", "--repos", "a", "--kind", "poetry", "--", "x"])).toBe("--kind is code or prose");
    expect(parse(["T", "--repos", "a", "--kind", "code"])).toBe("the task after --, in the user's words");
    expect(parse(["T", "--repos", "a", "--kind", "code", "--", "  "])).toBe("the task after --, in the user's words");
    expect(parse(["T", "--repos", "a", "--model", "haiku", "--", "x"])).toBe("unknown option --model");
    expect(parse(["T", "U", "--repos", "a", "--kind", "code", "--", "x"])).toBe("one title (a second: U); the task goes after --");
    expect(parse(["T", "--repos"])).toBe("--repos takes a value");
    // (a space for a comma would put a broken board.ts add in the prompt)
    expect(parse(["T", "--repos", "yonder wow-data", "--kind", "code", "--", "x"])).toBe('--repos takes folder names, a comma between them (not "yonder wow-data")');
    expect(parse(["T", "--repos", "yonder,$(x)", "--kind", "code", "--", "x"])).toBe('--repos takes folder names, a comma between them (not "$(x)")');
  });

  test("the model by kind, plan mode on demand", () => {
    expect(command({ title: "T", kind: "code", plan: false })).toEqual(["claude", "--bg", "-n", "T", "--model", "opusplan"]);
    expect(command({ title: "T", kind: "prose", plan: false })).toEqual(["claude", "--bg", "-n", "T", "--model", "opus"]);
    expect(command({ title: "T", kind: "code", plan: true })).toEqual(["claude", "--bg", "-n", "T", "--model", "opusplan", "--permission-mode", "plan"]);
  });

  test("the prompt: the maps, the card, the model, the task, in that order", () => {
    const p = prompt({ title: 'The "Duskwood" riddles', repos: ["yonder", "wow-data"], kind: "code", plan: false, task: "Five riddles." }, "The kit audited");
    const at = (s: string) => p.indexOf(s);
    expect(p.startsWith('A new task from the user. The session "The kit audited" opened this one for it')).toBe(true);
    expect(p).toContain("bun addon-kit/board.ts add yonder \"The \\\"Duskwood\\\" riddles\" --repos yonder,wow-data --status running");
    expect(p).toContain("(yonder, wow-data)");
    expect(p).toContain("not the opener's");
    expect(p).toContain("opusplan: Sonnet, and Opus in plan mode");
    expect(at("CLAUDE.md")).toBeLessThan(at("board.ts add"));
    expect(at("board.ts add")).toBeLessThan(at("opusplan"));
    expect(at("opusplan")).toBeLessThan(at("Five riddles."));
    expect(p.endsWith("end with a `result:` line.")).toBe(true);
    expect(prompt({ title: "T", repos: ["a"], kind: "prose", plan: false, task: "x" })).toContain("Another session opened this one");
    expect(prompt({ title: "T", repos: ["a"], kind: "prose", plan: false, task: "x" })).toContain("You run on Opus (");
    expect(prompt({ title: "T", repos: ["a"], kind: "code", plan: true, task: "x" })).toContain("start in plan mode");
  });

  test("the running session's variables dropped, the working directory's pin and the config folder kept", () => {
    const env = cleanEnv({
      PATH: "/bin",
      HOME: "/h",
      CLAUDECODE: "1",
      CLAUDE_CODE_SESSION_ID: "s",
      CLAUDE_JOB_DIR: "/j",
      CLAUDE_PID: "1",
      CLAUDE_BASH_MAINTAIN_PROJECT_WORKING_DIR: "1",
      CLAUDE_CONFIG_DIR: "/c",
      UNSET: undefined,
    });
    expect(env).toEqual({ PATH: "/bin", HOME: "/h", CLAUDE_BASH_MAINTAIN_PROJECT_WORKING_DIR: "1", CLAUDE_CONFIG_DIR: "/c" });
  });

  test("the opener: its display name, else its open card, never a card it finished", () => {
    const list = [
      { session: "s1", status: "done" as const, title: "Store pages", updated: "2026-10-25T19:30:00+01:00" },
      { session: "s1", status: "running" as const, title: "The kit audited", updated: "2026-10-25T10:00:00+01:00" },
      { session: "s2", status: "running" as const, title: "Another's", updated: "2026-10-25T19:40:00+01:00" },
    ];
    const agents = [{ sessionId: "s2", name: "Other" }, { sessionId: "s1", name: "kit-addon-audit" }];
    expect(openerOf("s1", agents, list)).toBe("kit-addon-audit");
    expect(openerOf("s1", undefined, list)).toBe("The kit audited");
    expect(openerOf("s1", [{ sessionId: "s1", name: "  " }, null, "x"], list)).toBe("The kit audited");
    expect(openerOf("s1", { not: "a list" }, list.slice(0, 1))).toBeUndefined();
    // (a card waiting on the user is still its session's: the user answers there, and may ask a new task)
    expect(openerOf("s1", undefined, [...list, { session: "s1", status: "waiting-test" as const, title: "Waiting", updated: "2026-10-25T11:00:00+01:00" }])).toBe("Waiting");
  });

  test("the short id from claude's answer", () => {
    expect(idOf("backgrounded · 1f8f36b9 · Harness: sessions opened by sessions\n  claude agents             list sessions")).toBe("1f8f36b9");
    expect(idOf("Error: unknown model")).toBeUndefined();
  });
});

describe("session: a run, claude stubbed", () => {
  let tmp: string;
  let root: string;
  let bin: string;
  let seen: string;
  let events: string;

  beforeAll(() => {
    tmp = realpathSync(mkdtempSync(join(tmpdir(), "session-test-")));
    root = join(tmp, "family");
    for (const d of ["addon-kit", "wow-data", "board", "yonder"]) mkdirSync(join(root, d), { recursive: true });
    // (the opener's card: it holds yonder, and names the opener)
    writeFileSync(
      join(root, "board", "addon-kit-the-kit-audited.md"),
      '---\nrepo: addon-kit\ntitle: The kit audited\nstatus: running\nsession: s-opener\nupdated: "2026-10-25T10:00:00+01:00"\nrepos: addon-kit, yonder\nsince: "addon-kit@2026-10-25T10:00:00.000+01:00, yonder@2026-10-25T10:00:00.000+01:00"\n---\n## Try\n\nx\n',
    );
    writeFileSync(
      join(root, "board", "addon-kit-store-pages.md"),
      '---\nrepo: addon-kit\ntitle: Store pages\nstatus: done\nsession: s-opener\nupdated: "2026-10-25T19:30:00+01:00"\n---\n## Try\n\nx\n',
    );
    bin = join(tmp, "bin");
    mkdirSync(bin);
    seen = join(tmp, "seen.json");
    events = join(tmp, "events.log");
    // A claude that says what it was given, and answers as STUB says.
    writeFileSync(
      join(bin, "claude"),
      `#!${process.execPath}
const { writeFileSync } = require("node:fs");
if (process.argv[2] === "agents") {
  if (process.env.STUB_AGENTS === "none") process.exit(1);
  console.log(JSON.stringify([{ id: "e5a0fd61", sessionId: "s-opener", name: "kit-addon-audit" }, { sessionId: "s-other", name: "Other" }]));
  process.exit(0);
}
writeFileSync(process.env.STUB_SEEN, JSON.stringify({ argv: process.argv.slice(2), cwd: process.cwd(), env: process.env }));
const name = process.argv[process.argv.indexOf("-n") + 1];
if (process.env.STUB === "fail") { console.error("error: model 'opusplan' not available"); process.exit(3); }
if (process.env.STUB === "noid") { console.log("something else"); process.exit(0); }
console.log("backgrounded · abc12345 · " + name + "\\n  claude agents             list sessions\\n  claude attach abc12345    open in this terminal");
`,
    );
    chmodSync(join(bin, "claude"), 0o755);
  });
  afterAll(() => rmSync(tmp, { recursive: true, force: true }));

  const run = (args: string[], more: Record<string, string> = {}) => {
    rmSync(seen, { force: true });
    const p = Bun.spawnSync([process.execPath, join(import.meta.dir, "session.ts"), ...args], {
      cwd: tmp,
      env: {
        PATH: `${bin}:${dirname(process.execPath)}:/usr/bin:/bin`,
        HOME: process.env.HOME ?? tmp,
        WOW_ADDONS_ROOT: root,
        HARNESS_EVENTS: events,
        STUB_SEEN: seen,
        CLAUDECODE: "1",
        CLAUDE_CODE_SESSION_ID: "s-opener",
        CLAUDE_JOB_DIR: "/jobs/opener",
        CLAUDE_BASH_MAINTAIN_PROJECT_WORKING_DIR: "1",
        ...more,
      },
      stdout: "pipe",
      stderr: "pipe",
    });
    return { code: p.exitCode, out: p.stdout.toString(), err: p.stderr.toString() };
  };
  const given = () => JSON.parse(readFileSync(seen, "utf8")) as { argv: string[]; cwd: string; env: Record<string, string> };

  test("opens it from the family folder, clean of the opener's session, and says how to attach", () => {
    const r = run(["Eight riddles", "--repos", "yonder", "--kind", "code", "--", "Write eight riddles."]);
    expect(r.code).toBe(0);
    const g = given();
    expect(g.argv.slice(0, 6)).toEqual(["--bg", "-n", "Eight riddles", "--model", "opusplan", g.argv[5]]);
    expect(g.argv).toHaveLength(6);
    expect(g.argv[5]).toContain('The session "kit-addon-audit" opened this one');
    expect(g.argv[5]).toContain("Write eight riddles.");
    expect(g.cwd).toBe(root);
    expect(g.env.CLAUDE_CODE_SESSION_ID).toBeUndefined();
    expect(g.env.CLAUDECODE).toBeUndefined();
    expect(g.env.CLAUDE_JOB_DIR).toBeUndefined();
    expect(g.env.CLAUDE_BASH_MAINTAIN_PROJECT_WORKING_DIR).toBe("1");
    expect(r.out).toContain('opened "Eight riddles" (opusplan) as abc12345');
    expect(r.out).toContain("claude attach abc12345");
    // (the opener's card holds yonder: the new session will block on it)
    expect(r.err).toContain("note: yonder is held by addon-kit-the-kit-audited (running)");
    expect(readFileSync(events, "utf8")).toContain("\tsession\tok\tyonder\tEight riddles opened (opusplan) as abc12345");
  });

  test("no display name: the opener's open card names it, not the one it finished last", () => {
    expect(run(["T", "--repos", "yonder", "--kind", "code", "--", "x"], { STUB_AGENTS: "none" }).code).toBe(0);
    expect(given().argv[5]).toContain('The session "The kit audited" opened this one');
  });

  test("plan mode on demand, prose on Opus", () => {
    expect(run(["T", "--repos", "yonder", "--kind", "code", "--plan", "--", "x"]).code).toBe(0);
    expect(given().argv.slice(4, 8)).toEqual(["opusplan", "--permission-mode", "plan", given().argv[7]]);
    expect(run(["T", "--repos", "yonder", "--kind", "prose", "--", "x"]).code).toBe(0);
    expect(given().argv[4]).toBe("opus");
  });

  test("--dry-run prints the command and the prompt and starts nothing", () => {
    const r = run(["Eight riddles", "--repos", "yonder,wow-data", "--kind", "code", "--dry-run", "--", "Write eight riddles."]);
    expect(r.code).toBe(0);
    expect(existsSync(seen)).toBe(false);
    expect(r.out).toContain(`would run, from ${root}:\n  claude --bg -n 'Eight riddles' --model opusplan "$PROMPT"`);
    expect(r.out).toContain("without CLAUDECODE CLAUDE_CODE_SESSION_ID CLAUDE_JOB_DIR");
    expect(r.out).toContain("--repos yonder,wow-data --status running");
  });

  test("a refusal or an answer without an id fails with what claude said", () => {
    const fail = run(["T", "--repos", "yonder", "--kind", "code", "--", "x"], { STUB: "fail" });
    expect(fail.code).toBe(3);
    expect(fail.err).toContain("error: model 'opusplan' not available");
    expect(fail.err).toContain("claude --bg failed (exit 3)");
    const noid = run(["T", "--repos", "yonder", "--kind", "code", "--", "x"], { STUB: "noid" });
    expect(noid.code).toBe(1);
    expect(noid.err).toContain("something else");
    expect(noid.err).toContain("claude --bg answered without a session id: it may have started all the same. Look in `claude agents` before opening it again");
    expect(readFileSync(events, "utf8")).toContain("\tsession\tfail\tyonder\tT: claude --bg answered without a session id");
  });

  test("a bad ask is refused with the usage, nothing started", () => {
    const r = run(["T", "--repos", "yonder", "--", "x"]);
    expect(r.code).toBe(2);
    expect(r.err).toContain("--kind is code or prose\nusage: bun addon-kit/session.ts");
    expect(existsSync(seen)).toBe(false);
  });

  test("a name that is no family folder is a note, not a refusal", () => {
    const r = run(["T", "--repos", "new-addon", "--kind", "code", "--", "x"]);
    expect(r.code).toBe(0);
    expect(r.err).toContain("note: new-addon is no family folder yet");
  });
});
