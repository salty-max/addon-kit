# The family's harness (20 October 2026)

The user's ask, after reading mirku's "Harness Engineering" article: a harness
that makes the work on the addons more reliable and uses less. Every point
below was agreed on 20 October 2026. This file is the plan the build sessions
work from: each piece is one session, started cold, so each section stands on
its own.

## Why (measured, 19 October 2026)

- The main sessions made 2,222 Opus calls that re-read 1,068M cached tokens
  (about 480k of context per call), against 3.2M written. Re-reading long
  context is roughly 80% of the cost. Cause: long sessions that carry task
  after task, and every command's output, on every call.
- claude-mem's note-taker read 50 to 100M Haiku tokens a day on the user's
  subscription (a few percent). Now it skips Read, Bash, Grep and Glob.
- One review used its 40 turns re-deriving data and ran out before it
  reported. Four of its six findings were rules a script could check.
- `bun run check | tail` hid a failing exit code twice.

## The decisions (the user's, 20 October 2026)

- **One session per task.** A task that waits on the user (a test in the
  game, a review) leaves a card on the task board and stops. A new task
  starts a new session. The user answers a waiting task in its own session.
  Two sessions never write the same repository at once.
- **Every task on the board, the board the lock** (the same evening, after
  asking how worktrees fit: "I want everything to be visible in the
  board"). No session hands writing work to worktree sessions or
  subagents. A session's first write is its card, running, naming every
  repository it writes, and the session takes the card's title. A running
  card holds its repositories, the first to run first; another session
  that needs one blocks its card on the holder and waits, holding nothing
  meanwhile.
- **Models by kind.** `opusplan` for code and mechanical work (this build
  included), full Opus for prose, voices, translations and design. Helpers
  unchanged: reviewer Opus, data-scout and prose-reader Sonnet.
- **The default model and effort** (25 October 2026, after the first
  numbers: every main session of 20 to 25 October ran Opus, none Sonnet, and
  about 80% of the spend was the context re-read each turn). The family
  folder's `.claude/settings.json` sets `model: opusplan` and
  `modelSettings` (Opus 5.5 `high`, Sonnet 5.5 `medium`): a project's
  `model` outranks the user's global `opus` (checked with a `claude -p`
  run in the folder: Sonnet answered), `--model` and `/model` outrank it in
  turn, so a prose session starts `claude --model opus` (session.ts does it
  for `--kind prose`) or `/model opus` first. A session in a worktree of an
  addon finds the addon's root, not the family folder's settings: it is
  opened by session.ts or inherits the model of the session that entered it.
  Effort by phase: medium for the work (Sonnet), high for the planning and
  prose (Opus) and for verification: the reviewer and the architect high,
  the prose-reader and data-scout medium (agents' `effort:`). Not set per
  opusplan phase: the docs give none, a model's setting holds for it.
- **The turn budget of the helpers.** The reviewer hit its 40-turn limit
  three times on 25 October and the run was cut off with a partial report.
  It has 60 now, and a Budget section: many calls in one turn, about 20
  tool calls a review, at 25 write the report, findings the moment they are
  sure. The packet carries a Size line (changed lines, and over 2,500 the
  biggest files first and a closing line naming what was not reached).
  Findings come first in its report.
- **The cost of a card** is measured, not guessed: `usage.ts`, baseline in
  `docs/usage-baseline.md`.
- **Sessions open sessions** (25 October 2026, the user: "It would be
  handy for you to open the sessions"). A new task asked in a session that
  has its own is opened by that session (`session.ts`, G below), which
  tells the user its name and how to attach and writes nothing for it.
  Small follow-ups of the same thread stay. "No session hands writing work
  to another session" still holds for a task's own work: no session
  delegates its own task, except to the one `builder` helper (the family's
  CLAUDE.md lists its conditions), and the other helpers stay read-only.
- **claude-mem** keeps running but skips Read, Bash, Grep and Glob.
- **A spring cleanup** of every folder, last.

## The pieces

Wave 1 runs in parallel (disjoint repositories). Wave 2 starts when wave 1
has landed: it touches every repository, one writer at a time.

### A. Lookup cards (wow-data) — wave 1

`bun wow-data/bin/card.ts <npc|object|place|item|quest> <id or exact name> [--game classic|forever]`
prints one compact card (40 lines at most) instead of a dozen SQL queries:

- **npc**: names in enUS and every translated locale (missing ones flagged),
  its title (subname) in each, levels, rank, type and family, faction
  template and who it attacks (EnemyGroup, FactionGroup, FriendGroup,
  Enemies, Friends: "attacks the Horde", "member of the Alliance"), npc
  flags decoded, spawns (zone, coordinates, count, still or walking) and
  whether Wowhead's frozen points agree, quest ties (gives, ends, is asked
  for, drops or holds an item a quest asks for), vendor wares, gossip text,
  a loot summary.
- **object**: type, readable text, quest ties (relations, objectives, items
  from its loot), spawns and Wowhead points, gathering node.
- **place** (an area by id or name): parent zone, map overlay rectangle and
  centre, sub-areas, the creatures inside by hostility and level, named
  objects, every quest working inside it (givers, enders, objective targets,
  items from objects or creatures there).
- **item** and **quest**: the short versions of the same.

Gossip is new to the databases: the CMaNGOS dump's
`creature_template.GossipMenuId -> gossip_menu -> npc_text_broadcast_text
(most texts) or npc_text -> broadcast_text`, into the schema as a table
(npc, locale, text), in every locale the dump translates. Follow the family
rule: a field a script needs goes into the schema and the build.

Accept when: tests pin the cards. `card npc 10582` shows "Sire", the
French "Reproducteur", Thunder Bluff's faction and Freewind Post.
`card object 2082` shows the plaque's text and High Priest Thel'danis
(level 62, attacks the Horde) standing beside it. `card place "Pool of
Tears"` lists quests 1424 and 1475. `bun run check` passes. wow-data's
CLAUDE.md names the tool in two lines.

### B. Quiet runner, gates and the review packet (addon-kit, root .claude) — wave 1

- **`addon-kit/q.ts`**: `bun ../addon-kit/q.ts <name> -- <command...>` runs
  a command, keeps its whole output in `<repo>/.cache/logs/<name>.log`
  (gitignored), prints one verdict line ("check: ok", "check: FAILED (exit
  1)") and, on a failure, the lines that matter (20 at most). The exit code
  passes through. A passing `check` stamps the tree it ran on
  (`.git/harness/check-<tree hash>`).
- **Git hooks** in `addon-kit/githooks/`: `commit-msg` refuses AI
  co-author and "generated with" trailers. `pre-push` refuses a push whose
  tree has no passing check stamp, and says how to run the check.
  `bun addon-kit/hooks.ts install|status` sets `core.hooksPath` in every
  repository. Build and test it here; wave 2 installs it everywhere.
- **`addon-kit/root.ts`** (and a Python twin): the family folder found
  from anywhere (walking up to the folder that holds `addon-kit/` and
  `wow-data/`, or `WOW_ADDONS_ROOT`), so a worktree outside the family
  folder still finds `../addon-kit` and `../wow-data`. Wave 2 adopts it.
- **`addon-kit/packet.ts <repo> [range]`**: the reviewer's packet in
  `.cache/review/<sha>.md`. It holds the commits, the diff stat, the changed
  files and the check stamp. For Yonder's riddle files it adds the cards
  (A) of their subjects. The reviewer agent's definition
  (`.claude/agents/reviewer.md`) reads the packet first and keeps to
  judgement: rules a script checks are the script's.
- **Permissions**: the root `.claude/settings.json` asks before `git push`,
  `scripts/release.sh`, `gh release`, `gh workflow run`, `vercel deploy`,
  and `store.ts --apply`. Check how "ask" rules behave under the user's
  permission modes and write down what holds.
- **`addon-kit/board.ts add|set|list`**: the task board's cards, in the
  format under D. `status.ts` shows the cards and each repository's check
  stamp.

Accept when: tests cover q's verdicts and exit codes, the stamp, both
hooks (a trailer refused, an unstamped push refused, a stamped one
allowed) and the packet. addon-kit's CLAUDE.md or README says how to use
each in a few lines.

**Built (20 October 2026).** As above, with: q's log ends with the exit and
time, a `.cache/` its repository forgot to ignore gets a `.gitignore` of its
own, and a check that changes the files while it runs isn't stamped.
`hooks.ts install` takes repositories or `--all`, never every repository by
default; a hooks folder a repository had (husky's `.husky/_`) is kept in
`harness.chain` and runs after ours, and `uninstall` puts it back. The
packet's cards fall back to the `card.ts` commands to run while A hasn't
landed, and draw each subject for each game its file is for (`client:
both`: Classic and Forever). Only the repository's own check stamps:
`harness.check` (git config) when set, else `bun run check` where
package.json has one, else any command named check. addon-kit gained a
`package.json` for its `check`. Installed in addon-kit only. Then, for D's
panel (the user's choice): `review.ts <repo> "<verdict>"`, run by the
session once the reviewer has reported, writes
`<git common dir>/harness/review-<HEAD sha>`, its first line `verdict: …`,
and the range of the packet the reviewer read (`base:`, `tip:`; 21 October
2026): the panel counts it only when that range reaches the upstream.

**What the "ask" rules hold** (Claude Code's permission docs, 20 October
2026; the root `.claude/settings.json`):

- Rules go deny, then ask, then allow; the first match wins, whatever the
  scope. An ask prompts even when an allow rule matches, and "Yes, don't
  ask again" never silences it (the allow it saves loses to the ask).
- Every mode prompts: Manual, accept edits, plan, auto (the classifier
  would let a push to the repository's branches through without the rule)
  and bypass permissions (ask rules are among what no mode auto-approves).
  `dontAsk` refuses them outright. A `claude -p` run can't prompt.
- A compound command asks when any part matches (`cd yonder && git push`,
  a subshell, a loop), and a leading `VAR=x` doesn't hide one. A program
  called another way does: `sh -c 'git push'`, `/usr/bin/git push`, a push
  inside a script. A guard, not a wall; the pre-push hook is the wall for
  the check.
- **Only a session whose working directory is ~/code/wow-addons gets
  them**: project settings load from that folder's `.claude/`, with no
  parent fallback. A session opened in a repository or a worktree doesn't.
  For every session, the same list goes in `~/.claude/settings.json` (wave
  2, the user's call: done in E, 20 October 2026; tried: a session inside
  Keyring in bypass mode was refused a `git push --dry-run`). Settings
  reload mid-session.
- Beyond the six asked for: a push through `each.ts`, a pull request's
  merge (`gh pr merge`: main moves, Hearthtale's site deploys) and
  `--no-verify`. Added 24 October 2026 after the kit audit (the user's
  go): a secret or a variable set or deleted (`secret.ts` with any
  argument, `gh secret set|delete`, `gh variable set|delete`, in their `-R`
  and `--repo` forms; listing them doesn't ask), anything naming
  `core.hooksPath` (`git -c core.hooksPath=/dev/null commit` would skip
  both gates) and `hooks.ts uninstall`.
- The lock in git (24 October 2026): the pre-commit hook asks `board.ts
  may <repo>` of every commit a Claude session makes (its
  `CLAUDE_CODE_SESSION_ID` set): a running card of that session must name
  the repository, and no other session's running card may have come to
  hold it first. A person's commit and CI's are never asked.
- The patterns are wide on purpose: `git -C * push *` asks for a commit
  whose message holds " push ". `*/scripts/release.sh *` wants arguments
  after the script, so reading it (cat, a grep with the file last) doesn't
  ask: a first `*scripts/release.sh*` prompted for a grep. `gh release
  list` asks only in its `-R` form. `git *--no-verify*` asks too: it would
  skip both hooks.
- Tried live on 20 October (the desktop app, auto mode, a session at
  ~/code/wow-addons): a `git -C <repo> push` stopped for the user's yes
  (the transcript's `permissionDecision`: `user_temporary`), where the
  classifier passed everything else. Not tried: whether a session whose
  Bash `cd`s into a repository (the desktop app then moves its working
  directory) keeps the root's rules. The user-level copy makes it moot.

### C. Yonder's riddle gates (yonder) — wave 1

`scripts/expeditions.py` gains the two checks the review had to make by
hand, for every riddle, on Classic Era as on Forever:

- **Classic quest ties**: a quest that gives, ends or asks for the
  riddle's subject (creature, object), or whose objectives sit inside the
  hint circle (creatures or objects it asks for, items it asks for from the
  creatures or objects there), must be listed in `quest_overlap` with a
  `quest_context`. Otherwise the resolver fails. This is the Forever check's
  twin.
- **Keepers and guards**: a creature within reach of the spot (NEAR, or
  the area's anchor) that attacks one side, on a riddle open to both, must
  be answered by `faction:` or by a danger line that names it.

Run them over all 127 riddles. Fix what is mechanical, such as a missing
quest id in an overlap list that already explains the quest. Anything
editorial goes in a list for the user: a riddle that may have to change,
or a context to write. The pinned sim counts stay as they are.

Accept when: the checks would have flagged the 20 October review's
findings (Thel'danis at Uther's plaque; quests 1424/1475 at the Pool of
Tears; 4504 at the Lakkari Tar Pits; 5245 at Kel'Theril), shown by tests
or fixtures. `bun run check` passes. Yonder's CLAUDE.md is updated in two
lines.

### D. The view and the task board (root .claude, the desktop app) — wave 1

- **The task board**: one Markdown card per task in
  `~/code/wow-addons/board/<id>.md`, its front matter `repo`, `title`,
  `status` (running, waiting-test, waiting-review, ready-to-push, done),
  `session` (the session's name or id), `updated`. Its body says what to
  test, what is committed, what is left. B's `addon-kit/board.ts
  add|set|list` writes and lists the cards, so sessions never hand-edit
  front matter. D reads them.
- **A live panel in the desktop app** (a mod: load the `plugin-authoring`
  skill first) and a status line (claude-hud is installed: extend it or
  sit beside it) showing:
  - the main session's model and context size;
  - the subagents running, with their models and tokens;
  - each repository's last check stamp and review verdict;
  - today's usage by model (Claude Code's transcripts:
    `~/.claude/projects/**/*.jsonl`, message `usage`);
  - the board.

  No third-party router. The mock-up the user shared was a "JEV" ad: take
  the information, not the product.

Accept when: the panel shows real numbers from this machine, the board
round-trips a card, and the status line stays one line. Note anything the
platform can't draw.

Restyled the same day to the mock-up's look (each section a box with a
coloured label, block-character bars, a colour per model, statuses green,
amber, red) with a live log at the bottom: `addon-kit/events.ts` is the
one-line log q.ts, review.ts, board.ts and the git hooks append to, and
the helpers and the push or release prompts the user answered come from
the transcripts. What it can't draw: `harness-view/README.md`.

The board as the lock (that evening, the decision above): a card's
`repos` (every repository the task writes), `waits` (a blocked card's
holder) and `since` (when it came to hold each repository) in its front matter,
the `blocked` status, `held` warnings on stderr when a running card comes
to share a repository with another session's card that came to hold it first
(written anyway, so the board shows it), notes for cards with unpushed
work there, `board.ts held [repo…]` (exit 1 when another session holds
one named), and a card that stops running naming the blocked cards it
frees. The reviewer's first pass found the first cut deadlocking (blocked
cards held too: a holder was told to block on its waiter, two waiters
locked each other out once it was done): only a running card holds, in
the order it came to run. Its second pass found the widening hole (a
running card adding a repository kept its old place and jumped the queue)
and a blocked card still writing its other repositories while holding
nothing: the place is per repository (`since` a time each, a widened
repository queued at the back), and a blocked card writes nothing (to go
on with the rest, a card drops the held repository instead).

Every session in view (the same night, the user's ask: "could the
harness handle all sessions running in the folder?"): the panel's
Sessions box lists each live session of the family folder from Claude
Code's own registry (`~/.claude/sessions/<pid>.json`, an internal
format), its status (busy, idle, waiting on the user and for what), its
model and helpers from the transcripts, its card, and Open, which hands
the desktop app the session's `claude://` link. The Board flags a running
card whose session is gone. Found by it at once: a session waiting on a
permission prompt for ten hours. The panel's Board box shows
each card's repositories, a blocked card's holder or "free now", the
counts running and blocked; the Repositories box a dot before each held
name. Made live
and set in motion that evening (the user's ask): read every 2 seconds while
shown, a line of the event log within a second, a pulse along the lines
while work flows, rolling figures, gaps between the boxes (the README's
"Motion" and "How it works").

### E. Every repository, one at a time — wave 2

For each of hearthtale (addon and site), lorekeepers-codex, yonder,
second-wind, keyring, palaver, mealbook, addon-kit, wow-data, ravenpost,
wow-locker:

- install the hooks (B) and adopt `root.ts` paths so worktrees work.
  First, in each repository: `scripts/release.sh` runs its check through
  `q.ts check -- bun run check` after the version bump and before `git add
  -A` (the bumped tree is the one pushed: without a stamp the push is
  refused, leaving a release commit, a tag and HOLD_STORES behind);
  `git config harness.check` where the check isn't `bun run check`
  (Ravenpost's Go, wow-locker); hearthtale and wow-locker's husky `prepare`
  takes `core.hooksPath` back on `bun install`, so install after it or drop
  the prepare;
- **slim CLAUDE.md to a map** (about 700 words: what it is, the commands,
  the hard rules, where each doc lives). The file-by-file prose moves to
  `docs/` (architecture, data, writing) with nothing lost. Today they run
  from 648 words (Keyring) to 6,830 (Hearthtale).
- **turn the procedures into skills** at the root (`.claude/skills/`),
  loaded only when used: riddle authoring (Yonder's rules and the vetting
  steps with the cards), translating (names by id, each language's voice,
  the readers), releasing, store pages, a data audit.
- the root CLAUDE.md's "Helpers and scripts": the new way of working
  (sessions per task, the board, models by kind, q, cards, the packet,
  the gates).
- MEMORY.md pruned of what CLAUDE.md or the docs now say.

Accept when: every repository's check passes, the hooks are installed
everywhere, each CLAUDE.md is a map, and a fresh session in each repository
finds its docs and the skills.

**Built (20 October 2026).** As above, with:

- **Worktrees.** kit:sync copies `root.ts` into an addon's `scripts/` (and
  `root.py` beside Python scripts), stamped and checked like Kit.lua; a
  stale `root.py` fails the check. TS scripts keep an `import type` for the
  editor and load wow-data with `await import(familyPath("wow-data", "src",
  "db.ts"))`; Python puts `family_path("wow-data", "py")` on `sys.path`
  (tolerant of no family folder where CI's tests import the module).
  package.json and shell scripts run `bun scripts/root.ts --run <script>`:
  a missing family folder is an error, where `bun "$(…)"` ran bun's usage
  and exited 0 (the reviewer's find). Keyring, Ravenpost and wow-locker,
  with no kit copy, reach q.ts through git's common dir. The addons' daily
  job checks out `addon-kit/` beside wow-data (all six callers set `kit:
  true`), so the finder works in CI. Tried: Mealbook's whole check in a
  worktree outside the family folder; Yonder's and the Codex's CI steps in
  a plain copy with no family folder.
- **The checks.** Every `release.sh` runs the whole check through q after
  the version bump. Ravenpost's check is `scripts/check.sh` (CI's steps,
  the inbox's too), set as `harness.check` (local git config, once per
  clone); wow-locker gained a `check` script instead. Hearthtale's and
  wow-locker's `prepare` run husky, then `hooks.ts install .` (quiet, and
  skipped in CI by `hooks.ts` itself, 23 October 2026: Hearthtale's daily
  game-data job had its push refused by the gate, no stamp in CI): `bun
  install` keeps our hooks, husky's chained after.
- **The maps.** Every CLAUDE.md is 360 to 770 words; the prose moved
  verbatim to `docs/` (architecture, data, writing, site, expeditions,
  sources, releases), every old line checked to have landed. Keyring and
  Second Wind exclude all of `docs/` (`.git/info/exclude`), Hearthtale, the
  Codex and Yonder a few review notes there: the moved docs are tracked
  (force-added where need be), and the maps name tracked files only. The
  checks of Hearthtale, the Codex and Yonder gained `package.ts --check`
  (release.sh's old block had it), and every kit-carrying addon's check
  runs kit:check (the Codex's CI runs `check:ci`, the rest of it). addon-kit gained a
  CLAUDE.md, a map onto its README.
- **The skills**: `wow-riddles`, `wow-translating`, `wow-releasing`,
  `wow-store-pages`, `wow-data-audit`, written in the root's
  `.claude/skills/`, then moved into `addon-kit/skills/` the same day (the
  user's ask, as D's mod: versioned). A session opened inside a repository
  doesn't load the root's skills (as with the helpers): each is linked into
  `~/.claude/skills/`, hence the `wow-` prefix, so it appears in every
  session, worktrees included, once at the root. Tried: a fresh session in each of the eleven repositories
  names its `docs/architecture.md` and `wow-releasing`.
- **D's mod** moved from the root's `.claude/mods/` to
  `addon-kit/harness-view`, the link repointed; its tests (`bin/`, `claude
  plugin test` and `validate`) run in addon-kit's check, `hooks/` left out
  of `bun test` (it needs Claude Code's runtime).
- **MEMORY.md** lost 27 pointers whose rule the family CLAUDE.md, a map, a
  doc or a skill now carries; the files moved to
  `memory/pruned-2026-10-20/` for F to settle.
- Season of Discovery's cut (wow-data 33bfb02, pushed at the start) was
  carried through: Mealbook (seven Forever dishes kept their learning skill
  from the client's recipe items), Palaver, Second Wind, Yonder, the Codex;
  Hearthtale's, Yonder's and the Codex's daily jobs had merged the same
  data first.

### F. Spring cleanup — wave 2, after E

Every folder of the family and the root: stale build output, old logs and
caches, leftover prototypes and research files, superseded docs, old
worktrees and branches, stray root files (old reviews, a portfolio .docx,
a German review), the old memory folder. List first. Delete only what is
generated or plainly superseded. Anything else goes to the user as a
list, with a recommendation for each.

### G. Sessions opened by sessions (addon-kit) — 25 October 2026

Until then only the user opened sessions, so a new task asked in a busy
session either broke "one session per task" (the store pages, done in the
kit audit's session that day) or waited on the user. The CLI opens them:
`claude --bg -n <name> --model <m> "<prompt>"` starts a background session
and prints `backgrounded · <short id> · <name>`; `claude agents` (`--json`)
lists them, `claude attach <id or part of the name>` joins one, `claude
logs <id>` shows its output.

**Built.** `bun addon-kit/session.ts "<card title>" --repos a,b --kind
code|prose [--plan] [--dry-run] -- "<the task>"` runs that from the family
folder and prints the new session's id and how to attach. What it holds:

- **A clean environment.** The opener's `CLAUDECODE` and every `CLAUDE_*`
  are dropped (`CLAUDE_BASH_MAINTAIN_PROJECT_WORKING_DIR` and a user's
  `CLAUDE_CONFIG_DIR` kept): the board's lock and the pre-commit hook tell
  sessions apart by `CLAUDE_CODE_SESSION_ID`, and a session carrying the
  opener's would write its card, and pass the lock, as the opener. Tried
  first by hand (the kit audit's session opened this build's session so):
  the new card's `session` was the new session's own id.
- **The prompt** begins with the maps (the family's CLAUDE.md, each
  repository's), then the card as its first write (the exact `board.ts
  add`, these `--repos`) and the check that its `session` is its own id,
  then its model, then the task, then "end with a `result:` line". The
  opener is named by its display name (`claude agents --json`, matched by
  its session id), else its newest open card's title (running, or
  waiting on the user): never a card it finished (the first real use named the kit audit's session after a done
  card it had carried, the store pages).
- **The model by kind**: code `opusplan`, prose `opus`. `opusplan` is in
  the CLI's own list of aliases (its `--help` names three examples only):
  Opus in plan mode, Sonnet otherwise (the CLI: "Opus in plan mode, else
  Sonnet"). A background session that never plans runs Sonnet throughout:
  its prompt has it settle its own plan, the architect helper (Opus)
  looking before it locks, without stopping for the user. `--plan` starts
  it in plan mode (`--permission-mode plan`): Opus plans, then one stop
  for the user's approval (the CLI's exit from plan mode always asks).
  It writes nothing meanwhile, its card included, so no card shows the
  wait: session.ts's output says it, for the opener to tell the user. It
  is the opener's call, never a question for the user (the user, 25
  October 2026: "you should add --plan yourself when needed I should not
  have to intervene"): for a task that needs a design settled first, left
  off for work already specified.
- **Notes** on stderr: a repository another session's running card holds
  (the new session will block on it), a name that is no family folder yet.
  The opening goes in the event log (`session`).
- Tests (`session.test.ts`) run it whole with a stub `claude` on the PATH
  that records what it was given: no real session.

**The panel**: a session opened this way is in Claude Code's registry like
any other (`kind: "bg"`, `entrypoint: "cli"`, its `-n` name), so the
Sessions box shows it with its card (by its id, once the card is written).
Its row's last cell said "terminal", like every background session's: it
says "bg" now (`claude attach` joins it by its name).

## Working rules for the build sessions

- Model: `opusplan`.
- Read the repository's CLAUDE.md first, and the family's
  (`~/code/wow-addons/CLAUDE.md`).
- Commit locally with Conventional Commits, lowercase, no AI trailers.
  Ask the user before any push.
- Before calling a piece done: its checks pass, the reviewer helper has
  looked at it, and the session's card on the board says what the user
  should try.
- Keep tool output small. Use the cards and q once they exist, and files
  for anything long.
