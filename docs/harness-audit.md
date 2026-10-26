# Harness audit (26 October 2026)

An assessment, not a refactor: nothing in the harness changed with this file.
The user asked whether the harness is pertinent, whether we can do better,
whether it is portable, and whether it could stand alone. Every number below
comes from this machine on 26 October 2026 (`usage.ts`, the board, the event
log) unless a link says otherwise. Opinions are marked as such.

## The verdict, short

**The core idea is right, and the numbers back it.** Small sessions with one
task each cost a fraction of long sessions that carry many tasks. On 26
October single-task sessions ran $2 to $13 each, at 115k to 200k tokens of
context per turn. The multi-card sessions from before ran $86 to $211, at
about 500k per turn. The median done card went from $13.55 (the 25 October
baseline) to $6.86 for the cards touched today. That comparison is partly
confounded, because today's tasks were small. The gates are cheap and they
catch real things.

**But the harness grew faster than it earned.** In six days it became about
8,700 lines of TypeScript and shell, 7,000 words of skills, and 1,830 words of
rules in the root CLAUDE.md, which is 62% of a file every session and every
child loads. Building it cost about $200, 16% of all the spend `usage.ts`
reads ($1,227 across 51 sessions). About $136 of that went to the panel. The
rules are dense prose, and today's incidents all happened where a rule was
prose that a session had to remember instead of a check that refuses. The
lock modelled "two sessions in one repository" and missed the one real
conflict of the day: a dependency between repositories.

**What to do.** Keep the board, the gates, the packet and reviewer, the
skills and the per-task sessions. Freeze the panel. Turn each of today's
incidents into a check, not a paragraph (four small fixes, under a day
together). Cut the root CLAUDE.md's harness section by half and move the rest
into the `child` skill and `docs/harness.md`. Don't extract the harness into
a plugin or a product yet: for one user and one family of repositories, the
extraction costs more than it returns. The one cheap step toward portability
worth taking now is one config file instead of hard-coded family paths.

## The evidence

| Measure | Value | Source |
|---|---|---|
| Sessions read, cards, spend | 51 sessions, 91 cards (90 done), $1,227 at list price | `bun addon-kit/usage.ts` |
| Model split | Opus $1,156 (94%), Sonnet $71, Haiku $0.02 | same |
| Median done card, all time | $12.55 (baseline 25 Oct: $13.55) | same, `docs/usage-baseline.md` |
| Median done card, cards touched 26 Oct | $6.86, 258k context a turn, $1.56 a commit | `usage.ts --since 2026-10-26` |
| Helpers' share | 12% (baseline 11%) | same |
| Context re-read a turn | 374k overall (baseline 417k), 258k today | same |
| Cost of building the harness | about $200 over 19 harness and panel cards, about $136 of it the panel | the harness and panel rows of `usage.ts` |
| Board | 96 cards since 20 Oct, 95 done | `board/` |
| The lock serialized writers | 17 cards went running → blocked | `.cache/harness/events.log` |
| The lock refused a commit | 4 times, every one bookkeeping (no card, or a card not naming the repository), none a real clash | same |
| commit-msg refused an AI trailer | 3 times (Claude Code's own default trailer, each time) | same |
| pre-push refused an unstamped tree | 0 times logged | same |
| Checks through q | 631 passed, 129 failed, each failure printed in a few lines | same |
| Review verdicts recorded | about 150, findings fixed in the harness itself (the lock's deadlock, the queue jump, close's range) | same, `docs/harness.md` |
| Harness code | about 8,700 lines of TS and shell in addon-kit, plus `harness-view/` | `wc -l` |
| Root CLAUDE.md | 277 lines, 2,966 words, 1,832 of them "Helpers and scripts" | `wc` |

Two caveats. `usage.ts` prices everything at API list price, while the user
pays a subscription, so the dollars measure share, not the bill. And a
before-and-after comparison over six days with a changing task mix shows a
direction, not a proof.

## A. Is it pertinent, part by part

| Part | Problem it solves | Did it, in the records | Cost | Verdict |
|---|---|---|---|---|
| One session per task, children (`session.ts`, `child`) | Long sessions re-reading 400-500k context every turn | Yes. Single-task sessions cost $2-13 at 115-200k a turn, against $86-211 at about 500k for the multi-card ones | 487 lines plus a 1,170-word skill. Opener overhead: idle turns, relays, polling (incident 5) | **Keep, simplify** |
| Board (cards) | Hand-over: what to try, what's committed, what's left. Visibility | Yes. 96 cards, used by every session, read by `wow-game-test` and the opener | One `board.ts add` per session, small | **Keep** |
| Board as the lock (pre-commit `may`, `held`, `blocked`) | Two sessions writing one repository | Partly. It serialized 17 times. Its 4 refusals were all bookkeeping. It missed today's real conflict, a kit commit that broke every addon's check | The most complex code here (542 lines). The `held`/`blocked`/`--on`/`free` rules are the densest prose in the root CLAUDE.md | **Keep, but fix what it models** |
| Models by kind, effort by phase | Opus spend on mechanical work | Partly. Sonnet-only sessions are cheap (batch release $6.56). But Opus is still 94% of all spend and 81% of today's, because every prose child and every plan runs Opus | One settings file, a few lines of rules | **Keep, measure again** |
| Git hooks (commit-msg, pre-push stamp, pre-commit lock) | AI trailers, unchecked pushes, the lock | Yes. 3 trailers refused. pre-push never refused, but it is why sessions run q before pushing | Shell, cheap, invisible when green | **Keep** |
| Permission ask rules | Pushes, releases, secrets without the user's yes | Yes. Tried live, it held in auto mode (`docs/harness.md` B) | 50 patterns, copied in two settings files | **Keep, dedupe** |
| q.ts, quiet output | Logs flooding context, `\| tail` hiding exit codes | Yes. 760 runs, failures printed in a few lines | Small | **Keep** |
| Packet and reviewer, `review.ts` | Unseen bugs before a push, a reviewer that ran out of turns | Yes. The reviewer found real bugs, including in the harness itself. The packet's Size line stopped the budget cut-offs | Reviewer runs are most of the helpers' 12% | **Keep** |
| Other helpers (data-scout, prose-reader, architect, builder) | Fresh context for a narrow job | prose-reader: yes (today's cold reads). builder: piloted once ($2.47). architect and data-scout: few runs | Small definitions | **Keep, prune if unused by 10 Nov** |
| Skills (9) | Procedures out of CLAUDE.md, loaded on demand | Yes, this is what Anthropic recommends. But the procedures that failed today (kit sync, release version) were in skills and still failed | 7,000 words | **Keep, turn their key steps into checks** |
| The panel (`harness-view`) | Seeing sessions, cards, stamps and usage at once | Once: it found a session stuck on a permission prompt for 10 hours | About $136, 11% of all spend. A mod loaded live into every session. The desktop app's sidebar and `/usage` now cover part of it | **Freeze** |
| `usage.ts` | The cost of a card | Yes. Without it this audit would be guesswork | 468 lines, cheap to run | **Keep** |
| `status.ts`, `each.ts`, `events.ts` | One view of 13 repositories | Yes, used at the start of most sessions | Small | **Keep** |
| `preflight.ts`, `release.sh` | A release without surprises | No, not today: incidents 3 and 4 came from these two disagreeing | n/a | **Fix (below)** |

### The parts that need more than a line

**Children and the opener.** The children were cheap. The opener cost little
too ($6.56 on Sonnet for 118 turns), but its idle turns are a known cost
pattern: Claude Code delivers each cross-session message to an idle session
as a new turn that re-sends the whole context, and the docs name it as a
reason usage climbs ([Manage costs](https://code.claude.com/docs/en/costs#why-usage-climbs-in-a-long-session)).
The desktop app already relays a child's turns to its opener, and the child
also reports by SendMessage, so the opener is woken twice for one event. Pick
one channel. In the desktop app, keep the app's notes and drop the
SendMessage reports, except the final "pushed" one.

**The lock missed the real conflict.** Incident 1 was not two sessions in one
repository. A child committed to addon-kit's main while its siblings held the
addons. The lock saw no clash, because nobody else held addon-kit. But
`sync.ts --check` fails an addon locally whenever its copy's stamp is not the
kit's newest *local* commit (`sync.ts:111-114`), so one local commit to the
kit turned every addon's check red and no tree could be stamped. The fix is
not a smarter lock. It is to stop coupling every addon to the kit's local
HEAD: compare the stamp with the kit's `origin/main` (stale only once the kit
is pushed), and have `kit:sync` refuse a kit commit that isn't on origin
(incident 2). With that, a kit commit can sit locally without blocking
anyone, and the lock doesn't need to know about dependencies at all.

**Models by kind.** `opusplan` makes code sessions Sonnet, as intended. But
94% of all spend and 81% of today's is still Opus: the prose children,
plans, the reviewer, and the sessions from before 25 October. Cold reads are
judgement work, so Opus for the reviewer and the voices is defensible. A cold
read whose job is to flag rule breaks and awkward phrasing is worth trying on
Sonnet with the prose-reader for a week, then comparing findings (opinion,
untested).

**Skills didn't prevent today's mistakes.** `wow-kit-change` and
`wow-releasing` both describe the steps that went wrong. A skill is
feedforward: it tells the agent what to do. Without a sensor, a check that
refuses the wrong state, a hurried or Sonnet session skips a line. This
matches Böckeler's point that feedforward alone never checks whether the
rules worked
([Harness engineering for coding agent users](https://martinfowler.com/articles/harness-engineering.html)).

**The panel.** It is good work and it did find a 10-hour stall once. But it
is the single biggest line in the harness's cost, and it keeps growing (seven
cards so far). The desktop app now shows sessions, their state and their
children in the sidebar, and `/usage` attributes plan usage to skills,
subagents and plugins with recommendations
([Manage costs](https://code.claude.com/docs/en/costs#plan-usage-breakdown)).
Freeze the panel: fix it when it breaks, add nothing.

**The root CLAUDE.md.** Anthropic's guidance is to keep it short, to ask of
each line "would removing this cause Claude to make mistakes?", and warns
that an over-specified file gets half-ignored
([Best practices](https://code.claude.com/docs/en/best-practices#write-an-effective-claude-md),
[Manage costs](https://code.claude.com/docs/en/costs#move-instructions-from-claude-md-to-skills)
says under 200 lines). Ours is 277 lines, and the harness section alone is
1,830 words of long, clause-heavy sentences. In tokens it is cheap (about
2.5k a turn, cached). The cost is attention: a rule lost in the noise.
Today's children each skipped a step their rules covered.

## B. Can we do better

### Ranked changes

Value over cost, highest first. Effort is a rough session estimate on
`opusplan`.

| # | Change | Fixes | Effort |
|---|---|---|---|
| 1 | `sync.ts --check` measures staleness against the kit's `origin/main`, not local HEAD. `kit:sync` refuses a kit commit not on origin (`--local` for a trial, stamped like `+`) | Incidents 1 and 2 | 1-2 h, tests exist |
| 2 | `release.sh` takes no default version: `--version` is required, or it reads preflight's suggestion and prints it for the go. It refuses when NOTES.md names another version | Incident 4 | 1 h |
| 3 | preflight's cold-read flag counts changes since the last recorded cold read (a `review.ts`-style record, `coldread-<sha>`), not since the tag | Incident 3 | 1-2 h |
| 4 | One report channel between child and opener. In the desktop app, the app's notes plus one final SendMessage when pushed. The opener never polls (the `child` skill says so in one line) | Incident 5, double wake-ups | 30 min, prose |
| 5 | Cut the root CLAUDE.md's "Helpers and scripts" to about 600 words: the rules a session breaks without them. Move the mechanics (lock details, close's refusals, desktop vs CLI) to the `child` skill and `docs/harness.md` | Attention, every session | 1 h, prose (Opus) |
| 6 | Freeze the panel. Add nothing, fix only breakage | Spend | 0 |
| 7 | One project config file (see C) instead of the family paths hard-coded across `board.ts`, `session.ts`, hooks and skills | Portability, fewer path bugs | half a day |
| 8 | A Claude Code `PreToolUse` hook on Edit/Write that asks `board.ts may` before a file is written, not only at commit. It catches a session writing without a card at its first edit, not at its commit | The lock, earlier | 2 h |
| 9 | A Sonnet trial for cold reads (prose-reader on Sonnet already, the opener's prose child on Sonnet for one wave), judged against Opus's findings | Opus share | one batch |
| 10 | A weekly 15-minute pass: each incident of the week becomes a check or a deleted rule, never a new paragraph | Keeps the harness from growing | ongoing |

What I would **not** do: replace the board with Claude Code's agent teams or
shared task list, move to worktrees per session, or rebuild the panel on
`/usage`. Reasons under the next heading.

### What Claude Code offers now, and what fits

Established, from Anthropic's docs:

- **Skills load on demand**, CLAUDE.md loads every turn. The family already
  follows this, and moving the harness's mechanics into skills is the next
  step ([Manage costs](https://code.claude.com/docs/en/costs#move-instructions-from-claude-md-to-skills)).
- **Hooks are deterministic, CLAUDE.md is advisory.** "Use hooks for actions
  that must happen every time with zero exceptions"
  ([Best practices](https://code.claude.com/docs/en/best-practices#set-up-hooks)).
  That is the case for changes 1-3 and 8.
- **A Stop hook can block a turn from ending until a check passes**
  ([Best practices](https://code.claude.com/docs/en/best-practices#give-claude-a-way-to-verify-its-work)).
  It could replace "run the check before you call it done" prose. Worth trying
  on one repository (opinion).
- **Subagents for verification**, a fresh context reviewing the diff, and a
  warning that a reviewer asked for gaps will find some even in sound work
  ([Best practices](https://code.claude.com/docs/en/best-practices#add-an-adversarial-review-step)).
  The reviewer is that pattern. Its brief should keep saying "only what
  affects correctness or the rules".
- **Parallel sessions in worktrees** are the documented way to keep edits
  from colliding
  ([Best practices](https://code.claude.com/docs/en/best-practices#run-multiple-claude-sessions)).
  The user chose the board over worktrees on 20 October, for visibility. With
  13 repositories and few true clashes, the board's per-repository lock does
  the same job more cheaply than worktrees would here (opinion).
- **Agent teams** (shared tasks, a mailbox, a lead) exist but are
  experimental, off by default, and cost about 7x a standard session when
  teammates plan ([Manage costs](https://code.claude.com/docs/en/costs#manage-agent-team-costs)).
  The children pattern is a hand-built, cheaper version. Not worth switching.
- **Cross-session messages wake an idle session and re-send its context**.
  `crossSessionInbound: hold` holds them instead
  ([Manage costs](https://code.claude.com/docs/en/costs#why-usage-climbs-in-a-long-session)).
  This is the mechanism behind incident 5's cost.
- **`/usage` now attributes plan usage** to skills, subagents and plugins,
  with recommendations, and `/insights` reports friction across sessions
  ([Manage costs](https://code.claude.com/docs/en/costs#track-your-costs)).
  That covers part of the panel's usage box. It does not price a card or a
  commit: `usage.ts` still earns its place.
- **Plugins** bundle skills, agents, hooks, MCP servers, monitors and a
  `bin/` folder put on the Bash PATH, with `userConfig` prompted at install.
  They can't ship permission rules or a default model: plugin settings
  accept only `agent` and `subagentStatusLine`
  ([Plugins reference](https://code.claude.com/docs/en/plugins-reference)).
  This decides D below.

Established, from practice outside Anthropic's docs:

- Harness engineering as a named practice: "Agent = Model + Harness", and the
  loop of making each mistake impossible once it has happened
  ([Addy Osmani](https://addyosmani.com/blog/agent-harness-engineering/)).
  Böckeler splits a harness into guides (feedforward) and sensors (feedback),
  computational (tests, linters) and inferential (AI review), and advises
  cheap checks as early as possible
  ([martinfowler.com](https://martinfowler.com/articles/harness-engineering.html)).
  The family's harness is heavy on guides (CLAUDE.md, skills) and light on
  sensors for its own procedures. Today's incidents sit exactly there.
- Anthropic's long-running agent harness uses a progress file and a commit
  per session as the hand-over between fresh contexts
  ([Effective harnesses for long-running agents](https://anthropic.com/engineering/effective-harnesses-for-long-running-agents)).
  The board's cards are the same idea and were arrived at independently.
- Multi-agent systems cost much more in tokens than one agent. Anthropic's
  research system reports about 15x a chat, and advises using it where the
  task's value pays for it
  ([How we built our multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system),
  figures as reported by secondary write-ups). The family's numbers show the
  opposite direction for its case: splitting tasks into sessions cut spend,
  because the cost driver was context length, not agent count.

Opinion, mine: the harness is good at the context problem it was built for.
It is weak where it relies on a session reading 1,800 words of rules
correctly. The cheapest improvements from here are subtractions and checks,
not new parts.

## C. Is it portable

What is generic (would work in any multi-repository project with Claude
Code):

- `q.ts` (quiet runner, check stamps), the pre-push stamp gate, the
  commit-msg trailer rule, `hooks.ts` with chaining.
- The board and its lock (`board.ts`), the card format, `may`/`held`.
- `session.ts` and the `child` skill: opening, reporting, closing children.
- `usage.ts` (cost per session, card, commit), `events.ts`, `status.ts`,
  `each.ts`.
- `packet.ts` and `review.ts` without the riddle cards. The reviewer agent's
  method (packet first, judgement only, a turn budget).
- The ask rules in settings.
- The panel, as far as it reads only the board, stamps, events and
  transcripts.

What is the WoW family's:

- Paths: the family folder found by `addon-kit/` and `wow-data/` (`root.ts`),
  `~/code/wow-addons/board/`, `.cache/harness/` at the family root,
  `addon-kit/githooks` as the hooks path.
- Content: `packet.ts`'s Yonder riddle cards, `preflight.ts`, `release.sh`,
  `store.ts`, `sync.ts` and the kit, every `wow-*` skill, the data-scout and
  prose-reader agents, the reviewer's rules list.
- Prose: the root CLAUDE.md's section names WoW repositories and tools
  throughout.
- Assumptions: one user, macOS, bun, the desktop app's session registry
  (`~/.claude/sessions/<pid>.json`, an internal format that can change
  without notice).

What a second, unrelated project would need, at the least:

1. A config file at its root naming the board folder, the repositories, each
   one's check command, and the hooks path.
2. The generic scripts, reading that file instead of the family's paths.
3. The hooks installed in each repository (`hooks.ts install`).
4. A CLAUDE.md section of a few hundred words: one task per session, the
   card first, the check before push.
5. Its own reviewer rules and its own skills. Those don't port, they're the
   project.

Roughly 60% of the harness's code is generic by function. Almost none of it
is generic in practice today, because the paths and names are baked in.

## D. Could it stand alone

**As a separate repository.** Possible: move the generic scripts out of
addon-kit into their own repository, with addon-kit depending on it. What
breaks: every path in the scripts, skills and settings; the addons' copies of
`root.ts`; the hooks path in 13 repositories; `harness-view`'s link. Cost:
two to three sessions, plus a week of small breakages.

**As a Claude Code plugin.** The best fit of the three, for what a plugin can
carry: the `child` skill, the reviewer and builder agents, the hooks (a
`PreToolUse` board check, a `SessionStart` hint), the scripts in `bin/` on
the PATH, and `userConfig` for the board folder and repositories. What a
plugin can't carry: the permission ask rules, the default model and effort,
the git hooks (those still need `hooks.ts install`). So a plugin is half the
harness, and the other half stays a setup step.

**As a CLI** (`harness init`, `harness card`, `harness check`). The cleanest
interface, but it duplicates what the plugin's `bin/` gives for free.

**A minimal first cut, if it were done:** a plugin holding `q`, `board`,
`usage`, the pre-push and commit-msg hooks, the `child` skill and the
reviewer, configured by one `harness.json` at the project root; the panel,
preflight, release and every `wow-*` skill stay in addon-kit. About two
sessions on `opusplan`, roughly $15-30 at the current rates, plus the
migration of the family onto it.

**Is it worth it? Not now.** One user, one family, and no second project
waiting. Extraction pays back when a second project exists. Until then it
moves code without changing what it does, and it spends the stability the
harness hasn't had yet (it changed every day this week). Do change 7 (one
config file) now, because it makes the paths explicit and costs half a day.
Do the extraction the day a second project starts, and use that project as
the test.

## Sources

- Anthropic, [Manage costs effectively](https://code.claude.com/docs/en/costs)
  (Claude Code docs, read 26 Oct 2026)
- Anthropic, [Best practices for Claude Code](https://code.claude.com/docs/en/best-practices)
  (read 26 Oct 2026)
- Anthropic, [Plugin manifest reference](https://code.claude.com/docs/en/plugins-reference)
  (read 26 Oct 2026)
- Anthropic, [Effective harnesses for long-running agents](https://anthropic.com/engineering/effective-harnesses-for-long-running-agents)
  (search summary only, not read whole)
- Anthropic, [How we built our multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system)
  (figures through secondary write-ups, such as
  [ByteByteGo](https://blog.bytebytego.com/p/how-anthropic-built-a-multi-agent))
- Birgitta Böckeler, [Harness engineering for coding agent users](https://martinfowler.com/articles/harness-engineering.html)
  (martinfowler.com, 2 April 2026)
- Addy Osmani, [Agent Harness Engineering](https://addyosmani.com/blog/agent-harness-engineering/)
  (April 2026, search summary)
- The family's own records: `bun addon-kit/usage.ts`, `board/`,
  `.cache/harness/events.log`, `addon-kit/docs/harness.md`,
  `addon-kit/docs/usage-baseline.md`, `addon-kit/sync.ts`.
