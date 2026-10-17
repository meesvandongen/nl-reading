// Machine translation of single sentences, for texts without a bundled translation.
//
// Uses the browser's built-in, on-device Translator API when there is one (the text
// never leaves the device). Otherwise the reader offers links to web translators,
// which the user opens themselves.

type Availability = 'unavailable' | 'downloadable' | 'downloading' | 'available'

interface TranslatorInstance {
  translate(text: string): Promise<string>
}
interface TranslatorStatic {
  availability(opts: { sourceLanguage: string; targetLanguage: string }): Promise<Availability>
  create(opts: {
    sourceLanguage: string
    targetLanguage: string
    monitor?: (m: EventTarget) => void
  }): Promise<TranslatorInstance>
}

const LANGS = { sourceLanguage: 'nl', targetLanguage: 'en' }

function api(): TranslatorStatic | undefined {
  return (globalThis as { Translator?: TranslatorStatic }).Translator
}

/** Whether on-device translation can be used, possibly after a one-time model download. */
export async function deviceTranslation(): Promise<Availability> {
  const T = api()
  if (!T) return 'unavailable'
  try {
    // Some browsers expose the API but never answer: don't wait for them
    const timeout = new Promise<Availability>((resolve) => setTimeout(() => resolve('unavailable'), 3000))
    return await Promise.race([T.availability(LANGS), timeout])
  } catch {
    return 'unavailable'
  }
}

let translator: Promise<TranslatorInstance> | null = null
const cache = new Map<string, string>()

export function cachedTranslation(text: string): string | undefined {
  return cache.get(text)
}

/**
 * Translate Dutch to English on the device. When the language model still has to be
 * downloaded this must be called from a user gesture; `onProgress` reports 0..1.
 */
export async function translateOnDevice(text: string, onProgress?: (p: number) => void): Promise<string> {
  const hit = cache.get(text)
  if (hit) return hit
  const T = api()
  if (!T) throw new Error('Translation is not supported in this browser')
  if (!translator) {
    translator = T.create({
      ...LANGS,
      monitor: (m) =>
        m.addEventListener('downloadprogress', (e) => onProgress?.((e as Event & { loaded: number }).loaded)),
    })
    translator.catch(() => (translator = null))
  }
  const out = await (await translator).translate(text)
  cache.set(text, out)
  return out
}

export function webTranslators(text: string): { name: string; url: string }[] {
  const q = encodeURIComponent(text)
  return [
    { name: 'Google Translate', url: `https://translate.google.com/?sl=nl&tl=en&op=translate&text=${q}` },
    { name: 'DeepL', url: `https://www.deepl.com/translator#nl/en/${q.replace(/%2F/g, '%5C%2F')}` },
  ]
}
