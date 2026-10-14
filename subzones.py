#!/usr/bin/env python3
"""The places inside buildings in a client language: the game names an
interior (Ironforge's "The Library") from its WMOAreaTable, which has no area
id for C_Map.GetAreaInfo to name. A place recorded by such a name, in English,
reads in the client's language by this list. Shared by the addons, run from
one's folder:

  python3 ../addon-kit/subzones.py frFR

The names are wow-data's (../wow-data, its databases' `name` table, kind
wmo_area). Writes i18n/<locale>/subzones.json, { "forever": { English: name },
"classic": { English: name where Classic's differs } }: only the names the
language writes otherwise.
"""
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from glossary import db

locale = sys.argv[1]

out = {}
for game in ("forever", "classic"):
    mine = {}
    # (the lowest id first: an English name's first translation of its own)
    for name, t in db(game).execute(
        """SELECT e.name, l.name FROM name e
           LEFT JOIN name l ON l.kind = e.kind AND l.id = e.id AND l.locale = ?
           WHERE e.kind = 'wmo_area' AND e.locale = 'enUS' ORDER BY e.id""",
        (locale,),
    ):
        name, t = name.strip(), (t or "").strip().replace("’", "'")
        if name and t and t != name and name not in mine:
            mine[name] = t
    out[game] = mine
out["classic"] = {k: v for k, v in out["classic"].items() if out["forever"].get(k) != v}
os.makedirs(os.path.join("i18n", locale), exist_ok=True)
with open(os.path.join("i18n", locale, "subzones.json"), "w", encoding="utf-8") as f:
    json.dump({k: dict(sorted(v.items())) for k, v in out.items()}, f, ensure_ascii=False, indent=1)
    f.write("\n")
print(f"i18n/{locale}/subzones.json: {len(out['forever'])} Forever names, {len(out['classic'])} of Classic's own")
