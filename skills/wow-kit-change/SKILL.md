---
name: wow-kit-change
description: Use for any change to what addon-kit copies into the addons (Kit.lua, Media/, root.ts, the scripts' libs, wowmock.lua, the kit's i18n, wow.yml, stylua.toml), and when an addon's kit:check says its copy is stale. Covers the lock on every repository it reaches, a visual change rendered first, the kit's commit, kit:sync and the check in each addon, the "chore: the kit at <sha>" commits, and the builder's brief for the syncs.
---

# A kit change

The kit is edited in `addon-kit/` and nowhere else: every addon's copy is
the kit word for word under a stamp line (`sync.ts`'s header lists what is
copied), and its `kit:check` fails on a hand edit. How the copies work:
addon-kit's `README.md`, its start and "Packaging and releasing".

## The lock first

A kit change writes addon-kit and every addon it reaches. Name them all on
the card before the first write: `bun addon-kit/board.ts set <id> --repos
addon-kit,hearthtale,lorekeepers-codex,…` (the addons with a `kit:sync` in
their package.json, the ones `each.ts --kit` runs in, Keyring among them
for the scripts it takes). If board.ts answers `held:` for an addon, drop
it from `--repos`, commit the kit anyway, and sync that addon later
(`set <id> --repos …` again once its holder is done). Leave it out of the
builder's brief.

## In the kit

1. A visual change (a frame, a texture, a colour, a size) is rendered
   against the game's own textures first, at the size it's drawn
   (Gethe/wow-ui-textures, the classic branch's PNGs, and wow-ui-source).
   Look at the render before writing the Lua.
2. Edit `addon-kit/Kit.lua` (or the file the change is in). Every word
   through `K.L`, English by default, the three languages in
   `addon-kit/i18n/<locale>.json`. No semicolons in what players read.
3. `stylua Kit.lua`, a test in `test.lua` for what the change adds, then
   the check through q from `addon-kit/`: `bun q.ts check -- bun run check`.
4. Commit (`feat(kit): …`, `fix(kit): …`). The sync refuses uncommitted kit
   code: `kit:sync --dirty` makes a trial copy (stamp `<sha>+`) for a test
   in one addon, which its check and preflight refuse, so never commit it.

## In each addon

By default the `builder` helper does the syncs (the brief below). By hand
only for one or two addons, from `~/code/wow-addons`:

```bash
bun addon-kit/each.ts --kit [--only a,b] -- bun run kit:sync
bun addon-kit/each.ts --kit [--only a,b] -- bun ../addon-kit/q.ts check -- bun run check
```

Then in each addon, a commit of its own: `chore: the kit at <sha>` (the
stamp line's sha), the copies and anything the sync wrote again (the
language files, `Media/`). A change that needs the addon's own code too (a
new call, a renamed one) is a second commit, `feat:` or `fix:` as it is,
never folded into the chore.

A failing addon check is the change's to fix: in the kit when the kit is
wrong (a new kit commit, then sync again everywhere), in the addon when
its own code leaned on what changed.

## The builder's brief

One builder, in the foreground, after the kit commit, while this session
writes nothing. It works under this session's card. The brief:

- **Goal**: the kit at `<sha>` in each addon listed (the card's, minus any
  held), checked, each tree ready to commit.
- **Files**: each addon's copies and what the sync writes, nothing else.
- **Precedent**: the newest sync commit, `git -C mealbook log --grep 'the
  kit at' -1 --stat`.
- **Checks**: `bun addon-kit/each.ts --kit --only <addons> -- bun
  ../addon-kit/q.ts check -- bun run check` all green, and `git status
  --short` in each addon showing only the copies and what the sync wrote.
- **Don't touch**: the kit, any addon's own code, the board, git (no
  commit, no push). A failure is reported with its log path, not fixed.

Then read every addon's `git diff` before committing it.

## Before the push

The packet and the reviewer for addon-kit and for each addon whose own
code changed. A test in the game for a visual change (the `wow-game-test`
skill). Then the pushes, each on the user's go, addon-kit first: the
`wow-releasing` skill's "Push waves".
