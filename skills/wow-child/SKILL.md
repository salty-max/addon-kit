---
name: wow-child
description: The family's addendum to the child skill, for a session inside ~/code/wow-addons: the repositories table, the models by kind (opusplan, Opus for prose), the push go and push waves. Use together with child (the family's CLAUDE.md names it, as child's step 0 asks).
---

# /child in the family

Load `child` first: it is the general procedure (finding the tools, opening
the child, seeing it through, the dispatch). The family differs here.

- **Tools**: `addon-kit/` (`bun addon-kit/session.ts`, `board.ts`, `status.ts`).
- **Repos**: the family CLAUDE.md's table names every repository; the main
  one first, every one it writes on the card. The pre-commit lock is per
  repository (`board.ts held <repo>`).
- **Models by kind**: `session.models` is `code = opusplan`, `prose = opus`.
  Code is Sonnet outside plan mode; prose, voices, translations and design
  are Opus (the child starts on Sonnet from a Sonnet opener and
  `set_session_model` moves it up). A Sonnet dispatch is the rule: on Opus it
  cost $26 over 283 turns on 26 October 2026, about 18% on top of its
  children.
- **A go belongs to the session that asks it** (29 October 2026, the user): a
  go given in a child never reached the opener, which could not verify it.
  The child asks its push go in its own session with the question tool, its
  next report quotes the user's words and what they cover (repository,
  range by sha, push only); the opener never pushes without such a quote,
  and names any other card's commits below the child's first. A push go
  never covers a deploy or a release.
- **Pushes in waves** across several repositories (order, CI between):
  `wow-releasing`.
- **The folder stays the family's**: a child is opened with
  `use_worktree: false` in `~/code/wow-addons`; never a bare `cd` in Bash
  (the root settings pin the working directory).
- The harness itself is edited in `harness/`, then synced into `addon-kit/`
  (`wow-harness-init`): a change to `session.ts`'s prompt is made there.
