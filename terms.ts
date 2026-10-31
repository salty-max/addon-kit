/**
 * The family's terms, checked: terms.json (ideas/audit/en-fr-base.md section B)
 * against every addon's interface words (i18n/words.json and i18n/frFR/words.json,
 * the kit's own i18n/frFR.json for addon-kit) and the TOCs' Notes, plus the
 * rubric's A1 to A3 over the English keys and Q1's French typography.
 *
 *   bun addon-kit/terms.ts [repo…]   every addon with a store page by default
 *   bun addon-kit/terms.ts --strict  exit 1 if there is a warning
 *
 * WARNING MODE: it prints what it finds and exits 0 (preflight shows the count).
 * It becomes a failure, and moves into locales-lib.ts (a stamp wave), once the
 * English and French passes have cleaned every addon. The kit's own words are
 * held to it already: terms.test.ts fails on any warning about them.
 *
 * A term applies to an English key holding `en` as a whole word (a plural
 * allowed): the French must hold `frFR` or one of `frFR_forms` (any case) and
 * none of `avoid.frFR`. `avoid.en` is looked for in every English key. A term
 * with `repos` applies to those repositories only; `optional` asks no French
 * word, only the avoided ones. A slash command and the word after it, or a %s
 * blank and its word, are the command's own and are not read as the term; the
 * French may keep the English word there.
 * Not copied into the addons.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, isAbsolute, join, resolve } from "node:path";
import { readToc } from "./preflight";
import { familyRoot } from "./root";
import { addons } from "./store";

export type Term = {
  en: string;
  frFR: string;
  frFR_forms?: string[];
  avoid?: { en?: string[]; frFR?: string[] };
  /** only `avoid` is checked: the French needn't hold `frFR` (a word with another sense: a hide, to hide) */
  optional?: boolean;
  repos?: string[];
  source: string;
  note?: string;
};
export type Terms = {
  terms: Record<string, Term>;
  typography: { frFR: { nbspBefore: string[] } };
  english: { american: string[] };
};

export type Warning = { repo: string; where: string; rule: string; text: string };

const NBSP = " ";
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const lower = (s: string) => s.toLocaleLowerCase("fr");
/** The gender tokens ($gmasc:fem;) out: their semicolons are theirs. */
const withoutTokens = (s: string) => s.replace(/\$g[^:;]*:[^;]*;/g, "");

export function loadTerms(): Terms {
  return JSON.parse(readFileSync(join(import.meta.dir, "terms.json"), "utf8"));
}

const hasWord = (english: string, en: string) => new RegExp(`(?<![A-Za-z])${escape(en)}(?:s|es)?(?![A-Za-z])`, "i").test(english);

/** One English line and its French against the terms, the typography and the English rules. */
export function checkLine(repo: string, where: string, english: string, french: string | undefined, t: Terms): Warning[] {
  const out: Warning[] = [];
  const warn = (rule: string, text: string) => out.push({ repo, where, rule, text });
  // English: A1 to A3
  if (withoutTokens(english).includes(";")) warn("A1", `a semicolon: ${JSON.stringify(english)}`);
  if (/[^\x00-\x7f]/.test(english)) warn("A2", `not plain ASCII: ${JSON.stringify(english)}`);
  const american = english.match(new RegExp(`(?<![A-Za-z$%])(?:${t.english.american.join("|")})(?![A-Za-z])`));
  if (american) warn("A3", `American spelling "${american[0]}": ${JSON.stringify(english)}`);
  for (const [id, term] of Object.entries(t.terms)) {
    if (term.repos && !term.repos.includes(repo)) continue;
    for (const bad of term.avoid?.en ?? []) if (lower(english).includes(lower(bad))) warn(`term:${id}`, `English "${bad}" (say it as ${term.en}): ${JSON.stringify(english)}`);
  }
  if (french === undefined || french === "") return out;
  // French: the terms
  const fr = lower(french);
  // (a slash command and the word after it, or a %s blank and its word, are the command's own: /yonder settings)
  const spoken = english.replace(/(?:\/\w+|%\d?\$?s)(?: \w+)?/g, " ");
  for (const [id, term] of Object.entries(t.terms)) {
    if (term.repos && !term.repos.includes(repo)) continue;
    if (!hasWord(spoken, term.en)) continue;
    // (the French may keep the English word as a command's argument: "/x settings", "%s settings")
    const kept = new RegExp(`(?<![a-z])${escape(lower(term.en))}(?![a-z])`).test(fr);
    if (!term.optional && !kept && ![term.frFR, ...(term.frFR_forms ?? [])].some((f) => fr.includes(lower(f)))) warn(`term:${id}`, `${JSON.stringify(english)} → ${JSON.stringify(french)} lacks "${term.frFR}"`);
    for (const bad of term.avoid?.frFR ?? []) if (fr.includes(lower(bad))) warn(`term:${id}`, `${JSON.stringify(french)} says "${bad}" (the family's: ${term.frFR})`);
  }
  // (a game's own title keeps its colon: World of Warcraft: Forever)
  const frenchTyped = french.replace(/World of Warcraft: Forever/g, "");
  // French: Q1, a no-break space before : ? ! and %
  for (const mark of t.typography.frFR.nbspBefore) {
    const percent = mark === "%";
    // (a percent: %% in a format, or a figure then %; a plain or no space before it is the fault)
    const bad = percent
      ? /(?<!\u00a0)%%|\d[ ]?%(?![sdif%$\d])/
      : new RegExp(`(?<![ ${NBSP}/:])(?:[ ]|(?<=[\\p{L}\\d)%.]))${escape(mark)}(?=\\s|$)`, "u");
    if (bad.test(frenchTyped)) warn("typography", `no no-break space before "${mark}": ${JSON.stringify(french)}`);
  }
  return out;
}

const json = (file: string) => (existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as Record<string, string>) : undefined);

function tocs(dir: string): string[] {
  const base = join(dir, "addon");
  if (!existsSync(base)) return [];
  return readdirSync(base, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .flatMap((d) => readdirSync(join(base, d.name)).filter((f) => f.endsWith(".toc")).map((f) => join(base, d.name, f)));
}

/** A repository's warnings: its interface words, its TOCs' Notes. */
export function checkRepo(dir: string, t: Terms = loadTerms()): Warning[] {
  const repo = basename(dir);
  const out: Warning[] = [];
  const english = json(join(dir, "i18n", "words.json"));
  const french = json(join(dir, "i18n", "frFR", "words.json")) ?? json(join(dir, "i18n", "frFR.json"));
  const keys = english ? Object.keys(english) : Object.keys(french ?? {});
  for (const k of keys) out.push(...checkLine(repo, "words", k, french?.[k], t));
  const seen = new Set<string>();
  for (const file of tocs(dir)) {
    const notes = readToc(file, readFileSync(file, "utf8")).notes;
    const key = `${notes.enUS}|${notes.frFR}`;
    if (!notes.enUS || seen.has(key)) continue;
    seen.add(key);
    out.push(...checkLine(repo, `${basename(file)} Notes`, notes.enUS, notes.frFR, t));
  }
  return out;
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const named = args.filter((a) => !a.startsWith("--"));
  const root = familyRoot();
  const dirs = named.length ? named.map((a) => (isAbsolute(a) || a.startsWith(".") ? resolve(a) : join(root, a))) : [...addons(), join(root, "addon-kit")];
  const t = loadTerms();
  let total = 0;
  for (const dir of dirs) {
    const w = checkRepo(dir, t);
    total += w.length;
    console.log(`${basename(dir)}: ${w.length} warning${w.length === 1 ? "" : "s"}`);
    for (const x of w) console.log(`  [${x.rule}] ${x.where}: ${x.text}`);
  }
  console.log(`${total} warning${total === 1 ? "" : "s"} (warning mode: nothing fails)`);
  if (args.includes("--strict") && total) process.exit(1);
}
