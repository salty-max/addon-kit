/**
 * A game name is held once, in wow-data (the user's call, 26 October 2026):
 * an addon that reads another language's prose (esMX reads esES's) swaps its
 * own client's names in, and those names come from the databases, never from
 * a file of the addon's own. This writes the swap an addon's loaders read:
 *
 *   i18n/<locale>/regional.json            the addon's, by hand:
 *     { "names": [ "esES name", ... ],     game names, as the lender writes
 *                                          them: the borrower's comes from
 *                                          wow-data (the same name of every
 *                                          id, in either game, agreeing)
 *       "words": { "esES": "esMX" } }      what is no game name: prose words
 *                                          ("este ordenador"), a name with
 *                                          its article or an ending ("del
 *                                          Sindicato"), a form the addon's
 *                                          own translation wrote, a name the
 *                                          databases lack
 *   i18n/<locale>/regional.resolved.json   generated, { from: to } both
 *                                          together: what the loaders swap
 *
 *   bun scripts/root.ts --run addon-kit/regional.ts [--check|--migrate] [esMX]
 *   (from an addon; the language is esMX by default)
 *
 * It fails on a name no database gives (move it to words), one the
 * databases give two ways (words, saying which), one the borrower writes the
 * same (it does nothing), and a word that is a plain game name (move it to
 * names): so the same name never lives in two addons with two spellings.
 * --migrate: moves the words that are plain game names into names, once.
 * --check: the resolved file is stale (the daily job runs it again).
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type * as WowDb from "../wow-data/src/db";
import { familyPath } from "./root";

const { openDb } = (await import(familyPath("wow-data", "src", "db.ts"))) as typeof WowDb;
const LENDER: Record<string, string> = { esMX: "esES" };

const args = process.argv.slice(2);
const check = args.includes("--check");
const locale = args.find((a) => /^[a-z]{2}[A-Z]{2}$/.test(a)) ?? "esMX";
const lender = LENDER[locale];
if (!lender) throw new Error(`${locale} borrows no language's prose`);
const dir = join(process.cwd(), "i18n", locale);
const handFile = join(dir, "regional.json");
const outFile = join(dir, "regional.resolved.json");
if (!existsSync(handFile)) throw new Error(`${handFile}: none`);
const hand = JSON.parse(readFileSync(handFile, "utf8")) as { names?: string[]; words?: Record<string, string> };
const names = hand.names ?? [];
const words = hand.words ?? {};

// (every name of the lender's that a client or a database gives for real, and what the
// borrower's client calls the same thing: not the English a client shows, not a lent name)
const query = (db: ReturnType<typeof openDb>, name: string) =>
  db
    .query(
      `SELECT DISTINCT m.name AS to_name FROM name e JOIN name m ON m.kind = e.kind AND m.id = e.id AND m.locale = ? AND m.source NOT IN ('english', 'esES')
       WHERE e.locale = ? AND e.name = ? AND e.source <> 'english'`,
    )
    .all(locale, lender, name) as { to_name: string }[];
const dbs = [openDb("forever"), openDb("classic")];
const given = (name: string): string[] => [...new Set(dbs.flatMap((db) => query(db, name).map((r) => r.to_name)))];

const migrate = args.includes("--migrate");
const moved: string[] = [];
const problems: string[] = [];
const resolved: Record<string, string> = {};
for (const name of names) {
  const to = given(name);
  if (to.length === 0) problems.push(`names: "${name}": no ${locale} name in wow-data for it (a prose word or a form of the addon's own: words)`);
  else if (to.length > 1) problems.push(`names: "${name}": wow-data gives it ${to.length} ways (${to.map((t) => `"${t}"`).join(", ")}): words, the one this addon means`);
  else if (to[0] === name) problems.push(`names: "${name}": ${locale} writes it the same, it does nothing`);
  else if (name in resolved) problems.push(`names: "${name}" twice`);
  else resolved[name] = to[0];
}
for (const [from, to] of Object.entries(words)) {
  const game = given(from);
  if (game.length === 1 && game[0] === to) {
    if (migrate) {
      moved.push(from);
      continue;
    }
    problems.push(`words: "${from}" is a game name as wow-data gives it, "${to}": names (--migrate moves them)`);
  }
  if (from in resolved) problems.push(`words: "${from}" is in names too`);
  else resolved[from] = to;
}
if (problems.length) {
  console.error(`regional (${locale}): ${problems.length} to fix in ${handFile}\n  ${problems.join("\n  ")}`);
  process.exit(1);
}

if (moved.length) {
  const kept = Object.fromEntries(Object.entries(words).filter(([k]) => !moved.includes(k)));
  writeFileSync(handFile, JSON.stringify({ names: [...names, ...moved], words: kept }, null, 2) + "\n");
  console.log(`regional (${locale}): ${moved.length} words moved to names in ${handFile}`);
  for (const k of moved) resolved[k] = words[k];
}
const text = JSON.stringify(resolved, null, 2) + "\n";
if (check) {
  if (!existsSync(outFile) || readFileSync(outFile, "utf8") !== text) {
    console.error(`regional (${locale}): ${outFile} is stale: bun scripts/root.ts --run addon-kit/regional.ts ${locale}`);
    process.exit(1);
  }
  console.log(`regional (${locale}): ok, ${Object.keys(resolved).length} pairs (${names.length + moved.length} from wow-data)`);
} else {
  if (!existsSync(outFile) || readFileSync(outFile, "utf8") !== text) writeFileSync(outFile, text);
  console.log(`regional (${locale}): ${Object.keys(resolved).length} pairs (${names.length + moved.length} from wow-data, ${Object.keys(words).length - moved.length} by hand)`);
}
