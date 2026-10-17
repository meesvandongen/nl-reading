/// <reference lib="webworker" />
// Analyzes pasted Dutch text off the main thread. Needs the dictionary's form
// index and lemma table (about 2.7 MB compressed), downloaded once and then
// served from the service worker's cache.

import { analyzeChapters } from '../lib/analyze'
import { parsePlainText } from '../lib/text'
import { EMPTY_LEXICON, parseLexicon, type Lexicon } from '../lib/lexicon'

declare const self: DedicatedWorkerGlobalScope

let base = ''
let dictVersion = ''
let lexiconP: Promise<Lexicon> | null = null

async function fetchText(name: string, onDone: () => void): Promise<string> {
  const res = await fetch(`${base}data/dict/${name}?v=${dictVersion}`)
  if (!res.ok) throw new Error(`Failed to load the dictionary index (${res.status})`)
  const text = await res.text()
  onDone()
  return text
}

function getLexicon(): Promise<Lexicon> {
  if (!dictVersion) return Promise.resolve(EMPTY_LEXICON)
  if (!lexiconP) {
    let loaded = 0
    const done = () => self.postMessage({ type: 'progress', loaded: ++loaded, total: 2 })
    self.postMessage({ type: 'progress', loaded: 0, total: 2 })
    lexiconP = Promise.all([fetchText('forms.txt', done), fetchText('lemmas.txt', done)]).then(([f, l]) => parseLexicon(f, l))
    lexiconP.catch(() => (lexiconP = null))
  }
  return lexiconP
}

self.onmessage = async (ev: MessageEvent) => {
  const { id, type } = ev.data
  try {
    if (type === 'init') {
      base = ev.data.base
      dictVersion = ev.data.dictVersion ?? ''
      self.postMessage({ id, ok: true })
      return
    }
    if (type === 'analyze') {
      const lex = await getLexicon()
      const chapters = analyzeChapters(lex, parsePlainText(ev.data.text))
      self.postMessage({ id, ok: true, result: chapters })
    }
  } catch (err) {
    self.postMessage({ id, ok: false, error: (err as Error).message })
  }
}
