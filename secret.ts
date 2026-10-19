/**
 * One secret set on every repository beside the kit that uses it, from one
 * read of the clipboard (or made here): a token renewed once, put everywhere
 * at once. The value is never printed.
 *
 *   bun addon-kit/secret.ts WAGO_API_TOKEN          the clipboard, every repo using it
 *   bun addon-kit/secret.ts CURSEFORGE_TOKEN --only palaver,mealbook
 *   bun addon-kit/secret.ts INBOX_EVENTS_TOKEN --generate --vercel ravenpost/inbox
 *
 *   --generate      a new random value made here (a secret of our own, such
 *                   as the inbox's), not the clipboard
 *   --vercel <dir>  also the Vercel project linked in <dir> (production,
 *                   sensitive); it takes effect at its next deploy
 *   --only a,b      these repositories (folder names), not every user
 *   --dry-run       what would be set, nothing set
 *   --yes           no question before setting
 *
 * The users: a repository whose workflows read secrets.NAME, or call another
 * repository's reusable workflow (secrets: inherit) that reads it. The
 * clipboard is read once, before the question: copy the token, then run.
 * Its shape is checked (CurseForge's tokens are UUIDs, Wago's are not), so a
 * token copied for one store never lands in the other's secret.
 */
import { randomBytes } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ── pure (tools.test.ts) ─────────────────────────────────────────────────────
// Is this value fit for that secret? A reason when it isn't.
export function unfit(name: string, value: string): string | undefined {
  if (!value) return "it is empty";
  if (/\s/.test(value)) return "it holds a space or a line break: not a token";
  if (name === "CURSEFORGE_TOKEN" && !UUID.test(value)) return "a CurseForge token is a UUID, this isn't one";
  if (name === "WAGO_API_TOKEN" && UUID.test(value)) return "this is a UUID: CurseForge's token, not Wago's";
  if (value.length < 16) return `${value.length} characters: too short for a token`;
  return undefined;
}

// The repositories using a secret, from their workflows' text:
// workflows[repo] = every workflow file's text. A call to another
// repository's reusable workflow with `secrets: inherit` counts when that
// workflow reads the secret.
export function users(name: string, workflows: Record<string, string[]>): string[] {
  const reads = (text: string) => new RegExp(`secrets\\.${name}\\b`).test(text);
  const out: string[] = [];
  for (const [repo, files] of Object.entries(workflows)) {
    const direct = files.some(reads);
    const inherited = files.some((text) =>
      [...text.matchAll(/uses:\s*salty-max\/([\w.-]+)\/\.github\/workflows\/([\w.-]+)@\S+[\s\S]*?secrets:\s*inherit/g)].some(
        ([, other, file]) => {
          const path = join(ROOT, other, ".github", "workflows", file);
          return existsSync(path) && reads(readFileSync(path, "utf8"));
        },
      ),
    );
    if (direct || inherited) out.push(repo);
  }
  return out.sort();
}

// ── the run ──────────────────────────────────────────────────────────────────
function workflowsOf(): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const d of readdirSync(ROOT, { withFileTypes: true })) {
    const dir = join(ROOT, d.name, ".github", "workflows");
    if (!d.isDirectory() || !existsSync(join(ROOT, d.name, ".git")) || !existsSync(dir)) continue;
    out[d.name] = readdirSync(dir)
      .filter((f) => /\.ya?ml$/.test(f))
      .map((f) => readFileSync(join(dir, f), "utf8"));
  }
  return out;
}

function slugOf(repo: string): string | undefined {
  const r = Bun.spawnSync(["git", "remote", "get-url", "origin"], { cwd: join(ROOT, repo) });
  return r.stdout.toString().trim().match(/github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?$/)?.[1];
}

function setOn(slug: string, name: string, value: string): string | undefined {
  const r = Bun.spawnSync(["gh", "secret", "set", name, "-R", slug], { stdin: Buffer.from(value) });
  return r.exitCode === 0 ? undefined : r.stderr.toString().trim() || `exit ${r.exitCode}`;
}

function setOnVercel(dir: string, name: string, value: string): string | undefined {
  const cwd = join(ROOT, dir);
  if (!existsSync(join(cwd, ".vercel"))) return `${dir} isn't linked to a Vercel project`;
  Bun.spawnSync(["vercel", "env", "rm", name, "production", "-y"], { cwd }); // (absent is fine)
  const r = Bun.spawnSync(["vercel", "env", "add", name, "production", "--sensitive"], { cwd, stdin: Buffer.from(value) });
  return r.exitCode === 0 ? undefined : r.stderr.toString().trim().split("\n").pop() || `exit ${r.exitCode}`;
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const name = args[0];
  const flag = (f: string) => args.includes(f);
  const after = (f: string) => (args.includes(f) ? args[args.indexOf(f) + 1] : undefined);
  if (!name || !/^[A-Z][A-Z0-9_]+$/.test(name)) {
    console.error("secret: give the secret's name first, e.g. WAGO_API_TOKEN");
    process.exit(2);
  }
  const vercel = after("--vercel");
  const only = after("--only")?.split(",").filter(Boolean);

  const value = flag("--generate")
    ? randomBytes(32).toString("base64url")
    : Bun.spawnSync(["pbpaste"]).stdout.toString().trim();
  const why = unfit(name, value);
  if (why) {
    console.error(`secret: the ${flag("--generate") ? "value" : "clipboard"} won't do for ${name}: ${why}. Nothing set.`);
    process.exit(1);
  }

  let repos = users(name, workflowsOf());
  if (only) repos = only;
  if (!repos.length && !vercel) {
    console.error(`secret: no repository's workflows read ${name}. Nothing set.`);
    process.exit(1);
  }
  const shape = UUID.test(value) ? "a UUID" : `${value.length} characters`;
  console.log(`${name}: ${flag("--generate") ? "a new random value" : "the clipboard"} (${shape}), for:`);
  for (const r of repos) console.log(`  ${r}`);
  if (vercel) console.log(`  Vercel: ${vercel} (production, at its next deploy)`);
  if (flag("--dry-run")) {
    console.log("(dry run: nothing set)");
    process.exit(0);
  }
  if (!flag("--yes")) {
    const answer = prompt("Set it? [y/N]");
    if (!/^y(es)?$/i.test(answer ?? "")) {
      console.log("Nothing set.");
      process.exit(0);
    }
  }

  let failed = 0;
  for (const repo of repos) {
    const slug = slugOf(repo);
    const err = slug ? setOn(slug, name, value) : "no GitHub remote";
    console.log(err ? `✗ ${repo}: ${err}` : `✓ ${repo}`);
    if (err) failed++;
  }
  if (vercel) {
    const err = setOnVercel(vercel, name, value);
    console.log(err ? `✗ Vercel ${vercel}: ${err}` : `✓ Vercel ${vercel} (redeploy for it to take effect)`);
    if (err) failed++;
  }
  process.exit(failed ? 1 : 0);
}
