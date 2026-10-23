/**
 * Copies the kit into an addon (its committed copy, loaded into the addon's
 * own namespace), stamped with the kit's commit that last changed what it
 * copies:
 *
 *   bun ../addon-kit/sync.ts <addon folder>            write <folder>/Kit.lua (and the rest)
 *   bun ../addon-kit/sync.ts --dirty <addon folder>    a trial copy of uncommitted kit code ("<sha>+")
 *   bun ../addon-kit/sync.ts --check <addon folder>    fail if a copy isn't the kit's at its stamp
 *   bun ../addon-kit/sync.ts --scripts <addon folder>  the scripts' copies alone (an addon without the
 *                                                      kit's Lua: Keyring), --check beside it the same
 *
 * (run from an addon's repository or a worktree of it: the kit is the
 * family folder's, ~/code/wow-addons)
 *
 * Each addon's package.json runs it as kit:sync (and kit:check). The copy is
 * the kit, word for word, under one stamp line: edit the kit, never the copy.
 * The kit's pictures (Media/: the ring a round picture wears) go beside the
 * addon's own in its Media folder, checked the same way; one the kit dropped
 * since the last sync leaves the addon's folder too.
 *
 * The family folder's finders go into the repository's scripts/ the same
 * way: root.ts as scripts/root.ts, and root.py as scripts/root.py when a
 * Python script is there; the languages' core (locales-lib.ts) beside the
 * addon's scripts/locales.ts. The kit's words, translated once
 * (addon-kit/i18n/<locale>.json), go into the addon's i18n/kit/. The scripts reach addon-kit and wow-data through
 * them (`familyPath("wow-data", "src", "db.ts")`, `bun scripts/root.ts --run
 * addon-kit/sync.ts`), so a worktree outside ~/code/wow-addons finds them. A
 * root.py left behind once the last Python script went fails the check.
 *
 * The stamp is the last commit of the kit's that touched what is copied
 * (Kit.lua, Media/, root.ts, root.py, locales-lib.ts, i18n/): a commit of the harness alone moves
 * no stamp. The sync refuses uncommitted kit code (--dirty: a trial, its
 * stamp "+", which the check and preflight refuse). The check compares each
 * copy with the kit at its stamp (a hand edit, a stamp made up, fail), then
 * the stamp with the kit's newest: behind it, the copy is stale (CI only
 * says so: an addon's daily job never fails between a kit push and the
 * addon's sync; the check before a push or a release stops it).
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const KIT = new URL(".", import.meta.url).pathname;
const COPIED = ["Kit.lua", "Media", "root.ts", "root.py", "locales-lib.ts", "i18n"];

function git(...args: string[]): string | undefined {
  const p = Bun.spawnSync(["git", ...args], { cwd: KIT, stderr: "ignore" });
  return p.exitCode === 0 ? p.stdout.toString() : undefined;
}
/** The kit's last commit touching what is copied (committed: the working files aside). */
export const kitStamp = () => git("log", "-1", "--format=%h", "--", ...COPIED)?.trim() || "unversioned";
/** Whether what is copied differs from the kit's last commit. */
export const kitDirty = () => (git("status", "--porcelain", "--", ...COPIED) ?? "").trim() !== "";
/** A file of the kit as its commit holds it (undefined: no such commit here, a shallow clone, say). */
const atStamp = (sha: string, file: string) => {
  const p = Bun.spawnSync(["git", "show", `${sha}:${file}`], { cwd: KIT, stderr: "ignore" });
  return p.exitCode === 0 ? Buffer.from(p.stdout) : undefined;
};
/** The kit's pictures at a commit (a stamp's, to tell what it dropped since). */
const mediaAt = (sha: string) =>
  (git("ls-tree", "--name-only", `${sha}:Media`) ?? "")
    .split("\n")
    .filter((f) => f && !f.startsWith("."));

if (import.meta.main) {
  const args = process.argv.slice(2);
  const check = args.includes("--check");
  const folder = args.find((a) => !a.startsWith("--"));
  if (!folder || !existsSync(folder)) {
    console.error("usage: bun sync.ts [--check | --dirty] <addon folder>");
    process.exit(2);
  }
  const inCI = !!process.env.CI;
  const fail = (msg: string) => {
    console.error(msg);
    process.exit(1);
  };
  const scriptsOnly = args.includes("--scripts");
  const target = join(folder, "Kit.lua");
  const stampOf = (text: string, mark: string) => text.match(new RegExp(`^${mark} addon-kit ([0-9a-f]+\\+?|unversioned)`))?.[1];
  const body = (text: string, mark: string) => text.replace(new RegExp(`^${mark} addon-kit .*\n`), "");
  const newest = kitStamp();

  // A copy against the kit at its stamp: the kit's working file where the
  // stamp's commit isn't here (a shallow clone in CI), said so.
  const verify = (copy: string, stamp: string | undefined, file: string, mark: string) => {
    if (!stamp) return fail(`${copy}: no stamp line (run kit:sync)`);
    if (stamp.endsWith("+")) return fail(`${copy}: a trial copy of uncommitted kit code (${stamp}): commit the kit, then kit:sync`);
    const was = atStamp(stamp, file);
    const text = body(readFileSync(copy, "utf8"), mark);
    if (was === undefined) {
      if (text !== readFileSync(join(KIT, file), "utf8")) return fail(`${copy}: not the kit's (its stamp ${stamp} isn't in this clone of the kit, nor is it today's kit)`);
      console.log(`✓ ${copy}: the kit's (${stamp} not in this clone, today's kit compared)`);
    } else if (text !== was.toString()) {
      return fail(`${copy}: not the kit's at ${stamp} (run kit:sync, or edit the kit, not the copy)`);
    }
    if (stamp !== newest && newest !== "unversioned") {
      const msg = `${copy}: stale, the kit's ${stamp}, the kit is at ${newest} (run kit:sync)`;
      if (inCI) console.log(`note: ${msg}`);
      else fail(msg);
    } else console.log(`✓ ${copy}: the kit's ${stamp}`);
  };

  const dirty = kitDirty();
  if (!check && dirty && !args.includes("--dirty"))
    fail(`the kit has uncommitted changes to what it copies (${COPIED.join(", ")}): commit them first, or --dirty for a trial copy`);
  const commit = dirty && !check ? `${newest}+` : newest;

  const before = existsSync(target) ? stampOf(readFileSync(target, "utf8"), "--") : undefined;
  if (scriptsOnly) {
    // (no Lua of the kit's here: the scripts' copies alone, below)
  } else if (check) {
    if (!existsSync(target)) fail(`${target}: none (run kit:sync)`);
    verify(target, stampOf(readFileSync(target, "utf8"), "--"), "Kit.lua", "--");
  } else {
    const source = readFileSync(join(KIT, "Kit.lua"), "utf8");
    writeFileSync(target, `-- addon-kit ${commit}: a copy (kit:sync); edit the addon-kit repository's Kit.lua instead\n${source}`);
    console.log(`✓ ${target}: kit ${commit}`);
  }

  const media = join(KIT, "Media");
  const pictures = scriptsOnly ? [] : existsSync(media) ? readdirSync(media).filter((f) => !f.startsWith(".")) : [];
  const stamp = check && !scriptsOnly ? stampOf(readFileSync(target, "utf8"), "--") : undefined;
  for (const name of pictures) {
    const to = join(folder, "Media", name);
    if (check) {
      const was = stamp && !stamp.endsWith("+") ? atStamp(stamp, `Media/${name}`) : undefined;
      const want = was ?? readFileSync(join(media, name));
      if (!existsSync(to) || !readFileSync(to).equals(want)) fail(`${to}: not the kit's (run kit:sync)`);
    } else {
      mkdirSync(join(folder, "Media"), { recursive: true });
      copyFileSync(join(media, name), to);
      console.log(`✓ ${to}: the kit's`);
    }
  }
  // (a picture the kit had at the last sync and has no more: out of the addon's folder too)
  if (!check && before && !before.endsWith("+") && before !== "unversioned")
    for (const gone of mediaAt(before).filter((f) => !pictures.includes(f))) {
      const at = join(folder, "Media", gone);
      if (existsSync(at)) {
        rmSync(at);
        console.log(`✓ ${at}: gone, as from the kit`);
      }
    }

  // The kit's words, translated once, in the addon's i18n/kit/ (where it has
  // an i18n/ and the kit's Lua), checked against the kit's at the stamp.
  const words = join(KIT, "i18n");
  if (!scriptsOnly && existsSync("i18n") && existsSync(words)) {
    const files = readdirSync(words).filter((f) => f.endsWith(".json"));
    for (const name of files) {
      const to = join("i18n", "kit", name);
      if (check) {
        const was = stamp && !stamp.endsWith("+") ? atStamp(stamp, `i18n/${name}`) : undefined;
        const want = was ?? readFileSync(join(words, name));
        if (!existsSync(to) || !readFileSync(to).equals(want)) fail(`${to}: not the kit's words (run kit:sync)`);
      } else {
        mkdirSync(join("i18n", "kit"), { recursive: true });
        copyFileSync(join(words, name), to);
      }
    }
    if (!check) console.log(`✓ i18n/kit/: the kit's words, ${files.length} languages`);
  }

  // The finders of the family folder, in the repository's scripts/ (the
  // working directory's): root.ts always, root.py beside Python scripts,
  // the languages' core beside scripts/locales.ts.
  const scripts = "scripts";
  const finders: [string, string][] = [["root.ts", "//"]];
  if (existsSync(join(scripts, "locales.ts"))) finders.push(["locales-lib.ts", "//"]);
  if (existsSync(scripts) && readdirSync(scripts).some((f) => f.endsWith(".py") && f !== "root.py")) finders.push(["root.py", "#"]);
  if (check && existsSync(join(scripts, "root.py")) && !finders.some(([n]) => n === "root.py"))
    fail(`${join(scripts, "root.py")}: no Python script beside it any more (remove the copy)`);
  for (const [name, mark] of existsSync(scripts) ? finders : []) {
    const to = join(scripts, name);
    if (check) {
      if (!existsSync(to)) fail(`${to}: none (run kit:sync)`);
      verify(to, stampOf(readFileSync(to, "utf8"), mark), name, mark);
    } else {
      writeFileSync(to, `${mark} addon-kit ${commit}: a copy (kit:sync); edit the addon-kit repository's ${name} instead\n${readFileSync(join(KIT, name), "utf8")}`);
      console.log(`✓ ${to}: kit ${commit}`);
    }
  }
}
