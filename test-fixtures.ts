// What the family's own tests share (a family-shaped project root, git kept
// from the user's configuration): the harness tests' fixture, for the parts
// of the harness that stayed in the family (the riddle cards, the cold reads).
import { afterAll, beforeAll } from "bun:test";
import { copyFileSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const GIT_ENV = {
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_AUTHOR_NAME: "test",
  GIT_AUTHOR_EMAIL: "test@example.com",
  GIT_COMMITTER_NAME: "test",
  GIT_COMMITTER_EMAIL: "test@example.com",
};
export const KIT = import.meta.dir;

export function run(cwd: string, cmd: string[], env: Record<string, string> = {}) {
  const p = Bun.spawnSync(cmd, { cwd, env: { ...process.env, ...env }, stdout: "pipe", stderr: "pipe" });
  return { code: p.exitCode, out: p.stdout.toString(), err: p.stderr.toString() };
}
export const git = (cwd: string, ...args: string[]) => run(cwd, ["git", ...args]);
export const q = (cwd: string, ...args: string[]) => run(cwd, ["bun", join(KIT, "q.ts"), ...args]);

let tmp = "";
let n = 0;
export const temp = () => tmp;

/** Registers the setup and teardown of a test file's temp folder, git and the event log kept out of the user's. */
export function useFixtures() {
  const saved: Record<string, string | undefined> = {};
  beforeAll(() => {
    for (const k of [...Object.keys(GIT_ENV), "WOW_ADDONS_ROOT", "HARNESS_ROOT", "HARNESS_EVENTS", "CLAUDE_CODE_SESSION_ID", "CI"]) saved[k] = process.env[k];
    Object.assign(process.env, GIT_ENV);
    delete process.env.WOW_ADDONS_ROOT;
    delete process.env.HARNESS_ROOT;
    delete process.env.CLAUDE_CODE_SESSION_ID;
    delete process.env.CI;
    tmp = realpathSync(mkdtempSync(join(tmpdir(), "family-test-")));
    process.env.HARNESS_EVENTS = join(tmp, "events.log");
  });
  afterAll(() => {
    for (const [k, v] of Object.entries(saved)) if (v === undefined) delete process.env[k];
    else process.env[k] = v;
    rmSync(tmp, { recursive: true, force: true });
  });
}

/** A family-shaped root (the real harness.toml and extensions, addon-kit/ and wow-data/) holding one repository with a commit. */
export function family(files: Record<string, string> = { "a.txt": "one\n" }) {
  const root = join(tmp, `family-${++n}`);
  mkdirSync(join(root, "addon-kit"), { recursive: true });
  mkdirSync(join(root, "wow-data"), { recursive: true });
  copyFileSync(join(KIT, "harness.family.toml"), join(root, "harness.toml"));
  for (const f of ["packet-extras.ts", "status-extras.ts"]) symlinkSync(join(KIT, f), join(root, "addon-kit", f));
  const repo = join(root, "repo");
  mkdirSync(repo);
  git(repo, "init", "-q", "-b", "main");
  for (const [f, text] of Object.entries(files)) {
    mkdirSync(join(repo, f, ".."), { recursive: true });
    writeFileSync(join(repo, f), text);
  }
  git(repo, "add", "-A");
  git(repo, "commit", "-q", "-m", "chore: first");
  if (!files["package.json"]) git(repo, "config", "harness.check", "true");
  return { root, repo };
}
