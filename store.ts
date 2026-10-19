/**
 * An addon's store pages on CurseForge and Wago, from its `addon/CURSEFORGE.md`:
 * the file as the page, Markdown, its comments left out (the summary's and
 * the GitHub description's notes stay in the file). On Wago the summary goes
 * up with the page (its form carries every field); on CurseForge it is
 * checked only (below).
 *
 *   bun ../addon-kit/store.ts <addon repo>           the live page against the
 *                                                    file: what would change
 *                                                    (nothing is saved)
 *   bun ../addon-kit/store.ts <addon repo> --apply   the live page replaced by
 *                                                    the file, then read back
 *   bun ../addon-kit/store.ts <addon repo> --show    what the file gives
 *   bun ../addon-kit/store.ts --all [--apply]        every addon beside the kit
 *   bun ../addon-kit/store.ts --ui                   the same in a browser page,
 *                                                    from this computer
 *                                                    (store-ui.ts)
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
  const r = Bun.spawnSync(["diff", "-u", "--label", "the live page", "--label", "CURSEFORGE.md", join(dir, "live"), join(dir, "file")]);
  return r.stdout.toString();
}

// ── Wago ─────────────────────────────────────────────────────────────────────
// Wago Addons' dashboard (Laravel and Inertia, read 19 October 2026): a
// project's settings page carries the whole addon in its data (#app's
// data-page: props.addon, props.attachedCategories), saved by POST
// /developers/projects/create/<slug> with every field of its form, the
// description and the summary from the file, the rest as read (nothing
// wiped), the XSRF-TOKEN cookie's value as X-XSRF-TOKEN. It trims the text's
// last line break. The session: the browser's cookie for addons.wago.io in
// ~/.config/wow-addons/wago-cookie (or WAGO_COOKIE), as CurseForge's.
const WAGO = "https://addons.wago.io";

function wagoCookie(): string | undefined {
  const env = process.env.WAGO_COOKIE;
  if (env) return env.trim();
  const file = join(homedir(), ".config", "wow-addons", "wago-cookie");
  if (existsSync(file)) return readFileSync(file, "utf8").trim().replace(/^cookie:\s*/i, "");
}

export function wagoId(repo: string): string | undefined {
  const addon = join(repo, "addon");
  for (const dir of readdirSync(addon, { withFileTypes: true }).filter((d) => d.isDirectory()))
    for (const f of readdirSync(join(addon, dir.name)).filter((f) => f.endsWith(".toc"))) {
      const m = readFileSync(join(addon, dir.name, f), "utf8").match(/^## X-Wago-ID:\s*(\S+)/m);
      if (m) return m[1];
    }
}

// The session's cookies, kept for the run and renewed from each answer's
// Set-Cookie: Wago (Laravel) hands out a new XSRF token as it goes, and a
// save sent with the saved file's older one is refused (419, "page expired")
// while reads still pass.
let jar: Map<string, string> | undefined;
export function cookieJar(cookie: string): Map<string, string> {
  const m = new Map<string, string>();
  for (const part of cookie.split(/;\s*/)) {
    const i = part.indexOf("=");
    if (i > 0) m.set(part.slice(0, i).trim(), part.slice(i + 1).trim());
  }
  return m;
}
export function renew(jar: Map<string, string>, setCookies: string[]) {
  for (const c of setCookies) {
    const first = c.split(";")[0];
    const i = first.indexOf("=");
    if (i > 0) jar.set(first.slice(0, i).trim(), first.slice(i + 1).trim());
  }
}

async function wagoFetch(path: string, init: { method?: string; body?: unknown } = {}) {
  jar ??= cookieJar(wagoCookie()!);
  const cookie = [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
  const xsrf = decodeURIComponent(jar.get("XSRF-TOKEN") ?? "");
  const r = await fetch(`${WAGO}${path}`, {
    method: init.method ?? "GET",
    headers: {
      cookie,
      "X-XSRF-TOKEN": xsrf,
      "X-Requested-With": "XMLHttpRequest",
      accept: "text/html,application/xhtml+xml",
      ...(init.body ? { "content-type": "application/json" } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  renew(jar, r.headers.getSetCookie());
  if (r.status === 401 || r.status === 419 || /\/login/.test(r.url)) throw new Error(`Wago said ${r.status}: the session has expired, copy its cookie again`);
  if (!r.ok) throw new Error(`Wago said ${r.status} to ${init.method ?? "GET"} ${path}`);
  return r;
}

// (a page's Inertia data, from its HTML)
async function wagoPage(path: string): Promise<Record<string, any>> {
  const html = await (await wagoFetch(path)).text();
  const m = html.match(/id="app"[^>]*data-page="([^"]*)"/);
  if (!m) throw new Error(`Wago's ${path} carries no page data (signed out, or a challenge in the way)`);
  const json = m[1].replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
  return JSON.parse(json).props;
}

let wagoSlugs: Map<string, string> | undefined;
async function wagoSlug(id: string): Promise<string | undefined> {
  if (!wagoSlugs) {
    const props = await wagoPage("/developers");
    wagoSlugs = new Map((props.addons ?? []).map((a: { id: string; slug: string }) => [a.id, a.slug]));
  }
  return wagoSlugs.get(id);
}

const uncommented = (text: string) => text.replace(/<!--[\s\S]*?-->/g, "").replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();

export type Say = (line: string) => void;

export type WagoReport = {
  slug: string;
  props: Record<string, any>;
  // the page: the file, the same words with the comments a hand paste left, or changed
  state: "same" | "comments" | "changed";
  changes: string;
  summary?: string; // Wago's, where it differs (saved with the page)
};

async function inspectWago(repo: string, page: Page): Promise<WagoReport | string> {
  if (!wagoCookie()) return "no session (~/.config/wow-addons/wago-cookie)";
  const id = wagoId(repo);
  if (!id) return "no X-Wago-ID in the TOCs";
  const slug = await wagoSlug(id);
  if (!slug) return `project ${id} isn't among the dashboard's`;
  const props = await wagoPage(`/developers/projects/${slug}/settings`);
  const now: string = props.addon.description ?? "";
  const body = page.body.trimEnd();
  const state = now === body ? "same" : uncommented(now) === body ? "comments" : "changed";
  const report: WagoReport = { slug, props, state, changes: state === "changed" ? diff(uncommented(now) + "\n", page.body) : "" };
  if (page.summary && props.addon.summary !== page.summary) report.summary = props.addon.summary ?? "";
  return report;
}

async function applyWago(w: WagoReport, page: Page, say: Say) {
  const a = w.props.addon;
  const data = {
    display_name: a.display_name,
    slug: a.slug,
    summary: page.summary ?? a.summary,
    description: page.body.trimEnd(),
    website: a.website,
    license_url: a.license_url,
    source_url: a.source_url,
    wiki_url: a.wiki_url,
    support_url: a.support_url,
    discord_url: a.discord_url,
    thumbnail: null,
    categories: w.props.attachedCategories,
    is_hidden_from_external: a.is_hidden_from_external,
    is_unlisted: a.is_unlisted,
  };
  await wagoFetch(`/developers/projects/create/${w.slug}`, { method: "POST", body: data });
  const after = (await wagoPage(`/developers/projects/${w.slug}/settings`)).addon;
  if (after.description !== data.description || after.summary !== data.summary)
    throw new Error(`Wago's ${w.slug}: saved, but the page read back differs from the file: look at it on the site`);
  for (const k of ["display_name", "slug", "website", "source_url", "is_unlisted", "is_hidden_from_external"])
    if (after[k] !== a[k]) throw new Error(`Wago's ${w.slug}: ${k} changed in the save: look at it on the site`);
  say(`  ✓ Wago's ${w.slug}: the page and summary are the file's`);
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
export function githubRepo(repo: string): string | undefined {
  const r = Bun.spawnSync(["git", "-C", repo, "remote", "get-url", "origin"]);
  return r.stdout.toString().trim().match(/github\.com[:/](.+?)(\.git)?$/)?.[1];
}
const gh = (...args: string[]) => Bun.spawnSync(["gh", ...args]);

export type Report = {
  repo: string;
  page: Page;
  id: number;
  // the page: the same, only its format (the editor's HTML, same words), or changed
  state: "same" | "format" | "changed";
  changes: string;
  summary?: string; // CurseForge's, where it differs from the file's
  notes?: string; // the TOCs', where it differs
  github?: { slug: string; now: string }; // GitHub's description, where it differs
  wago: WagoReport | string; // Wago's page, or why it wasn't read
};

export async function inspect(repo: string): Promise<Report> {
  const page = readPage(readFileSync(join(repo, "addon", "CURSEFORGE.md"), "utf8"));
  const id = projectId(repo);
  // (CurseForge now and then answers with a copy from before the last save:
  // a page that isn't the file read again, a few times, before it's told; a
  // copy can't be the file by chance, so any read that is the file settles it)
  const isFile = (p: Live) => p.DescriptionType === MARKDOWN && p.Description.trimEnd() === page.body.trimEnd();
  let now = await live(id);
  for (let i = 0; i < 3 && !isFile(now); i++) {
    await Bun.sleep(1500);
    const again = await live(id);
    if (isFile(again)) now = again;
  }
  // (the live page as Markdown: compared as written; still in the editor's
  // HTML: compared as words, both rendered by CurseForge)
  const changes =
    now.DescriptionType === MARKDOWN ? diff(now.Description.trimEnd() + "\n", page.body) : diff(words(now.Description), words(await rendered(page.body)));
  const state = changes ? "changed" : now.DescriptionType === MARKDOWN ? "same" : "format";
  const project = (await call("GET", `projects/${id}`)) as { summary?: string };
  const report: Report = { repo, page, id, state, changes, wago: await inspectWago(repo, page) };
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

export function tell(r: Report, verbose: boolean, say: Say = console.log) {
  const name = r.page.title || r.repo;
  const line = (label: string, text: string) => say(`  ${label.padEnd(10)} ${text}`);
  say(`${name} (project ${r.id})`);
  line("page", r.state === "same" ? "✓ the file" : r.state === "format" ? "the same words, to become Markdown" : `changed${verbose ? " (below)" : ""}`);
  line("summary", r.summary === undefined ? "✓ CurseForge's is the file's" : `differs, change it on the project's General page. CurseForge's: "${r.summary}"`);
  if (r.summary !== undefined) line("", `the file's: "${r.page.summary}"`);
  line("TOC Notes", r.notes === undefined ? "✓ the file's summary" : `differ from the file's summary: "${r.notes}"`);
  line("GitHub", r.page.github ? (r.github ? `differs: "${r.github.now}"` : "✓ the file's") : "(no note in the file)");
  const w = r.wago;
  if (typeof w === "string") line("Wago", `not read: ${w}`);
  else {
    line("Wago page", w.state === "same" ? "✓ the file" : w.state === "comments" ? "the same words, the file's comments to go" : `changed${verbose ? " (below)" : ""}`);
    line("Wago sum.", w.summary === undefined ? "✓ the file's" : `differs, saved with the page: "${w.summary}"`);
  }
  if (r.page.body.includes(";")) line("!", "a semicolon in the page: none in what players read");
  if (r.state === "changed" && verbose) say(r.changes.replace(/^/gm, "    "));
  if (typeof w !== "string" && w.state === "changed" && verbose) say(w.changes.replace(/^/gm, "    "));
}
export const wagoDue = (r: Report) => typeof r.wago !== "string" && (r.wago.state !== "same" || r.wago.summary !== undefined);

/** What --apply puts up for this addon: CurseForge's page, Wago's page and summary, GitHub's description. */
export function due(r: Report): string[] {
  return [r.state !== "same" && "CurseForge's page", wagoDue(r) && "Wago's page and summary", r.github && r.page.github && "GitHub's description"].filter((x): x is string => !!x);
}

export async function apply(r: Report, say: Say = console.log) {
  if (r.state !== "same") {
    await call("PUT", `projects/description/${r.id}`, { id: r.id, description: r.page.body, descriptionType: MARKDOWN });
    // (read back, a few seconds given: right after a save CurseForge may still
    // answer with the page before it, Keyring's on 19 October 2026)
    const same = (p: Live) => p.DescriptionType === MARKDOWN && p.Description.trimEnd() === r.page.body.trimEnd();
    let after = await live(r.id);
    for (let i = 0; i < 8 && !same(after); i++) {
      await Bun.sleep(1500);
      after = await live(r.id);
    }
    if (!same(after)) throw new Error(`project ${r.id}: saved, but the page read back differs from the file: look at it on the site`);
    say(`  ✓ project ${r.id}: the live page is the file`);
  }
  if (wagoDue(r)) await applyWago(r.wago as WagoReport, r.page, say);
  if (r.github && r.page.github) {
    const e = gh("repo", "edit", r.github.slug, "--description", r.page.github);
    if (e.exitCode !== 0) throw new Error(`GitHub refused the description: ${e.stderr.toString().trim()}`);
    say(`  ✓ ${r.github.slug}: GitHub's description is the file's`);
  }
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  if (args.includes("--ui")) {
    await (await import("./store-ui.ts")).open({ demo: args.includes("--demo") });
    await new Promise(() => {}); // (serving until stopped)
  }
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
  const todo = reports.filter((r) => due(r).length);
  if (!todo.length) {
    console.log(reports.some((r) => typeof r.wago === "string") ? "✓ every page read is its file (Wago not read)" : "✓ every page is its file");
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
