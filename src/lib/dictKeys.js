// Shared between the dictionary build script (Node) and the app (browser).
// Plain JS so the build script can import it without a compile step.

/** Form index shards: word form → entry ids. */
export const F_BUCKETS = 512
/** Entry shards: entry id → entry. */
export const E_BUCKETS = 512
/** English index shards: English word → Dutch results. */
export const X_BUCKETS = 128

/** Lookup key for a Dutch word form: lowercase, NFC, typographic apostrophes straightened. */
export function normalizeKey(s) {
  return s.normalize('NFC').replace(/[‘’ʼ`´]/g, "'").toLowerCase().trim()
}

function fnv1a(str) {
  let h = 0x811c9dc5
  for (const ch of str) {
    h ^= ch.codePointAt(0)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h
}

export function bucketOf(key, buckets) {
  return fnv1a(key) % buckets
}

const STOP = new Set(
  'a an the of to in on at by for with from as or and be is are was were it its this that one ones sth someone something s etc e g i'.split(' '),
)

/** Index words of an English gloss. */
export function englishWords(gloss) {
  return gloss
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .split(/[^a-z0-9'-]+/)
    .map((w) => w.replace(/^['-]+|['-]+$/g, ''))
    .filter((w) => w.length > 1 && !STOP.has(w))
}

/**
 * Compact code for what a word form is, from Wiktionary's tags (merged over
 * all rows of the inflection table that give this form).
 */
export function formCode(tags, pos) {
  const t = new Set(tags)
  if (t.has('diminutive')) return t.has('plural') ? 'dimpl' : 'dim'
  if (pos === 'n' && t.has('plural')) return 'pl'
  if (t.has('participle')) return t.has('present') ? 'prp' : 'pp'
  if (t.has('infinitive')) return 'inf'
  if (t.has('past')) return t.has('plural') ? 'pstpl' : 'pst'
  if (t.has('present')) {
    if (t.has('first-person')) return '1s'
    if (t.has('second-person') || t.has('third-person')) return '23s'
    if (t.has('plural')) return 'prespl'
  }
  if (t.has('imperative')) return 'imp'
  const attributive = (t.has('definite') || t.has('plural') || t.has('masculine')) && !t.has('predicative') && !t.has('adverbial')
  if (t.has('comparative')) return attributive ? 'cmpe' : 'cmp'
  if (t.has('superlative')) return attributive ? 'supe' : 'sup'
  if (t.has('partitive')) return 'part'
  if (pos === 'adj' && attributive) return 'e'
  if (t.has('objective')) return 'obj'
  if (t.has('possessive')) return 'poss'
  if (t.has('genitive')) return 'gen'
  if (t.has('alternative') || t.has('alt-of') || t.has('unstressed') || t.has('stressed') || t.has('misspelling')) return 'alt'
  return 'form'
}

/** English label of a form code. */
export const FORM_LABELS = {
  '': '',
  pl: 'plural',
  dim: 'diminutive',
  dimpl: 'diminutive plural',
  pp: 'past participle',
  prp: 'present participle',
  inf: 'infinitive',
  pst: 'past tense',
  pstpl: 'past tense, plural',
  '1s': 'present tense (ik)',
  '23s': 'present tense (jij/hij/zij)',
  prespl: 'present tense, plural',
  imp: 'imperative',
  e: 'adjective ending -e',
  cmp: 'comparative',
  cmpe: 'comparative + -e',
  sup: 'superlative',
  supe: 'superlative + -e',
  part: 'partitive -s (iets moois)',
  obj: 'object form',
  poss: 'possessive',
  gen: 'genitive',
  alt: 'other form',
  form: 'inflected form',
}

/** CEFR level (1 = A1 … 6 = C2) from a lemma's frequency rank. */
export function levelOfRank(rank) {
  if (!rank) return 0
  if (rank <= 1200) return 1
  if (rank <= 3000) return 2
  if (rank <= 6000) return 3
  if (rank <= 12000) return 4
  if (rank <= 25000) return 5
  return 6
}

export const LEVEL_NAMES = ['', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2']
