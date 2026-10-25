---
name: child
description: Open a task in a session of its own (a child) instead of doing it here, and see it through to closing: from the desktop app with its own session tool (the child shows in the sidebar), from a CLI session with addon-kit's session.ts; with no task, make this session the dispatch, every new task after it opened as a child. Use when the user types /child, or says to open a task in its own session or to make this session the dispatch.
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
   - **repos**: every repository it will write, the main one first (the
     family's CLAUDE.md table; read a map when unsure);
   - **kind**: `code` for code and mechanical work, `prose` for voices,
     translations, design and players' text;
   - **plan** only when a design must be settled first: the opener's
     call, never a question for the user.
2. Write the task: the user's words, then what this session knows that the
   child needs (files, findings, decisions, what not to touch). Never "as
   discussed": the child starts cold.
3. Its first words come from session.ts (the maps, its card first, its
   model, the task, the report to this session). For a desktop child:

   ```bash
   bun addon-kit/session.ts "<title>" --repos a,b --kind code [--plan] --desktop -- "<the task>"
   ```

   prints the prompt alone and starts nothing.

   A `note:` that a repository is held means the child will block on it:
   say so.
4. Open it:
   - **In the desktop app** (this session has the `start_session` tool):
     `start_session` with `initiation: "user_asked"`, `context: "fresh"`,
     `use_worktree: false`, the title, a short `name`, `prompt` what
     `--desktop` printed (all of it), `background` one line on the
     family's harness and where this task comes from. The model: `code`
     passes a Sonnet id (`claude-sonnet-5-5`); `prose` passes an Opus id
     (`claude-opus-5-5`); `plan` passes the Opus id and `permission_mode:
     "plan"`, and once the child says its plan is approved,
     `set_session_model` moves it to Sonnet. The tool takes only this
     session's model or a cheaper one (the family's default, `opusplan`,
     may not count as Opus): after a prose or plan start, `get_session`
     on the child, and if it isn't on Opus, `set_session_model` to the
     Opus id (the app asks the user: say why in a line). It shows in
     the sidebar under this session. The app starts one only on a turn the
     user typed (`/child` always is): on a turn another session's message
     or an event began, it refuses, so propose it instead (`initiation:
     "own_initiative"`, the same brief) and tell the user it waits on
     their click.
   - **From a CLI session** (no `start_session`): the same command without
     `--desktop`. It runs `claude --bg`: in `claude agents` and the panel,
     never in the desktop sidebar.
5. Tell the user in a line: its name and where to find it (the sidebar, or
   `claude attach <id>`), and the plan's wait when there is one.

## Seeing it through

The child reports here by SendMessage each time its card stops running
and once it has pushed (a desktop child's turns also reach this session
as the app's notes).

- **Waiting on the user** (a test, a review, a push's go): tell the user in
  one line what it wants and where. It stays open: the user answers there.
  A push go the user gives here is this session's to carry out (the
  family's CLAUDE.md): `git -C <repo> log --oneline origin/main..<sha>`
  first, and if commits of another card sit below the child's, name them
  to the user before pushing (they go out too). Then `git -C <repo> push
  origin <sha>:main` and tell the child to set its card done.
- **Pushed**: check its work before closing it:
  - its card is done: `bun addon-kit/board.ts list --all`;
  - the range is on origin: `git -C <repo> log --oneline @{u} -5` (its
    branch's upstream, main as a rule);
  - CI: `bun addon-kit/status.ts`;
  - the change's shape: `git -C <repo> show --stat <range>`.

  Then close it, and one line to the user:
  - a desktop child: `bun addon-kit/session.ts check <local_id>`, then
    `archive_session` once `list_sessions` with `linked: true` shows it
    `startedBy` this session (check can't tell whose it is). Outside auto
    mode the app asks the user to approve the archive: say so in the
    line;
  - a CLI child: `bun addon-kit/session.ts close <id>`.

  Refused as busy (it has just sent its report): SendMessage to it with
  `notify_when_idle: true` and close on the notice. Refused for anything
  else: tell the user why. `--force` (or an archive past a refusal) only
  on the user's word.
- **Dropped** (its card done, nothing pushed, the user's call): check its
  repositories hold nothing of it (`git -C <repo> status`, no commits of it
  on no remote), then close it. Anything left is the user's to keep or
  throw away.
- Before wrapping up a turn: `list_sessions` with `linked: true` and `bun
  addon-kit/session.ts children`, for a finished child not closed yet.

## `/child` alone: the dispatch

Say in a line that this session is the dispatch now. From then on, every
new task the user asks here is opened as a child (above), and the
session writes nothing of its own. A follow-up to a child's task goes to
that child (SendMessage, its name), a question about where things stand is
answered here (the children, the board, `status.ts`). It lasts until the
user says otherwise.
