import { signal } from '@preact/signals'
import type { Chapter } from '../lib/types'
import { dictMeta } from './dictionary'

/** Download progress of the word index the analyzer needs (once, then cached). */
export const indexProgress = signal<{ loaded: number; total: number } | null>(null)

let worker: Worker | null = null
let seq = 0
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>()

async function getWorker(): Promise<Worker> {
  if (worker) return worker
  worker = new Worker(new URL('../workers/analyze.worker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = (ev) => {
    const d = ev.data
    if (d.type === 'progress') {
      indexProgress.value = { loaded: d.loaded, total: d.total }
      return
    }
    const p = pending.get(d.id)
    if (!p) return
    pending.delete(d.id)
    if (d.ok) p.resolve(d.result)
    else p.reject(new Error(d.error))
  }
  let dictVersion = ''
  try {
    dictVersion = (await dictMeta()).version
  } catch {
    /* no dictionary */
  }
  const base = new URL('.', location.href).href
  await call(worker, { type: 'init', base, dictVersion })
  return worker
}

function call<T>(w: Worker, msg: Record<string, unknown>): Promise<T> {
  const id = ++seq
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject })
    w.postMessage({ ...msg, id })
  })
}

/** Analyze arbitrary text into chapters of sentences. */
export async function analyzeText(text: string): Promise<Chapter[]> {
  return call<Chapter[]>(await getWorker(), { type: 'analyze', text })
}
