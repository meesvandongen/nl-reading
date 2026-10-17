// Text → words pipeline used both at build time (library) and in the browser
// (pasted texts). Dutch is written with spaces, so finding the words is easy;
// the work is in what each word is:
//   - the dictionary form and what form this is (liep → lopen, past tense)
//   - which of several words with the same spelling is meant (was: zijn / laundry)
//   - separable verbs, whose parts are far apart (Ik bel je morgen op → opbellen)
//   - compounds the dictionary doesn't have (fietsenstalling → fiets + stalling)
//   - diminutives (kopje, huisjes), always het-words
//   - grammar worth linking to (perfect tense, passive, er, te + infinitive…)

import type { Lexicon, LemmaInfo } from './lexicon'
import type { RawChapter } from './text'
import type { Article, Chapter, CompoundPart, Pos, Sentence, Step, Term, Word } from './types'
import { normalizeKey } from './dictKeys.js'

export interface AnalyzeOptions {
  /** story-specific names and glosses (front matter `names:` / `glosses:`) */
  terms?: Term[]
}

// ---------------------------------------------------------------------------
// Tokens

interface Token {
  s: string
  kind: 'word' | 'num' | 'sym' | 'space'
  term?: Term
}

const WORD_RE =
  /['’](?:s|t|n|k)(?![\p{L}\p{M}])(?:-[\p{L}\p{M}]+)*|[\p{L}\p{M}]+(?:['’][\p{L}\p{M}]+)*(?:-[\p{L}\p{M}]+(?:['’][\p{L}\p{M}]+)*)*|\d+(?:[.,:]\d+)*(?:e|ste|de)?|\s+|[^\s]/gu

/** A pattern matching s in upper or lower case (no inline flags in older engines). */
function anyCase(s: string) {
  return Array.from(s)
    .map((c) => (c.toLowerCase() !== c.toUpperCase() ? `[${c.toLowerCase()}${c.toUpperCase()}]` : escapeRe(c)))
    .join('')
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function tokenize(text: string, terms: Term[] = []): Token[] {
  const out: Token[] = []
  const push = (chunk: string) => {
    for (const m of chunk.matchAll(WORD_RE)) {
      const s = m[0]
      out.push({
        s,
        kind: /^\s+$/.test(s) ? 'space' : /^\d/.test(s) ? 'num' : /[\p{L}]/u.test(s) ? 'word' : 'sym',
      })
    }
  }
  if (!terms.length) {
    push(text)
    return out
  }
  // story terms first, longest first, as whole words (Den Haag, Albert Heijn, 's-Hertogenbosch)
  // names also with a possessive s (Willems brief, Anna's fiets); glosses in any case (Amai!)
  const sorted = [...terms].sort((a, b) => b.s.length - a.s.length)
  const alt = sorted.map((t) => (t.name ? `${escapeRe(t.s)}(?:['’]s|s)?` : anyCase(t.s))).join('|')
  const re = new RegExp(`(?<![\\p{L}\\p{M}])(?:${alt})(?![\\p{L}\\p{M}])`, 'gu')
  const find = (s: string) => sorted.find((t) => (t.name ? s === t.s || s.replace(/['’]?s$/, '') === t.s : s.toLowerCase() === t.s.toLowerCase()))
  let last = 0
  for (const m of text.matchAll(re)) {
    if (m.index > last) push(text.slice(last, m.index))
    out.push({ s: m[0], kind: 'word', term: find(m[0]) })
    last = m.index + m[0].length
  }
  if (last < text.length) push(text.slice(last))
  return out
}

// ---------------------------------------------------------------------------
// Word lists

const ARTICLES = new Set(['de', 'het', 'een', "'t", "'n"])
const DETERMINERS = new Set([
  'deze', 'die', 'dit', 'dat', 'mijn', 'jouw', 'je', 'uw', 'zijn', 'haar', 'ons', 'onze', 'hun', 'jullie', 'elk', 'elke', 'ieder', 'iedere',
  'welk', 'welke', 'geen', 'veel', 'weinig', 'enkele', 'sommige', 'alle', 'beide', 'zo\'n', 'zulke', 'm\'n', 'z\'n', 'd\'r', 'menig',
])
const POSSESSIVES = new Set(['mijn', 'jouw', 'uw', 'zijn', 'haar', 'ons', 'onze', 'hun', "m'n", "z'n", "d'r"])
const DEMONSTRATIVES = new Set(['deze', 'die', 'dit', 'dat'])
const MODALS = new Set(['kunnen', 'moeten', 'willen', 'mogen', 'zullen'])
const HEBBEN = new Set(['heb', 'hebt', 'heeft', 'hebben', 'had', 'hadden', 'hebbende'])
const ZIJN = new Set(['ben', 'bent', 'is', 'zijn', 'was', 'waren', 'wees'])
const WORDEN = new Set(['word', 'wordt', 'worden', 'werd', 'werden'])
const SUBORDINATORS = new Set([
  'omdat', 'als', 'wanneer', 'toen', 'terwijl', 'voordat', 'nadat', 'hoewel', 'zodat', 'totdat', 'tot', 'sinds', 'zodra', 'indien',
  'doordat', 'opdat', 'aangezien', 'mits', 'tenzij', 'alsof', 'zoals', 'ofschoon', 'zolang', 'naarmate', 'nu',
])
const COORDINATORS = new Set(['en', 'maar', 'of', 'want', 'dus', 'noch', 'doch'])
const RELATIVES = new Set(['die', 'dat', 'wat', 'waar', 'wie', 'welke'])
const MODAL_PARTICLES_STRONG = new Set(['even', 'toch', 'hè', 'eens', 'nou', 'hoor', 'joh'])
const QUESTION_WORDS = new Set(['wie', 'wat', 'waar', 'wanneer', 'hoe', 'waarom', 'welk', 'welke', 'hoeveel', 'waarheen', 'waarvandaan'])
const REFLEXIVES = new Set(['zich', 'zichzelf'])
const NOT_PRONOMINAL = new Set(['daarna', 'daarom', 'waarom', 'hierna', 'daarnaast', 'waarna'])
const PRONOMINAL = /^(er|daar|waar|hier)(aan|achter|bij|binnen|boven|buiten|door|heen|in|langs|mee|na|naar|naast|om|onder|op|over|rond|tegen|toe|tussen|uit|van|vandaan|voor|zonder)$/
/** Prefixes that can be split off a verb. Only split when the dictionary has particle + verb as a separable verb. */
const PARTICLES = new Set([
  'aan', 'af', 'achter', 'achterna', 'bij', 'binnen', 'buiten', 'dicht', 'door', 'heen', 'in', 'kapot', 'klaar', 'langs', 'los', 'mee', 'mis',
  'na', 'neer', 'om', 'onder', 'op', 'open', 'over', 'rond', 'samen', 'schoon', 'stil', 'tegen', 'terecht', 'terug', 'thuis', 'toe', 'tussen',
  'uit', 'vast', 'voor', 'voorbij', 'vooruit', 'vrij', 'weg', 'weer', 'plaats', 'deel', 'kennis', 'goed', 'bekend', 'teleur', 'gade',
  'tegemoet', 'uiteen', 'voort', 'over', 'lief', 'adem', 'prijs', 'bloot', 'hard', 'fijn', 'gelijk', 'groot', 'leeg', 'mooi', 'na', 'nat',
  'rood', 'stuk', 'vol', 'warm', 'wakker', 'zwart', 'bijeen', 'omver', 'overeen', 'rondom', 'teweeg', 'vandaan', 'achteruit', 'boven',
])
const SUBJECT_PRONOUNS = new Set(['ik', 'jij', 'je', 'u', 'hij', 'zij', 'ze', 'het', 'wij', 'we', 'jullie', 'men'])
const OBJECT_PRONOUNS = new Set(['hem', 'hen', 'mij', 'me', 'jou', 'ons', 'zich'])
/** Nouns that share their spelling with a rare verb form (maart: maren, week: wijken). */
const ALWAYS_NOUNS = new Set([
  'januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december',
  'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag', 'zondag', 'week', 'weken', 'lente', 'zomer', 'herfst', 'winter',
  'moeder', 'vader', 'water', 'tranen', 'namen', 'kist', 'meter', 'deken', 'lach',
])
const COPULAS = new Set(['ben', 'bent', 'is', 'zijn', 'was', 'waren', 'word', 'wordt', 'worden', 'werd', 'werden', 'blijf', 'blijft', 'blijven', 'bleef', 'bleven', 'lijkt', 'leek'])
const DEGREE = new Set(['heel', 'erg', 'zeer', 'te', 'zo', 'nogal', 'vrij', 'best', 'echt', 'super', 'hartstikke', 'ontzettend', 'enorm', 'behoorlijk', 'redelijk', 'helemaal', 'minder', 'meer', 'even', 'net', 'iets'])
const QUANTIFIERS = new Set(['paar', 'aantal', 'boel', 'hoop', 'stel', 'stuk', 'heleboel'])
/** The full pronoun a short form stands for (ze → zij), when the dictionary lists the short form under several. */
const PRONOUN_LEMMA: Record<string, string> = { ze: 'zij', we: 'wij', je: 'jij', me: 'mij', "'m": 'hem', "m'n": 'mijn', "z'n": 'zijn', "d'r": 'haar' }
/** Better hints for function words than the dictionary's first gloss. */
const FUNCTION_HINTS: Record<string, string> = {
  ik: 'I', jij: 'you', je: 'you', u: 'you (polite)', hij: 'he', zij: 'she; they', ze: 'she; they; her; them', wij: 'we', we: 'we',
  jullie: 'you (plural)', hem: 'him', haar: 'her', hen: 'them', hun: 'them; their', mij: 'me', me: 'me; myself', ons: 'us; our',
  zich: 'himself, herself, themselves', zichzelf: 'himself, herself, themselves', men: 'one, people', er: 'there', daar: 'there',
  hier: 'here', het: 'it', "'t": 'it; the', "'n": 'a', "m'n": 'my', "z'n": 'his', "d'r": 'her; there', wat: 'what; something',
  die: 'that, those; who, which', dat: 'that; which', deze: 'this, these', dit: 'this', een: 'a, an', de: 'the', geen: 'no, not a',
  niet: 'not', wel: 'indeed, (but) yes; well', toch: 'still, yet; surely', even: 'just, for a moment', maar: 'but; just', eens: 'once; just',
  nou: 'well, now', hè: "eh?, isn't it?", hoor: '(emphasis: really, you know)', gewoon: 'just, simply; normal', zo: 'so, like this; soon',
  al: 'already', nog: 'still, yet; more', ook: 'also, too', dan: 'then; than', als: 'if, when; as, like', of: 'or; whether', om: 'around; to (om … te)',
}
/** Better hints for common adjectives and adverbs whose first dictionary sense isn't the usual one. */
const CONTENT_HINTS: Record<string, string> = {
  hoe: 'how', toen: 'when (in the past); then', steeds: 'always; increasingly (steeds meer)', heel: 'very; whole', lang: 'long',
  natuurlijk: 'of course; natural', gelukkig: 'luckily; happy', alleen: 'only; alone', eigenlijk: 'actually', echt: 'really; real',
  één: 'one', elf: 'eleven', vier: 'four', meteen: 'immediately', zelfs: 'even', ineens: 'suddenly', opeens: 'suddenly', toch: 'still, anyway; surely',
}
const MODAL_PARTICLE_WORDS = new Set(['even', 'maar', 'toch', 'wel', 'eens', 'nou', 'hè', 'hoor', 'gewoon'])

/** Second halves of circumpositions and the prepositions they go with. */
// (not "van … af" or "op … af": "sneden een stuk van het doek af" is afsnijden, "kwam op me af" afkomen)
const CIRCUMPOSITIONS: Record<string, string[]> = {
  aan: ['achter', 'tegen', 'tot'],
  toe: ['naar', 'tot'],
  heen: ['om', 'door', 'naar', 'over'],
  langs: ['achter'],
}
/** Prepositions that combine with er/daar/waar/hier (erop, daarvoor). */
const R_PREPOSITIONS = new Set(['op', 'aan', 'in', 'uit', 'over', 'mee', 'voor', 'door', 'af', 'toe', 'van', 'bij', 'tegen', 'achter', 'om', 'onder', 'naast', 'langs', 'tussen', 'na'])
/** Verb forms that can be the finite verb of a main clause. */
const FINITE = new Set(['', '1s', '23s', 'prespl', 'pst', 'pstpl', 'imp'])

const POS_MAP: Record<string, Pos> = {
  n: 'n', v: 'v', adj: 'adj', adv: 'adv', pron: 'pron', prep: 'prep', conj: 'conj', det: 'det', art: 'art', num: 'num', intj: 'intj', name: 'name',
}

// ---------------------------------------------------------------------------
// Candidates

interface Cand {
  lemma: LemmaInfo
  code: string
  /** position in the dictionary's ranking for this form (0 = most likely) */
  rank: number
}

function candidates(lex: Lexicon, key: string): Cand[] {
  const out: Cand[] = []
  const contractions: Cand[] = []
  lex.forms(key).forEach(([id, code], rank) => {
    const lemma = lex.lemma(id)
    if (!lemma) return
    // phrases and affixes are never what a single word in a text is; contractions (ten, ter) only as a last resort
    if (lemma.p === 'contr') contractions.push({ lemma, code, rank })
    else if (!['phrase', 'prefix', 'suffix'].includes(lemma.p)) out.push({ lemma, code, rank })
  })
  return out.length ? out : contractions
}

const ACCENTS: Record<string, string> = { á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u', à: 'a', è: 'e' }

/**
 * Forms the dictionary doesn't list, derived from ones it does:
 *   - emphasis accents: wél, dát, vóór (but één is a word of its own)
 *   - adjectives and participles with -e or -en: gescheurde, ingelijste, de laatsten
 *   - participles and joined forms of separable verbs: doodgebeten, opgeslokt
 *   - diminutives: blokjes, groepjes, appeltje
 */
function derived(lex: Lexicon, key: string): Cand[] {
  if (/[áéíóúàè]/.test(key)) {
    if (key === 'eén') return candidates(lex, 'één')
    const plain = key.replace(/[áéíóúàè]/g, (c) => ACCENTS[c])
    const c = candidates(lex, plain)
    if (c.length) return c
  }
  const inflected = inflectedAdjective(lex, key)
  if (inflected.length) return inflected
  for (const particle of PARTICLES) {
    if (!key.startsWith(particle) || key.length < particle.length + 3) continue
    const rest = key.slice(particle.length)
    const restCands = candidates(lex, rest)
    for (const c of restCands.length ? restCands : inflectedAdjective(lex, rest)) {
      if (c.lemma.p !== 'v') continue
      const sep = candidates(lex, particle + c.lemma.w).find((x) => x.code === '' && x.lemma.p === 'v' && x.lemma.sep === particle)
      if (sep) return [{ ...sep, code: c.code }]
    }
  }
  return diminutive(lex, key)
}

/** Adjectives and participles with -e, -en or -s: gescheurde, de laatsten, iets moois, klapperende. */
function inflectedAdjective(lex: Lexicon, key: string): Cand[] {
  for (const [ending, code] of [['e', 'e'], ['en', 'e'], ['s', 'part']] as const) {
    if (!key.endsWith(ending) || key.length < ending.length + 3) continue
    const stem = key.slice(0, -ending.length)
    const hits = candidates(lex, stem).filter((c) => (c.lemma.p === 'adj' && ['', 'cmp', 'sup'].includes(c.code)) || (c.lemma.p === 'v' && (c.code === 'pp' || c.code === 'prp')))
    if (hits.length) return hits.map((c) => ({ ...c, code: c.lemma.p === 'v' ? c.code : c.code === '' ? code : c.code === 'cmp' ? 'cmpe' : 'supe' }))
  }
  // present participles: klapperend(e) → klapperen
  const prp = /^(.{3,})end(e|en)?$/.exec(key)
  if (prp) {
    const hits = candidates(lex, prp[1] + 'en').filter((c) => c.lemma.p === 'v' && c.code === '')
    if (hits.length) return hits.map((c) => ({ ...c, code: 'prp' }))
  }
  return []
}

const isNounish = (c: Cand | undefined) => !!c && (c.lemma.p === 'n' || (c.lemma.p === 'adj' && c.code !== 'cmp' && c.code !== 'sup'))

/** A diminutive the dictionary doesn't list (huisjes, appeltje): base noun + -je. */
function diminutive(lex: Lexicon, key: string): Cand[] {
  const plural = key.endsWith('jes')
  const word = plural ? key.slice(0, -1) : key
  if (!word.endsWith('je')) return []
  for (const suffix of ['etje', 'tje', 'pje', 'kje', 'je']) {
    if (!word.endsWith(suffix)) continue
    const stem = word.slice(0, -suffix.length)
    if (stem.length < 2) continue
    const tries = [stem]
    if (suffix === 'etje') tries.push(stem.replace(/(.)\1$/, '$1')) // balletje → bal
    if (suffix === 'tje' && /([aeiou])\1$/.test(stem)) tries.push(stem.slice(0, -1)) // autootje → auto
    for (const t of tries) {
      const hits = candidates(lex, t).filter((c) => c.lemma.p === 'n' && c.code === '')
      if (hits.length) return hits.map((c) => ({ ...c, code: plural ? 'dimpl' : 'dim' }))
    }
  }
  return []
}

interface Split {
  parts: { s: string; c: Cand }[]
  score: number
}

/** Can this piece stand at the start of a compound? (a noun, verb stem, adjective, number…) */
function firstPart(lex: Lexicon, s: string): Cand | undefined {
  if (s.length < 3 && !['ei', 'ui'].includes(s) && !PARTICLES.has(s)) return undefined
  const cands = candidates(lex, s).filter((c) => ['n', 'v', 'adj', 'num', 'adv', 'prep'].includes(c.lemma.p) && ['', 'pl', '1s'].includes(c.code))
  return cands.find((c) => c.lemma.p === 'n') ?? cands[0]
}

/** Cut an unknown word into dictionary words: fietsenstalling → fietsen + stalling, dorpsplein → dorp + s + plein. */
function splitCompound(lex: Lexicon, key: string, depth = 0): Split | undefined {
  if (depth > 2 || key.length < 6) return undefined
  let best: Split | undefined
  for (let i = key.length - 3; i >= 3; i--) {
    const head = key.slice(0, i)
    const tail = key.slice(i)
    // the linking -s- (dorpsplein), -e- (paddestoel) and -ne- (zonnehoed) belong to the first part
    const stems: [string, string][] = [[head, ''], [head.slice(0, -1), head.slice(-1)]]
    if (/([bdfgklmnprst])\1e$/.test(head)) stems.push([head.slice(0, -2), head.slice(-2)])
    for (const [stem, link] of stems) {
      if (link && link !== 's' && link !== 'e' && !/^[a-z]e$/.test(link)) continue
      const first = firstPart(lex, stem)
      if (!first) continue
      const direct = candidates(lex, tail)
      const lastCands = (direct.length ? direct : inflectedAdjective(lex, tail).concat(diminutive(lex, tail))).filter((c) => ['n', 'v', 'adj'].includes(c.lemma.p))
      let parts: Split['parts'] | undefined
      if (lastCands.length && tail.length >= 3) {
        parts = [{ s: head, c: first }, { s: tail, c: lastCands.find((c) => c.lemma.p === 'n') ?? lastCands[0] }]
      } else {
        const rest = splitCompound(lex, tail, depth + 1)
        if (rest) parts = [{ s: head, c: first }, ...rest.parts]
      }
      if (!parts) continue
      // fewer parts, frequent words and long pieces are more likely
      const score = parts.length * 10 + parts.reduce((n, p) => n + (p.c.lemma.l ?? 7) + (p.s.length < 4 ? 3 : 0), 0) + (link ? 1 : 0)
      if (!best || score < best.score) best = { parts, score }
    }
  }
  return best
}

// ---------------------------------------------------------------------------
// Choosing between candidates in context

interface Slot {
  tok: Token
  /** punctuation between the previous word and this one */
  punct: boolean
  /** first word of a sentence */
  start: boolean
  /** a number follows directly (in 1932) */
  beforeNum?: boolean
  /** index in the word list */
  wi: number
  key: string
  cands: Cand[]
  chosen?: Cand
  word: Word
}

function isCapitalized(s: string) {
  return /^\p{Lu}/u.test(s) && !/^\p{Lu}+$/u.test(s.replace(/[^\p{L}]/gu, '')) || /^\p{Lu}$/u.test(s)
}

function choose(slots: Slot[], i: number, sentenceStart: boolean): Cand | undefined {
  const slot = slots[i]
  const { cands, key } = slot
  if (!cands.length) return undefined
  if (cands.length === 1) return cands[0]
  const prev = slots[i - 1]
  const prevKey = prev?.key
  const next = slots[i + 1]
  const nextTop = next?.cands.find((c) => c.lemma.p !== 'name') ?? next?.cands[0]
  const capital = isCapitalized(slot.tok.s) && !sentenceStart
  const joined = !!prev && !slot.punct
  const afterDet =
    joined &&
    !ARTICLES.has(key) &&
    !DETERMINERS.has(key) &&
    // "het" is an article only before a word that is most likely a noun or adjective (het huis, not het was)
    (((prevKey === 'het' || prevKey === "'t") && isNounish(cands[0])) ||
      (ARTICLES.has(prevKey!) && prevKey !== 'het' && prevKey !== "'t") ||
      (DETERMINERS.has(prevKey!) && prev.chosen?.lemma.p === 'det') ||
      (prev.chosen?.lemma.p === 'adj' && prev.chosen.code === 'e') ||
      prev.chosen?.lemma.p === 'num' ||
      prev.tok.kind === 'num' ||
      QUANTIFIERS.has(prevKey!))
  const prevClauseStart = !!prev && (prev.start || prev.punct)
  const nextJoined = !!next && !next.punct
  const nextTopJoined = nextJoined ? nextTop : undefined
  const hasNoun = cands.some((c) => c.lemma.p === 'n')
  const nextIsSubject = nextJoined && SUBJECT_PRONOUNS.has(next.key) && next.key !== 'het'
  const score = (c: Cand) => {
    let s = c.rank * 3
    const p = c.lemma.p
    // rare words are rarely what is meant (jijen, hen "bird", maren, wateren)
    s += ((c.lemma.l ?? 7) - 1) * 1.2
    // subject pronouns are pronouns (Zij, Jij at the start of a sentence)
    if ((SUBJECT_PRONOUNS.has(key) || OBJECT_PRONOUNS.has(key)) && key !== 'je' && key !== 'het' && p === 'pron') s -= 6
    if ((key === 'hoe' || key === 'daar' || key === 'hier') && p === 'adv') s -= 6
    if (ALWAYS_NOUNS.has(key) && p === 'n') s -= 14
    // the article agrees with the noun: "de koper" is the buyer, "het koper" copper
    if (p === 'n' && joined && c.code === '' && ((prevKey === 'de' && c.lemma.g === 'het') || ((prevKey === 'het' || prevKey === 'dit') && c.lemma.g === 'de'))) s += 6
    // "zijn" after a noun is the verb (Bedrijven zijn blij)
    if (key === 'zijn' && p === 'v' && joined && ['n', 'name'].includes(prev.chosen?.lemma.p ?? '')) s -= 8
    // a verb before its subject (geloof ik, Hoe heet je, Bij ons heet hij)
    if (nextIsSubject && p === 'v' && FINITE.has(c.code)) s -= 6
    // second place in the clause, after a question word or adverb: the finite verb (Hoe heet …)
    if (joined && prevClauseStart && (QUESTION_WORDS.has(prevKey!) || prev.chosen?.lemma.p === 'adv') && p === 'v' && FINITE.has(c.code)) s -= 4
    // a bare singular noun without an article is rare; a verb form of the same spelling more likely (zit, weet, wacht)
    if (!afterDet && p === 'n' && c.code === '' && !capital && cands.some((x) => x.lemma.p === 'v' && FINITE.has(x.code) && x.code !== '')) s += 3
    // imperative-only forms (zij, wees) are rarely what is meant
    if (p === 'v' && c.code === 'imp') s += 6
    // short pronoun forms: the dictionary lists "ze" under both zij and haar
    if (c.code === 'alt') s += PRONOUN_LEMMA[key] === c.lemma.w ? -6 : 4
    // after a subject pronoun at the start of a clause: a verb (ik bel, zij loopt)
    if (joined && prevClauseStart && SUBJECT_PRONOUNS.has(prevKey!) && prev.chosen?.lemma.p === 'pron' && p === 'v' && FINITE.has(c.code)) s -= 7
    // the word itself rather than a form of another word, for little words (er, eens, daarna)
    if (c.code === '' && ['adv', 'pron', 'det', 'prep', 'conj', 'art', 'num', 'intj'].includes(p) && !cands.some((x) => x.lemma.p === 'v')) s -= 3
    // vague or rare kinds of forms
    if (c.code === 'form' || c.code === 'part') s += cands.some((x) => x.code === '') ? 9 : 5
    if (c.code === 'gen') s += 3
    // after heel, erg, te…: an adjective (een heel duur slot)
    if (joined && DEGREE.has(prevKey!)) {
      if (p === 'adj' || p === 'adv') s -= 4
      if (p === 'v' && FINITE.has(c.code)) s += 4
    }
    if (key === 'een' && p === 'art') s -= nextJoined ? 10 : 2
    if (p === 'num') s -= key === 'een' ? 2 : 6
    // after a preposition: a noun or pronoun, not a finite verb
    if (joined && prev.chosen?.lemma.p === 'prep') {
      if (p === 'v' && FINITE.has(c.code) && c.code !== '') s += 5
      if (p === 'n' || p === 'pron') s -= 2
    }
    // after a copula: an adjective (het is druk)
    if (joined && COPULAS.has(prevKey!) && p === 'adj') s -= 4
    // "dat" after a verb starts a clause (ik denk dat …)
    if (key === 'dat' && p === 'conj' && joined && prev.chosen?.lemma.p === 'v' && !isNounish(nextTopJoined)) s -= 6
    // "aan het spelen": the infinitive, not the noun
    if (prevKey === 'het' && slots[i - 2]?.key === 'aan' && p === 'v' && (c.code === '' || c.code === 'inf')) s -= 12
    // a common noun that happens to look like a diminutive or plural of another word (meisje)
    if (p === 'n' && c.code === '' && (c.lemma.l ?? 9) <= 2 && cands.some((x) => x.lemma.p === 'n' && ['dim', 'dimpl', 'pl'].includes(x.code))) s -= 4
    // a verb after a noun (de koffie staat), and an imperative or question verb at the start (Kom binnen!)
    if (p === 'v' && FINITE.has(c.code) && ((joined && ['n', 'name'].includes(prev.chosen?.lemma.p ?? '')) || (slot.start && ['1s', 'imp', '23s'].includes(c.code)))) s -= 5
    // object "me" and possessive "mijn"
    if (key === 'me' && p === 'det' && !isNounish(nextTopJoined)) s += 8
    if (key === 'mijn' && p === 'det' && !afterDet) s -= 8
    // without an article, an adverb reading usually wins (morgen = tomorrow, weg = away)
    if (!afterDet && p === 'adv' && hasNoun) s -= 4
    // preposition before a noun phrase, adverb at the end of a clause
    if (!ARTICLES.has(key) && cands.some((x) => x.lemma.p === 'prep')) {
      const np =
        slot.beforeNum ||
        (nextJoined && (ARTICLES.has(next.key) || DETERMINERS.has(next.key) || isCapitalized(next.tok.s) || !next.cands.length)) ||
        (nextTopJoined && ['art', 'det', 'n', 'name', 'pron', 'num', 'adj'].includes(nextTopJoined.lemma.p))
      if (p === 'prep') s += np ? -5 : 3
      else if (p === 'adv' && !np) s -= 3
    }
    if (key === 'al' && p === 'adv' && !(nextTopJoined && ['art', 'det'].includes(nextTopJoined.lemma.p))) s -= 6
    if (key === 'maar' && p === 'conj') s += slot.punct || i === 0 ? -8 : 6
    if (['en', 'of', 'dus'].includes(key) && p === 'conj') s -= 4
    if (key === 'als' && p === 'conj') s -= 4
    if (key === 'want' && p === 'conj') s -= slot.punct || nextJoined ? 10 : 4
    // nouns don't come in possessive forms (me is not "mine")
    if (p === 'n' && c.code === 'poss') s += 10
    if (p === 'name') s += capital ? -8 : sentenceStart ? 6 : 25
    if (afterDet) {
      if (p === 'n') s -= 6
      else if (p === 'adj') s -= 3
      else if (p === 'v') s += c.code === 'pp' || c.code === 'prp' ? 2 : 8
      else if (p === 'pron' || p === 'prep' || p === 'conj') s += 6
    }
    if (prevKey === 'te' && p === 'v' && (c.code === '' || c.code === 'inf')) s -= 8
    // possessives before a noun (mijn fiets, not "mine"), zijn/haar/je otherwise a verb or pronoun
    if (POSSESSIVES.has(key) && key !== 'zijn' && key !== 'haar' && (p === 'det' || p === 'pron') && isNounish(nextTopJoined)) s -= 4
    if ((key === 'zijn' || key === 'haar' || key === 'je') && !afterDet) {
      // (not before a word that can be an adverb: "Ik bel je morgen op")
      // (not right after a subject: "Zij zijn moe")
      const afterSubject = joined && prevClauseStart && SUBJECT_PRONOUNS.has(prevKey!)
      const possessive =
        nextJoined &&
        !afterSubject &&
        !ARTICLES.has(next.key) &&
        !DETERMINERS.has(next.key) &&
        // a noun next, or an inflected adjective (zijn mooie huis)
        next.cands.some((x) => x.lemma.p === 'n' || (x.lemma.p === 'adj' && x.code === 'e')) &&
        !next.cands.some((x) => x.lemma.p === 'adv')
      if (p === 'det') s += possessive ? -10 : 4
      if (key === 'je' && p === 'det') s += 3
      if (key === 'zijn' && p === 'v') s += possessive ? 6 : -4
      if (key === 'haar' && p === 'n') s += 8
    }
    // determiner before a noun (die man), pronoun otherwise (die is mooi)
    if (DEMONSTRATIVES.has(key) && (p === 'det' || p === 'pron' || p === 'conj')) {
      if (isNounish(nextTop)) s += p === 'det' ? -4 : 2
      else if (p === 'det') s += 5
    }
    if (key === 'een' && p === 'num' && isNounish(nextTop)) s += 5
    // an adjective right before a noun
    if (p === 'adj' && nextTop?.lemma.p === 'n') s -= 2
    return s
  }
  return [...cands].sort((a, b) => score(a) - score(b))[0]
}

// ---------------------------------------------------------------------------
// Building words

function stepsFor(c: Cand): Step[] {
  const strong = !!c.lemma.k
  switch (c.code) {
    case 'pl':
      return [{ l: 'plural', g: 'plural' }]
    case 'dim':
      return [{ l: 'diminutive (always het)', g: 'diminutives' }]
    case 'dimpl':
      return [{ l: 'diminutive (always het)', g: 'diminutives' }, { l: 'plural', g: 'plural' }]
    case 'pp':
      return [{ l: 'past participle', g: 'past-participle' }, ...(strong ? [{ l: 'strong / irregular verb', g: 'strong-verbs' }] : [])]
    case 'pst':
      return strong ? [{ l: 'past tense (strong / irregular verb)', g: 'strong-verbs' }] : [{ l: 'past tense', g: 'simple-past-weak' }]
    case 'pstpl':
      return strong
        ? [{ l: 'past tense, plural (strong / irregular verb)', g: 'strong-verbs' }]
        : [{ l: 'past tense, plural', g: 'simple-past-weak' }]
    case '1s':
      return [{ l: 'present tense (ik; also jij when it comes after the verb)', g: 'present-tense' }]
    case '23s':
      return [{ l: 'present tense (jij, u, hij, zij, het)', g: 'present-tense' }]
    case 'prespl':
      return [{ l: 'present tense, plural', g: 'present-tense' }]
    case 'imp':
      return [{ l: 'imperative', g: 'imperative' }]
    case 'prp':
      return [{ l: 'present participle (-end)' }]
    case 'e':
      return [{ l: 'adjective + -e', g: 'adjectives' }]
    case 'cmp':
      return [{ l: 'comparative (-er)', g: 'comparatives' }]
    case 'cmpe':
      return [{ l: 'comparative (-er) + -e', g: 'comparatives' }]
    case 'sup':
      return [{ l: 'superlative (-st)', g: 'comparatives' }]
    case 'supe':
      return [{ l: 'superlative (-st) + -e', g: 'comparatives' }]
    case 'part':
      return [{ l: 'partitive -s (iets moois)', g: 'adjectives' }]
    case 'obj':
      return [{ l: 'object form', g: 'personal-pronouns' }]
    case 'alt':
      return [{ l: 'other spelling or form' }]
    default:
      return []
  }
}

function applyCand(w: Word, c: Cand, surface: string) {
  const lemma = c.lemma
  w.p = POS_MAP[lemma.p] ?? 'x'
  if (normalizeKey(lemma.w) !== normalizeKey(surface)) w.b = lemma.w
  w.e = lemma.i
  // short pronoun forms are just that pronoun (ze → zij): no breakdown needed
  if (c.code === 'alt' && lemma.p === 'pron') {
    w.b = lemma.w
  } else if (c.code && c.code !== 'form') w.c = c.code
  const article: Article | undefined = c.code === 'dim' || c.code === 'dimpl' ? 'het' : lemma.p === 'n' ? lemma.g : undefined
  if (article) w.a = article
  if (lemma.l) w.l = lemma.l
  if (lemma.h) w.h = lemma.h
  const key = normalizeKey(surface)
  if (FUNCTION_HINTS[key] && ['pron', 'det', 'art', 'adv', 'conj', 'prep'].includes(lemma.p)) w.h = FUNCTION_HINTS[key]
  if (CONTENT_HINTS[key] && ['adj', 'adv', 'num', 'conj'].includes(lemma.p)) w.h = CONTENT_HINTS[key]
  // possessive "je" is listed under jullie, but means "your" (jouw)
  if (key === 'je' && lemma.p === 'det') {
    w.h = 'your'
    w.b = 'jouw'
  }
  // little words are all common, whatever their share of a frequency list says
  if (['pron', 'det', 'art', 'prep', 'conj'].includes(lemma.p) && (w.l ?? 1) > 2) w.l = 2
  if ((key === 'die' || key === 'dat' || key === 'deze' || key === 'dit') && lemma.p === 'det') w.h = key === 'die' || key === 'dat' ? 'that, those' : 'this, these'
  const steps = stepsFor(c)
  if (steps.length) w.f = steps
}

function addTag(w: Word, id: string) {
  if (!w.t) w.t = []
  if (!w.t.includes(id)) w.t.push(id)
}

/** Grammar articles for function words, independent of context. */
const WORD_TAGS: Record<string, string> = {
  geen: 'negation',
  niet: 'negation',
  er: 'er',
  zou: 'conditional',
  zouden: 'conditional',
  zich: 'reflexive-verbs',
  zichzelf: 'reflexive-verbs',
  want: 'conjunctions',
  dus: 'conjunctions',
  u: 'formal-informal',
  uw: 'formal-informal',
}

function analyzeTokens(lex: Lexicon, tokens: Token[]): Word[] {
  const words: Word[] = []
  const slots: Slot[] = []
  let sentenceStart = true
  for (const tok of tokens) {
    if (tok.kind === 'space') {
      const last = words[words.length - 1]
      if (last) last.ws = (last.ws ?? '') + tok.s
      continue
    }
    const w: Word = { s: tok.s, p: tok.kind === 'num' ? 'num' : tok.kind === 'sym' ? 'sym' : 'x' }
    words.push(w)
    if (tok.kind !== 'word') {
      // a sentence (or a quoted one) starts after . ! ? : … and after an opening quote
      if (/[.!?:…]/.test(tok.s) || (/["“„'‘(]/.test(tok.s) && (words.length < 2 || !!words[words.length - 2]?.ws || /[.!?:,…]/.test(words[words.length - 2]?.s ?? '')))) sentenceStart = true
      continue
    }
    const key = normalizeKey(tok.s)
    const prevSlot = slots[slots.length - 1]
    const punct = !prevSlot || words.slice(prevSlot.wi + 1, -1).some((x) => x.p === 'sym')
    const slot: Slot = { tok, wi: words.length - 1, key, cands: [], word: w, punct, start: sentenceStart }
    if (!tok.term) {
      slot.cands = candidates(lex, key)
      // "'s Ochtends", "'t": shortened forms
      if (!slot.cands.length && key === "'t") slot.cands = candidates(lex, 'het')
      if (!slot.cands.length && key === "'n") slot.cands = candidates(lex, 'een')
      if (!slot.cands.length) slot.cands = derived(lex, key)
    }
    slots.push(slot)
    // "'t Kon minder", "'s Morgens": the word after a shortened article still starts the sentence
    sentenceStart = sentenceStart && ["'t", "'s", "'n"].includes(key)
  }

  for (const slot of slots) if (words[slot.wi + 1]?.p === 'num') slot.beforeNum = true
  // choose readings left to right (the previous choice informs the next), then once
  // more now that the following words have a reading too
  slots.forEach((slot, i) => {
    if (!slot.tok.term) slot.chosen = choose(slots, i, slot.start)
  })
  slots.forEach((slot, i) => {
    const w = slot.word
    const start = slot.start
    if (slot.tok.term) {
      w.m = slot.tok.term.m
      w.p = slot.tok.term.name ? 'name' : 'x'
      // a gloss for an ordinary word keeps what the dictionary knows about it
      if (!slot.tok.term.name) {
        const c = candidates(lex, slot.key)[0]
        if (c) applyCand(w, c, slot.tok.s)
        w.m = slot.tok.term.m
      }
      return
    }
    const capital = isCapitalized(slot.tok.s) && !start
    // a capitalized word in mid-sentence that the dictionary only knows as a common
    // word is still most likely a name (Bas, Roos, Mark)… unless the dictionary has it
    // capitalized too: names, peoples and languages (Duitsers, Engelse, Latijn, God)
    if (capital) {
      const proper = slot.cands.filter((c) => c.lemma.p === 'name' || isCapitalized(c.lemma.w))
      if (!proper.length && !slot.key.includes('-')) {
        w.p = 'name'
        return
      }
      slot.cands = proper
    }
    slot.chosen = choose(slots, i, start)
    if (slot.chosen) {
      applyCand(w, slot.chosen, slot.tok.s)
      // "het" before a noun is the article; the dictionary lists it under "de"
      if (slot.key === 'het' || slot.key === "'t") {
        const nextTop = slots[i + 1]?.cands[0]
        if (slot.chosen.lemma.w === 'de' || (isNounish(nextTop) && slots[i + 1]?.wi === slot.wi + 1)) {
          w.p = 'art'
          delete w.b
          delete w.c
          delete w.f
          w.h = 'the (with het-words)'
        }
      }
      return
    }
    // not in the dictionary: a compound?
    const split = splitCompound(lex, slot.key)
    if (split) {
      const head = split.parts[split.parts.length - 1].c
      applyCand(w, head, slot.tok.s)
      w.b = split.parts.slice(0, -1).map((p) => p.s).join('') + head.lemma.w
      if (normalizeKey(w.b) === slot.key) delete w.b
      w.cp = split.parts.map((p): CompoundPart => ({ s: p.s, b: p.c.lemma.w, e: p.c.lemma.i, ...(p.c.lemma.h ? { h: p.c.lemma.h } : {}) }))
      w.h = split.parts.map((p) => p.c.lemma.h || p.c.lemma.w).join(' + ')
      w.l = Math.max(...split.parts.map((p) => p.c.lemma.l ?? 6))
      w.f = [{ l: `compound: ${split.parts.map((p) => p.s).join(' + ')} (de/het of the last part)` }, ...(w.f ?? [])]
      return
    }
    // a hyphenated word: Noord-Holland, e-mailadres
    if (slot.key.includes('-')) {
      const parts = slot.key.split('-')
      const found = parts.map((p) => candidates(lex, p)[0])
      if (found.every(Boolean)) {
        const head = found[found.length - 1]!
        applyCand(w, head, slot.tok.s)
        w.b = slot.key
        w.cp = parts.map((p, j): CompoundPart => ({ s: p, b: found[j]!.lemma.w, e: found[j]!.lemma.i, ...(found[j]!.lemma.h ? { h: found[j]!.lemma.h } : {}) }))
        w.h = found.map((c) => c!.lemma.h || c!.lemma.w).join(' + ')
        return
      }
    }
    if (isCapitalized(slot.tok.s)) w.p = 'name'
  })

  // "een beschermde diersoort": a participle with -e looks like a past tense
  slots.forEach((slot, i) => {
    const c = slot.chosen
    const prev = slots[i - 1]?.word
    const next = slots[i + 1]?.word
    if (c?.lemma.p === 'v' && c.code === 'pst' && /[dt]e$/.test(slot.key) && prev && ['art', 'det', 'adj'].includes(prev.p) && next?.p === 'n') {
      slot.word.p = 'adj'
      slot.word.c = 'e'
      slot.word.f = [{ l: 'past participle used as an adjective (+ -e)', g: 'adjectives' }]
    }
  })
  linkExpressions(lex, slots)
  linkGrammar(lex, slots, words)
  return words
}

/** Fixed expressions of two or three words that the dictionary has as one entry: ten slotte, op tijd, in ieder geval. */
function linkExpressions(lex: Lexicon, slots: Slot[]) {
  for (let i = 0; i < slots.length; i++) {
    for (const n of [3, 2]) {
      const group = slots.slice(i, i + n)
      if (group.length < n || group.slice(1).some((s) => s.punct) || group.some((s) => s.tok.term)) continue
      const key = group.map((s) => s.key).join(' ')
      const hit = candidatesAny(lex, key).find((c) => c.code === '' && ['phrase', 'adv', 'prep', 'conj', 'intj'].includes(c.lemma.p))
      if (!hit) continue
      for (const s of group) {
        s.word.x = { b: hit.lemma.w, e: hit.lemma.i, ...(hit.lemma.h ? { h: hit.lemma.h } : {}) }
        // a word that only exists in the expression (slotte, 's in 's nachts) shows the expression
        if (!s.word.e || s.key === "'s" || hit.lemma.w.startsWith("'s")) {
          delete s.word.a
          delete s.word.c
          delete s.word.f
          s.word.e = hit.lemma.i
          s.word.b = hit.lemma.w
          if (hit.lemma.h) s.word.h = hit.lemma.h
          if (hit.lemma.l) s.word.l = hit.lemma.l
          s.word.p = 'x'
        }
      }
      i += n - 1
      break
    }
  }
}

/** Like candidates(), including phrases. */
function candidatesAny(lex: Lexicon, key: string): Cand[] {
  return lex.forms(key).flatMap(([id, code], rank) => {
    const lemma = lex.lemma(id)
    return lemma ? [{ lemma, code, rank }] : []
  })
}

// ---------------------------------------------------------------------------
// Separable verbs and grammar across words

/** Split the sentence into clauses at punctuation and conjunctions. */
function clauses(slots: Slot[], words: Word[]): Slot[][] {
  const out: Slot[][] = [[]]
  let lastWi = -1
  for (const slot of slots) {
    const between = words.slice(lastWi + 1, slot.wi)
    if (between.some((w) => w.p === 'sym' && /[,;:.!?()"“”«»–—]/.test(w.s))) out.push([])
    const conj = slot.chosen?.lemma.p === 'conj'
    if (((SUBORDINATORS.has(slot.key) || COORDINATORS.has(slot.key)) && conj) || (RELATIVES.has(slot.key) && between.some((w) => w.s === ','))) {
      if (out[out.length - 1].length) out.push([])
    }
    out[out.length - 1].push(slot)
    lastWi = slot.wi
  }
  return out.filter((c) => c.length)
}

function linkSeparable(lex: Lexicon, clause: Slot[], words: Word[]) {
  for (let pi = clause.length - 1; pi > 0; pi--) {
    const part = clause[pi]
    if (!PARTICLES.has(part.key) || part.word.sp !== undefined) continue
    // the particle comes at the end of the clause, or only verbs follow it, or a
    // prepositional phrase (legde het pontje vast aan de steiger)
    const after = clause.slice(pi + 1)
    const verbsOnly = after.every((s) => s.chosen?.lemma.p === 'v' && ['', 'inf', 'pp'].includes(s.chosen.code))
    const pp =
      after.length > 1 &&
      after[0].chosen?.lemma.p === 'prep' &&
      after.slice(1).every((s) => ['art', 'det', 'adj', 'n', 'name', 'pron', 'num'].includes(s.word.p) || (s.chosen?.lemma.p === 'v' && s.chosen.code === 'pp'))
    if (!verbsOnly && !pp) continue
    // "achter hem aan", "op me af", "naar huis toe": the second half of a circumposition;
    // "er … op", "daar … voor": a split pronominal adverb (Er staat op: …, Daar ben je te klein voor)
    const before = clause.slice(0, pi).map((x) => x.key)
    const circum = CIRCUMPOSITIONS[part.key]?.some((pre) => before.includes(pre))
    const rPronoun = before.some((k) => k === 'er' || k === 'daar' || k === 'waar' || k === 'hier') && R_PREPOSITIONS.has(part.key)
    if (circum || rPronoun) continue
    for (let vi = pi - 1; vi >= 0; vi--) {
      const verb = clause[vi]
      const c = verb.chosen
      if (!c || c.lemma.p !== 'v' || !FINITE.has(c.code) || verb.word.sp !== undefined) continue
      const sepVerb = candidates(lex, part.key + c.lemma.w).find((x) => x.code === '' && x.lemma.p === 'v' && x.lemma.sep === part.key)
      if (!sepVerb) continue
      const w = verb.word
      w.b = sepVerb.lemma.w
      w.e = sepVerb.lemma.i
      if (sepVerb.lemma.l) w.l = sepVerb.lemma.l
      w.h = sepVerb.lemma.h
      w.sp = part.wi
      w.f = [{ l: `separable verb: ${verb.tok.s.toLowerCase()} … ${part.tok.s.toLowerCase()}`, g: 'separable-verbs' }, ...(w.f ?? [])]
      const pw = part.word
      pw.p = 'prt'
      pw.b = sepVerb.lemma.w
      pw.e = sepVerb.lemma.i
      pw.h = sepVerb.lemma.h
      if (sepVerb.lemma.l) pw.l = sepVerb.lemma.l
      pw.sp = verb.wi
      pw.f = [{ l: `prefix of the separable verb ${sepVerb.lemma.w}`, g: 'separable-verbs' }]
      delete pw.c
      delete pw.a
      pw.t = []
      addTag(w, 'separable-verbs')
      addTag(pw, 'separable-verbs')
      return linkSeparable(lex, clause.slice(0, vi), words)
    }
  }
}

function linkGrammar(lex: Lexicon, slots: Slot[], words: Word[]) {
  // per-word tags
  slots.forEach((slot, i) => {
    const w = slot.word
    const c = slot.chosen
    for (const step of w.f ?? []) if (step.g) addTag(w, step.g)
    const tag = WORD_TAGS[slot.key]
    if (tag && c) addTag(w, tag)
    if (PRONOMINAL.test(slot.key) && !NOT_PRONOMINAL.has(slot.key)) addTag(w, 'pronominal-adverbs')
    if (w.p === 'art') addTag(w, 'de-het')
    const next = slots[i + 1]
    if (POSSESSIVES.has(slot.key) && (w.p === 'det' || w.p === 'pron') && isNounish(next?.chosen)) addTag(w, 'possessives')
    if (DEMONSTRATIVES.has(slot.key) && w.p === 'det') addTag(w, 'demonstratives')
    if (c && MODALS.has(c.lemma.w) && slot.key !== 'zou' && slot.key !== 'zouden') addTag(w, 'modal-verbs')
    // modal particles: mid-clause, not as conjunction (maar) or answer (wel)
    if (MODAL_PARTICLE_WORDS.has(slot.key) && !slot.punct && i > 0 && c?.lemma.p !== 'conj' && slots[i - 1].chosen?.lemma.p !== 'art') {
      if (MODAL_PARTICLES_STRONG.has(slot.key) || slots.slice(0, i).some((x) => x.chosen?.lemma.p === 'v')) addTag(w, 'modal-particles')
    }
    if (SUBORDINATORS.has(slot.key) && c?.lemma.p === 'conj') addTag(w, 'subordinate-clauses')
    if (i === 0 && QUESTION_WORDS.has(slot.key)) {
      const last = words[words.length - 1]
      if (last?.s.includes('?')) addTag(w, 'questions')
    }
    if (REFLEXIVES.has(slot.key)) addTag(w, 'reflexive-verbs')
    // te + infinitive; om … te
    if (slot.key === 'te' && next?.chosen?.lemma.p === 'v' && ['', 'inf'].includes(next.chosen.code)) {
      w.h = 'to (+ infinitive)'
      addTag(w, 'te-infinitive')
      addTag(next.word, 'te-infinitive')
    }
    // aan het + infinitive
    if (slot.key === 'aan' && next?.key === 'het' && slots[i + 2]?.chosen?.lemma.p === 'v' && ['', 'inf'].includes(slots[i + 2].chosen!.code)) {
      for (const s of [slot, next, slots[i + 2]]) addTag(s.word, 'progressive')
      next.word.p = 'art'
      next.word.h = 'aan het … = busy …ing'
    }
  })

  for (const clause of clauses(slots, words)) {
    linkSeparable(lex, clause, words)
    // "op te bellen": particle + te + infinitive
    clause.forEach((slot, i) => {
      if (!PARTICLES.has(slot.key) || clause[i + 1]?.key !== 'te') return
      const verb = clause[i + 2]
      const c = verb?.chosen
      if (!c || c.lemma.p !== 'v') return
      const sepVerb = candidates(lex, slot.key + c.lemma.w).find((x) => x.code === '' && x.lemma.sep === slot.key)
      if (!sepVerb) return
      for (const [s, other] of [[slot, verb], [verb, slot]] as const) {
        s.word.b = sepVerb.lemma.w
        s.word.e = sepVerb.lemma.i
        s.word.h = sepVerb.lemma.h
        s.word.sp = other.wi
        addTag(s.word, 'separable-verbs')
      }
      slot.word.p = 'prt'
      delete slot.word.c
      delete slot.word.a
      slot.word.t = ['separable-verbs']
      slot.word.f = [{ l: `prefix of the separable verb ${sepVerb.lemma.w}`, g: 'separable-verbs' }]
      verb.word.f = [{ l: `separable verb: ${slot.tok.s} te ${verb.tok.s}`, g: 'separable-verbs' }]
    })
    // perfect tense and passive: an auxiliary and a past participle in one clause
    const pps = clause.filter((s) => s.chosen?.lemma.p === 'v' && s.chosen.code === 'pp')
    if (!pps.length) continue
    for (const s of clause) {
      const k = s.key
      const isAux = HEBBEN.has(k) || ZIJN.has(k) || WORDEN.has(k)
      if (!isAux || s.chosen?.lemma.p !== 'v') continue
      const id = WORDEN.has(k) ? 'passive' : ['had', 'hadden', 'was', 'waren'].includes(k) ? 'pluperfect' : 'perfect-tense'
      // (zijn + participle can also be a passive, "het huis is gebouwd", but without
      // knowing which verbs take zijn that can't be told from "ze is gelopen")
      const passiveZijn = false
      const tag = id
      addTag(s.word, tag)
      for (const p of pps) addTag(p.word, tag)
      if (id !== 'passive' && !passiveZijn && (k === 'had' || k === 'hadden' || k === 'was' || k === 'waren')) {
        // past perfect with "was" + a zijn-verb (ik was gevallen)
        for (const p of pps) if (p.chosen?.lemma.aux) addTag(p.word, 'pluperfect')
      }
    }
  }
}

// ---------------------------------------------------------------------------

export function analyzeSentence(lex: Lexicon, text: string, opts: AnalyzeOptions = {}): Word[] {
  const words = analyzeTokens(lex, tokenize(text, opts.terms))
  const last = words[words.length - 1]
  if (last?.ws) delete last.ws
  return words
}

export function analyzeChapters(lex: Lexicon, chapters: RawChapter[], terms?: Term[]): Chapter[] {
  const opts: AnalyzeOptions = { terms }
  return chapters.map((c) => ({
    ...(c.title ? { title: c.title } : {}),
    p: c.p.map((p) => ({
      s: p.s.map((s): Sentence => {
        const out: Sentence = { w: analyzeSentence(lex, s.text, opts) }
        if (s.en) out.en = s.en
        return out
      }),
    })),
  }))
}

export function allWords(chapters: Chapter[]): Word[] {
  return chapters.flatMap((c) => c.p.flatMap((p) => p.s.flatMap((s) => s.w)))
}

export function sentenceText(s: Sentence): string {
  return s.w.map((w) => w.s + (w.ws ?? '')).join('').trim()
}

/** Lemma key used for known-word tracking and SRS. */
export function lemmaKey(w: Word): string {
  return (w.b ?? w.s).toLowerCase()
}

export function isLookupWord(w: Word): boolean {
  return w.p !== 'sym' && /[\p{L}\d]/u.test(w.s)
}
