# Lees mee · NL Reading

A free, open-source Dutch graded reader. It's a Progressive Web App hosted on
Cloudflare Workers: install it on your phone or desktop and it works offline.

It started as a fork of [JP Reading](https://github.com/meesvandongen/jp-reading)
and was rebuilt for Dutch: the Japanese reading aids (furigana, romaji, kanji,
pitch accent) are gone, and Dutch-specific help took their place.

## Features

**Library**
- Graded stories at CEFR levels A1, A2, B1, B2 and C1, plus Classics
  (public-domain Dutch literature: Multatuli, Gezelle, Gorter), about
  life in the Netherlands and Flanders: birthday circles, Koningsdag,
  Sinterklaas, bikes in the rain, the huisarts, the Elfstedentocht, the 1953
  flood, the Afsluitdijk, the tulip mania, the Hongerwinter, Belgian fries,
  carnaval in Maastricht.
- **Series**: stories at one level that are read in order and tell one
  bigger story, with a series page, per-episode progress and a "Next
  episode" button.
- Recommendations based on your level and reading history, a "Continue
  reading" shelf, favorites, NEW badges, search and filters.
- **Read any Dutch text.** Paste text, open a `.txt` file, or share text from
  another app (share target). It's analyzed in your browser and you get the
  same reader as the library.

**Reader**
- Tap any word for its meaning, its dictionary form and what form it is
  (*liep* → *lopen*, past tense of a strong verb; *huisjes* → *huis*,
  diminutive plural), de or het, plural and diminutive, the principal parts
  of verbs (*lopen – liep – gelopen*, with *zijn* or *hebben*), IPA, a
  native-speaker recording where Wiktionary has one, example sentences and a
  word level.
- **Separable verbs** are recognised even when their parts are far apart:
  in *Ik bel je morgen op* both *bel* and *op* show *opbellen*, and tapping
  one lights up the other. Also *op te bellen* and *opgebeld*.
- Compounds the dictionary doesn't have are split into their parts
  (*fietsenwinkeltje* → *fiets* + *winkel*, with the de/het of the last part),
  and fixed expressions are recognised (*ten slotte*).
- Grammar links for what each word shows: perfect tense, passive, *er*,
  *te* + infinitive, *aan het* + infinitive, modal particles, word order in
  subordinate clauses, comparatives and more.
- Press and hold any word to select its sentence: the full translation, a
  word-by-word breakdown, audio and copy. Texts without a translation use the
  browser's on-device translator where available, or offer Google Translate
  and DeepL links.
- Reading aids:
  - the English meaning in small print above words: off, for new words only,
    above a level, or for every word
  - nouns coloured by article (de / het)
  - word levels (A1–C2) underlined, saved words underlined
  - sentence translations, per sentence (tap to reveal) or per paragraph
- Fonts (Literata, Inter, Atkinson Hyperlegible, system), text size, line
  spacing, and light, sepia and dark themes.
- Audio via text-to-speech (Dutch or Flemish voice), with the current sentence
  highlighted, speed from 0.5× to 1.5×, start from any chapter or sentence,
  and lock-screen controls.
- A keyword list before each story, and a resource hub with keywords, saved
  words, the grammar used in the story, and info about it.

**Flashcards and practice**
- Save words while reading, together with the sentence you found them in.
- Spaced-repetition reviews (Again / Hard / Good / Easy): Dutch → English,
  listening → English, English → Dutch. Noun cards can ask *de or het?*
  before you turn them.
- **Practice drills**: *de of het?* for the 2,500 most common nouns (with the
  rule of thumb when there is one: diminutives, *-ing*, *-heid*, *-ment*…),
  and the forms of strong and irregular verbs.
- A daily new-card limit, a word list, and export to Anki.

**Dictionary and grammar**
- About 60,000 Dutch words from Wiktionary, searchable in Dutch (any form:
  *liep* finds *lopen*) or English, with de/het, plurals, verb forms,
  pronunciation and recordings.
- 38 grammar articles from A1 to B2, from *de or het?* and word order to
  *er*, separable verbs, modal particles and verb clusters, with audio for
  every example.

**Progress**
- Daily streak, a weekly goal (stories or minutes), an activity heat map,
  per-level completion and totals.
- Reading reminders: notifications through Periodic Background Sync when
  installed, or a calendar (.ics) file with a daily alarm.
- Backup and restore of all your data as a JSON file.

Everything runs client-side. Your data stays in your browser (IndexedDB).

## Adding texts

Texts are Markdown files in [`content/stories/<level>/`](content/stories), and a
series is a folder of them with a `series.yml`. See
[`content/README.md`](content/README.md) for the format: YAML front matter, one
sentence per line, `> ` translation lines, `## ` chapters, and a `names:` list
for proper nouns, and [`content/STYLE.md`](content/STYLE.md) for the house style.
Check a story with `npm run audit -- <slug>`. Open a pull request. CI validates
the files, and the text appears in the app after merge.

## Development

```sh
npm install
npm run data         # download Wiktionary + frequency data, build the dictionary (~10 s after a ~250 MB download)
npm run dev          # analyzes content/ into public/data/library, then starts Vite
npm test
npm run audit        # content quality report (translations, keywords, names, unknown words, level)
npx tsx scripts/show-words.ts "Ik bel je morgen op."   # how a sentence is analyzed
npm run build        # content + typecheck + production build into dist/
```

How it works:
- `scripts/build-dict.mjs` turns the Dutch entries of the English Wiktionary
  (extracted by [Wiktextract](https://kaikki.org/dictionary/Dutch/)) into
  sharded JSON: a form index (every inflected form → its dictionary words),
  the entries (meanings, de/het, plurals, diminutives, verb principal parts,
  separable prefixes, IPA, recordings, examples) and an English index. A
  frequency list from OpenSubtitles gives every word a rank, which decides
  which homograph comes first (*was*: *zijn*, not "laundry") and an estimated
  CEFR level. It also writes the whole form index and a lemma table as two
  text files (about 2.7 MB compressed) for analyzing texts, and the word lists
  for the practice drills.
- `src/lib/analyze.ts` analyzes text: it finds the words, looks up every
  candidate reading, chooses between them in context (an article before a
  noun, a verb after a subject, a preposition before a noun phrase), links
  separable verbs within a clause, splits compounds and tags grammar.
  `scripts/build-content.ts` runs it over the library at build time; pasted
  texts go through the same code in a Web Worker (`src/workers/`).
- The UI is Preact with signals. `vite-plugin-pwa` (Workbox) generates the
  service worker.

## Deployment

The site is served as [Workers static assets](https://developers.cloudflare.com/workers/static-assets/)
from the Worker `nl-reading` (see [`wrangler.jsonc`](wrangler.jsonc)).
[Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/)
can deploy `main` to production and build every other branch as a Preview.

Workers Builds settings (**Workers & Pages → nl-reading → Settings → Build**):

| Setting | Value |
| --- | --- |
| Build command | `npm run build:cf` |
| Deploy command | `npx wrangler deploy` |
| Preview command | `npx wrangler preview` (with preview builds enabled for all non-production branches) |
| Root directory | `/` |

`npm run build:cf` unshallows the clone (stories get their "added" date from
git history), downloads the dictionary sources and builds into `dist/`.
`.github/workflows/ci.yml` runs the tests and the build on every push and pull
request.

To deploy by hand: `npm run data && npm run build && npm run deploy`.

## Credits

- Dictionary: [Wiktionary](https://en.wiktionary.org) contributors, via
  [Wiktextract / kaikki.org](https://kaikki.org/dictionary/Dutch/),
  CC BY-SA 4.0 and GFDL
- Recordings: Wikimedia Commons contributors (mostly CC BY-SA), linked from
  each word
- Word frequencies: OpenSubtitles via
  [hermitdave/FrequencyWords](https://github.com/hermitdave/FrequencyWords),
  CC BY-SA 4.0
- Classic texts: Project Gutenberg and DBNL (public domain), spelling modernized

Original stories and grammar articles are CC BY 4.0.
