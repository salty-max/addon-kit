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

if (import.meta.main) {
  const args = process.argv.slice(2);
  const repo = args.find((a) => !a.startsWith("--")) ?? ".";
  const page = readPage(readFileSync(join(repo, "addon", "CURSEFORGE.md"), "utf8"));
  if (args.includes("--show")) {
    console.log(JSON.stringify({ title: page.title, summary: page.summary, github: page.github, body: `${page.body.length} characters` }, null, 2));
    process.exit(0);
  }
  if (page.body.includes(";")) console.log("! a semicolon in the page: none in what players read");
  const id = projectId(repo);
  const now = await live(id);
  // (the live page as Markdown: compared as written; still in the editor's
  // HTML: compared as words, both rendered by CurseForge)
  const changes =
    now.DescriptionType === MARKDOWN ? diff(now.Description.trimEnd() + "\n", page.body) : diff(words(now.Description), words(await rendered(page.body)));
  const kind = now.DescriptionType === MARKDOWN ? "Markdown" : `the editor's HTML (type ${now.DescriptionType}), to become Markdown`;
  if (!changes && now.DescriptionType === MARKDOWN) {
    console.log(`✓ project ${id} (${page.title}): the live page is the file`);
    process.exit(0);
  }
  console.log(`project ${id} (${page.title}), live page in ${kind}:`);
  console.log(changes || "  the same words (only the format changes)");
  if (!args.includes("--apply")) {
    console.log("(nothing saved: --apply replaces the live page)");
    process.exit(0);
  }
  await call("PUT", `projects/description/${id}`, { id, description: page.body, descriptionType: MARKDOWN });
  const after = await live(id);
  if (after.DescriptionType !== MARKDOWN || after.Description.trimEnd() !== page.body.trimEnd()) {
    console.error("✗ saved, but the page read back differs from the file: look at it on the site");
    process.exit(1);
  }
  console.log(`✓ project ${id}: the live page is the file`);
}
