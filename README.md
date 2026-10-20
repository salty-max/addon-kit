# addon-kit

The Lua shared by Hearthtale, Lorekeeper's Codex, Yonder and
Second Wind: the books' look (one family, a theme each), the pieces their
windows are made of (the list on the left, the page on the right and every part
of a page, a board of achievements, a strip of figures, a select), the banners
that tell of a deed done (in the game's own stack of alerts), each character's
settings (copied from another character or by a code) and the welcome page that
offers them. See `Kit.lua`'s header for what it holds.

Each addon keeps a committed copy (`addon/<Addon>/Kit.lua`, listed in its TOC
before the files that use it), loaded into the addon's own namespace as
`ns.kit`: no global, no version clash between the addons, nothing more for
players to install, and the addons' releases unchanged.

Every word the kit shows goes through `K.L` (its addon's too, as `ns.L`),
English by default: a missing word is its own English. An addon's language
file fills it before anything is drawn, with the language's plural rule
(`K.isOne`, used by `K.plural`) and its month names (`K.day`). The kit's
words are few: the welcome's, the board's, a tooltip's.

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
- In each addon: `bun run kit:sync`, then its own checks. `bun run kit:check`
  fails when the copy isn't the kit's (a copy edited by hand). The sync also
  copies `root.ts` (and `root.py`, beside Python scripts) into the addon's
  `scripts/`, stamped the same way: its scripts find the kit and wow-data
  through them, from a worktree too.
- A visual change is checked first against the game's own textures and code
  (Gethe/wow-ui-textures and wow-ui-source), rendered at the sizes it's drawn.

`windows/install.cmd` is the test builds' installer, copied twice beside the
zips in the iCloud test folder, as `Install Classic Era.cmd` and `Install
Forever beta.cmd`: its name picks the game. It unzips every addon zip beside
it into that game's `Interface\AddOns` (`_classic_era_` or `_classic_beta_`),
each zip's old folders removed first. Yonder's `FieldJournal` handover goes
to Classic Era only. Windows' own `tar.exe` does the unzipping, no
PowerShell. The game's folder is found where Battle.net puts it, else asked
once and kept in `wow-folder.txt`. CRLF line endings: batch files need them.

Conventions: Conventional Commits, lowercase subjects, no AI co-author
trailers; commit locally, ask before any push.

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
app, not its inbox). `each.ts` runs one after the other (`--parallel`: all
at once), prints a line for each that passed and the end of each failure,
and exits non-zero if one failed; `--only a,b` and `--skip a,b` pick
repositories by folder. `secret.ts` sets one secret on every repository
whose workflows read it (directly or through wow-data's reusable workflow),
from the clipboard or a value it makes (`--generate`), and on a Vercel
project with `--vercel <dir>`; it checks the token's shape first
(CurseForge's is a UUID, Wago's isn't), asks before setting, and never
prints the value. Their pure parts are tested in `tools.test.ts` (`bun
test`).

## The harness

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
bun addon-kit/review.ts yonder "2 findings"    # the reviewer's verdict, recorded for HEAD
bun addon-kit/board.ts add yonder "Eight riddles" --status waiting-test --try "…"
bun addon-kit/board.ts set yonder-eight-riddles --status ready-to-push --committed "f4ab31a"
bun addon-kit/board.ts list [--all]            # what waits on the user first
bun addon-kit/root.ts [wow-data]               # the family folder (root.py: the same for Python)
bun addon-kit/events.ts [n]                    # the harness's last n events, as the panel's log reads them
```

- **q.ts** stamps the tree a passing `check` ran on (in
  `.git/harness/`, shared by worktrees), when the command is the
  repository's check: `harness.check` (git config), else `bun run check`. Never pipe a check into `tail`:
  q prints the end that matters and keeps the exit code.
- **githooks/** (`core.hooksPath`, set by `hooks.ts`): `commit-msg`
  refuses an AI co-author or a "generated with" line, `pre-push` refuses a
  branch or tag whose tree has no stamp and prints the command that makes
  one. A check on uncommitted files counts for the commit holding exactly
  them. A repository's own hooks (husky's) run after ours; husky's
  `prepare` takes `core.hooksPath` back on `bun install` (status says so).
- **packet.ts**: the commits, diff stat, files, uncommitted state, what
  scripts already checked (the stamp, subjects, trailers) and, for Yonder's
  riddle files, wow-data's cards of the subjects the change touches. The
  reviewer helper reads it first, and ends with a verdict line the session
  records with **review.ts** (`.git/harness/review-<HEAD sha>`, its first
  line `verdict: …`), which the desktop panel shows.
- **board.ts**: one card a task in `~/code/wow-addons/board/`, its
  front matter written only here. Its body is `## Try`, `## Committed`,
  `## Left` (`--try`, `--committed`, `--left`). `status.ts` shows the open
  cards and each repository's check.
- **root.ts / root.py**: `WOW_ADDONS_ROOT`, else up from the working
  directory, else up from the repository's main checkout (so a worktree
  anywhere finds `addon-kit/` and `wow-data/`). Each addon carries a copy in
  `scripts/` (kit:sync): a TS script imports wow-data as `await
  import(familyPath("wow-data", "src", "db.ts"))` (its types from an `import
  type`), a Python one puts `family_path("wow-data", "py")` on `sys.path`, a
  package.json script or a shell one runs `bun scripts/root.ts --run
  addon-kit/sync.ts …` (an error and a failing exit when there's no family
  folder: never `bun "$(…)"`, whose empty path bun runs as its usage, exit 0).
- **events.ts**: the harness's event log
  (`~/code/wow-addons/.cache/harness/events.log`, one tab-separated line
  each: time, source, tone, repository, text). q.ts, review.ts, board.ts
  (a card added or moved) and the hooks' refusals (`githooks/_event`)
  append to it; the desktop panel's log reads it with the helpers and
  answered prompts from the transcripts. `HARNESS_EVENTS` names another
  file, `off` none (the tests use their own).
- **harness-view/**: piece D, the desktop app's live pane and status line (a
  Claude Code mod; `harness-view/README.md`), loaded through the link
  `~/.claude/skills/harness-view`. Its tests run in `bun run check`.
- **skills/**: the family's procedures as Claude Code skills (`wow-riddles`,
  `wow-translating`, `wow-releasing`, `wow-store-pages`, `wow-data-audit`),
  each linked into `~/.claude/skills/` so every session finds them. A fresh
  machine links them again:
  `for s in ~/code/wow-addons/addon-kit/skills/*; do ln -sfn "$s" ~/.claude/skills/; done`

The root `.claude/settings.json` asks before a push, a release
(`scripts/release.sh`, `gh release`), `gh workflow run`, a Vercel deploy and
`store.ts --apply` and a pull request's merge, in every permission mode, for a
session opened at `~/code/wow-addons`; the same list in
`~/.claude/settings.json` covers every other session (a repository's, a
worktree's). What holds and what doesn't is in `docs/harness.md`. Tests:
`harness.test.ts`.

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

