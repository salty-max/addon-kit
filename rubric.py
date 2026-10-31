#!/usr/bin/env python3
"""English as a source text: the rubric's measurable parts (the wow-translating
skill, A1 to A11; ideas/audit/en-fr-base.md section A), over an addon's
interface words and authored English. A list for the reader, never a failure:
the exit code is 0.

  python3 addon-kit/rubric.py                  every addon with i18n/words.json
  python3 addon-kit/rubric.py yonder goodwill  those (a name in the family folder, or a path)
  python3 addon-kit/rubric.py --out FILE ...   the report to a file

Per addon: the interface keys that are fragments (A5), carry two or more
unnumbered blanks (A6), run over 25 words (A4), hold a semicolon (A1), non-ASCII
(A2), American spelling (A3) or an idiom candidate (A9); then the authored
English (frontmatter and comment blocks stripped; Yours Truly from "## Letter"
on): sentences over 35 words (A4), semicolon, non-ASCII, American spelling and
idiom lines. A capitalised word is a game name more often than not: the spelling
list matches lowercase use of the word and the game's own spellings are taken
out first.
"""
import json, re, sys, collections, os, glob

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from root import family_root

ROOT = family_root()
args = sys.argv[1:]
OUT = None
if "--out" in args:
    i = args.index("--out")
    OUT = args[i + 1]
    del args[i : i + 2]
os.chdir(ROOT)
DIRS = {}
for a in args or sorted(d for d in os.listdir(ROOT) if os.path.exists(f"{d}/i18n/words.json")):
    path = a if os.path.isabs(a) or a.startswith(".") else os.path.join(ROOT, a)
    DIRS[os.path.basename(os.path.normpath(path))] = os.path.abspath(path)
ADDONS = list(DIRS)
AUTHORED = {
    "hearthtale": ["writing/**/*.md"],
    "lorekeepers-codex": ["content/**/*.md"],
    "yonder": ["content/**/*.md", "atlas/**/*.md", "notes/**/*.md", "expeditions/**/*.md"],
    "goodwill": ["content/**/*.md"],
    "mealbook": ["recipes/**/*.md"],
    "yours-truly": ["letters/**/*.md"],
}
AMERICAN = r"\b(honor|honors|honored|color|colors|colored|armor|armors|favor|favorite|behavior|harbor|labor|rumor|valor|savior|center|centers|theater|gray|traveler|travelers|traveled|traveling|realize|realized|recognize|recognized|organize|organized|apologize|defense|offense|catalog|plow|mold|skeptic|jewelry|aging|practicing)\b"
GAME_OK = r"Valley of Honor|Armor Kit|Honor Hold|Honored|Hall of Honor|Defias|Gray(?:mane|hound|beard)"  # game names, the standing
IDIOMS = [r"\bany time\b", r"\bkeep up with\b", r"\bon its own\b", r"\bas yet\b", r"\bback on\b", r"\bbrought down\b", r"\bfor good\b",
          r"\bat a glance\b", r"\bin a pinch\b", r"\bon the house\b", r"\bkick(ed)? the bucket\b", r"\bbite the dust\b", r"\bout of the woods\b",
          r"\bpiece of cake\b", r"\bcall it a day\b", r"\bhit the road\b", r"\bunder the weather\b", r"\bon the fly\b", r"\bheads up\b", r"\bgo-to\b",
          r"\bkeep an eye\b", r"\bin the wild\b", r"\bfrom scratch\b", r"\bbreak the ice\b", r"\bon the spot\b", r"\bgot it\b"]

def sentences(text):
    text = re.sub(r"\s+", " ", text)
    return [s for s in re.split(r"(?<=[.!?])\s+(?=[A-Z\"'(])", text) if s.strip()]

def words(s): return len(re.findall(r"[A-Za-z0-9%][A-Za-z0-9'%$-]*", s))

rep = []
def w(s=""): rep.append(s)

# ---------- interface words ----------
w("# English as a source: what a script can measure (addon-kit/rubric.py)")
w("")
w("## Interface words (every <addon>/i18n/words.json key, the kit's from addon-kit/i18n/frFR.json)")
summary = []
allkeys = {a: list(json.load(open(f"{DIRS[a]}/i18n/words.json")).keys()) for a in ADDONS if os.path.exists(f"{DIRS[a]}/i18n/words.json")}
if not args:
    allkeys["addon-kit"] = list(json.load(open("addon-kit/i18n/frFR.json")).keys())
for a, keys in allkeys.items():
    frag = [k for k in keys if (re.match(r"^[a-z,( ]", k) and len(k.split()) >= 2) or k.startswith(" ") or k.endswith(" ")]
    multi = [k for k in keys if len(re.findall(r"%(?!\d\$)0?\d*(?:\.\d+)?[sdif]", k)) >= 2 and len(re.sub(r"%\S+", "", k).strip()) > 3]
    longs = [k for k in keys if any(words(s) > 25 for s in sentences(k))]
    semi = [k for k in keys if ";" in re.sub(r"\$g[^:;]*:[^;]*;", "", k)]
    nonascii = [k for k in keys if re.search(r"[^\x00-\x7f]", k)]
    amer = [k for k in keys if re.search(AMERICAN, re.sub(GAME_OK, "", k), re.I)]
    idi = [k for k in keys if any(re.search(r, k, re.I) for r in IDIOMS)]
    summary.append((a, len(keys), len(frag), len(multi), len(longs), len(semi), len(nonascii), len(amer), len(idi)))
    w(f"\n### {a}: {len(keys)} keys")
    for name, lst in (("fragments (lowercase start or edge space, 2+ words: assembled in code?)", frag), ("2+ unnumbered blanks (word order fixed for the translator)", multi),
                      ("a sentence over 25 words", longs), ("semicolon", semi), ("non-ASCII", nonascii), ("American spelling", amer), ("idiom candidates", idi)):
        w(f"- {name}: {len(lst)}")
        for k in lst[:60]: w(f"    {json.dumps(k)[:160]}")
        if len(lst) > 60: w(f"    … {len(lst)-60} more")

# ---------- authored English ----------
w("\n## Authored English (frontmatter and fenced/HTML comment blocks stripped; Yours Truly from '## Letter' on)")
auth = []
for a, pats in AUTHORED.items():
    if a not in DIRS:
        continue
    files = sorted({os.path.relpath(f, ROOT) for p in pats for f in glob.glob(f"{DIRS[a]}/{p}", recursive=True)})
    files = [f for f in files if "/i18n/" not in f]
    sents = []; semis = []; nonascii = []; amer = []; idi = []; long_files = collections.Counter()
    for f in files:
        raw = open(os.path.join(ROOT, f), encoding="utf8").read().split("\n")
        start = 0
        if raw and raw[0] == "---":
            for j in range(1, len(raw)):
                if raw[j] == "---": start = j + 1; break
        if a == "yours-truly":
            for j, l in enumerate(raw):
                if l.startswith("## Letter"): start = j + 1; break
        incomment = False
        for i in range(start, len(raw)):
            l = raw[i]
            if "<!--" in l: incomment = "-->" not in l; continue
            if incomment:
                if "-->" in l: incomment = False
                continue
            if re.match(r"\s*(#|\||```|[a-z_]+:\s)", l) or not l.strip(): continue
            ln = f"{f}:{i+1}"
            text = re.sub(r"\[(?:after|horde|alliance|if)[^\]]*\]", "", l)
            if ";" in re.sub(r"\$g[^:;]*:[^;]*;", "", text): semis.append(ln)
            if re.search(r"[^\x00-\x7f]", text): nonascii.append(ln)
            if re.search(AMERICAN, re.sub(GAME_OK, "", text), re.I): amer.append(f"{ln}: {text.strip()[:110]}")
            for s in sentences(text):
                n = words(s); sents.append(n)
                if n > 35: long_files[f] += 1
                if any(re.search(r, s, re.I) for r in IDIOMS): idi.append(f"{ln}: {s.strip()[:120]}")
    if not sents: continue
    sents.sort()
    med = sents[len(sents)//2]; p90 = sents[int(len(sents)*.9)]
    over = sum(1 for n in sents if n > 35)
    auth.append((a, len(files), len(sents), med, p90, over, len(semis), len(nonascii), len(amer)))
    w(f"\n### {a}: {len(files)} files, {len(sents)} sentences, median {med} words, 90th percentile {p90}, over 35 words {over} ({over*100//max(1,len(sents))}%)")
    w(f"- semicolon lines: {len(semis)}  " + " ".join(semis[:10]))
    w(f"- non-ASCII lines: {len(nonascii)}  " + " ".join(nonascii[:10]))
    w(f"- American spelling lines: {len(amer)}")
    for x in amer[:30]: w(f"    {x}")
    w(f"- files with the most sentences over 35 words: " + ", ".join(f"{f} ({n})" for f, n in long_files.most_common(8)))
    w(f"- idiom candidates: {len(idi)}")
    for x in idi[:25]: w(f"    {x}")

report = "\n".join(rep) + "\n"
if OUT:
    open(OUT, "w").write(report)
else:
    print(report)
print("addon keys frag multi long semi nonascii amer idiom")
for r in summary: print(*r)
print("\naddon files sentences median p90 over35 semi nonascii amer")
for r in auth: print(*r)
