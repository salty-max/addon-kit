---
name: wow-releasing
description: Release an addon (or Ravenpost, or WoWLocker) or push its main: preflight.ts and the reviewer first, the user's go, scripts/release.sh with or without --hold, the stores later by workflow_dispatch, watching the runs, the test zip in iCloud, batching several addons' hand steps. Use whenever a push of code, a tag, a release or a store upload is on the table.
---

# Releasing and pushing

Every push of code, release and deploy waits for the user's go, asked each
time (documentation and store-page text may be pushed without asking). The
ask rules (the root's `.claude/settings.json`, the same list in
`~/.claude/settings.json` for every other session) prompt before `git push`,
`release.sh`, `gh release`, `gh workflow run`, a merge and a deploy. They are
a guard, not the go: ask the user in words first, every time. The pre-push
hook checks the stamp, not the user's go.

## Before asking for the go

1. The repository's check through q, on the tree to push:
   `bun ../addon-kit/q.ts check -- bun run check` (or the repo's
   `harness.check`; an addon from a worktree: `bun scripts/root.ts --run
   addon-kit/q.ts check -- bun run check`). Never pipe a check into `tail`.
2. The packet and the reviewer: `bun addon-kit/packet.ts <repo>
   [origin/main..HEAD]`, then the `reviewer` helper on it. Check its
   findings before acting on them, fix what holds, then record the verdict:
   `bun addon-kit/review.ts <repo> "<verdict>"` (on the fix commit is fine:
   it keeps the packet's range). The panel counts the review only when the
   packet's range starts on the upstream: a narrower one (`HEAD~1..HEAD`
   with more unpushed) shows `partial`.
3. A kit change goes out first: addon-kit pushed before the addons whose
   copies carry its stamp. wow-data before the addons that read its new data.
4. A board card says what is ready: `bun addon-kit/board.ts add <repo>
   "<title>" --status ready-to-push --committed "<shas>" --try "…"`, or
   `set <card id> …` for the task's card.

## The release

First the preflight, from `~/code/wow-addons`: `bun addon-kit/preflight.ts
<repo…>` (every addon without one), one table, nothing changed. Settle
every ✗ (it exits 1 while one stands) and look at every !:

- `live`: `store.ts --apply` due. The dry run (`bun addon-kit/store.ts
  <repo>`), then `--apply` on the user's go, or `--ui`. Read the page against
  what ships first: a count or a feature it names may have moved.
- `cold read`: each language whose authored text changed since the tag
  (French, German, Spanish: whichever it lists), read by the `prose-reader`
  helper before the release.
- `version`: a first release keeps the TOCs' with `--version X.Y.Z`
  (release.sh's default is the patch after). The suggested version: a
  feature a minor step, else a patch.
- `what ships`: the release notes' material. Write them from it, what a
  player notices.

From the repository, main in sync with origin and clean:

```bash
scripts/release.sh [--version X.Y.Z] [--hold] NOTES.md
```

- It bumps the TOCs' version, runs the whole check through q on the bumped
  tree (the stamp the push needs), commits `chore(release): vX.Y.Z`, tags
  with NOTES.md as the message (the changelog on GitHub, CurseForge and
  Wago), and pushes main and the tag. Actions' `release.yml` runs the
  BigWigs packager: `<Addon>-vX.Y.Z.zip`.
- `--hold`: GitHub alone (repository variable HOLD_STORES=true), for the
  user's test in the game first. The stores later, only at the user's word:
  `gh workflow run release.yml -R salty-max/<repo> -f tag=vX.Y.Z`.
- Watch the run (`gh run watch` or `gh run list`), then check the release's
  zip holds only the addon's folders.
- Ravenpost: `scripts/release.sh [--version X.Y.Z] NOTES.md` (Actions build
  macOS and Windows). WoWLocker: its tag is the site's version, `--addon
  X.Y.Z` the addon's; the stores only when the addon's version changed.
- Release notes: what a player notices, in plain words, no semicolons.

## Test builds

`bun run package` (`addon:package` for Hearthtale) gives
`dist/<Addon>-<git describe>.zip`. Copy the zip alone into
`~/Library/Mobile Documents/com~apple~CloudDocs/Hearthtale test/`, the
addon's older zip to the Trash (never `rm`), never an unzipped folder. The
user's own files there stay. Ravenpost's Windows exe of main beside it
(`INBOX_URL=… scripts/build.sh`). `bun addon-kit/status.ts` says which test
build is behind HEAD.

## Several addons at once

When one addon heads for release and a sibling is close, line up the user's
hand steps once for both: CurseForge and Wago projects, each token set on
every repo from one clipboard read (`bun addon-kit/secret.ts NAME`), one
inbox deploy with every new addon, one pass over the siblings' "Other
addons" sections, the store pages (the `wow-store-pages` skill).
