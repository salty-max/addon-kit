#!/usr/bin/env python3
"""The places inside buildings in a client language: the game names an
interior (Ironforge's "The Library") from its WMOAreaTable, which has no area
id for C_Map.GetAreaInfo to name. A place recorded by such a name, in English,
reads in the client's language by this list. Shared by the addons, run from
one's folder:

  python3 ../addon-kit/subzones.py frFR

Writes i18n/<locale>/subzones.json, { "forever": { English: name },
"classic": { English: name where Classic's differs } }: only the names the
language writes otherwise. The tables are cached in the kit's .cache/i18n/.
"""
import csv, json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from glossary import CACHE, PRODUCTS, fetch

locale = sys.argv[1]


def names(game, loc):
    q = "" if loc == "enUS" else f"&locale={loc}"
    path = fetch(f"https://wago.tools/db2/WMOAreaTable/csv?{PRODUCTS[game]}{q}", os.path.join(CACHE, game, f"WMOAreaTable-{loc}.csv"))
    return {r["ID"]: r["AreaName_lang"].strip() for r in csv.DictReader(open(path, encoding="utf-8"))}


out = {}
for game in ("forever", "classic"):
    en, tr = names(game, "enUS"), names(game, locale)
    mine = {}
    for id, name in sorted(en.items(), key=lambda kv: int(kv[0])):
        t = (tr.get(id) or "").replace("’", "'")
        if name and t and t != name and name not in mine:
            mine[name] = t
    out[game] = mine
out["classic"] = {k: v for k, v in out["classic"].items() if out["forever"].get(k) != v}
os.makedirs(os.path.join("i18n", locale), exist_ok=True)
with open(os.path.join("i18n", locale, "subzones.json"), "w", encoding="utf-8") as f:
    json.dump({k: dict(sorted(v.items())) for k, v in out.items()}, f, ensure_ascii=False, indent=1)
    f.write("\n")
print(f"i18n/{locale}/subzones.json: {len(out['forever'])} Forever names, {len(out['classic'])} of Classic's own")
