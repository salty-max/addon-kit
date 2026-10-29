/**
 * The family's extension to harness/status.ts (harness.toml [extensions]
 * status): whether a repository's test build in iCloud (the addon's zip,
 * Ravenpost's Windows exe) is its HEAD. extend() adds the repo's `build`, the
 * table's "zip" column and the lines for "wants a hand".
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { StatusContext } from "./status";

const ICLOUD = join(homedir(), "Library", "Mobile Documents", "com~apple~CloudDocs", "WoW addons test");

export type Build = { file: string; version: string; state: "current" | "behind" | "unknown"; behind?: number };

// A test build's version from its file name: <Name>-<version>.zip, or
// Ravenpost's ravenpost-<version>-windows-x64.exe.
export function buildVersion(file: string, name: string): string | undefined {
  if (name === "ravenpost") return file.match(/^ravenpost-(.+)-windows-x64\.exe$/)?.[1];
  const prefix = `${name}-`;
  return file.startsWith(prefix) && file.endsWith(".zip") ? file.slice(prefix.length, -4) : undefined;
}


// What ships, as git pathspecs: the addon's folders (not its store page or
// its tests), Ravenpost's app (not its inbox, a site of its own, nor its
// tests and docs). A test build is behind only where these changed.
export function ships(name: string): string[] {
  return name === "ravenpost"
    ? [".", ":(exclude)inbox", ":(exclude)testdata", ":(exclude)*_test.go", ":(exclude)*.md"]
    : ["addon", ":(exclude)addon/CURSEFORGE.md", ":(exclude)addon/test"];
}


// The addon's package name (its zip's): scripts/package.ts's NAME, else the
// folder under addon/ holding a TOC; Ravenpost's exe by the repo's name.
export function buildName(dir: string, name: string): string | undefined {
  if (name === "ravenpost") return name;
  const pkg = join(dir, "scripts", "package.ts");
  if (existsSync(pkg)) {
    const m = readFileSync(pkg, "utf8").match(/^const NAME = "([^"]+)"/m);
    if (m) return m[1];
  }
  const addon = join(dir, "addon");
  if (!existsSync(addon)) return undefined;
  for (const d of readdirSync(addon, { withFileTypes: true })) {
    if (d.isDirectory() && readdirSync(join(addon, d.name)).some((f) => f.endsWith(".toc"))) return d.name;
  }
  return undefined;
}

async function build(dir: string, name: string, git: StatusContext["git"]): Promise<Build | undefined> {
  const pkg = buildName(dir, name);
  if (!pkg || !existsSync(ICLOUD)) return undefined;
  // (one build an addon, the rule; should two be there, the newest)
  // (Ravenpost's builds sit in the folder's Ravenpost/ subfolder, every addon's zip at its top)
  const where = name === "ravenpost" ? join(ICLOUD, "Ravenpost") : ICLOUD;
  if (!existsSync(where)) return undefined;
  const found = readdirSync(where)
    .map((file) => ({ file, version: buildVersion(file, pkg) }))
    .filter((b): b is { file: string; version: string } => !!b.version)
    .sort((a, b) => statSync(join(where, b.file)).mtimeMs - statSync(join(where, a.file)).mtimeMs);
  if (!found.length) return undefined;
  const { file, version } = found[0];
  const sha = await git(dir, "rev-parse", "--verify", "-q", `${version.replace(/-dirty$/, "")}^{commit}`);
  if (!sha.ok) {
    // (WoWLocker names its zip by the addon's version, its tags the site's:
    // the TOC's version, then)
    const toc = tocVersion(dir, pkg);
    return { file, version, state: toc && version.replace(/^v/, "") === toc ? "current" : "unknown" };
  }
  const count = await git(dir, "rev-list", "--count", `${sha.out}..HEAD`, "--", ...ships(name));
  const behind = Number(count.out) || 0;
  return { file, version, state: behind ? "behind" : "current", behind };
}

function tocVersion(dir: string, pkg: string): string | undefined {
  const folder = join(dir, "addon", pkg);
  if (!existsSync(folder)) return undefined;
  const toc = readdirSync(folder).find((f) => f.endsWith(".toc"));
  return toc ? readFileSync(join(folder, toc), "utf8").match(/^## Version: *(\S+)/m)?.[1] : undefined;
}


export async function extend({ name, dir, git }: StatusContext) {
  const b = await build(dir, name, git);
  if (!b) return undefined;
  const column = b.state === "current" ? "zip ✓" : b.state === "behind" ? `zip −${b.behind}` : "zip ?";
  const attention: string[] = [];
  if (b.state === "behind") attention.push(`test build ${b.file} is ${b.behind} commit${b.behind === 1 ? "" : "s"} behind HEAD`);
  if (b.state === "unknown") attention.push(`test build ${b.file}: not a commit of this repository`);
  return { fields: { build: b }, column, attention };
}
