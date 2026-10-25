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

## Each language's voice

- **French**: the interface's register per addon (Mealbook: vous, no
  agreement with the reader's gender, Eunice feminine). A line speaking to
  the player genders with `$gmasc:fem;` (Yonder). Yonder's dangers: Calme,
  Gardé, Périlleux, Mortel, Disputé. "Morts frôlées" for close calls.
- **German** (flagged: a first translation): interfaces say "du". The
  Codex's narrators use the game's formal "Ihr"/"Euch", the traveller is
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
  (decimal point) stays the addon's. Second Wind: informe, combate
  casi mortal, recursos de emergencia. Keyring: minimapa, botón, cajón,
  llave, opciones. Hearthtale: diario, entrada, Salón de los Caídos.
- **Every language**: no semicolons (gender tokens' own `;` aside); tile
  captions stay one line at 11pt (short words); commands and addon names
  unchanged. Hearthtale's journal stays English on every client: only its
  interface is translated.
- A new language: `i18n/<locale>/meta.json` (plural rule, decimal,
  `flagged: true` until a native reader), TOC `Notes-<locale>`, a store
  page line, a sim block on that client.

## Checks and the cold read

1. `bun run locales` (`--keys` for new words), the addon's generators for
   names, then `bun run check` through q. `--stamp` only once a
   translation was read against its changed English.
2. The `prose-reader` helper reads the changed text cold in that language
   before the user does (give it the files, the language and the voice
   rules above). Fix what it finds that holds up.
3. The user tests in the game in that language: a test zip in iCloud and
   a board card saying what to look at.
