import type { StoryMeta } from '../lib/types'
import { CATEGORIES, levelInfo } from '../lib/levels'
import { progress, updateProgress } from '../state/db'
import { getSeries } from '../services/library'
import { navigate } from '../router'
import { Icon } from './Icon'

const NEW_DAYS = 14

export function StoryCard({ meta, compact = false }: { meta: StoryMeta; compact?: boolean }) {
  const p = progress.value.get(meta.id)
  const info = levelInfo(meta.level)
  const isNew = meta.added && Date.now() - Date.parse(meta.added) < NEW_DAYS * 86400_000 && !p
  const series = getSeries(meta.series)
  const pct = p && !p.completedAt && meta.sentences ? Math.min(100, Math.round(((p.position + 1) / meta.sentences) * 100)) : 0
  return (
    <article
      class={`story-card ${compact ? 'compact' : ''} ${p?.completedAt ? 'done' : ''}`}
      onClick={() => navigate(`/read/${encodeURIComponent(meta.id)}`)}
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && navigate(`/read/${encodeURIComponent(meta.id)}`)}
    >
      <div class="story-card-top">
        <span class="level-dot" style={{ background: info.color }} title={info.label}>
          {info.short}
        </span>
        {series ? (
          <span class="series-tag" title={`Episode ${meta.episode} of ${series.title_en ?? series.title}`}>
            Ep. {meta.episode} · <span lang="nl">{series.title}</span>
          </span>
        ) : (
          <span class="muted small">{CATEGORIES[meta.category] ?? meta.category}</span>
        )}
        {isNew && <span class="badge new">NEW</span>}
        <button
          class={`icon-btn fav ${p?.favorite ? 'on' : ''}`}
          aria-label={p?.favorite ? 'Remove from favorites' : 'Add to favorites'}
          onClick={(e) => {
            e.stopPropagation()
            updateProgress(meta.id, { favorite: !p?.favorite, lastRead: p?.lastRead ?? 0, started: p?.started ?? 0 })
          }}
        >
          <Icon name="heart" size={16} fill={!!p?.favorite} />
        </button>
      </div>
      <h3 lang="nl">{meta.title}</h3>
      {meta.title_en && <div class="story-card-en">{meta.title_en}</div>}
      {!compact && meta.summary && <p class="story-card-summary">{meta.summary}</p>}
      <div class="story-card-foot small muted">
        <span>{meta.words.toLocaleString()} words</span>
        {meta.translated && <span title="Has translations">EN</span>}
        {p?.completedAt ? (
          <span class="done-label">
            <Icon name="check" size={14} /> Read
          </span>
        ) : pct > 0 ? (
          <span class="pct">
            <span class="mini-bar">
              <span style={{ width: `${pct}%` }} />
            </span>
            {pct}%
          </span>
        ) : null}
      </div>
    </article>
  )
}
