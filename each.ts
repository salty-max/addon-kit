/**
 * One command in every addon beside the kit (~/code/wow-addons), one after
 * the other: a line for each that passed, the end of the output of each that
 * failed, and a non-zero exit if one did. A script, not a model: the kit
 * synced into every addon, every addon's check before a push.
 *
 *   bun addon-kit/each.ts [which] [--verbose] [--parallel] -- <command>
 *
 *   command     its words as given, no shell between (quotes, $ and globs
 *               reach the program as typed); one word alone is a shell line
 *               ('git status --short && git log -1'), run by /bin/sh
 *
 *   which       the addons (a repository with addon/<Name>/*.toc), else:
 *     --kit       the addons with a kit copy (package.json's kit:sync)
 *     --all       every repository beside the kit, the kit's too
 *     --only a,b  these (folder names; one that isn't a repository is refused)
 *     --skip a,b  not these (the same)
 *   --verbose   every output as it comes, not only a failure's
 *   --parallel  all at once (the output still one addon at a time)
 *
 *   bun addon-kit/each.ts --kit -- bun run kit:sync
 *   bun addon-kit/each.ts -- bun run check
 *   bun addon-kit/each.ts --all -- git status --short
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { familyRoot } from "./root";

// the family folder, from a worktree too (root.ts); found when first asked
let root: string | undefined;
const ROOT = () => (root ??= familyRoot());
const TAIL = 30;

export type Options = { which: "addons" | "kit" | "all"; only?: string[]; skip?: string[]; verbose: boolean; parallel: boolean; command: string[] };

/** The program and its arguments: the words as given, or a shell line when there's one word. */
export const argvOf = (command: string[]) => (command.length === 1 ? ["/bin/sh", "-c", command[0]] : command);

export function parse(argv: string[]): Options | string {
  const dash = argv.indexOf("--");
  if (dash < 0 || dash === argv.length - 1) return "give the command after --";
  const flags = argv.slice(0, dash);
  const o: Options = { which: "addons", verbose: false, parallel: false, command: argv.slice(dash + 1) };
  for (let i = 0; i < flags.length; i++) {
    const f = flags[i];
    if (f === "--kit") o.which = "kit";
    else if (f === "--all") o.which = "all";
    else if (f === "--verbose") o.verbose = true;
    else if (f === "--parallel") o.parallel = true;
    else if (f === "--only" || f === "--skip") {
      const list = (flags[++i] ?? "").split(",").filter(Boolean);
      if (!list.length) return `${f} takes folder names, a,b`;
      o[f === "--only" ? "only" : "skip"] = list;
    } else return `unknown option ${f}`;
  }
  return o;
}

const isRepo = (dir: string) => existsSync(join(dir, ".git"));
function isAddon(dir: string): boolean {
  const addon = join(dir, "addon");
  if (!existsSync(addon)) return false;
  return readdirSync(addon, { withFileTypes: true }).some(
    (d) => d.isDirectory() && readdirSync(join(addon, d.name)).some((f) => f.endsWith(".toc")),
  );
}
function hasKit(dir: string): boolean {
  const pkg = join(dir, "package.json");
  return existsSync(pkg) && /"kit:sync"/.test(readFileSync(pkg, "utf8"));
}

/** The names --only and --skip give that are no repository of the family's (a typo would run nothing, quietly). */
export const unknown = (names: string[], o: Options) => [...(o.only ?? []), ...(o.skip ?? [])].filter((n) => !names.includes(n));

export function pick(names: string[], o: Options, test: { addon: (n: string) => boolean; kit: (n: string) => boolean }): string[] {
  let list = names.filter((n) => (o.which === "all" ? true : o.which === "kit" ? test.kit(n) : test.addon(n)));
  if (o.only) list = o.only.filter((n) => names.includes(n));
  if (o.skip) list = list.filter((n) => !o.skip!.includes(n));
  return list;
}

async function one(name: string, o: Options): Promise<{ name: string; ok: boolean; code: number; out: string; secs: number }> {
  const t0 = performance.now();
  const p = Bun.spawn(argvOf(o.command), {
    cwd: join(ROOT(), name),
    stdout: o.verbose && !o.parallel ? "inherit" : "pipe",
    stderr: o.verbose && !o.parallel ? "inherit" : "pipe",
  });
  const [out, err] = o.verbose && !o.parallel ? ["", ""] : await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text()]);
  const code = await p.exited;
  return { name, ok: code === 0, code, out: (out + err).trimEnd(), secs: (performance.now() - t0) / 1000 };
}

function report(r: Awaited<ReturnType<typeof one>>, o: Options) {
  console.log(`${r.ok ? "✓" : "✗"} ${r.name} (${r.secs.toFixed(1)} s${r.ok ? "" : `, exit ${r.code}`})`);
  if (r.out && (o.verbose || !r.ok)) {
    const lines = r.out.split("\n");
    const shown = o.verbose ? lines : lines.slice(-TAIL);
    if (!o.verbose && lines.length > TAIL) console.log(`  … ${lines.length - TAIL} lines above`);
    console.log(shown.map((l) => `  ${l}`).join("\n"));
  }
}

if (import.meta.main) {
  const o = parse(process.argv.slice(2));
  if (typeof o === "string") {
    console.error(`each: ${o}`);
    process.exit(2);
  }
  const names = readdirSync(ROOT(), { withFileTypes: true })
    .filter((d) => d.isDirectory() && isRepo(join(ROOT(), d.name)))
    .map((d) => d.name)
    .sort();
  const strays = unknown(names, o);
  if (strays.length) {
    console.error(`each: no repository ${strays.join(", ")} in ${ROOT()}`);
    process.exit(2);
  }
  const list = pick(names, o, { addon: (n) => isAddon(join(ROOT(), n)), kit: (n) => hasKit(join(ROOT(), n)) });
  if (!list.length) {
    console.error("each: no repository matches");
    process.exit(2);
  }
  console.log(`${o.command.join(" ")}  in ${list.join(", ")}\n`);
  const results = [];
  if (o.parallel) {
    for (const r of await Promise.all(list.map((n) => one(n, o)))) {
      report(r, o);
      results.push(r);
    }
  } else {
    for (const n of list) {
      if (o.verbose) console.log(`── ${n}`);
      const r = await one(n, o);
      report(r, o);
      results.push(r);
    }
  }
  const failed = results.filter((r) => !r.ok).map((r) => r.name);
  console.log(failed.length ? `\n${failed.length} of ${results.length} failed: ${failed.join(", ")}` : `\nall ${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
}
