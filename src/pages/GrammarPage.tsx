import { useEffect, useRef, useState } from 'preact/hooks'
import type { GrammarMeta } from '../lib/types'
import { getGrammar, library } from '../services/library'
import { speak } from '../services/tts'
import { back, navigate } from '../router'
import { Icon } from '../components/Icon'


export function GrammarListPage() {
  const lib = library.value
  const [q, setQ] = useState('')
  if (!lib) return <div class="page loading">Loading…</div>
  const term = q.trim().toLowerCase()
  const items = lib.grammar.filter(
    (g) => !term || [g.title, g.title_nl, g.summary, g.id].join(' ').toLowerCase().includes(term),
  )
  const groups = new Map<string, GrammarMeta[]>()
  for (const g of items) {
    const k = g.cefr ?? 'Other'
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k)!.push(g)
  }
  const order = ['A1', 'A2', 'B1', 'B2', 'C1', 'Other']
  return (
    <div class="page grammar">
      <header class="page-head">
        <h1>Grammar</h1>
      </header>
      <p class="muted">Short guides to the grammar you meet while reading. Tap a word in any story to see its breakdown and jump here.</p>
      <div class="search-box">
        <Icon name="search" size={18} />
        <input type="search" placeholder="Search grammar (e.g. de/het, er, separable verbs)" value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} />
      </div>
      {order
        .filter((k) => groups.has(k))
        .map((k) => (
          <section>
            <h2 class="section-title">{k === 'Other' ? 'Other' : `Level ${k}`}</h2>
            <ul class="grammar-list">
              {groups.get(k)!.map((g) => (
                <li>
                  <button class="grammar-item" onClick={() => navigate(`/grammar/${g.id}`)}>
                    <span class="gi-title">
                      {g.title} {g.title_nl && <span lang="nl" class="muted">{g.title_nl}</span>}
                    </span>
                    {g.summary && <span class="gi-summary small muted">{g.summary}</span>}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
    </div>
  )
}

export function GrammarArticlePage({ id }: { id: string }) {
  const [data, setData] = useState<{ meta: GrammarMeta; html: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    setData(null)
    getGrammar(id).then(setData, (e) => setError(e.message))
    window.scrollTo(0, 0)
  }, [id])

  // Speak buttons for Dutch examples ("- Dutch sentence. — English translation.")
  useEffect(() => {
    const root = ref.current
    if (!root || !data) return
    root.querySelectorAll('li').forEach((li) => {
      const text = li.textContent ?? ''
      if (!text.includes(' — ') || li.querySelector('.speak')) return
      const nl = text.split(' — ')[0]
      li.setAttribute('lang', 'nl')
      const b = document.createElement('button')
      b.className = 'speak icon-btn small'
      b.setAttribute('aria-label', 'Listen')
      b.innerHTML =
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9v6h4l5 4V5L8 9zm12-1a5 5 0 0 1 0 8"/></svg>'
      b.onclick = (e) => {
        e.stopPropagation()
        speak(nl.trim())
      }
      li.prepend(b)
    })
  }, [data])

  const lib = library.value
  const idx = lib?.grammar.findIndex((g) => g.id === id) ?? -1
  const prev = idx > 0 ? lib!.grammar[idx - 1] : null
  const next = lib && idx >= 0 && idx < lib.grammar.length - 1 ? lib.grammar[idx + 1] : null

  return (
    <div class="page grammar-article">
      <header class="topbar">
        <button class="icon-btn" onClick={() => back('/grammar')} aria-label="Back">
          <Icon name="back" />
        </button>
        <div class="topbar-title">Grammar</div>
      </header>
      {error && <div class="notice">{error}</div>}
      {!data && !error && <div class="loading">Loading…</div>}
      {data && (
        <article>
          <h1>
            {data.meta.title} {data.meta.title_nl && <span lang="nl" class="muted">{data.meta.title_nl}</span>}
          </h1>
          {data.meta.cefr && <span class="badge cefr">{data.meta.cefr}</span>}
          {data.meta.summary && <p class="lead">{data.meta.summary}</p>}
          <div class="prose" ref={ref} dangerouslySetInnerHTML={{ __html: data.html }} />
          <nav class="prev-next">
            {prev ? (
              <button class="btn ghost" onClick={() => navigate(`/grammar/${prev.id}`, { replace: true })}>
                ← {prev.title}
              </button>
            ) : (
              <span />
            )}
            {next && (
              <button class="btn ghost" onClick={() => navigate(`/grammar/${next.id}`, { replace: true })}>
                {next.title} →
              </button>
            )}
          </nav>
        </article>
      )}
    </div>
  )
}
