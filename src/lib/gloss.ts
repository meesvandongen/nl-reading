// Short, one-line summaries of words for compact views (lookup peek, sentence breakdown).

import type { Word } from './types'

/** Strip the explanation part of a step label: "past tense (strong / irregular verb)" → "past tense". */
function shortLabel(l: string): string {
  return l.replace(/\s*[(:].*$/, '').trim() || l
}

/**
 * One-line breakdown of an inflected word, e.g.
 * liep → ["lopen", "past tense"], huisjes → ["huis", "diminutive", "plural"].
 */
export function breakdownChain(word: Word): string[] {
  if (!word.f?.length) return []
  const steps = word.f.filter((s) => !s.l.startsWith('compound') && !s.l.startsWith('prefix of'))
  if (!steps.length) return []
  return [word.b ?? word.s.toLowerCase(), ...steps.map((s) => shortLabel(s.l))]
}

/** The word with its article, for nouns: "de fiets", "het huisje". */
export function withArticle(word: Pick<Word, 'a' | 'b' | 's' | 'p' | 'c'>, lemma = true): string {
  const base = lemma ? (word.b ?? word.s.toLowerCase()) : word.s
  if (word.p !== 'n' || !word.a) return base
  // a diminutive is a het-word itself; its lemma (the plain noun) may not be
  if (word.c === 'dim' || word.c === 'dimpl') return `het ${word.s.toLowerCase().replace(word.c === 'dimpl' ? /s$/ : /$^/, '')}`
  return `${word.a} ${base}`
}
