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

An id the file held before stays in it, whatever a new build does: journals
keep places by these ids, and one that no longer reads would show as "w94415".
A new build can merge two places' names (then the lowest id stands for the
group, and the old one is kept beside it, under its own name in the database)
or drop an id (then it keeps the name it had). Both addons turn a name into
the lowest id bearing it, so a kept id changes nothing for new records.
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


def own_name(game, i):
    """this id's own name in this language in the database, if it has one"""
    row = db(game).execute(
        "SELECT name FROM name WHERE kind = 'wmo_area' AND id = ? AND locale = ?", (int(i), locale)
    ).fetchone()
    n = (row[0] or "").strip().replace("’", "'") if row else ""
    return n or None


file = os.path.join("i18n", locale, "subzones.json")
before = json.load(open(file, encoding="utf-8")) if os.path.exists(file) else {}
out, kept = {}, 0
for game in ("forever", "classic"):
    now = places(game)
    for i, name in (before.get(game) or {}).items():
        if i not in now:
            now[i] = own_name(game, i) or name
            kept += 1
    out[game] = dict(sorted(now.items(), key=lambda kv: int(kv[0])))
os.makedirs(os.path.join("i18n", locale), exist_ok=True)
with open(file, "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False, indent=1)
    f.write("\n")
print(
    f"i18n/{locale}/subzones.json: {len(out['forever'])} of Forever's places, {len(out['classic'])} of Classic's"
    + (f" ({kept} kept from before: ids a journal may hold)" if kept else "")
)
