// The whole form index plus a one-line summary of every lemma (forms.txt and
// lemmas.txt from scripts/build-dict.mjs). Enough to analyze any text without
// network requests: the content build loads it from disk, the browser worker
// downloads it once for pasted texts.

import { normalizeKey } from './dictKeys.js'
import type { Article } from './types'

/** [entry id, form code] — the form code is '' for the headword itself. */
export type FormHit = [number, string]

export interface LemmaInfo {
  i: number
  w: string
  /** dictionary part of speech (n, v, adj, adv, pron, prep, conj, det, art, num, intj, name, phrase, …) */
  p: string
  g?: Article
  /** CEFR level 1–6 */
  l?: number
  /** short gloss */
  h: string
  /** separable prefix */
  sep?: string
  /** strong or irregular verb */
  k?: 1
  /** perfect-tense auxiliary when not hebben */
  aux?: string
}

export interface Lexicon {
  forms(key: string): FormHit[]
  lemma(id: number): LemmaInfo | undefined
}

export function parseLexicon(formsTxt: string, lemmasTxt: string): Lexicon {
  const forms = new Map<string, FormHit[]>()
  for (const line of formsTxt.split('\n')) {
    const tab = line.indexOf('\t')
    if (tab < 0) continue
    const hits = line
      .slice(tab + 1)
      .split(' ')
      .map((h): FormHit => {
        const comma = h.indexOf(',')
        return comma < 0 ? [Number(h), ''] : [Number(h.slice(0, comma)), h.slice(comma + 1)]
      })
    forms.set(line.slice(0, tab), hits)
  }
  const lemmas = new Map<number, LemmaInfo>()
  for (const line of lemmasTxt.split('\n')) {
    if (!line) continue
    const [i, w, p, g, l, h, sep, k, aux] = line.split('\t')
    const id = Number(i)
    lemmas.set(id, {
      i: id,
      w,
      p,
      h: h ?? '',
      ...(g ? { g: g as Article } : {}),
      ...(l ? { l: Number(l) } : {}),
      ...(sep ? { sep } : {}),
      ...(k ? { k: 1 as const } : {}),
      ...(aux ? { aux } : {}),
    })
  }
  return {
    forms: (key) => forms.get(normalizeKey(key)) ?? [],
    lemma: (id) => lemmas.get(id),
  }
}

/** A lexicon with no words, for when the dictionary isn't available. */
export const EMPTY_LEXICON: Lexicon = { forms: () => [], lemma: () => undefined }
