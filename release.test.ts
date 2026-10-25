// The family's release (release.sh) in scratch repositories: a bare remote,
// a clone holding an addon, gh and bun stubbed on the PATH (gh's variables
// in a file; bun's check stamping the tree or not, passing or not, moving
// origin's main meanwhile). Nothing reaches GitHub (bun test).
import { afterAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// (each test runs a whole release.sh, two dozen processes: 2s alone, past
// bun's 5s default on a busy machine)
setDefaultTimeout(30_000);

const RELEASE = join(import.meta.dir, "release.sh");
const made: string[] = [];
afterAll(() => {
  for (const d of made) rmSync(d, { recursive: true, force: true });
});

const sh = (cwd: string, ...cmd: string[]) => {
  const r = Bun.spawnSync(cmd, { cwd, stdout: "pipe", stderr: "pipe", env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", HUSKY: "0" } });
  if (r.exitCode !== 0) throw new Error(`${cmd.join(" ")}: ${r.stderr}`);
  return r.stdout.toString().trim();
};
const git = (cwd: string, ...args: string[]) =>
  sh(cwd, "git", "-c", "user.name=t", "-c", "user.email=t@t", "-c", "core.hooksPath=/dev/null", "-c", "init.defaultBranch=main", ...args);

// A remote, a clone with addon/X at 1.0.0 and a notes file, the stubs.
function scratch() {
  const top = mkdtempSync(join(tmpdir(), "release-"));
  made.push(top);
  const remote = join(top, "remote.git");
  git(top, "init", "-q", "--bare", remote);
  const repo = join(top, "repo");
  mkdirSync(join(repo, "addon", "X"), { recursive: true });
  git(top, "init", "-q", repo);
  for (const t of ["X_Vanilla.toc", "X_Camelot.toc"]) writeFileSync(join(repo, "addon", "X", t), "## Interface: 11509\n## Version: 1.0.0\nCore.lua\n");
  writeFileSync(join(repo, "addon", "X", "Core.lua"), "-- x\n");
  writeFileSync(join(repo, ".gitignore"), "NOTES.md\n");
  git(repo, "add", "-A");
  git(repo, "commit", "-q", "-m", "first");
  git(repo, "remote", "add", "origin", remote);
  git(repo, "push", "-q", "origin", "main");
  writeFileSync(join(repo, "NOTES.md"), "the notes\n");
  // (another clone, to move origin's main during the check)
  const other = join(top, "other");
  git(top, "clone", "-q", remote, other);
  const bin = join(top, "bin");
  mkdirSync(bin);
  const vars = join(top, "vars");
  // gh: variable list (JSON), set, delete; GH_FAIL makes it fail
  writeFileSync(
    join(bin, "gh"),
    `#!/usr/bin/env bash
[ -n "\${GH_FAIL:-}" ] && exit 1
v="${vars}"
case "$1 $2" in
  "variable list") if [ -s "$v" ]; then echo "$(cat "$v")"; fi ;;
  "variable set") echo "true" >"$v" ;;
  "variable delete") [ -s "$v" ] || exit 1; rm -f "$v" ;;
  *) exit 1 ;;
esac
`,
  );
  // bun: ids.ts (IDS_FAIL), q.ts check (CHECK=fail|nostamp|move|ok)
  writeFileSync(
    join(bin, "bun"),
    `#!/usr/bin/env bash
case "$*" in
  *ids.ts*) [ -n "\${IDS_FAIL:-}" ] && exit 1; exit 0 ;;
  *q.ts*)
    case "\${CHECK:-ok}" in
      fail) exit 1 ;;
      nostamp) exit 0 ;;
      move) (cd "${other}" && git -c user.name=t -c user.email=t@t commit -q --allow-empty -m data && git push -q origin main) ;;
    esac
    d="$(git rev-parse --path-format=absolute --git-common-dir)/harness"; mkdir -p "$d"
    git add -A; touch "$d/check-$(git write-tree)"; git reset -q
    exit 0 ;;
esac
exit 1
`,
  );
  chmodSync(join(bin, "gh"), 0o755);
  chmodSync(join(bin, "bun"), 0o755);
  // (gh's ask: a saved-ids.json makes the release check the ids)
  writeFileSync(join(repo, "saved-ids.json"), "{}\n");
  git(repo, "add", "saved-ids.json");
  git(repo, "commit", "-q", "-m", "ids");
  git(repo, "push", "-q", "origin", "main");
  git(other, "pull", "-q");
  // (gh variable list's answer as the jq filter would give it: the stub prints the value)
  return { top, remote, repo, other, bin, vars };
}

function release(s: ReturnType<typeof scratch>, args: string[], env: Record<string, string> = {}) {
  const r = Bun.spawnSync(["bash", RELEASE, "--folders", "addon/X", ...args, "NOTES.md"], {
    cwd: s.repo,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      ...env,
      PATH: `${s.bin}:${process.env.PATH}`,
      GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_AUTHOR_NAME: "t",
      GIT_AUTHOR_EMAIL: "t@t",
      GIT_COMMITTER_NAME: "t",
      GIT_COMMITTER_EMAIL: "t@t",
    },
  });
  return { code: r.exitCode, out: r.stdout.toString() + r.stderr.toString() };
}
const version = (s: ReturnType<typeof scratch>) => readFileSync(join(s.repo, "addon", "X", "X_Vanilla.toc"), "utf8").match(/## Version: (.+)/)![1];
const remoteTags = (s: ReturnType<typeof scratch>) => git(s.repo, "ls-remote", "--tags", "origin");
const putBack = (s: ReturnType<typeof scratch>) => {
  expect(version(s)).toBe("1.0.0");
  expect(git(s.repo, "tag", "-l")).toBe("");
  expect(git(s.repo, "rev-parse", "HEAD")).toBe(git(s.repo, "rev-parse", "origin/main"));
  expect(git(s.repo, "status", "--porcelain")).toBe("");
};

describe("a release", () => {
  test("bumps, checks, tags and pushes main and the tag together", () => {
    const s = scratch();
    writeFileSync(s.vars, "true\n"); // (an earlier --hold)
    const r = release(s, []);
    expect(r.out).toContain("pushed v1.0.1");
    expect(r.code).toBe(0);
    expect(version(s)).toBe("1.0.1");
    expect(remoteTags(s)).toContain("refs/tags/v1.0.1");
    expect(git(s.repo, "ls-remote", "origin", "refs/heads/main")).toContain(git(s.repo, "rev-parse", "HEAD"));
    expect(existsSync(s.vars)).toBe(false); // (the stores no longer held)
  });
  test("--hold holds the stores; --dry-run changes nothing", () => {
    const s = scratch();
    expect(release(s, ["--dry-run"]).code).toBe(0);
    putBack(s);
    expect(release(s, ["--hold", "--version", "2.0.0"]).code).toBe(0);
    expect(readFileSync(s.vars, "utf8").trim()).toBe("true");
    expect(remoteTags(s)).toContain("refs/tags/v2.0.0");
  });
});

describe("a release that stops puts everything back", () => {
  test("a failing check", () => {
    const s = scratch();
    const r = release(s, [], { CHECK: "fail" });
    expect(r.code).not.toBe(0);
    expect(r.out).toContain("nothing published");
    putBack(s);
  });
  test("a check that didn't stamp the bumped tree", () => {
    const s = scratch();
    const r = release(s, [], { CHECK: "nostamp" });
    expect(r.code).not.toBe(0);
    expect(r.out).toContain("didn't stamp");
    putBack(s);
  });
  test("origin's main moved during the check: no tag goes up", () => {
    const s = scratch();
    const r = release(s, ["--hold"], { CHECK: "move" });
    expect(r.code).not.toBe(0);
    expect(r.out).toContain("origin/main moved");
    putBack(s);
    expect(remoteTags(s)).toBe("");
    expect(existsSync(s.vars)).toBe(false); // (never set: it stopped before)
    // (the rerun: behind origin now, the pull named, nothing changed)
    const again = release(s, []);
    expect(again.code).not.toBe(0);
    expect(again.out).toContain("git pull --ff-only, then run the release again");
    expect(version(s)).toBe("1.0.0");
  });
  test("a refused push: neither main nor the tag, HOLD_STORES as it was", () => {
    const s = scratch();
    // (the remote refuses every push from now on)
    const hook = join(s.remote, "hooks", "pre-receive");
    writeFileSync(hook, "#!/bin/sh\nexit 1\n");
    chmodSync(hook, 0o755);
    const r = release(s, ["--hold"]);
    expect(r.code).not.toBe(0);
    putBack(s);
    expect(remoteTags(s)).toBe("");
    expect(existsSync(s.vars)).toBe(false); // (set for the push, put back)
  });
  test("an id the last release had, gone: refused before anything changes", () => {
    const s = scratch();
    const r = release(s, [], { IDS_FAIL: "1" });
    expect(r.code).not.toBe(0);
    expect(r.out).toContain("an id the last release had is gone");
    putBack(s);
  });
  test("gh unable to read the variables: refused before anything changes", () => {
    const s = scratch();
    const r = release(s, [], { GH_FAIL: "1" });
    expect(r.code).not.toBe(0);
    expect(r.out).toContain("gh can't read");
    putBack(s);
  });
});
