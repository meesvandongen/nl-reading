#!/usr/bin/env node
// Builds the dictionary data the app loads at runtime:
//   public/data/dict/f/<bucket>.json   word form → [[entry id, form code], …]
//   public/data/dict/e/<bucket>.json   entry id → entry
//   public/data/dict/x/<bucket>.json   English word → short result list
//   public/data/dict/meta.json
//   public/data/practice.json          drills: de/het nouns, strong verbs
//
// Sources (downloaded once into .cache/):
//   - Dutch entries of the English Wiktionary, as extracted by Wiktextract
//     (kaikki.org): meanings, de/het, plurals, diminutives, conjugations,
//     separable verbs, IPA, recordings, example sentences.
//   - A word frequency list from OpenSubtitles (hermitdave/FrequencyWords),
//     which gives every lemma a rank and so a rough CEFR level.
// The output is not committed; CI runs this script before building the site.

import { createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { pipeline } from 'node:stream/promises'
import { createInterface } from 'node:readline'
import { createHash } from 'node:crypto'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { F_BUCKETS, E_BUCKETS, X_BUCKETS, bucketOf, normalizeKey, englishWords, formCode, levelOfRank } from '../src/lib/dictKeys.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const CACHE = join(ROOT, '.cache')
const OUT = join(ROOT, 'public', 'data', 'dict')
const PRACTICE = join(ROOT, 'public', 'data', 'practice.json')

const SOURCES = {
  wiktionary: ['https://kaikki.org/dictionary/Dutch/kaikki.org-dictionary-Dutch.jsonl', 'kaikki-dutch.jsonl'],
  frequency: ['https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/nl/nl_50k.txt', 'nl_50k.txt'],
}

async function download(name) {
  const [url, fileName] = SOURCES[name]
  const file = join(CACHE, fileName)
  if (existsSync(file)) return file
  console.log(`downloading ${url}`)
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      await pipeline(res.body, createWriteStream(file + '.part'))
      renameSync(file + '.part', file)
      return file
    } catch (err) {
      if (attempt >= 4) throw new Error(`failed to download ${url}: ${err.message}`)
      await new Promise((r) => setTimeout(r, 2000 * 2 ** (attempt - 1)))
    }
  }
}

// ---------------------------------------------------------------------------
// Wiktionary → entries

const POS = {
  noun: 'n',
  verb: 'v',
  adj: 'adj',
  adv: 'adv',
  pron: 'pron',
  prep: 'prep',
  conj: 'conj',
  det: 'det',
  article: 'art',
  num: 'num',
  intj: 'intj',
  name: 'name',
  phrase: 'phrase',
  prep_phrase: 'phrase',
  proverb: 'phrase',
  contraction: 'contr',
  prefix: 'prefix',
  suffix: 'suffix',
  particle: 'part',
  circumpos: 'prep',
  postp: 'prep',
}

/** Sense tags worth showing (usage, region, register). */
const SHOW_TAGS = new Set([
  'informal',
  'formal',
  'colloquial',
  'slang',
  'vulgar',
  'derogatory',
  'offensive',
  'dated',
  'archaic',
  'obsolete',
  'rare',
  'literary',
  'poetic',
  'humorous',
  'figuratively',
  'idiomatic',
  'Netherlands',
  'Belgium',
  'Flanders',
  'Suriname',
  'Southern',
  'dialectal',
  'transitive',
  'intransitive',
  'reflexive',
  'uncountable',
  'plural-only',
  'diminutive',
  'euphemistic',
  'childish',
])

/** Rows of an inflection table we don't index (noise for learners). */
const SKIP_FORM_TAGS = new Set(['archaic', 'subjunctive', 'majestic', 'table-tags', 'inflection-template', 'class', 'obsolete', 'dated', 'error-unrecognized-form'])

/** Senses a learner never needs: only archaic/obsolete/misspelling usage. */
function uselessSense(s) {
  const t = s.tags ?? []
  return t.includes('misspelling') || ((t.includes('obsolete') || t.includes('archaic')) && !t.includes('form-of'))
}

function genderOf(e) {
  for (const h of e.head_templates ?? []) {
    // diminutives, also those that only exist as one (meisje), are het-words
    if (h.name === 'nl-noun-dim' || h.name === 'nl-noun-dim-tant') return 'het'
    if (h.name !== 'nl-noun') continue
    const g = String(h.args?.['1'] ?? '')
    const parts = g.split(/[,\s]+/).filter(Boolean)
    if (g === 'mfbysense' || g === 'mf') return 'de'
    const het = parts.includes('n')
    const de = parts.some((p) => p === 'm' || p === 'f' || p === 'c' || p === 'p')
    if (het && de) return 'de/het'
    if (het) return 'het'
    if (de) return 'de'
  }
  const tags = new Set((e.senses ?? []).flatMap((s) => s.tags ?? []))
  const het = tags.has('neuter')
  const de = tags.has('masculine') || tags.has('feminine') || tags.has('common-gender')
  if (het && de) return 'de/het'
  if (het) return 'het'
  if (de) return 'de'
  return undefined
}

function pickIpa(sounds = []) {
  const ipas = sounds.filter((s) => s.ipa && !(s.tags ?? []).includes('Belgium'))
  return (ipas.find((s) => s.ipa.startsWith('/')) ?? ipas[0])?.ipa
}

function pickAudio(sounds = []) {
  const a = sounds.find((s) => s.ogg_url && !(s.tags ?? []).includes('Belgium')) ?? sounds.find((s) => s.ogg_url)
  const m = a && /\/commons\/(.+\.ogg)$/.exec(a.ogg_url)
  return m?.[1]
}

const clean = (s) => s.replace(/\s+/g, ' ').trim()

/** A short meaning for gloss hints over words: "house", "to walk". */
function hintGloss(e, max = 28) {
  // the first general sense: not regional ("lopen" is "to run" in Belgium, "to walk" in the Netherlands) or dated
  const general = (x) =>
    !/^(alternative|obsolete|archaic|dated) (form|spelling)/i.test(x.g) && !(x.t ?? []).some((t) => ['Belgium', 'Flanders', 'Suriname', 'dated', 'rare', 'archaic', 'dialectal'].includes(t))
  const s = e.s.find(general) ?? e.s[0]
  let g = (s?.g ?? '').replace(/\s*\([^)]*\)/g, '').replace(/\s+/g, ' ').trim()
  g = g.split(';')[0].trim()
  if (g.length > max) g = g.split(',')[0].trim()
  if (e.p !== 'v') g = g.replace(/^(a|an|the) (?=\w)/i, '')
  if (g.length > max) g = g.slice(0, max - 1).trimEnd() + '…'
  return g.replace(/\t/g, ' ')
}

/** The gloss of a sense: the most specific line, without "inflection of" headers. */
function senseGloss(s) {
  const g = s.glosses ?? s.raw_glosses ?? []
  if (!g.length) return ''
  return clean(g[g.length - 1])
}

function pickExample(s) {
  const ex = (s.examples ?? []).find((x) => x.text && (x.translation || x.english) && x.text.length <= 120)
  return ex ? [clean(ex.text), clean(ex.translation ?? ex.english)] : undefined
}

function verbInfo(e) {
  const tpl = (e.inflection_templates ?? []).find((t) => t.name.startsWith('nl-conj') && t.name !== 'nl-conj-see')
  if (!tpl) return undefined
  const forms = (e.forms ?? []).filter((f) => f.source === 'conjugation' && !(f.tags ?? []).some((t) => SKIP_FORM_TAGS.has(t)))
  const has = (f, ...tags) => tags.every((t) => (f.tags ?? []).includes(t))
  const plain = (f) => !(f.tags ?? []).some((t) => t === 'Flanders' || t === 'colloquial' || t === 'formal')
  const find = (pred) => forms.find((f) => pred(f) && plain(f) && f.form !== '-')?.form
  const sep = tpl.args?.sep
  // main clause forms of separable verbs are "belde op"; show those
  const pst = find((f) => has(f, 'past', 'singular', 'first-person') && (!sep || has(f, 'main-clause')))
  const pstpl = find((f) => has(f, 'past', 'plural') && (!sep || has(f, 'main-clause') || !f.form.includes(' ')))
  const pp = find((f) => has(f, 'participle', 'past'))
  const tableTag = (e.forms ?? []).find((f) => (f.tags ?? []).includes('table-tags'))?.form ?? ''
  const kind = tpl.name === 'nl-conj-st' ? (tableTag.includes('irregular') ? 'irregular' : 'strong') : tpl.name === 'nl-conj-irr' ? 'irregular' : tpl.name === 'nl-conj-wk-cht' ? 'irregular' : 'weak'
  const aux = String(tpl.args?.aux ?? '').toLowerCase()
  const out = {}
  if (pst) out.pt = pst
  if (pstpl) out.ptp = pstpl
  if (pp) out.pp = pp
  if (aux === 'zijn' || aux.startsWith('zijn')) out.aux = aux.includes('hebben') ? 'zijn/hebben' : 'zijn'
  else if (aux.includes('zijn')) out.aux = 'hebben/zijn'
  if (sep) out.sep = sep
  if (kind !== 'weak') out.k = kind
  return Object.keys(out).length ? out : undefined
}

function adjInfo(e) {
  const forms = e.forms ?? []
  const cmp = forms.find((f) => !f.source && (f.tags ?? []).includes('comparative'))?.form
  const sup = forms.find((f) => !f.source && (f.tags ?? []).includes('superlative'))?.form
  return cmp || sup ? [cmp ?? '', sup ?? ''] : undefined
}

// ---------------------------------------------------------------------------

/** How much Wiktionary says about an entry: a proxy for how common it is among its homographs. */
function richness(e) {
  return 1 + e.s.length + e.s.filter((s) => s.x).length + (e.a ? 3 : 0) + (e.ipa ? 1 : 0)
}

/** How likely a word form is to be this kind of form, before frequencies are known. */
const FORM_PRIOR = { '1s': 0.3, imp: 0.2, alt: 0.3, form: 0.3, obj: 0.5, part: 0.3, gen: 0.3 }

async function readWiktionary(file) {
  const lemmas = [] // raw lemma entries (trimmed)
  const formOf = [] // [form, target, pos, tags]
  const rl = createInterface({ input: createReadStream(file), crlfDelay: Infinity })
  for await (const line of rl) {
    if (!line) continue
    const e = JSON.parse(line)
    const pos = POS[e.pos]
    if (!pos || !e.word) continue
    const senses = (e.senses ?? []).filter((s) => !(s.tags ?? []).includes('no-gloss'))
    const lemmaSenses = []
    for (const s of senses) {
      const target = s.form_of?.[0]?.word ?? s.alt_of?.[0]?.word
      if (target && ((s.tags ?? []).includes('form-of') || s.form_of)) {
        formOf.push([e.word, target, pos, s.tags ?? []])
        continue
      }
      if (target && (s.tags ?? []).includes('alt-of')) {
        formOf.push([e.word, target, pos, [...(s.tags ?? []), 'alternative']])
        // keep alternative spellings as entries too ("is" → eens) when they have a gloss
      }
      if (uselessSense(s)) continue
      const g = senseGloss(s)
      if (!g) continue
      lemmaSenses.push(s)
    }
    if (!lemmaSenses.length) continue
    if (pos === 'name' && e.word.includes(' ')) continue
    const entry = {
      w: e.word,
      p: pos,
      s: lemmaSenses.slice(0, 12).map((s) => {
        const out = { g: senseGloss(s) }
        const t = (s.tags ?? []).filter((x) => SHOW_TAGS.has(x))
        if (t.length) out.t = t
        const qual = (s.raw_tags ?? []).filter((x) => x.length < 30)
        if (qual.length) out.t = [...(out.t ?? []), ...qual]
        const ex = pickExample(s)
        if (ex) out.x = ex
        return out
      }),
    }
    if (pos === 'n') {
      const g = genderOf(e)
      if (g) entry.g = g
      const pl = (e.forms ?? []).filter((f) => !f.source && (f.tags ?? []).includes('plural') && !(f.tags ?? []).includes('diminutive')).map((f) => f.form)
      if (pl.length) entry.pl = [...new Set(pl)].slice(0, 3)
      const dim = (e.forms ?? []).filter((f) => !f.source && (f.tags ?? []).includes('diminutive')).map((f) => f.form)
      if (dim.length) entry.dim = dim[0]
      if (lemmaSenses.every((s) => (s.tags ?? []).includes('plural-only'))) entry.po = 1
    }
    if (pos === 'v') {
      const v = verbInfo(e)
      if (v) entry.v = v
      if (lemmaSenses.some((s) => (s.tags ?? []).includes('reflexive'))) entry.rf = 1
    }
    if (pos === 'adj') {
      const c = adjInfo(e)
      if (c) entry.c = c
    }
    const ipa = pickIpa(e.sounds)
    if (ipa) entry.ipa = ipa
    const audio = pickAudio(e.sounds)
    if (audio) entry.a = audio
    // forms from the entry's own tables (not for pronouns and articles, whose
    // tables list other pronouns: "het" is not a form of "dat")
    entry._forms = []
    for (const f of ['pron', 'det', 'art', 'num'].includes(pos) ? [] : e.forms ?? []) {
      const tags = f.tags ?? []
      if (!f.form || f.form === '-' || f.form.includes(' ') || tags.some((t) => SKIP_FORM_TAGS.has(t))) continue
      if (tags.includes('Flanders') && tags.includes('colloquial')) continue
      entry._forms.push([f.form, tags])
    }
    lemmas.push(entry)
  }
  return { lemmas, formOf }
}

function loadFrequency(file) {
  const freq = new Map()
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const [w, n] = line.trim().split(' ')
    if (w && n) freq.set(normalizeKey(w), Number(n))
  }
  return freq
}

async function main() {
  mkdirSync(CACHE, { recursive: true })
  const [wikiFile, freqFile] = [await download('wiktionary'), await download('frequency')]
  console.log('reading Wiktionary…')
  const { lemmas, formOf } = await readWiktionary(wikiFile)
  const freq = loadFrequency(freqFile)
  console.log(`${lemmas.length} lemma entries, ${formOf.length} form-of senses`)

  // ---- ids and the form index (id 0 is a placeholder, so that every real id is truthy)
  lemmas.unshift({ w: '', p: 'x', s: [], _forms: [], placeholder: true })
  lemmas.forEach((e, i) => (e.i = i))
  const byWord = new Map()
  for (const e of lemmas) {
    if (e.placeholder) continue
    const k = normalizeKey(e.w)
    if (!byWord.has(k)) byWord.set(k, [])
    byWord.get(k).push(e)
  }
  /** form key → Map(entry id → merged tags) */
  const forms = new Map()
  const addForm = (form, entry, tags) => {
    const k = normalizeKey(form)
    if (!k) return
    let m = forms.get(k)
    if (!m) forms.set(k, (m = new Map()))
    const prev = m.get(entry.i)
    if (prev === 'base') return
    if (tags === 'base') m.set(entry.i, 'base')
    else m.set(entry.i, [...new Set([...(prev ?? []), ...tags])])
  }
  for (const e of lemmas) {
    if (e.placeholder) continue
    addForm(e.w, e, 'base')
    for (const [f, tags] of e._forms) if (normalizeKey(f) !== normalizeKey(e.w)) addForm(f, e, tags)
  }
  let unresolved = 0
  for (const [form, target, pos, tags] of formOf) {
    const cands = byWord.get(normalizeKey(target)) ?? []
    const same = cands.filter((c) => c.p === pos)
    const list = same.length ? same : cands.filter((c) => c.p !== 'name')
    if (!list.length) {
      unresolved++
      continue
    }
    for (const c of list) if (normalizeKey(form) !== normalizeKey(c.w)) addForm(form, c, tags.filter((t) => t !== 'form-of'))
  }
  console.log(`${forms.size} form keys (${unresolved} form-of targets without an entry)`)

  // ---- lemma frequency: each surface count is shared among the lemmas it can be,
  // first by how likely that kind of form is, then also in proportion to the
  // lemmas' own frequency. The last pass's shares also rank the lemmas of each form.
  const lemmaFreq = new Float64Array(lemmas.length)
  /** form key → Map(entry id → share of that form's uses) */
  const shares = new Map()
  for (let pass = 0; pass < 4; pass++) {
    const next = new Float64Array(lemmas.length)
    for (const [key, m] of forms) {
      const n = freq.get(key) ?? 0
      const ids = [...m.keys()]
      const weights = ids.map((id) => {
        const e = lemmas[id]
        const tags = m.get(id)
        const code = tags === 'base' ? '' : formCode(tags, e.p)
        // proper nouns only get counts for capitalized use, which the list doesn't have;
        // of homographs, the entry with more senses, examples and a recording is the main one
        const prior = (e.p === 'name' ? 0.05 : 1) * (FORM_PRIOR[code] ?? 1) * richness(e)
        return prior * (pass === 0 ? 1 : lemmaFreq[id] + 1)
      })
      const total = weights.reduce((a, b) => a + b, 0) || 1
      const sh = new Map()
      ids.forEach((id, j) => {
        next[id] += (n * weights[j]) / total
        sh.set(id, weights[j] / total)
      })
      shares.set(key, sh)
    }
    lemmaFreq.set(next)
  }
  const ranked = lemmas
    .map((e) => e.i)
    .filter((i) => lemmaFreq[i] >= 1)
    .sort((a, b) => lemmaFreq[b] - lemmaFreq[a])
  ranked.forEach((id, r) => {
    lemmas[id].f = r + 1
    const l = levelOfRank(r + 1)
    if (l) lemmas[id].l = l
  })

  // Rare names and entries nobody will look up in a reader bloat the data: drop
  // proper nouns that aren't in the frequency list.
  const keep = (e) => !e.placeholder && (e.p !== 'name' || e.f)
  // ---- write
  if (existsSync(OUT)) rmSync(OUT, { recursive: true })
  for (const d of ['f', 'e', 'x']) mkdirSync(join(OUT, d), { recursive: true })

  const fShards = Array.from({ length: F_BUCKETS }, () => ({}))
  let formCount = 0
  for (const [key, m] of forms) {
    const hits = []
    for (const [id, tags] of m) {
      const e = lemmas[id]
      if (!keep(e)) continue
      hits.push([id, tags === 'base' ? '' : formCode(tags, e.p)])
    }
    if (!hits.length) continue
    // the most likely reading of this form first
    const sh = shares.get(key)
    hits.sort((a, b) => (sh.get(b[0]) ?? 0) - (sh.get(a[0]) ?? 0) || (lemmas[a[0]].f ?? 1e9) - (lemmas[b[0]].f ?? 1e9))
    fShards[bucketOf(key, F_BUCKETS)][key] = hits
    formCount++
  }

  const eShards = Array.from({ length: E_BUCKETS }, () => ({}))
  let entryCount = 0
  for (const e of lemmas) {
    if (!keep(e)) continue
    const { _forms, i, ...rest } = e
    eShards[i % E_BUCKETS][i] = { i, ...rest }
    entryCount++
  }

  // English → Dutch
  const xIndex = new Map()
  for (const e of lemmas) {
    if (!keep(e) || e.p === 'name' || e.p === 'phrase') continue
    const words = new Set(e.s.slice(0, 3).flatMap((s) => englishWords(s.g)))
    for (const w of words) {
      if (!xIndex.has(w)) xIndex.set(w, [])
      xIndex.get(w).push(e)
    }
  }
  const xShards = Array.from({ length: X_BUCKETS }, () => ({}))
  for (const [w, list] of xIndex) {
    list.sort((a, b) => (a.f ?? 1e9) - (b.f ?? 1e9))
    xShards[bucketOf(w, X_BUCKETS)][w] = list.slice(0, 24).map((e) => [e.i, e.w, e.s[0].g.slice(0, 60), e.l ?? 0, e.g ?? ''])
  }

  const hash = createHash('sha1')
  const write = (path, data) => {
    const json = JSON.stringify(data)
    hash.update(path).update(json)
    writeFileSync(join(OUT, path), json)
  }
  fShards.forEach((s, b) => write(`f/${b}.json`, s))
  eShards.forEach((s, b) => write(`e/${b}.json`, s))
  xShards.forEach((s, b) => write(`x/${b}.json`, s))

  // The whole form index and a one-line summary of every lemma, for analyzing
  // texts (the content build, and pasted texts in the browser) without fetching
  // hundreds of shards:
  //   forms.txt   key<TAB>id[,code] id[,code] …
  //   lemmas.txt  id<TAB>word<TAB>pos<TAB>article<TAB>level<TAB>short gloss<TAB>separable prefix<TAB>strong<TAB>aux
  const formLines = []
  for (const s of fShards) for (const [key, hits] of Object.entries(s)) formLines.push(`${key}\t${hits.map(([id, c]) => (c ? `${id},${c}` : id)).join(' ')}`)
  const lemmaLines = []
  for (const e of lemmas) {
    if (!keep(e)) continue
    const row = [e.i, e.w, e.p, e.g ?? '', e.l ?? '', hintGloss(e), e.v?.sep ?? '', e.v?.k ? 1 : '', e.v?.aux ?? '']
    lemmaLines.push(row.join('\t').replace(/\t+$/, ''))
  }
  const writeText = (path, text) => {
    hash.update(path).update(text)
    writeFileSync(join(OUT, path), text)
  }
  writeText('forms.txt', formLines.join('\n'))
  writeText('lemmas.txt', lemmaLines.join('\n'))

  const meta = {
    version: hash.digest('hex').slice(0, 12),
    entries: entryCount,
    forms: formCount,
    buckets: { f: F_BUCKETS, e: E_BUCKETS, x: X_BUCKETS },
    built: new Date().toISOString(),
  }
  writeFileSync(join(OUT, 'meta.json'), JSON.stringify(meta))

  // ---- practice drills (precached with the app, so they work offline)
  const nouns = ranked
    .map((id) => lemmas[id])
    .filter((e) => e.p === 'n' && (e.g === 'de' || e.g === 'het') && !e.po && /^[a-zà-ÿ]+$/.test(e.w) && !e.s.every((s) => (s.t ?? []).some((t) => ['vulgar', 'offensive', 'derogatory', 'slang'].includes(t))))
    .slice(0, 2500)
    .map((e) => [e.w, e.g, e.s[0].g.slice(0, 60), e.l ?? 0])
  const verbs = ranked
    .map((id) => lemmas[id])
    .filter((e) => e.p === 'v' && e.v?.k && !e.v.sep && e.v.pt && e.v.pp && /^[a-z]+$/.test(e.w))
    .slice(0, 200)
    .map((e) => [e.w, e.v.pt, e.v.ptp ?? '', e.v.pp, e.v.aux ?? 'hebben', e.s[0].g.slice(0, 60), e.l ?? 0])
  writeFileSync(PRACTICE, JSON.stringify({ version: meta.version, nouns, verbs }))

  console.log(`dictionary: ${entryCount} entries, ${formCount} forms, ${xIndex.size} English words → ${OUT}`)
  console.log(`practice: ${nouns.length} nouns, ${verbs.length} strong/irregular verbs`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
