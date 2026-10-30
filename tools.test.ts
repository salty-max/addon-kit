// secret.ts's pure parts, and sync.ts's copies (bun test).
import { afterAll, describe, expect, test } from "bun:test";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { unfit, users } from "./secret";
import { familyRoot } from "./root";
import { family, git, KIT, run, temp as fixtureTmp, useFixtures } from "./test-fixtures";

useFixtures();

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
  const run = (cwd: string, cmd: string[], more: Record<string, string> = {}) => Bun.spawnSync(cmd, { cwd, env: { ...env, CI: "", ...more }, stdout: "pipe", stderr: "pipe" });
  const commitAll = (dir: string, msg = "t") => {
    for (const cmd of [["git", "add", "-A"], ["git", "-c", "user.name=t", "-c", "user.email=t@t", "-c", "core.hooksPath=/dev/null", "commit", "-q", "-m", msg]])
      expect(run(dir, cmd).exitCode).toBe(0);
  };
  // A kit of its own, committed: the tests never depend on the real kit's state.
  const kit = () => {
    const dir = temp();
    for (const f of ["sync.ts", "Kit.lua", "root.ts", "root.py"]) copyFileSync(join(import.meta.dir, f), join(dir, f));
    mkdirSync(join(dir, "Media"));
    writeFileSync(join(dir, "Media", "Ring.tga"), "ring");
    expect(run(dir, ["git", "init", "-q", "-b", "main"]).exitCode).toBe(0);
    commitAll(dir);
    return dir;
  };
  let KIT_DIR = "";
  const sync = (cwd: string, ...args: string[]) => run(cwd, ["bun", join((KIT_DIR ||= kit()), "sync.ts"), ...args]);
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
    expect(ts.slice(ts.indexOf("\n") + 1)).toBe(readFileSync(join(KIT_DIR, "root.ts"), "utf8"));
    expect(readFileSync(join(dir, "scripts", "root.py"), "utf8").split("\n")[0]).toMatch(/^# addon-kit \S+: a copy/);
    expect(sync(dir, "--check", "addon/X").exitCode).toBe(0);
    writeFileSync(join(dir, "scripts", "root.ts"), `${ts}// edited\n`);
    const r = sync(dir, "--check", "addon/X");
    expect(r.exitCode).toBe(1);
    expect(r.stderr.toString()).toContain("scripts/root.ts: not the kit's");
  });

  test("the package's lib comes with the languages' core it imports, locales.ts or not", () => {
    const k = kit();
    for (const f of ["package-lib.ts", "locales-lib.ts"]) copyFileSync(join(import.meta.dir, f), join(k, f));
    commitAll(k, "libs");
    const dir = repo(false);
    writeFileSync(join(dir, "scripts", "package.ts"), "");
    expect(run(dir, ["bun", join(k, "sync.ts"), "addon/X"]).exitCode).toBe(0);
    expect(existsSync(join(dir, "scripts", "package-lib.ts"))).toBe(true);
    expect(existsSync(join(dir, "scripts", "locales-lib.ts"))).toBe(true);
  });

  test("a copy is the kit's at its stamp: a hand edit or a made-up stamp fails, a stale one fails but in CI", () => {
    const k = kit();
    const go = (cwd: string, ...args: string[]) => run(cwd, ["bun", join(k, "sync.ts"), ...args]);
    const dir = repo(false);
    expect(go(dir, "addon/X").exitCode).toBe(0);
    const copy = readFileSync(join(dir, "addon", "X", "Kit.lua"), "utf8");
    const stamp = copy.match(/^-- addon-kit ([0-9a-f]+):/)![1];
    expect(go(dir, "--check", "addon/X").exitCode).toBe(0);
    writeFileSync(join(dir, "addon", "X", "Kit.lua"), `${copy}-- edited\n`);
    expect(go(dir, "--check", "addon/X").stderr.toString()).toContain(`not the kit's at ${stamp}`);
    writeFileSync(join(dir, "addon", "X", "Kit.lua"), copy.replace(stamp, "0000000"));
    expect(go(dir, "--check", "addon/X").exitCode).toBe(1);
    writeFileSync(join(dir, "addon", "X", "Kit.lua"), copy);
    // a harness commit moves no stamp; a commit to the kit makes the copy stale
    writeFileSync(join(k, "q.ts"), "// the harness\n");
    commitAll(k, "harness");
    expect(go(dir, "--check", "addon/X").exitCode).toBe(0);
    writeFileSync(join(k, "Kit.lua"), `${readFileSync(join(k, "Kit.lua"), "utf8")}-- more\n`);
    // uncommitted: the sync refuses, but a trial; the check refuses the trial's copy
    expect(go(dir, "addon/X").stderr.toString()).toContain("uncommitted changes");
    const finder = readFileSync(join(dir, "scripts", "root.ts"), "utf8");
    expect(go(dir, "--dirty", "addon/X").exitCode).toBe(0);
    expect(go(dir, "--check", "addon/X").stderr.toString()).toContain("a trial copy");
    writeFileSync(join(dir, "addon", "X", "Kit.lua"), copy);
    writeFileSync(join(dir, "scripts", "root.ts"), finder);
    commitAll(k, "kit");
    const stale = go(dir, "--check", "addon/X");
    expect([stale.exitCode, stale.stderr.toString().includes("stale")]).toEqual([1, true]);
    const ci = run(dir, ["bun", join(k, "sync.ts"), "--check", "addon/X"], { CI: "true" });
    expect([ci.exitCode, ci.stdout.toString().includes("note:"), ci.stderr.toString()]).toEqual([0, true, ""]);
    // a picture the kit dropped leaves the addon's folder at the next sync
    expect(go(dir, "addon/X").exitCode).toBe(0);
    expect(existsSync(join(dir, "addon", "X", "Media", "Ring.tga"))).toBe(true);
    rmSync(join(k, "Media", "Ring.tga"));
    writeFileSync(join(k, "Media", "Other.tga"), "other");
    commitAll(k, "pictures");
    expect(go(dir, "addon/X").exitCode).toBe(0);
    expect([existsSync(join(dir, "addon", "X", "Media", "Ring.tga")), existsSync(join(dir, "addon", "X", "Media", "Other.tga"))]).toEqual([false, true]);
  });

  test("with an origin: the check measures against origin/main, the sync refuses a kit HEAD that isn't there", () => {
    const k = kit();
    const bare = temp();
    expect(run(bare, ["git", "init", "-q", "--bare", "-b", "main", "."]).exitCode).toBe(0);
    expect(run(k, ["git", "remote", "add", "origin", bare]).exitCode).toBe(0);
    const go = (cwd: string, ...args: string[]) => run(cwd, ["bun", join(k, "sync.ts"), ...args]);
    const dir = repo(false);
    // the kit's first commit isn't pushed: nothing syncs from it
    const first = go(dir, "addon/X");
    expect([first.exitCode, first.stderr.toString().includes("isn't on origin/main")]).toEqual([1, true]);
    expect(run(k, ["git", "push", "-q", "origin", "main"]).exitCode).toBe(0);
    expect(go(dir, "addon/X").exitCode).toBe(0);
    expect(go(dir, "--check", "addon/X").exitCode).toBe(0);
    // a local, unpushed kit commit stales nobody, and the sync from it is refused
    writeFileSync(join(k, "Kit.lua"), `${readFileSync(join(k, "Kit.lua"), "utf8")}-- local\n`);
    commitAll(k, "kit, local");
    expect(go(dir, "--check", "addon/X").exitCode).toBe(0);
    const refused = go(dir, "addon/X");
    expect([refused.exitCode, refused.stderr.toString().includes("push the kit first")]).toEqual([1, true]);
    // a trial is not a sync: --dirty goes past it (and the check refuses its copy)
    const synced = readFileSync(join(dir, "addon", "X", "Kit.lua"), "utf8");
    const finder = readFileSync(join(dir, "scripts", "root.ts"), "utf8");
    writeFileSync(join(k, "Kit.lua"), `${readFileSync(join(k, "Kit.lua"), "utf8")}-- trial\n`);
    expect(go(dir, "--dirty", "addon/X").exitCode).toBe(0);
    expect(go(dir, "--check", "addon/X").stderr.toString()).toContain("a trial copy");
    writeFileSync(join(dir, "addon", "X", "Kit.lua"), synced);
    writeFileSync(join(dir, "scripts", "root.ts"), finder);
    // pushed, the kit's commit makes the old copy stale; a copy stamped on a commit origin lacks fails
    commitAll(k, "kit, trial kept");
    expect(run(k, ["git", "push", "-q", "origin", "main"]).exitCode).toBe(0);
    const stale = go(dir, "--check", "addon/X");
    expect([stale.exitCode, stale.stderr.toString().includes("stale")]).toEqual([1, true]);
    expect(go(dir, "addon/X").exitCode).toBe(0);
    expect(go(dir, "--check", "addon/X").exitCode).toBe(0);
    // a kit checkout behind origin/main (a commit pushed from elsewhere): the sync says pull, not a copy the check calls stale
    const elsewhere = temp();
    expect(run(elsewhere, ["git", "clone", "-q", bare, "."]).exitCode).toBe(0);
    writeFileSync(join(elsewhere, "Kit.lua"), `${readFileSync(join(elsewhere, "Kit.lua"), "utf8")}-- from elsewhere\n`);
    commitAll(elsewhere, "kit, from elsewhere");
    expect(run(elsewhere, ["git", "push", "-q", "origin", "main"]).exitCode).toBe(0);
    const behind = go(dir, "addon/X");
    expect([behind.exitCode, behind.stderr.toString().includes("pull --ff-only")]).toEqual([1, true]);
    const behindCheck = go(dir, "--check", "addon/X");
    expect([behindCheck.exitCode, behindCheck.stderr.toString().includes("behind origin/main")]).toEqual([1, true]);
    expect(run(k, ["git", "pull", "-q", "--ff-only", "origin", "main"]).exitCode).toBe(0);
    expect(go(dir, "addon/X").exitCode).toBe(0);
    expect(go(dir, "--check", "addon/X").exitCode).toBe(0);
    // a copy stamped on a commit origin never had (the kit reset, a branch dropped)
    expect(run(k, ["git", "reset", "-q", "--hard", "HEAD~1"]).exitCode).toBe(0);
    writeFileSync(join(k, "Kit.lua"), `${readFileSync(join(k, "Kit.lua"), "utf8")}-- other\n`);
    commitAll(k, "kit, a commit origin never gets");
    const local = run(k, ["git", "rev-parse", "--short", "HEAD"]).stdout.toString().trim();
    writeFileSync(join(dir, "addon", "X", "Kit.lua"), `-- addon-kit ${local}: a copy (kit:sync); edit the addon-kit repository's Kit.lua instead\n${readFileSync(join(k, "Kit.lua"), "utf8")}`);
    const lost = go(dir, "--check", "addon/X");
    expect([lost.exitCode, lost.stderr.toString().includes("isn't on the kit's origin/main")]).toEqual([1, true]);
    // offline: the last fetched origin/main stands in, said so
    expect(run(k, ["git", "remote", "set-url", "origin", join(bare, "gone")]).exitCode).toBe(0);
    const off = go(dir, "--check", "addon/X");
    expect(off.stderr.toString()).toContain("measuring against the last fetched origin/main");
  }, 30_000);

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
    expect(run(addon, ["git", "init", "-q"]).exitCode).toBe(0);
    commitAll(addon);
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

describe("root.ts and root.py", () => {
  test("the family folder from a worktree anywhere, in TypeScript and Python", () => {
    const { root, repo } = family();
    const outside = join(fixtureTmp(), `elsewhere-${Date.now()}`, "wt");
    expect(git(repo, "worktree", "add", "-q", outside).code).toBe(0);
    expect(familyRoot(join(repo, "."))).toBe(root);
    expect(familyRoot(outside)).toBe(root);
    expect(run(outside, ["bun", join(KIT, "root.ts"), "wow-data"]).out.trim()).toBe(join(root, "wow-data"));
    expect(run(outside, ["python3", join(KIT, "root.py"), "wow-data"]).out.trim()).toBe(join(root, "wow-data"));
    process.env.WOW_ADDONS_ROOT = root;
    try {
      expect(familyRoot("/")).toBe(root);
      process.env.WOW_ADDONS_ROOT = fixtureTmp();
      expect(() => familyRoot()).toThrow("holds no addon-kit");
      expect(run(outside, ["python3", join(KIT, "root.py")]).code).toBe(1);
    } finally {
      delete process.env.WOW_ADDONS_ROOT;
    }
  });
});
