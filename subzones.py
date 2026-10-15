#!/usr/bin/env python3
"""The places inside buildings in a client language: the game names an
interior (Ironforge's "The Library") from its WMOAreaTable, which has no area
id for C_Map.GetAreaInfo to name. A journal keeps such a place by its id, found
from the name the game gave in the client's language, and shows it in any
language by this list. Shared by the addons, run from one's folder, for every
language the addon ships, English one of them:

  python3 ../addon-kit/subzones.py frFR

The names are wow-data's (../wow-data, its databases' `name` table, kind
wmo_area). The ids that bear the same name in every language are one place:
the lowest of them stands for them all. Writes i18n/<locale>/subzones.json,
{ "forever": { id: name }, "classic": { id: name } }: each game's places, every
one this language names.
"""
import collections, json, os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from glossary import db

locale = sys.argv[1]


def places(game):
    """{ id: name in this language }, one id a place (the same name in every language)"""
    names = collections.defaultdict(dict)
    for i, loc, n in db(game).execute("SELECT id, locale, name FROM name WHERE kind = 'wmo_area'"):
        n = (n or "").strip().replace("’", "'")
        if n:
            names[i][loc] = n
    locales = sorted({loc for d in names.values() for loc in d})
    groups = collections.defaultdict(list)
    for i, d in names.items():
        groups[tuple(d.get(loc, "") for loc in locales)].append(i)
    out = {}
    for ids in groups.values():
        first = min(ids)
        name = names[first].get(locale)
        if name:
            out[str(first)] = name
    return dict(sorted(out.items(), key=lambda kv: int(kv[0])))


out = {"forever": places("forever"), "classic": places("classic")}
os.makedirs(os.path.join("i18n", locale), exist_ok=True)
with open(os.path.join("i18n", locale, "subzones.json"), "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False, indent=1)
    f.write("\n")
print(f"i18n/{locale}/subzones.json: {len(out['forever'])} of Forever's places, {len(out['classic'])} of Classic's")
