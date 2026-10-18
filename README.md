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
- In each addon: `bun run kit:sync`, then its own checks. `bun run kit:check`
  fails when the copy isn't the kit's (a copy edited by hand).
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
```

Beside each page it checks the summary: the file's note against CurseForge's
(changed by hand on the project's General page: its save sends the whole
project, links among them, which no read gives back) and the TOCs' English
Notes. With a GitHub note in the file, GitHub's description too (put up
through `gh` with `--apply`).

It needs the signed-in browser's cookie for authors.curseforge.com in
`~/.config/wow-addons/curseforge-cookie` (or `CURSEFORGE_COOKIE`): never in
CI, never committed. Updating the live page publishes: a dry run first.

