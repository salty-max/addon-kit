// The binding check (bindings.ts) on scratch addons: what it accepts, and each thing it refuses (bun test).
import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { addonFolders, checkAddon } from "./bindings";

const made: string[] = [];
afterAll(() => {
  for (const d of made) rmSync(d, { recursive: true, force: true });
});

const xml = (key = "X", fn = "XBinding", extra = "", category = `BINDING_HEADER_${key}`) =>
  `<Bindings>\n\t<Binding name="${key}_OPEN" category="${category}"${extra}>\n\t\t${fn}();\n\t</Binding>\n</Bindings>\n`;
const toc = "## Interface: 11509\n## Title: X\nKit.lua\nLocale.lua\nText_[TextLocale].lua\nCore.lua\n";
const kitCall = (key = "X", fn = "XBinding") =>
  `local _, ns = ...\nns.kit.binding({\n  key = "${key}",\n  name = "X",\n  global = "${fn}",\n  toggle = function() ns.toggle() end,\n})\n`;

/** A scratch repository holding addon/X, git carrying what `track` lists. */
function scratch(files: Record<string, string>, o: { track?: boolean; pkgmeta?: string; yml?: string } = {}) {
  const root = mkdtempSync(join(tmpdir(), "bindings-"));
  made.push(root);
  const dir = join(root, "addon", "X");
  mkdirSync(dir, { recursive: true });
  const all: Record<string, string> = { "X_Vanilla.toc": toc, "Kit.lua": "function K.binding(o) end\n", ...files };
  for (const [f, text] of Object.entries(all)) writeFileSync(join(dir, f), text);
  if (o.pkgmeta) writeFileSync(join(root, ".pkgmeta"), o.pkgmeta);
  if (o.yml) writeFileSync(join(root, "x.yml"), o.yml);
  const git = (...a: string[]) => Bun.spawnSync(["git", "-c", "user.name=t", "-c", "user.email=t@t", ...a], { cwd: root });
  git("init", "-q");
  git("add", "-A");
  if (o.track === false) git("rm", "-q", "--cached", "addon/X/Bindings.xml");
  git("commit", "-q", "-m", "x");
  return { root, dir };
}

describe("the binding check", () => {
  test("the kit's way, whole, is accepted", () => {
    const { dir } = scratch({ "Bindings.xml": xml(), "Core.lua": kitCall() });
    const r = checkAddon(dir);
    expect(r.problems).toEqual([]);
    expect(r.key).toBe("X");
    expect(r.global).toBe("XBinding");
  });

  test("a repository and an addon folder both find the folder", () => {
    const { root, dir } = scratch({ "Bindings.xml": xml(), "Core.lua": kitCall() });
    expect(addonFolders(root)).toEqual([dir]);
    expect(addonFolders(dir)).toEqual([dir]);
  });

  test("a folder for one game beside the addon (a handover) is no addon, a file in addon/ is no folder", () => {
    const { root, dir } = scratch({ "Bindings.xml": xml(), "Core.lua": kitCall(), "X_Camelot.toc": toc });
    const other = join(root, "addon", "Old");
    mkdirSync(other);
    writeFileSync(join(other, "Old_Vanilla.toc"), "## Interface: 11509\n");
    writeFileSync(join(root, "addon", "STORE.md"), "x\n");
    expect(addonFolders(root)).toEqual([dir]);
    // (and the one package.ts names, whatever else has both TOCs)
    mkdirSync(join(root, "scripts"));
    writeFileSync(join(other, "Old_Camelot.toc"), "## Interface: 16001\n");
    expect(addonFolders(root).length).toBe(2);
    writeFileSync(join(root, "scripts", "package.ts"), 'run({ root, name: "X", games: {} });\n');
    expect(addonFolders(root)).toEqual([dir]);
  });

  test("no file, two bindings, a wrong name, a wrong category, a header, a body that isn't one call", () => {
    expect(checkAddon(scratch({ "Core.lua": kitCall() }).dir).problems.join()).toContain("Bindings.xml: none");
    const two = xml().replace("</Bindings>", "\t<Binding name=\"Y_OPEN\">YBinding();</Binding>\n</Bindings>");
    expect(checkAddon(scratch({ "Bindings.xml": two, "Core.lua": kitCall() }).dir).problems.join()).toContain("2 bindings");
    const named = xml().replace('name="X_OPEN"', 'name="Open"');
    expect(checkAddon(scratch({ "Bindings.xml": named, "Core.lua": kitCall() }).dir).problems.join()).toContain("not <KEY>_OPEN");
    const cat = xml("X", "XBinding", "", "BINDING_HEADER_OTHER");
    expect(checkAddon(scratch({ "Bindings.xml": cat, "Core.lua": kitCall() }).dir).problems.join()).toContain("category");
    const head = xml("X", "XBinding", ' header="X"');
    expect(checkAddon(scratch({ "Bindings.xml": head, "Core.lua": kitCall() }).dir).problems.join()).toContain("no header=");
    const body = xml().replace("XBinding();", "XBinding(); Other();");
    expect(checkAddon(scratch({ "Bindings.xml": body, "Core.lua": kitCall() }).dir).problems.join()).toContain("one call");
  });

  test("the Lua must make the same key and function, with a name and a toggle", () => {
    const a = scratch({ "Bindings.xml": xml(), "Core.lua": kitCall("Y", "XBinding") });
    expect(checkAddon(a.dir).problems.join()).toContain('binding key "Y"');
    const b = scratch({ "Bindings.xml": xml(), "Core.lua": kitCall("X", "Other") });
    expect(checkAddon(b.dir).problems.join()).toContain('binding global "Other"');
    const c = scratch({ "Bindings.xml": xml(), "Core.lua": 'ns.kit.binding({ key = "X", global = "XBinding" })\n' });
    expect(checkAddon(c.dir).problems.join()).toContain("no name");
    expect(checkAddon(c.dir).problems.join()).toContain("no toggle");
    const d = scratch({ "Bindings.xml": xml(), "Core.lua": "-- nothing\n" });
    expect(checkAddon(d.dir).problems.join()).toContain("no BINDING_HEADER_X");
  });

  test("a kit that lacks K.binding, and a call before the language file", () => {
    const a = scratch({ "Bindings.xml": xml(), "Core.lua": kitCall(), "Kit.lua": "-- old\n" });
    expect(checkAddon(a.dir).problems.join()).toContain("kit:sync");
    const early = "## Interface: 11509\nKit.lua\nCore.lua\nLocale.lua\nText_[TextLocale].lua\n";
    const b = scratch({ "Bindings.xml": xml(), "Core.lua": kitCall(), "X_Vanilla.toc": early });
    expect(checkAddon(b.dir).problems.join()).toContain("before the language file");
  });

  test("by hand (an addon without the kit): the three assignments, and selene knowing the function", () => {
    const lua =
      'BINDING_HEADER_X = "X"\nBINDING_NAME_X_OPEN = "Open X"\nfunction XBinding()\n  toggle()\nend\n';
    const ok = scratch({ "Bindings.xml": xml(), "Core.lua": lua }, { yml: "globals:\n  XBinding:\n    any: true\n" });
    expect(checkAddon(ok.dir).problems).toEqual([]);
    const noYml = scratch({ "Bindings.xml": xml(), "Core.lua": lua }, { yml: "globals:\n  Other:\n    any: true\n" });
    expect(checkAddon(noYml.dir).problems.join()).toContain("lacks XBinding");
    const noLabel = scratch({ "Bindings.xml": xml(), "Core.lua": lua.replace('BINDING_NAME_X_OPEN = "Open X"\n', "") });
    expect(checkAddon(noLabel.dir).problems.join()).toContain("BINDING_NAME_X_OPEN");
    const noFn = scratch({ "Bindings.xml": xml(), "Core.lua": lua.replace("function XBinding()", "function Nope()") });
    expect(checkAddon(noFn.dir).problems.join()).toContain("no global function XBinding");
  });

  test("comments, locals, a misspelt root and quoted ignores do not pass", () => {
    const commented = scratch({ "Bindings.xml": xml(), "Core.lua": "-- ns.kit.binding({ key = \"X\", global = \"XBinding\", name = 1, toggle = 1 })\n" });
    expect(checkAddon(commented.dir).problems.join()).toContain("no BINDING_HEADER_X");
    const nested = scratch({
      "Bindings.xml": xml(),
      "Core.lua": 'ns.kit.binding({ key = "Y", name = "X", global = "XBinding", toggle = function() t({ key = "X" }) end })\n',
    });
    expect(checkAddon(nested.dir).problems.join()).toContain('binding key "Y"');
    const lua = 'local BINDING_HEADER_X = "X"\nBINDING_NAME_X_OPEN = "Open X"\nlocal function XBinding() end\n';
    const local = scratch({ "Bindings.xml": xml(), "Core.lua": lua });
    const why = checkAddon(local.dir).problems.join();
    expect(why).toContain("no BINDING_HEADER_X");
    expect(why).toContain("no global function XBinding");
    const root = scratch({ "Bindings.xml": xml().replace(/Bindings>/g, "Bindigns>"), "Core.lua": kitCall() });
    expect(checkAddon(root.dir).problems.join()).toContain("root");
    for (const entry of ['"Bindings.xml"', "addon/*/Bindings.xml", '"*.xml"']) {
      const q = scratch({ "Bindings.xml": xml(), "Core.lua": kitCall() }, { pkgmeta: `ignore:\n  - ${entry}\n` });
      expect(checkAddon(q.dir).problems.join()).toContain(".pkgmeta ignores");
    }
  });

  test("the package: not in a TOC, carried by git, not ignored", () => {
    const listed = scratch({ "Bindings.xml": xml(), "Core.lua": kitCall(), "X_Vanilla.toc": toc + "Bindings.xml\n" });
    expect(checkAddon(listed.dir).problems.join()).toContain("lists Bindings.xml");
    const loose = scratch({ "Bindings.xml": xml(), "Core.lua": kitCall() }, { track: false });
    expect(checkAddon(loose.dir).problems.join()).toContain("git doesn't carry it");
    const ignored = scratch({ "Bindings.xml": xml(), "Core.lua": kitCall() }, { pkgmeta: "ignore:\n  - Bindings.xml\n" });
    expect(checkAddon(ignored.dir).problems.join()).toContain(".pkgmeta ignores");
  });
});
