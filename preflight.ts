/**
 * Before a release: everything a script can tell about one addon (or
 * several), in one table, nothing changed. release.sh cuts the release; this
 * says beforehand what would stop it, what the stores would get, and what is
 * still to read.
 *
 *   bun addon-kit/preflight.ts                    every addon with a store page
 *   bun addon-kit/preflight.ts yonder hearthtale  those
 *   bun addon-kit/preflight.ts yonder --offline   the live store pages left unread
 *   --no-fetch   as the checkouts know it (no git fetch)
 *   --json       the reports as JSON
 *
 * For each: git (release.sh wants main, clean, in sync), what ships since the
 * last tag (grouped, the release notes' material, a version suggested), the
 * TOCs (one version, each game's interface against wow-data's pinned build,
 * the store ids, Notes in every language translated), the store page
 * (Support with Ko-fi before Source, its summary the TOCs' Notes, no
 * semicolon, Other addons naming released siblings by their Wago ids), the
 * live pages (store.ts's dry run: whether --apply is due), every language's
 * coverage and whether its authored text changed since the tag (a cold read,
 * the prose-reader helper), CI on HEAD, the daily game data, open pull
 * requests, the check stamp, the review on HEAD, the iCloud test build, the
 * kit copy's commit pushed, the store secrets and HOLD_STORES.
 *
 * Marks: ✗ in the way (release.sh would refuse, or a store would get what it
 * shouldn't), ! to look at first, · for the record. Exit 1 while an ✗ stands.
 * What a script can't judge stays a read: whether the store page still says
 * what ships, the release notes themselves, the languages' cold reads.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { reviewOf } from "./review";
import { familyRoot } from "./root";
import { read as readRepo, ships as shipsPaths, type Repo } from "./status";
import { addons, due, inspect, readPage } from "./store";

const ROOT = familyRoot(); // the family folder, from a worktree too (root.ts)

export type Mark = "✓" | "✗" | "!" | "·";
export type Row = { mark: Mark; label: string; text: string };
export type Kind = "feat" | "fix" | "data" | "kit" | "other";
export type Commit = { sha: string; subject: string; kind: Kind };
export type Toc = {
  file: string;
  game?: Game;
  version?: string;
  interfaces: string[];
  curse?: string;
  wago?: string;
  notes: Record<string, string>; // locale → Notes (enUS: the plain ## Notes)
};
export type Game = "classic" | "forever" | "tbc";
export type Preflight = {
  name: string;
  tag?: string;
  version?: string;
  next?: string;
  total: number;
  ships: Commit[];
  rows: Row[];
};

// ── pure parts (preflight.test.ts) ──────────────────────────────────────────
/** A client build's interface number: 1.15.9.70003 → 11509. */
export function interfaceOf(build: string): string | undefined {
  const m = build.match(/^(\d+)\.(\d+)\.(\d+)/);
  return m ? String(Number(m[1]) * 10000 + Number(m[2]) * 100 + Number(m[3])) : undefined;
}

/** The game a TOC loads in, by its suffix (each game reads its own). */
export function gameOf(toc: string): Game | undefined {
  const games: Record<string, Game> = { Vanilla: "classic", Camelot: "forever", TBC: "tbc" };
  const m = basename(toc, ".toc").match(/_(Vanilla|Camelot|TBC)$/);
  return m ? games[m[1]] : undefined;
}

export function readToc(file: string, text: string): Toc {
  const field = (k: string) => text.match(new RegExp(`^## ${k}:[ \\t]*(.*?)[ \\t\\r]*$`, "m"))?.[1];
  const notes: Record<string, string> = {};
  for (const m of text.matchAll(/^## Notes(?:-([a-z]{2}[A-Z]{2}))?:[ \t]*(.*?)[ \t\r]*$/gm)) notes[m[1] ?? "enUS"] = m[2];
  return {
    file,
    game: gameOf(file),
    version: field("Version"),
    interfaces: (field("Interface") ?? "").split(/\s*,\s*/).filter(Boolean),
    curse: field("X-Curse-Project-ID"),
    wago: field("X-Wago-ID"),
    notes,
  };
}

export type Pins = Partial<Record<Game, { build: string }>>;

/**
 * An unsuffixed TOC's interface's game (WowLocker.toc's "11509, 20506"): the
 * pin on the same line (115xx classic, 160xx forever), so a stale number
 * still finds its game and shows as wrong, else TBC's 2xxxx (no pin).
 */
export function gameOfInterface(i: string, pinned: Pins): Game | undefined {
  const line = (n: string | undefined) => Math.floor(Number(n) / 100);
  const pin = (Object.keys(pinned) as Game[]).find((g) => line(interfaceOf(pinned[g]!.build)) === line(i));
  return pin ?? (/^2\d{4}$/.test(i) ? "tbc" : undefined);
}

/** A commit's place in the release notes, by its Conventional subject. */
export function kindOf(subject: string): Kind {
  if (/^feat[(!:]/.test(subject)) return "feat";
  if (/^fix[(!:]/.test(subject)) return "fix";
  if (/^chore\(data\)|^chore: the game's data/.test(subject)) return "data";
  if (/^chore(\([^)]*\))?: kit /.test(subject)) return "kit";
  return "other";
}

/** The version to suggest: a feature a minor step, else a patch (release.sh's default). */
export function nextVersion(current: string, commits: Commit[]): string | undefined {
  const m = current.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return undefined;
  const [ma, mi, pa] = m.slice(1).map(Number);
  return commits.some((c) => c.kind === "feat") ? `${ma}.${mi + 1}.0` : `${ma}.${mi}.${pa + 1}`;
}

/** A `## <name>` section's text, up to the next `## `. */
export function sectionOf(text: string, name: string): string | undefined {
  const lines = text.split("\n");
  const start = lines.findIndex((l) => l.trim() === `## ${name}`);
  if (start < 0) return undefined;
  const end = lines.findIndex((l, i) => i > start && l.startsWith("## "));
  return lines.slice(start + 1, end < 0 ? undefined : end).join("\n");
}

/** What a store page (addon/CURSEFORGE.md) breaks of the family's rules. */
export function pageProblems(text: string): string[] {
  const out: string[] = [];
  const page = readPage(text);
  const heads = [...text.matchAll(/^## (.+?)\s*$/gm)].map((m) => m[1]);
  const support = heads.indexOf("Support");
  const source = heads.indexOf("Source");
  if (support < 0) out.push("no Support section");
  else if (!sectionOf(text, "Support")?.includes("ko-fi.com/salty_max")) out.push("Support doesn't invite a coffee on Ko-fi (ko-fi.com/salty_max)");
  if (source < 0) out.push("no Source section");
  else if (support > source) out.push("Support comes after Source");
  if (!page.summary) out.push("no Summary note");
  if (page.body.includes(";")) out.push("a semicolon in the page");
  if (page.summary?.includes(";")) out.push("a semicolon in the summary");
  if (page.github?.includes(";")) out.push("a semicolon in the GitHub note");
  return out;
}

/** The siblings an Other addons section names, with their Wago ids. */
export function othersNamed(text: string): { name: string; wago?: string }[] {
  return (sectionOf(text, "Other addons") ?? "").split("\n").flatMap((l) => {
    const m = l.match(/^\s*[-*]\s+\*\*\[([^\]]+)\]/);
    return m ? [{ name: m[1], wago: l.match(/addons\.wago\.io\/addons\/([A-Za-z0-9]+)/)?.[1] }] : [];
  });
}

/** One of locales.ts --check's lines ("deDE: 326/326 texts (0 stale), 660/660 words, flagged"). */
export function coverage(line: string): { complete: boolean; stale: number; flagged: boolean } {
  const pairs = [...line.matchAll(/(\d+)\/(\d+)/g)];
  const stale = [...line.matchAll(/\((\d+) stale\)/g)].reduce((n, m) => n + Number(m[1]), 0);
  return { complete: pairs.every((m) => m[1] === m[2]), stale, flagged: /\bflagged\b/.test(line) };
}

/** A language's file someone wrote (a cold read's business), not the game's names a script made. */
export const isAuthored = (path: string) => /\.md$|(^|\/)(words|sections|chapters)\.json$|-by-hand\.json$/.test(path);

/** "in its TOC", "in both TOCs", "in all 3 TOCs". */
export const inTocs = (n: number) => (n === 1 ? "in its TOC" : n === 2 ? "in both TOCs" : `in all ${n} TOCs`);

// A language with no words of its own borrows another's (each addon's
// locales.ts: esMX esES's), its own game names beside them.
const BORROWS: Record<string, string> = { esMX: "esES" };

/** The TOC Notes a set of translations wants: each one's, Mexico's beside Spain's. */
export function notesWanted(langs: string[]): string[] {
  const out = new Set(langs);
  if (out.has("esES")) out.add("esMX");
  return [...out];
}

// ── reading ─────────────────────────────────────────────────────────────────
async function run(cmd: string[], cwd: string): Promise<{ ok: boolean; out: string }> {
  const p = Bun.spawn(cmd, { cwd, stdout: "pipe", stderr: "pipe" });
  const [out, err] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text()]);
  return { ok: (await p.exited) === 0, out: `${out}${err}`.trim() };
}
const git = async (dir: string, ...args: string[]) => {
  const r = await run(["git", ...args], dir);
  return r.ok ? r.out : undefined;
};

function tocsOf(dir: string): Toc[] {
  const addon = join(dir, "addon");
  return readdirSync(addon, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .flatMap((d) =>
      readdirSync(join(addon, d.name))
        .filter((f) => f.endsWith(".toc"))
        .sort()
        .map((f) => readToc(`${d.name}/${f}`, readFileSync(join(addon, d.name, f), "utf8"))),
    );
}

/** The translations an addon ships: i18n/<locale>/ with a meta.json, English aside. */
function languages(dir: string): string[] {
  const i18n = join(dir, "i18n");
  if (!existsSync(i18n)) return [];
  return readdirSync(i18n)
    .filter((l) => /^[a-z]{2}[A-Z]{2}$/.test(l) && l !== "enUS" && existsSync(join(i18n, l, "meta.json")))
    .sort();
}

// (the interface's words translated, where locales.ts gives no line of its own)
function wordsLine(dir: string, lang: string): string | undefined {
  const english = join(dir, "i18n", "words.json");
  const words = join(dir, "i18n", lang, "words.json");
  if (!existsSync(english)) return undefined;
  const keys = Object.keys(JSON.parse(readFileSync(english, "utf8")));
  const done: Record<string, unknown> = existsSync(words) ? JSON.parse(readFileSync(words, "utf8")) : {};
  const flagged = JSON.parse(readFileSync(join(dir, "i18n", lang, "meta.json"), "utf8")).flagged === true;
  return `${keys.filter((k) => typeof done[k] === "string" && done[k] !== "").length}/${keys.length} words${flagged ? ", flagged" : ""}`;
}

const pins = (): Pins => JSON.parse(readFileSync(join(ROOT, "wow-data", "pins.json"), "utf8")).builds ?? {};

type Sibling = { name: string; wago?: string; released: boolean };
async function siblings(): Promise<Sibling[]> {
  return Promise.all(
    addons().map(async (dir) => ({
      name: basename(dir),
      wago: tocsOf(dir).find((t) => t.wago)?.wago,
      released: !!(await git(dir, "describe", "--tags", "--abbrev=0", "--match", "v[0-9]*")),
    })),
  );
}

async function gather(name: string, family: Sibling[], fetch: boolean): Promise<Preflight> {
  const dir = join(ROOT, name);
  const rows: Row[] = [];
  const add = (mark: Mark, label: string, text: string) => rows.push({ mark, label, text });
  const repo: Repo = await readRepo(name, fetch);
  const head = (await git(dir, "rev-parse", "HEAD")) ?? "";

  // git, as release.sh wants it
  const wrong = [
    repo.branch !== "main" && `on ${repo.branch}, not main`,
    repo.dirty && `${repo.dirty} file${repo.dirty > 1 ? "s" : ""} uncommitted`,
    !repo.upstream && "no upstream",
    repo.ahead && `${repo.ahead} commit${repo.ahead > 1 ? "s" : ""} to push first (with a review)`,
    repo.behind && `${repo.behind} to pull`,
  ].filter((x): x is string => !!x);
  add(wrong.length ? "✗" : "✓", "git", wrong.length ? `${wrong.join(", ")}: release.sh wants main clean and in sync` : "main, clean, in sync with origin");

  // what ships since the last tag
  const tag = await git(dir, "describe", "--tags", "--abbrev=0", "--match", "v[0-9]*");
  const range = tag ? `${tag}..HEAD` : "HEAD";
  const total = Number(await git(dir, "rev-list", "--count", range)) || 0;
  const log = (await git(dir, "log", "--format=%h%x09%s", range, "--", ...shipsPaths(name))) ?? "";
  const ships = log
    .split("\n")
    .filter(Boolean)
    .map((l) => {
      const [sha, ...rest] = l.split("\t");
      const subject = rest.join("\t");
      return { sha, subject, kind: kindOf(subject) };
    });

  // the TOCs
  const tocs = tocsOf(dir);
  const store = tocs.filter((t) => t.curse || t.wago);
  const versions = [...new Set(tocs.map((t) => t.version))];
  const version = (store[0] ?? tocs[0])?.version;
  const siteTags = name === "wow-locker"; // (WoWLocker's tags are the site's, its addon's version apart)
  if (versions.length > 1) add("✗", "version", `the TOCs differ: ${tocs.map((t) => `${t.file} ${t.version}`).join(", ")}`);
  else if (siteTags) add("·", "version", `addon ${version} ${inTocs(tocs.length)}; the tags are the site's (release.sh --addon X.Y.Z)`);
  else if (!tag) add("!", "version", `${version} ${inTocs(tocs.length)}, a first release: release.sh --version ${version} (its default is the patch after)`);
  else if (tag !== `v${version}`) add("!", "version", `the TOCs say ${version}, the last tag is ${tag}: release.sh bumps from the TOCs`);
  else add("✓", "version", `${version} ${inTocs(tocs.length)}, the last tag's`);

  const pinned = pins();
  const seen = new Map<string, Row>();
  for (const t of tocs) {
    for (const i of t.interfaces) {
      const game = t.game ?? gameOfInterface(i, pinned);
      if (!game) {
        seen.set(`? ${i}`, { mark: "✗", label: "interface", text: `${i} in ${t.file}: no pinned game's line, nor TBC's` });
        continue;
      }
      const key = `${game} ${i}`;
      if (seen.has(key)) continue;
      const pin = pinned[game];
      const want = pin && interfaceOf(pin.build);
      if (!pin) seen.set(key, { mark: "·", label: "interface", text: `${game === "tbc" ? "TBC" : game} ${i}: no pin in wow-data, by hand` });
      else if (want === i) seen.set(key, { mark: "✓", label: "interface", text: `${game} ${i}, the pinned ${pin.build}` });
      else seen.set(key, { mark: "✗", label: "interface", text: `${game} ${i} in ${t.file}, the pinned build ${pin.build} is ${want}` });
    }
  }
  const order = ["classic", "forever", "TBC"];
  const ifaces = [...seen.values()].sort((a, b) => order.indexOf(a.text.split(" ")[0]) - order.indexOf(b.text.split(" ")[0]));
  const good = ifaces.filter((r) => r.mark === "✓");
  if (good.length) add("✓", "interface", good.map((r) => r.text).join(" · "));
  for (const r of ifaces.filter((r) => r.mark !== "✓")) rows.push(r);

  const curse = [...new Set(store.map((t) => t.curse))];
  const wago = [...new Set(store.map((t) => t.wago))];
  if (!store.length) add("✗", "store ids", "no TOC carries X-Curse-Project-ID or X-Wago-ID");
  else if (curse.length > 1 || wago.length > 1 || curse.includes(undefined) || wago.includes(undefined))
    add("✗", "store ids", `the TOCs differ or miss one: ${store.map((t) => `${t.file} ${t.curse ?? "–"}/${t.wago ?? "–"}`).join(", ")}`);
  else add("✓", "store ids", `CurseForge ${curse[0]}, Wago ${wago[0]}, ${inTocs(store.length)}`);

  // the store page, offline
  const pageFile = join(dir, "addon", "CURSEFORGE.md");
  const text = readFileSync(pageFile, "utf8");
  const page = readPage(text);
  const langs = languages(dir);
  const noteProblems: string[] = [];
  for (const t of store) {
    if (page.summary && t.notes.enUS !== page.summary) noteProblems.push(`${t.file}'s Notes aren't the page's summary`);
    const missing = notesWanted(langs).filter((l) => !t.notes[l]);
    if (missing.length) noteProblems.push(`${t.file} has no Notes-${missing.join(", Notes-")}`);
  }
  // (every TOC's: a helper's beside the addon shows its Notes in the game's list too)
  for (const t of tocs) {
    const semi = Object.keys(t.notes).filter((l) => t.notes[l].includes(";"));
    if (semi.length) noteProblems.push(`a semicolon in ${t.file}'s Notes (${semi.join(", ")})`);
  }
  const wanted = notesWanted(langs);
  add(
    noteProblems.length ? "✗" : "✓",
    "Notes",
    noteProblems.length ? [...new Set(noteProblems)].join(", ") : `the page's summary${wanted.length ? `, and ${wanted.join(" ")}` : ""}`,
  );
  const problems = pageProblems(text);
  add(problems.length ? "✗" : "✓", "page", problems.length ? problems.join(", ") : `Support (Ko-fi) before Source, a summary${page.github ? " and a GitHub note" : ""}, no semicolon`);

  const named = othersNamed(text);
  const byWago = new Map(family.filter((s) => s.wago).map((s) => [s.wago!, s]));
  const strays = named.filter((n) => !n.wago || !byWago.has(n.wago));
  const early = named.filter((n) => n.wago && byWago.get(n.wago) && !byWago.get(n.wago)!.released);
  if (strays.length) add("✗", "others", `${strays.map((n) => n.name).join(", ")}: no sibling's Wago id`);
  if (early.length) add("✗", "others", `names ${early.map((n) => n.name).join(", ")}, never tagged`);
  if (!strays.length && !early.length) {
    const namedRepos = new Set(named.map((n) => byWago.get(n.wago!)?.name));
    const unnamed = family.filter((s) => s.name !== name && s.released && !namedRepos.has(s.name)).map((s) => s.name);
    add("·", "others", `${named.length ? `names ${named.map((n) => n.name).join(", ")}` : "names no sibling"}${unnamed.length ? `. Tagged, not named: ${unnamed.join(", ")}` : ""}`);
  }
  if (!tag && !siteTags) {
    const naming = family.filter((s) => s.name !== name && othersNamed(readFileSync(join(ROOT, s.name, "addon", "CURSEFORGE.md"), "utf8")).some((n) => n.wago && n.wago === wago[0]));
    add("·", "after", `a first release: ${naming.length ? `named by ${naming.map((s) => s.name).join(", ")}` : "no sibling's Other addons names it yet"}`);
  }

  // the languages
  if (langs.length) {
    const check = existsSync(join(dir, "scripts", "locales.ts")) ? await run(["bun", "scripts/locales.ts", "--check"], dir) : undefined;
    if (check && !check.ok) add("✗", "locales", `locales.ts --check failed: ${check.out.split("\n").slice(-2).join(" ").slice(0, 200)}`);
    const lines = new Map([...(check?.out ?? "").matchAll(/^([a-z]{2}[A-Z]{2}): (.+)$/gm)].map((m) => [m[1], m[2]]));
    for (const l of langs) {
      const lender = BORROWS[l];
      if (!lines.has(l) && lender && !existsSync(join(dir, "i18n", l, "words.json"))) {
        add("·", l, `${lender}'s words, borrowed (its own names beside them)`);
        continue;
      }
      const line = lines.get(l) ?? wordsLine(dir, l);
      if (!line) continue;
      const c = coverage(line);
      add(c.complete && !c.stale ? "✓" : "!", l, `${line}${c.complete ? "" : ": English where it's missing"}`);
    }
    const changed: string[] = [];
    for (const l of langs) {
      const files = ((await git(dir, "diff", "--name-only", range === "HEAD" ? "4b825dc642cb6eb9a060e54bf8d69288fbee4904" : tag!, "HEAD", "--", `i18n/${l}`)) ?? "")
        .split("\n")
        .filter((f) => f && isAuthored(f));
      if (files.length) changed.push(`${l} (${files.length} file${files.length > 1 ? "s" : ""})`);
    }
    if (changed.length) add("!", "cold read", `authored text ${tag ? `changed since ${tag}` : "never released"}: ${changed.join(", ")}. A cold read of each (the prose-reader)`);
  }

  // GitHub's side
  const ci = repo.runs?.find((r) => r.workflow === "CI");
  if (repo.ghFailed) add("!", "GitHub", "gh gave nothing: workflows, pull requests, secrets unread (gh auth status)");
  else if (!ci) add("!", "CI", "no run found");
  else if (ci.sha !== head) add("!", "CI", `last run on ${ci.sha.slice(0, 7)} (${ci.conclusion || ci.status}), not on HEAD`);
  else if (ci.status !== "completed") add("!", "CI", "still running on HEAD");
  else add(ci.conclusion === "success" ? "✓" : "✗", "CI", `${ci.conclusion} on HEAD`);
  const data = repo.runs?.find((r) => r.workflow === "Game data");
  if (data && data.status === "completed")
    add(data.conclusion === "success" ? "✓" : "!", "game data", `${data.conclusion}${data.conclusion === "success" ? "" : ` on ${data.sha.slice(0, 7)} (${data.at.slice(0, 10)}): look before releasing`}`);
  for (const pr of repo.prs ?? []) add("!", "pull req.", `#${pr.number} open: ${pr.title}`);

  // the harness's records
  add(repo.checked ? "✓" : "·", "check", repo.checked ? "passed on HEAD's tree" : "no stamp on HEAD's tree (release.sh runs the whole check on the bumped tree anyway)");
  const review = reviewOf(dir, head);
  add(review ? "✓" : "!", "review", review ? `"${review.verdict}" on HEAD` : "none recorded on HEAD: packet.ts, then the reviewer");
  const b = repo.build;
  if (!b) add("!", "test zip", "none in iCloud: bun run package, the zip alone");
  else if (b.state === "current") add("✓", "test zip", `${b.file} is what ships at HEAD (the test in the game is yours to say)`);
  else if (b.state === "behind") add("!", "test zip", `${b.file} is ${b.behind} commit${b.behind === 1 ? "" : "s"} behind what ships`);
  else add("!", "test zip", `${b.file}: not a commit of this repository`);

  const main = store[0] ?? tocs[0]; // (the addon's own folder, not a helper's beside it)
  const kitCopy = main ? join(dir, "addon", main.file.split("/")[0], "Kit.lua") : "";
  const stamp = kitCopy && existsSync(kitCopy) ? readFileSync(kitCopy, "utf8").match(/^-- addon-kit ([0-9a-f]+\+?|\w+)/)?.[1] : undefined;
  // (a trial copy of uncommitted kit code: never shipped)
  if (stamp?.endsWith("+")) add("✗", "kit", `copy of ${stamp}, uncommitted kit code: commit the kit, kit:sync, commit`);
  else if (stamp) {
    const kit = join(ROOT, "addon-kit");
    const pushed = (await run(["git", "merge-base", "--is-ancestor", stamp, "origin/main"], kit)).ok;
    add(pushed ? "✓" : "✗", "kit", pushed ? `copy of ${stamp}, on addon-kit's origin` : `copy of ${stamp}, not on addon-kit's origin/main: the kit goes out first`);
  }

  // the stores' side of the release workflow
  const workflow = join(dir, ".github", "workflows", "release.yml");
  if (repo.slug && existsSync(workflow)) {
    const needs = [...new Set([...readFileSync(workflow, "utf8").matchAll(/secrets\.([A-Z0-9_]+)/g)].map((m) => m[1]))].filter((s) => s !== "GITHUB_TOKEN");
    const [secrets, vars] = await Promise.all([
      run(["gh", "secret", "list", "-R", repo.slug, "--json", "name", "-q", ".[].name"], ROOT),
      run(["gh", "variable", "list", "-R", repo.slug, "--json", "name,value", "-q", '.[] | "\\(.name)=\\(.value)"'], ROOT),
    ]);
    if (!secrets.ok) add("!", "stores", "gh couldn't list the secrets");
    else {
      const have = new Set(secrets.out.split("\n"));
      const missing = needs.filter((s) => !have.has(s));
      const hold = vars.ok && vars.out.split("\n").includes("HOLD_STORES=true");
      add(
        missing.length ? "✗" : "✓",
        "stores",
        `${missing.length ? `no ${missing.join(", ")} on ${repo.slug}` : `${needs.join(", ")} set`}${hold ? ". HOLD_STORES is on, from a --hold: release.sh sets it either way" : ""}`,
      );
    }
  }

  // (from the tag's version, not TOCs bumped ahead of it; none when nothing ships)
  const next = siteTags || !version ? undefined : !tag ? version : ships.length ? nextVersion(tag.replace(/^v/, ""), ships) : undefined;
  return { name, tag, version, next, total, ships, rows };
}

// The live pages, store.ts's dry run (one at a time: Wago's session is one jar).
async function live(p: Preflight): Promise<Row[]> {
  try {
    const r = await inspect(join(ROOT, p.name));
    const rows: Row[] = [];
    const todo = due(r);
    rows.push(
      todo.length
        ? { mark: "!", label: "live", text: `store.ts --apply due: ${todo.join(", ")} (bun addon-kit/store.ts ${p.name}: the dry run, then --apply on the go)` }
        : { mark: "✓", label: "live", text: "CurseForge's page, Wago's and GitHub's are the file" },
    );
    if (r.summary !== undefined) rows.push({ mark: "!", label: "live", text: `CurseForge's summary isn't the file's: by hand, on the project's General page` });
    if (typeof r.wago === "string") rows.push({ mark: "·", label: "live", text: `Wago not read: ${r.wago}` });
    return rows;
  } catch (e) {
    return [{ mark: "!", label: "live", text: `not read: ${(e as Error).message}` }];
  }
}

const KINDS: [Kind, string][] = [
  ["feat", "feat"],
  ["fix", "fix"],
  ["data", "data"],
  ["kit", "kit"],
  ["other", "other"],
];

export function verdict(p: Preflight): string {
  const stops = p.rows.filter((r) => r.mark === "✗").length;
  const looks = p.rows.filter((r) => r.mark === "!").length;
  if (p.tag && !p.ships.length) return `nothing ships since ${p.tag}`;
  if (stops) return `${stops} in the way${looks ? `, ${looks} to look at` : ""}`;
  return looks ? `ready but for ${looks} to look at` : "ready";
}

function print(p: Preflight) {
  const step = p.next ? ` → ${p.next} suggested` : "";
  const since = p.tag ? `${p.ships.length} of ${p.total} commits since ${p.tag} ship` : `never released, ${p.ships.length} commits ship`;
  console.log(`${p.name}  ${p.tag ?? "(no tag)"}${step} (${since})`);
  const w = Math.max(...p.rows.map((r) => r.label.length));
  for (const r of p.rows) console.log(`  ${r.mark} ${r.label.padEnd(w)}  ${r.text}`);
  if (p.ships.length) {
    console.log(`  what ships${p.tag ? ` since ${p.tag}` : ""}:`);
    for (const [kind, label] of KINDS) {
      const list = p.ships.filter((c) => c.kind === kind);
      const shown = kind === "data" || kind === "kit" ? list.slice(0, 2) : list.slice(0, 15);
      for (const c of shown) console.log(`    ${label.padEnd(5)} ${c.sha} ${c.subject}`);
      if (list.length > shown.length) console.log(`    ${label.padEnd(5)} … ${list.length - shown.length} more`);
    }
  }
  console.log(`  → ${verdict(p)}\n`);
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const known = new Set(addons().map((d) => basename(d)));
  const asked = args.filter((a) => !a.startsWith("--")).map((a) => basename(a.replace(/\/+$/, "")));
  const unknown = asked.filter((a) => !known.has(a));
  if (unknown.length) {
    console.error(`preflight: ${unknown.join(", ")}: no addon with a store page (addon/CURSEFORGE.md) of that name in ${ROOT}`);
    process.exit(2);
  }
  const names = asked.length ? asked : [...known].sort();
  const family = await siblings();
  const reports = await Promise.all(names.map((n) => gather(n, family, !args.includes("--no-fetch"))));
  if (!args.includes("--offline")) {
    for (const p of reports) {
      const at = p.rows.findIndex((r) => r.label === "page");
      p.rows.splice(at < 0 ? p.rows.length : at + 1, 0, ...(await live(p)));
    }
  }
  if (args.includes("--json")) console.log(JSON.stringify(reports.map((p) => ({ ...p, verdict: verdict(p) })), null, 2));
  else {
    for (const p of reports) print(p);
    if (reports.length > 1) {
      const by = (f: (p: Preflight) => boolean) => reports.filter(f).map((p) => p.name);
      // (an addon with nothing to ship but an ✗ is in the way too: it fails the run)
      const stops = (p: Preflight) => p.rows.some((r) => r.mark === "✗");
      const idle = (p: Preflight) => !!p.tag && !p.ships.length;
      const stopped = by(stops);
      const none = by((p) => idle(p) && !stops(p));
      const ready = by((p) => !idle(p) && !stops(p));
      if (ready.length) console.log(`Ready: ${ready.join(", ")}`);
      if (stopped.length) console.log(`In the way: ${stopped.join(", ")}`);
      if (none.length) console.log(`Nothing ships: ${none.join(", ")}`);
    }
  }
  process.exit(reports.some((p) => p.rows.some((r) => r.mark === "✗")) ? 1 : 0);
}
