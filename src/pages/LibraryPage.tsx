import { useEffect, useMemo, useState } from 'preact/hooks'
import type { StoryMeta } from '../lib/types'
import { CATEGORIES, LEVELS, LEVEL_HINTS, levelInfo } from '../lib/levels'
import { library, libraryError, seriesProgress } from '../services/library'
import { customTexts, progress, cards } from '../state/db'
import { settings, updateSettings } from '../state/settings'
import { navigate, route } from '../router'
import { StoryCard } from '../components/StoryCard'
import { SeriesCard } from '../components/SeriesCard'
import { Icon } from '../components/Icon'
import { isDue } from '../services/srs'
import { streak } from './ProgressPage'

const FILTERS = [
  ['all', 'Everything'],
  ['unread', 'Unread'],
  ['read', 'Finished'],
  ['favorites', 'Favorites'],
]

/** A remembered or linked filter value, or 'all' if it no longer exists. */
function valid(v: string, ok: (v: string) => boolean) {
  return v !== 'all' && ok(v) ? v : 'all'
}

function levelIndex(l: string) {
  const i = LEVELS.findIndex((x) => x.id === l)
  return i < 0 ? 0 : i
}

/** Stories recommended from reading history and chosen level. */
export function recommend(n: number, exclude?: string): StoryMeta[] {
  const lib = library.value
  if (!lib) return []
  const prog = progress.value
  const done = [...prog.values()].filter((p) => p.completedAt).sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0))
  const byId = new Map(lib.stories.map((s) => [s.id, s]))
  const recent = done.slice(0, 5).map((p) => byId.get(p.storyId)).filter((x): x is StoryMeta => !!x)
  let target = levelIndex(settings.value.level)
  if (recent.length) target = Math.max(target, Math.round(recent.reduce((a, s) => a + levelIndex(s.level), 0) / recent.length))
  const cats = new Map<string, number>()
  for (const s of recent) cats.set(s.category, (cats.get(s.category) ?? 0) + 1)
  // of a series, only the episode to read next
  const nextEpisode = new Set(lib.series.map((s) => seriesProgress(s).next))
  // stable daily shuffle
  const seed = new Date().toDateString()
  const jitter = (id: string) => {
    let h = 0
    for (const c of seed + id) h = (h * 31 + c.charCodeAt(0)) | 0
    return (Math.abs(h) % 100) / 100
  }
  return lib.stories
    .filter((s) => s.id !== exclude && !prog.get(s.id)?.completedAt && (!s.series || nextEpisode.has(s.id)))
    .map((s) => {
      const li = levelIndex(s.level)
      const p = prog.get(s.id)
      let score = Math.abs(li - target) * 10 + (li < target ? 4 : 0)
      score -= (cats.get(s.category) ?? 0) * 2
      if (p && p.position > 0) score -= 6
      score += jitter(s.id) * 6
      return { s, score }
    })
    .sort((a, b) => a.score - b.score)
    .slice(0, n)
    .map((x) => x.s)
}

export function LibraryPage() {
  const lib = library.value
  const q = route.value.query
  const [search, setSearch] = useState(q.get('q') ?? '')
  // filters come from the URL (links like #/?level=…) or else the remembered choice
  const saved = settings.value
  const level = valid(q.get('level') ?? saved.libraryLevel, (v) => LEVELS.some((l) => l.id === v))
  const cat = valid(q.get('cat') ?? saved.libraryCategory, (v) => v in CATEGORIES)
  const filter = valid(q.get('filter') ?? saved.libraryFilter, (v) => FILTERS.some(([k]) => k === v))
  useEffect(() => {
    if (level !== saved.libraryLevel || cat !== saved.libraryCategory || filter !== saved.libraryFilter)
      updateSettings({ libraryLevel: level, libraryCategory: cat, libraryFilter: filter })
  }, [level, cat, filter])
  const setQuery = (k: string, v: string) => {
    const next = new URLSearchParams(q)
    if (v === 'all') next.delete(k)
    else next.set(k, v)
    updateSettings(k === 'level' ? { libraryLevel: v } : k === 'cat' ? { libraryCategory: v } : { libraryFilter: v })
    navigate(`/?${next.toString()}`, { replace: true })
  }

  const prog = progress.value
  const continueReading = useMemo(
    () =>
      lib
        ? [...prog.values()]
            .filter((p) => !p.completedAt && p.position > 0)
            .sort((a, b) => b.lastRead - a.lastRead)
            .map((p) => lib.stories.find((s) => s.id === p.storyId))
            .filter((x): x is StoryMeta => !!x)
            .slice(0, 6)
        : [],
    [lib, prog],
  )
  const recs = useMemo(() => recommend(6), [lib, prog, settings.value.level])

  const filtered = useMemo(() => {
    if (!lib) return []
    const term = search.trim().toLowerCase()
    return lib.stories.filter((s) => {
      if (level !== 'all' && s.level !== level) return false
      if (cat !== 'all' && s.category !== cat) return false
      const p = prog.get(s.id)
      if (filter === 'unread' && p?.completedAt) return false
      if (filter === 'read' && !p?.completedAt) return false
      if (filter === 'favorites' && !p?.favorite) return false
      if (term) {
        const hay = [s.title, s.title_en, s.summary, s.author, ...(s.tags ?? [])].join(' ').toLowerCase()
        if (!hay.includes(term)) return false
      }
      return true
    })
  }, [lib, search, level, cat, filter, prog])

  const seriesShown = useMemo(() => {
    if (!lib || filter !== 'all') return []
    const term = search.trim().toLowerCase()
    return lib.series.filter((s) => {
      if (level !== 'all' && s.level !== level) return false
      if (cat !== 'all' && s.category !== cat) return false
      if (term) {
        const hay = [s.title, s.title_en, s.summary, s.author].join(' ').toLowerCase()
        if (!hay.includes(term)) return false
      }
      return true
    })
  }, [lib, search, level, cat, filter])

  const dueCount = useMemo(() => [...cards.value.values()].filter((c) => isDue(c)).length, [cards.value])
  const st = streak()
  const cats = lib ? [...new Set(lib.stories.map((s) => s.category))] : []
  const browsing = level !== 'all' || cat !== 'all' || filter !== 'all' || search.trim() !== ''

  if (libraryError.value) return <div class="page notice">{libraryError.value}</div>
  if (!lib) return <div class="page loading">Loading library…</div>

  return (
    <div class="page library">
      <header class="home-head">
        <div>
          <h1 class="brand">
            <span lang="nl">Lees mee</span> <small>NL Reading</small>
          </h1>
        </div>
        <div class="home-stats">
          <button class="pill" onClick={() => navigate('/progress')} title="Reading streak">
            <Icon name="flame" size={16} /> {st}
          </button>
          {dueCount > 0 && (
            <button class="pill accent" onClick={() => navigate('/review')} title="Flashcards due">
              <Icon name="cards" size={16} /> {dueCount}
            </button>
          )}
        </div>
      </header>

      {!settings.value.onboarded && <Onboarding />}

      {!browsing && continueReading.length > 0 && (
        <section>
          <h2 class="section-title">Continue reading</h2>
          <div class="h-scroll">
            {continueReading.map((m) => (
              <StoryCard meta={m} compact />
            ))}
          </div>
        </section>
      )}

      {!browsing && recs.length > 0 && (
        <section>
          <h2 class="section-title">Recommended for you</h2>
          <div class="h-scroll">
            {recs.map((m) => (
              <StoryCard meta={m} compact />
            ))}
          </div>
        </section>
      )}

      {!browsing && lib.series.length > 0 && (
        <section>
          <h2 class="section-title">Series</h2>
          <div class="h-scroll stacked">
            {lib.series.map((s) => (
              <SeriesCard series={s} compact />
            ))}
          </div>
        </section>
      )}

      <section>
        <div class="section-row">
          <h2 class="section-title">My texts</h2>
          <button class="btn small" onClick={() => navigate('/import')}>
            <Icon name="plus" size={16} /> Add text
          </button>
        </div>
        {customTexts.value.length ? (
          <div class="h-scroll">
            {customTexts.value.map((m) => (
              <StoryCard meta={m} compact />
            ))}
          </div>
        ) : (
          <button class="import-cta" onClick={() => navigate('/import')}>
            <Icon name="text" /> Paste any Dutch text — a news article, a recipe, a message from your neighbour — and read it with the dictionary, de/het and audio.
          </button>
        )}
      </section>

      <section>
        <h2 class="section-title">Library</h2>
        <div class="search-box">
          <Icon name="search" size={18} />
          <input
            type="search"
            placeholder="Search titles, topics, authors…"
            value={search}
            onInput={(e) => setSearch((e.target as HTMLInputElement).value)}
          />
        </div>
        <div class="chips-scroll" role="tablist" aria-label="Level">
          <button class={`chip ${level === 'all' ? 'on' : ''}`} onClick={() => setQuery('level', 'all')}>
            All levels
          </button>
          {LEVELS.map((l) => (
            <button class={`chip ${level === l.id ? 'on' : ''}`} onClick={() => setQuery('level', l.id)}>
              <i class="dot" style={{ background: l.color }} title={LEVEL_HINTS[l.id]} /> {l.label}
              <span class="muted small"> {lib.stories.filter((s) => s.level === l.id).length}</span>
            </button>
          ))}
        </div>
        <div class="chips-scroll" aria-label="Category">
          <button class={`chip small ${cat === 'all' ? 'on' : ''}`} onClick={() => setQuery('cat', 'all')}>
            All topics
          </button>
          {cats.map((c) => (
            <button class={`chip small ${cat === c ? 'on' : ''}`} onClick={() => setQuery('cat', c)}>
              {CATEGORIES[c] ?? c}
            </button>
          ))}
        </div>
        <div class="chips-scroll" aria-label="Filter">
          {FILTERS.map(([k, label]) => (
            <button class={`chip small ${filter === k ? 'on' : ''}`} onClick={() => setQuery('filter', k)}>
              {label}
            </button>
          ))}
        </div>
        {level !== 'all' ? (
          <LevelProgress level={level} />
        ) : null}
        <div class="story-grid">
          {browsing && seriesShown.map((s) => <SeriesCard series={s} />)}
          {filtered.map((m) => (
            <StoryCard meta={m} />
          ))}
        </div>
        {filtered.length === 0 && seriesShown.length === 0 && <p class="muted">No stories match.</p>}
        <p class="muted small contribute">
          Want more? Texts live in the repository as Markdown files — anyone can add one with a pull request.
        </p>
      </section>
    </div>
  )
}

function LevelProgress({ level }: { level: string }) {
  const lib = library.value!
  const stories = lib.stories.filter((s) => s.level === level)
  const done = stories.filter((s) => progress.value.get(s.id)?.completedAt).length
  const info = levelInfo(level)
  return (
    <div class="level-progress">
      <span>
        {info.label}: {done}/{stories.length} read
      </span>
      <span class="mini-bar wide">
        <span style={{ width: `${stories.length ? (done / stories.length) * 100 : 0}%`, background: info.color }} />
      </span>
    </div>
  )
}

function Onboarding() {
  return (
    <div class="onboarding card">
      <h2>Welkom! Welcome</h2>
      <p>How much Dutch do you know? We'll recommend stories at your level. You can change this any time.</p>
      <div class="level-pick">
        {[
          ['a1', 'Just starting', 'A1 · I know a few words'],
          ['a2', 'Beginner', 'A2 · Inburgering level'],
          ['b1', 'Intermediate', 'B1 · Staatsexamen NT2 I'],
          ['b2', 'Upper intermediate', 'B2 · Staatsexamen NT2 II'],
          ['c1', 'Advanced', 'C1 · I read Dutch newspapers'],
        ].map(([id, label, hint]) => (
          <button
            class="level-opt"
            onClick={() =>
              updateSettings({
                level: id,
                onboarded: true,
                // beginners get meanings above new words
                glossScope: id === 'a1' || id === 'a2' ? 'level' : 'off',
                glossLevel: id === 'a1' ? 1 : 2,
                articleColors: id === 'a1' || id === 'a2',
              })
            }
          >
            <i class="dot" style={{ background: levelInfo(id).color }} />
            <b>{label}</b>
            <span class="muted small">{hint}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
