---
name: wow-child
description: The family's addendum to the child skill, for a session inside ~/code/wow-addons: the repositories table, the models by kind (opusplan, Opus for prose), every decision taken in the opener (the push go included), and push waves. Use together with child (the family's CLAUDE.md names it, as child's step 0 asks).
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
- **Every decision is taken in the opener** (`[session] decisions =
  "opener"`, 21 November 2026, the user: "Again I should not have to go to
  another session to approve something"; from 29 October 2026 until then a
  go was asked in the child's own session, because a go given in a child
  never reached the opener, which could not verify it). A child asks the user
  nothing: it sends each question (a push, a merge, a release, a store
  upload, any choice) to its opener by SendMessage with the options and its
  recommendation, and stops. The opener asks the user with the question tool
  (their answer, in the opener, is the go: no quote to check), the child's
  options word for word, never paraphrased, then acts on the answer or
  relays it to the child quoted, and names any other card's commits below
  the child's first. A push go never covers a deploy, a release or a store
  upload: each is asked again, in the opener.
- **The opener runs the commands the ask rules prompt for** (`git push`,
  `release.sh`, `gh release`, `gh workflow run`, a merge, `store.ts
  --apply`, `gh repo create`, a secret or a variable set, a deploy): the
  prompt fires in the session that runs the command, and it must be the one
  the user is in, so a child hands over what to run (repository, sha range,
  notes file) and stops. A release commits and tags in the addon: the
  opener first holds a card naming that repository (`board.ts add`, or
  `set --repos`, once the child's card no longer runs there), or the
  pre-commit lock refuses it. A push in the opener asks twice, the question
  and then the permission prompt.
- **A test in the game or a review** is still the user's to do: the child's
  card says so and its report goes to the opener, which relays it in one
  line. The user brings the findings to the session they are in, which sends
  each to the card's own session by SendMessage (a new session when that one
  is closed).
- **A plan's approval** is still asked in the child (leaving plan mode
  always asks the user where it plans, nothing routes it to the opener):
  open on 21 November 2026, whether a plan child should send its plan to
  the opener instead is the user's to decide.
- When the user works in a family session directly, that session is the
  opener of the children it opens.
- **Pushes in waves** across several repositories (order, CI between):
  `wow-releasing`.
- **The folder stays the family's**: a child is opened with
  `use_worktree: false` in `~/code/wow-addons` (the family's config leaves
  `[session] worktrees` false: shared checkouts and the lock, the board's
  choice of 3 November 2026); never a bare `cd` in Bash
  (the root settings pin the working directory).
- The harness itself is edited in `harness/`, then synced into `addon-kit/`
  (`wow-harness-init`): a change to `session.ts`'s prompt is made there.
