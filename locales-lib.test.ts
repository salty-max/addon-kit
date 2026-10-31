// The family's languages core: the words found, the checks, the kit's words
// merged, a simple addon's files written and checked (bun test).
import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { formatArgs, grown, kitKeys, ownKeys, problems, sharedWords, tokens, wordsIn } from "./locales-lib";

const made: string[] = [];
afterAll(() => {
  for (const d of made) rmSync(d, { recursive: true, force: true });
});
const write = (root: string, file: string, text: string) => {
  mkdirSync(dirname(join(root, file)), { recursive: true });
  writeFileSync(join(root, file), text);
};

describe("the words", () => {
  test("L[...] with spaces, both forms of a plural, n a call too", () => {
    const found = wordsIn('L["One"] .. L[ "Two" ] .. K.plural(#list(x), "%d page", "%d pages") .. L["Say \\"hi\\""]');
    expect([...found].sort()).toEqual(["%d page", "%d pages", "One", 'Say "hi"', "Two"]);
  });
  test("an addon's own words, the kit's copy and the generated files aside; the kit's beside them", () => {
    const root = mkdtempSync(join(tmpdir(), "locales-"));
    made.push(root);
    write(root, "addon/X/Core.lua", 'print(L["Mine"])');
    write(root, "addon/X/Kit.lua", 'local x = L["The kit\'s"] local s = { { 0, "No sound" }, { FANFARE, "A named fanfare" } }');
    write(root, "addon/X/Text_frFR.lua", 'L["Generated"]');
    write(root, "addon/X/Data_Classic.lua", 'L["Data"]');
    expect(ownKeys(join(root, "addon/X"), /^Data_/)).toEqual(["Mine"]);
    expect(kitKeys(join(root, "addon/X"))).toContain("The kit's");
    expect(kitKeys(join(root, "addon/X"))).toContain("No sound");
    expect(kitKeys(join(root, "addon/X"))).toContain("A named fanfare");
    expect(kitKeys(join(root, "addon/X"))).toContain("Oct");
    // the lines the addons share, the kit's from its list (K.SHARED_WORDS)
    expect(kitKeys(join(root, "addon/X"))).not.toContain("Minimap button");
    write(root, "addon/X/Kit.lua", 'local x = L["The kit\'s"]\nK.SHARED_WORDS = {\n  "Minimap button",\n  "The game\'s \\"own\\"",\n}\n');
    expect(kitKeys(join(root, "addon/X"))).toContain("Minimap button");
    expect(kitKeys(join(root, "addon/X"))).toContain('The game\'s "own"');
  });
  test("the kit's own list of shared lines: each one translated in every language of the kit", () => {
    const kit = (f: string) => JSON.parse(readFileSync(join(import.meta.dir, "i18n", f), "utf8"));
    const shared = sharedWords(readFileSync(join(import.meta.dir, "Kit.lua"), "utf8"));
    expect(shared).toContain("Minimap button");
    expect(shared.length).toBeGreaterThan(0);
    for (const l of ["frFR", "deDE", "esES"]) expect(shared.filter((k) => !kit(`${l}.json`)[k])).toEqual([]);
  });
});

describe("the checks", () => {
  test("blanks numbered or not, kept; a lone % only where there are blanks; semicolons", () => {
    expect(formatArgs("%2$s of %1$d")).toEqual(formatArgs("%d, %s"));
    const { missing, unused, errors } = problems(
      { "%d of %d": "%d sur %d", "%s found": "trouvé", "under 1%": "moins de 1 %", "a; b": "", Fine: "Bien ; mal", Old: "Vieux" },
      ["%d of %d", "%s found", "under 1%", "Fine", "New"],
    );
    expect(missing).toEqual(["New"]);
    expect(unused.sort()).toEqual(["Old", "a; b"]);
    expect(errors.length).toBe(2);
    expect(errors.join()).toContain("%s found");
    expect(errors.join()).toContain("a semicolon");
    expect(problems({ "$gVieux:Vieille; ami": "$gVieux:Vieille; ami" }, []).errors).toEqual([]);
  });
  test("the game's escapes carried over: colours, line breaks, pictures; gender tokens whole", () => {
    expect(tokens("|cffff0000Red|r\nnext |TInterface\\Icons\\X:14|t")).toBe("|c1 |r1 \\n1 |T1");
    expect(tokens("a|nb")).toBe(tokens("a\nb"));
    const ok = { "|cffffd100%s|r found": "|cffffd100%s|r trouvé", "Two\nlines": "Deux|nlignes", "A friend": "$gUn ami:Une amie;" };
    expect(problems(ok, Object.keys(ok)).errors).toEqual([]);
    // seeded: a colour not closed, a line break lost, a picture dropped, a gender token half written
    const bad = { "|cffffd100%s|r found": "|cffffd100%s trouvé", "Two\nlines": "Deux lignes", "|TX:14|t Gold": "Or", "A friend": "$gUn ami:Une amie" };
    const errors = problems(bad, Object.keys(bad)).errors;
    expect(errors.filter((e) => e.startsWith("the colours")).length).toBe(3);
    expect(errors.filter((e) => e.startsWith("a gender token")).length).toBe(1);
  });
  test("a short label grown 1.8 times is said, a long line or a modest one is not", () => {
    expect(grown({ Lifelines: "Recursos de emergencia", Achievements: "Hauts faits", "A whole sentence here.": "Une phrase entière ici, beaucoup plus longue que l'anglais." })).toEqual([
      '"Lifelines" → "Recursos de emergencia"',
    ]);
  });
});

describe("a simple addon's languages", () => {
  test("the text files written with the kit's words, then checked", () => {
    const root = mkdtempSync(join(tmpdir(), "locales-run-"));
    made.push(root);
    write(root, "addon/X/Core.lua", 'print(L["Mine"], L["%d pages"])');
    write(root, "addon/X/Kit.lua", 'local w = L["Begin"]');
    write(root, "i18n/frFR/words.json", JSON.stringify({ Mine: "À moi", "%d pages": "%d pages" }));
    write(root, "i18n/frFR/meta.json", JSON.stringify({ plural: "fr" }));
    const months = Object.fromEntries(["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"].map((m) => [m, m.toLowerCase()]));
    write(root, "i18n/kit/frFR.json", JSON.stringify({ Begin: "Commencer", ...months }));
    const script = join(root, "go.ts");
    writeFileSync(script, `import { run } from ${JSON.stringify(join(import.meta.dir, "locales-lib.ts"))};\nrun({ root: ${JSON.stringify(root)}, addon: "addon/X" });\n`);
    const go = (...args: string[]) => Bun.spawnSync(["bun", script, ...args], { stdout: "pipe", stderr: "pipe" });
    expect(go("--keys").exitCode).toBe(0);
    expect(JSON.parse(readFileSync(join(root, "i18n/words.json"), "utf8"))).toEqual({ "%d pages": "", Mine: "" });
    expect(go().exitCode).toBe(0);
    const fr = readFileSync(join(root, "addon/X/Text_frFR.lua"), "utf8");
    expect(fr).toContain('["Begin"] = "Commencer"');
    expect(fr).toContain('["Mine"] = "À moi"');
    expect(fr).toContain('plural = "fr"');
    expect(readFileSync(join(root, "addon/X/Text_deDE.lua"), "utf8")).toContain("no translation yet");
    expect(go("--check").exitCode).toBe(0);
    // a kit word the kit's translations lack, a dropped blank: refused
    write(root, "addon/X/Kit.lua", 'local w = L["Begin"] .. L["Copy"]');
    write(root, "i18n/frFR/words.json", JSON.stringify({ Mine: "À moi", "%d pages": "des pages" }));
    const bad = go("--check");
    expect(bad.exitCode).toBe(1);
    const said = bad.stderr.toString();
    expect(said).toContain("the kit's i18n/kit/frFR.json lacks \"Copy\"");
    expect(said).toContain("the blanks differ");
  });
  test("a line the addons share: the kit's translation wins, the addon's own copy leaves its words", () => {
    const root = mkdtempSync(join(tmpdir(), "locales-shared-"));
    made.push(root);
    write(root, "addon/X/Core.lua", 'print(L["Mine"], L["Nothing found"])');
    write(root, "addon/X/Kit.lua", 'local w = L["Begin"]\nK.SHARED_WORDS = {\n  "Nothing found",\n}\n');
    write(root, "i18n/frFR/words.json", JSON.stringify({ Mine: "À moi", "Nothing found": "Rien trouvé" }));
    write(root, "i18n/frFR/meta.json", JSON.stringify({ plural: "fr" }));
    const months = Object.fromEntries(["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"].map((m) => [m, m.toLowerCase()]));
    write(root, "i18n/kit/frFR.json", JSON.stringify({ Begin: "Commencer", "Nothing found": "Aucun résultat", ...months }));
    const script = join(root, "go.ts");
    writeFileSync(script, `import { run } from ${JSON.stringify(join(import.meta.dir, "locales-lib.ts"))};\nrun({ root: ${JSON.stringify(root)}, addon: "addon/X" });\n`);
    const go = (...args: string[]) => Bun.spawnSync(["bun", script, ...args], { stdout: "pipe", stderr: "pipe" });
    expect(go("--keys").exitCode).toBe(0);
    expect(JSON.parse(readFileSync(join(root, "i18n/words.json"), "utf8"))).toEqual({ Mine: "" });
    const out = go();
    expect(out.exitCode).toBe(0);
    expect(out.stdout.toString()).toContain("the kit's own, its translation used: Nothing found");
    const fr = readFileSync(join(root, "addon/X/Text_frFR.lua"), "utf8");
    expect(fr).toContain('["Nothing found"] = "Aucun résultat"');
    expect(fr).not.toContain("Rien trouvé");
  });
});
