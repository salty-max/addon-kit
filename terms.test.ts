// terms.ts: seeded cases the check must catch, and clean ones it must pass (bun test).
import { describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { checkLine, checkRepo, loadTerms } from "./terms";
import { family, run, KIT, useFixtures } from "./test-fixtures";

useFixtures();
const t = loadTerms();
const rules = (en: string, fr: string | undefined, repo = "yonder") => checkLine(repo, "words", en, fr, t).map((w) => w.rule).sort();
const NB = " ";

describe("terms", () => {
  test("clean lines raise nothing", () => {
    expect(rules("Achievements", "Hauts faits")).toEqual([]);
    expect(rules("Level: %d", `Niveau${NB}: %d`)).toEqual([]);
    expect(rules("Are you sure?", `Êtes-vous sûr${NB}?`)).toEqual([]);
    expect(rules("under 1%", `moins de 1${NB}%`)).toEqual([]);
    expect(rules("%d%%", `%d${NB}%%`)).toEqual([]);
    expect(rules("A rare elite", "Une élite rare")).toEqual([]);
    expect(rules("Nothing found", "Aucun résultat")).toEqual([]);
    expect(rules("Hardcore", "Extrême")).toEqual([]);
    // a help line keeps its commands' own words, and a hide is not to hide
    expect(rules("/yonder minimap shows or hides the button.", "/yonder minimap affiche ou masque le bouton.")).toEqual([]);
    expect(rules("Find a hide", "Trouvez une peau")).toEqual([]);
    // Q5, the welcome line: the command word stays, the window word is still read
    expect(rules("Change them any time: %s settings, or a right-click.", `Modifiez-les quand vous voulez${NB}: %s settings, ou un clic droit.`)).toEqual([]);
    expect(rules("Change them any time: %s, or a right-click on the minimap button.", `Modifiez-les quand vous voulez${NB}: %s, ou un clic droit sur le bouton de la minicarte.`)).toEqual([]);
    expect(rules("/yonder opens the journal.", "/yonder ouvre le journal.")).toEqual([]);
    expect(rules("/yonder opens the journal.", "/yonder ouvre le livre.")).toEqual(["term:yonder-window"]);
    expect(rules("Name World of Warcraft: Forever", "World of Warcraft: Forever")).toEqual([]);
  });

  test("seeded French drift is caught", () => {
    expect(rules("A rare elite", "Un rare élite")).toEqual(["term:rare-elite", "term:rare-elite"]);
    expect(rules("An elite", "Un élite")).toEqual(["term:elite"]);
    expect(rules("Nothing found", "Rien trouvé")).toEqual(["term:nothing-found", "term:nothing-found"]);
    expect(rules("Hardcore", "Hardcore")).toEqual(["term:hardcore"]);
    expect(rules("Open the settings", "Ouvrez vos options")).toEqual(["term:settings", "term:settings"]);
    expect(rules("Drag it", "Faites glisser pour le déplacer")).toEqual(["term:drag"]);
    expect(rules("Achievements", "Succès")).toEqual(["term:achievements", "term:achievements"]);
  });

  test("seeded English drift is caught: Options, a plural alert, a window word, a semicolon, non-ASCII, American spelling", () => {
    expect(rules("The addon's Options can turn it back on.", undefined)).toEqual(["term:settings"]);
    expect(rules("Alerts for achievements", undefined, "yonder")).toEqual(["term:alert"]);
    expect(rules("/yonder opens the book.", undefined, "yonder")).toEqual(["term:yonder-window"]);
    expect(rules("/yonder opens the book.", undefined, "mealbook")).toEqual([]); // (Mealbook's window is the book)
    expect(rules("One; two", undefined)).toEqual(["A1"]);
    expect(rules("A $gman:woman; walks", undefined)).toEqual([]); // (a gender token's own semicolon)
    expect(rules("Café", undefined)).toEqual(["A2"]);
    expect(rules("The harbor in colour", undefined)).toEqual(["A3"]);
    expect(rules("Menethil Harbor", undefined)).toEqual([]); // (a capital is a game name)
  });

  test("seeded typography is caught: a plain space before : ? ! and %, no space before %", () => {
    expect(rules("Level: %d", "Niveau : %d")).toEqual(["typography"]);
    expect(rules("Sure?", "Sûr ?")).toEqual(["typography"]);
    expect(rules("Stop!", "Stop !")).toEqual(["typography"]);
    expect(rules("%d%%", "%d %%")).toEqual(["typography"]);
    expect(rules("%d%%", "%d%%")).toEqual(["typography"]);
    expect(rules("under 1%", "moins de 1 %")).toEqual(["typography"]);
    expect(rules("Ready?", "Prêt?")).toEqual(["typography"]);
    expect(rules("Level: %d", "Niveau: %d")).toEqual(["typography"]);
    expect(rules("Visit: %s", "Visitez http://x.y")).toEqual([]);
    expect(rules("under 1%", "moins de 1%")).toEqual(["typography"]);
  });

  test("the kit's own words raise no warning: its French typography and terms are enforced, not warned", () => {
    expect(checkRepo(KIT, t).map((w) => `[${w.rule}] ${w.text}`)).toEqual([]);
  });

  test("a repository's words and TOC notes are read, and the CLI never fails in warning mode", () => {
    const { repo } = family();
    mkdirSync(join(repo, "i18n", "frFR"), { recursive: true });
    mkdirSync(join(repo, "addon", "X"), { recursive: true });
    writeFileSync(join(repo, "i18n", "words.json"), JSON.stringify({ Hardcore: "", Fine: "" }));
    writeFileSync(join(repo, "i18n", "frFR", "words.json"), JSON.stringify({ Hardcore: "Hardcore", Fine: "Bien" }));
    writeFileSync(join(repo, "addon", "X", "X_Vanilla.toc"), "## Notes: A hardcore note\n## Notes-frFR: Une note hardcore\n");
    const w = checkRepo(repo, t);
    expect(w.filter((x) => x.where === "words").map((x) => x.rule)).toEqual(["term:hardcore"]);
    expect(w.filter((x) => x.where.endsWith("Notes")).length).toBe(1);
    const r = run(repo, ["bun", join(KIT, "terms.ts"), repo]);
    expect(r.code).toBe(0);
    expect(r.out).toContain("2 warnings (warning mode: nothing fails)");
    expect(run(repo, ["bun", join(KIT, "terms.ts"), repo, "--strict"]).code).toBe(1);
  });
});
