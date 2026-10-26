#!/usr/bin/env bash
# The family's release, one for every addon: each addon's scripts/release.sh
# calls it with its folders. It bumps the addon's version, checks, commits,
# tags and pushes. GitHub Actions then packages and publishes it
# (.github/workflows/release.yml): the GitHub release, CurseForge and Wago Addons.
#
#   scripts/release.sh --version X.Y.Z [--hold] [--dry-run] NOTES.md
#   (bash addon-kit/release.sh --folders "addon/Name [addon/Other]" …, from the addon's root)
#
#   NOTES.md         release notes (markdown): the tag's message, then the
#                    changelog on GitHub, CurseForge and Wago
#   --version X.Y.Z  required, there is no default: a release's number is
#                    decided (preflight suggests one: a feature a minor
#                    step, else a patch), never guessed from the TOCs
#   --hold           the GitHub release alone (repository variable
#                    HOLD_STORES); the stores later, by hand:
#                    gh workflow run release.yml -f tag=vX.Y.Z
#   --folders        the addon's folders, the first one's TOC giving the
#                    version (Yonder's handover follows it)
#
# Before anything changes: main, clean, in sync with origin; the saved ids
# against the last release (ids.ts, what players have). Nothing is published
# until the push, which is atomic: main and the tag go up together or not at
# all, and only if origin's main is still the one the check started from.
# Anything that stops it before then puts the repository back as it was:
# the bump, the release commit, the tag, the HOLD_STORES variable.
set -euo pipefail

VERSION="" NOTES="" DRY=0 HOLD=0 FOLDERS=""
while [ $# -gt 0 ]; do
  case "$1" in
    --version) VERSION="$2"; shift 2 ;;
    --hold) HOLD=1; shift ;;
    --dry-run) DRY=1; shift ;;
    --folders) FOLDERS="$2"; shift 2 ;;
    -*) echo "unknown option $1" >&2; exit 2 ;;
    *) NOTES="$1"; shift ;;
  esac
done
die() { echo "release: $*" >&2; exit 1; }
[ -n "$FOLDERS" ] || die "no --folders: run the addon's scripts/release.sh"
[ -n "$NOTES" ] && [ -s "$NOTES" ] || die "give a non-empty release notes file"
if [ -z "$VERSION" ]; then
  # (best effort: preflight's suggestion, offline, for the one who runs this to confirm)
  suggested=$(bun scripts/root.ts --run addon-kit/preflight.ts --offline --no-fetch --json "$(basename "$PWD")" 2>/dev/null |
    sed -n 's/^ *"next": *"\([^"]*\)".*/\1/p' | head -1 || true)
  die "no --version: a release names its version. ${suggested:+preflight suggests $suggested: }run bun addon-kit/preflight.ts $(basename "$PWD") and give --version X.Y.Z"
fi

git fetch -q origin --tags
[ "$(git rev-parse --abbrev-ref HEAD)" = main ] || die "not on main"
[ -z "$(git status --porcelain)" ] || die "the working tree isn't clean"
FETCHED=$(git rev-parse origin/main)
if [ "$(git rev-parse HEAD)" != "$FETCHED" ]; then
  git merge-base --is-ancestor HEAD "$FETCHED" &&
    die "main is behind origin/main (a daily data merge?): git pull --ff-only, then run the release again"
  die "main isn't in sync with origin/main"
fi

TOCS=()
for d in $FOLDERS; do
  for t in "$d"/*.toc; do
    [ -f "$t" ] || die "$d: no TOC"
    TOCS+=("$t")
  done
done
current=$(sed -n 's/^## Version: *//p' "${TOCS[0]}" | tr -d '\r')
[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || die "not a version: $VERSION"
TAG="v$VERSION"
git rev-parse -q --verify "refs/tags/$TAG" >/dev/null && die "$TAG already exists"

# The saved ids against the last release: what players' saved files hold.
if [ -f saved-ids.json ]; then
  bun scripts/root.ts --run addon-kit/ids.ts check --last-release || die "an id the last release had is gone (saved-ids.json)"
fi

# HOLD_STORES as it is (gh must answer: a release can't guess it).
held=$(gh variable list --json name,value -q '.[] | select(.name == "HOLD_STORES") | .value') ||
  die "gh can't read the repository's variables (gh auth status)"

echo "release $TAG: addon $current → $VERSION$([ "$HOLD" = 1 ] && echo ", GitHub only (stores held)")"
[ "$DRY" = 1 ] && { echo "(dry run: nothing changed)"; exit 0; }

# From here, a stop before the push puts everything back.
pushed=0 pushing=0 touched=0
restore() {
  local code=$?
  [ "$code" = 0 ] || [ "$pushed" = 1 ] && return
  # (a push whose answer the client lost may have landed all the same: then
  # it's out, and nothing is put back)
  if [ "$pushing" = 1 ]; then
    local remote
    if ! remote=$(git ls-remote origin "refs/tags/$TAG" 2>/dev/null); then
      echo "release: the push failed and origin can't be asked whether $TAG reached it: nothing put back (look at origin; if it isn't there, git tag -d $TAG and git reset --hard origin/main)" >&2
      exit "$code"
    fi
    if [ -n "$remote" ]; then
      echo "release: the push failed on this side, but $TAG is on origin: published, nothing put back" >&2
      exit "$code"
    fi
  fi
  echo "release: stopped before the push, nothing published: putting the repository back" >&2
  git tag -d "$TAG" >/dev/null 2>&1 || true
  git reset -q --hard "$FETCHED"
  if [ "$touched" = 1 ]; then
    if [ "$held" = true ]; then
      gh variable set HOLD_STORES --body true >/dev/null || echo "release: put HOLD_STORES back by hand: gh variable set HOLD_STORES --body true" >&2
    else
      gh variable delete HOLD_STORES >/dev/null 2>&1 || echo "release: put HOLD_STORES back by hand: gh variable delete HOLD_STORES" >&2
    fi
  fi
  exit "$code"
}
trap restore EXIT

perl -pi -e "s/^## Version: .*/## Version: $VERSION/" "${TOCS[@]}"
# The whole check on the bumped tree, the one pushed: q stamps it, and the
# pre-push hook refuses a tree without a stamp.
bun scripts/root.ts --run addon-kit/q.ts check -- bun run check
git add -A
stamps="$(git rev-parse --path-format=absolute --git-common-dir)/harness"
[ -f "$stamps/check-$(git write-tree)" ] || die "the check didn't stamp the bumped tree (files changed while it ran?): run the release again"

# Nothing to commit when the TOC already had this version (the first release).
git diff --cached --quiet || git commit -q -m "chore(release): $TAG"
# origin's main still the one checked (a daily data merge may land meanwhile)
[ "$(git ls-remote origin refs/heads/main | cut -f1)" = "$FETCHED" ] ||
  die "origin/main moved while the check ran (a data merge?): git pull --ff-only, then run the release again"
git tag -a "$TAG" --cleanup=verbatim -F "$NOTES"
# The stores held back or not: read by the release's workflow, so set first.
if [ "$HOLD" = 1 ]; then
  [ "$held" = true ] || { touched=1; gh variable set HOLD_STORES --body true >/dev/null; }
elif [ -n "$held" ]; then
  touched=1
  gh variable delete HOLD_STORES >/dev/null
fi
pushing=1
git push --atomic -q origin main "$TAG"
pushed=1
echo "pushed $TAG"
