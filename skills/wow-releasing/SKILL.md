---
name: wow-releasing
description: Release an addon (or Ravenpost, or WoWLocker) or push its main: preflight.ts and the reviewer first, the user's go, scripts/release.sh with or without --hold, the stores later by workflow_dispatch, watching the runs, the test zip in iCloud, batching several addons' hand steps, push waves across several repositories in order. Use whenever a push of code, a tag, a release or a store upload is on the table.
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
   copies carry its stamp. wow-data before the addons that read its new data
   (the order and the database's wait: "Push waves" below).
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
- `cold read`: each language whose authored text changed since its last
  recorded cold read, or the tag when none (French, German, Spanish:
  whichever it lists), read by the `prose-reader` helper before the release.
  Once read and what it found is fixed and committed, record it: `bun
  addon-kit/coldread.ts <repo> "<verdict>" [lang…]` (every language by
  default), which clears the flag until authored text changes again.
- `version`: a first release keeps the TOCs' (`--version X.Y.Z` with that
  number). The suggested version: a feature a minor step, else a patch.
  `release.sh` has no default: it refuses without `--version X.Y.Z`
  (printing preflight's suggestion), so the number is always one the user
  has been shown, never the patch after the TOCs'.
- `what ships`: the release notes' material. Write them from it, what a
  player notices.

From the repository, main in sync with origin and clean:

```bash
scripts/release.sh --version X.Y.Z [--hold] NOTES.md
```

- Every addon's is the kit's (`addon-kit/release.sh`, called with the
  addon's folders). First the saved ids against the last release tag
  (`ids.ts --last-release`) and HOLD_STORES read (gh must answer). Then it
  bumps the TOCs' version, runs the whole check through q on the bumped
  tree and confirms that tree's stamp (the one the push needs), commits
  `chore(release): vX.Y.Z`, checks origin's main hasn't moved (a daily data
  merge during the check stops it: `git pull --ff-only`, then run it
  again), tags with NOTES.md as the
  message (the changelog on GitHub, CurseForge and Wago), sets or clears
  HOLD_STORES, and pushes main and the tag atomically: both or neither.
  Actions' `release.yml` runs the BigWigs packager: `<Addon>-vX.Y.Z.zip`.
- A release that stops before the push says "nothing published" and puts
  everything back itself (the bump, the commit, the tag, HOLD_STORES as it
  was): fix what it said and run it again. A push that failed on this side
  after origin took it says so ("published, nothing put back"): look at the
  release's run, nothing to redo. Only if it couldn't (it says
  "put HOLD_STORES back by hand") is there a step left, the one it names.
- `--hold`: GitHub alone (repository variable HOLD_STORES=true), for the
  user's test in the game first. The stores later, only at the user's word:
  `gh workflow run release.yml -R salty-max/<repo> -f tag=vX.Y.Z`.
- Watch the run (`gh run watch` or `gh run list`), then check the release's
  zip holds only the addon's folders.
- Ravenpost: `scripts/release.sh [--version X.Y.Z] NOTES.md` (Actions build
  macOS and Windows). WoWLocker: its tag is the site's version, `--addon
  X.Y.Z` the addon's; the stores only when the addon's version changed.
- Release notes: what a player notices, in plain words, no semicolons.
- A first release: the addon's project ids in every TOC first,
  `## X-Curse-Project-ID: <id>` (CurseForge's project page, "About") and
  `## X-Wago-ID: <id>` (Wago's dashboard), the same in each TOC
  (preflight's "store ids" row checks them), and the repository's
  `CURSEFORGE_TOKEN` and `WAGO_API_TOKEN` secrets (`bun addon-kit/secret.ts`):
  without them the packager skips that store and the run stays green.
- A hotfix is the next patch from main, never a tag on another branch:
  fix on main, then `scripts/release.sh` (release.sh refuses anything but
  main in sync; a tag off main, as Second Wind's v0.4.1 was, leaves
  preflight suggesting a version that already exists).

## Test builds

`bun run package` (`addon:package` for Hearthtale) gives
`dist/<Addon>-<git describe>.zip`. Copy the zip alone into
`~/Library/Mobile Documents/com~apple~CloudDocs/WoW addons test/`, the
addon's older zip to the Trash (never `rm`), never an unzipped folder. The
user's own files there stay. Ravenpost's builds of main (every OS: macOS
zip, Windows x64 and arm64 exes) go into the folder's `Ravenpost/`
subfolder, not beside the zips, the older ones to the Trash
(`INBOX_URL=… scripts/build.sh`). `bun addon-kit/status.ts` says which test
build is behind HEAD.

## Several addons at once

When one addon heads for release and a sibling is close, line up the user's
hand steps once for both: CurseForge and Wago projects, each token set on
every repo from one clipboard read (`bun addon-kit/secret.ts NAME`), one
inbox deploy with every new addon, one pass over the siblings' "Other
addons" sections, the store pages (the `wow-store-pages` skill).

## Push waves

Several repositories pushed together: a kit change and its syncs, a
wow-data change and the addons reading it, children's work landing at
once. Each push needs the user's go, and one go may cover several
repositories when the ask names them all.

1. **The order**: addon-kit first (the addons' stamps name its commits),
   then wow-data, then the addons, in any order. An addon's daily
   `game-data.yml` builds from wow-data's main: an addon whose generated
   files came from unpushed wow-data gets a pull request reverting them.
   If wow-data's push touches `db.yml`'s paths, it publishes the databases
   by itself (`db-<commit12>`): watch that run to the end before the
   addons (`gh run list -R salty-max/wow-data -w db.yml -L 1` for its id,
   then `gh run watch <id> -R salty-max/wow-data`). A daily job meeting a
   database still publishing waits ten minutes for it, then fails (it never
   builds from an older one), so a red Databases run is fixed first.
2. **What rides along**, before each push: `git -C <repo> log --oneline
   origin/main..<sha>`. Commits of another card below this one go out
   with it: name them to the user (the board's `note:` says which cards)
   and push only on a go that covers them.
3. **A range, by sha**: `git -C <repo> push origin <sha>:main`, never a
   bare `git push` (it would carry commits made after the go). The pre-push
   hook wants the check stamp of that very tree.
4. **CI, per repository**: every run the push started (`gh run list -R
   salty-max/<repo> --commit <sha>`), each watched in the background (`gh
   run watch <id> -R salty-max/<repo> --exit-status`), then `bun
   addon-kit/status.ts`. The
   next wave waits until every run of this one is green.
5. **The cards**: this session's own cards whose commits went out, set
   done (`board.ts set <id> --status done`). A child's card: SendMessage
   the child to set its card done, then close it once it has (the `child`
   skill). A push go the user gives in the session that opened a child is
   that session's to carry out (the family CLAUDE.md): it pushes the
   child's checked commits itself, rather than passing the go down.
