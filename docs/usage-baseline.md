# Usage baseline, 2026-10-25

What a card cost before the model and effort changes of 25 October 2026 (main sessions all on Opus,
no helper builder). Cost is input-token equivalents, see `usage.ts`; the builder pilot and every
later change is judged against these: units per done card and per commit, the helpers' share, the
context re-read each turn. Regenerate with `bun addon-kit/usage.ts --baseline` (this file keeps
the day it was written, so write it once and compare new runs against it).

- sessions read: 26, carrying 66 cards (65 done), commits in their windows: 437
- total: 386M units, by model: sonnet 2.6M, haiku 0.0M, opus 384M, other 0.0M
- median done card: 5.2M units
- per commit: 0.9M units
- helpers' share: 10%
- context re-read per main turn: 417k tokens
- no transcript (deleted or not an id): 5 cards

## Done cards

| units | helpers | turns | commits | units/commit | cards | session |
|---:|---:|---:|---:|---:|---:|---|
| 87M | 15% | 1196 | 176 | 0.5M | 2 | Goodwill and Yours Truly: store pages (+1 more) |
| 57M | 6% | 858 | 36 | 1.6M | 11 | Six arrivals become gestures (+10 more) |
| 55M | 5% | 821 | 35 | 1.6M | 9 | Goodwill: the repository (+8 more) |
| 45M | 4% | 652 | 48 | 0.9M | 10 | Yours Truly: Zephras Isle's letters (+9 more) |
| 33M | 6% | 508 | 19 | 1.7M | 5 | Franclorn's page unlockable on hardcore (+4 more) |
| 18M | 7% | 309 | 7 | 2.6M | 1 | Harness panel: live updates, motion, gaps between boxes |
| 13M | 51% | 185 | 11 | 1.2M | 2 | wow-data: Forever pinned on its own product (wowf) (+1 more) |
| 10M | 7% | 259 | 28 | 0.4M | 2 | Batch release: Mealbook 0.1.0, Yonder 0.13.0, Hearthtale, Codex, Second Wind, Palaver (+1 more) |
| 9.8M | 6% | 218 | 10 | 1.0M | 4 | Harness panel: every live session in the family folder, Open to go to one (+3 more) |
| 9.8M | 7% | 219 | 15 | 0.7M | 1 | Harness panel: the reference's flow diagram |
| 7.7M | 1% | 147 | 0 | - | 1 | Letters: the plan |
| 6.3M | 6% | 192 | 5 | 1.3M | 2 | Harness panel: the running borders in the terminal, redrawn (+1 more) |
| 5.3M | 11% | 168 | 0 | - | 1 | SoD names kept as aliases (left_out) |
| 5.1M | 6% | 135 | 5 | 1.0M | 1 | Palaver camera ISO with DialogueUI |
| 4.5M | 7% | 136 | 2 | 2.2M | 1 | Saved-ids guard on the daily game-data jobs |
| 4.2M | 5% | 151 | 6 | 0.7M | 3 | Gates meters count only what waits to push (+2 more) |
| 3.0M | 8% | 83 | 5 | 0.6M | 1 | Harness B: q, gates, packet, board |
| 2.9M | 9% | 116 | 7 | 0.4M | 1 | Harness: sessions opened by sessions |
| 2.3M | 1% | 101 | 0 | - | 1 | Harness F: spring cleanup |
| 1.8M | 20% | 68 | 8 | 0.2M | 1 | Release Yonder 0.14.0 and Codex 0.15.0 |
| 1.6M | 7% | 82 | 4 | 0.4M | 1 | Ravenpost installs meter vs downloads |
| 1.5M | 8% | 74 | 3 | 0.5M | 1 | Forever's game folder: _forever_ |
| 1.3M | 53% | 33 | 1 | 1.3M | 1 | Italian: wow-data first, then the addons |
| 0.5M | 0% | 32 | 1 | 0.5M | 1 | harness-view: /harness missing in desktop sessions started from a spare folder |
| 0.2M | 0% | 14 | 1 | 0.2M | 1 | Merge players' facts PR #10 |
