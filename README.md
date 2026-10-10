# addon-kit

The Lua shared by Hearthtale, Lorekeeper's Codex and Explorer's Field Journal:
the books' look (one family, a theme each) and the pieces their windows are
made of. See `Kit.lua`'s header for what it holds.

Each addon keeps a committed copy (`addon/<Addon>/Kit.lua`, listed in its TOC
before the files that use it), loaded into the addon's own namespace as
`ns.kit`: no global, no version clash between the addons, nothing more for
players to install, and the addons' releases unchanged.

- Change the kit here, format it (`stylua Kit.lua`, the addons' config), commit.
- In each addon: `bun run kit:sync`, then its own checks. `bun run kit:check`
  fails when the copy isn't the kit's (a copy edited by hand).

Conventions: Conventional Commits, lowercase subjects, no AI co-author
trailers; commit locally, ask before any push.
