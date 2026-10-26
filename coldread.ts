/**
 * A language's cold read, kept beside the check stamps and the reviews: once
 * the prose-reader helper (or the user) has read a language's authored text
 * cold and what it found is fixed, the main session records it, and
 * preflight measures what changed from there, not from the last tag (a tag
 * is older than any read, so the flag could never clear before a release).
 *
 *   bun addon-kit/coldread.ts <repo> "<verdict>" [lang…]   recorded for HEAD (every language the repo has, by default)
 *   bun addon-kit/coldread.ts <repo>                       each language's last cold read, if any
 *
 * It refuses while a language's authored text (the files preflight's
 * isAuthored names) has uncommitted changes: the read belongs to HEAD, and
 * the text read is the text committed.
 *
 * The file: <git common dir>/harness/coldread-<lang>, "verdict: …", the head,
 * when. One per language, the newest read replacing the one before; local to
 * this checkout, like a review. A stamp whose head is no longer in HEAD's
 * history (a rebase, a reset) counts for nothing: the tag stands in.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { logEvent, repoOf } from "./events";
import { stampDir } from "./q";
import { familyRoot } from "./root";

function git(cwd: string, ...args: string[]): string | undefined {
  const p = Bun.spawnSync(["git", ...args], { cwd, stderr: "ignore" });
  return p.exitCode === 0 ? p.stdout.toString().trim() : undefined;
}

const EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";

/** A language's file someone wrote (a cold read's business), not the game's names a script made. */
export const isAuthored = (path: string) => /\.md$|(^|\/)(words|sections|chapters)\.json$|-by-hand\.json$/.test(path);

/** The client languages an addon has words of its own for (not English, each with its meta.json). */
export function languages(dir: string): string[] {
  const i18n = join(dir, "i18n");
  if (!existsSync(i18n)) return [];
  return readdirSync(i18n)
    .filter((l) => /^[a-z]{2}[A-Z]{2}$/.test(l) && l !== "enUS" && existsSync(join(i18n, l, "meta.json")))
    .sort();
}

export type ColdRead = { verdict: string; head: string; at?: string };

export function parseColdRead(text: string): ColdRead | undefined {
  const fields: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const m = line.match(/^(\w+):\s*(.*)$/);
    if (m && !(m[1] in fields)) fields[m[1]] = m[2].trim();
  }
  return fields.verdict === undefined || !fields.head ? undefined : { verdict: fields.verdict, head: fields.head, at: fields.at };
}

/** A language's last recorded cold read. */
export function coldReadOf(dir: string, lang: string): ColdRead | undefined {
  const stamps = stampDir(dir);
  const file = stamps && join(stamps, `coldread-${lang}`);
  return file && existsSync(file) ? parseColdRead(readFileSync(file, "utf8")) : undefined;
}

/**
 * What a language's authored text is measured from: its last cold read when
 * that commit is still in HEAD's history, else the tag, else nothing (the
 * whole text, never released).
 */
export function coldBase(dir: string, lang: string, tag?: string): { base?: string; read?: ColdRead } {
  const read = coldReadOf(dir, lang);
  const ok = read && Bun.spawnSync(["git", "merge-base", "--is-ancestor", read.head, "HEAD"], { cwd: dir, stderr: "ignore" }).exitCode === 0;
  return ok ? { base: read.head, read } : { base: tag };
}

/** The authored files of a language that differ between a base (none: from nothing) and HEAD. */
export function authoredChanged(dir: string, lang: string, base?: string): string[] {
  return (git(dir, "diff", "--name-only", base ?? EMPTY_TREE, "HEAD", "--", `i18n/${lang}`) ?? "").split("\n").filter((f) => f && isAuthored(f));
}

export function record(dir: string, verdict: string, langs?: string[]): ColdRead | string {
  const head = git(dir, "rev-parse", "--verify", "-q", "HEAD");
  const stamps = stampDir(dir);
  if (!head || !stamps) return `${dir}: not a repository with a commit`;
  const one = verdict.replace(/\s+/g, " ").trim();
  if (!one) return "the verdict is empty";
  const have = languages(dir);
  const picked = langs?.length ? langs : have;
  if (!picked.length) return `${dir}: no language of its own to read (i18n/<locale>/meta.json)`;
  const unknown = picked.filter((l) => !have.includes(l));
  if (unknown.length) return `${unknown.join(", ")}: not a language of this repository (${have.join(", ") || "none"})`;
  // The read belongs to HEAD: authored text changed and uncommitted would land on the commit before.
  const dirty = picked.filter((l) => (git(dir, "status", "--porcelain", "--", `i18n/${l}`) ?? "").split("\n").some((r) => r && isAuthored(r.slice(3))));
  if (dirty.length) return `${dirty.join(", ")}: authored text has uncommitted changes: commit first, the cold read is recorded for HEAD`;
  mkdirSync(stamps, { recursive: true });
  const r: ColdRead = { verdict: one, head, at: new Date().toISOString() };
  for (const l of picked) writeFileSync(join(stamps, `coldread-${l}`), `verdict: ${r.verdict}\nhead: ${r.head}\nat: ${r.at}\n`);
  logEvent("coldread", "", repoOf(dir), `${head.slice(0, 7)} ${picked.join(" ")}: ${r.verdict}`);
  return r;
}

if (import.meta.main) {
  const [repo, ...rest] = process.argv.slice(2);
  if (!repo) {
    console.error('usage: bun coldread.ts <repo> ["<verdict>" [lang…]]');
    process.exit(2);
  }
  const dir = isAbsolute(repo) || repo.startsWith(".") ? resolve(repo) : join(familyRoot(), repo);
  if (!rest.length) {
    const langs = languages(dir);
    if (!langs.length) console.log("no language of its own");
    for (const l of langs) {
      const c = coldReadOf(dir, l);
      console.log(`${l}: ${c ? `${c.verdict} (${c.head.slice(0, 7)}, ${c.at ?? "?"})` : "no cold read recorded"}`);
    }
  } else {
    const [verdict, ...langs] = rest;
    const r = record(dir, verdict, langs);
    if (typeof r === "string") {
      console.error(r);
      process.exit(1);
    }
    console.log(`${repo} ${r.head.slice(0, 7)}: ${r.verdict}`);
  }
}
