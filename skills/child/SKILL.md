---
name: child
description: Open a task in a session of its own (a child, through addon-kit's session.ts) instead of doing it here, and see it through to closing; with no task, make this session the dispatch, every new task after it opened as a child. Use when the user types /child, or says to open a task in its own session or to make this session the dispatch.
---

# /child

The user picks, not the session: `/child <task>` opens that task as a child
of this session, whatever this session is doing. `/child` alone makes this
session the dispatch. Without either, the family's rule holds (a session
with a task of its own opens a new one, a fresh session does the task).

## `/child <task>`: open it

Write nothing for the task here: no card, no file, no helper.

1. Settle, from the task and what this session knows, without asking:
   - the **title**: short, the task's own (the child's name and its card's);
   - **--repos**: every repository it will write, the main one first (the
     family's CLAUDE.md table; read a map when unsure);
   - **--kind**: `code` for code and mechanical work, `prose` for voices,
     translations, design and players' text;
   - **--plan** only when a design must be settled first: the opener's
     call, never a question for the user.
2. Write the task: the user's words, then what this session knows that the
   child needs (files, findings, decisions, what not to touch). Never "as
   discussed": the child starts cold.
3. From `~/code/wow-addons`:

   ```bash
   bun addon-kit/session.ts "<title>" --repos a,b --kind code -- "<the task>"
   ```

   `--dry-run` first only when unsure of the prompt. A `note:` that a
   repository is held means the child will block on it: say so.
4. Tell the user in a line or two: its name, its id, `claude attach <id>`,
   and the plan-mode wait when `--plan` was given.

## Seeing it through

The child reports here by SendMessage each time its card stops running
and once it has pushed.

- **Waiting on the user** (a test, a review, a push's go): tell the user in
  one line what it wants and where (`claude attach <id>`). It stays open:
  the user answers there.
- **Pushed**: check its work before closing it:
  - its card is done: `bun addon-kit/board.ts list --all`;
  - the range is on origin: `git -C <repo> log --oneline @{u} -5` (its
    branch's upstream, main as a rule);
  - CI: `bun addon-kit/status.ts`;
  - the change's shape: `git -C <repo> show --stat <range>`.

  Then `bun addon-kit/session.ts close <id>`, and one line to the user.
  Refused as busy (it has just sent its report): SendMessage to it with
  `notify_when_idle: true`, close on the notice. Refused for anything else:
  tell the user why. `--force` only on the user's word.
- **Dropped** (its card done, nothing pushed, the user's call): check its
  repositories hold nothing of it (`git -C <repo> status`, no commits of it
  on no remote), then close it; anything left is the user's to keep or
  throw away, `--force` on their word.
- Before wrapping up a turn: `bun addon-kit/session.ts children`, for a
  finished child not closed yet.

## `/child` alone: the dispatch

Say in a line that this session is the dispatch now. From then on, every
new task the user asks here is opened as a child (above), and the
session writes nothing of its own. A follow-up to a child's task goes to
that child (SendMessage, its name), a question about where things stand is
answered here (`children`, the board, `status.ts`). It lasts until the user
says otherwise.
