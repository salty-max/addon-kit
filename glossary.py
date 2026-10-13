#!/usr/bin/env python3
"""The names a translation must use: every place, faction and figure an
addon's English texts name, as Forever's client writes it in that language
(the user's rule, 13 Oct 2026: the names the player sees in the game the
addons launch with, English ones included where Forever's translators kept
them: "Roi Magni Bronzebeard", but "Forgefer"). Shared by the addons, run
from one's folder:

  python3 ../addon-kit/glossary.py frFR --prose content atlas notes expeditions \
      --ids creature id --db .cache/classicdb-28ef6259c782.sql.gz \
      --traces ../yonder/.cache/forever/questiedb-npc-7e87203312ef.lua
  python3 ../addon-kit/glossary.py frFR --swaps   (classic.json alone, after
                                                   editing a by-hand file)

Places and factions from each game's tables (wago.tools: AreaTable and
Faction; Classic Era, the pinned Forever build and the live game, in English
and in the language), figures from Wowhead's tooltips by their ids (the ids
the texts' front matter gives under --ids, and the characters the prose
names: a name of two words or more among the database's creatures and the
Forever traces') in the three. Cached in the kit's .cache/i18n/, for every
addon.

Writes i18n/<locale>/glossary.json, { "places" | "factions" | "figures" |
"by hand": { English: { "use": name, "forever": ..., "classic": ...,
"retail": ... } } } for the translator: "use" is Forever's name, else
Classic's (the same game's data, mostly), else the live game's (what neither
has: Ironforge's wards); glossary-by-hand.json's names win (what only
Forever's creatures show). And i18n/<locale>/classic.json, { Forever's name:
Classic's name } where the two clients differ (with classic-by-hand.json's,
which win): Classic's own replace Forever's when the file loads there
(Locale.lua). The names lose the English some carry in brackets ("Les
Carmines (Redridge Mts)") and the curly apostrophes.
"""
import csv, glob, json, os, re, sys, time, urllib.error, urllib.request

ROOT = os.getcwd()  # (the addon's folder)
CACHE = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".cache", "i18n")
UA = {"User-Agent": "LorekeepersCodex/1.0 (addon localization; github.com/salty-max/lorekeepers-codex)"}
PRODUCTS = {"classic": "product=wow_classic_era", "forever": "product=wow_classic_beta&build=1.60.1.70291", "retail": "product=wow"}
WOWHEAD = {"classic": "classic/", "forever": "forever/", "retail": ""}
# Wowhead's language codes
WH = {"frFR": 2, "deDE": 3, "esES": 6, "esMX": 7, "ruRU": 8, "ptBR": 10, "koKR": 1, "zhCN": 4}


def fetch(url, path):
    if not os.path.exists(path):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=180) as r:
                body = r.read()
        except urllib.error.HTTPError as e:
            if e.code != 404:
                raise
            body = b"{}"  # (not in that game: kept, not asked again)
        with open(path, "wb") as f:
            f.write(body)
        time.sleep(0.2)
    return path


def table(game, name, locale):
    loc = "" if locale == "enUS" else f"&locale={locale}"
    path = fetch(f"https://wago.tools/db2/{name}/csv?{PRODUCTS[game]}{loc}", os.path.join(CACHE, game, f"{name}-{locale}.csv"))
    field = "AreaName_lang" if name == "AreaTable" else "Name_lang"
    return {r["ID"]: r[field] for r in csv.DictReader(open(path, encoding="utf-8"))}


def wowhead(game, id, locale):
    path = fetch(f"https://nether.wowhead.com/{WOWHEAD[game]}tooltip/npc/{id}?locale={WH.get(locale, 0)}", os.path.join(CACHE, game, f"npc-{id}-{locale}.json"))
    try:
        return (json.load(open(path, encoding="utf-8")) or {}).get("name")
    except json.JSONDecodeError:
        return None


def bare(name):
    # (straight apostrophes, as the pages: some of the game's own names curl them)
    return re.sub(r"\s*\([^)]*\)\s*$", "", name or "").strip().replace("\u2019", "'")


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
    ap.add_argument("--db")
    ap.add_argument("--traces")
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
    out = {"places": {}, "factions": {}, "figures": {}}
    # places and factions: every one whose English name the pages use
    for kind, name in (("places", "AreaTable"), ("factions", "Faction")):
        en = {g: table(g, name, "enUS") for g in PRODUCTS}
        loc = {g: table(g, name, locale) for g in PRODUCTS}
        for g in PRODUCTS:
            for id, english in en[g].items():
                # (prose often drops a name's "The": "the Sludge Fen")
                bare_en = english[4:] if english.startswith("The ") else english
                if len(bare_en) < 4 or not re.search(rf"(?<![\w']){re.escape(bare_en)}(?![\w'])", prose):
                    continue
                entry = out[kind].setdefault(english, {})
                if loc[g].get(id) and g not in entry:
                    entry[g] = bare(loc[g][id])
    # figures: the ids the texts' front matter gives (--ids: npc unlocks,
    # portraits, a riddle's creature, a quarry's id), and every character the
    # prose names (a name of two words or more: the database's creatures,
    # Forever's new ones from the beta's traces)
    ids = set()
    import gzip
    known = {}
    if args.db:
        db = gzip.open(os.path.join(ROOT, args.db), "rt", encoding="utf-8", errors="replace").read()
        # (the table comes in several INSERTs)
        for rows in re.finditer(r"INSERT INTO `creature_template` VALUES(.*?);\n", db, re.S):
            for m in re.finditer(r"\((\d+),'((?:[^'\\]|\\.)*)'", rows.group(1)):
                known.setdefault(m.group(2).replace("\\'", "'"), m.group(1))
    if args.traces and os.path.exists(os.path.join(ROOT, args.traces)):
        for m in re.finditer(r"\[(\d+)\] = \{[^{}]*?\[npcKeys\.name\] = \"([^\"]+)\"", open(os.path.join(ROOT, args.traces), encoding="utf-8").read()):
            known.setdefault(m.group(2), m.group(1))
    for name, id in known.items():
        if " " in name and re.search(rf"(?<![\w']){re.escape(name)}(?![\w'])", prose):
            ids.add(id)
    for p in pages:
        head = open(p, encoding="utf-8").read().split("\n---\n", 1)[0]
        for key in args.ids:
            for m in re.finditer(rf"^\s*(?:-\s*)?(?:\[\w+\]\s*)?{key}:\s*([\d, ]+)", head, re.M):
                ids |= set(re.findall(r"\d+", m.group(1)))
    for id in sorted(ids, key=int):
        english = wowhead("classic", id, "enUS") or wowhead("forever", id, "enUS")
        if not english:
            continue
        entry = out["figures"].setdefault(english, {})
        for g in PRODUCTS:
            name = wowhead(g, id, locale)
            if name:
                entry[g] = bare(name)
    for kind in out.values():
        for e in kind.values():
            e["use"] = e.get("forever") or e.get("classic") or e.get("retail")
    os.makedirs(dest, exist_ok=True)
    out = by_hand(out, dest)
    write_glossary(out, dest)
    swaps = write_swaps(locale, out, dest)
    print(f"i18n/{locale}/glossary.json: {sum(len(v) for v in out.values())} names; classic.json: {len(swaps)} Classic names")

if __name__ == "__main__":
    main()
