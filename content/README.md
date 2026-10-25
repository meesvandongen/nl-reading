# Content library

Everything under `content/` is plain text that lives in git. The build step
(`pnpm run build:content`) turns it into JSON (pre-analyzed: words, dictionary
forms, de/het, separable verbs, grammar tags and keyword lists) that the app
loads.

```
content/
  stories/<level>/<slug>.md               reading texts
  stories/<level>/<series>/series.yml     a series …
  stories/<level>/<series>/<slug>.md      … and its episodes
  grammar/<id>.md                         grammar articles
```

Adding a text is a pull request that adds one Markdown file. No code changes.
For how to write a good story and translation, see [STYLE.md](STYLE.md).
`pnpm run audit -- <slug>` reports missing translations, keywords that aren't in
the text, words the dictionary doesn't know (usually names that need a
`names:` entry, or typos), and vocabulary far above the level.

## Stories

Path: `content/stories/<level>/<slug>.md`. The slug (file name without `.md`)
is the story id and must be unique across all levels. Use lowercase ASCII and
dashes, e.g. `de-verloren-fiets.md`.

### Levels

Levels follow the CEFR (ERK in Dutch), which is also what the Dutch
*inburgering* exam (A2/B1) and the *Staatsexamen NT2* (B1/B2) use.

| level folder | label    | CEFR        | typical length |
| ------------ | -------- | ----------- | -------------- |
| `a1`         | A1       | A1          | 60–150 words   |
| `a2`         | A2       | A2          | 150–300 words  |
| `b1`         | B1       | B1          | 300–600 words  |
| `b2`         | B2       | B2          | 500–900 words  |
| `c1`         | C1       | C1          | 700–1200 words |
| `classics`   | Classics | C2 / native | anything: public-domain literature |

### Categories

Use one of: `daily-life`, `food`, `travel`, `culture`, `folktale`, `history`,
`nature`, `school`, `work`, `society`, `science`, `sport`, `humor`,
`literature`, `news-style`, `conversation`.

### File format

```markdown
---
title: De verloren fiets
title_en: The Lost Bike
level: a2
category: daily-life
tags: [bike, city, Amsterdam]
summary: Sanne's bike is gone. Is it stolen, or did she forget where she left it?
author: NL Reading (original)
license: CC BY 4.0
keywords:
  - de fiets|bicycle, bike
  - het slot|lock
  - stelen|to steal
  - vergeten|to forget
names:
  - Sanne|Sanne (given name)
  - Albert Heijn|Albert Heijn (supermarket chain)
---

## Deel 1

Sanne komt uit de supermarkt.
> Sanne comes out of the supermarket.
Haar fiets staat er niet meer.
> Her bike isn't there anymore.

Ze kijkt links en rechts.
> She looks left and right.
```

Rules:

- **Front matter** is YAML. Required: `title`, `level`, `category`.
  Recommended: `title_en`, `summary`, `author`, `license`, `tags`.
  For public-domain texts also set `source` (URL) and `year`.
  Quote values that contain `:`.
- **`keywords`** (optional) is the pre-reading vocabulary list shown before the
  story, one `word|meaning` per item. Give nouns with their article
  (`de fiets`, `het huis`): the article is what learners most need to learn
  with a noun. If omitted, the build picks keywords automatically.
- **`names`** lists the proper nouns in the story (people, places, shops,
  pets, events), one `name|meaning` per item:
  `Sanne|Sanne (given name)`, `Den Bosch|'s-Hertogenbosch (city in North Brabant)`.
  A listed name is always one tappable word (also when it has several words or
  an apostrophe), and the lookup shows the meaning given here instead of a
  dictionary homograph (`Bas` is not "bass", `Mark` is not "mark").
  Capitalized words in the middle of a sentence that the dictionary doesn't know
  are treated as names anyway, but list them: the audit asks for it.
- **`glosses`** (optional) is the same for other words the dictionary gets
  wrong in this story, usually informal words, interjections or dialect:
  `hoi|hi`, `doei|bye (informal)`.
- **One sentence per line.** A line of Dutch is one sentence.
- **Translation**: a line starting with `> ` directly after a Dutch line is that
  sentence's English translation. Every original graded story has a
  translation for every sentence.
- **Paragraphs** are separated by a blank line.
- **Chapters**: a line starting with `## ` starts a new chapter (the audio player
  can start from any chapter). `# ` lines are ignored (the title comes from the
  front matter).
- Dialogue uses straight double quotes ("…") on the same line as the rest of
  the sentence.

## Series

A series is a set of stories that are read in order and together tell one
bigger story, like the chapters of a book or the episodes of a TV show. Each
episode is a normal story file with its own keywords and translations, short
enough for its level, and should end with a reason to read the next one.

All episodes of a series are at the same level: the series is a folder inside
a level folder, and the build fails if an episode's `level:` differs.

```
content/stories/a2/het-geheim-van-de-zolder/
  series.yml
  de-oude-kist.md
  de-brief.md
  het-antwoord.md
```

`series.yml`:

```yaml
title: Het geheim van de zolder
title_en: The Secret of the Attic
category: daily-life
summary: Lotte finds an old chest in the attic of her grandmother's house.
author: NL Reading (original)
episodes:            # story ids (file names without .md), in reading order
  - de-oude-kist
  - de-brief
  - het-antwoord
```

The folder name is the series id (lowercase ASCII and dashes). Every `.md` in
the folder must be listed in `episodes`, and every listed episode must be in the
folder. Keep names the same across episodes (each episode has its own
`names:` list). Add a new episode by adding its file and appending it to
`episodes`; the series shows as NEW in the app.

## Grammar articles

Path: `content/grammar/<id>.md`. The id is referenced from the reader's grammar
breakdown, so keep ids stable.

```markdown
---
title: Separable verbs
title_nl: Scheidbare werkwoorden
cefr: A2
order: 40
summary: opbellen → "Ik bel je morgen op." The prefix goes to the end.
---

Body in Markdown. Dutch example sentences in a list, with an em dash before
the translation (the app adds a play button to each):

- Ik bel je morgen op. — I'll call you tomorrow.
```

## Licensing

Original texts in this repository are licensed CC BY 4.0 unless the front
matter says otherwise. Classic texts are in the public domain; keep their
`source` URL.
