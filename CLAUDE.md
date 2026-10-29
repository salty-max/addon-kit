# addon-kit

The family's shared kit and tools (salty-max/addon-kit, never released on
its own): the Lua kit every addon carries a copy of, the scripts that run
across every repository, and the harness (quiet runner, git hooks, review
packet, task board, the desktop panel). Read the family's CLAUDE.md
(`~/code/wow-addons/CLAUDE.md`) first.

## Where things are

| What | Where |
|---|---|
| The Lua kit (books' look, list, page, board, banners, settings, welcome) | `Kit.lua` (its header lists what it holds), `Media/` |
| How the kit reaches the addons (copies, stamps, kit:sync) | `README.md`, `sync.ts` |
| Every repository at once: status, one command each, secrets | `README.md` "Every repository at once"; `status.ts`, `each.ts`, `secret.ts` |
| The harness: q, hooks, packet, review (before the commit), board, sessions opened by sessions, the event log. **Stamped copies of the standalone `../harness/` repository** (its tools and `githooks/`): edit them there, never here, then `bun harness/harness-sync.ts .` from the family folder. On a new machine the family root needs its one-line `harness.toml`: `include = "addon-kit/harness.family.toml"` | `harness/CLAUDE.md`, `harness/docs/design.md`; the config `harness.family.toml` (the family root's `harness.toml` includes it); the family's own extensions `packet-extras.ts` (riddle cards), `status-extras.ts` (iCloud builds); the plan and what was built: `docs/harness.md` |
| The desktop panel and status line (piece D, a Claude Code mod) | `harness-view/README.md` |
| The family's procedures as skills (riddles, translating, releasing and push waves, store pages, data audits, a kit change carried into the addons, a test in the game, a new addon, opening and closing child sessions) | `skills/<name>/SKILL.md`, linked into `~/.claude/skills/` |
| Before a release: everything a script can tell, nothing changed | `README.md` "Before a release"; `preflight.ts` |
| Store pages on CurseForge, Wago and GitHub | `README.md` "The store page"; `store.ts`, `store-ui.ts` |
| Game names for translations (glossary, building areas) | `glossary.py`, `subzones.py` (their docstrings) |
| Saved ids never dropped by a regeneration (each addon's `saved-ids.json`) | `README.md` "Saved ids"; `ids.ts` |
| The test-build installers (Windows, macOS) | `windows/install.cmd`, `windows/install.command`, `README.md` |

## Commands

```bash
bun run check                                  # stylua, luajit test.lua, bun test, the panel's tests and manifest
bun q.ts check -- bun run check               # the same, quiet, stamping the tree (a push asks for the stamp)
luajit test.lua                                # the kit's Lua tests alone
stylua Kit.lua                                 # format (the addons' stylua.toml)
```

From `~/code/wow-addons`: `bun addon-kit/status.ts`, `bun addon-kit/each.ts
[--kit|--all|--only a,b] -- <command>`, `bun addon-kit/hooks.ts
status|install <repo>`, `bun addon-kit/packet.ts <repo> [range]`, `bun
addon-kit/review.ts <repo> "<verdict>"`, `bun addon-kit/coldread.ts <repo>
"<verdict>" [lang…]`, `bun addon-kit/board.ts
add|set|list`, `bun addon-kit/session.ts "<title>" --repos a,b --kind
code|prose -- "<task>"`, `bun addon-kit/events.ts [n]`, `bun addon-kit/store.ts
--all|--ui`, `bun addon-kit/preflight.ts [repo…]`. Usage of each in
`README.md`.

## Hard rules

- The harness files (`config board events q hooks review packet each status usage session`.ts and `githooks/`) are copies stamped `// harness <sha>`: a hand edit fails `bun run check`. Change them in `../harness/`, commit there, sync here.
- Edit the kit here, never an addon's copy (`Kit.lua`, `Media/`,
  `scripts/root.ts`, `scripts/root.py` in each addon). Commit, then `bun run
  kit:sync` and its checks in each addon that carries it (`bun
  addon-kit/each.ts --kit -- bun run kit:sync`), and commit those too.
- A visual change is checked against the game's own textures first,
  rendered at the sizes it's drawn, and every Blizzard frame, texture path
  or API it names is read through `bun wow-data/bin/ui.ts` first (`frame`, `find`, `texture`: the pinned Gethe source and the client's own file list, both games in one call, `wow-data/docs/ui-source.md`). A frame path the source lacks is a
  guess and the code says so. Never a Gethe branch fetched by hand.
- The kit's words go through `K.L`, English by default; no semicolons in
  what players read.
- `store.ts --apply` publishes: a dry run first, the user's go before it.
  The cookies live in `~/.config/wow-addons/`, never committed, never in CI.
- `secret.ts` never prints a value and asks before setting one.
- Conventional Commits, lowercase subjects, no AI trailers (the
  commit-msg hook refuses them). Commit locally; ask before a push. The
  pre-push hook wants a passing check stamp on the tree.
- `harness-view/` and `skills/` are loaded live by every new session
  through their links in `~/.claude/skills/`: a broken edit breaks the panel
  or a skill everywhere. The panel's tests run in `bun run check`.
