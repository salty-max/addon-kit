---
name: wow-store-pages
description: Write or change an addon's store page (addon/CURSEFORGE.md) and put it up on CurseForge, Wago and GitHub with addon-kit's store.ts: the page's shape (what's unique first, Support with Ko-fi, Source), the summaries, the dry run, the user's go for --apply, the --ui page. Use for any store text, summary, TOC Notes or GitHub description change.
---

# Store pages

The text of every store lives in the addon's `addon/CURSEFORGE.md`; the
TOCs' `## Notes` are the summary (also at the top of the file, in a
comment). Store-page text may be pushed to the repository without asking;
putting it up on the stores publishes, so that waits for the user's go.

## The page

- Lead with what is unique to the addon, in plain words, for a player who
  has never heard of it. Screenshots are the user's (galleries by hand).
- No semicolons; English, with the translated clients' lines as the other
  pages have them.
- **Register** (from the nine shipped pages, 31 October 2026): plain, warm and
  factual, in the second person ("you"), the present tense, British spelling.
  The first paragraph says what the addon does and when it speaks, never a
  slogan. Defaults and limits in **bold**, short sections under `##`, no
  exclamation marks, no hype, no semicolons. One line says which clients get
  which language and that German and Spanish are first translations with
  corrections welcome on GitHub. (A line inviting a native German or Spanish
  reader to send corrections is decided but deferred, 31 October 2026: not
  on the pages yet.) Two real ones, from Second Wind's page: "Second Wind gives you a debrief
  after a close call or death. Once the fight is over, you can see the hits
  that hurt most, how your health fell, and which potions or abilities were
  ready but went unused." and "Second Wind is free and will stay free. If the
  debriefs have helped you survive the next fight, you can support the addon
  with a coffee on Ko-fi. Thank you."
- The siblings' "Other addons" lines, each in its own words.
- `## Support` just before `## Source`: "<Addon> is free and will stay
  free. If <what it gave you, in its own terms>, you can support the addon
  with a coffee on [Ko-fi](https://ko-fi.com/salty_max). Thank you."
  Graceful, never pushy. (Goodwill's and Yours Truly's older "say thanks ...
  it helps <it> keep growing" form is to be brought to this one when their
  pages next change.)
- `## Source`: the GitHub repository.
- The `prose-reader` helper reads a new or rewritten page cold before the
  user does.

## Putting it up

From `~/code/wow-addons` (an addon's repository: `bun ../addon-kit/store.ts .`):

```bash
bun addon-kit/store.ts --all           # every page against its file: what would change, nothing saved
bun addon-kit/store.ts <repo> --show   # the title, summary and GitHub note the file gives
bun addon-kit/store.ts --all --apply   # the user's go first: pages put up as Markdown, read back, GitHub's descriptions too
bun addon-kit/store.ts --ui            # the same in a page on this computer, the user puts each one up
```

- A dry run first, always; show the user what would change and ask before
  `--apply` (the ask rules prompt too, in every session: a guard, not the
  go).
- The CurseForge summary is changed by hand on the project's General page
  (its save sends the whole project); Wago's summary goes up with its page.
- The cookies (`~/.config/wow-addons/curseforge-cookie`, `wago-cookie`) are
  the user's whole-account logins: never printed, committed, sent to a
  server or put in CI. An expired one: the script says so, the user copies
  it again from the browser's devtools.
- A new addon's project ids go into its TOCs (`X-Curse-Project-ID`,
  `X-Wago-ID`) before its first release (the `wow-releasing` skill).
