/**
 * The family's package, one way for every addon: addon/<Name> as it is, one
 * zip for every game, each game loading its own TOC (<Name>_Vanilla.toc:
 * Classic Era; _TBC.toc: TBC Anniversary; _Camelot.toc: World of Warcraft:
 * Forever). The BigWigs packager makes the release's (.pkgmeta,
 * .github/workflows/release.yml); this one is for a test in the game before a
 * release, and checks the TOCs: each game's interface first, the same header
 * and files but for the interface and each game's own files, every one of
 * them there and carried by git, every Lua file of the folder loaded.
 *
 * Each addon's scripts/package.ts names its games and their own files:
 *   import { run } from "./package-lib";
 *   run({ root: join(import.meta.dir, ".."), name: "Goodwill",
 *     games: { classic: ["Factions_Classic.lua"], forever: ["Factions_Forever.lua"] } });
 * and a folder shipped beside it (Yonder's handover) through `also`.
 *
 *   bun scripts/package.ts           dist/<Name> and dist/<Name>-<version>.zip
 *   bun scripts/package.ts --no-zip  the folder only (to copy into a game)
 *   bun scripts/package.ts --check   the TOCs only
 *
 * A copy in each addon's scripts/ (kit:sync), since CI runs --check without
 * the family folder: a game's new interface is changed here, once.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";

// Each game's TOC suffix and interface (preflight.ts checks them against
// wow-data's pins).
export const GAMES = {
  classic: { suffix: "Vanilla", interface: "11509" },
  tbc: { suffix: "TBC", interface: "20506" },
  forever: { suffix: "Camelot", interface: "16001" },
} as const;
export type Game = keyof typeof GAMES;

// (the client's own language file: Text_[TextLocale].lua, one per language)
const LOCALES = ["enUS", "enGB", "deDE", "frFR", "esES", "esMX", "ruRU", "ptBR", "itIT", "koKR", "zhCN", "zhTW"];

export type Toc = { game: Game; toc: string; interface: string; own: string[] };
export type Also = {
  // a folder of addon/, shipped beside the addon's, its files those listed
  folder: string;
  files: string[];
  // its own checks, after the addon's (fail ends the run)
  check: (o: { src: string; root: string; tocs: Toc[]; version?: string; fail: (why: string) => never }) => void;
};

export const fail = (why: string): never => {
  console.error(`✗ ${why}`);
  process.exit(1);
};

const lines = (text: string) => text.split("\n").filter((l) => l.trim() && !l.startsWith("#"));
export const versionOf = (toc: string) => toc.match(/^## Version: (.+)$/m)?.[1];

export function run(o: {
  root: string;
  name: string;
  // each game shipped, the files only it loads (an empty list: none)
  games: Partial<Record<Game, string[]>>;
  also?: Also;
  args?: string[];
}) {
  const args = o.args ?? process.argv.slice(2);
  const SRC = join(o.root, "addon", o.name);
  const DIST = join(o.root, "dist");
  const tocs: Toc[] = (Object.keys(GAMES) as Game[])
    .filter((g) => o.games[g])
    .map((g) => ({ game: g, toc: `${o.name}_${GAMES[g].suffix}.toc`, interface: GAMES[g].interface, own: o.games[g]! }));
  if (tocs.length === 0) fail("no game to package");

  // The TOCs agree.
  const shared = (t: Toc) =>
    readFileSync(join(SRC, t.toc), "utf8")
      .split("\n")
      .filter((l) => !l.startsWith("#") || l.startsWith("## "))
      .filter((l) => !l.startsWith("## Interface:") && !t.own.includes(l.trim()));
  const loaded = new Set<string>();
  for (const t of tocs) {
    if (!existsSync(join(SRC, t.toc))) fail(`${t.toc}: none`);
    const toc = readFileSync(join(SRC, t.toc), "utf8");
    if (!toc.startsWith(`## Interface: ${t.interface}\n`)) fail(`${t.toc}: not "## Interface: ${t.interface}" first`);
    const files = lines(toc);
    for (const f of files) {
      const each = f.includes("[TextLocale]") ? LOCALES.map((l) => f.replace("[TextLocale]", l)) : [f];
      for (const one of each) {
        if (!existsSync(join(SRC, one))) fail(`${t.toc} loads ${one}, which isn't there`);
        loaded.add(one);
      }
    }
    for (const f of t.own) if (!files.includes(f)) fail(`${t.toc} doesn't load ${f}, its own`);
    if (shared(t).join("\n") !== shared(tocs[0]).join("\n"))
      fail(`${t.toc} and ${tocs[0].toc} differ in more than the interface and their own files`);
  }
  // (no other TOC of the addon's: a game not listed here would ship unchecked)
  for (const f of readdirSync(SRC))
    if (f.endsWith(".toc") && !tocs.some((t) => t.toc === f)) fail(`${f}: a TOC no game of package.ts names`);

  // The folder's files: those in git (what a release ships: the packager
  // leaves the others out), and those not added yet, said so (a test before
  // a commit).
  const ls = (...opts: string[]) =>
    spawnSync("git", ["ls-files", "-z", ...opts, "--", `addon/${o.name}`], { cwd: o.root, encoding: "utf8" })
      .stdout.split("\0")
      .filter(Boolean)
      .map((f) => f.slice(`addon/${o.name}/`.length));
  const added = ls("--others", "--exclude-standard");
  const files = [...ls(), ...added].filter((f) => existsSync(join(SRC, f)));
  for (const f of added) console.warn(`! ${f}: not in git yet (a release would leave it out)`);
  for (const f of files) if (f.endsWith(".lua") && !f.includes("/") && !loaded.has(f)) fail(`${f}: no TOC loads it`);
  // (a file a TOC loads that git doesn't carry, ignored: the package would leave it out)
  for (const f of loaded)
    if (!files.includes(f)) fail(`${f}: a TOC loads it, but git doesn't carry it (ignored?): the package would leave it out`);

  // The release's package (the BigWigs packager, .pkgmeta) carries every
  // file of the repository its ignore list doesn't name, dotfiles aside: each
  // root path but addon/, and each of addon/ but the folders shipped, must be
  // on it (else CI's diff of the package against the folder fails, and the
  // release with it).
  const pkgmeta = join(o.root, ".pkgmeta");
  if (existsSync(pkgmeta)) {
    const ignored = new Set<string>();
    let inIgnore = false;
    for (const line of readFileSync(pkgmeta, "utf8").split("\n")) {
      if (/^\S/.test(line)) inIgnore = /^ignore:\s*$/.test(line);
      const item = inIgnore && line.match(/^\s+-\s+(.+?)\s*$/);
      if (item) ignored.add(item[1].replace(/\/$/, ""));
    }
    const shipped = new Set([`addon/${o.name}`, ...(o.also ? [`addon/${o.also.folder}`] : [])]);
    const tracked = spawnSync("git", ["ls-files", "-z"], { cwd: o.root, encoding: "utf8" }).stdout.split("\0").filter(Boolean);
    const carried = new Set<string>();
    for (const f of tracked) {
      const parts = f.split("/");
      if (parts.some((part) => part.startsWith("."))) continue; // (the packager leaves dotfiles out, anywhere)
      const top = parts[0] === "addon" && parts.length > 2 ? `addon/${parts[1]}` : parts[0] === "addon" ? f : parts[0];
      if (top !== "addon" && !shipped.has(top)) carried.add(top);
    }
    const stray = [...carried].filter((f) => !ignored.has(f)).sort();
    if (stray.length) fail(`.pkgmeta's ignore list lacks ${stray.join(", ")}: the release's package would carry it`);
  }

  const version = versionOf(readFileSync(join(SRC, tocs[0].toc), "utf8"));
  if (o.also) o.also.check({ src: join(o.root, "addon", o.also.folder), root: o.root, tocs, version, fail });
  const listed = tocs.map((t) => t.toc).join(", ") + (o.also ? `; ${o.also.folder}` : "");
  if (args.includes("--check")) {
    console.log(`✓ ${listed}`);
    return;
  }

  const folders = [o.name, ...(o.also ? [o.also.folder] : [])];
  const dir = join(DIST, o.name);
  rmSync(dir, { recursive: true, force: true });
  for (const f of files) {
    mkdirSync(dirname(join(dir, f)), { recursive: true });
    cpSync(join(SRC, f), join(dir, f));
  }
  if (o.also) {
    const adir = join(DIST, o.also.folder);
    rmSync(adir, { recursive: true, force: true });
    mkdirSync(adir, { recursive: true });
    for (const f of o.also.files) cpSync(join(o.root, "addon", o.also.folder, f), join(adir, f));
  }
  let out = folders.map((f) => `dist/${f}`).join(", ");
  if (!args.includes("--no-zip")) {
    // (its version in its name, as the release's: the tag, or for a build
    // between two, git's account of it, v0.7.3-2-g7406ae1, -dirty if changed)
    const described = spawnSync("git", ["describe", "--tags", "--always", "--dirty"], { cwd: o.root, encoding: "utf8" });
    const tag = described.status === 0 ? described.stdout.trim() : "dev";
    const zipName = `${o.name}-${tag}.zip`;
    for (const f of readdirSync(DIST)) if (f.startsWith(o.name) && f.endsWith(".zip")) rmSync(join(DIST, f));
    const r = spawnSync("zip", ["-qr", join(DIST, zipName), ...folders], { cwd: DIST, stdio: "inherit" });
    if (r.status !== 0) fail("zip failed");
    out += `, dist/${zipName}`;
  }
  console.log(`✓ ${out} (${tocs.map((t) => `${t.toc} ${t.interface}`).join(", ")})`);
}
