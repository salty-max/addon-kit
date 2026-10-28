---
name: wow-new-addon
description: Start a new addon in the family, from an empty folder to its first test zip in iCloud: the plan in ideas/, the repository (and GitHub, on the user's go), one TOC per game, the kit through kit:sync, the languages, the checks, CI and the daily game-data job, saved-ids.json, the hooks, the card, the family's tables, then the store page and the ids the user brings. Use when the user decides to build a new addon, or to bring a half-made one up to the family's setup.
---

# A new addon

The family's newest addons are the model: Goodwill and Yours Truly, both
started on 23 October 2026. Copy their shape, not their content: read
`git -C yours-truly show --stat 4c51c87` (its first commit), its
`CLAUDE.md`, `package.json`, `.pkgmeta` and `.github/workflows/`, and
Goodwill's beside it (its first commit: `git -C goodwill log --reverse
--oneline | head -1`). What the kit copies comes from `kit:sync`, never
from a sibling. For a half-made addon, walk each section below and do only
what is missing.

## First: the plan and the name

- The plan is in `ideas/<name>.md`, its decisions the user's. Nothing is
  built before the user has picked the idea (the briefs in `ideas/` say
  which are picked).
- The name: a folder no other addon uses on CurseForge or Wago (Yonder was
  renamed for a clash), the addon's folder in CamelCase (`YoursTruly`), the
  repository in kebab-case (`yours-truly`). Check both stores and GitHub
  before settling it.
- The card first: `bun addon-kit/board.ts add <repo> "<title>" --repos
  <repo>,addon-kit[,wow-data] --status running …` (the folder can be
  named before it exists; addon-kit for the minimap angle and the kit's
  header, below; wow-data when it has game data, for `addon-data.yml`'s
  list and any field its data needs).

## The repository

From `~/code/wow-addons/<repo>`, after `git init`:

- `addon/<Addon>/<Addon>_Vanilla.toc` (Classic Era) and
  `<Addon>_Camelot.toc` (Forever: Camelot is the game type Blizzard's own
  TOCs use for it), alike but for each game's own files.
  The interface numbers are the kit's (`package-lib.ts`), checked by
  `scripts/package.ts --check`.
- `package.json`, `.pkgmeta`, `.gitignore`, `.styluaignore`,
  `selene.toml` (its std `wow+<addon>`) and `<addon>.yml`, `LICENSE`,
  `scripts/package.ts`, `scripts/locales.ts`, `scripts/release.sh`, the
  tests (`addon/test/game.lua`, `sim.lua`): from Yours Truly, its names
  changed.
- The kit, once `package.json` names it: `bun ../addon-kit/sync.ts
  addon/<Addon>` the first time (`scripts/root.ts` isn't there yet), then
  `bun run kit:sync` like any addon. It writes `Kit.lua`, `Media/`,
  `scripts/root.ts`, the libs, `i18n/kit/`, `wow.yml`, `stylua.toml`.
- A kit commit (the `wow-kit-change` skill) adds the addon's name to
  `Kit.lua`'s header and its minimap button's angle to `K.MINIMAP_ANGLES`,
  at least 25 degrees from every angle already there. The other addons
  sync to it as that skill says.
- Languages: every word through `L`, `i18n/words.json`, `bun run locales`.
  English first, the others with the `wow-translating` skill.
- Blizzard's UI (a frame, a texture or icon path, a frame API) only through
  `bun wow-data/bin/ui.ts` (`frame`, `find`, `texture`, both games in one
  call): a path the source lacks is a guess, and the code or doc says so.
- The game's data only from wow-data (`scripts/root.ts`'s `familyPath`),
  the generated files never edited by hand, each generator's `--check` in
  `bun run check`.
- `saved-ids.json` naming every table whose ids a character saves, `bun
  run ids` in the check (the `wow-data-audit` skill).
- `.github/workflows/`: `ci.yml` (`bun run check:ci`), `release.yml` (the
  packager), and `game-data.yml` when it has game data (wow-data's
  `addon-data.yml`, its `generate` and `paths`). Then the addon's name in
  `addon-data.yml`'s header comment, a wow-data commit.
- `CLAUDE.md` as a map (what it is, where things are, the commands, the
  hard rules) and `docs/architecture.md`, Yours Truly's as the pattern.
- The hooks: `bun addon-kit/hooks.ts install <repo>`, then `bun run
  check` through q and the first commit (`feat: <addon>'s first …`).

## The family's lists

- The family `CLAUDE.md`: a row in the folder table, and the addon in the
  kit line, the game-data line and the French line where it belongs.
- A memory file for it and its line in `MEMORY.md`
  (`~/.claude/projects/-Users-max-code-wow-addons/memory/`).

## GitHub and the stores

- The GitHub repository only on the user's go: `gh repo create
  salty-max/<repo> --public --source <repo>` (no push by it), then the push
  of main on its own go (`wow-releasing`). Its description and topics come
  with the store page.
- The secrets the workflows read, each on the user's go, once the new
  repository's workflows are committed (`secret.ts` sets a secret on every
  repository whose workflows read it): the store tokens from the
  clipboard, `bun addon-kit/secret.ts CURSEFORGE_TOKEN` and
  `WAGO_API_TOKEN`. `INBOX_EVENTS_TOKEN` is ours and never printed, so
  nobody holds it to copy: `bun addon-kit/secret.ts INBOX_EVENTS_TOKEN
  --generate --vercel ravenpost/inbox`, a new one everywhere, then the
  inbox's deploy (wow-releasing's "Several addons at once": one deploy for
  every new addon).
- The store page (`addon/CURSEFORGE.md`) with the `wow-store-pages` skill.
  The CurseForge and Wago projects are the user's to create: their ids
  then go into every TOC (`X-Curse-Project-ID`, `X-Wago-ID`) before the
  first release.
- The logo and game icon are the user's call: a draft in `assets/` with
  its README, never shipped before the user has seen it.

## The first test zip

`bun run package`, the zip into iCloud, a round in the game with the
`wow-game-test` skill. The first release only after that test and with
the store ids in every TOC (the `wow-releasing` skill's "A first
release").
