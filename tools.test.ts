// status.ts's, each.ts's and secret.ts's pure parts, and sync.ts's copies (bun test).
import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { argvOf, parse, pick, unknown } from "./each";
import { unfit, users } from "./secret";
import { attention, buildVersion, latestPerWorkflow, slugOf, type Repo, type Run } from "./status";

describe("status", () => {
  test("a GitHub remote, ssh or https", () => {
    expect(slugOf("git@github.com:salty-max/palaver.git")).toBe("salty-max/palaver");
    expect(slugOf("https://github.com/salty-max/wow-data")).toBe("salty-max/wow-data");
    expect(slugOf("https://example.com/x/y.git")).toBeUndefined();
  });

  test("each workflow's newest run", () => {
    const run = (workflow: string, conclusion: string, sha: string): Run => ({ workflow, status: "completed", conclusion, sha, at: "" });
    const latest = latestPerWorkflow([run("CI", "failure", "b"), run("Game data", "success", "b"), run("CI", "success", "a")]);
    expect(latest.map((r) => `${r.workflow} ${r.conclusion}`)).toEqual(["CI failure", "Game data success"]);
  });

  test("a test build's version from its name", () => {
    expect(buildVersion("Palaver-3a2cc22.zip", "Palaver")).toBe("3a2cc22");
    expect(buildVersion("Hearthtale-v0.12.5-2-ga46a554.zip", "Hearthtale")).toBe("v0.12.5-2-ga46a554");
    expect(buildVersion("SecondWind-v0.5.4.zip", "Second")).toBeUndefined();
    expect(buildVersion("Hearthtale.lua", "Hearthtale")).toBeUndefined();
    expect(buildVersion("ravenpost-v0.4.0-windows-x64.exe", "ravenpost")).toBe("v0.4.0");
  });

  test("what wants a hand", () => {
    const r: Repo = {
      name: "palaver",
      branch: "main",
      upstream: "origin/main",
      ahead: 2,
      behind: 0,
      dirty: 1,
      head: "",
      runs: [{ workflow: "CI", status: "completed", conclusion: "failure", sha: "1234567890", at: "" }],
      prs: [{ number: 8, title: "chore: players' facts" }],
      build: { file: "Palaver-x.zip", version: "x", state: "behind", behind: 1 },
    };
    expect(attention(r)).toEqual([
      "1 file uncommitted",
      "2 commits to push",
      "CI: failure (1234567)",
      "pull request #8 open: chore: players' facts",
      "test build Palaver-x.zip is 1 commit behind HEAD",
    ]);
    expect(attention({ ...r, ahead: 0, dirty: 0, runs: [], prs: [], build: undefined })).toEqual([]);
    expect(attention({ ...r, upstream: undefined, ahead: 0, dirty: 0, runs: [], prs: [], build: undefined })).toEqual([
      "no upstream (local only)",
    ]);
  });
});

describe("each", () => {
  const names = ["addon-kit", "keyring", "palaver", "wow-data"];
  const test_ = { addon: (n: string) => ["keyring", "palaver"].includes(n), kit: (n: string) => n === "palaver" };

  test("the command after --", () => {
    expect(parse(["--kit", "--", "bun", "run", "check"])).toMatchObject({ which: "kit", command: ["bun", "run", "check"] });
    // (the words as given, no shell between; one word alone a shell line)
    expect(argvOf(["printf", "[%s]", "two words"])).toEqual(["printf", "[%s]", "two words"]);
    expect(argvOf(["git status && git log -1"])).toEqual(["/bin/sh", "-c", "git status && git log -1"]);
    const o = parse(["--only", "yonder,yondr", "--", "x"]) as Exclude<ReturnType<typeof parse>, string>;
    expect(unknown(["yonder", "keyring"], o)).toEqual(["yondr"]);
    expect(parse(["--kit"])).toBe("give the command after --");
    expect(parse(["--nope", "--", "x"])).toBe("unknown option --nope");
    expect(parse(["--only", "--", "x"])).toBe("--only takes folder names, a,b");
  });

  test("which repositories", () => {
    const o = (argv: string[]) => parse([...argv, "--", "x"]) as Exclude<ReturnType<typeof parse>, string>;
    expect(pick(names, o([]), test_)).toEqual(["keyring", "palaver"]);
    expect(pick(names, o(["--kit"]), test_)).toEqual(["palaver"]);
    expect(pick(names, o(["--all", "--skip", "wow-data"]), test_)).toEqual(["addon-kit", "keyring", "palaver"]);
    expect(pick(names, o(["--only", "wow-data,nope"]), test_)).toEqual(["wow-data"]);
  });
});

describe("secret", () => {
  test("a value fit for its secret", () => {
    const uuid = "0f8fad5b-d9cb-469f-a165-70867728950e";
    expect(unfit("CURSEFORGE_TOKEN", uuid)).toBeUndefined();
    expect(unfit("CURSEFORGE_TOKEN", "abcdefghijklmnopqrstuvwxyz")).toBe("a CurseForge token is a UUID, this isn't one");
    expect(unfit("WAGO_API_TOKEN", uuid)).toBe("this is a UUID: CurseForge's token, not Wago's");
    expect(unfit("WAGO_API_TOKEN", "a".repeat(40))).toBeUndefined();
    expect(unfit("WAGO_API_TOKEN", "")).toBe("it is empty");
    expect(unfit("WAGO_API_TOKEN", "two words here and more")).toBe("it holds a space or a line break: not a token");
    expect(unfit("INBOX_EVENTS_TOKEN", "short")).toBe("5 characters: too short for a token");
  });

  test("the repositories that read it", () => {
    const workflows = {
      keyring: ["CF_API_KEY: ${{ secrets.CURSEFORGE_TOKEN }}\nWAGO_API_TOKEN: ${{ secrets.WAGO_API_TOKEN }}"],
      palaver: ["jobs:\n  data:\n    uses: salty-max/wow-data/.github/workflows/addon-data.yml@main\n    secrets: inherit\n"],
      ravenpost: ["name: CI\n"],
    };
    expect(users("WAGO_API_TOKEN", workflows)).toEqual(["keyring"]);
    // (wow-data's addon-data.yml, beside the kit, reads INBOX_EVENTS_TOKEN)
    expect(users("INBOX_EVENTS_TOKEN", workflows)).toEqual(["palaver"]);
    expect(users("NOTHING_READS_THIS", workflows)).toEqual([]);
  });
});

describe("sync", () => {
  const made: string[] = [];
  afterAll(() => {
    for (const dir of made) rmSync(dir, { recursive: true, force: true });
  });
  const temp = () => {
    const dir = mkdtempSync(join(tmpdir(), "kit-sync-"));
    made.push(dir);
    return dir;
  };
  const env = { ...process.env, WOW_ADDONS_ROOT: "" };
  delete env.WOW_ADDONS_ROOT;
  const run = (cwd: string, cmd: string[]) => Bun.spawnSync(cmd, { cwd, env, stdout: "pipe", stderr: "pipe" });
  const sync = (cwd: string, ...args: string[]) => run(cwd, ["bun", join(import.meta.dir, "sync.ts"), ...args]);
  const repo = (python: boolean, dir = temp()) => {
    mkdirSync(join(dir, "addon", "X"), { recursive: true });
    mkdirSync(join(dir, "scripts"), { recursive: true });
    writeFileSync(join(dir, "scripts", "build.ts"), "");
    if (python) writeFileSync(join(dir, "scripts", "zones.py"), "");
    return dir;
  };

  test("the family's finders copied beside the scripts, stamped, and checked", () => {
    const dir = repo(true);
    expect(sync(dir, "addon/X").exitCode).toBe(0);
    const ts = readFileSync(join(dir, "scripts", "root.ts"), "utf8");
    expect(ts.split("\n")[0]).toMatch(/^\/\/ addon-kit \S+: a copy \(kit:sync\); edit the addon-kit repository's root\.ts instead$/);
    expect(ts.slice(ts.indexOf("\n") + 1)).toBe(readFileSync(join(import.meta.dir, "root.ts"), "utf8"));
    expect(readFileSync(join(dir, "scripts", "root.py"), "utf8").split("\n")[0]).toMatch(/^# addon-kit \S+: a copy/);
    expect(sync(dir, "--check", "addon/X").exitCode).toBe(0);
    writeFileSync(join(dir, "scripts", "root.ts"), `${ts}// edited\n`);
    const r = sync(dir, "--check", "addon/X");
    expect(r.exitCode).toBe(1);
    expect(r.stderr.toString()).toContain("scripts/root.ts: not the kit's");
  });

  test("root.py only where a Python script is, a stale one refused", () => {
    const dir = repo(false);
    expect(sync(dir, "addon/X").exitCode).toBe(0);
    expect(existsSync(join(dir, "scripts", "root.ts"))).toBe(true);
    expect(existsSync(join(dir, "scripts", "root.py"))).toBe(false);
    expect(sync(dir, "--check", "addon/X").exitCode).toBe(0);
    writeFileSync(join(dir, "scripts", "root.py"), "");
    const r = sync(dir, "--check", "addon/X");
    expect(r.exitCode).toBe(1);
    expect(r.stderr.toString()).toContain("no Python script beside it");
  });

  test("a copy in a worktree outside the family folder finds it through git's common dir, and --run keeps exit codes", () => {
    // a family folder of its own: addon-kit/ and wow-data/ beside an addon,
    // the addon's worktree somewhere else
    const family = temp();
    mkdirSync(join(family, "addon-kit"));
    mkdirSync(join(family, "wow-data"));
    writeFileSync(join(family, "addon-kit", "exit3.ts"), "process.exit(3);\n");
    const addon = repo(true, join(family, "addon"));
    expect(sync(addon, "addon/X").exitCode).toBe(0);
    for (const cmd of [["git", "init", "-q"], ["git", "add", "-A"], ["git", "-c", "user.name=t", "-c", "user.email=t@t", "-c", "core.hooksPath=/dev/null", "commit", "-q", "-m", "t"]])
      expect(run(addon, cmd).exitCode).toBe(0);
    const tree = join(temp(), "wt");
    expect(run(addon, ["git", "worktree", "add", "-q", "--detach", tree]).exitCode).toBe(0);
    const found = run(tree, ["bun", "scripts/root.ts"]);
    expect(found.stdout.toString().trim()).toBe(realpathSync(family));
    expect(run(tree, ["bun", "scripts/root.ts", "--run", "addon-kit/exit3.ts"]).exitCode).toBe(3);
    // no family folder at all: an error, never a silent success
    const lost = repo(false);
    expect(sync(lost, "addon/X").exitCode).toBe(0);
    const none = run(lost, ["bun", "scripts/root.ts", "--run", "addon-kit/sync.ts", "--check", "addon/X"]);
    expect(none.exitCode).toBe(1);
    expect(none.stderr.toString()).toContain("no family folder");
  });
});
