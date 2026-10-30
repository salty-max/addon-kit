---
name: wow-harness-init
description: The family's addendum to harness-init for a repository inside ~/code/wow-addons: the stamped copy in addon-kit instead of a vendored one, harness.check, husky's prepare, the family CLAUDE.md row and memory. Use together with harness-init when a family repository lacks the hooks or the board, or a new addon needs them (wow-new-addon calls this for its hooks step).
---

# The harness in a family repository

Load `harness-init` first: it is the general procedure (looking first, the
dry run, doctor, the commit). The family differs in these places.

- **No vendored copy.** `addon-kit/` carries the stamped one at the family's
  paths. Do not run `init.ts` against a family repository for its tools:
  install only the gates, `bun addon-kit/hooks.ts install <repo>`, and read
  `bun addon-kit/hooks.ts status` (every repository, its hooks, HEAD's check).
  A harness change is made in `../harness/`, committed there, then
  `bun harness/harness-sync.ts .` from the family folder.
- **The card first**: `bun addon-kit/board.ts add <repo> "<title>" --repos
  <repo> --status running --try … --committed … --left …` (the folder can be
  named before it exists). The pre-commit hook asks `board.ts may`.
- **The check**: `bun run check` through q (`bun ../addon-kit/q.ts check --
  bun run check` from the repository). Where it isn't `bun run check`
  (Ravenpost, wow-locker) set `git config harness.check "<cmd>"`. A husky
  `prepare` takes `core.hooksPath` back on `bun install`: run `hooks.ts
  install .` after it, as Hearthtale's does.
- **The CLAUDE.md** is a map (about 700 words: what it is, commands, hard
  rules, where each doc lives), the prose in `docs/`.
- **The family's lists** once it is in: a row in the family `CLAUDE.md`'s
  folder table and a memory file with its line in `MEMORY.md`.
- Nothing is pushed without the user's go; the card is done once the commit
  is on origin.
