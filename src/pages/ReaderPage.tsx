import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks'
import type { Sentence, StoryDoc, Word } from '../lib/types'
import { isLookupWord, lemmaKey, sentenceText } from '../lib/analyze'
import { readingMinutes, CEFR_NAMES } from '../lib/levels'
import { getStory, library } from '../services/library'
import { cards, known, logActivity, progress, updateProgress } from '../state/db'
import { settings, FONTS } from '../state/settings'
import { playing, playQueue, pauseQueue, resumeQueue, seekQueue, stopQueue, ttsSupported } from '../services/tts'
import { toggleKeyword, cardId } from '../services/cards'
import { back, navigate } from '../router'
import { Icon } from '../components/Icon'
import { Article, CefrBadge, LevelBadge } from '../components/Badges'
import { LookupPanel, markHoldHintSeen, type LookupView } from '../components/LookupPanel'
import { ReaderSettings } from '../components/ReaderSettings'
import { Sheet } from '../components/Sheet'
import { recommend } from './LibraryPage'
import { StoryCard } from '../components/StoryCard'
import { getSeries, grammarTitle } from '../services/library'

interface Flat {
  s: Sentence
  ci: number
  pi: number
  si: number
}

export function ReaderPage({ id }: { id: string }) {
  const [doc, setDoc] = useState<StoryDoc | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    setDoc(null)
    setError(null)
    getStory(id).then(setDoc, (e) => setError(e.message))
    return () => stopQueue()
  }, [id])
  if (error)
    return (
      <div class="page">
        <div class="notice">{error}</div>
        <button class="btn" onClick={() => navigate('/')}>
          Back to library
        </button>
      </div>
    )
  if (!doc) return <div class="page loading">Loading story…</div>
  return <Reader doc={doc} />
}

function Reader({ doc }: { doc: StoryDoc }) {
  const id = doc.meta.id
  const s = settings.value
  // Lookup selection: a word (wi) in a sentence (si), shown as word details or the whole sentence
  const [sel, setSel] = useState<{ si: number; wi: number | null; view: LookupView } | null>(null)
  const [panel, setPanel] = useState({ height: 0, expanded: false })
  // set when a press-and-hold opened the sentence, so the click that ends it is ignored
  const held = useRef(false)
  const [showSettings, setShowSettings] = useState(false)
  const [hub, setHub] = useState(false)
  const [current, setCurrent] = useState(-1)
  const [revealed, setRevealed] = useState<Set<number>>(new Set())
  const textRef = useRef<HTMLDivElement>(null)
  const prog = progress.value.get(id)
  // Decided once: hiding the card when the position is first saved would make the text jump
  const [showKeywords] = useState(() => !prog?.position)

  // Flatten sentences for audio and progress
  const flat = useMemo(() => {
    const out: Flat[] = []
    doc.chapters.forEach((c, ci) => c.p.forEach((p, pi) => p.s.forEach((s, si) => out.push({ s, ci, pi, si }))))
    return out
  }, [doc])
  const flatIndex = useMemo(() => {
    const m = new Map<Sentence, number>()
    flat.forEach((f, i) => m.set(f.s, i))
    return m
  }, [flat])

  // Saved / known words for highlighting and adaptive gloss hints
  const savedWords = useMemo(() => {
    const set = new Set<string>()
    const mature = new Set<string>()
    for (const c of cards.value.values()) {
      set.add(c.id)
      if (c.interval >= 21) mature.add(c.id)
    }
    return { set, mature }
  }, [cards.value])
  const knownMap = known.value

  // Mark started, restore position
  useEffect(() => {
    updateProgress(id, { lastRead: Date.now() })
    const pos = progress.value.get(id)?.position ?? 0
    if (pos > 0 && !progress.value.get(id)?.completedAt) {
      requestAnimationFrame(() => {
        textRef.current?.querySelector(`[data-si="${pos}"]`)?.scrollIntoView({ block: 'center' })
      })
    }
  }, [id])

  // Track reading position
  useEffect(() => {
    const root = textRef.current
    if (!root) return
    let best = 0
    let timer: ReturnType<typeof setTimeout> | null = null
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            const i = Number((e.target as HTMLElement).dataset.si)
            if (i > best) best = i
          }
        }
        if (timer) clearTimeout(timer)
        timer = setTimeout(() => updateProgress(id, { position: best }), 800)
      },
      { threshold: 0.6 },
    )
    root.querySelectorAll('[data-si]').forEach((el) => io.observe(el))
    return () => {
      io.disconnect()
      if (timer) clearTimeout(timer)
    }
  }, [doc, s.translation])

  // Time spent reading (only while visible and recently active)
  useEffect(() => {
    let lastActive = Date.now()
    const poke = () => (lastActive = Date.now())
    const evs = ['pointerdown', 'scroll', 'keydown', 'wheel']
    evs.forEach((e) => window.addEventListener(e, poke, { passive: true }))
    const t = setInterval(() => {
      const listening = playing.value && !playing.value.paused
      if (document.visibilityState === 'visible' && (Date.now() - lastActive < 90_000 || listening)) {
        logActivity({ seconds: 15, storyId: id })
        const p = progress.value.get(id)
        updateProgress(id, { seconds: (p?.seconds ?? 0) + 15 })
      }
    }, 15_000)
    return () => {
      clearInterval(t)
      evs.forEach((e) => window.removeEventListener(e, poke))
    }
  }, [id])

  // Follow audio
  useEffect(() => {
    if (current < 0 || !s.autoScroll) return
    const el = textRef.current?.querySelector(`[data-si="${current}"]`)
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [current])
  useEffect(() => {
    if (!playing.value) setCurrent(-1)
  }, [playing.value])

  const startAudio = (from: number) => {
    playQueue(
      flat.map((f) => ({ text: sentenceText(f.s).replace(/[「」『』（）()]/g, ' ') })),
      from,
      (i) => setCurrent(i),
      { title: doc.meta.title, artist: doc.meta.author },
    )
  }

  const onTextClick = (e: MouseEvent) => {
    if (held.current) {
      held.current = false
      return
    }
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-w]')
    if (el) {
      const [si, wi] = el.dataset.w!.split('.').map(Number)
      setSel({ si, wi, view: 'word' })
      return
    }
    const tr = (e.target as HTMLElement).closest<HTMLElement>('[data-tr]')
    if (tr) {
      const i = Number(tr.dataset.tr)
      const next = new Set(revealed)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      setRevealed(next)
      return
    }
    // Tapping outside the words dismisses the lookup
    setSel(null)
  }

  // Press and hold selects the whole sentence. This replaces the browser's own
  // long-press (text selection, and on Android a web search of the selection).
  useEffect(() => {
    const root = textRef.current
    if (!root) return
    let timer: ReturnType<typeof setTimeout> | undefined
    let start = { x: 0, y: 0 }
    const openSentence = (target: EventTarget | null) => {
      const el = (target as HTMLElement | null)?.closest<HTMLElement>('[data-w], [data-si], [data-tr]')
      if (!el) return false
      const [si, wi] = el.dataset.w ? el.dataset.w.split('.').map(Number) : [Number(el.dataset.si ?? el.dataset.tr), null]
      held.current = true
      markHoldHintSeen()
      setSel({ si, wi, view: 'sentence' })
      return true
    }
    const cancel = () => {
      clearTimeout(timer)
      timer = undefined
    }
    const down = (e: PointerEvent) => {
      held.current = false
      cancel()
      if (e.button !== 0) return
      start = { x: e.clientX, y: e.clientY }
      const target = e.target
      timer = setTimeout(() => {
        timer = undefined
        if (openSentence(target)) navigator.vibrate?.(10)
      }, 450)
    }
    const move = (e: PointerEvent) => {
      if (timer && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 10) cancel()
    }
    // Right click, and the platform's own long-press gesture
    const menu = (e: MouseEvent) => {
      e.preventDefault()
      cancel()
      if (!held.current) openSentence(e.target)
    }
    root.addEventListener('pointerdown', down)
    root.addEventListener('pointermove', move)
    root.addEventListener('pointerup', cancel)
    root.addEventListener('pointercancel', cancel)
    root.addEventListener('contextmenu', menu)
    window.addEventListener('scroll', cancel, { passive: true })
    return () => {
      cancel()
      root.removeEventListener('pointerdown', down)
      root.removeEventListener('pointermove', move)
      root.removeEventListener('pointerup', cancel)
      root.removeEventListener('pointercancel', cancel)
      root.removeEventListener('contextmenu', menu)
      window.removeEventListener('scroll', cancel)
    }
  }, [doc])

  // Keep the selected sentence visible above the lookup panel
  useEffect(() => {
    if (!sel || panel.expanded) return
    const t = setTimeout(() => {
      const root = textRef.current
      const sentEl = root?.querySelector(`[data-si="${sel.si}"]`)
      if (!sentEl) return
      const wordEl = sel.wi !== null ? root!.querySelector(`[data-w="${sel.si}.${sel.wi}"]`) : null
      const top = (document.querySelector('.reader-bar')?.getBoundingClientRect().bottom ?? 0) + 8
      const bottom = window.innerHeight - panel.height - 24
      let r = sentEl.getBoundingClientRect()
      // A sentence taller than the free space: keep at least the word in view
      if (r.height > bottom - top && wordEl) r = wordEl.getBoundingClientRect()
      let dy = 0
      if (r.bottom > bottom) dy = r.bottom - bottom
      if (r.top - dy < top) dy = r.top - top
      if (Math.abs(dy) > 2) window.scrollBy({ top: dy, behavior: 'smooth' })
    }, 80)
    return () => clearTimeout(t)
  }, [sel?.si, sel?.wi, panel.height, panel.expanded])

  const closeLookup = useCallback(() => setSel(null), [])

  const glossShown = (w: Word): boolean => {
    // (the prefix of a separable verb: the verb part already shows the meaning)
    if (!w.h || w.m || w.p === 'name' || w.p === 'num' || w.p === 'prt') return false
    const key = lemmaKey(w)
    switch (s.glossScope) {
      case 'off':
        return false
      case 'all':
        return true
      case 'level':
        return (w.l ?? 6) > s.glossLevel
      case 'unknown':
        return knownMap.get(key)?.status !== 'known' && !savedWords.mature.has(key) && (w.l ?? 6) > 1
    }
  }

  const selWord = sel?.view === 'word' && sel.wi !== null ? flat[sel.si]?.s.w[sel.wi] : undefined

  const renderWord = (w: Word, si: number, wi: number) => {
    if (!isLookupWord(w)) return w.s + (w.ws ?? '')
    const cls = ['w']
    if (s.articleColors && w.p === 'n' && w.a) cls.push(`art-${w.a === 'het' ? 'het' : w.a === 'de' ? 'de' : 'both'}`)
    if (s.levelHighlight && w.l) cls.push(`lv-${w.l}`)
    if (s.highlightSaved && savedWords.set.has(lemmaKey(w))) cls.push('saved')
    if (sel?.view === 'word' && sel.si === si && sel.wi === wi) cls.push('active')
    // the other half of a separable verb lights up too (bel … op)
    else if (selWord && sel!.si === si && selWord.sp === wi) cls.push('active partner')
    // the meaning sits above the word without widening it (unlike <ruby>)
    const gloss = glossShown(w) ? w.h : undefined
    if (gloss) cls.push('gl')
    return (
      <>
        <span class={cls.join(' ')} data-w={`${si}.${wi}`} data-gloss={gloss}>
          {w.s}
        </span>
        {w.ws}
      </>
    )
  }

  const renderSentence = (sent: Sentence) => {
    const si = flatIndex.get(sent)!
    return (
      <span class={`sent ${current === si ? 'playing' : ''} ${sel?.si === si ? `sel-${sel.view}` : ''}`} data-si={si}>
        {sent.w.map((w, wi) => renderWord(w, si, wi))}
      </span>
    )
  }

  const finish = async () => {
    const p = progress.value.get(id)
    const first = !p?.completedAt
    await updateProgress(id, { completedAt: Date.now(), timesCompleted: (p?.timesCompleted ?? 0) + 1, position: 0 })
    await logActivity({ stories: 1, words: doc.meta.words, storyId: id })
    if (first) window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })
  }

  const completed = !!prog?.completedAt
  const font = FONTS[s.fontFamily].css
  // meanings above words need room between the lines
  const style = { fontFamily: font, fontSize: `${s.fontSize}px`, lineHeight: s.glossScope !== 'off' ? s.lineHeight + 0.4 : s.lineHeight }
  const series = getSeries(doc.meta.series)
  const nextEpisodeId = series && doc.meta.episode ? series.episodes[doc.meta.episode] : undefined
  const nextEpisode = nextEpisodeId ? library.value?.stories.find((m) => m.id === nextEpisodeId) : undefined
  const next = useMemo(() => recommend(5, id).filter((m) => m.id !== nextEpisodeId).slice(0, 4), [id, progress.value])
  const grammarInStory = useMemo(() => {
    const counts = new Map<string, number>()
    for (const f of flat) for (const w of f.s.w) for (const g of w.t ?? []) counts.set(g, (counts.get(g) ?? 0) + 1)
    return [...counts.entries()].sort((a, b) => b[1] - a[1])
  }, [flat])
  const savedFromStory = [...cards.value.values()].filter((c) => c.storyId === id)

  return (
    <div
      class={`reader ${sel ? 'lookup-open' : ''} ${s.glossScope !== 'off' ? 'with-gloss' : ''}`}
      style={sel ? { '--panel-h': `${panel.height}px` } : undefined}
    >
      <header class="topbar reader-bar">
        <button class="icon-btn" onClick={() => back('/')} aria-label="Back">
          <Icon name="back" />
        </button>
        <div class="topbar-title" lang="nl">
          {doc.meta.title}
        </div>
        <button
          class={`icon-btn ${s.translation !== 'off' ? 'on' : ''}`}
          aria-label="Toggle translations"
          title="Translations"
          disabled={!doc.meta.translated && !flat.some((f) => f.s.en)}
          onClick={() => settings.value = { ...s, translation: s.translation === 'off' ? 'sentence' : 'off' }}
        >
          <Icon name="translate" />
        </button>
        <button class="icon-btn" aria-label="Resources" title="Keywords, saved words, grammar" onClick={() => setHub(true)}>
          <Icon name="list" />
        </button>
        <button class="icon-btn text-btn" aria-label="Reading settings" title="Reading settings" onClick={() => setShowSettings(true)}>
          Aa
        </button>
      </header>

      <div class="reader-scroll">
        <div class="reader-head">
          {series && (
            <button class="series-link" onClick={() => navigate(`/series/${encodeURIComponent(series.id)}`)}>
              <span lang="nl">{series.title}</span> · Episode {doc.meta.episode} of {series.episodes.length}
              <Icon name="list" size={14} />
            </button>
          )}
          <div class="reader-meta">
            <LevelBadge level={doc.meta.level} />
            <span class="muted small">
              {doc.meta.words.toLocaleString()} words · ~{readingMinutes(doc.meta.words, doc.meta.level)} min
            </span>
          </div>
          <h1 lang="nl" style={{ fontFamily: font }}>
            {doc.meta.title}
          </h1>
          {doc.meta.title_en && <div class="subtitle">{doc.meta.title_en}</div>}
          {doc.meta.author && <div class="muted small">{doc.meta.author}</div>}
          {doc.keywords.length > 0 && showKeywords && (
            <details class="keywords-card" open={!prog?.completedAt}>
              <summary>Keywords · {doc.keywords.length}</summary>
              <KeywordList doc={doc} />
            </details>
          )}
        </div>

        <div ref={textRef} class={`reader-text tr-${s.translation}`} style={style} lang="nl" onClick={onTextClick}>
          {doc.chapters.map((c) => (
            <section class="chapter">
              {c.title && <h2 class="chapter-title">{c.title}</h2>}
              {c.p.map((p) =>
                s.translation === 'sentence' ? (
                  <div class="para">
                    {p.s.map((sent) => {
                      const si = flatIndex.get(sent)!
                      return (
                        <div class="sent-block">
                          {renderSentence(sent)}
                          {sent.en && (
                            <div class={`tr ${revealed.has(si) ? 'shown' : ''}`} lang="en" data-tr={si}>
                              {sent.en}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div class="para">
                    <p>{p.s.map((x, i) => [renderSentence(x), i < p.s.length - 1 ? ' ' : null])}</p>
                    {s.translation === 'paragraph' && p.s.some((x) => x.en) && (
                      <div class="tr shown" lang="en">
                        {p.s.map((x) => x.en).filter(Boolean).join(' ')}
                      </div>
                    )}
                  </div>
                ),
              )}
            </section>
          ))}
        </div>

        <div class="reader-end">
          {completed ? (
            <div class="done-card">
              <div class="done-icon">
                <Icon name="check" size={32} />
              </div>
              <div>
                <b>Finished!</b> {prog?.timesCompleted && prog.timesCompleted > 1 ? `Read ${prog.timesCompleted} times.` : ''}
              </div>
              <button class="btn ghost" onClick={finish}>
                Read again ✓
              </button>
            </div>
          ) : (
            <button class="btn primary big" onClick={finish}>
              <Icon name="check" /> Mark as finished
            </button>
          )}
          {doc.meta.source && (
            <p class="muted small">
              Source:{' '}
              <a href={doc.meta.source} target="_blank" rel="noopener noreferrer">
                {doc.meta.source}
              </a>{' '}
              · {doc.meta.license}
            </p>
          )}
          {completed && nextEpisode && (
            <div class="next-up next-episode">
              <h3>Next episode</h3>
              <StoryCard meta={nextEpisode} />
            </div>
          )}
          {completed && series && !nextEpisode && (
            <button class="series-finale" onClick={() => navigate(`/series/${encodeURIComponent(series.id)}`)}>
              <b>That was the last episode of <span lang="nl">{series.title}</span>.</b>
              <span class="muted small">See the whole series</span>
            </button>
          )}
          {completed && next.length > 0 && (
            <div class="next-up">
              <h3>Read next</h3>
              <div class="story-grid">
                {next.map((m) => (
                  <StoryCard meta={m} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {ttsSupported && (
        <AudioBar
          playingState={playing.value}
          onPlay={() => {
            if (playing.value?.paused) resumeQueue()
            else startAudio(Math.max(0, prog?.completedAt ? 0 : prog?.position ?? 0))
          }}
          onPause={pauseQueue}
          onStop={stopQueue}
          onPrev={() => seekQueue((playing.value?.index ?? 1) - 1)}
          onNext={() => seekQueue((playing.value?.index ?? -1) + 1)}
          chapters={doc.chapters.map((c, ci) => ({ title: c.title ?? `Part ${ci + 1}`, start: flat.findIndex((f) => f.ci === ci) }))}
          onChapter={(i) => startAudio(i)}
        />
      )}

      {sel && (
        <LookupPanel
          sentence={flat[sel.si].s}
          word={sel.wi !== null ? flat[sel.si].s.w[sel.wi] : null}
          view={sel.view}
          storyId={id.startsWith('my-') ? undefined : id}
          onView={(view) => setSel({ ...sel, view })}
          onWord={(wi) => setSel({ si: sel.si, wi, view: 'word' })}
          onClose={closeLookup}
          onPlayFrom={
            ttsSupported
              ? () => {
                  const from = sel.si
                  setSel(null)
                  startAudio(from)
                }
              : undefined
          }
          onLayout={setPanel}
        />
      )}
      <ReaderSettings open={showSettings} onClose={() => setShowSettings(false)} />
      <Sheet open={hub} onClose={() => setHub(false)} title="Resources">
        <ResourceHub doc={doc} grammar={grammarInStory} saved={savedFromStory} />
      </Sheet>
    </div>
  )
}

function KeywordList({ doc }: { doc: StoryDoc }) {
  return (
    <ul class="keyword-list">
      {doc.keywords.map((k) => {
        const m = /^(de|het|de\/het)\s+(.+)$/i.exec(k.w)
        const word = m ? m[2] : k.w
        const saved = cards.value.has(cardId(word))
        return (
          <li>
            <div>
              <span class="kw-word" lang="nl">
                {m && <Article a={m[1].toLowerCase()} />} {word}
              </span>{' '}
              <CefrBadge level={k.l} />
              <div class="small">{k.m}</div>
            </div>
            <button
              class={`icon-btn save ${saved ? 'on' : ''}`}
              aria-label={saved ? 'Remove from flashcards' : 'Save to flashcards'}
              onClick={() => toggleKeyword(k.w, k.m, k.l, doc.meta.id.startsWith('my-') ? undefined : doc.meta.id)}
            >
              <Icon name="star" fill={saved} />
            </button>
          </li>
        )
      })}
    </ul>
  )
}

function ResourceHub({ doc, grammar, saved }: { doc: StoryDoc; grammar: [string, number][]; saved: { id: string; word: string; article?: string; meaning: string }[] }) {
  const [tab, setTab] = useState<'keywords' | 'saved' | 'grammar' | 'info'>(doc.keywords.length ? 'keywords' : 'grammar')
  const known = library.value?.grammar
  return (
    <div class="hub">
      <div class="tabs">
        {(['keywords', 'saved', 'grammar', 'info'] as const).map((t) => (
          <button class={`tab ${tab === t ? 'on' : ''}`} onClick={() => setTab(t)}>
            {t === 'keywords' ? 'Keywords' : t === 'saved' ? `Saved (${saved.length})` : t === 'grammar' ? 'Grammar' : 'About'}
          </button>
        ))}
      </div>
      {tab === 'keywords' && (doc.keywords.length ? <KeywordList doc={doc} /> : <p class="muted">No keywords for this text.</p>)}
      {tab === 'saved' &&
        (saved.length ? (
          <ul class="word-list">
            {saved.map((c) => (
              <li>
                <b lang="nl">
                  {c.article && <Article a={c.article} />} {c.word}
                </b>
                <div class="small">{c.meaning}</div>
              </li>
            ))}
          </ul>
        ) : (
          <p class="muted">Tap a word and press ★ to save it to your flashcards.</p>
        ))}
      {tab === 'grammar' && (
        <ul class="grammar-used">
          {grammar
            .filter(([g]) => known?.some((k) => k.id === g))
            .map(([g, n]) => (
              <li>
                <button class="link" onClick={() => navigate(`/grammar/${g}`)}>
                  {grammarTitle(g)}
                </button>{' '}
                <span class="muted small">×{n}</span>
              </li>
            ))}
        </ul>
      )}
      {tab === 'info' && (
        <div class="story-info">
          {doc.meta.summary && <p>{doc.meta.summary}</p>}
          <p class="small">
            <LevelBadge level={doc.meta.level} /> {doc.meta.sentences} sentences · {doc.meta.words.toLocaleString()} words
            {doc.meta.lemmas ? ` · ${doc.meta.lemmas} unique words` : ''}
          </p>
          {doc.meta.cefr && <CefrBar dist={doc.meta.cefr} />}
          {doc.meta.author && <p class="small">Author: {doc.meta.author}</p>}
          {doc.meta.license && <p class="small">License: {doc.meta.license}</p>}
          {doc.meta.source && (
            <p class="small">
              Source: <a href={doc.meta.source} target="_blank" rel="noopener noreferrer">{doc.meta.source}</a>
            </p>
          )}
        </div>
      )}
    </div>
  )
}

export function CefrBar({ dist }: { dist: number[] }) {
  const total = dist.reduce((a, b) => a + b, 0) || 1
  const order = [1, 2, 3, 4, 5, 6, 0]
  return (
    <div>
      <div class="cefr-bar" role="img" aria-label="Vocabulary by level">
        {order.map((l) => (dist[l] ? <span class={`seg lv-bg-${l}`} style={{ width: `${(dist[l] / total) * 100}%` }} title={`${l ? CEFR_NAMES[l] : 'Other'}: ${dist[l]}`} /> : null))}
      </div>
      <div class="cefr-legend small">
        {order.map((l) =>
          dist[l] ? (
            <span>
              <i class={`dot lv-bg-${l}`} /> {l ? CEFR_NAMES[l] : 'Other'} {Math.round((dist[l] / total) * 100)}%
            </span>
          ) : null,
        )}
      </div>
      <p class="muted small">Word levels are estimated from how common each word is.</p>
    </div>
  )
}

function AudioBar({
  playingState,
  onPlay,
  onPause,
  onStop,
  onPrev,
  onNext,
  chapters,
  onChapter,
}: {
  playingState: { index: number; total: number; paused: boolean } | null
  onPlay: () => void
  onPause: () => void
  onStop: () => void
  onPrev: () => void
  onNext: () => void
  chapters: { title: string; start: number }[]
  onChapter: (start: number) => void
}) {
  const s = settings.value
  const [chOpen, setChOpen] = useState(false)
  const active = !!playingState
  const isPlaying = active && !playingState!.paused
  const RATES = [0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.25, 1.5]
  return (
    <div class={`audio-bar ${active ? 'active' : ''}`}>
      {active && (
        <button class="icon-btn" onClick={onPrev} aria-label="Previous sentence">
          <Icon name="prev" />
        </button>
      )}
      <button class="icon-btn play" onClick={isPlaying ? onPause : onPlay} aria-label={isPlaying ? 'Pause' : 'Listen'}>
        <Icon name={isPlaying ? 'pause' : 'play'} fill />
      </button>
      {active && (
        <button class="icon-btn" onClick={onNext} aria-label="Next sentence">
          <Icon name="next" />
        </button>
      )}
      {active ? (
        <div class="audio-progress">
          <div class="bar">
            <span style={{ width: `${((playingState!.index + 1) / playingState!.total) * 100}%` }} />
          </div>
          <span class="small muted">
            {playingState!.index + 1}/{playingState!.total}
          </span>
        </div>
      ) : (
        <span class="audio-hint small muted">Listen to this story</span>
      )}
      <select
        class="rate"
        value={String(s.rate)}
        aria-label="Speed"
        onChange={(e) => (settings.value = { ...s, rate: Number((e.target as HTMLSelectElement).value) })}
      >
        {RATES.map((r) => (
          <option value={String(r)}>{r}×</option>
        ))}
      </select>
      {chapters.length > 1 && (
        <button class="icon-btn" onClick={() => setChOpen(true)} aria-label="Chapters">
          <Icon name="list" />
        </button>
      )}
      {active && (
        <button class="icon-btn" onClick={onStop} aria-label="Stop">
          <Icon name="stop" />
        </button>
      )}
      <Sheet open={chOpen} onClose={() => setChOpen(false)} title="Listen from chapter">
        <ul class="chapter-list">
          {chapters.map((c) => (
            <li>
              <button
                class="link"
                onClick={() => {
                  setChOpen(false)
                  onChapter(c.start)
                }}
              >
                <Icon name="play" size={14} /> <span lang="nl">{c.title}</span>
              </button>
            </li>
          ))}
        </ul>
      </Sheet>
    </div>
  )
}
