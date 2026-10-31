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
written to be translated (31 October 2026). British spelling (traveller,
honour, grey, colour), game names as the game spells them, plain ASCII in
the English content files, no semicolons in any language. A good source line:
short sentences with the subject first, no idiom that does not travel ("ring
a bell", "off the hook"), no pun that would have to be rewritten, one word for
one thing (the family's terms stay the same across addons), no sentence built
on English-only word order or on a gendered pronoun for the reader, and
placeholders stable (`%s`, `%d`, `$N`, `$gmasc:fem;` keep their order and
count, a sentence is never built by gluing fragments). When an English line
cannot be translated without losing its point, fix the English first.

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
   names, then `bun run check` through q. `--stamp` only once a
   translation was read against its changed English.
2. The `prose-reader` helper reads the changed text cold in that language
   before the user does (give it the files, the language and the writer's
   register from the table above, and say whether it reads an interface or an
   authored voice). Fix what it finds that holds up, commit, then record the
   read: `bun addon-kit/coldread.ts <repo> "<verdict>" [lang…]`
   (preflight's cold-read flag counts from it).
3. The user tests in the game in that language: a test zip in iCloud and
   a board card saying what to look at.
