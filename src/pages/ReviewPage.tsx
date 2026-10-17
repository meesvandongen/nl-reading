import { useEffect, useMemo, useState } from 'preact/hooks'
import { activity, cards, deleteCard, logActivity, today, type Card } from '../state/db'
import { settings, updateSettings, type ReviewMode } from '../state/settings'
import { cardStage, isDue, previewInterval, schedule, type Grade } from '../services/srs'
import { exportCardsTsv, recordReview } from '../services/cards'
import { speak } from '../services/tts'
import { navigate, route } from '../router'
import { Icon } from '../components/Icon'
import { Article, CefrBadge } from '../components/Badges'
import { PracticePage } from './PracticePage'

function buildQueue(): Card[] {
  const all = [...cards.value.values()]
  const now = Date.now()
  const due = all.filter((c) => isDue(c, now)).sort((a, b) => a.due - b.due)
  const introduced = activity.value.get(today())?.newCards ?? 0
  const newLimit = Math.max(0, settings.value.newPerDay - introduced)
  const fresh = all
    .filter((c) => c.state === 'new')
    .sort((a, b) => a.created - b.created)
    .slice(0, newLimit)
  return [...due, ...fresh]
}

const say = (c: Card) => speak(c.word, { recording: c.audio })

export function ReviewPage() {
  const tab = route.value.query.get('tab') ?? 'review'
  return (
    <div class="page review">
      <header class="page-head">
        <h1>Flashcards</h1>
        <div class="tabs">
          <button class={`tab ${tab === 'review' ? 'on' : ''}`} onClick={() => navigate('/review', { replace: true })}>
            Review
          </button>
          <button class={`tab ${tab === 'practice' ? 'on' : ''}`} onClick={() => navigate('/review?tab=practice', { replace: true })}>
            Practice
          </button>
          <button class={`tab ${tab === 'words' ? 'on' : ''}`} onClick={() => navigate('/review?tab=words', { replace: true })}>
            My words ({cards.value.size})
          </button>
        </div>
      </header>
      {tab === 'words' ? <WordList /> : tab === 'practice' ? <PracticePage /> : <ReviewHome />}
    </div>
  )
}

function ReviewHome() {
  const [session, setSession] = useState<Card[] | null>(null)
  const counts = useMemo(() => {
    const all = [...cards.value.values()]
    const now = Date.now()
    const introduced = activity.value.get(today())?.newCards ?? 0
    return {
      due: all.filter((c) => isDue(c, now)).length,
      fresh: Math.min(all.filter((c) => c.state === 'new').length, Math.max(0, settings.value.newPerDay - introduced)),
      total: all.length,
      mature: all.filter((c) => cardStage(c) === 'mature').length,
      reviewsToday: activity.value.get(today())?.reviews ?? 0,
    }
  }, [cards.value, activity.value, settings.value.newPerDay])

  if (session) return <Session queue={session} onDone={() => setSession(null)} />
  const s = settings.value
  return (
    <div class="review-home">
      <div class="stat-row">
        <div class="stat">
          <b>{counts.due}</b>
          <span>due</span>
        </div>
        <div class="stat">
          <b>{counts.fresh}</b>
          <span>new today</span>
        </div>
        <div class="stat">
          <b>{counts.reviewsToday}</b>
          <span>reviewed today</span>
        </div>
        <div class="stat">
          <b>{counts.mature}</b>
          <span>learned</span>
        </div>
      </div>
      {counts.total === 0 ? (
        <div class="empty">
          <p>No flashcards yet.</p>
          <p class="muted">While reading, tap a word and press ★ to save it. It will show up here with the sentence you found it in.</p>
          <div class="row-inline wrap center">
            <button class="btn" onClick={() => navigate('/')}>
              Find something to read
            </button>
            <button class="btn ghost" onClick={() => navigate('/review?tab=practice')}>
              Practise de/het and verbs
            </button>
          </div>
        </div>
      ) : (
        <>
          <button class="btn primary big" disabled={counts.due + counts.fresh === 0} onClick={() => setSession(buildQueue())}>
            <Icon name="cards" /> {counts.due + counts.fresh ? `Review ${counts.due + counts.fresh} cards` : 'All done for now 🎉'}
          </button>
          <div class="setting">
            <div class="setting-label">Card type</div>
            <div class="seg-control">
              {(
                [
                  ['recognition', 'Dutch → English'],
                  ['listening', 'Listen → English'],
                  ['production', 'English → Dutch'],
                ] as [ReviewMode, string][]
              ).map(([m, label]) => (
                <button class={s.reviewMode === m ? 'on' : ''} onClick={() => updateSettings({ reviewMode: m })}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <label class="toggle row">
            <span>
              Ask de or het for nouns
              <span class="muted small block">Pick the article before you turn the card</span>
            </span>
            <input type="checkbox" checked={s.reviewArticle} onChange={(e) => updateSettings({ reviewArticle: (e.target as HTMLInputElement).checked })} />
          </label>
          <label class="toggle row">
            <span>Show example sentence on the front</span>
            <input type="checkbox" checked={s.reviewShowSentence} onChange={(e) => updateSettings({ reviewShowSentence: (e.target as HTMLInputElement).checked })} />
          </label>
          <label class="toggle row">
            <span>Play audio automatically</span>
            <input type="checkbox" checked={s.autoplayCardAudio} onChange={(e) => updateSettings({ autoplayCardAudio: (e.target as HTMLInputElement).checked })} />
          </label>
          <div class="setting">
            <div class="setting-label">
              New cards per day <span class="muted">{s.newPerDay}</span>
            </div>
            <input type="range" min="0" max="50" step="1" value={s.newPerDay} onInput={(e) => updateSettings({ newPerDay: Number((e.target as HTMLInputElement).value) })} />
          </div>
        </>
      )}
    </div>
  )
}

function Highlight({ sentence, surface }: { sentence: string; surface?: string }) {
  const i = surface ? sentence.toLowerCase().indexOf(surface.toLowerCase()) : -1
  if (i < 0) return <>{sentence}</>
  return (
    <>
      {sentence.slice(0, i)}
      <mark>{sentence.slice(i, i + surface!.length)}</mark>
      {sentence.slice(i + surface!.length)}
    </>
  )
}

function Session({ queue: initial, onDone }: { queue: Card[]; onDone: () => void }) {
  const [queue, setQueue] = useState(initial)
  const [flipped, setFlipped] = useState(false)
  const [guess, setGuess] = useState<string | null>(null)
  const [done, setDone] = useState(0)
  const card = queue[0]
  const mode = settings.value.reviewMode
  const showSentence = settings.value.reviewShowSentence
  // the article question: nouns with a clear de or het, when the front shows the Dutch word
  const askArticle = !!card && settings.value.reviewArticle && (card.article === 'de' || card.article === 'het') && mode !== 'production'

  useEffect(() => {
    if (!card) return
    if (mode === 'listening' || settings.value.autoplayCardAudio) say(card)
  }, [card?.id, mode])

  const answer = async (g: Grade) => {
    if (!card) return
    const wasNew = card.state === 'new'
    const next = schedule(card, g)
    await recordReview(next)
    if (wasNew) await logActivity({ newCards: 1 })
    const rest = queue.slice(1)
    // Cards still in learning come back in this session
    if (next.due - Date.now() < 20 * 60 * 1000) rest.push(next)
    setQueue(rest)
    setFlipped(false)
    setGuess(null)
    setDone((d) => d + 1)
  }

  const pickArticle = (a: string) => {
    setGuess(a)
    setFlipped(true)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return
      if (!flipped && askArticle && (e.key === 'd' || e.key === 'h')) pickArticle(e.key === 'd' ? 'de' : 'het')
      else if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault()
        setFlipped(true)
      } else if (flipped && ['1', '2', '3', '4'].includes(e.key)) {
        answer((['again', 'hard', 'good', 'easy'] as Grade[])[Number(e.key) - 1])
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (!card)
    return (
      <div class="empty">
        <p class="big-emoji">🎉</p>
        <p>
          Session complete — {done} review{done === 1 ? '' : 's'}.
        </p>
        <button class="btn primary" onClick={onDone}>
          Done
        </button>
      </div>
    )

  const surface = card.surface ?? card.word
  return (
    <div class="session">
      <div class="session-top">
        <button class="icon-btn" onClick={onDone} aria-label="End session">
          <Icon name="close" />
        </button>
        <div class="bar">
          <span style={{ width: `${(done / (done + queue.length)) * 100}%` }} />
        </div>
        <span class="small muted">{queue.length} left</span>
      </div>
      <div class={`flashcard ${flipped ? 'flipped' : ''}`} onClick={() => !flipped && !askArticle && setFlipped(true)}>
        <div class="fc-front">
          {mode === 'recognition' && (
            <div class="fc-word" lang="nl">
              {askArticle ? <span class="article-blank">___</span> : <Article a={card.article} />} {card.word}
            </div>
          )}
          {mode === 'listening' && (
            <button
              class="btn ghost big"
              onClick={(e) => {
                e.stopPropagation()
                say(card)
              }}
            >
              <Icon name="volume" size={32} /> Listen
            </button>
          )}
          {mode === 'production' && <div class="fc-meaning big">{card.meaning}</div>}
          {showSentence && card.sentence && mode !== 'production' && (
            <div class="fc-sentence" lang="nl">
              {mode === 'listening' ? card.sentence.replace(new RegExp(surface.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), '＿＿') : <Highlight sentence={card.sentence} surface={surface} />}
            </div>
          )}
          {!flipped && askArticle && (
            <div class="article-pick">
              <button class="btn art-btn de" onClick={(e) => (e.stopPropagation(), pickArticle('de'))}>
                de
              </button>
              <button class="btn art-btn het" onClick={(e) => (e.stopPropagation(), pickArticle('het'))}>
                het
              </button>
            </div>
          )}
          {!flipped && !askArticle && <div class="muted small tap-hint">Tap or press space to show the answer</div>}
        </div>
        {flipped && (
          <div class="fc-back">
            {guess && (
              <div class={`article-result ${guess === card.article ? 'right' : 'wrong'}`}>
                {guess === card.article ? `Yes: ${card.article} ${card.word}` : `Not ${guess}: it's ${card.article} ${card.word}`}
              </div>
            )}
            <div class="fc-word" lang="nl">
              <Article a={card.article} /> {card.word}
              <button
                class="icon-btn"
                onClick={(e) => {
                  e.stopPropagation()
                  say(card)
                }}
                aria-label="Listen"
              >
                <Icon name="volume" />
              </button>
            </div>
            <div class="fc-reading">
              {card.forms && <span class="muted">{card.forms}</span>} <CefrBadge level={card.level} />
            </div>
            <div class="fc-meaning">{card.meaning}</div>
            {card.sentence && (
              <div class="fc-sentence" lang="nl">
                <Highlight sentence={card.sentence} surface={surface} />
                <button
                  class="icon-btn small"
                  onClick={(e) => {
                    e.stopPropagation()
                    speak(card.sentence!)
                  }}
                  aria-label="Play sentence"
                >
                  <Icon name="volume" size={16} />
                </button>
                {card.sentenceEn && (
                  <div class="muted small" lang="en">
                    {card.sentenceEn}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
      {flipped ? (
        <div class="grade-buttons">
          {(
            [
              ['again', '😞', 'Again'],
              ['hard', '😐', 'Hard'],
              ['good', '🙂', 'Good'],
              ['easy', '😄', 'Easy'],
            ] as [Grade, string, string][]
          ).map(([g, emoji, label]) => (
            <button class={`grade ${g}`} onClick={() => answer(g)}>
              <span class="emoji">{emoji}</span>
              <span>{label}</span>
              <span class="small muted">{previewInterval(card, g)}</span>
            </button>
          ))}
        </div>
      ) : askArticle ? (
        <button class="btn ghost big" onClick={() => setFlipped(true)}>
          Skip and show answer
        </button>
      ) : (
        <button class="btn primary big" onClick={() => setFlipped(true)}>
          Show answer
        </button>
      )}
    </div>
  )
}

function WordList() {
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<'recent' | 'due' | 'az'>('recent')
  const list = useMemo(() => {
    const term = q.trim().toLowerCase()
    const all = [...cards.value.values()].filter((c) => !term || c.word.toLowerCase().includes(term) || c.meaning.toLowerCase().includes(term))
    if (sort === 'recent') all.sort((a, b) => b.created - a.created)
    if (sort === 'due') all.sort((a, b) => a.due - b.due)
    if (sort === 'az') all.sort((a, b) => a.word.localeCompare(b.word, 'nl'))
    return all
  }, [cards.value, q, sort])

  const download = () => {
    const blob = new Blob([exportCardsTsv(list)], { type: 'text/tab-separated-values' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'nl-reading-flashcards.txt'
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <div class="word-list-page">
      <div class="row-inline">
        <div class="search-box grow">
          <Icon name="search" size={18} />
          <input type="search" placeholder="Search your words" value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} />
        </div>
        <select value={sort} onChange={(e) => setSort((e.target as HTMLSelectElement).value as typeof sort)} aria-label="Sort">
          <option value="recent">Newest</option>
          <option value="due">Due</option>
          <option value="az">A→Z</option>
        </select>
      </div>
      <ul class="word-list">
        {list.map((c) => (
          <li>
            <div class="grow" onClick={() => navigate(`/dictionary?q=${encodeURIComponent(c.word)}`)}>
              <span class="kw-word" lang="nl">
                <Article a={c.article} /> {c.word}
              </span>{' '}
              <CefrBadge level={c.level} /> <span class={`stage stage-${cardStage(c)}`}>{cardStage(c)}</span>
              <div class="small">{c.meaning}</div>
              {c.sentence && (
                <div class="small muted" lang="nl">
                  {c.sentence}
                </div>
              )}
            </div>
            <button class="icon-btn" aria-label="Listen" onClick={() => say(c)}>
              <Icon name="volume" size={18} />
            </button>
            <button
              class="icon-btn"
              aria-label="Delete"
              onClick={() => {
                if (confirm(`Remove ${c.word} from your flashcards?`)) deleteCard(c.id)
              }}
            >
              <Icon name="trash" size={18} />
            </button>
          </li>
        ))}
      </ul>
      {list.length > 0 && (
        <button class="btn ghost" onClick={download}>
          <Icon name="download" size={18} /> Export for Anki (.txt)
        </button>
      )}
    </div>
  )
}
