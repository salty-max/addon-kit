#!/usr/bin/env python3
"""The names a translation must use: every place, faction, title, people and
figure an addon's English texts name, as Forever's client writes it in that
language (the user's rule, 13 Oct 2026: the names the player sees in the game
the addons launch with, English ones included where Forever's translators
kept them: "Roi Magni Bronzebeard", but "Forgefer"). Shared by the addons, run
from one's folder:

  python3 ../addon-kit/glossary.py frFR --prose content --ids npc portrait   (the Codex)
  python3 ../addon-kit/glossary.py frFR --prose content atlas notes expeditions \
      --ids creature id                                                    (Yonder)
  python3 ../addon-kit/glossary.py frFR --swaps   (classic.json alone, after
                                                   editing a by-hand file)

Every name comes from wow-data's databases (../wow-data, its `name` table:
Classic Era's and Forever's, each at its pinned build): places (the zones,
the places inside buildings, the continents), factions, the titles under
creatures' names ("Explorers' League") and peoples (races) whose English name
the pages use, the first kind holding a name giving it; figures by the ids
the texts' front matter gives under --ids, and the characters the prose names
(a creature's name of two words or more). Names neither game has (later
lore: Deathwing, Ulduar) are the by-hand file's. A name the databases give a
language only because its client shows the English there (their source
"english") is no translation: left out.

Writes i18n/<locale>/glossary.json, { "places" | "factions" | "titles" |
"peoples" | "figures" | "by hand": { English: { "use": name, "forever": ...,
"classic": ... } } } for the translator: "use" is Forever's name, else
Classic's; glossary-by-hand.json's names win (what only Forever's creatures
show, what neither game has). And i18n/<locale>/classic.json, { Forever's
name: Classic's name } where the two clients differ (with
classic-by-hand.json's, which win): Classic's own replace Forever's when the
file loads there (Locale.lua). The names lose the English some carry in
brackets ("Les Carmines (Redridge Mts)") and the curly apostrophes.
"""
import glob, json, os, re, sys

ROOT = os.getcwd()  # (the addon's folder)
KIT = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(KIT, "..", "wow-data", "py"))
from wowdata import db  # noqa: E402  (wow-data's databases, read only)
GAMES = ("forever", "classic")
# the glossary's headings and the kinds of names under each (wow-data's
# `name` kinds), the first kind holding an English name giving it. Titles of
# two words or more ("Explorers' League", not "Merchant")
KINDS = {
    "places": ("area", "wmo_area", "map"),
    "factions": ("faction",),
    "titles": ("creature_subname",),
    "peoples": ("race",),
}



def names(game, kinds, locale, common=False):
    """{ English: the language's } of a game's names of those kinds: the kinds
    in their order, then the lowest id, the first with a translation (common:
    the translation most of its ids have, a creature's title, which some
    translate otherwise: "Church of the Holy Light")"""
    marks = ",".join("?" * len(kinds))
    order = " ".join(f"WHEN '{k}' THEN {i}" for i, k in enumerate(kinds))
    out, votes = {}, {}
    for en, loc in db(game).execute(
        f"""SELECT e.name, l.name FROM name e
            LEFT JOIN name l ON l.kind = e.kind AND l.id = e.id AND l.locale = ? AND l.source <> 'english'
            WHERE e.locale = 'enUS' AND e.kind IN ({marks}) ORDER BY CASE e.kind {order} END, e.id""",
        (locale, *kinds),
    ):
        en = en.strip()
        if not en:
            continue
        loc = bare(loc) if loc else loc
        if loc:
            votes.setdefault(en, {}).setdefault(loc, 0)
            votes[en][loc] += 1
        if out.get(en) is None:
            out[en] = loc
    if common:
        for en, counts in votes.items():
            out[en] = max(counts, key=lambda loc: counts[loc])  # (a tie: the first seen)
    return out


def creature(game, id, locale):
    """a creature's name in a game and a language, or None"""
    row = db(game).execute(
        "SELECT name FROM name WHERE kind = 'creature' AND id = ? AND locale = ? AND source <> 'english'", (int(id), locale)
    ).fetchone()
    return row[0] if row else None


def bare(name):
    # (straight apostrophes, as the pages: some of the game's own names curl them)
    # (and plain spaces: some of the game's French has no-break ones,
    # "Marteau\xa0du\xa0crépuscule", which the pages' text never matches)
    return re.sub(r"\s+", " ", re.sub(r"\s*\([^)]*\)\s*$", "", name or "")).strip().replace("\u2019", "'")


def by_hand(out, dest):
    # Names no table gives as Forever writes them, kept by hand from Forever's
    # own creatures ("Dragonmaw Clan": the faction is the live game's alone,
    # "Clan Gueule-de-dragon"; Forever's orcs are "Ecumeur Dragonmaw")
    hand = os.path.join(dest, "glossary-by-hand.json")
    out["by hand"] = {en: {"use": name} for en, name in (json.load(open(hand, encoding="utf-8")) if os.path.exists(hand) else {}).items()}
    for kind, entries in out.items():
        if kind != "by hand":
            for en in out["by hand"]:
                entries.pop(en, None)
    return out


def write_glossary(out, dest):
    with open(os.path.join(dest, "glossary.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1, sort_keys=True)
        f.write("\n")


def write_swaps(locale, out, dest):
    # Forever's names that Classic writes otherwise (the longest first: a
    # place's name may hold another's)
    swaps = {}
    for kind in out.values():
        for e in kind.values():
            fv, cl = e.get("forever"), e.get("classic")
            if fv and cl and fv != cl and fv not in swaps:
                swaps[fv] = cl
    # (by hand, and winning: where a table's name is not the one prose takes,
    # "Hurlevent" is the city, Classic's "Stormwind", not its zone's "Cite de
    # Stormwind"; and the bare names inside longer ones, "Rochenoire")
    hand = os.path.join(dest, "classic-by-hand.json")
    if os.path.exists(hand):
        swaps.update(json.load(open(hand, encoding="utf-8")))
    # (French elides "de" before a vowel: "d'Austrivage" is "de Southshore"
    # on Classic, "de Fossoyeuse" is "d'Undercity")
    if locale == "frFR":
        vowel = lambda w: w[:1] in "AEIOU\u00c2\u00c9\u00c8\u00ca\u00ce\u00d4\u00db"
        for fv, cl in list(swaps.items()):
            if vowel(fv) and not vowel(cl):
                swaps["d'" + fv] = "de " + cl
            elif not vowel(fv) and vowel(cl):
                swaps["de " + fv] = "d'" + cl
    with open(os.path.join(dest, "classic.json"), "w", encoding="utf-8") as f:
        json.dump(dict(sorted(swaps.items(), key=lambda kv: (-len(kv[0]), kv[0]))), f, ensure_ascii=False, indent=1)
        f.write("\n")
    return swaps


def main():
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("locale")
    ap.add_argument("--swaps", action="store_true")
    ap.add_argument("--prose", nargs="+", default=["content"])
    ap.add_argument("--ids", nargs="+", default=[])
    args = ap.parse_args()
    locale = args.locale
    dest = os.path.join(ROOT, "i18n", locale)
    if args.swaps:
        # (only the hand-kept names and classic.json again, from the glossary
        # as it is: after editing glossary-by-hand.json or classic-by-hand.json)
        out = by_hand(json.load(open(os.path.join(dest, "glossary.json"), encoding="utf-8")), dest)
        write_glossary(out, dest)
        print(f"i18n/{locale}/classic.json: {len(write_swaps(locale, out, dest))} Classic names")
        return
    pages = sorted(p for d in args.prose for p in glob.glob(os.path.join(ROOT, d, "**", "*.md"), recursive=True))
    prose = "\n".join(open(p, encoding="utf-8").read() for p in pages)
    out = {heading: {} for heading in (*KINDS, "figures")}
    # places, factions, titles, peoples: every one whose English name the pages use
    # (a name's words all in the prose first: thousands of names, one regex each is slow)
    words = set(re.findall(r"\w+", prose))
    used = lambda name: all(w in words for w in re.findall(r"\w+", name)) and re.search(rf"(?<![\w']){re.escape(name)}(?!\w|'(?!s\b))", prose)
    for heading, kinds in KINDS.items():
        for g in GAMES:
            for english, loc in names(g, kinds, locale, common=heading == "titles").items():
                # (prose often drops a name's "The": "the Sludge Fen"; a name
                # is a proper one: "silver" is no place)
                bare_en = english[4:] if english.startswith("The ") else english
                if len(bare_en) < 4 or english == english.lower() or (heading == "titles" and " " not in bare_en) or not used(bare_en):
                    continue
                entry = out[heading].setdefault(english, {})
                if loc and g not in entry:
                    entry[g] = bare(loc)
    # figures: the ids the texts' front matter gives (--ids: npc unlocks,
    # portraits, a riddle's creature, a quarry's id), and every character the
    # prose names (a creature's name of two words or more, either game's)
    ids = set()
    known = {}
    for g in ("classic", "forever"):
        for id, name in db(g).execute("SELECT id, name FROM name WHERE kind = 'creature' AND locale = 'enUS' ORDER BY id"):
            known.setdefault(name, set()).add(str(id))
    for name, same in known.items():
        if " " in name and used(name):
            ids |= same
    for p in pages:
        head = open(p, encoding="utf-8").read().split("\n---\n", 1)[0]
        for key in args.ids:
            for m in re.finditer(rf"^\s*(?:-\s*)?(?:\[\w+\]\s*)?{key}:\s*([\d, ]+)", head, re.M):
                ids |= set(re.findall(r"\d+", m.group(1)))
    # (a name several creatures have: the first id with a translation gives it,
    # Archmage Modera's Forever twin has none)
    for id in sorted(ids, key=int):
        english = creature("classic", id, "enUS") or creature("forever", id, "enUS")
        if not english:
            continue
        entry = out["figures"].setdefault(english.strip(), {})
        for g in GAMES:
            name = creature(g, id, locale)
            if name and g not in entry:
                entry[g] = bare(name)
    # (a name neither game translates tells the translator nothing: an herb
    # some creature is also called, a Forever newcomer without its French yet)
    for heading in out:
        out[heading] = {en: e for en, e in out[heading].items() if e}
        for e in out[heading].values():
            e["use"] = e.get("forever") or e.get("classic")
    os.makedirs(dest, exist_ok=True)
    out = by_hand(out, dest)
    write_glossary(out, dest)
    swaps = write_swaps(locale, out, dest)
    print(f"i18n/{locale}/glossary.json: {sum(len(v) for v in out.values())} names; classic.json: {len(swaps)} Classic names")

if __name__ == "__main__":
    main()
