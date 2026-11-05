/**
 * What Blizzard's own API documentation says about the calls an addon makes, for the strict game in its tests
 * (strict.lua, the kit's copy in addon/test/): a call the client would refuse fails the check with the function
 * and the argument, instead of the player's game. Run from an addon's repository:
 *
 *   bun scripts/root.ts --run addon-kit/apidocs.ts            write the tables
 *   bun scripts/root.ts --run addon-kit/apidocs.ts --check    fail if one is not up to date
 *
 * Writes, per game (classic, forever), beside the addon's tests:
 *   addon/test/api_<game>.lua       GENERATED: the documented functions of the namespaces the addon calls
 *                                   (C_Traits, C_Spell...), the global functions it calls, every widget method the
 *                                   documentation lists (frames, buttons, textures, font strings, tooltips), with
 *                                   argument names, types, nilable and the Secret flags
 *   addon/test/evidence_<game>.lua  GENERATED: for each method the addon calls that no documentation lists
 *                                   (GameTooltip:SetTalent is one), the argument counts Blizzard's own pinned Lua
 *                                   calls it with. A method with no call in the game's source is unknown there
 * What "the addon calls" is read from its own Lua: every .lua under addon/ except addon/test/, the generated
 * language and data files (Text_*, a file that says GENERATED in its first lines) and the games it names.
 *
 * The sources are wow-data's UI pins (bin/ui.ts), the Blizzard_APIDocumentationGenerated tables and the Lua
 * beside them. They say what Blizzard's files declare, not what the live client does: the strict game is a net
 * with known holes (addon-kit/docs/battery.md), not proof. The pins decide: a pin moved in wow-data/ui-pins.json
 * makes the tables stale, so the check (and `bun run check`) fails until they are written again.
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { familyPath } from "./root";

const CHECK = process.argv.includes("--check");
const KIT = import.meta.dir;
const ADDON = process.cwd();
const GAMES = ["classic", "forever"] as const;

// ── what the addon's own code calls (generated files, comments and the tests are not code)
function addonLua(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir).sort()) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) {
      if (e !== "test" && e !== "Media" && !e.startsWith(".")) addonLua(p, out);
    } else if (e.endsWith(".lua") && !/^Text_/.test(e)) {
      if (!/GENERATED/i.test(readFileSync(p, "utf8").split("\n", 4).join("\n"))) out.push(p);
    }
  }
  return out;
}
if (!existsSync(join(ADDON, "addon"))) throw new Error(`no addon/ folder in ${ADDON}: run this from an addon's repository`);
const own = addonLua(join(ADDON, "addon"))
  .map((f) => readFileSync(f, "utf8"))
  .join("\n")
  .replace(/--\[\[[\s\S]*?\]\]/g, "")
  .replace(/--[^\n]*/g, "");
const namespaces = new Set([...own.matchAll(/\b(C_[A-Za-z]+)\./g)].map((m) => m[1]!));
const globals = new Set([...own.matchAll(/(?<![.:\w])([A-Z][A-Za-z0-9]+)\(/g)].map((m) => m[1]!));
const methods = new Set([
  ...[...own.matchAll(/:([A-Z][A-Za-z0-9]*)\(/g)].map((m) => m[1]!),
  // (a method named but not called there: pcall(GameTooltip.SetTalent, GameTooltip, ...))
  ...[...own.matchAll(/\b\w*[Tt]ooltip\.([A-Z][A-Za-z0-9]*)\b(?!\s*=)/g)].map((m) => m[1]!),
]);
// (methods the addon or the kit defines itself: `function X:Name(`, `Name = function`)
const defined = new Set([
  ...[...own.matchAll(/function\s+[\w.]+[:.]([A-Z][A-Za-z0-9]*)\s*\(/g)].map((m) => m[1]!),
  ...[...own.matchAll(/\b([A-Z][A-Za-z0-9]*)\s*=\s*function/g)].map((m) => m[1]!),
]);

// ── Blizzard's call sites: the argument counts a method is called with
function luaFiles(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) luaFiles(p, out);
    else if (e.endsWith(".lua") && !/Documentation\.lua$/.test(e)) out.push(p);
  }
  return out;
}
// the arguments of the call whose "(" is at text[open]: top-level commas, strings and nesting skipped
function argCount(text: string, open: number): number | undefined {
  let depth = 0;
  let n = 0;
  let any = false;
  for (let i = open; i < text.length; i++) {
    const c = text[i]!;
    if (c === '"' || c === "'") {
      const q = c;
      for (i++; i < text.length && text[i] !== q; i++) if (text[i] === "\\") i++;
      any = true;
    } else if (c === "(" || c === "{" || c === "[") {
      depth++;
      if (depth > 1) any = true;
    } else if (c === ")" || c === "}" || c === "]") {
      depth--;
      if (depth === 0) return any ? n + 1 : 0;
    } else if (c === "," && depth === 1) n++;
    else if (depth >= 1 && !/\s/.test(c)) any = true;
    if (c === "\n" && i - open > 4000) return undefined;
  }
  return undefined;
}

function evidence(sourceDir: string, names: string[]): Record<string, { any: number[]; tooltip: number[]; sites: number }> {
  const files = luaFiles(join(sourceDir, "Interface", "AddOns")).map((f) => readFileSync(f, "utf8"));
  const out: Record<string, { any: Set<number>; tooltip: Set<number>; sites: number }> = {};
  for (const name of names) {
    const re = new RegExp(`([\\w.\\]\\[]*)[:.]${name}\\s*\\(`, "g");
    const e = { any: new Set<number>(), tooltip: new Set<number>(), sites: 0 };
    for (const text of files) {
      for (const m of text.matchAll(re)) {
        const n = argCount(text, m.index! + m[0].length - 1);
        if (n === undefined) continue;
        e.sites++;
        e.any.add(n);
        if (/ooltip/.test(m[1] ?? "")) e.tooltip.add(n);
      }
    }
    out[name] = e;
  }
  return Object.fromEntries(
    Object.entries(out).map(([k, v]) => [k, { any: [...v.any].sort((a, b) => a - b), tooltip: [...v.tooltip].sort((a, b) => a - b), sites: v.sites }]),
  );
}

// ── the run
const { uiSourceDir, sourcePin } = (await import(familyPath("wow-data", "src", "ui"))) as any;
let stale = false;
// What the tables depend on, hashed: the pin, what the addon calls, and these two scripts. A check that finds the
// same key in the tables skips the slow part (Blizzard's whole documentation, run and read again: about 25 seconds).
const scripts = readFileSync(join(KIT, "apidocs.ts"), "utf8") + readFileSync(join(KIT, "apidocs-dump.lua"), "utf8");
for (const game of GAMES) {
  const pin = sourcePin(game);
  const api = join(ADDON, "addon", "test", `api_${game}.lua`);
  const evi = join(ADDON, "addon", "test", `evidence_${game}.lua`);
  const want = [...namespaces, ...globals, ...[...methods].map((m) => `m:${m}`)].sort().join(",");
  const key = new Bun.CryptoHasher("sha1")
    .update([pin.branch, pin.commit, pin.build, want, [...defined].sort().join(","), scripts].join("\n"))
    .digest("hex")
    .slice(0, 12);
  if (CHECK && existsSync(api) && existsSync(evi) && readFileSync(evi, "utf8").includes(`-- inputs ${key}\n`)) continue;
  const src = await uiSourceDir(game);
  const tmp = join(ADDON, ".cache", `api_${game}.lua`);
  Bun.spawnSync(["mkdir", "-p", join(ADDON, ".cache")]);
  const r = Bun.spawnSync(
    ["luajit", join(KIT, "apidocs-dump.lua"), join(src, "Interface", "AddOns", "Blizzard_APIDocumentationGenerated"), game, `${pin.branch}@${pin.commit.slice(0, 7)} ${pin.build}`, want, tmp],
    { stderr: "pipe" },
  );
  if (r.exitCode !== 0) throw new Error(`apidocs-dump.lua ${game}: ${r.stderr.toString()}`);
  const apiText = readFileSync(tmp, "utf8");
  // (the methods the documentation lists: any line of the methods block)
  const documented = new Set([...apiText.matchAll(/^ {4}\["([A-Za-z0-9]+)"\] = \{ \{ args/gm)].map((m) => m[1]!));
  const undocumented = [...methods].filter((m) => !documented.has(m) && !defined.has(m)).sort();
  const ev = evidence(src, undocumented);
  const lines = [
    `-- GENERATED by addon-kit/apidocs.ts from ${pin.branch}@${pin.commit.slice(0, 7)} (${pin.build}). Do not edit.`,
    "-- Methods the addon calls that no API documentation lists: the argument counts Blizzard's own Lua calls them with.",
    "-- sites 0 means the game's source never calls it: the strict game refuses it unless the allowlist (strict.lua) says why not.",
    `-- inputs ${key}`,
    "-- stylua: ignore start",
    "return {",
    ...undocumented.map((m) => {
      const e = ev[m]!;
      return `  ${m} = { sites = ${e.sites}, any = {${e.any.join(",")}}, tooltip = {${e.tooltip.join(",")}} },`;
    }),
    "}",
    "-- stylua: ignore end",
    "",
  ];
  for (const [file, text] of [[api, apiText], [evi, lines.join("\n")]] as const) {
    const have = existsSync(file) ? readFileSync(file, "utf8") : "";
    if (have === text) continue;
    if (CHECK) {
      console.error(`stale: ${file.replace(`${ADDON}/`, "")} (run: bun scripts/root.ts --run addon-kit/apidocs.ts)`);
      stale = true;
    } else writeFileSync(file, text);
  }
}
if (stale) process.exit(1);
console.log(CHECK ? "api docs up to date" : "api docs written");
