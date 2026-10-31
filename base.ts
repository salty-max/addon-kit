/**
 * The base record: English and French are the base every other language is
 * translated from (ideas/audit/en-fr-base.md section D), so German and Spanish
 * start for an addon only when its English and French are final and nothing
 * moved since.
 *
 *   bun addon-kit/base.ts                          each addon's status
 *   bun addon-kit/base.ts <repo>                   the detail; exit 1 while German and Spanish must wait
 *   bun addon-kit/base.ts <repo> baseline [deDE=<sha>] [esES=<sha>]
 *                                                  record what German and Spanish were translated against (HEAD by default)
 *   bun addon-kit/base.ts <repo> freeze            write the record "final", when the proofs hold
 *
 * The record is i18n/base.json, committed right after the pass (the cold-read
 * stamps are local to one checkout and CI never sees them):
 *
 *   { "en": "final", "frFR": "final", "sha": "<commit>", "at": "<date>",
 *     "read": { "en": "<verdict>", "frFR": "<verdict>" },
 *     "translatedFrom": { "deDE": "<sha>", "esES": "<sha>" } }
 *
 * `freeze` is the only thing that writes "final", at HEAD, and only when: the
 * English and French text (and the record) have no uncommitted change; English
 * and French each have a cold read (coldread.ts) with nothing authored changed
 * since it, the French one the user's ("read by Max: …"); French has 0 stale
 * (locales.ts --check, and the generator of the addon's authored text); and
 * terms.ts has 0 warnings for the addon. The status after: "final" while
 * English and French are as they were at `sha`, "moved" once either differs
 * (the line is fixed, re-read, and the freeze re-earned).
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, isAbsolute, join, resolve } from "node:path";
import { authoredChanged, coldBase, ENGLISH, readable, sourcePaths } from "./coldread";
import { contentLines, coverage } from "./preflight";
import { familyRoot } from "./root";
import { addons } from "./store";
import { checkRepo } from "./terms";

export type Base = {
  en: "draft" | "final";
  frFR: "draft" | "final";
  sha?: string;
  at?: string;
  read?: { en?: string; frFR?: string };
  translatedFrom?: { deDE?: string; esES?: string };
};
export type Status = "none" | "draft" | "final" | "moved";

const git = (cwd: string, ...args: string[]) => {
  const p = Bun.spawnSync(["git", ...args], { cwd, stderr: "ignore" });
  return p.exitCode === 0 ? p.stdout.toString().trim() : undefined;
};
const file = (dir: string) => join(dir, "i18n", "base.json");

export function readBase(dir: string): Base | undefined {
  return existsSync(file(dir)) ? (JSON.parse(readFileSync(file(dir), "utf8")) as Base) : undefined;
}

/** The text a record's `sha` is measured on: English's, French's. */
const moved = (dir: string, lang: string, sha: string) => authoredChanged(dir, lang, sha);

/** none (no record), draft (not both final), final, moved (final but English or French differs from `sha`). */
export function statusOf(dir: string): { status: Status; base?: Base; movedFiles: string[] } {
  const base = readBase(dir);
  if (!base) return { status: "none", movedFiles: [] };
  if (base.en !== "final" || base.frFR !== "final" || !base.sha) return { status: "draft", base, movedFiles: [] };
  const movedFiles = [...moved(dir, ENGLISH, base.sha), ...moved(dir, "frFR", base.sha)];
  return { status: movedFiles.length ? "moved" : "final", base, movedFiles };
}

/**
 * What keeps French from being whole (empty: it is): the interface's check
 * (locales.ts --check) and the authored text's generator, as preflight reads
 * them, a failing run, words missing or a stale translation.
 */
export function frenchGaps(dir: string): string[] {
  const run = (script: string) => {
    const p = Bun.spawnSync(["bun", join("scripts", script), "--check"], { cwd: dir, stdout: "pipe", stderr: "pipe" });
    return { ok: p.exitCode === 0, out: `${p.stdout.toString()}\n${p.stderr.toString()}` };
  };
  const out: string[] = [];
  if (existsSync(join(dir, "scripts", "locales.ts"))) {
    const r = run("locales.ts");
    const line = r.out.match(/^frFR: (.+)$/m)?.[1];
    if (!r.ok) out.push("locales.ts --check fails");
    if (line) {
      const c = coverage(line);
      if (!c.complete) out.push(`French is incomplete (${line})`);
      if (c.stale) out.push(`French has ${c.stale} stale`);
    }
  }
  const generator = ["chapters.ts", "letters.ts", "pages.ts"].find((f) => existsSync(join(dir, "scripts", f)));
  if (generator) {
    const r = run(generator);
    if (!r.ok) out.push(`scripts/${generator} --check fails`);
    const content = contentLines(r.out).get("frFR");
    if (content && coverage(content).stale) out.push(`French has ${coverage(content).stale} stale in its authored text`);
  }
  return out;
}

/** What stops a freeze (empty: it may be written). */
export function refusals(dir: string): string[] {
  const out: string[] = [];
  const langs = [ENGLISH, "frFR"];
  for (const l of langs) {
    if (l === ENGLISH ? !sourcePaths(dir, l).length : !existsSync(join(dir, "i18n", l, "meta.json"))) out.push(`${l}: nothing to freeze (no ${l === ENGLISH ? "English text of its own" : "French"} here)`);
  }
  if (out.length) return out;
  const dirty = git(dir, "status", "--porcelain", "--", ...langs.flatMap((l) => sourcePaths(dir, l)), "i18n/base.json") ?? "";
  if (dirty) out.push(`uncommitted English, French or base.json: commit first, the record is for HEAD`);
  for (const l of langs) {
    const { read } = coldBase(dir, l);
    if (!read) out.push(`${l}: no cold read recorded (bun addon-kit/coldread.ts ${basename(dir)} '<verdict>' ${l})`);
    else if (authoredChanged(dir, l, read.head).length) out.push(`${l}: authored text changed since its cold read at ${read.head.slice(0, 7)}: read it again`);
    else if (l === "frFR" && !/read by max/i.test(read.verdict)) out.push(`frFR: the cold read is not the user's ("${read.verdict.slice(0, 60)}"): record theirs, "read by Max: …"`);
  }
  out.push(...frenchGaps(dir));
  const warned = checkRepo(dir);
  if (warned.length) out.push(`terms.ts has ${warned.length} warning${warned.length > 1 ? "s" : ""} (bun addon-kit/terms.ts ${basename(dir)})`);
  return out;
}

const write = (dir: string, base: Base) => writeFileSync(file(dir), `${JSON.stringify(base, null, 2)}\n`);

/** Record what German and Spanish were translated against (HEAD where none is given). */
export function baseline(dir: string, given: Record<string, string> = {}): Base | string {
  const head = git(dir, "rev-parse", "--verify", "-q", "HEAD");
  if (!head) return `${dir}: not a repository with a commit`;
  const base: Base = readBase(dir) ?? { en: "draft", frFR: "draft" };
  const unknown = Object.keys(given).filter((l) => l !== "deDE" && l !== "esES");
  if (unknown.length) return `${unknown.join(", ")}: only deDE and esES are translated from the base`;
  for (const l of ["deDE", "esES"] as const) {
    const sha = given[l] ? git(dir, "rev-parse", "--verify", "-q", `${given[l]}^{commit}`) : head;
    if (!sha) return `${l}: ${given[l]} is not a commit`;
    if (given[l] || !base.translatedFrom?.[l]) (base.translatedFrom ??= {})[l] = sha;
  }
  write(dir, base);
  return base;
}

export function freeze(dir: string): Base | string[] {
  const why = refusals(dir);
  if (why.length) return why;
  const head = git(dir, "rev-parse", "HEAD") as string;
  const before = readBase(dir);
  const base: Base = {
    en: "final",
    frFR: "final",
    sha: head,
    at: new Date().toISOString(),
    read: { en: coldBase(dir, ENGLISH).read?.verdict, frFR: coldBase(dir, "frFR").read?.verdict },
    ...(before?.translatedFrom ? { translatedFrom: before.translatedFrom } : {}),
  };
  write(dir, base);
  return base;
}

function describe(dir: string): { line: string; open: boolean } {
  const { status, base, movedFiles } = statusOf(dir);
  const sha = base?.sha?.slice(0, 7);
  const text: Record<Status, string> = {
    none: "no base record: English and French not frozen",
    draft: "draft: not both final",
    final: `English and French final at ${sha}`,
    moved: `final at ${sha}, but moved since: ${movedFiles.slice(0, 3).join(", ")}${movedFiles.length > 3 ? ` and ${movedFiles.length - 3} more` : ""}`,
  };
  return { line: `${text[status]} → German and Spanish ${status === "final" ? "may start" : "wait"}`, open: status === "final" };
}

if (import.meta.main) {
  const [repo, cmd, ...rest] = process.argv.slice(2);
  const root = familyRoot();
  if (!repo) {
    for (const d of [...addons()].sort()) console.log(`${basename(d).padEnd(20)} ${describe(d).line}`);
  } else {
    const dir = isAbsolute(repo) || repo.startsWith(".") ? resolve(repo) : join(root, repo);
    if (cmd === "baseline") {
      const given = Object.fromEntries(rest.map((a) => a.split("=") as [string, string]));
      const r = baseline(dir, given);
      if (typeof r === "string") {
        console.error(r);
        process.exit(1);
      }
      console.log(`${basename(dir)}: German from ${r.translatedFrom?.deDE?.slice(0, 7)}, Spanish from ${r.translatedFrom?.esES?.slice(0, 7)}`);
    } else if (cmd === "freeze") {
      const r = freeze(dir);
      if (Array.isArray(r)) {
        for (const w of r) console.error(`✗ ${w}`);
        process.exit(1);
      }
      console.log(`${basename(dir)}: English and French final at ${r.sha?.slice(0, 7)} (commit i18n/base.json right after, as its own commit)`);
    } else if (cmd) {
      console.error('usage: bun base.ts [<repo> [baseline [deDE=<sha>] [esES=<sha>] | freeze]]');
      process.exit(2);
    } else {
      const { line, open } = describe(dir);
      const base = readBase(dir);
      console.log(`${basename(dir)}: ${line}`);
      if (base?.read) console.log(`  read: English "${base.read.en ?? "?"}", French "${base.read.frFR ?? "?"}"`);
      if (base?.translatedFrom) console.log(`  German translated from ${base.translatedFrom.deDE?.slice(0, 7) ?? "?"}, Spanish from ${base.translatedFrom.esES?.slice(0, 7) ?? "?"}`);
      process.exit(open ? 0 : 1);
    }
  }
}
