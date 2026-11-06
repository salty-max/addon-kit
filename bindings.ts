/**
 * An addon's key binding that opens its window (a pad button has no keyboard
 * for a slash command, and a cursor must be steered to the minimap button):
 * the file, the function it calls, the labels, and the package carrying it.
 * Read the whole story in docs/controller.md, "Opening by a pad button".
 *
 *   bun addon-kit/bindings.ts check yonder primer      repositories (or an addon folder)
 *   bun scripts/root.ts --run addon-kit/bindings.ts check addon/Yonder      (from an addon)
 *
 *   bindings: ok, Yonder (YONDER_OPEN calls YonderBinding)
 *   bindings: FAILED, Yonder
 *     addon/Yonder/Bindings.xml: none
 *
 * What it checks, for the addon's folder (addon/<Name>/):
 *   - Bindings.xml is there, with one <Binding name="<KEY>_OPEN"
 *     category="BINDING_HEADER_<KEY>"> (the category is what the game's Key
 *     Bindings screen groups by, read as a global; no `header=`) whose body is
 *     one call of a global function, `Function();`.
 *   - the addon's Lua declares that key and that function, either through the
 *     kit (K.binding({ key = "<KEY>", global = "<Function>", ... }), which sets
 *     the labels through L) or, for an addon without the kit (Keyring), by
 *     hand: BINDING_HEADER_<KEY>, BINDING_NAME_<KEY>_OPEN and the function, all
 *     three assigned. The kit's call comes after the language file in every TOC
 *     (its labels are words).
 *   - no TOC lists Bindings.xml (the game loads it by itself), git carries it
 *     (a release packs what git carries) and .pkgmeta doesn't ignore it.
 *   - an addon by hand declares its function in the repository's selene
 *     globals file (<addon>.yml) when it has one.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

export type Found = { name: string; key?: string; global?: string; problems: string[] };

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** The text between the braces of the first `{` at or after `from`, nested braces kept ("" when unbalanced). */
function braced(src: string, from: number): string {
  const open = src.indexOf("{", from);
  if (open < 0) return "";
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) return src.slice(open + 1, i);
  }
  return "";
}

/** Lua without its comments (a commented-out call is no call). */
const noComments = (src: string) => src.replace(/--\[(=*)\[[\s\S]*?\]\1\]/g, "").replace(/--[^\n]*/g, "");
/** A table's text with the tables inside it emptied: its own fields only. */
function topLevel(body: string): string {
  let prev = "";
  while (prev !== body) {
    prev = body;
    body = body.replace(/\{[^{}]*\}/g, "{}");
  }
  return body;
}
/** A glob (`*` any run of characters) as a test of a path. */
const globTest = (glob: string, path: string) =>
  new RegExp("^" + glob.split("*").map((x) => x.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*") + "$").test(path);

/** The addon folders of a path: the folder itself when it holds a TOC, else each addon/<Name> of the repository. */
export function addonFolders(path: string): string[] {
  const p = resolve(path);
  const hasToc = (d: string) => existsSync(d) && readdirSync(d).some((f) => f.endsWith(".toc"));
  if (hasToc(p)) return [p];
  const dir = join(p, "addon");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .map((n) => join(dir, n))
    .filter(hasToc)
    .sort();
}

const tocsOf = (dir: string) => readdirSync(dir).filter((f) => f.endsWith(".toc"));
const luaOf = (dir: string) =>
  readdirSync(dir).filter((f) => f.endsWith(".lua") && f !== "Kit.lua" && !/^(Text_|Data_)/.test(f));

export function checkAddon(dir: string): Found {
  const name = basename(dir);
  const problems: string[] = [];
  const found: Found = { name, problems };
  const bad = (why: string) => problems.push(why);
  const xmlPath = join(dir, "Bindings.xml");
  if (!existsSync(xmlPath)) {
    bad("Bindings.xml: none");
    return found;
  }
  const xml = readFileSync(xmlPath, "utf8").replace(/<!--[\s\S]*?-->/g, "");
  if (!/^\s*(?:<\?xml[^>]*\?>\s*)?<Bindings>[\s\S]*<\/Bindings>\s*$/.test(xml)) {
    bad("Bindings.xml: the root is not <Bindings>…</Bindings>");
    return found;
  }
  const bindings = [...xml.matchAll(/<Binding\s+([^>]*)>([\s\S]*?)<\/Binding>/g)];
  if (bindings.length !== 1) {
    bad(`Bindings.xml: ${bindings.length} bindings, wants exactly one (the window's)`);
    return found;
  }
  const attrs = Object.fromEntries([...bindings[0][1].matchAll(/([\w:]+)\s*=\s*"([^"]*)"/g)].map((m) => [m[1], m[2]]));
  const action = attrs.name ?? "";
  const key = action.match(/^([A-Z][A-Z0-9]*)_OPEN$/)?.[1];
  if (!key) bad(`Bindings.xml: name "${action}" is not <KEY>_OPEN (capitals and digits)`);
  else found.key = key;
  if (key && attrs.category !== `BINDING_HEADER_${key}`)
    bad(`Bindings.xml: category "${attrs.category ?? ""}" is not "BINDING_HEADER_${key}" (the screen groups by it)`);
  if ("header" in attrs) bad(`Bindings.xml: no header= (the category is the addon's heading)`);
  const call = bindings[0][2].trim().match(/^([A-Za-z_][A-Za-z0-9_]*)\(\);?$/);
  if (!call) bad(`Bindings.xml: the body is not one call of a global function (Function();)`);
  else found.global = call[1];
  if (!key || !call) return found;
  const fn = call[1];

  // The Lua: the kit's call, else the three assignments by hand.
  const files = luaOf(dir).map((f) => ({ f, src: noComments(readFileSync(join(dir, f), "utf8")) }));
  const kitCall = files.flatMap(({ f, src }) =>
    [...src.matchAll(/\bbinding\(\s*\{/g)].map((m) => ({ f, body: braced(src, m.index!) })),
  );
  if (kitCall.length > 1) bad(`${kitCall.length} binding({...}) calls, wants one`);
  if (kitCall.length >= 1) {
    const { f, body } = kitCall[0];
    const own = topLevel(body);
    const field = (k: string) => own.match(new RegExp(`\\b${k}\\s*=\\s*"([^"]*)"`))?.[1];
    if (field("key") !== key) bad(`${f}: binding key "${field("key") ?? ""}" is not "${key}" (Bindings.xml)`);
    if (field("global") !== fn) bad(`${f}: binding global "${field("global") ?? ""}" is not "${fn}" (Bindings.xml calls it)`);
    if (!/\bname\s*=/.test(own)) bad(`${f}: binding has no name (the heading and the label)`);
    if (!/\btoggle\s*=/.test(own)) bad(`${f}: binding has no toggle (what the minimap button's click does)`);
    const kit = existsSync(join(dir, "Kit.lua")) ? readFileSync(join(dir, "Kit.lua"), "utf8") : "";
    if (!/function K\.binding\(/.test(kit)) bad(`Kit.lua has no K.binding: bun run kit:sync`);
    // (its labels are words: the language file loads first)
    for (const toc of tocsOf(dir)) {
      const lines = readFileSync(join(dir, toc), "utf8").split("\n").map((l) => l.trim());
      const text = lines.findIndex((l) => /^Text_/.test(l));
      const at = lines.indexOf(f);
      if (at < 0) bad(`${toc} doesn't load ${f}, which makes the binding`);
      else if (text >= 0 && at < text) bad(`${toc} loads ${f} before the language file (the labels are words)`);
    }
  } else {
    // (a local is no global: the game's screen and the key press could not reach it)
    const all = files.flatMap((x) => x.src.split("\n")).filter((l) => !/^\s*local\b/.test(l)).join("\n");
    const set = (g: string) =>
      new RegExp(`(?:^|[^\\w.])${g}\\s*=[^=]|\\b_G\\.${g}\\s*=[^=]|\\b_G\\["${g}"\\]\\s*=[^=]`, "m").test(all);
    if (!set(`BINDING_HEADER_${key}`)) bad(`no BINDING_HEADER_${key} = "…" in the Lua (and no K.binding call)`);
    if (!set(`BINDING_NAME_${key}_OPEN`)) bad(`no BINDING_NAME_${key}_OPEN = "…" in the Lua (the label the screen shows)`);
    if (!new RegExp(`\\bfunction\\s+${fn}\\s*\\(|(?:^|[^\\w.])${fn}\\s*=\\s*function`, "m").test(all))
      bad(`no global function ${fn} in the Lua (Bindings.xml calls it)`);
    // (selene must know a global the addon makes by hand)
    const repo = dirname(dirname(dir));
    for (const y of readdirSync(repo).filter((n) => n.endsWith(".yml") && n !== "wow.yml")) {
      const globals = readFileSync(join(repo, y), "utf8");
      if (!new RegExp(`^  ${fn}:`, "m").test(globals)) bad(`${y} lacks ${fn} in its globals (selene)`);
    }
  }

  // The package.
  for (const toc of tocsOf(dir))
    if (/^\s*Bindings\.xml\s*$/m.test(readFileSync(join(dir, toc), "utf8")))
      bad(`${toc} lists Bindings.xml (the game loads it by itself)`);
  const repo = dirname(dirname(dir));
  const rel = `addon/${name}/Bindings.xml`;
  const inGit = spawnSync("git", ["ls-files", "--error-unmatch", "--", rel], { cwd: repo, stdio: "ignore" });
  if (inGit.status !== 0 && existsSync(join(repo, ".git"))) bad(`${rel}: git doesn't carry it (a release would leave it out)`);
  const pkgmeta = join(repo, ".pkgmeta");
  if (existsSync(pkgmeta)) {
    let inIgnore = false;
    for (const line of readFileSync(pkgmeta, "utf8").split("\n")) {
      if (/^\S/.test(line)) inIgnore = /^ignore:\s*$/.test(line);
      const item = inIgnore && line.match(/^\s+-\s+["']?(.+?)["']?\s*$/);
      if (item && (globTest(item[1], "Bindings.xml") || globTest(item[1].replace(/\/$/, ""), rel) || rel.startsWith(item[1].replace(/\/$/, "") + "/"))) {
        bad(`.pkgmeta ignores Bindings.xml (${item[1]})`);
        break;
      }
    }
  }
  return found;
}

function main(argv: string[]) {
  const [cmd, ...paths] = argv;
  if (cmd !== "check") {
    console.error("usage: bindings.ts check <repository or addon folder>…");
    return 2;
  }
  let code = 0;
  for (const path of paths.length ? paths : ["."]) {
    const folders = addonFolders(path);
    if (!folders.length) {
      console.error(`bindings: ${path}: no addon folder (addon/<Name>/ with a TOC)`);
      code = 1;
    }
    for (const dir of folders) {
      const r = checkAddon(dir);
      if (r.problems.length === 0) console.log(`bindings: ok, ${r.name} (${r.key}_OPEN calls ${r.global})`);
      else {
        code = 1;
        console.error(`bindings: FAILED, ${r.name}`);
        for (const p of r.problems) console.error(`  ${p}`);
      }
    }
  }
  return code;
}

if (import.meta.main) process.exit(main(process.argv.slice(2)));
