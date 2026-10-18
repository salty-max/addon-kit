/**
 * An addon's store page on CurseForge, from its `addon/CURSEFORGE.md`: the
 * file as the page, Markdown, its comments left out (the summary's and the
 * GitHub description's notes stay in the file).
 *
 *   bun ../addon-kit/store.ts <addon repo>           the live page against the
 *                                                    file: what would change
 *                                                    (nothing is saved)
 *   bun ../addon-kit/store.ts <addon repo> --apply   the live page replaced by
 *                                                    the file, then read back
 *   bun ../addon-kit/store.ts <addon repo> --show    what the file gives
 *   bun ../addon-kit/store.ts --all [--apply]        every addon beside the kit
 *
 * Beside the page, it checks the summary (the file's note against
 * CurseForge's and the TOCs' Notes: a summary is changed by hand on the
 * General page, whose save sends the whole project, links among them, which
 * no read gives) and GitHub's description (the file's note, put up through
 * gh with --apply).
 *
 * CurseForge has no API for a project's description: this is what its authors
 * site's own editor does (authors.curseforge.com/_api, read on 19 October
 * 2026): GET projects/description/<id> ({ Description, DescriptionType }),
 * POST projects/description/preview (renders, saves nothing), PUT
 * projects/description/<id> ({ description, descriptionType }). Type 5 is
 * Markdown (the server renders it, comments dropped), 1 the editor's HTML.
 * The project's id: the TOCs' X-Curse-Project-ID.
 *
 * The session: the signed-in browser's cookie for authors.curseforge.com, in
 * ~/.config/wow-addons/curseforge-cookie (or CURSEFORGE_COOKIE): the Cookie
 * header of any request to authors.curseforge.com/_api, copied from the
 * browser's developer tools (Network). Never in CI, never committed: it opens
 * the whole account. When it has expired, the script says so.
 *
 * Updating the live page publishes: a dry run first, the owner's go before
 * --apply.
 */
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

const API = "https://authors.curseforge.com/_api";
const MARKDOWN = 5;

export type Page = { title: string; summary?: string; github?: string; body: string };

/** The file read: its first heading, its notes, the page without its comments. */
export function readPage(text: string): Page {
  const note = (label: string) => {
    const m = text.match(new RegExp(`<!--\\s*${label}[^:]*:\\s*([\\s\\S]*?)-->`));
    return m ? m[1].replace(/\s+/g, " ").trim() : undefined;
  };
  const body = text
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const title = (body.match(/^#\s+(.+)$/m) ?? [])[1]?.trim() ?? "";
  return { title, summary: note("Summary"), github: note("GitHub"), body: `${body}\n` };
}

/** The project's CurseForge id, from the addon's TOCs. */
export function projectId(repo: string): number {
  const addon = join(repo, "addon");
  for (const dir of readdirSync(addon, { withFileTypes: true }).filter((d) => d.isDirectory())) {
    for (const f of readdirSync(join(addon, dir.name)).filter((f) => f.endsWith(".toc"))) {
      const m = readFileSync(join(addon, dir.name, f), "utf8").match(/^## X-Curse-Project-ID:\s*(\d+)/m);
      if (m) return Number(m[1]);
    }
  }
  throw new Error(`no X-Curse-Project-ID in ${addon}'s TOCs`);
}

function cookie(): string {
  const env = process.env.CURSEFORGE_COOKIE;
  if (env) return env.trim();
  const file = join(homedir(), ".config", "wow-addons", "curseforge-cookie");
  if (existsSync(file)) return readFileSync(file, "utf8").trim().replace(/^cookie:\s*/i, "");
  throw new Error(`no session: put the Cookie header of a request to ${API} in ${file} (the browser's developer tools, Network)`);
}

async function call(method: string, path: string, body?: unknown) {
  const r = await fetch(`${API}/${path}`, {
    method,
    headers: { cookie: cookie(), accept: "application/json", ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (r.status === 401 || r.status === 403) throw new Error(`CurseForge said ${r.status}: the session has expired, copy the cookie again`);
  if (!r.ok) throw new Error(`CurseForge said ${r.status} to ${method} ${path}: ${(await r.text()).slice(0, 300)}`);
  const text = await r.text();
  return text ? JSON.parse(text) : null;
}

type Live = { Description: string; DescriptionType: number };
const live = (id: number) => call("GET", `projects/description/${id}`) as Promise<Live>;
const rendered = async (markdown: string) =>
  ((await call("POST", "projects/description/preview", { description: markdown, descriptionType: MARKDOWN })) as Live).Description;
// (an HTML page as its words, a line a block: for a page still in the editor's HTML)
const words = (html: string) =>
  html
    .replace(/<\/(p|h\d|li|ul|ol|div|blockquote)>|<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&nbsp;/g, " ")
    .split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean).join("\n") + "\n";

function diff(a: string, b: string): string {
  const dir = mkdtempSync(join(tmpdir(), "store-"));
  writeFileSync(join(dir, "live"), a);
  writeFileSync(join(dir, "file"), b);
  const r = Bun.spawnSync(["diff", "-u", "--label", "live page", "--label", "CURSEFORGE.md", join(dir, "live"), join(dir, "file")]);
  return r.stdout.toString();
}

// ── one addon, every addon ──────────────────────────────────────────────────
const ROOT = join(new URL(".", import.meta.url).pathname, "..");

/** The addons beside the kit with a store page: their repositories. */
export function addons(): string[] {
  return readdirSync(ROOT, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(ROOT, d.name, "addon", "CURSEFORGE.md")))
    .map((d) => join(ROOT, d.name))
    .sort();
}

// (the English Notes of the TOCs the store page's addon has, those with its
// X-Curse-Project-ID, not a helper's beside it: Yonder's old name's handover)
function tocNotes(repo: string): string | undefined {
  const addon = join(repo, "addon");
  for (const dir of readdirSync(addon, { withFileTypes: true }).filter((d) => d.isDirectory()))
    for (const f of readdirSync(join(addon, dir.name)).filter((f) => f.endsWith(".toc"))) {
      const toc = readFileSync(join(addon, dir.name, f), "utf8");
      const m = toc.match(/^## Notes:\s*(.+)$/m);
      if (m && /^## X-Curse-Project-ID:/m.test(toc)) return m[1].trim();
    }
}

// (the repository on GitHub, from its remote: owner/name)
function githubRepo(repo: string): string | undefined {
  const r = Bun.spawnSync(["git", "-C", repo, "remote", "get-url", "origin"]);
  return r.stdout.toString().trim().match(/github\.com[:/](.+?)(\.git)?$/)?.[1];
}
const gh = (...args: string[]) => Bun.spawnSync(["gh", ...args]);

type Report = {
  repo: string;
  page: Page;
  id: number;
  // the page: the same, only its format (the editor's HTML, same words), or changed
  state: "same" | "format" | "changed";
  changes: string;
  summary?: string; // CurseForge's, where it differs from the file's
  notes?: string; // the TOCs', where it differs
  github?: { slug: string; now: string }; // GitHub's description, where it differs
};

export async function inspect(repo: string): Promise<Report> {
  const page = readPage(readFileSync(join(repo, "addon", "CURSEFORGE.md"), "utf8"));
  const id = projectId(repo);
  const now = await live(id);
  // (the live page as Markdown: compared as written; still in the editor's
  // HTML: compared as words, both rendered by CurseForge)
  const changes =
    now.DescriptionType === MARKDOWN ? diff(now.Description.trimEnd() + "\n", page.body) : diff(words(now.Description), words(await rendered(page.body)));
  const state = changes ? "changed" : now.DescriptionType === MARKDOWN ? "same" : "format";
  const project = (await call("GET", `projects/${id}`)) as { summary?: string };
  const report: Report = { repo, page, id, state, changes };
  if (page.summary && project.summary?.trim() !== page.summary) report.summary = project.summary ?? "";
  const notes = tocNotes(repo);
  if (page.summary && notes !== page.summary) report.notes = notes ?? "";
  const slug = githubRepo(repo);
  if (slug && page.github) {
    const r = gh("repo", "view", slug, "--json", "description", "-q", ".description");
    const nowGh = r.stdout.toString().trim();
    if (r.exitCode === 0 && nowGh !== page.github) report.github = { slug, now: nowGh };
  }
  return report;
}

function tell(r: Report, verbose: boolean) {
  const name = r.page.title || r.repo;
  const line = (label: string, text: string) => console.log(`  ${label.padEnd(10)} ${text}`);
  console.log(`${name} (project ${r.id})`);
  line("page", r.state === "same" ? "✓ the file" : r.state === "format" ? "the same words, to become Markdown" : "changed (below)");
  line("summary", r.summary === undefined ? "✓ CurseForge's is the file's" : `differs, change it on the project's General page. CurseForge's: "${r.summary}"`);
  if (r.summary !== undefined) line("", `the file's: "${r.page.summary}"`);
  line("TOC Notes", r.notes === undefined ? "✓ the file's summary" : `differ from the file's summary: "${r.notes}"`);
  line("GitHub", r.page.github ? (r.github ? `differs: "${r.github.now}"` : "✓ the file's") : "(no note in the file)");
  if (r.page.body.includes(";")) line("!", "a semicolon in the page: none in what players read");
  if (r.state === "changed" && verbose) console.log(r.changes.replace(/^/gm, "    "));
}

async function apply(r: Report) {
  if (r.state !== "same") {
    await call("PUT", `projects/description/${r.id}`, { id: r.id, description: r.page.body, descriptionType: MARKDOWN });
    const after = await live(r.id);
    if (after.DescriptionType !== MARKDOWN || after.Description.trimEnd() !== r.page.body.trimEnd())
      throw new Error(`project ${r.id}: saved, but the page read back differs from the file: look at it on the site`);
    console.log(`  ✓ project ${r.id}: the live page is the file`);
  }
  if (r.github && r.page.github) {
    const e = gh("repo", "edit", r.github.slug, "--description", r.page.github);
    if (e.exitCode !== 0) throw new Error(`GitHub refused the description: ${e.stderr.toString().trim()}`);
    console.log(`  ✓ ${r.github.slug}: GitHub's description is the file's`);
  }
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const all = args.includes("--all");
  const repos = all ? addons() : [args.find((a) => !a.startsWith("--")) ?? "."];
  if (args.includes("--show")) {
    for (const repo of repos) {
      const page = readPage(readFileSync(join(repo, "addon", "CURSEFORGE.md"), "utf8"));
      console.log(JSON.stringify({ repo, title: page.title, summary: page.summary, github: page.github, body: `${page.body.length} characters` }, null, 2));
    }
    process.exit(0);
  }
  const reports: Report[] = [];
  for (const repo of repos) {
    const r = await inspect(repo);
    reports.push(r);
    tell(r, true);
  }
  const todo = reports.filter((r) => r.state !== "same" || r.github);
  if (!todo.length) {
    console.log("✓ every page is its file");
    process.exit(0);
  }
  if (!args.includes("--apply")) {
    console.log(`(nothing saved: --apply puts ${todo.length} of them up${reports.some((r) => r.summary !== undefined) ? ". A summary is changed by hand, on the General page" : ""})`);
    process.exit(0);
  }
  for (const r of todo) {
    console.log(r.page.title);
    await apply(r);
  }
}
