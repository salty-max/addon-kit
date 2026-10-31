---
name: wow-translating
description: Translate an addon's words or authored text (pages, riddles, notes, chefs' pages, store lines) into French, German or Spanish, or start a new language: the game's names by id from wow-data, each language's voice and tokens, the checks, and a cold read by the prose-reader helper before the user reads it. Use for any translation, a translation's update after its English changed, or a new client language.
---

# Translating

Use full Opus. The English is the source of every authored text; a
translation keeps its paragraph marks and records its English's hash.

## Before a word

- **English first.** The English game data must be complete before a
  language is filled. Check the language's coverage in wow-data against a
  language already done (the `wow-data-audit` skill, or the `data-scout`
  helper: `name` rows per kind and locale, both games). A gap goes into
  wow-data (`bin/names.ts <game> <locale> --gaps|--readable|--ids`), never
  into the addon by hand.
- Read the addon's own language notes: the Codex's
  `docs/localization.md` (and `spanish-translation.md`,
  `*-readable-translations.md`), the addon's `docs/architecture.md`
  "Languages".

## Names: the game's, by id

- Every game name comes from wow-data by id, in the client's language:
  creatures, places, items, quests, flight points, building areas
  (`python3 addon-kit/subzones.py <locale>`), the glossary
  (`python3 addon-kit/glossary.py <locale> …`, the Codex's
  `scripts/glossary.py`). Never read a name off Wowhead by hand: that is a
  wow-data gap.
- Forever's names first (English kept where Forever's translators kept it:
  "Roi Magni Bronzebeard", "Forgefer"); Classic Era's swapped in on Classic
  (`i18n/<locale>/classic.json`, `classic-by-hand.json`). Retail's only for
  what neither client has.
- A name the glossary holds that the English names must appear as the game
  writes it (`scripts/names.ts` in `--check`; exceptions with a reason in
  `names-ok.json`).
- Quotes are the game's own text in that language (wow-data's `speech`,
  `quest_text`, books), never a retranslation.
- Saved data stays ids; complete name tables for every language, English
  one of them, no English fallback.

## The English is the base

Every other language is translated from the English, so the English is
written to be translated (31 October 2026), and English and French are
finished first: German and Spanish start for an addon only when
`bun addon-kit/base.ts <repo>` says its English and French are final and
nothing moved since (`ideas/audit/en-fr-base.md`). The rubric, A1 to A3 being
rules, the rest a reader's checklist (`python3 addon-kit/rubric.py` lists what a
script can measure, never a failure):

- **A1** no semicolons in player text (a gender token's own aside). **A2**
  plain ASCII in the English content. **A3** British spelling (honour, colour,
  harbour, grey, centre, recognise, defence), the game's names as the game
  spells them (Valley of Honor, Armor Kit, Honored) and quotes of the game
  untouched.
- **A4** short sentences: an interface line is one idea, 25 words at most per
  sentence. An authored sentence over 35 words is split unless its voice
  needs it (the Codex's historian does: split only where a sentence carries
  two ideas).
- **A5** whole sentences, never fragments joined in code (a label or a list
  item is fine). **A6** two or more blanks in a sentence are numbered
  (`%1$s`, `%2$s`) wherever a language may reorder them, and no English word
  goes inside a blank's value. **A7** one term per concept: `terms.json`.
  **A8** the context in the key for a word French must agree (no bare
  "None", "found", "one" shared by two nouns).
- **A9** idioms that travel ("brought down" is fine), the others rewritten
  ("ring a bell", "off the hook"); no pun that would have to be rewritten, no
  sentence built on English word order or on a gendered pronoun for the
  reader. **A10** titles in title case, labels and buttons in sentence case.
  **A11** numbers through the locale (`meta.decimal`), never "2.5%" typed.
- The voice doc (`docs/voices.md`, `docs/writing.md`) wins over everything
  above except A1 to A3. When an English line cannot be translated without
  losing its point, fix the English first.

**The terms** are `addon-kit/terms.json`, one entry per concept (English,
French, the forms to accept, the words to avoid, the source: the client's own
string by tag, or the family). The game's own French settles an interface
word (`client_GlobalStrings` in wow-data: `ACHIEVEMENTS`, `ELITE`,
`HARDCORE_REALM_NAME`). `bun addon-kit/terms.ts [repo…]` checks every addon's
`words.json` and TOC notes against it, warnings only for now. A new shared
word goes in the table before it goes in a second addon. The window words
(the user's rule): one per addon, in every line: the journal (Hearthtale,
Yonder), the codex (the Codex), the drawer (Keyring), the book (Second Wind,
Mealbook, Goodwill, Yours Truly). An addon's own settings are "settings"
(French "réglages"), "Options" is the game's window.

**French typography** (31 October 2026, as the client writes it): a
no-break space (U+00A0) before `:` `?` `!` and `%`, straight apostrophes,
`Extrême` for Hardcore, `élite rare` as the adjective ("Une créature
d'élite", "Une créature rare", "Une élite rare" are Yonder's three labels,
never "Un élite"), `Aucun résultat` for a search with nothing. Plain ASCII is the
English content's rule, never French's.

## Each language's voice

**The register is per writer, not per language** (the user's rule, 31 October
2026). An **interface** (words, tabs, tooltips) and the voices that speak to
the player in plain words (Second Wind's debrief) take the interface
register. An **authored voice** (a page's narrator, a chef, a faction's
spokesman, a letter's writer, a riddle) takes the register its card or voice
doc says: it may tutoyer or vouvoyer, and the card is the authority. Where
the card is silent, use the table. Never rephrase a line so the voice goes
flat to dodge a register: the voice wins.

| Speaker | French | German | Spanish |
|---|---|---|---|
| **Every interface** (all nine addons' words) | vous, nothing agreeing with the reader | du | tú, never vosotros |
| Second Wind's debrief | vous | du | tú |
| Codex: Archesonus and Parqual (pages, forewords, notes) | vous | **Ihr/Euch/Euer** (courtly) | tú |
| Yonder: Bestiary, Atlas, riddles, hints, notes | vous | du | tú |
| Mealbook: Kendor and Eunice | vous | **Ihr** ("Backt", "Würzt") | tú |
| Goodwill: the 35 voices | vous, except **Bor** (tu from the first page), **Gorn** (vous, then tu at Revered) and **Lokhtos** (vous, then tu at Exalted) | **Ihr**, except Bor (du throughout), and Gorn and Lokhtos dropping to du where their cards say | tú, except Gorn and Lokhtos (usted at first, the same scale) |
| Yours Truly: 73 writers | vous, except six who tutoient: Thazzril, Bernice Stonefield, Hawkwind, Gaxim Rustfizzle, Iverron, Gazlowe | Ihr/Euch for the writers who vouvoient in French, du for the six | tú for every writer |
| Hearthtale | vous (interface only, the journal is English on every client) | du | tú |

Gazlowe tutoies in Yours Truly and vouvoies in Goodwill (as the game's
French Gazlowe does). The family decided (31 October 2026) to align his
letter on vous, a word change that waits for a release of Yours Truly: until
then the table follows the shipped letter.

- **French**: agreement with the reader (whose gender the game knows) goes
  through `$gmasc:fem;`, a token where none is needed is a fault too, and
  a title never genders the reader. An interface speaks so nothing
  agrees (a `$gmasc:fem;` token only where a sentence cannot be turned). A speaker's own agreements are as the card says (Eunice is a
  woman, Kendor a man, Gazlowe's "$gGamin:Gamine;"). Yonder's dangers:
  Calme, Gardé, Périlleux, Mortel, Disputé. "Morts frôlées" for close calls.
- **German** (flagged: a first translation): the traveller is
  `$gReisender:Reisende;`. Yonder's riddles `$gmasc:fem;` where German
  genders the reader. Dangers: Ruhig, Bewacht, Gefährlich, Tödlich,
  Umkämpft. Most Classic city names stay English on a German client.
- **Spanish** (flagged until a native reader): neutral, tú; one esES
  catalog shared by esMX. esMX's game names are wow-data's, held once: where
  its client has none, wow-data lends esES's (source `esES`); an addon never
  types one. `i18n/esMX/regional.json` is `{ "names": [esES game names],
  "words": { esES: esMX } }`: `names` lists the esES spelling only,
  `bun scripts/root.ts --run addon-kit/regional.ts` fills esMX's from the
  databases into `regional.resolved.json` (what the loaders swap; fails on
  a name wow-data lacks or gives two ways, and on a word that is a game
  name); `words` keeps only what is no game name (prose words, a name with
  its article or ending, a form the translation itself wrote). Metadata
  (decimal point) stays the addon's. Mexican Spanish says ustedes, so a
  Castilian "habéis" or "vuestro" is a fault. Second Wind: informe, combate
  casi mortal, recursos de emergencia. Keyring: minimapa, botón, cajón,
  llave, opciones. Hearthtale: diario, entrada, Salón de los Caídos.
- **Every language**: no semicolons (gender tokens' own `;` aside); tile
  captions stay one line at 11pt (short words); commands and addon names
  unchanged. Hearthtale's journal stays English on every client: only its
  interface is translated. English is British.
- A new language: `i18n/<locale>/meta.json` (plural rule, decimal,
  `flagged: true` until a native reader), TOC `Notes-<locale>`, a store
  page line, a sim block on that client.
- The voice rules themselves, per addon: Goodwill, Mealbook, Yours Truly and
  Second Wind `docs/voices.md`, the Codex `docs/writing.md` and its
  `docs/localization.md` guide, Yonder `docs/writing.md`.

## Checks and the cold read

1. `bun run locales` (`--keys` for new words), the addon's generators for
   names, then `bun run check` through q. `--stamp <language>` only once that
   translation was read against its changed English, one language at a time:
   a stamp says "this language was read", so French's never marks German.
2. The `prose-reader` helper reads the changed text cold in that language
   before the user does (give it the files, the language and the writer's
   register from the table above, and say whether it reads an interface or an
   authored voice). Fix what it finds that holds up, commit, then record the
   read: `bun addon-kit/coldread.ts <repo> "<verdict>" [lang…]`
   (preflight's cold-read flag counts from it; English is `enUS`, its text
   the content folders, not `i18n/`). When English and French are both read
   and proved, `bun addon-kit/base.ts <repo> freeze` writes the base record, committed right after.
3. The user tests in the game in that language: a test zip in iCloud and
   a board card saying what to look at.
