import { signal } from '@preact/signals'
import { Dictionary } from '../lib/dict'

interface DictMeta {
  version: string
  entries: number
  forms: number
  buckets: { f: number; e: number; x: number }
}

let metaP: Promise<DictMeta> | null = null
export function dictMeta(): Promise<DictMeta> {
  if (!metaP) {
    metaP = fetch('data/dict/meta.json', { cache: 'no-cache' })
      .then((r) => {
        if (!r.ok) throw new Error('Dictionary not available')
        return r.json() as Promise<DictMeta>
      })
      .catch(async (err) => {
        // Offline: fall back to whatever meta the service worker cached
        const cached = await caches?.match?.('data/dict/meta.json', { ignoreSearch: true })
        if (cached) return cached.json()
        metaP = null
        throw err
      })
  }
  return metaP
}

export function dictUrl(path: string, version: string) {
  return `data/dict/${path}?v=${version}`
}

export const dictionary = new Dictionary(async (path) => {
  const { version } = await dictMeta()
  const res = await fetch(dictUrl(path, version))
  if (!res.ok) throw new Error(`Dictionary request failed (${res.status})`)
  return res.json()
})

// ---- offline download of the whole dictionary

export const dictDownload = signal<{ done: number; total: number; running: boolean; error?: string } | null>(null)

const OFFLINE_KEY = 'nl-reading:dict-offline'

export async function downloadDictionary() {
  const meta = await dictMeta()
  const paths = [
    ...Array.from({ length: meta.buckets.f }, (_, i) => `f/${i}.json`),
    ...Array.from({ length: meta.buckets.e }, (_, i) => `e/${i}.json`),
    ...Array.from({ length: meta.buckets.x }, (_, i) => `x/${i}.json`),
    'forms.txt',
    'lemmas.txt',
  ]
  const cache = await caches.open('dictionary')
  let done = 0
  dictDownload.value = { done, total: paths.length, running: true }
  let next = 0
  const worker = async () => {
    while (next < paths.length) {
      const url = dictUrl(paths[next++], meta.version)
      // Requests go through the service worker (CacheFirst) when it is active;
      // store explicitly too so this works on the first visit.
      if (!(await cache.match(url))) {
        const res = await fetch(url)
        if (res.ok) await cache.put(url, res)
      }
      done++
      if (done % 16 === 0 || done === paths.length) dictDownload.value = { done, total: paths.length, running: true }
    }
  }
  try {
    await Promise.all(Array.from({ length: 8 }, worker))
    dictDownload.value = { done, total: paths.length, running: false }
    localStorage.setItem(OFFLINE_KEY, meta.version)
  } catch (err) {
    dictDownload.value = { done, total: paths.length, running: false, error: (err as Error).message }
  }
}

export function dictionaryOffline(): string | null {
  try {
    return localStorage.getItem(OFFLINE_KEY)
  } catch {
    return null
  }
}
