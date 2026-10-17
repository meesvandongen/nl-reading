import { useEffect, useRef, useState } from 'preact/hooks'
import type { Sentence, Word } from '../lib/types'
import { formLabel, shortGloss, type Entry } from '../lib/dict'
import { isLookupWord, lemmaKey, sentenceText } from '../lib/analyze'
import { breakdownChain } from '../lib/gloss'
import { dictionary } from '../services/dictionary'
import { grammarTitle } from '../services/library'
import { cachedTranslation, deviceTranslation, translateOnDevice, webTranslators } from '../services/translate'
import { speak } from '../services/tts'
import { known, setKnown } from '../state/db'
import { navigate } from '../router'
import { EntryView } from './EntryView'
import { Icon } from './Icon'

export type LookupView = 'word' | 'sentence'

interface Result {
  entry: Entry
  /** what form of this entry the word is */
  form?: string
  label: string
  /** one part of a compound the dictionary doesn't have as a whole */
  part?: boolean
}

async function findResults(word: Word): Promise<Result[]> {
  const out: Result[] = []
  const seen = new Set<number>()
  const add = async (id: number | undefined, label: string, form?: string, part?: boolean) => {
    if (id === undefined || seen.has(id)) return
    const entry = await dictionary.entry(id)
    if (!entry) return
    seen.add(id)
    out.push({ entry, label, ...(form ? { form } : {}), ...(part ? { part } : {}) })
  }
  // the analyzer's reading first (for a separable verb: the whole verb)
  if (word.e !== undefined && !word.cp) await add(word.e, word.b ?? word.s.toLowerCase(), formLabel(word.c))
  // the parts of a compound the dictionary doesn't know as a whole
  for (const p of word.cp ?? []) await add(p.e, p.b, undefined, true)
  if (word.x) await add(word.x.e, word.x.b)
  // other words with this spelling (was: zijn / laundry / wax)
  if (word.p !== 'name' || word.e !== undefined) {
    for (const { entry, code } of await dictionary.lookup(word.s).catch(() => [])) {
      if (out.length >= 6) break
      if (seen.has(entry.i) || (entry.p === 'name' && word.p !== 'name')) continue
      seen.add(entry.i)
      out.push({ entry, label: entry.w, ...(code ? { form: formLabel(code) } : {}) })
    }
  }
  return out
}

const offlineMessage = (e: Error) =>
  navigator.onLine ? e.message : 'The dictionary is not available offline yet. Download it in Settings → Offline.'

const HOLD_HINT_KEY = 'nl-reading:hint-hold'
export function markHoldHintSeen() {
  try {
    localStorage.setItem(HOLD_HINT_KEY, '1')
  } catch {
    /* storage unavailable */
  }
}
function holdHintSeen() {
  try {
    return !!localStorage.getItem(HOLD_HINT_KEY)
  } catch {
    return true
  }
}

const wideQuery = typeof matchMedia !== 'undefined' ? matchMedia('(min-width: 900px)') : null

function useWide() {
  const [wide, setWide] = useState(!!wideQuery?.matches)
  useEffect(() => {
    const on = () => setWide(!!wideQuery?.matches)
    wideQuery?.addEventListener('change', on)
    return () => wideQuery?.removeEventListener('change', on)
  }, [])
  return wide
}

/**
 * Non-modal lookup panel docked to the bottom of the screen (to the side on wide screens).
 * It starts as a short "peek" so the sentence stays readable above it, can be expanded for
 * details, and the text behind it stays tappable so the next word replaces the current one.
 */
export function LookupPanel({
  sentence,
  word,
  view,
  storyId,
  onView,
  onWord,
  onClose,
  onPlayFrom,
  onLayout,
}: {
  sentence: Sentence
  word: Word | null
  view: LookupView
  storyId?: string
  onView: (v: LookupView) => void
  /** look up the word at this index of the sentence */
  onWord: (wi: number) => void
  onClose: () => void
  onPlayFrom?: () => void
  /** height the panel covers at the bottom of the viewport (0 when docked to the side) */
  onLayout: (l: { height: number; expanded: boolean }) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const wide = useWide()
  const ref = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const detailed = expanded || wide

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const report = () => onLayout({ height: wide ? 0 : el.offsetHeight, expanded })
    report()
    const ro = new ResizeObserver(report)
    ro.observe(el)
    return () => ro.disconnect()
  }, [wide, expanded])

  // New word or view: start at the top
  useEffect(() => {
    bodyRef.current?.scrollTo(0, 0)
  }, [word, sentence, view])

  // Swipe the handle up to expand, down to collapse / close
  const drag = useRef<{ y: number } | null>(null)
  const onGripDown = (e: PointerEvent) => {
    if ((e.target as HTMLElement).closest('button')) return
    drag.current = { y: e.clientY }
  }
  const onGripUp = (e: PointerEvent) => {
    if (!drag.current) return
    const dy = e.clientY - drag.current.y
    drag.current = null
    if (dy < -30) setExpanded(true)
    else if (dy > 30) expanded ? setExpanded(false) : onClose()
    else if ((e.target as HTMLElement).classList.contains('lp-handle')) setExpanded(!expanded)
  }

  return (
    <div
      ref={ref}
      class={`lookup-panel ${expanded ? 'expanded' : ''}`}
      role="dialog"
      aria-modal="false"
      aria-label={view === 'word' ? 'Word lookup' : 'Sentence'}
    >
      <div class="lp-grip" onPointerDown={onGripDown} onPointerUp={onGripUp} onPointerCancel={() => (drag.current = null)}>
        <div class="lp-handle" />
        <div class="lp-head">
          <div class="seg-control lp-tabs" role="tablist">
            <button role="tab" aria-selected={view === 'word'} class={view === 'word' ? 'on' : ''} disabled={!word} onClick={() => onView('word')}>
              Word
            </button>
            <button role="tab" aria-selected={view === 'sentence'} class={view === 'sentence' ? 'on' : ''} onClick={() => onView('sentence')}>
              Sentence
            </button>
          </div>
          <button
            class="icon-btn lp-expand"
            aria-label={expanded ? 'Show less' : 'Show more'}
            aria-expanded={expanded}
            onClick={() => setExpanded(!expanded)}
          >
            <Icon name={expanded ? 'down' : 'up'} />
          </button>
          <button class="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="close" />
          </button>
        </div>
      </div>
      <div class="lp-body" ref={bodyRef}>
        {view === 'word' && word ? (
          <WordView word={word} sentence={sentence} storyId={storyId} detailed={detailed} onMore={() => setExpanded(true)} />
        ) : (
          <SentenceView sentence={sentence} active={word} onWord={onWord} onPlayFrom={onPlayFrom} />
        )}
      </div>
    </div>
  )
}

function WordView({
  word,
  sentence,
  storyId,
  detailed,
  onMore,
}: {
  word: Word
  sentence: Sentence
  storyId?: string
  detailed: boolean
  onMore: () => void
}) {
  const [results, setResults] = useState<Result[] | null>(null)
  const [sel, setSel] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [showHint] = useState(() => !holdHintSeen())

  useEffect(() => {
    setResults(null)
    setSel(0)
    setError(null)
    let live = true
    findResults(word).then(
      (r) => live && setResults(r),
      (e) => live && setError(offlineMessage(e)),
    )
    return () => {
      live = false
    }
  }, [word])

  const key = lemmaKey(word)
  const isKnown = known.value.get(key)?.status === 'known'
  const current = results?.[sel]
  const ctx = { sentence: sentenceText(sentence), sentenceEn: sentence.en, surface: word.s, storyId }
  const chain = breakdownChain(word)
  const other = word.sp !== undefined ? sentence.w[word.sp] : undefined

  return (
    <div class="word-view">
      <div class="lp-surface" lang="nl">
        <span class="popup-surface">{word.s}</span>
        {other && (
          <span class="muted">
            {' '}
            … {other.s}
          </span>
        )}
        {word.b && word.b.toLowerCase() !== word.s.toLowerCase() && <span class="muted"> → {word.b}</span>}
      </div>

      {word.f &&
        (detailed ? (
          <div class="breakdown">
            <div class="section-label">What this form is</div>
            <ol>
              {word.f.map((s) => (
                <li>
                  <span class="bd-label">{s.l}</span>
                  {s.g && (
                    <button class="link small" onClick={() => navigate(`/grammar/${s.g}`)}>
                      {grammarTitle(s.g) ?? 'Learn'} →
                    </button>
                  )}
                </li>
              ))}
            </ol>
          </div>
        ) : chain.length ? (
          <div class="bd-chain">
            {chain.map((c, i) => (
              <>
                {i > 0 && <span class="muted"> + </span>}
                <span lang={i === 0 ? 'nl' : undefined} class={i === 0 ? 'bd-base' : ''}>
                  {c}
                </span>
              </>
            ))}
          </div>
        ) : null)}
      {word.t && (detailed || !word.f) && (
        <div class="grammar-links">
          {word.t
            .filter((g) => !word.f?.some((s) => s.g === g) || !detailed)
            .map((g) => (
              <button class="chip small" onClick={() => navigate(`/grammar/${g}`)}>
                <Icon name="grammar" size={14} /> {grammarTitle(g) ?? g}
              </button>
            ))}
        </div>
      )}
      {word.x && (
        <div class="story-meaning">
          <span class="badge">Expression</span> <b lang="nl">{word.x.b}</b> {word.x.h && <span>— {word.x.h}</span>}
        </div>
      )}

      {error && <div class="notice">{error}</div>}
      {!results && !error && <div class="loading">Looking up…</div>}
      {word.m && (
        <div class="story-meaning">
          <span class="badge">{word.p === 'name' ? 'Name' : 'In this story'}</span> {word.m}
        </div>
      )}
      {!word.m && word.p === 'name' && results && !results.length && (
        <div class="story-meaning">
          <span class="badge">Name</span> A proper noun (the name of a person, place or thing).
        </div>
      )}
      {results && results.length === 0 && !word.m && word.p !== 'name' && <div class="muted">No dictionary entry found.</div>}
      {results?.[0]?.part && <div class="muted small">Not in the dictionary as one word. A compound of:</div>}
      {word.m && results && results.length > 0 && <div class="muted small">Dictionary:</div>}
      {results && results.length > 1 && (
        <div class="result-tabs" role="tablist">
          {results.map((r, i) => (
            <button role="tab" aria-selected={i === sel} class={`chip small ${i === sel ? 'on' : ''}`} onClick={() => setSel(i)} lang="nl">
              {r.label}
              {results.filter((x) => x.label === r.label).length > 1 && <sup>{results.filter((x, j) => x.label === r.label && j <= i).length}</sup>}
            </button>
          ))}
        </div>
      )}
      {current && <EntryView entry={current.entry} ctx={ctx} compact={!detailed} form={current.form} />}

      {detailed ? (
        <div class="popup-footer">
          <label class="toggle">
            <input type="checkbox" checked={isKnown} onChange={() => setKnown(key, isKnown ? null : 'known')} />
            <span>I know this word</span>
          </label>
        </div>
      ) : (
        <button class="btn small ghost lp-more" onClick={onMore}>
          More details <Icon name="up" size={16} />
        </button>
      )}
      {showHint && <p class="muted small lp-hint">Tip: press and hold any word to translate its whole sentence.</p>}
    </div>
  )
}

interface Gloss {
  wi: number
  word: Word
  gloss?: string
}

/** Short meaning of each word, for a literal word-by-word reading of the sentence. */
async function sentenceGlosses(sentence: Sentence): Promise<Gloss[]> {
  return Promise.all(
    sentence.w.map(async (word, wi): Promise<Gloss | null> => {
      if (!isLookupWord(word)) return null
      if (word.m) return { wi, word, gloss: word.m }
      if (word.h) return { wi, word, gloss: word.h }
      const entry = word.e !== undefined ? await dictionary.entry(word.e).catch(() => undefined) : undefined
      return { wi, word, gloss: entry ? shortGloss(entry) : word.p === 'name' ? '(name)' : undefined }
    }),
  ).then((gs) => gs.filter((g): g is Gloss => !!g))
}

function SentenceView({
  sentence,
  active,
  onWord,
  onPlayFrom,
}: {
  sentence: Sentence
  active: Word | null
  onWord: (wi: number) => void
  onPlayFrom?: () => void
}) {
  const text = sentenceText(sentence)
  const [glosses, setGlosses] = useState<Gloss[] | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    setGlosses(null)
    let live = true
    sentenceGlosses(sentence).then((g) => live && setGlosses(g))
    return () => {
      live = false
    }
  }, [sentence])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <div class="sentence-view">
      <div class="lp-actions">
        <button class="chip small" onClick={() => speak(text)}>
          <Icon name="volume" size={14} /> Listen
        </button>
        {onPlayFrom && (
          <button class="chip small" onClick={onPlayFrom}>
            <Icon name="play" size={12} /> Play story from here
          </button>
        )}
        <button class="chip small" onClick={copy}>
          <Icon name={copied ? 'check' : 'copy'} size={14} /> {copied ? 'Copied' : 'Copy'}
        </button>
      </div>

      <div class="lp-translation">
        <div class="section-label">Translation</div>
        {sentence.en ? <p lang="en">{sentence.en}</p> : <MachineTranslation text={text} />}
      </div>

      <div class="section-label">Word by word</div>
      {!glosses && <div class="loading small">Looking up…</div>}
      {glosses && (
        <ul class="gloss-list">
          {glosses.map(({ wi, word, gloss }) => {
            const chain = breakdownChain(word).slice(1)
            return (
              <li>
                <button class={`gloss-row ${word === active ? 'on' : ''}`} onClick={() => onWord(wi)}>
                  <span class="gl-word" lang="nl">
                    {word.s}
                    {word.b && word.b.toLowerCase() !== word.s.toLowerCase() && <span class="gl-reading">{word.b}</span>}
                  </span>
                  <span class="gl-meaning">
                    {gloss ?? <span class="muted">—</span>}
                    {chain.length > 0 && <span class="gl-grammar">{chain.join(' + ')}</span>}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function MachineTranslation({ text }: { text: string }) {
  const [out, setOut] = useState<string | undefined>(() => cachedTranslation(text))
  const [state, setState] = useState<'checking' | 'unavailable' | 'downloadable' | 'working' | 'error'>('checking')
  const [progress, setProgress] = useState<number | null>(null)
  const current = useRef(text)
  current.current = text

  const run = () => {
    setState('working')
    translateOnDevice(text, setProgress).then(
      (t) => current.current === text && setOut(t),
      () => current.current === text && setState('error'),
    )
  }

  useEffect(() => {
    setOut(cachedTranslation(text))
    setProgress(null)
    if (cachedTranslation(text)) return
    let live = true
    deviceTranslation().then((a) => {
      if (!live) return
      if (a === 'available') run()
      else setState(a === 'unavailable' ? 'unavailable' : 'downloadable')
    })
    return () => {
      live = false
    }
  }, [text])

  return (
    <div>
      {out ? (
        <p lang="en">
          {out} <span class="muted small">(machine translation)</span>
        </p>
      ) : state === 'downloadable' ? (
        <button class="btn small" onClick={run}>
          <Icon name="translate" size={16} /> Translate on this device
        </button>
      ) : state === 'working' ? (
        <p class="muted small">{progress !== null && progress < 1 ? `Downloading language model… ${Math.round(progress * 100)}%` : 'Translating…'}</p>
      ) : state === 'error' ? (
        <p class="muted small">On-device translation failed.</p>
      ) : (
        <p class="muted small">This text has no translation. The word-by-word meanings below can help, or open it in a translator:</p>
      )}
      <div class="lp-links small">
        {out && <span class="muted">Compare: </span>}
        {webTranslators(text).map((t, i) => (
          <>
            {i > 0 && ' · '}
            <a class="link" href={t.url} target="_blank" rel="noopener noreferrer">
              {t.name} <Icon name="external" size={12} />
            </a>
          </>
        ))}
      </div>
    </div>
  )
}
