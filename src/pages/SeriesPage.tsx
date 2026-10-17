import type { StoryMeta } from '../lib/types'
import { readingMinutes } from '../lib/levels'
import { getSeries, library, libraryError, seriesProgress } from '../services/library'
import { progress } from '../state/db'
import { back, navigate } from '../router'
import { LevelBadge } from '../components/Badges'
import { EpisodeTrack } from '../components/SeriesCard'
import { Icon } from '../components/Icon'

export function SeriesPage({ id }: { id: string }) {
  if (libraryError.value) return <div class="page notice">{libraryError.value}</div>
  if (!library.value) return <div class="page loading">Loading…</div>
  const series = getSeries(id)
  if (!series) return <div class="page notice">This series doesn't exist.</div>

  const byId = new Map(library.value.stories.map((s) => [s.id, s]))
  const episodes = series.episodes.map((e) => byId.get(e)).filter((x): x is StoryMeta => !!x)
  const { done, next } = seriesProgress(series)
  const nextMeta = next ? byId.get(next) : undefined
  const nextStarted = !!next && (progress.value.get(next)?.position ?? 0) > 0
  const minutes = readingMinutes(series.words, series.level)
  const read = (e: string) => navigate(`/read/${encodeURIComponent(e)}`)

  return (
    <div class="page series-page">
      <header class="topbar">
        <button class="icon-btn" onClick={() => back('/')} aria-label="Back">
          <Icon name="back" />
        </button>
        <div class="topbar-title">Series</div>
      </header>

      <div class="series-hero">
        <div class="reader-meta">
          <LevelBadge level={series.level} />
          <span class="muted small">
            {episodes.length} episodes · {series.words.toLocaleString()} words · ~{minutes} min
          </span>
        </div>
        <h1 lang="nl">{series.title}</h1>
        {series.title_en && <div class="subtitle">{series.title_en}</div>}
        {series.author && <div class="muted small">{series.author}</div>}
        {series.summary && <p>{series.summary}</p>}
        <div class="series-progress">
          <EpisodeTrack series={series} />
          <span class="small muted">
            {done}/{episodes.length} read
          </span>
        </div>
        {nextMeta ? (
          <button class="btn primary big" onClick={() => read(nextMeta.id)}>
            <Icon name="play" size={18} /> {nextStarted ? 'Continue' : done ? 'Read' : 'Start'} episode {nextMeta.episode}
          </button>
        ) : (
          <div class="series-done">
            <Icon name="check" size={18} /> You've read the whole series.
          </div>
        )}
      </div>

      <ol class="episode-list">
        {episodes.map((e) => {
          const p = progress.value.get(e.id)
          const state = p?.completedAt ? 'done' : e.id === next ? 'next' : 'later'
          const pct = p && !p.completedAt && e.sentences ? Math.min(100, Math.round(((p.position + 1) / e.sentences) * 100)) : 0
          return (
            <li
              class={`episode ${state}`}
              onClick={() => read(e.id)}
              tabIndex={0}
              onKeyDown={(ev) => ev.key === 'Enter' && read(e.id)}
              aria-current={state === 'next' ? 'step' : undefined}
            >
              <span class="ep-num">{state === 'done' ? <Icon name="check" size={16} /> : e.episode}</span>
              <div class="ep-body">
                <div class="muted small">
                  Episode {e.episode} · {e.words.toLocaleString()} words
                  {pct > 0 && ` · ${pct}%`}
                </div>
                <b lang="nl">{e.title}</b>
                {e.title_en && <div class="story-card-en">{e.title_en}</div>}
                {/* no spoilers: the summary shows once you get to an episode */}
                {state !== 'later' && e.summary && <p class="small">{e.summary}</p>}
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
