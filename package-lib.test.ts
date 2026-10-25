// The family's package (package-lib.ts) on a scratch addon: its TOCs checked,
// the folder and the zip made, and what it refuses (bun test).
import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const LIB = join(import.meta.dir, "package-lib.ts");
const made: string[] = [];
afterAll(() => {
  for (const d of made) rmSync(d, { recursive: true, force: true });
});

const toc = (iface: string, own: string) => `## Interface: ${iface}\n## Title: X\n## Version: 1.0.0\nCore.lua\n${own}\n`;
function scratch() {
  const root = mkdtempSync(join(tmpdir(), "package-"));
  made.push(root);
  const src = join(root, "addon", "X");
  mkdirSync(src, { recursive: true });
  writeFileSync(join(src, "X_Vanilla.toc"), toc("11509", "Data_Classic.lua"));
  writeFileSync(join(src, "X_Camelot.toc"), toc("16001", "Data_Forever.lua"));
  for (const f of ["Core.lua", "Data_Classic.lua", "Data_Forever.lua"]) writeFileSync(join(src, f), "-- x\n");
  const git = (...a: string[]) => Bun.spawnSync(["git", "-c", "user.name=t", "-c", "user.email=t@t", ...a], { cwd: root });
  git("init", "-q");
  git("add", "-A");
  git("commit", "-q", "-m", "x");
  writeFileSync(
    join(root, "go.ts"),
    `import { run } from ${JSON.stringify(LIB)};\nrun({ root: ${JSON.stringify(root)}, name: "X", games: { classic: ["Data_Classic.lua"], forever: ["Data_Forever.lua"] } });\n`,
  );
  const go = (...args: string[]) => {
    const r = Bun.spawnSync(["bun", join(root, "go.ts"), ...args], { cwd: root, stdout: "pipe", stderr: "pipe" });
    return { code: r.exitCode, out: r.stdout.toString() + r.stderr.toString() };
  };
  return { root, src, go, git };
}

describe("the package", () => {
  test("the TOCs checked, then the folder and the zip", () => {
    const s = scratch();
    const c = s.go("--check");
    expect(c.out).toContain("✓ X_Vanilla.toc, X_Camelot.toc");
    expect(c.code).toBe(0);
    const r = s.go();
    expect(r.code).toBe(0);
    expect(existsSync(join(s.root, "dist", "X", "Data_Forever.lua"))).toBe(true);
    expect(r.out).toMatch(/dist\/X-[0-9a-f]+\.zip/);
  });
  test("a game's interface not first, a TOC no game names, a loaded file git leaves out: refused", () => {
    const s = scratch();
    writeFileSync(join(s.src, "X_Camelot.toc"), toc("11509", "Data_Forever.lua"));
    expect(s.go("--check").out).toContain('X_Camelot.toc: not "## Interface: 16001" first');
    writeFileSync(join(s.src, "X_Camelot.toc"), toc("16001", "Data_Forever.lua"));
    writeFileSync(join(s.src, "X_TBC.toc"), toc("20506", "Data_Classic.lua"));
    expect(s.go("--check").out).toContain("X_TBC.toc: a TOC no game of package.ts names");
    rmSync(join(s.src, "X_TBC.toc"));
    writeFileSync(join(s.root, ".gitignore"), "Data_Forever.lua\n");
    s.git("rm", "-q", "--cached", "addon/X/Data_Forever.lua");
    const r = s.go("--check");
    expect(r.code).toBe(1);
    expect(r.out).toContain("Data_Forever.lua: a TOC loads it, but git doesn't carry it");
  });
  test("the TOCs differing in more than their own files: refused", () => {
    const s = scratch();
    writeFileSync(join(s.src, "Extra.lua"), "-- x\n");
    writeFileSync(join(s.src, "X_Camelot.toc"), toc("16001", "Data_Forever.lua\nExtra.lua"));
    expect(s.go("--check").out).toContain("differ in more than the interface and their own files");
  });
});
