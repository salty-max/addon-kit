/**
 * Copies the kit into an addon (its committed copy, loaded into the addon's
 * own namespace), stamped with the kit's commit:
 *
 *   bun ~/code/addon-kit/sync.ts <addon folder>          write <folder>/Kit.lua
 *   bun ~/code/addon-kit/sync.ts --check <addon folder>  fail if the copy differs
 *
 * Each addon's package.json runs it as kit:sync (and kit:check). The copy is
 * the kit, word for word, under one stamp line: edit the kit, never the copy.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
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
    const dirty = execSync("git status --porcelain Kit.lua", { cwd: KIT }).toString().trim() !== "";
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
  writeFileSync(target, `-- addon-kit ${commit}: a copy (kit:sync); edit ~/code/addon-kit/Kit.lua instead\n${source}`);
  console.log(`✓ ${target}: kit ${commit}`);
}
