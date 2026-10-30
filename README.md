# addon-kit

The Lua every addon of the family carries but Keyring (Hearthtale,
Lorekeeper's Codex, Yonder, Second Wind, Palaver, Mealbook, Goodwill, Yours
Truly): which game this is (`K.GAME`, `K.forever`; `ns.forever` set for the
addon), its events (`K.events`: each listener behind its own pcall), search
words (`K.plain`, `K.finds`), the books' look (one family, a theme each), the pieces their
windows are made of (the list on the left, the page on the right and every part
of a page, a board of achievements, a strip of figures, a select), the banners
that tell of a deed done (in the game's own stack of alerts), each character's
settings (copied from another character or by a code) and the welcome page that
offers them. And what every addon does the same way: the book's window
(`K.book`: the game's window, its two panels, the search and a tab's select,
the tabs, a refresh that waits for a batch of events), its list (`K.list`),
places by the client's names (`K.places`, `K.areaName`), the slash command
(`K.commands`: alone it opens the book, an unknown word prints the usage, the
replies capitalised), the Options page (`K.options`), the achievements
(`K.deeds`, `K.deedsTab`: the game's fanfare and alert behind a switch, a chat
line with its link, the tab's board), the minimap button (`K.minimapButton`,
each addon's place in `K.MINIMAP_ANGLES`), the sounds (`K.SOUNDS`,
`K.playSound`, `K.fanfare`), tooltips and chat links (`K.onUnitTooltip`,
`K.onItemTooltip`, `K.links`), the game's names by id (`K.npcId`,
`K.spellName`, `K.itemIcon`), and a translation's grammar (`K.translate`,
`K.agree`, `K.swap`). See `Kit.lua`'s header for what it holds.

Each addon keeps a committed copy (`addon/<Addon>/Kit.lua`, listed in its TOC
before the files that use it), loaded into the addon's own namespace as
`ns.kit`: no version clash between the addons, nothing more for players to
install, and the addons' releases unchanged. Its three globals are shared on
purpose by every copy: `SaltyMaxCollector` (who collects), `SaltyMaxWelcomes`
(the welcomes take turns: a new character meets them one at a time) and
`AchievementShield_OnLoad` (the alert's, where a client lacks it).

Every word the kit shows goes through `K.L` (its addon's too, as `ns.L`),
English by default: a missing word is its own English. An addon's language
file fills it before anything is drawn, with the language's plural rule
(`K.isOne`, used by `K.plural`) and its month names (`K.day`). The kit's
words are translated once, in `i18n/<locale>.json` (French, German,
Spanish), copied into each addon's `i18n/kit/`: its `scripts/locales.ts`
(on the languages' core, `locales-lib.ts`) writes them into its language
files with its own.

`Media/` holds the kit's pictures: `Ring.tga`, the game's bronze ring
(`COMMON/BlueMenuRing`) with the shadow baked into its file removed, worn by
every round picture. `kit:sync` copies it into each addon's `Media/`.

- Change the kit here, format it (`stylua Kit.lua`, the addons' config), test it
  (`luajit test.lua`: the select, the banners, the board and its rings, the
  slot, a page's list of cards, the figures; the rest is tested by each
  addon's simulation), commit.
- `bun run check` runs them all (stylua's check, `luajit test.lua`, `bun
  test`, the panel's tests and manifest); through q.ts it stamps the tree,
  which a push asks for.
- In each addon: `bun run kit:sync`, then its own checks. The copy's stamp
  is the kit's last commit that touched what it copies (`Kit.lua`, `Media/`,
  `root.ts`, `root.py`, `locales-lib.ts`, `package-lib.ts`, `i18n/`,
  `wow.yml`, `stylua.toml`): a harness commit moves none. The sync refuses
  uncommitted kit code (`--dirty`: a trial, stamped `<sha>+`, which the check
  and preflight refuse). `bun run kit:check` compares each copy with the kit
  at its stamp (a copy edited by hand, a stamp made up, fail), then the stamp
  with the kit's newest *on origin/main* (fetched first, offline the last
  fetched one, said so): behind it, the copy is stale (in CI only said, so a
  daily job never fails between a kit push and the addon's sync). A kit
  commit still local stales nobody, and a stamp origin/main lacks fails. The
  sync refuses a kit whose HEAD isn't on origin/main: push the kit first
  (`--dirty` trials skip it). A picture
  the kit dropped leaves the addon's `Media/` at the next sync. The sync also
  copies `root.ts` (and `root.py`, beside Python scripts) into the addon's
  `scripts/`, stamped the same way: its scripts find the kit and wow-data
  through them, from a worktree too. Beside them the languages' core
  (`locales-lib.ts`, beside `scripts/locales.ts`) and the package's
  (`package-lib.ts`, beside `scripts/package.ts`), copies because CI runs
  them without the family folder; at the root `wow.yml` (the game's globals
  for selene, the addon's own in its `<addon>.yml`) and `stylua.toml`.
  Keyring, without the Lua kit, takes the scripts alone (`sync.ts
  --scripts`).

- A visual change is checked first against the game's own textures and code
  (`bun wow-data/bin/ui.ts`, the pinned Gethe/wow-ui-source and
  wow-ui-textures, `wow-data/docs/ui-source.md`), rendered at the sizes it's
  drawn. A frame path the source lacks is a guess, and the code says so.

`windows/install.cmd` is the test builds' installer, copied beside the zips
in the iCloud test folder ("WoW addons test") as `Install.cmd` (asks the
game) and `Install Classic Era.cmd`, `Install Forever.cmd` and `Install
Forever beta.cmd`: its name picks the game. It
unzips every addon zip beside it into that game's `Interface\AddOns`
(`_classic_era_`, `_forever_` or `_classic_beta_`), each zip's old folders
removed first, nothing else touched. Yonder's `FieldJournal` handover never
goes to Forever (a folder of that name there is Field Journal: Forever's).
The client's game type, not its folder, picks the TOC: `_forever_` loads
`_Camelot.toc` (Blizzard's own TOCs say `AllowLoadGameType: camelot`).
Windows' own `tar.exe` does the unzipping, no PowerShell. The game's folder
is found where Battle.net puts it, else asked once and kept in
`wow-folder.txt`. CRLF line endings: batch files need them, and
`windows/eol.test.ts` (in `bun run check`) fails on a bare LF (a copy
written after checkout keeps LF while git calls it clean: `rm` it and `git
checkout` it again). After the
addons it offers Ravenpost: the newest `Ravenpost/ravenpost-*-windows-<arch>.exe`
beside it (arm64 or x64, by the processor) is copied, on a yes, to
`%LOCALAPPDATA%\Ravenpost\Ravenpost.exe` and started. Ravenpost's builds live
in that `Ravenpost/` subfolder, never among the zips (the `*.zip` glob would
not take its macOS zip, but the folder keeps the top readable).
`windows/install.command` is the same for macOS (copied as `Install.command`,
or named "Forever", "Classic Era", "Forever beta"): into
`/Applications/World of Warcraft/<game>/Interface/AddOns` with `unzip`,
and Ravenpost's `-macos.zip` into `/Applications` on a yes. Neither was
tested on Windows (no machine here): the macOS one was run against a fake
game folder.

Conventions: Conventional Commits, lowercase subjects, no AI co-author
trailers; commit locally, ask before any push.

## Packaging and releasing

Every addon packages and releases the same way. `scripts/package.ts` names
its games and the files only each loads, and calls `package-lib.ts` (the
kit's copy): each TOC's interface first (the interfaces are the lib's, one
place for a game's patch; preflight checks them against wow-data's pins),
the TOCs alike but for their own files, every file they load there and
carried by git, every Lua file loaded, no TOC a game doesn't name; then
`dist/<Addon>` and its zip, `<Addon>-<git describe>.zip`. Yonder's handover
folder ships beside it through `also`.

`scripts/release.sh` calls the kit's `release.sh` with the addon's folders
(through `scripts/root.ts`: a release runs here, never in CI). It needs
`--version X.Y.Z`: there is no default, and without it the refusal prints
preflight's suggestion. Before
anything changes: main, clean, in sync with origin; the saved ids against
the last release tag (`ids.ts --last-release`); HOLD_STORES read (gh must
answer). Then the bump, the whole check through q, the stamp of that very
tree confirmed, the commit, origin's main checked again (a daily data merge
during the check stops it), the tag, HOLD_STORES set or cleared, and one
atomic push: main and the tag together or neither. A stop anywhere before
the push puts everything back (the bump, the commit, the tag, the
variable). `release.test.ts` plays each case in scratch repositories.

## Every repository at once

Two scripts for what needs no thinking, from `~/code/wow-addons`:

```bash
bun addon-kit/status.ts              # every repository: ahead/behind, uncommitted, each
                                     # workflow's last run, open pull requests, and
                                     # whether its iCloud test build is its HEAD
bun addon-kit/status.ts --no-fetch   # the same without fetching first
bun addon-kit/each.ts -- bun run check            # one command in every addon
bun addon-kit/each.ts --kit -- bun run kit:sync   # in every addon with a kit copy
bun addon-kit/each.ts --all --verbose -- git status --short
```

```bash
bun addon-kit/secret.ts WAGO_API_TOKEN       # the clipboard, read once, on every repo using it
bun addon-kit/secret.ts INBOX_EVENTS_TOKEN --generate --vercel ravenpost/inbox
```

`status.ts` lists what wants a hand last: files uncommitted, commits to push
or pull, a workflow that failed, a pull request open, a test build behind
what ships (the addon's folders, not its store page or tests; Ravenpost's
app, not its inbox), hooks gone or not ours, a repository git can't read.
Every git and gh call gives up after 20 seconds (said so), and without gh
the workflows and pull requests are left out. `each.ts` runs one after the
other (`--parallel`: all at once), prints a line for each that passed and
the end of each failure, and exits non-zero if one failed; `--only a,b` and
`--skip a,b` pick repositories by folder, a name that isn't one refused
(exit 2). The command after `--` runs as its words, no shell between
(quotes, `$` and globs reach the program as typed); a single word is a
shell line, run by `/bin/sh` (`-- 'git status --short && git log -1'`). `secret.ts` sets one secret on every repository
whose workflows read it (directly or through wow-data's reusable workflow),
from the clipboard or a value it makes (`--generate`), and on a Vercel
project with `--vercel <dir>`; it checks the token's shape first
(CurseForge's is a UUID, Wago's isn't), asks before setting, and never
prints the value. Their pure parts are tested in `tools.test.ts` (`bun
test`).

## The data's pull requests

The daily jobs' pull requests and runs (wow-data's Pins, Players and
Databases, each addon's Game data), handled by the `wow-data-prs` skill:

```bash
bun addon-kit/data-prs.ts                    # each job's last run, every data pull request open
bun addon-kit/data-prs.ts facts [<pr>] [--out <file>]   # a players' facts pull request, line by line against the databases
bun addon-kit/data-prs.ts db-diff <before.db> <after.db>  # two builds of a database: rows, ids lost, English names
```

`facts` reads only what the pull request adds (against the fork point) and
gives each line a verdict against the game's database: known (the game's
tokens count as the same), fills a gap, new (an id no source has), differs,
or flagged (a broken shape, a value out of bounds, a link, markup, the
game's escape codes, hidden characters, a sighting far from every spawn).
Its pure parts are tested in `data-prs.test.ts`.

## Regional names

A game name is held once, in wow-data (26 October 2026): esMX takes esES's
name where its client has none (source `esES`), and an addon that reads
esES's prose for esMX never types a game name of esMX's. `regional.ts`
resolves the addon's `i18n/esMX/regional.json` (`names`: esES game names;
`words`: what is no game name) against the databases into
`regional.resolved.json`, which the addon's loaders swap:

```bash
bun scripts/root.ts --run addon-kit/regional.ts            # write it
bun scripts/root.ts --run addon-kit/regional.ts --check    # stale? (the addon's check)
bun scripts/root.ts --run addon-kit/regional.ts --migrate  # words that are game names move to names, once
```

## Saved ids

A table naming the ids a saved file keeps (a journal's creatures, quests,
places, flights, a debrief's foes, a cook's recipes) never loses one when it
is regenerated: a journal holding the id would show it bare. Each addon with
such tables lists them in `saved-ids.json` at its root, and its check runs
`ids.ts` (Hearthtale's `addon:check`, the others' `check`, all of them the
daily game-data job's check):

```bash
bun scripts/root.ts --run addon-kit/ids.ts check    # the fork point from origin/main against the working directory
bun scripts/root.ts --run addon-kit/ids.ts check --base ee96889^ --head ee96889   # a past change, audited
bun scripts/root.ts --run addon-kit/ids.ts list     # every table's files and how many ids each
```

A table's `before` lists files loaded first in the same `ns` (Hearthtale's
`Forever.lua` adds to `Knowledge.lua`'s tables), and a path may hold `*`
(every child) and end on a value (`data.expeditions.*.quarry.id`: the
quarries' creature ids). Every generated table holding ids is listed or
excused: a tracked Lua file whose head says it's generated and that keys
ten or more entries by number, or such a JSON file under `i18n/` or
`data/`, is one of the manifest's tables or one of its `unlisted` (`{ glob:
why }`: its ids decode nothing saved, a build input say); one neither fails
the check locally (CI says it and goes on). `--base` that doesn't resolve
is an error, never a pass, and `--last-release` compares against the newest
release tag (what the players have: release.sh runs it).

An id missing fails it, so the daily job stops before its pull request and
the owner is told: the lost ids, file by file, in the run's summary and
`.cache/logs/ids-missing.json`. The fix is upstream (wow-data's `left_out`
keeps what its build leaves out by name, the kit's `subzones.py` keeps every
old id). A removal on purpose takes the user's go first, then its ids under
`removed` with `why` and `approved`. A table is read file by file (one
language's or one game's loss isn't hidden by another's): a Lua file as the
game loads it, in LuaJIT, its keys with those behind its `__index`; a JSON
file at its key paths, together. The manifest stays out of the release
(`.pkgmeta`'s `ignore`, which the check asks for). Its format is in
`ids.ts`'s header, the tests in `ids.test.ts`.

## The harness

The tools below (`config board events q hooks review packet each status usage session`.ts and `githooks/`) are **stamped copies of the standalone `../harness/` repository**: edit them there, commit, then `bun harness/harness-sync.ts .` from the family folder (`--check` fails on a hand edit). Their tests live there too. The family's own parts stay here: `harness.family.toml` (the config; the family root's `harness.toml` holds one line, `include = "addon-kit/harness.family.toml"`, and is written by hand on a new machine), `packet-extras.ts` (Yonder's riddle cards), `status-extras.ts` (iCloud builds), `coldread.ts`, `preflight.ts`.

The family's way of working (`docs/harness.md`): quiet output, gates git
keeps, a packet for each review, a board of tasks. From a repository:

```bash
bun ../addon-kit/q.ts check -- bun run check   # "check: ok (41s) · stamped 3f2a1b9", or FAILED and
                                               # the lines that matter (20 at most); exit code kept,
                                               # whole output in .cache/logs/check.log
bun ../addon-kit/q.ts test -- bun test         # any name: the same, no stamp
```

From `~/code/wow-addons`:

```bash
bun addon-kit/hooks.ts status                  # each repository's hooks and HEAD's check stamp
bun addon-kit/hooks.ts install yonder          # (or --all); uninstall puts its own hooks back
bun addon-kit/packet.ts yonder [a..b]          # the reviewer's packet: .cache/review/<sha>.md
bun addon-kit/review.ts yonder "2 findings"    # the reviewer's verdict, recorded for the working tree before the commit (--again to replace)
bun addon-kit/coldread.ts yonder "read, fixed" [frFR deDE]  # a cold read of every language (or those named), recorded for HEAD: preflight's flag counts from here, not the tag
bun addon-kit/board.ts add yonder "Eight riddles" --repos yonder,wow-data   # a session's first write: running
bun addon-kit/board.ts set yonder-eight-riddles --status waiting-test --try "…"
bun addon-kit/board.ts set yonder-eight-riddles --on wow-data-trainers     # blocked, waiting on that card
bun addon-kit/board.ts set yonder-eight-riddles --status ready-to-push --committed "f4ab31a"
bun addon-kit/board.ts list [--all]            # what waits on the user first
bun addon-kit/board.ts held [yonder]           # who holds what; exit 1 when another session holds one named
bun addon-kit/board.ts may yonder              # exit 1 unless this session's running card may write it (pre-commit asks)
bun addon-kit/session.ts "Eight riddles" --repos yonder,wow-data --kind code -- "<the task>"
                                               # a new task in a session of its own (--dry-run, --plan)
bun addon-kit/session.ts children [--all]      # the sessions this one opened, and what keeps each open
bun addon-kit/session.ts close <id> [--force]  # a finished child closed (claude stop), once checked
bun addon-kit/session.ts check <local_id>      # a desktop child's verdict, before its opener archives it
bun addon-kit/usage.ts [--since d] [--baseline]  # what the cards cost: dollars per session, card and commit (docs/usage-baseline.md)
bun addon-kit/root.ts [wow-data]               # the family folder (root.py: the same for Python)
bun addon-kit/events.ts [n]                    # the harness's last n events, as the panel's log reads them
```

- **q.ts** stamps the tree a passing `check` ran on (in
  `.git/harness/`, shared by worktrees), when the command is the
  repository's check: `harness.check` (git config), else `bun run check`
  where package.json has one; a repository with neither stamps nothing.
  Stamps older than 30 days go. Never pipe a check into `tail`: q prints
  the lines that matter (the ones naming a failure, then the output's last
  five whatever they say: a diff or a crash names nothing) and keeps the
  exit code. q stopped (Ctrl-C, killed) stops its command too. A check says
  so when the repository's hooks are gone (`hooks gone:`).
- **githooks/** (`core.hooksPath`, set by `hooks.ts`): `commit-msg`
  refuses an AI co-author or a "generated with" line (`_ai`: any
  `…-by:` or `…-with:` trailer naming one, "generated/made/written with"
  one), `pre-push` refuses a branch or tag whose tree has no stamp and
  prints the command that makes one, and a commit it sends whose message
  `_ai` refuses (a cherry-pick, a rebase or a merge never ran commit-msg).
  A check on uncommitted files counts for the commit holding exactly
  them. A repository's own hooks (husky's) run after ours, never the
  harness's own again by another path (`_chain`); husky's `prepare` takes
  `core.hooksPath` back on `bun install` (status says so). A
  `core.hooksPath` naming a folder without the gates (the kit moved, an
  old checkout of it) makes git run no hook and say nothing: `hooks.ts
  status` says `MISSING` and exits 1, `status.ts` lists it, q's check
  says it.
- **packet.ts**: the commits, diff stat, files, uncommitted state, what
  scripts already checked (the stamp, subjects, trailers) and, for Yonder's
  riddle files, wow-data's cards of the subjects the change touches. The
  reviewer helper reads it first, and ends with a verdict line the session
  records with **review.ts**, which the desktop panel shows. **The review
  comes before the commit** (29 October 2026): packet.ts on the uncommitted
  files, the reviewer, the fixes, then review.ts, then one commit. A verdict
  attests a tree (`.git/harness/review-tree-<tree>`, its first line
  `verdict: …`): the working files as they are when it is recorded, which
  is HEAD's tree once they are committed unchanged (an older
  `review-<HEAD sha>` still counts). A working packet writes its tree
  (`<!-- tree: … -->`) and the verdict says what changed since (`edited:`,
  a shortstat), louder past 80 lines: a change that big wants a packet of
  its own. The packet writes its range under its title (`<!-- range: <base>
  <tip> -->`) and the verdict keeps it (`base:`, `tip:`): the panel counts
  a review only when its base is already on the upstream, so the default
  range (everything not on GitHub yet: past the upstream, on a branch never
  pushed all no remote has, in a repository no remote has ever seen its
  whole history) is the one that counts. review.ts works on a dirty tree
  and refuses a tree that already has a verdict (the old one is printed,
  `--again` replaces it). One reviewer run a task, not a commit.
  **pre-push is the backstop** (`review.ts --push`): the newest commit the
  push sends whose tree has a verdict must be followed only by commits of
  waived files (README, CLAUDE and CURSEFORGE pages, `*.toc`, `docs/`, and in an addon the kit's copies), and a push of
  nothing but waived files needs no review, so a release's TOC bump and a
  kit sync go through. A rebase or a merge that changes the tree loses the
  verdict: record it again (`--again`) on the tree you push, after a look
  at what came in.
- **board.ts**: one card a task in `~/code/wow-addons/board/`, its
  front matter written only here, whole (beside it, then moved in: a
  reader never sees one cut); a new card is linked in under a name no
  other has, so two adds at once never share a file. Its id is the repo
  and the title as a slug, the repo once when the title starts with it
  (`addon-kit-the-kit-audited`). A card whose front matter can't be read
  (cut short) lists as `BROKEN`, holds nothing and `set` refuses it until
  it's mended by hand; `--on` names a card that exists; a `held:` line
  says when the holder's session looks gone (Claude Code's registry). Its body is `## Try`, `## Committed`,
  `## Left` (`--try`, `--committed`, `--left`). `status.ts` shows the open
  cards and each repository's check. The board is the lock of "two
  sessions never write the same repository at once": a card names every
  repository its task writes (`--repos`, else its repo; `repos:` is
  written only when it differs), and a running card holds them, each in
  the order cards came to hold it (`since:`, a time per repository, set
  when the card starts running and when `--repos` adds one, to the
  millisecond; times compare as times, the id breaks a tie). The later of
  two is still written, with a `held:` line on stderr: drop that
  repository and go on, or commit what it has, block on the holder and
  write nothing (`--on <id>`: status blocked, `waits:` in the front matter,
  cleared when it leaves blocked; never itself). A
  blocked or waiting card holds nothing and writes nothing, so a waiter
  never locks out another or its holder; its unpushed commits are a
  `note:` to a card in the same repository. add and set read the board
  back 150 ms after writing, so two cards written at once see each other
  and agree which came first. A blocked card is free once nothing holds
  its repositories (its holder stopped, or dropped them), the same test as
  `held`, and its every `set` says so. A
  blocked card's every `set` says `still held` or `free`, a card that
  stops running names the blocked cards it frees, a name that is no family
  folder is a note. `held [repo…]` lists the holders, exit 1 when another
  session's card holds one named before this session's own, so a session
  can check before it writes. git keeps it too: a Claude session's commit
  (`CLAUDE_CODE_SESSION_ID` set) passes the pre-commit hook only while a
  running card of that session names the repository and no other
  session's card came to hold it first (`board.ts may`); a person's own
  commit and CI's are never asked.
- **session.ts**: a new task asked in a session that has its own is
  opened by that session in one of its own (the family's one session per
  task), which writes nothing for it: `claude --bg -n <card title> --model
  <by kind: code opusplan, prose opus>` from the family folder, without the
  running session's `CLAUDECODE` and `CLAUDE_*` (the lock tells sessions
  apart by `CLAUDE_CODE_SESSION_ID`; `CLAUDE_BASH_MAINTAIN_PROJECT_WORKING_DIR`
  and `CLAUDE_CONFIG_DIR` kept). Its prompt: the maps, the card as its first
  write (`board.ts add`, these `--repos`), its model, the task. It prints
  the session's short id, `claude attach <id>` and `claude logs <id>`, and
  says which of its repositories another card holds. `opusplan` runs Sonnet
  outside plan mode: the session settles its own plan, the architect
  helper looking before it locks, and nothing waits on the user. `--plan`
  is the opener's call, never the user's: plan mode for a task that needs
  a design settled first (Opus plans, then one stop for the user's
  approval, which leaving plan mode always asks; no card shows that wait,
  so the output says it, for the opener to tell the user). `--dry-run` prints the
  command and the prompt and starts nothing. The prompt gives the child
  its opener's address (the socket in Claude Code's session registry,
  else its name): it reports by SendMessage each time its card stops
  running and once it has pushed. Each opening leaves
  `.cache/harness/opened/<id>.json`; `children` lists this session's,
  `close <id>` runs `claude stop` (the conversation kept) and drops the
  record. It refuses a child that is busy or waiting (always), and,
  without `--force` (the user's word), one this session didn't open, one
  with no card or an open one, a repository of it with commits on no
  remote committed since it started (another card there or not), or
  uncommitted changes no other running card explains. `claude --bg`
  sessions never show in the desktop app's sidebar: a desktop opener
  opens its children with the app's own session tool (the `child` skill,
  the prompt from `--desktop`) and archives them after `check
  <local_id>`, close's verdict without the stop, the record or the
  opener's question (the app shows whose child it is). Tests stub
  `claude` on the PATH (`../harness/session.test.ts`).
- **root.ts / root.py**: `WOW_ADDONS_ROOT`, else up from the working
  directory, else up from the repository's main checkout (so a worktree
  anywhere finds `addon-kit/` and `wow-data/`). Each addon carries a copy in
  `scripts/` (kit:sync): a TS script imports wow-data as `await
  import(familyPath("wow-data", "src", "db.ts"))` (its types from an `import
  type`), a Python one puts `family_path("wow-data", "py")` on `sys.path`, a
  package.json script or a shell one runs `bun scripts/root.ts --run
  addon-kit/sync.ts …` (an error and a failing exit when there's no family
  folder: never `bun "$(…)"`, whose empty path bun runs as its usage, exit 0).
- **usage.ts**: what a card costs. Reads the transcripts of every card's
  session and its helpers (`~/.claude/projects/<the family folder>*`, the
  session id the card names), each message once, and prints per session:
  dollars at list price (`PRICE`: per million tokens by model family, cache
  writes at the five-minute or the one-hour rate as the transcript says;
  an estimate to compare runs by, not an invoice), the helpers' share,
  turns, the context re-read each turn, the commits the session made (counted
  by git in the card's repositories, the user's, while one of its commit
  commands ran; the transcript's segments only where git can't answer), dollars per commit and per done
  card. A session that carried several cards shares its cost among them.
  Results are cached per session in `.cache/usage/`; `status.ts` shows the
  last run's line. `--baseline` writes `docs/usage-baseline.md` once (it
  refuses while the file exists), the numbers of 25 October 2026 before the
  model and effort changes, which the builder pilot and later changes are
  judged against. A floor: deleted transcripts and cards whose session is a
  name are left out and listed. Tests: `../harness/usage.test.ts`.
- **events.ts**: the harness's event log
  (`~/code/wow-addons/.cache/harness/events.log`, one tab-separated line
  each: time, source, tone, repository, text). q.ts, review.ts, board.ts
  (a card added or moved) and the hooks' refusals (`githooks/_event`)
  append to it; the desktop panel's log reads it with the helpers and
  answered prompts from the transcripts. `HARNESS_EVENTS` names another
  file, `off` none (the tests use their own). Beside it, `running/`: a
  file for each q.ts run going on, written as it starts and removed
  before its verdict is logged (a killed run's is swept by the next), so
  the panel lights its gates only while one runs.
- **harness-view/**: piece D, the desktop app's live pane and status line (a
  Claude Code mod; `harness-view/README.md`), loaded through the link
  `~/.claude/skills/harness-view`. Its tests run in `bun run check`.
- **skills/**: the family's procedures as Claude Code skills (`wow-riddles`,
  `wow-translating`, `wow-releasing` (with its push waves),
  `wow-store-pages`, `wow-data-audit`, `wow-data-prs`, `wow-kit-change`, `wow-game-test`,
  `wow-new-addon`, and `child`: `/child <task>` opens it as a child session, `/child` alone
  makes the session the dispatch), each linked into `~/.claude/skills/` so every session finds them. A fresh
  machine links them again:
  `for s in ~/code/wow-addons/addon-kit/skills/*; do ln -sfn "$s" ~/.claude/skills/; done`

The root `.claude/settings.json` asks before a push, a release
(`scripts/release.sh`, `gh release`), `gh workflow run`, a Vercel deploy and
`store.ts --apply` and a pull request's merge, in every permission mode, for a
session opened at `~/code/wow-addons`; the same list in
`~/.claude/settings.json` covers every other session (a repository's, a
worktree's). What holds and what doesn't is in `docs/harness.md`. Tests:
`../harness/harness.test.ts`.

## Before a release

`preflight.ts` says, before a release, everything a script can tell about
an addon, and changes nothing:

```bash
bun addon-kit/preflight.ts                    # every addon with a store page
bun addon-kit/preflight.ts yonder hearthtale  # those
bun addon-kit/preflight.ts yonder --offline   # the live store pages left unread
bun addon-kit/preflight.ts --no-fetch --json  # as the checkouts know it, as JSON
```

For each addon: git as `release.sh` wants it (main, clean, in sync); what
ships since the last tag, grouped (feat, fix, data, kit, other: the release
notes' material) with a version suggested (a feature a minor step, else a
patch; `release.sh` takes no default and refuses without `--version
X.Y.Z`, printing this suggestion); the TOCs (one
version, each game's interface against wow-data's pinned build, TBC by
hand, the store ids, Notes in every translated language, esMX beside esES);
the store page (Support with Ko-fi before Source, its summary the TOCs'
Notes, no semicolon, Other addons naming tagged siblings by their Wago ids);
the live pages through `store.ts`'s dry run (whether `--apply` is due);
each language's coverage (locales.ts's own line, else the words counted;
esMX borrowing esES's) and the languages whose authored text (words, pages,
riddles, the files by hand, not the game's names) changed since the
language's last recorded cold read (`coldread.ts`), else since the tag, each
for a cold read by the prose-reader; CI on HEAD, the daily game data,
open pull requests; the check stamp, the review on HEAD, the iCloud test
build; the kit copy's commit on addon-kit's origin; the release workflow's
secrets and HOLD_STORES.

✗ is in the way (exit 1 while one stands), ! is to look at first, · is for
the record. A script can't say whether the store page still says what
ships, nor write the notes or read a translation cold: those stay a read.
Its pure parts are tested in `preflight.test.ts`.

## The store page

`store.ts` puts an addon's `addon/CURSEFORGE.md` on its CurseForge page, as
Markdown (its comments left out), through what the authors site's own editor
does (CurseForge has no API for descriptions). From an addon's repository:

```bash
bun ../addon-kit/store.ts .           # the live page against the file: nothing saved
bun ../addon-kit/store.ts . --apply   # the live page replaced, then read back
bun ../addon-kit/store.ts . --show    # the title, summary and GitHub notes the file gives
bun addon-kit/store.ts --all          # every addon beside the kit (from ~/code/wow-addons)
bun addon-kit/store.ts --all --apply  # every page that differs put up, GitHub's descriptions too
bun addon-kit/store.ts --ui           # the same in a browser page on this computer
```

`--ui` (`store-ui.ts`) serves a page on 127.0.0.1:4190 (`STORE_UI_PORT`)
and opens it: Check all streams the dry run's log into a window and fills a
card per addon (CurseForge's page, the summary, the TOC Notes, Wago, GitHub),
Changes shows each difference coloured, Put up publishes one addon after a
confirmation, refused when its `CURSEFORGE.md` changed since it was checked,
each store read back after. The cookies stay on this computer: the server
answers this machine only, and a key made at each start keeps another site
from pressing its buttons. `--ui --demo` shows made-up addons, nothing read
or saved. `bun test` runs its tests.

Beside each page it checks the summary: the file's note against CurseForge's
(changed by hand on the project's General page: its save sends the whole
project, links among them, which no read gives back) and the TOCs' English
Notes. With a GitHub note in the file, GitHub's description too (put up
through `gh` with `--apply`).

It needs the signed-in browser's cookie for authors.curseforge.com in
`~/.config/wow-addons/curseforge-cookie` (or `CURSEFORGE_COOKIE`), and for
Wago, addons.wago.io's in `~/.config/wow-addons/wago-cookie` (or
`WAGO_COOKIE`; without it Wago is skipped): never in CI, never committed.
Wago's page and summary go up together (its settings form carries every
field). Updating a live page publishes: a dry run first.

