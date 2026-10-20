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
| The harness: q, hooks, packet, review, board, root finders, ask rules, the event log | `README.md` "The harness"; the plan and what was built: `docs/harness.md`; `events.ts` |
| The desktop panel and status line (piece D, a Claude Code mod) | `harness-view/README.md` |
| The family's procedures as skills (riddles, translating, releasing, store pages, data audits) | `skills/<name>/SKILL.md`, linked into `~/.claude/skills/` |
| Before a release: everything a script can tell, nothing changed | `README.md` "Before a release"; `preflight.ts` |
| Store pages on CurseForge, Wago and GitHub | `README.md` "The store page"; `store.ts`, `store-ui.ts` |
| Game names for translations (glossary, building areas) | `glossary.py`, `subzones.py` (their docstrings) |
| Saved ids never dropped by a regeneration (each addon's `saved-ids.json`) | `README.md` "Saved ids"; `ids.ts` |
| The Windows test-build installer | `windows/install.cmd`, `README.md` |

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
addon-kit/review.ts <repo> "<verdict>"`, `bun addon-kit/board.ts
add|set|list`, `bun addon-kit/events.ts [n]`, `bun addon-kit/store.ts
--all|--ui`, `bun addon-kit/preflight.ts [repo…]`. Usage of each in
`README.md`.

## Hard rules

- Edit the kit here, never an addon's copy (`Kit.lua`, `Media/`,
  `scripts/root.ts`, `scripts/root.py` in each addon). Commit, then `bun run
  kit:sync` and its checks in each addon that carries it (`bun
  addon-kit/each.ts --kit -- bun run kit:sync`), and commit those too.
- A visual change is checked against the game's own textures first,
  rendered at the sizes it's drawn (Gethe/wow-ui-textures, the classic
  branch's PNGs; wow-ui-source).
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
