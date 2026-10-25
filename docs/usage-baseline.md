# Usage baseline, 2026-10-25

What a card cost before the model and effort changes of 25 October 2026 (main sessions all on Opus,
no helper builder). Cost is dollars at list price, see `usage.ts`; the builder pilot and every
later change is judged against these: dollars per done card and per commit, the helpers' share, the
context re-read each turn. Written once (`usage.ts --baseline` refuses while this file exists):
a later run is compared against it, not written over it.

- sessions read: 26, carrying 66 cards (65 done), commits: 261
- total: $1031, by model: sonnet $27.24, opus $1004, haiku $0.02, other $0.00
- median done card: $13.55
- per commit: $3.95
- helpers' share: 11%
- context re-read per main turn: 417k tokens
- no transcript (deleted or not an id): 5 cards

## Correction, 25 October 2026 (commit count)

The commits above were counted from the transcripts as one per `git commit` *command*, and a command that
ended in an error counted none. One command can commit in several repositories (`git -C a commit && git -C b
commit`, `each.ts -- git commit`) and can fail after its commit landed, so 261 was too low and every
$/commit too high. `usage.ts` now counts from git itself (the user's commits, in the card's repositories,
whose author time falls in one of the session's commit commands). Recounted over the same 26 sessions and 66 cards
with the same dollars ($1031): **360 commits, $2.86 a commit** (was 261 and $3.95). Per-card commits and
$/commit in the table above are the old counts, and so too high in the same way: read them with
`bun addon-kit/usage.ts`. Everything else here stands as written.

## Done cards

| $ | helpers | turns | commits | $/commit | cards | session |
|---:|---:|---:|---:|---:|---:|---|
| $208 | 17% | 1198 | 79 | $2.63 | 2 | Goodwill and Yours Truly: store pages (+1 more) |
| $151 | 9% | 821 | 25 | $6.05 | 9 | Goodwill: the repository (+8 more) |
| $149 | 8% | 858 | 33 | $4.52 | 11 | Six arrivals become gestures (+10 more) |
| $126 | 6% | 652 | 19 | $6.61 | 10 | Yours Truly: Zephras Isle's letters (+9 more) |
| $86.20 | 9% | 508 | 15 | $5.75 | 5 | Franclorn's page unlockable on hardcore (+4 more) |
| $45.37 | 8% | 309 | 7 | $6.48 | 1 | Harness panel: live updates, motion, gaps between boxes |
| $37.30 | 48% | 185 | 6 | $6.22 | 2 | wow-data: Forever pinned on its own product (wowf) (+1 more) |
| $29.16 | 11% | 259 | 10 | $2.92 | 2 | Batch release: Mealbook 0.1.0, Yonder 0.13.0, Hearthtale, Codex, Second Wind, Palaver (+1 more) |
| $26.97 | 8% | 219 | 6 | $4.49 | 1 | Harness panel: the reference's flow diagram |
| $26.82 | 3% | 147 | 0 | - | 1 | Letters: the plan |
| $25.29 | 7% | 218 | 10 | $2.53 | 4 | Harness panel: every live session in the family folder, Open to go to one (+3 more) |
| $17.07 | 6% | 192 | 4 | $4.27 | 2 | Harness panel: the running borders in the terminal, redrawn (+1 more) |
| $15.75 | 6% | 135 | 4 | $3.94 | 1 | Palaver camera ISO with DialogueUI |
| $13.92 | 12% | 168 | 9 | $1.55 | 1 | SoD names kept as aliases (left_out) |
| $12.02 | 7% | 136 | 5 | $2.40 | 1 | Saved-ids guard on the daily game-data jobs |
| $11.47 | 6% | 151 | 6 | $1.91 | 3 | Gates meters count only what waits to push (+2 more) |
| $9.82 | 7% | 83 | 4 | $2.46 | 1 | Harness B: q, gates, packet, board |
| $8.09 | 10% | 116 | 6 | $1.35 | 1 | Harness: sessions opened by sessions |
| $6.72 | 33% | 68 | 2 | $3.36 | 1 | Release Yonder 0.14.0 and Codex 0.15.0 |
| $6.35 | 2% | 101 | 2 | $3.17 | 1 | Harness F: spring cleanup |
| $5.00 | 8% | 74 | 1 | $5.00 | 1 | Forever's game folder: _forever_ |
| $4.73 | 8% | 82 | 3 | $1.58 | 1 | Ravenpost installs meter vs downloads |
| $3.71 | 45% | 33 | 0 | - | 1 | Italian: wow-data first, then the addons |
| $1.59 | 0% | 32 | 1 | $1.59 | 1 | harness-view: /harness missing in desktop sessions started from a spare folder |
| $0.67 | 0% | 14 | 0 | - | 1 | Merge players' facts PR #10 |
