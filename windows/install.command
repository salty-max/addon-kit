#!/usr/bin/env bash
# Installs every addon zip beside this script into one game's AddOns folder on
# macOS, then offers Ravenpost. Double-click it (Terminal opens) or run it:
#   install.command [_classic_era_|_forever_|_classic_beta_]
# Named like Windows' installers ("Install Classic Era.command", "Install
# Forever.command", "Install Forever beta.command") its name picks the game,
# else it asks. Each zip's folders are removed from AddOns first (nothing else
# is touched). Yonder's FieldJournal handover never goes to Forever. The game's
# folder is /Applications/World of Warcraft, else asked once and kept in
# wow-folder.txt beside this script.
set -u
HERE=$(cd "$(dirname "$0")" && pwd)
NAME=$(basename "$0" .command)
FLAVOR=${1:-}
if [ -z "$FLAVOR" ]; then
  case "$(echo "$NAME" | tr 'A-Z' 'a-z')" in
    *beta*) FLAVOR=_classic_beta_ ;;
    *forever*) FLAVOR=_forever_ ;;
    *era*) FLAVOR=_classic_era_ ;;
  esac
fi
if [ -z "$FLAVOR" ]; then
  echo "Which game?"
  echo "  1  Classic Era   [_classic_era_]"
  echo "  2  Forever       [_forever_]"
  echo "  3  Forever beta  [_classic_beta_]"
  read -r -p "1, 2 or 3: " pick
  case "$pick" in 1) FLAVOR=_classic_era_ ;; 2) FLAVOR=_forever_ ;; 3) FLAVOR=_classic_beta_ ;; *) echo "No game picked."; exit 1 ;; esac
fi

WOW=""
[ -f "$HERE/wow-folder.txt" ] && WOW=$(head -n 1 "$HERE/wow-folder.txt")
[ -n "$WOW" ] && [ ! -d "$WOW/$FLAVOR" ] && WOW=""
[ -z "$WOW" ] && [ -d "/Applications/World of Warcraft/$FLAVOR" ] && WOW="/Applications/World of Warcraft"
if [ -z "$WOW" ]; then
  echo "World of Warcraft's folder wasn't found in /Applications."
  read -r -p "Paste the folder that holds $FLAVOR: " WOW
  WOW=${WOW%/}
  WOW=${WOW//\\ / }
  [ -d "$WOW/$FLAVOR" ] || { echo "No $FLAVOR folder in \"$WOW\": is this game installed there?"; exit 1; }
  echo "$WOW" > "$HERE/wow-folder.txt"
fi

ADDONS="$WOW/$FLAVOR/Interface/AddOns"
mkdir -p "$ADDONS"
SKIP=""
case "$FLAVOR" in _forever_|_classic_beta_) SKIP=FieldJournal ;; esac

echo "Installing into $ADDONS"
n=0
for z in "$HERE"/*.zip; do
  [ -e "$z" ] || continue
  # the zip's top folders, each removed once before unzipping
  while IFS= read -r d; do
    [ -z "$d" ] || [ "$d" = ".." ] || [ "$d" = "$SKIP" ] && continue
    [ -d "$ADDONS/$d" ] && rm -rf "$ADDONS/$d"
  done < <(unzip -Z1 "$z" | cut -d/ -f1 | sort -u)
  if [ -n "$SKIP" ]; then
    unzip -qo "$z" -x "$SKIP/*" -d "$ADDONS"
  else
    unzip -qo "$z" -d "$ADDONS"
  fi
  if [ $? -eq 0 ]; then echo "  ok      $(basename "$z" .zip)"; n=$((n + 1)); else echo "  FAILED  $(basename "$z")"; fi
done
echo
echo "$n addon zip(s) installed. Start the game, or restart it if it's running: a /reload misses a new file."

# Ravenpost: the newest macOS zip of the Ravenpost folder beside this script
RAVEN=$(ls -t "$HERE"/Ravenpost/ravenpost-*-macos.zip 2>/dev/null | head -n 1)
if [ -n "$RAVEN" ]; then
  echo
  echo "Ravenpost: $(basename "$RAVEN")"
  echo "  more about it: https://ravenpost-site.vercel.app"
  read -r -p "Install it into /Applications and open it? [y/N] " yn
  if [ "$yn" = y ] || [ "$yn" = Y ]; then
    tmp=$(mktemp -d)
    unzip -q "$RAVEN" -d "$tmp" && rm -rf /Applications/Ravenpost.app && mv "$tmp/Ravenpost.app" /Applications/ \
      && echo "  ok      /Applications/Ravenpost.app" && open /Applications/Ravenpost.app \
      || echo "  could not install it: is Ravenpost running? Quit it from the menu bar and run this again."
    rm -rf "$tmp"
  fi
fi
echo
read -r -p "Press Return to close. " _
