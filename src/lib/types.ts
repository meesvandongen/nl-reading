// Data model shared by the content build script and the app.

export type Pos =
  | 'n' // noun
  | 'name' // proper noun
  | 'pron' // pronoun
  | 'num' // number
  | 'v' // verb
  | 'adj' // adjective
  | 'adv' // adverb
  | 'prep' // preposition
  | 'conj' // conjunction
  | 'det' // determiner (deze, mijn, elk)
  | 'art' // article (de, het, een)
  | 'intj' // interjection
  | 'prt' // the separated prefix of a separable verb (bel … op)
  | 'x' // other / unknown
  | 'sym' // punctuation

export type Article = 'de' | 'het' | 'de/het'

/** One line of a word's breakdown, e.g. "past participle" → grammar article. */
export interface Step {
  /** short English label, e.g. "past participle" */
  l: string
  /** grammar article id */
  g?: string
}

/** A tappable word. */
export interface Word {
  /** surface, as in the text */
  s: string
  /** whitespace after the word */
  ws?: string
  /** dictionary form (lemma) when different from the surface (lowercase) */
  b?: string
  /** part of speech */
  p: Pos
  /** dictionary entry id of the best match */
  e?: number
  /** form code of the surface (see FORM_LABELS in dictKeys.js), when it is an inflected form */
  c?: string
  /** de/het of a noun (diminutives: het) */
  a?: Article
  /** CEFR level of the lemma, 1 = A1 … 6 = C2 (from word frequency) */
  l?: number
  /** short meaning, for gloss hints and the sentence breakdown */
  h?: string
  /** grammar article ids this word illustrates */
  t?: string[]
  /** breakdown of an inflected word: lemma + these steps */
  f?: Step[]
  /** index in the sentence of the other part of a separable verb (bel … op) */
  sp?: number
  /** the parts of a compound the dictionary doesn't have as one word */
  cp?: CompoundPart[]
  /** part of a fixed expression the dictionary has as a whole (ten slotte, in ieder geval) */
  x?: { b: string; e: number; h?: string }
  /** meaning given by the story (front matter `names:` / `glosses:`); wins over the dictionary */
  m?: string
}

export interface CompoundPart {
  /** text of the part as it appears in the word (fietsen-) */
  s: string
  /** lemma of the part */
  b: string
  /** entry id */
  e?: number
  /** short meaning */
  h?: string
}

/** A story-specific word from the front matter: `names:` (proper nouns) or `glosses:` (other words). */
export interface Term {
  /** surface as written in the text */
  s: string
  /** English meaning */
  m: string
  /** a proper noun */
  name?: boolean
}

export interface Sentence {
  w: Word[]
  /** English translation */
  en?: string
}

export interface Paragraph {
  s: Sentence[]
}

export interface Chapter {
  title?: string
  p: Paragraph[]
}

export interface Keyword {
  /** word, nouns with their article ("de fiets") */
  w: string
  m: string
  /** CEFR level 1–6 */
  l?: number
}

export type Level = 'a1' | 'a2' | 'b1' | 'b2' | 'c1' | 'classics'

export interface StoryMeta {
  id: string
  title: string
  title_en?: string
  level: Level | 'custom'
  category: string
  tags?: string[]
  summary?: string
  author?: string
  license?: string
  source?: string
  year?: number
  /** number of words of Dutch text */
  words: number
  /** number of sentences */
  sentences: number
  /** whether every sentence has a translation */
  translated: boolean
  /** distribution of CEFR levels of the words (index 0 = unknown, 1..6 = A1..C2) */
  cefr?: number[]
  /** unique lemmas, used for difficulty / known-word stats */
  lemmas?: number
  /** date added (ISO) */
  added?: string
  /** id of the series this story is an episode of */
  series?: string
  /** episode number within the series (1-based) */
  episode?: number
}

/** A series: stories at one level that are read in order and tell one bigger story. */
export interface SeriesMeta {
  id: string
  title: string
  title_en?: string
  level: Level
  category: string
  summary?: string
  author?: string
  /** episode story ids, in reading order */
  episodes: string[]
  /** total words of all episodes */
  words: number
  /** date the newest episode was added (ISO) */
  added?: string
}

export interface StoryDoc {
  meta: StoryMeta
  keywords: Keyword[]
  chapters: Chapter[]
}

export interface LibraryIndex {
  built: string
  stories: StoryMeta[]
  series: SeriesMeta[]
  grammar: GrammarMeta[]
}

export interface GrammarMeta {
  id: string
  title: string
  title_nl?: string
  cefr?: string
  order?: number
  summary?: string
}
