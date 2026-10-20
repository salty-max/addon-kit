---
name: wow-data-audit
description: Audit or fill the game data the addons use: a kind or field's coverage in wow-data's databases (both games, every language), names saved instead of ids, a regenerated table that drops ids journals hold, a data refresh to carry through every addon. Use before a new language, after a wow-data change, when reviewing a daily game-data pull request, or when a name or a fact looks missing.
---

# Data audits

Every piece of game data comes from wow-data's databases (`classic.db`,
`forever.db`); a gap goes into wow-data's schema and build (or its frozen
`data/`), never worked around in an addon. Read `wow-data/CLAUDE.md`,
`wow-data/docs/sources.md` and `docs/architecture.md` first.

## Look, don't sample

- One thing: `bun wow-data/bin/card.ts <npc|object|place|item|quest> <id or
  exact name> [--game classic|forever] [--full]`, before any query by hand.
- A whole question (coverage per kind and locale, gaps, which source a row
  came from, long lists): the `data-scout` helper, answers whole, long
  lists to a file. Never a sample presented as the answer.
- The databases in a browser: `bun run --cwd wow-data explore`.

## Coverage

- English first: per kind and field (creatures' type, level, rank, model;
  quests' texts, giver, ender, level, zone; objects' type; speech; books),
  in both databases, before any other language. Report every gap; never
  decide alone that one doesn't matter.
- A language against one already done: `name` rows per kind and locale per
  game, `data/wowhead/<game>/<locale>.json`, `books-<locale>.json`. Fill
  with `bun wow-data/bin/names.ts <game> <locale> --gaps|--readable|--ids`.
- Before calling something missing everywhere: read the clients' own
  tables (`.cache/wago` CSVs through `bin/path.ts`) and the web. Research
  before "impossible".

## Names and ids (every repository, never a guessed grep)

For each addon, write down with a verdict:

1. Every call to a name-returning game function and what happens to the
   name: saved, compared, or used as a key.
2. Every saved field (the schema comment and every assignment).
3. Every table keyed by a name: hand-written Lua, generated data, build
   scripts' hand lists, i18n files keyed by English; every language gets a
   complete table, English one of them.
4. Every build-time name resolution fails the build on a miss.
5. The user's real saved files through the test harness (login, logout):
   every string left in the saved copy.

## Ids stay decodable

A table mapping ids a journal stores (places, flights, creatures, kinds,
specs) never loses an id on regeneration: keep retired ids as aliases.
Reviewing a data refresh (a daily `game-data.yml` pull request, or a local
regeneration), diff the id sets of every such table, not just the names.

## Carrying a change through

After a wow-data change that affects addons, do it now, not "tomorrow's
job": rebuild `.cache/db/<game>.db` (`bun wow-data/bin/build.ts <game>`),
run each affected addon's generators (its `game-data.yml` `generate` list),
its check through q, commit, refresh the test zips. A gap that breaks a
rule is fixed in the same pass, unless it is truly blocked (no API, no
data, the user's decision): then say what blocks it.
