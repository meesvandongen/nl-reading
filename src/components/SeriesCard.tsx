import type { SeriesMeta } from '../lib/types'
import { levelInfo } from '../lib/levels'
import { progress } from '../state/db'
import { seriesProgress } from '../services/library'
import { navigate } from '../router'

const NEW_DAYS = 14

/** One segment per episode: finished, in progress or not started. */
export function EpisodeTrack({ series }: { series: SeriesMeta }) {
  const { next } = seriesProgress(series)
  return (
    <span class="ep-track" aria-hidden="true">
      {series.episodes.map((id) => {
        const p = progress.value.get(id)
        return <span class={p?.completedAt ? 'done' : id === next && p && p.position > 0 ? 'now' : ''} />
      })}
    </span>
  )
}

export function SeriesCard({ series, compact = false }: { series: SeriesMeta; compact?: boolean }) {
  const info = levelInfo(series.level)
  const { done } = seriesProgress(series)
  const total = series.episodes.length
  const started = series.episodes.some((id) => progress.value.has(id))
  const isNew = series.added && Date.now() - Date.parse(series.added) < NEW_DAYS * 86400_000 && done < total
  const open = () => navigate(`/series/${encodeURIComponent(series.id)}`)
  return (
    <article
      class={`story-card series-card ${compact ? 'compact' : ''} ${done === total ? 'done' : ''}`}
      onClick={open}
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && open()}
    >
      <div class="story-card-top">
        <span class="level-dot" style={{ background: info.color }} title={info.label}>
          {info.short}
        </span>
        <span class="series-tag">
          Series · {total} episodes
        </span>
        {isNew && <span class="badge new">{started ? 'NEW EP' : 'NEW'}</span>}
      </div>
      <h3 lang="nl">{series.title}</h3>
      {series.title_en && <div class="story-card-en">{series.title_en}</div>}
      {!compact && series.summary && <p class="story-card-summary">{series.summary}</p>}
      <div class="story-card-foot small muted">
        <EpisodeTrack series={series} />
        <span>{done === total ? 'Finished' : done ? `${done}/${total} read` : `${series.words.toLocaleString()} words`}</span>
      </div>
    </article>
  )
}
