import { allWords, lemmaKey } from './analyze'
import type { Chapter } from './types'

export function textStats(chapters: Chapter[]) {
  const words = allWords(chapters).filter((w) => w.p !== 'sym')
  const sentences = chapters.flatMap((c) => c.p.flatMap((p) => p.s))
  const cefr = [0, 0, 0, 0, 0, 0, 0]
  const lemmas = new Set<string>()
  for (const w of words) {
    if (w.p === 'num' || w.p === 'name') continue
    lemmas.add(lemmaKey(w))
    cefr[w.l ?? 0]++
  }
  return {
    words: words.length,
    sentences: sentences.length,
    translated: sentences.length > 0 && sentences.every((s) => !!s.en),
    cefr,
    lemmas: lemmas.size,
  }
}
