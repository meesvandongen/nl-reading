# Writing guide for graded stories

This is the house style for original stories and translations in
`content/stories/`. The file format is in [README.md](README.md); this file is
about making a story good to learn from.

## What makes a good story here

- **A story, not a vocabulary list.** Something happens: a small problem, a
  surprise, a turn at the end, a joke that lands, a warm or bittersweet moment.
  Even a ten-sentence A1 story should have a point.
- **Natural Dutch.** Write what a Dutch or Flemish author of graded readers
  would write. Grade the language by choosing simpler words and structures, not
  by writing unnatural Dutch. Repetition is good at low levels. Use the little
  words that make Dutch sound Dutch (*even*, *maar*, *toch*, *hè*, *wel*, *eens*)
  where a native speaker would, from A2 on.
- **Life in the Netherlands and Flanders**, not a translated story set
  anywhere. Bikes in the rain, birthday circles, *boodschappen*, the
  *huisarts*, Koningsdag, Sinterklaas, the Elfstedentocht, dikes and polders,
  Belgian fries, the *kermis*, a Friday-afternoon *borrel*, the *NS* running
  late, *carnaval* in the south. Without turning into a guidebook: the culture
  is the setting, the story is the point.
- **Varied characters and settings**: children and old people, Randstad
  cities and villages in Drenthe or Limburg, Flanders, Dutch people with
  roots elsewhere, newcomers learning Dutch, expats, students.
- **Non-fiction is accurate.** History, science, society and news-style
  texts must be correct. Check facts and leave out claims you are not sure of.

## Level guidelines

| level | grammar | vocabulary |
| ----- | ------- | ---------- |
| a1 | present tense, V2 word order, simple questions, *niet/geen*, *er is / er zijn*, modal + infinitive (*ik wil fietsen*), simple separable verbs | the ~1000 most common words; concrete everyday words; short sentences (≤ 10 words) |
| a2 | + perfect tense (*hebben/zijn* + participle), simple past of common verbs, *omdat/als/dat* with verb at the end, comparatives, *er* (place), reflexive verbs, *gaan* + infinitive | ~2000 most common words; new words in the keyword list |
| b1 | + simple past narration, relative clauses (*die/dat/waar*), *zou/zouden*, passive with *worden*, *om … te*, *aan het* + infinitive, most uses of *er* | ~4000 words; normal everyday Dutch |
| b2 | + all tenses, longer sentences, passive with *zijn*, formal register, idioms and fixed expressions | ~8000 words; newspaper and magazine Dutch |
| c1 | anything: essays, literary fiction, opinion pieces | normal written Dutch |

Sentence counts are a guide, not a rule. Every sentence of an original story
has a translation.

## Spelling and punctuation

- Follow the official spelling (*Groene Boekje*): *pannenkoek*, *ideeën*,
  *auto's*, *zo'n*, *'s ochtends*, *Sinterklaasavond*, *Koningsdag*.
- Dialogue in straight double quotes, on the same line as its sentence:
  `"Waar is mijn fiets?" vraagt Sanne.`
- Flemish usage is welcome in stories set in Flanders (*goesting*, *amai*,
  *dikwijls*); add a `glosses:` entry when the dictionary doesn't have the
  Flemish meaning.

## Names

- **List every name in `names:`**: people, pets, places, shops, companies,
  events. Names are often also ordinary words (*Bas*, *Mark*, *Roos*,
  *Kampen*, *Vlissingen* is fine but *Hoorn* is "horn"). The audit reports
  capitalized words it can't find in the dictionary.
- Multi-word names (*Den Haag*, *Albert Heijn*, *Sint Maarten*) are kept as
  one tappable word when listed.

## Translations

- **Faithful and natural.** Translate what the sentence says, in idiomatic
  English. A learner uses the translation to check their understanding, so
  don't add information that isn't in the Dutch, don't drop clauses, and keep
  the meaning of each sentence in its own line. Within that, write English a
  native speaker would write (*gezellig* is "cosy" or "nice", depending on
  the sentence; *lekker* is "nice", "tasty" or "good").
- **Keep tense and person consistent** within a story.
- Keep culture words when English has no good equivalent and the story
  explains them (*stroopwafel*, *borrel*, *Sinterklaas*), otherwise translate.
- Modal particles (*even*, *maar*, *toch*, *hè*) usually have no word in
  English: translate their effect ("Just come in" for *Kom maar binnen*;
  "Could you…" for *Kun je even…*).

## Keywords

5–10 words a reader at this level probably doesn't know yet, most important
first, each `word|meaning`. Nouns with *de* or *het*, verbs in the infinitive
(*opbellen*, not *belt … op*). Every keyword must appear in the text in some
form (the audit checks).

## Checking your work

```sh
npm run data                                   # once: builds the dictionary
npx tsx scripts/audit-content.ts <path-part>   # report for matching stories
npx tsx scripts/show-words.ts "Ik bel je morgen op."   # how a line is analyzed
```

A new story should come out of the audit with no ERROR (this includes names
missing from `names:`), no "unknown word" lines and few words far above its
level.
