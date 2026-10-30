---
name: wow-harness-init
description: Set the harness and the work setup up in a repository: the harness repo's init.ts (harness.toml, vendored tools, git hooks, permission asks, reviewer and architect helpers, the CLAUDE.md Harness block, .gitignore), then the family's own parts (check stamp, board card, family CLAUDE.md row, memory). Use when the user starts a project outside the family, brings an old repository under the harness, or asks for the harness, the hooks or the board in a repo that lacks them. For a new addon use wow-new-addon, which calls this for its hooks step.
---

# The harness in a repository

The tool is `harness/init.ts` (the harness repository, beside the addons).
It is idempotent: what is there is kept, a second run only brings the copies
up to date. It commits nothing. Design and reasons: `harness/docs/design.md`.

## 1. Look first

- The folder is a git repository, or a folder of them? (`init.ts` takes either:
  one repository, else its child repositories.) No `.git` yet: `git init`
  first, local only. A GitHub repository, a push or a domain is the user's go.
- The check: `package.json`'s `check`, else `test`, else `bun test`. If the
  project has none that means something, say so and settle one before
  continuing: the push gate refuses a tree with no passing check stamp.
- Is it inside the family (`~/code/wow-addons/<repo>`)? Then it takes the
  family's copy, not its own (step 2, "In the family").
- The card first (the family's rule): `bun addon-kit/board.ts add <repo>
  "<title>" --repos <repo> --status running --try … --committed … --left …`.
  The folder can be named before it exists.

## 2. Run it

From the harness repository, a dry run, then the real one:

```bash
(cd harness && bun init.ts ~/code/<project> --dry-run)
(cd harness && bun init.ts ~/code/<project> [--name n] [--check "<cmd>"] [--tools dir])
```

It writes, in this order:

1. `harness.toml` (the shape and the check it found)
2. the tools and githooks, vendored and stamped into `harness/` (or `--tools`)
3. the hooks installed in each repository (`hooks.ts install --all`)
4. `.claude/settings.json`: the asks (push, release, deploy, secrets,
   `core.hooksPath`, `--no-verify`) merged in, never replacing a key
5. `.claude/agents/reviewer.md` and `architect.md`, where there are none
6. the Harness block in `CLAUDE.md` between `<!-- harness:start -->` and
   `<!-- harness:end -->`; a later run replaces only that block
7. `.gitignore`: `.harness/` and `.cache/`

Never hand-edit a vendored copy: edit the tool in the harness repository,
commit, then `bun harness-sync.ts <project>` (`--check` fails on a hand
edit).

### In the family

A family repository doesn't vendor its own copy: `addon-kit/` carries the
stamped one at the family's paths. Install only the gates:

```bash
bun addon-kit/hooks.ts install <repo>
bun addon-kit/hooks.ts status        # every repository, its hooks, HEAD's check
```

Then check by hand what a family repository needs and `init.ts` doesn't
know: `harness.check` (`git config harness.check "<cmd>"`) where the check
isn't `bun run check` (Ravenpost, wow-locker); a husky `prepare` that takes
`core.hooksPath` back on `bun install` (run `hooks.ts install .` after it,
as Hearthtale's does); its `CLAUDE.md` a map (about 700 words, the rest in
`docs/`) naming the commands, the hard rules and where each doc lives.

## 3. Check it took

```bash
(cd harness && bun doctor.ts ~/code/<project>)     # exit 1 lists what is wrong
bun harness/q.ts check -- <the check>              # in the project: the first stamp
```

(Family: `bun ../addon-kit/q.ts check -- bun run check` from the repository,
or `bun addon-kit/q.ts` by path.) Then prove the gates once, not by reading:
a commit message with a "generated with" line is refused, a push of an
unstamped tree is refused (use `git push --dry-run` against a throwaway
remote, or read `hooks.ts status`), and a commit without a running card
naming the repository is refused. Nothing is pushed for the test.

## 4. Commit and record

- Read the whole diff: `harness.toml`, the vendored folder, `.claude/`, the
  CLAUDE.md block, `.gitignore`. Nothing of the project's own was replaced.
- Merge the Harness block with the project's own rules: they live above or
  below it, not inside it (a rewrite of the block loses them).
- One commit, local: `chore: the harness at <sha>` (the vendored copies carry
  the harness repository's commit). The vendored copies and the hooks are
  waived by the review gate, a hand-written `CLAUDE.md` section isn't: run
  the packet and the reviewer when the commit holds anything else.
- In the family also: a row in the family `CLAUDE.md`'s folder table and a
  memory file with its line in `MEMORY.md`. The card moves to done once the
  commit is on origin (nothing is pushed without the user's go).

## What it does not do

- It creates no GitHub repository, no CI, no store page, no secrets.
- It doesn't write the project's own `CLAUDE.md` map or its docs: that is the
  project's work, and the block it adds says the rules beyond the harness's
  are in `CLAUDE.md`.
- It doesn't pick the model: `opusplan` for code and `claude --model opus`
  for prose are the family folder's `.claude/settings.json` and
  `session.ts --kind`. A project outside the family sets its own.
