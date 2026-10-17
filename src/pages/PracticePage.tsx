// Drills for the two things every learner of Dutch has to memorize: whether a
// noun is a de-word or a het-word, and the forms of the strong and irregular
// verbs. The word lists come from the dictionary build (data/practice.json,
// precached with the app).

import { useEffect, useMemo, useState } from 'preact/hooks'
import { cards } from '../state/db'
import { speak } from '../services/tts'
import { navigate } from '../router'
import { CEFR_NAMES } from '../lib/levels'
import { Icon } from '../components/Icon'
import { Article, CefrBadge } from '../components/Badges'

/** [word, article, gloss, level] */
type Noun = [string, 'de' | 'het', string, number]
/** [infinitive, past, past plural, participle, aux, gloss, level] */
type Verb = [string, string, string, string, string, string, number]

let dataP: Promise<{ nouns: Noun[]; verbs: Verb[] }> | null = null
function practiceData() {
  if (!dataP) {
    dataP = fetch('data/practice.json').then((r) => {
      if (!r.ok) throw new Error('Practice data not available')
      return r.json()
    })
    dataP.catch(() => (dataP = null))
  }
  return dataP
}

function shuffle<T>(list: T[]): T[] {
  const a = [...list]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** A rule of thumb that explains this noun's article, if one applies. */
export function articleRule(word: string, article: string): string | undefined {
  const w = word.toLowerCase()
  if (article === 'het' && /(je|tje|pje|kje)$/.test(w)) return 'Diminutives (-je) are always het-words.'
  if (article === 'de' && /(ing|heid|teit|tie|sie|ij|ica|ade|ide|ude|ure|uur|nis|ster|schap)$/.test(w)) {
    if (/ing$/.test(w)) return 'Nouns ending in -ing are de-words.'
    if (/heid$/.test(w)) return 'Nouns ending in -heid are de-words.'
    if (/(tie|sie)$/.test(w)) return 'Nouns ending in -tie and -sie are de-words.'
    if (/teit$/.test(w)) return 'Nouns ending in -teit are de-words.'
  }
  if (article === 'het' && /(ment|um|isme|sel|aat|ium)$/.test(w)) {
    if (/ment$/.test(w)) return 'Nouns ending in -ment are usually het-words.'
    if (/um$/.test(w)) return 'Nouns ending in -um are usually het-words.'
    if (/isme$/.test(w)) return 'Nouns ending in -isme are het-words.'
  }
  if (article === 'het' && /^(ge|be|ver|ont)/.test(w) && w.length > 5) return 'Many nouns starting with ge-, be-, ver- or ont- are het-words.'
  return undefined
}

const STATS_KEY = 'nl-reading:practice'
function loadStats(): { dehet: number; verbs: number } {
  try {
    return { dehet: 0, verbs: 0, ...JSON.parse(localStorage.getItem(STATS_KEY) ?? '{}') }
  } catch {
    return { dehet: 0, verbs: 0 }
  }
}
function bumpStats(k: 'dehet' | 'verbs', n: number) {
  try {
    const s = loadStats()
    s[k] += n
    localStorage.setItem(STATS_KEY, JSON.stringify(s))
  } catch {
    /* storage unavailable */
  }
}

export function PracticePage() {
  const [drill, setDrill] = useState<'home' | 'dehet' | 'verbs'>('home')
  const [scope, setScope] = useState('1')
  const [data, setData] = useState<{ nouns: Noun[]; verbs: Verb[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    practiceData().then(setData, (e) => setError(e.message))
  }, [])
  const stats = useMemo(loadStats, [drill])
  const myNouns = [...cards.value.values()].filter((c) => c.article === 'de' || c.article === 'het')

  if (error) return <div class="notice">{error}</div>
  if (!data) return <div class="loading">Loading…</div>
  if (drill === 'dehet') {
    const pool: Noun[] =
      scope === 'mine'
        ? myNouns.map((c) => [c.word, c.article as 'de' | 'het', c.meaning, c.level ?? 0])
        : data.nouns.filter((n) => scope === 'all' || (n[3] || 6) <= Number(scope))
    return <DeHetDrill pool={pool} onDone={() => setDrill('home')} />
  }
  if (drill === 'verbs') return <VerbDrill pool={data.verbs.filter((v) => scope === 'all' || scope === 'mine' || (v[6] || 6) <= Math.max(2, Number(scope)))} onDone={() => setDrill('home')} />

  return (
    <div class="practice-home">
      <div class="setting">
        <div class="setting-label">Words</div>
        <div class="seg-control">
          {[
            ['1', 'A1'],
            ['2', 'A1–A2'],
            ['3', 'up to B1'],
            ['all', 'All'],
            ...(myNouns.length >= 5 ? [['mine', 'My words']] : []),
          ].map(([v, label]) => (
            <button class={scope === v ? 'on' : ''} onClick={() => setScope(v)}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <button class="practice-card" onClick={() => setDrill('dehet')}>
        <span class="pc-title">
          <span class="art-de">de</span> of <span class="art-het">het</span>?
        </span>
        <span class="muted small">
          Pick the article for 20 common nouns. About two thirds of Dutch nouns are de-words; the het-words just have to be learned.
        </span>
        {stats.dehet > 0 && <span class="small">{stats.dehet} nouns practised</span>}
      </button>
      <button class="practice-card" onClick={() => setDrill('verbs')}>
        <span class="pc-title">Strong and irregular verbs</span>
        <span class="muted small">
          <i lang="nl">lopen – liep – gelopen</i>. Type the past tense and the participle of 10 common verbs.
        </span>
        {stats.verbs > 0 && <span class="small">{stats.verbs} verbs practised</span>}
      </button>
      <p class="muted small">
        Background:{' '}
        <button class="link small" onClick={() => navigate('/grammar/de-het')}>
          De or het?
        </button>{' '}
        ·{' '}
        <button class="link small" onClick={() => navigate('/grammar/strong-verbs')}>
          Strong and irregular verbs
        </button>
      </p>
    </div>
  )
}

function DeHetDrill({ pool, onDone }: { pool: Noun[]; onDone: () => void }) {
  const [round, setRound] = useState(() => shuffle(pool).slice(0, 20))
  const [i, setI] = useState(0)
  const [picked, setPicked] = useState<string | null>(null)
  const [wrong, setWrong] = useState<Noun[]>([])
  const noun = round[i]

  const pick = (a: string) => {
    if (picked || !noun) return
    setPicked(a)
    if (a !== noun[1]) setWrong((w) => [...w, noun])
    speak(`${noun[1]} ${noun[0]}`)
  }
  const next = () => {
    setPicked(null)
    if (i + 1 >= round.length) bumpStats('dehet', round.length)
    setI(i + 1)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!picked && (e.key === 'd' || e.key === 'ArrowLeft')) pick('de')
      else if (!picked && (e.key === 'h' || e.key === 'ArrowRight')) pick('het')
      else if (picked && (e.key === ' ' || e.key === 'Enter')) {
        e.preventDefault()
        next()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (!pool.length) return <div class="empty">No words to practise.</div>
  if (!noun)
    return (
      <div class="empty">
        <p class="big-emoji">{wrong.length === 0 ? '🎉' : wrong.length <= 3 ? '👍' : '💪'}</p>
        <p>
          {round.length - wrong.length} of {round.length} right.
        </p>
        {wrong.length > 0 && (
          <ul class="word-list compact">
            {wrong.map(([w, a, g]) => (
              <li>
                <span class="kw-word" lang="nl">
                  <Article a={a} /> {w}
                </span>{' '}
                <span class="small muted">{g}</span>
              </li>
            ))}
          </ul>
        )}
        <div class="row-inline wrap center">
          {wrong.length > 0 && (
            <button
              class="btn primary"
              onClick={() => {
                setRound(shuffle(wrong))
                setWrong([])
                setI(0)
              }}
            >
              Practise these again
            </button>
          )}
          <button
            class="btn"
            onClick={() => {
              setRound(shuffle(pool).slice(0, 20))
              setWrong([])
              setI(0)
            }}
          >
            New round
          </button>
          <button class="btn ghost" onClick={onDone}>
            Done
          </button>
        </div>
      </div>
    )

  const rule = picked ? articleRule(noun[0], noun[1]) : undefined
  return (
    <div class="session">
      <div class="session-top">
        <button class="icon-btn" onClick={onDone} aria-label="End">
          <Icon name="close" />
        </button>
        <div class="bar">
          <span style={{ width: `${(i / round.length) * 100}%` }} />
        </div>
        <span class="small muted">
          {i + 1}/{round.length}
        </span>
      </div>
      <div class="flashcard dehet">
        <div class="fc-word" lang="nl">
          {picked ? <Article a={noun[1]} /> : <span class="article-blank">___</span>} {noun[0]}
        </div>
        <div class="muted">
          {noun[2]} <CefrBadge level={noun[3] || undefined} />
        </div>
        {picked && (
          <div class={`article-result ${picked === noun[1] ? 'right' : 'wrong'}`}>
            {picked === noun[1] ? 'Goed zo!' : `It's ${noun[1]} ${noun[0]}.`}
            {rule && <div class="small">{rule}</div>}
          </div>
        )}
      </div>
      {picked ? (
        <button class="btn primary big" onClick={next}>
          Next
        </button>
      ) : (
        <div class="article-pick big">
          <button class="btn art-btn de" onClick={() => pick('de')}>
            de
          </button>
          <button class="btn art-btn het" onClick={() => pick('het')}>
            het
          </button>
        </div>
      )}
    </div>
  )
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')

function VerbDrill({ pool, onDone }: { pool: Verb[]; onDone: () => void }) {
  const [round, setRound] = useState(() => shuffle(pool).slice(0, 10))
  const [i, setI] = useState(0)
  const [past, setPast] = useState('')
  const [part, setPart] = useState('')
  const [checked, setChecked] = useState(false)
  const [score, setScore] = useState(0)
  const verb = round[i]

  if (!pool.length) return <div class="empty">No verbs to practise.</div>
  if (!verb)
    return (
      <div class="empty">
        <p class="big-emoji">{score === round.length ? '🎉' : '👍'}</p>
        <p>
          {score} of {round.length} right.
        </p>
        <div class="row-inline wrap center">
          <button
            class="btn primary"
            onClick={() => {
              setRound(shuffle(pool).slice(0, 10))
              setI(0)
              setScore(0)
            }}
          >
            New round
          </button>
          <button class="btn ghost" onClick={onDone}>
            Done
          </button>
        </div>
      </div>
    )

  const [inf, pt, ptp, pp, aux, gloss, level] = verb
  const pastOk = [pt, ptp].filter(Boolean).map(norm).includes(norm(past))
  const partOk = norm(part).replace(/^(heeft|is|hebben|zijn|ben|heb)\s+/, '') === norm(pp)
  const check = (e: Event) => {
    e.preventDefault()
    if (checked) {
      setChecked(false)
      setPast('')
      setPart('')
      if (i + 1 >= round.length) bumpStats('verbs', round.length)
      setI(i + 1)
      return
    }
    setChecked(true)
    if (pastOk && partOk) setScore((n) => n + 1)
    speak(`${inf}, ${pt}, ${pp}`)
  }

  return (
    <form class="session" onSubmit={check}>
      <div class="session-top">
        <button type="button" class="icon-btn" onClick={onDone} aria-label="End">
          <Icon name="close" />
        </button>
        <div class="bar">
          <span style={{ width: `${(i / round.length) * 100}%` }} />
        </div>
        <span class="small muted">
          {i + 1}/{round.length}
        </span>
      </div>
      <div class="flashcard verbs">
        <div class="fc-word" lang="nl">
          {inf}
        </div>
        <div class="muted">
          {gloss} {level ? <span class="badge cefr">{CEFR_NAMES[level]}</span> : null}
        </div>
        <label class="field">
          <span>Past tense (ik/hij)</span>
          <input
            lang="nl"
            autoCapitalize="off"
            autoCorrect="off"
            spellcheck={false}
            value={past}
            readOnly={checked}
            class={checked ? (pastOk ? 'right' : 'wrong') : ''}
            onInput={(e) => setPast((e.target as HTMLInputElement).value)}
          />
        </label>
        <label class="field">
          <span>Past participle</span>
          <input
            lang="nl"
            autoCapitalize="off"
            autoCorrect="off"
            spellcheck={false}
            value={part}
            readOnly={checked}
            class={checked ? (partOk ? 'right' : 'wrong') : ''}
            onInput={(e) => setPart((e.target as HTMLInputElement).value)}
          />
        </label>
        {checked && (
          <div class={`article-result ${pastOk && partOk ? 'right' : 'wrong'}`} lang="nl">
            {inf} – {pt}
            {ptp && ptp !== pt ? ` / ${ptp}` : ''} – {aux === 'zijn' ? 'is' : 'heeft'} {pp}
          </div>
        )}
      </div>
      <button class="btn primary big" type="submit">
        {checked ? 'Next' : 'Check'}
      </button>
    </form>
  )
}
