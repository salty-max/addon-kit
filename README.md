# addon-kit

The Lua shared by Hearthtale, Lorekeeper's Codex, Explorer's Field Journal and
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

`Media/` holds the kit's pictures: `Ring.tga`, the game's bronze ring
(`COMMON/BlueMenuRing`) with the shadow baked into its file removed, worn by
every round picture. `kit:sync` copies it into each addon's `Media/`.

- Change the kit here, format it (`stylua Kit.lua`, the addons' config), test it
  (`luajit test.lua`: the select, the banners, the board and its rings, the
  slot, a page's list of cards, the figures; the rest is tested by each
  addon's simulation), commit.
- In each addon: `bun run kit:sync`, then its own checks. `bun run kit:check`
  fails when the copy isn't the kit's (a copy edited by hand).
- A visual change is checked first against the game's own textures and code
  (Gethe/wow-ui-textures and wow-ui-source), rendered at the sizes it's drawn.

Conventions: Conventional Commits, lowercase subjects, no AI co-author
trailers; commit locally, ask before any push.
