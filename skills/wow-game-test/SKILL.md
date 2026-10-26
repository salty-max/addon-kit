---
name: wow-game-test
description: Hand a round of work to the user's test in the game and take it back. Use whenever a card is about to wait on a test in the game (waiting-test), and when the user comes back from one with screenshots. Covers the cards' --try lines as one checklist, the test zips and installers in iCloud, status.ts for stale builds, then the screenshots read, the findings fixed and the cards moved.
---

# A test in the game

The game runs on the user's Windows machine. The builds go there through
iCloud, the screenshots come back the same way. One round covers every
card waiting on the game, so the user launches it once.

## Before: the round

1. **The cards**: `bun addon-kit/board.ts list`, every card whose work is
   committed and needs the game. Set each `waiting-test` now (`board.ts
   set <id> --status waiting-test`), and a child session tells its opener
   (SendMessage). Each card's `--try` says what to do in the game.
2. **The builds**, for each repository on those cards, from its HEAD: the
   `wow-releasing` skill's "Test builds" (`bun run package`, the zip alone
   into `~/Library/Mobile Documents/com~apple~CloudDocs/Hearthtale test/`,
   the addon's older zip to the Trash with `trash <file>`, never `rm`).
   Ravenpost's Windows exe too when the round touches it or what it
   carries (a saved file's shape, the inbox).
3. **The installers** beside the zips: `Install Classic Era.cmd`, `Install
   Forever.cmd` (Forever's live client, `_forever_`) and `Install Forever
   beta.cmd` (its beta client), each a copy of
   `addon-kit/windows/install.cmd`, its name picking the game. Copy them
   again when `cmp` says they differ from it.
4. **Nothing stale**: `bun addon-kit/status.ts`. A "test build … behind
   HEAD" line on a repository of this round is a zip still to refresh.
5. **The checklist** to the user, one message: which installer for which
   game, then each card's `--try` written as the user will do it (a
   character, a place, an action, what should show), grouped by game and
   character, and the screenshots wanted (the bug, the page, the chat
   line).

When iCloud refuses a background session (the `cp` failing with
`Operation not permitted`, `status.ts` showing no test build at all): leave the zip in the repository's
`dist/` and give the user the line for their own terminal, `cp
~/code/wow-addons/<repo>/dist/<zip> ~/Library/Mobile\
Documents/com~apple~CloudDocs/Hearthtale\ test/`. Never route around it
through Finder or AppleScript.

## After: the screenshots

1. The user's screenshots land in the iCloud Drive root
   (`~/Library/Mobile Documents/com~apple~CloudDocs/`, Snipping Tool's
   names, `Screenshot <date> <time>.png`), newest first. Copy each to the
   session's scratch folder with Bash and read the copy: a long-lived
   session can be refused the iCloud path itself.
2. Each one against the checklist: what it shows, the line it answers,
   right or wrong. A finding is the thing seen and where (the addon, the
   game, the language), never a guess at the cause written as fact.
3. The fixes in the card's own session (a new session if that one is
   closed): its card set `running` first, a test reproducing the bug where
   the simulation can (`addon/test/`), the fix, the check. A finding in
   another card's repository goes to that card's session, or to a new one
   (the family's rule), never left in a report.
4. Each card moved: `ready-to-push` when its lines passed, `running` while
   fixes are under way, a new round when a fix needs the game again.
