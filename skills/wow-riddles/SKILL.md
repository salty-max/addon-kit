---
name: wow-riddles
description: Write, vet or change Yonder's expedition riddles and quarries (yonder/expeditions/<zone>.md): pick a subject the data pins, check it with wow-data's cards, write the verse, hints, note and margin in the League's voice, run the resolver's gates, translate it, and read it in context. Use for any new riddle, a riddle the resolver refuses, a quarry poster, or a riddle review.
---

# Riddles (Yonder's expeditions)

The user's favourite feature. Every rule below was decided by the user; the
resolver (`scripts/expeditions.py`) checks most of them, so run it, don't
re-derive it by hand. Use full Opus for the writing.

## Read first

- `yonder/docs/expeditions.md`: the file format (front matter, `found:`,
  spots, `quest_overlap`/`quest_context`, `faction:`, the danger line) and
  what the resolver resolves and refuses.
- `yonder/docs/writing.md`: the League's voice, gestures and hints, lore
  scope, `[classic]`/`[forever]`.
- `yonder/PLAN.md`: Expeditions, Reworked, After the first test.

## The rules (the user's)

- A spot the data pins, never an estimate: an object's spawns, a still or
  walking creature, a trigger, a sub-area, or a reviewed landmark
  (`landmark:` in wow-data, never a borrowed spawn or an invented object).
- Never a kill. Never the same discovery twice in a zone for one reader
  (one arrival, one reading, one speaking; no gesture token shared).
- Not a quest's target, giver, ender or story. A quest place only for a
  distinct experience (a gesture, an overlooked detail), recorded as
  `quest_overlap` + `quest_context`; never a copied objective or a quest
  prop. Class quests are exempt.
- A keeper or guard that attacks one side, on a riddle open to both:
  `faction:` or a danger line that names it.
- No riddle inside the other side's capitals or guarded towns; starting
  zones keep to their side. Quarries are untied rares, never in a capital.
- The verse suggests the gesture through its story, never names the emote,
  never uses an emote token as an instruction ("greet him"). The paid hint
  may name one accepted gesture in ordinary words, never a slash command.
  No false requirement (wait, fight, buy, a portal). No joke at a grave.
- A note delivers a discovery; a quarry's margin one fact (loot, place,
  coat, a plain mechanic), no closing quip.
- Pronouns follow the creature's model (DisplaySexID) where texts are
  silent; else neutral.
- Lore up to the vanilla era from any source, nothing anachronic to vanilla
  or Forever; checked against the game's texts or an era source. Original
  wording.

## Vetting a subject (before writing a word)

Run every card for each game the riddle is for (`client: both`: Classic and
Forever), from `~/code/wow-addons` (or `bun scripts/root.ts --run
wow-data/bin/card.ts …` from yonder or a worktree):

```bash
bun wow-data/bin/card.ts npc <id or exact name> [--game forever]     # names, title, faction, who it attacks, spawns, quest ties, gossip
bun wow-data/bin/card.ts object <id or exact name> [--game forever]  # type, text, quest ties, spawns, Wowhead's points
bun wow-data/bin/card.ts place "<area name or id>" [--game forever]  # sub-areas, creatures by hostility, objects, every quest inside
```

Look for: quest ties (gives, ends, asked for, drops what a quest asks), who
attacks whom near the spot, whether Wowhead's frozen points agree with the
spawn, whether it walks, whether Forever changes it (new quests on the road).
A thing Wowhead's points lack: freeze it in wow-data first (`bun
wow-data/bin/wowhead-points.ts`, wow-data's commit), never a hand-copied
coordinate. Good finds come from the dump's scripts and gossip (the card's
gossip line, broadcast texts).

## Writing and resolving

1. Write the section in `expeditions/<zone>.md` (plain ASCII, no
   semicolons): verse, `? ` hint, `= ` note, `+ ` margin.
2. `python3 scripts/expeditions.py --dry` (the gates alone), fix what it
   refuses; then `python3 scripts/expeditions.py` (writes
   `data/expeditions.json`) and `bun run build`.
3. `bun test scripts/` (riddle-solutions.test.ts plays every solution on
   all twelve client languages) and `bun run check` through q.
4. Translate (the `wow-translating` skill): French, German, Spanish, riddles
   veiled as the English; the answer that is the thing's own name comes
   from the data by id, never by hand.
5. Read the changed riddles in context in English, French and German
   (the `prose-reader` helper for French and German). Passing tests don't
   check the writing.
6. A riddle the user must settle (a context to write, a riddle that may
   have to change) goes on a board card, not into the file on a guess.

## Review findings

The packet (`bun addon-kit/packet.ts yonder`) carries the cards of every
subject a change touches: the reviewer reads them instead of re-querying.
