import { useEffect, useRef, useState } from 'preact/hooks'
import { formLabel, glossList, type Entry, type EnglishHit } from '../lib/dict'
import { looksDutch } from '../lib/text'
import { dictionary } from '../services/dictionary'
import { navigate, route } from '../router'
import { EntryView, POS_LABELS } from '../components/EntryView'
import { Article, CefrBadge } from '../components/Badges'
import { Icon } from '../components/Icon'
import { pendingImport } from './ImportPage'

interface Results {
  query: string
  entries: { entry: Entry; form?: string }[]
  english: EnglishHit[]
}

async function search(q: string): Promise<Results> {
  const query = q.trim()
  const out: Results = { query, entries: [], english: [] }
  if (!query) return out
  // Dutch first: any form finds its dictionary word (liep → lopen, huisjes → huis). A
  // multi-word query is looked up word by word when it reads as Dutch, as English otherwise.
  const seen = new Set<number>()
  const words = query.includes(' ') && !looksDutch(query) ? [] : [query, ...query.split(/\s+/).filter((w) => w !== query)]
  for (const w of words.slice(0, 6)) {
    for (const { entry, code } of await dictionary.lookup(w)) {
      if (seen.has(entry.i)) continue
      seen.add(entry.i)
      out.entries.push({ entry, ...(code ? { form: `${formLabel(code)} of ${entry.w}` } : {}) })
    }
  }
  if (!/[àáâäèéêëïíîóôöúûü]/i.test(query)) out.english = (await dictionary.english(query)).filter((h) => !seen.has(h[0]))
  return out
}

export function DictionaryPage() {
  const q = route.value.query.get('q') ?? ''
  const [input, setInput] = useState(q)
  const [results, setResults] = useState<Results | null>(null)
  const [open, setOpen] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setInput(q)
    if (!q) {
      setResults(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    search(q).then(
      (r) => {
        if (cancelled) return
        setResults(r)
        setOpen(r.entries.length === 1 ? r.entries[0].entry.i : null)
        setLoading(false)
      },
      (e) => {
        if (cancelled) return
        setError(navigator.onLine ? e.message : 'Offline: download the dictionary in Settings to search without a connection.')
        setLoading(false)
      },
    )
    return () => {
      cancelled = true
    }
  }, [q])

  useEffect(() => {
    if (!q) inputRef.current?.focus()
  }, [])

  const submit = (e: Event) => {
    e.preventDefault()
    navigate(`/dictionary?q=${encodeURIComponent(input.trim())}`, { replace: !!q })
  }

  return (
    <div class="page dictionary">
      <header class="page-head">
        <h1>Dictionary</h1>
      </header>
      <form class="search-box big" onSubmit={submit}>
        <Icon name="search" size={20} />
        <input
          ref={inputRef}
          type="search"
          enterKeyHint="search"
          placeholder="fiets, liep, gezellig or English"
          value={input}
          onInput={(e) => setInput((e.target as HTMLInputElement).value)}
          autoCapitalize="off"
          autoCorrect="off"
          spellcheck={false}
          lang="nl"
        />
      </form>
      {!q && (
        <div class="dict-help muted">
          <p>
            Search in Dutch or in English. Any form of a word finds it: <i lang="nl">liep</i> finds <i lang="nl">lopen</i>,{' '}
            <i lang="nl">huisjes</i> finds <i lang="nl">huis</i>.
          </p>
          <p>About 60,000 Dutch words from Wiktionary, with de/het, plurals, verb forms, pronunciation and many recordings by native speakers.</p>
        </div>
      )}
      {loading && <div class="loading">Searching…</div>}
      {error && <div class="notice">{error}</div>}
      {results && q.split(/\s+/).length > 4 && looksDutch(q) && (
        <button
          class="import-cta"
          onClick={() => {
            pendingImport.text = q
            navigate('/import')
          }}
        >
          <Icon name="text" /> Read this as a text with word-by-word look-up
        </button>
      )}
      {results && (
        <>
          <ul class="results">
            {results.entries.map(({ entry: e, form }) => (
              <li class={open === e.i ? 'open' : ''}>
                {open === e.i ? (
                  <div>
                    <button class="link small" onClick={() => setOpen(null)}>
                      ▲ collapse
                    </button>
                    <EntryView entry={e} form={form} />
                  </div>
                ) : (
                  <button class="result-row" onClick={() => setOpen(e.i)}>
                    <span class="rr-word" lang="nl">
                      {e.p === 'n' && <Article a={e.g} />} {e.w}
                    </span>
                    <span class="rr-pos small muted">{POS_LABELS[e.p] ?? e.p}</span>
                    <CefrBadge level={e.l} />
                    {form && <span class="badge form">{form}</span>}
                    <span class="rr-gloss">{glossList(e, 2)}</span>
                  </button>
                )}
              </li>
            ))}
          </ul>
          {results.english.length > 0 && (
            <>
              <h2 class="section-title">English matches</h2>
              <ul class="results">
                {results.english.map(([, word, gloss, level, article]) => (
                  <li>
                    <button class="result-row" onClick={() => navigate(`/dictionary?q=${encodeURIComponent(word)}`)}>
                      <span class="rr-word" lang="nl">
                        <Article a={article || undefined} /> {word}
                      </span>
                      <CefrBadge level={level || undefined} />
                      <span class="rr-gloss">{gloss}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
          {results.entries.length === 0 && results.english.length === 0 && <p class="muted">No results for “{results.query}”.</p>}
        </>
      )}
    </div>
  )
}
