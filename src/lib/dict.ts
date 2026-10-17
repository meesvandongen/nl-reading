// Client for the sharded dictionary built by scripts/build-dict.mjs.

import { bucketOf, normalizeKey, englishWords, F_BUCKETS, E_BUCKETS, X_BUCKETS, FORM_LABELS } from './dictKeys.js'
import type { Article } from './types'

export interface Sense {
  /** gloss */
  g: string
  /** usage / region tags */
  t?: string[]
  /** example sentence and its translation */
  x?: [string, string]
}

export interface VerbInfo {
  /** past tense singular (main clause form for separable verbs: "belde op") */
  pt?: string
  /** past tense plural */
  ptp?: string
  /** past participle */
  pp?: string
  /** auxiliary of the perfect tense when not hebben */
  aux?: string
  /** separable prefix */
  sep?: string
  /** strong or irregular */
  k?: 'strong' | 'irregular'
}

export interface Entry {
  i: number
  /** headword */
  w: string
  /** part of speech: n, v, adj, adv, pron, prep, conj, det, art, num, intj, name, phrase, contr, prefix, suffix, part */
  p: string
  s: Sense[]
  /** article of a noun */
  g?: Article
  /** plurals */
  pl?: string[]
  /** diminutive */
  dim?: string
  /** plural only */
  po?: 1
  v?: VerbInfo
  /** reflexive verb */
  rf?: 1
  /** comparative, superlative */
  c?: [string, string]
  ipa?: string
  /** Wikimedia Commons path of a recording, e.g. "e/e3/Nl-huis.ogg" */
  a?: string
  /** frequency rank */
  f?: number
  /** CEFR level from the frequency rank, 1–6 */
  l?: number
}

/** [entry id, form code] — the form code is '' for the headword itself. */
export type FormHit = [number, string]

/** [entry id, headword, short gloss, level, article] */
export type EnglishHit = [number, string, string, number, string]

export type Loader = (path: string) => Promise<unknown>

/** The dictionary as sharded JSON files, loaded on demand. */
export class Dictionary {
  private f = new Map<number, Promise<Record<string, FormHit[]>>>()
  private e = new Map<number, Promise<Record<string, Entry>>>()
  private x = new Map<number, Promise<Record<string, EnglishHit[]>>>()

  constructor(private load: Loader) {}

  private shard<T>(cache: Map<number, Promise<T>>, dir: string, b: number): Promise<T> {
    let p = cache.get(b)
    if (!p) {
      p = this.load(`${dir}/${b}.json`) as Promise<T>
      p.catch(() => cache.delete(b))
      cache.set(b, p)
    }
    return p
  }

  async forms(key: string): Promise<FormHit[]> {
    const k = normalizeKey(key)
    if (!k) return []
    return (await this.shard(this.f, 'f', bucketOf(k, F_BUCKETS)))[k] ?? []
  }

  async entry(id: number): Promise<Entry | undefined> {
    return (await this.shard(this.e, 'e', id % E_BUCKETS))[id]
  }

  /** All entries a word form can belong to, most likely first, with what form it is of each. */
  async lookup(word: string): Promise<{ entry: Entry; code: string }[]> {
    const hits = await this.forms(word)
    const out = await Promise.all(hits.map(async ([id, code]) => ({ entry: await this.entry(id), code })))
    return out.filter((x): x is { entry: Entry; code: string } => !!x.entry)
  }

  async english(query: string): Promise<EnglishHit[]> {
    const words = englishWords(query)
    if (!words.length) return []
    const lists = await Promise.all(words.map(async (w) => (await this.shard(this.x, 'x', bucketOf(w, X_BUCKETS)))[w] ?? []))
    if (lists.length === 1) return lists[0]
    // Intersect multi-word queries, keeping the order of the first list
    const rest = lists.slice(1).map((l) => new Set(l.map((h) => h[0])))
    const both = lists[0].filter((h) => rest.every((s) => s.has(h[0])))
    return both.length ? both : lists.flat()
  }
}

export function formLabel(code: string | undefined): string {
  return code ? (FORM_LABELS[code] ?? code) : ''
}

/** Headword with its article for nouns: "de fiets", "het huis", "de/het was". */
export function headword(e: Pick<Entry, 'w' | 'p' | 'g'>): string {
  return e.p === 'n' && e.g ? `${e.g} ${e.w}` : e.w
}

/** URL of a Wikimedia Commons recording, transcoded to MP3 (plays in every browser). */
export function audioUrl(path: string): string {
  const file = path.split('/').pop()!
  return `https://upload.wikimedia.org/wikipedia/commons/transcoded/${path}/${file}.mp3`
}

const PARENS = /\s*\([^)]*\)/g

/** A short meaning for hints: the first gloss up to the first ";" or ",", without brackets. */
export function shortGloss(e: Entry, max = 28): string {
  const g = (e.s[0]?.g ?? '').replace(PARENS, '').trim()
  let out = g.split(/;/)[0].trim()
  if (out.length > max) out = out.split(/,/)[0].trim()
  if (out.length > max) out = out.slice(0, max - 1).trimEnd() + '…'
  return (e.p === 'v' ? out : out.replace(/^(a|an|the) (?=\w)/i, '')).trim()
}

/** First glosses of an entry, for lists. */
export function glossList(e: Entry, senses = 2): string {
  return e.s
    .slice(0, senses)
    .map((s) => s.g.replace(PARENS, '').trim())
    .filter(Boolean)
    .join('; ')
}
