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
- The siblings' "Other addons" lines, each in its own words.
- `## Support` just before `## Source`: "<Addon> is free, and will stay
  free. If <what it gave you, in its own terms>, you can say thanks with a
  coffee on [Ko-fi](https://ko-fi.com/salty_max): it helps <it> keep
  growing. Thank you." Graceful, never pushy.
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
