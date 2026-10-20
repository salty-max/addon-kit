/**
 * Copies the kit into an addon (its committed copy, loaded into the addon's
 * own namespace), stamped with the kit's commit:
 *
 *   bun ../addon-kit/sync.ts <addon folder>          write <folder>/Kit.lua
 *   bun ../addon-kit/sync.ts --check <addon folder>  fail if the copy differs
 *
 * (run from an addon's repository or a worktree of it: the kit is the
 * family folder's, ~/code/wow-addons)
 *
 * Each addon's package.json runs it as kit:sync (and kit:check). The copy is
 * the kit, word for word, under one stamp line: edit the kit, never the copy.
 * The kit's pictures (Media/: the ring a round picture wears) go beside the
 * addon's own in its Media folder, checked the same way.
 *
 * The family folder's finders go into the repository's scripts/ the same
 * way: root.ts as scripts/root.ts, and root.py as scripts/root.py when a
 * Python script is there. The scripts reach addon-kit and wow-data through
 * them (`familyPath("wow-data", "src", "db.ts")`, `$(bun scripts/root.ts
 * addon-kit/sync.ts)`), so a worktree outside ~/code/wow-addons finds them.
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";

const KIT = new URL(".", import.meta.url).pathname;
const args = process.argv.slice(2);
const check = args.includes("--check");
const folder = args.find((a) => !a.startsWith("--"));
if (!folder || !existsSync(folder)) {
  console.error("usage: bun sync.ts [--check] <addon folder>");
  process.exit(2);
}
const source = readFileSync(join(KIT, "Kit.lua"), "utf8");
const commit = (() => {
  try {
    const sha = execSync("git rev-parse --short HEAD", { cwd: KIT }).toString().trim();
    const dirty = execSync("git status --porcelain Kit.lua Media root.ts root.py", { cwd: KIT }).toString().trim() !== "";
    return dirty ? `${sha}+` : sha;
  } catch {
    return "unversioned";
  }
})();
const target = join(folder, "Kit.lua");
const body = (text: string) => text.replace(/^-- addon-kit .*\n/, "");
if (check) {
  if (!existsSync(target) || body(readFileSync(target, "utf8")) !== source) {
    console.error(`${target}: not the kit's (run kit:sync, or edit the kit, not the copy)`);
    process.exit(1);
  }
  console.log(`✓ ${target}: the kit's`);
} else {
  writeFileSync(target, `-- addon-kit ${commit}: a copy (kit:sync); edit the addon-kit repository's Kit.lua instead\n${source}`);
  console.log(`✓ ${target}: kit ${commit}`);
}
const media = join(KIT, "Media");
for (const name of existsSync(media) ? readdirSync(media).filter((f) => !f.startsWith(".")) : []) {
  const from = join(media, name);
  const to = join(folder, "Media", name);
  if (check) {
    if (!existsSync(to) || !readFileSync(to).equals(readFileSync(from))) {
      console.error(`${to}: not the kit's (run kit:sync)`);
      process.exit(1);
    }
  } else {
    mkdirSync(join(folder, "Media"), { recursive: true });
    copyFileSync(from, to);
    console.log(`✓ ${to}: the kit's`);
  }
}

// The finders of the family folder, in the repository's scripts/ (the
// working directory's): root.ts always, root.py beside Python scripts.
const scripts = "scripts";
const finders: [string, string][] = [["root.ts", "//"]];
if (existsSync(scripts) && readdirSync(scripts).some((f) => f.endsWith(".py") && f !== "root.py")) finders.push(["root.py", "#"]);
for (const [name, mark] of existsSync(scripts) ? finders : []) {
  const from = readFileSync(join(KIT, name), "utf8");
  const to = join(scripts, name);
  const stamp = new RegExp(`^${mark} addon-kit .*\n`);
  if (check) {
    if (!existsSync(to) || readFileSync(to, "utf8").replace(stamp, "") !== from) {
      console.error(`${to}: not the kit's (run kit:sync, or edit the kit's ${name}, not the copy)`);
      process.exit(1);
    }
    console.log(`✓ ${to}: the kit's`);
  } else {
    writeFileSync(to, `${mark} addon-kit ${commit}: a copy (kit:sync); edit the addon-kit repository's ${name} instead\n${from}`);
    console.log(`✓ ${to}: kit ${commit}`);
  }
}
