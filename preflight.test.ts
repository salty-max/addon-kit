// preflight.ts's pure parts (bun test).
import { describe, expect, test } from "bun:test";
import {
  coverage,
  gameOf,
  gameOfInterface,
  inTocs,
  interfaceOf,
  isAuthored,
  kindOf,
  nextVersion,
  notesWanted,
  othersNamed,
  pageProblems,
  readToc,
  sectionOf,
  verdict,
  type Commit,
  type Preflight,
} from "./preflight";

const PAGE = `<!-- Summary: Solve riddles. -->
<!-- GitHub: Riddles. -->
# Yonder

Riddles.

## Other addons

- **[Hearthtale](https://www.curseforge.com/wow/addons/hearthtale)** ([Wago](https://addons.wago.io/addons/E6gzPnN1)) writes a diary.
- **[Lorekeeper's Codex](https://www.curseforge.com/wow/addons/lorekeepers-codex)** unlocks lore pages.

## Support

A coffee on [Ko-fi](https://ko-fi.com/salty_max).

## Source

MIT licensed.
`;

describe("preflight", () => {
  test("a build's interface number", () => {
    expect(interfaceOf("1.15.9.70003")).toBe("11509");
    expect(interfaceOf("1.60.1.70450")).toBe("16001");
    expect(interfaceOf("2.5.6")).toBe("20506");
    expect(interfaceOf("beta")).toBeUndefined();
  });

  test("an unsuffixed TOC's interface finds its game by its line", () => {
    const pins = { classic: { build: "1.15.10.71000" }, forever: { build: "1.60.1.70450" } };
    expect(gameOfInterface("11509", pins)).toBe("classic"); // (stale, so shown as wrong, not as TBC)
    expect(gameOfInterface("16001", pins)).toBe("forever");
    expect(gameOfInterface("20506", pins)).toBe("tbc");
    expect(gameOfInterface("30403", pins)).toBeUndefined();
  });

  test("a TOC's game by its suffix", () => {
    expect(gameOf("Yonder/Yonder_Vanilla.toc")).toBe("classic");
    expect(gameOf("Yonder_Camelot.toc")).toBe("forever");
    expect(gameOf("Keyring_TBC.toc")).toBe("tbc");
    expect(gameOf("WowLocker.toc")).toBeUndefined();
  });

  test("a TOC's fields, every language's Notes", () => {
    const toc = readToc(
      "Yonder/Yonder_Vanilla.toc",
      "## Interface: 11509\r\n## Title: Yonder\n## Notes: Solve riddles.\n## Notes-frFR: Résolvez des énigmes.\n## Version: 0.12.1\n## X-Curse-Project-ID: 1728396\n## X-Wago-ID: ZKbq5y61\n",
    );
    expect(toc).toEqual({
      file: "Yonder/Yonder_Vanilla.toc",
      game: "classic",
      version: "0.12.1",
      interfaces: ["11509"],
      curse: "1728396",
      wago: "ZKbq5y61",
      notes: { enUS: "Solve riddles.", frFR: "Résolvez des énigmes." },
    });
    expect(readToc("WowLocker.toc", "## Interface: 11509, 20506\n").interfaces).toEqual(["11509", "20506"]);
  });

  test("a commit's place in the notes", () => {
    expect(kindOf("feat(expeditions): eight riddles more")).toBe("feat");
    expect(kindOf("fix(i18n): no comma before und")).toBe("fix");
    expect(kindOf("fix: a typo")).toBe("fix");
    expect(kindOf("chore: the game's data at wow-data's pins")).toBe("data");
    expect(kindOf("chore(data): forever's quest facts")).toBe("data");
    expect(kindOf("chore: kit 7ea016c, the game window's body dark")).toBe("kit");
    expect(kindOf("build: wow-data through the root finders")).toBe("other");
    expect(kindOf("feature creep")).toBe("other");
  });

  test("the version suggested", () => {
    const c = (kind: Commit["kind"]): Commit => ({ sha: "a", subject: "", kind });
    expect(nextVersion("0.12.1", [c("feat"), c("fix")])).toBe("0.13.0");
    expect(nextVersion("0.12.5", [c("fix"), c("data")])).toBe("0.12.6");
    expect(nextVersion("v1", [])).toBeUndefined();
  });

  test("a store page's sections and rules", () => {
    expect(sectionOf(PAGE, "Support")?.trim()).toBe("A coffee on [Ko-fi](https://ko-fi.com/salty_max).");
    expect(sectionOf(PAGE, "Changes")).toBeUndefined();
    expect(pageProblems(PAGE)).toEqual([]);
    const swapped = PAGE.replace("## Support\n\nA coffee on [Ko-fi](https://ko-fi.com/salty_max).\n\n", "") + "\n## Support\n\nThanks; truly.\n";
    expect(pageProblems(swapped)).toEqual([
      "Support doesn't invite a coffee on Ko-fi (ko-fi.com/salty_max)",
      "Support comes after Source",
      "a semicolon in the page",
    ]);
    expect(pageProblems("# X\n\nNothing.\n")).toEqual(["no Support section", "no Source section", "no Summary note"]);
  });

  test("a semicolon in a plain comment isn't the page's, in a note it is", () => {
    expect(pageProblems(PAGE.replace("# Yonder", "<!-- a note to self; not shown -->\n# Yonder"))).toEqual([]);
    expect(pageProblems(PAGE.replace("<!-- GitHub: Riddles. -->", "<!-- GitHub: Riddles; more. -->"))).toEqual(["a semicolon in the GitHub note"]);
    expect(pageProblems(PAGE.replace("Summary: Solve riddles.", "Summary: Solve riddles; hunt."))).toEqual(["a semicolon in the summary"]);
  });

  test("the siblings Other addons names", () => {
    expect(othersNamed(PAGE)).toEqual([
      { name: "Hearthtale", wago: "E6gzPnN1" },
      { name: "Lorekeeper's Codex", wago: undefined },
    ]);
    expect(othersNamed("# X\n")).toEqual([]);
  });

  test("a language's coverage line", () => {
    expect(coverage("deDE: 326/326 texts (0 stale), 660/660 words, 9/9 sections, flagged")).toEqual({ complete: true, stale: 0, flagged: true });
    expect(coverage("frFR: 438/440 pages (2 stale), 209/209 words")).toEqual({ complete: false, stale: 2, flagged: false });
    expect(coverage("15/15 words")).toEqual({ complete: true, stale: 0, flagged: false });
  });

  test("authored files, not the game's names", () => {
    expect(isAuthored("i18n/frFR/words.json")).toBe(true);
    expect(isAuthored("i18n/frFR/expeditions/elwynn.md")).toBe(true);
    expect(isAuthored("i18n/deDE/glossary-by-hand.json")).toBe(true);
    expect(isAuthored("i18n/deDE/sections.json")).toBe(true);
    expect(isAuthored("i18n/frFR/creatures.json")).toBe(false);
    expect(isAuthored("i18n/frFR/subzones.json")).toBe(false);
  });

  test("Notes for each translation, Mexico's beside Spain's", () => {
    expect(notesWanted(["deDE", "esES", "frFR"])).toEqual(["deDE", "esES", "frFR", "esMX"]);
    expect(notesWanted(["frFR"])).toEqual(["frFR"]);
    expect(notesWanted(["esES", "esMX"])).toEqual(["esES", "esMX"]);
  });

  test("how many TOCs, in words", () => {
    expect(inTocs(1)).toBe("in its TOC");
    expect(inTocs(2)).toBe("in both TOCs");
    expect(inTocs(5)).toBe("in all 5 TOCs");
  });

  test("the verdict", () => {
    const p = (rows: Preflight["rows"], ships = 1, tag: string | null = "v1.0.0"): Preflight => ({
      name: "x",
      tag: tag ?? undefined,
      total: ships,
      ships: Array.from({ length: ships }, () => ({ sha: "a", subject: "fix: y", kind: "fix" as const })),
      rows,
    });
    expect(verdict(p([{ mark: "✓", label: "git", text: "" }]))).toBe("ready");
    expect(verdict(p([{ mark: "!", label: "review", text: "" }]))).toBe("ready but for 1 to look at");
    expect(verdict(p([{ mark: "✗", label: "CI", text: "" }, { mark: "!", label: "review", text: "" }]))).toBe("1 in the way, 1 to look at");
    // (nothing to ship, and a ✗ still said)
    expect(verdict(p([{ mark: "✗", label: "CI", text: "" }], 0))).toBe("nothing ships since v1.0.0, and 1 in the way");
    expect(verdict(p([{ mark: "!", label: "review", text: "" }], 0))).toBe("nothing ships since v1.0.0");
    expect(verdict(p([], 0, null))).toBe("ready");
  });
});
