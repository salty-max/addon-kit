/**
 * The family's languages, one core: each addon's scripts/locales.ts (its own
 * names, pages, chapters, letters) is built on it. A copy of addon-kit's in
 * the addon's scripts/ (kit:sync), so CI, which has no family folder, runs it
 * as it is.
 *
 *   i18n/<locale>/meta.json    { "plural": "one" | "fr" | "ru" | "none",
 *                              "decimal": ",", "flagged": true }
 *   i18n/<locale>/words.json   { "English": "translation" }: the addon's own
 *                              words, every L["..."] and plural(n, "one",
 *                              "many") of its files; i18n/words.json lists them
 *   i18n/kit/<locale>.json     the kit's own words (its welcome, its board,
 *                              its days), translated once for every addon in
 *                              addon-kit/i18n/ and copied here by kit:sync:
 *                              one reading in every addon, the kit's winning
 *
 * A language without its own folder may borrow another's (esMX: esES), its
 * own meta.json over the borrowed one's (esMX's decimal point).
 *
 * The checks, every addon's: a word without its translation, a sentence's
 * blanks dropped, changed or doubled (numbered ones, %1$s, may move), a
 * stray %, a semicolon in what players read (the gender token's own aside),
 * a word no longer used (said), i18n/words.json not the addon's words, a
 * Text file out of date, a kit word the kit's translations lack.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

export const LOCALES = ["enUS", "enGB", "deDE", "frFR", "esES", "esMX", "ruRU", "ptBR", "itIT", "koKR", "zhCN", "zhTW"];
export const ENGLISH = new Set(["enUS", "enGB"]);
export const BORROWS: Record<string, string> = { esMX: "esES" };
export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const PLURALS = ["one", "fr", "ru", "none"];

/** A string as Lua writes it. */
export const q = (s: string) => `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n")}"`;
/** A JSON file, or what stands for it when there is none. */
export const json = <T = Record<string, any>>(file: string, empty = {} as T): T => (existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : empty);
const unq = (s: string) => s.replace(/\\(["\\n])/g, (_, c) => (c === "n" ? "\n" : c));

/** The words of Lua source: every L["..."] (spaces inside the brackets too), both forms of a plural(n, "one", "many") (n a call too). */
export function wordsIn(src: string, into = new Set<string>()): Set<string> {
  for (const m of src.matchAll(/\bL\[\s*"((?:[^"\\]|\\.)*)"\s*\]/g)) into.add(unq(m[1]));
  for (const m of src.matchAll(/plural\([^,()]+(?:\([^()]*\))?,\s*"((?:[^"\\]|\\.)*)",\s*"((?:[^"\\]|\\.)*)"\s*\)/g)) {
    into.add(unq(m[1]));
    into.add(unq(m[2]));
  }
  return into;
}
/** The addon's own words: its Lua files' (the kit's copy and the generated files aside: skip). */
export function ownKeys(addon: string, skip = /^Text_/, more: string[] = []): string[] {
  const found = new Set<string>(more);
  for (const f of readdirSync(addon).sort()) {
    if (!f.endsWith(".lua") || f === "Kit.lua" || skip.test(f) || /^Text_/.test(f)) continue;
    wordsIn(readFileSync(join(addon, f), "utf8"), found);
  }
  return [...found].sort();
}
/** The kit's own words: its copy's beside the addon's files, the months (K.day), its sounds' names (K.SOUNDS). */
export function kitKeys(addon: string): string[] {
  const file = join(addon, "Kit.lua");
  if (!existsSync(file)) return [];
  const src = readFileSync(file, "utf8");
  const found = wordsIn(src, new Set(MONTHS));
  for (const m of src.matchAll(/\{ -?\d+, "([^"]+)" \}/g)) found.add(m[1]);
  return [...found].sort();
}
/** The kit's translations a language has (i18n/kit/<locale>.json; a borrowing language its lender's). */
export function kitWords(i18n: string, locale: string, borrows = BORROWS): Record<string, string> {
  const own = join(i18n, "kit", `${locale}.json`);
  if (existsSync(own)) return json(own);
  return borrows[locale] ? json(join(i18n, "kit", `${borrows[locale]}.json`)) : {};
}

/** A sentence's blanks, as each argument's place and kind: numbered blanks may move, never change or go. */
export function formatArgs(s: string): string[] {
  let next = 0;
  return [...s.matchAll(/%%|%(?:(\d+)\$)?(0?\d*(?:\.\d+)?[sdfi])/g)]
    .filter(([token]) => token !== "%%")
    .map(([, index, spec]) => `${index ? Number(index) : ++next}:${spec.slice(-1)}`)
    .sort();
}
const semicolon = (s: string) => s.replace(/\$g[^:;]*:[^;]*;/g, "").includes(";");

/** What is wrong with a language's words against the English: missing ones, blanks, stray %, semicolons; and the unused. */
export function problems(words: Record<string, string>, keys: string[]): { missing: string[]; unused: string[]; errors: string[] } {
  const known = new Set(keys);
  const errors: string[] = [];
  for (const [english, word] of Object.entries(words)) {
    if (!word) continue;
    const want = formatArgs(english);
    const stray = word.replace(/%%|%(?:\d+\$)?0?\d*(?:\.\d+)?[sdfi]/g, "").includes("%");
    if (want.join() !== formatArgs(word).join() || stray) errors.push(`the blanks differ: ${JSON.stringify(english)} → ${JSON.stringify(word)}`);
    if (semicolon(word)) errors.push(`a semicolon in what players read: ${JSON.stringify(word)}`);
  }
  return { missing: keys.filter((k) => !words[k]), unused: Object.keys(words).filter((k) => !known.has(k)), errors };
}

/** The language's words handed to the addon: ns.translate({ locale, plural, decimal, words }), the kit's and the addon's. */
export function translateLua(locale: string, meta: { plural?: string; decimal?: string }, words: Record<string, string>, more: string[] = []): string[] {
  const lines = ["ns.translate({", `  locale = ${q(locale)},`, `  plural = ${q(meta.plural ?? "one")},`];
  if (meta.decimal) lines.push(`  decimal = ${q(meta.decimal)},`);
  lines.push("  words = {");
  for (const [k, v] of Object.entries(words)
    .filter(([, v]) => v)
    .sort(([a], [b]) => a.localeCompare(b)))
    lines.push(`    [${q(k)}] = ${q(v)},`);
  lines.push("  },", ...more, "})");
  return lines;
}

export type Options = {
  /** the repository (scripts/..) */
  root: string;
  /** the addon's folder, from the root ("addon/Goodwill") */
  addon: string;
  /** Lua files read for no words beside Text_ (generated tables: /^(Text|Creatures)_/) */
  skip?: RegExp;
  /** words the files name another way (a shelf's short name read through L by its id) */
  extraKeys?: string[];
  /** the Lua after the words (the game's names in the language) */
  names?: (locale: string) => string[];
  borrows?: Record<string, string>;
};

/** A simple addon's languages whole: bun scripts/locales.ts [--check | --keys]. Exits 1 on a problem. */
export function run(o: Options, args = process.argv.slice(2)): void {
  const i18n = join(o.root, "i18n");
  const addon = join(o.root, o.addon);
  const borrows = o.borrows ?? BORROWS;
  const own = ownKeys(addon, o.skip, o.extraKeys);
  const kit = kitKeys(addon);
  const kitSet = new Set(kit);
  const mine = own.filter((k) => !kitSet.has(k));
  if (args.includes("--keys")) {
    writeFileSync(join(i18n, "words.json"), `${JSON.stringify(Object.fromEntries(mine.map((k) => [k, ""])), null, 2)}\n`);
    console.log(`✓ i18n/words.json: ${mine.length} words to translate (the kit's ${kit.length} its own)`);
    return;
  }
  const check = args.includes("--check");
  let bad = false;
  const fail = (msg: string) => {
    console.error(`✗ ${msg}`);
    bad = true;
  };
  if (Object.keys(json(join(i18n, "words.json"))).join("\n") !== mine.join("\n")) fail("i18n/words.json is not the addon's words: bun scripts/locales.ts --keys");
  const translated = (l: string) => existsSync(join(i18n, l, "words.json"));
  for (const locale of LOCALES) {
    const from = translated(locale) ? locale : borrows[locale] && translated(borrows[locale]) ? borrows[locale] : null;
    const lines = ["-- Generated by scripts/locales.ts from i18n/: edit those, not this file.", "local _, ns = ..."];
    if (ENGLISH.has(locale) || !from) {
      lines.push(`-- (${ENGLISH.has(locale) ? "English: the words as the addon writes them" : "no translation yet: English words"})`);
    } else {
      const meta = { ...json(join(i18n, from, "meta.json")), ...json(join(i18n, locale, "meta.json")) };
      if (meta.plural && !PLURALS.includes(meta.plural)) fail(`i18n/${from}/meta.json: plural is one of ${PLURALS.join(", ")}`);
      const words: Record<string, string> = json(join(i18n, from, "words.json"));
      const kw = kitWords(i18n, from, borrows);
      const ours = Object.fromEntries(Object.entries(words).filter(([k]) => !kitSet.has(k)));
      lines.push(...translateLua(locale, meta, { ...ours, ...Object.fromEntries(kit.map((k) => [k, kw[k]])) }));
    }
    lines.push(...(o.names ? o.names(locale) : []));
    const lua = `${lines.join("\n")}\n`;
    const out = join(addon, `Text_${locale}.lua`);
    if ((existsSync(out) ? readFileSync(out, "utf8") : "") !== lua) {
      if (check) fail(`${relative(o.root, out)} is out of date: bun scripts/locales.ts`);
      else writeFileSync(out, lua);
    }
    if (!translated(locale)) continue;
    const words: Record<string, string> = json(join(i18n, locale, "words.json"));
    const meta = json(join(i18n, locale, "meta.json"));
    const { missing, unused, errors } = problems(words, mine);
    const kw = kitWords(i18n, locale, borrows);
    const kitMissing = kit.filter((k) => !kw[k]);
    const { errors: kitErrors } = problems(kw, kit);
    console.log(`${locale}: ${mine.length - missing.length}/${mine.length} words, the kit's ${kit.length - kitMissing.length}/${kit.length}${meta.flagged ? ", flagged" : ""}`);
    if (missing.length) fail(`${locale}: no translation for ${missing.map((m) => JSON.stringify(m)).join(", ")}`);
    if (kitMissing.length) fail(`${locale}: the kit's i18n/kit/${locale}.json lacks ${kitMissing.map((m) => JSON.stringify(m)).join(", ")} (translate them in addon-kit/i18n, then kit:sync)`);
    for (const e of [...errors, ...kitErrors]) fail(`${locale}: ${e}`);
    const kitInMine = unused.filter((k) => kitSet.has(k));
    if (kitInMine.length) console.log(`  the kit's own, its translation used: ${kitInMine.join(" | ")} (bun scripts/locales.ts --keys, and out of words.json)`);
    const gone = unused.filter((k) => !kitSet.has(k));
    if (gone.length) console.log(`  words no longer used: ${gone.join(" | ")}`);
  }
  for (const k of own) if (semicolon(k)) fail(`a semicolon in what players read: ${JSON.stringify(k)}`);
  if (bad) process.exit(1);
  console.log(`✓ ${mine.length} words and the kit's ${kit.length}, ${LOCALES.length} language files`);
}
