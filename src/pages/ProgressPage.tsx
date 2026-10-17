import { useMemo } from 'preact/hooks'
import { activity, cards, progress, today, customTexts } from '../state/db'
import { settings, updateSettings } from '../state/settings'
import { library } from '../services/library'
import { LEVELS } from '../lib/levels'
import { cardStage } from '../services/srs'
import { navigate } from '../router'
import { Icon } from '../components/Icon'

/** Consecutive days (ending today or yesterday) with reading or reviews. */
export function streak(): number {
  const act = activity.value
  const active = (d: Date) => {
    const a = act.get(today(d))
    return !!a && (a.seconds >= 30 || a.stories > 0 || a.reviews > 0)
  }
  const d = new Date()
  if (!active(d)) d.setDate(d.getDate() - 1)
  let n = 0
  while (active(d)) {
    n++
    d.setDate(d.getDate() - 1)
  }
  return n
}

function weekStart(d = new Date()) {
  const x = new Date(d)
  const day = (x.getDay() + 6) % 7 // Monday = 0
  x.setDate(x.getDate() - day)
  x.setHours(0, 0, 0, 0)
  return x
}

export function weekProgress(): { value: number; goal: number; unit: string } {
  const s = settings.value
  const start = weekStart()
  let value = 0
  for (let i = 0; i < 7; i++) {
    const d = new Date(start)
    d.setDate(d.getDate() + i)
    const a = activity.value.get(today(d))
    if (!a) continue
    value += s.goalUnit === 'stories' ? a.stories : a.seconds / 60
  }
  return { value: Math.floor(value), goal: s.weeklyGoal, unit: s.goalUnit }
}

function Ring({ value, goal, label }: { value: number; goal: number; label: string }) {
  const pct = Math.min(1, goal ? value / goal : 0)
  const r = 52
  const c = 2 * Math.PI * r
  return (
    <svg width="140" height="140" viewBox="0 0 140 140" class="ring" role="img" aria-label={`${value} of ${goal} ${label}`}>
      <circle cx="70" cy="70" r={r} class="ring-bg" />
      <circle cx="70" cy="70" r={r} class="ring-fg" stroke-dasharray={`${c * pct} ${c}`} transform="rotate(-90 70 70)" />
      <text x="70" y="68" text-anchor="middle" class="ring-num">
        {value}/{goal}
      </text>
      <text x="70" y="90" text-anchor="middle" class="ring-label">
        {label}
      </text>
    </svg>
  )
}

export function ProgressPage() {
  const s = settings.value
  const st = streak()
  const wk = weekProgress()
  const lib = library.value

  const totals = useMemo(() => {
    let seconds = 0
    let words = 0
    let reviews = 0
    for (const a of activity.value.values()) {
      seconds += a.seconds
      words += a.words ?? 0
      reviews += a.reviews
    }
    const completed = [...progress.value.values()].filter((p) => p.completedAt).length
    const allCards = [...cards.value.values()]
    return {
      seconds,
      read: words,
      reviews,
      completed,
      words: allCards.length,
      learned: allCards.filter((c) => cardStage(c) === 'mature').length,
    }
  }, [activity.value, progress.value, cards.value])

  // 16-week heatmap
  const weeks = useMemo(() => {
    const out: { date: string; level: number; tip: string }[][] = []
    const start = weekStart()
    start.setDate(start.getDate() - 7 * 15)
    for (let w = 0; w < 16; w++) {
      const col: { date: string; level: number; tip: string }[] = []
      for (let d = 0; d < 7; d++) {
        const day = new Date(start)
        day.setDate(start.getDate() + w * 7 + d)
        const key = today(day)
        const a = activity.value.get(key)
        const mins = a ? a.seconds / 60 : 0
        const level = !a ? 0 : mins >= 30 ? 4 : mins >= 15 ? 3 : mins >= 5 || a.stories ? 2 : a.seconds || a.reviews ? 1 : 0
        col.push({ date: key, level: day > new Date() ? -1 : level, tip: a ? `${key}: ${Math.round(mins)} min, ${a.stories} stories, ${a.reviews} reviews` : key })
      }
      out.push(col)
    }
    return out
  }, [activity.value])

  return (
    <div class="page progress-page">
      <header class="page-head">
        <h1>Progress</h1>
        <button class="icon-btn" onClick={() => navigate('/settings')} aria-label="Settings">
          <Icon name="settings" />
        </button>
      </header>

      <div class="goal-card card">
        <Ring value={wk.value} goal={wk.goal} label={wk.unit === 'stories' ? 'stories this week' : 'minutes this week'} />
        <div class="goal-side">
          <div class="streak">
            <Icon name="flame" size={28} /> <b>{st}</b> day{st === 1 ? '' : 's'} streak
          </div>
          <div class="setting">
            <div class="setting-label small">Weekly goal</div>
            <div class="row-inline">
              <input
                type="number"
                min="1"
                max={s.goalUnit === 'stories' ? 50 : 1000}
                value={s.weeklyGoal}
                onChange={(e) => updateSettings({ weeklyGoal: Math.max(1, Number((e.target as HTMLInputElement).value)) })}
              />
              <select
                value={s.goalUnit}
                onChange={(e) => {
                  const unit = (e.target as HTMLSelectElement).value as 'stories' | 'minutes'
                  updateSettings({ goalUnit: unit, weeklyGoal: unit === 'stories' ? 3 : 60 })
                }}
              >
                <option value="stories">stories</option>
                <option value="minutes">minutes</option>
              </select>
            </div>
          </div>
          {wk.value >= wk.goal && <div class="goal-done">Goal reached! 🎉</div>}
        </div>
      </div>

      <div class="stat-grid">
        <div class="stat">
          <b>{totals.completed}</b>
          <span>stories read</span>
        </div>
        <div class="stat">
          <b>{totals.read >= 10000 ? `${(totals.read / 1000).toFixed(1)}k` : totals.read.toLocaleString()}</b>
          <span>words read</span>
        </div>
        <div class="stat">
          <b>{Math.round(totals.seconds / 60)}</b>
          <span>minutes reading</span>
        </div>
        <div class="stat">
          <b>{totals.words}</b>
          <span>words saved</span>
        </div>
        <div class="stat">
          <b>{totals.learned}</b>
          <span>words learned</span>
        </div>
        <div class="stat">
          <b>{totals.reviews}</b>
          <span>reviews</span>
        </div>
      </div>

      <section>
        <h2 class="section-title">Activity</h2>
        <div class="heatmap" role="img" aria-label="Reading activity in the last 16 weeks">
          {weeks.map((col) => (
            <div class="heat-col">
              {col.map((c) => (
                <span class={`heat h${c.level}`} title={c.tip} />
              ))}
            </div>
          ))}
        </div>
      </section>

      {lib && (
        <section>
          <h2 class="section-title">Levels</h2>
          <ul class="level-bars">
            {LEVELS.map((l) => {
              const all = lib.stories.filter((x) => x.level === l.id)
              if (!all.length) return null
              const done = all.filter((x) => progress.value.get(x.id)?.completedAt).length
              return (
                <li onClick={() => navigate(`/?level=${l.id}`)}>
                  <span class="lb-label">{l.label}</span>
                  <span class="mini-bar wide">
                    <span style={{ width: `${(done / all.length) * 100}%`, background: l.color }} />
                  </span>
                  <span class="small muted">
                    {done}/{all.length}
                  </span>
                </li>
              )
            })}
          </ul>
          {customTexts.value.length > 0 && <p class="muted small">Plus {customTexts.value.length} of your own texts.</p>}
        </section>
      )}
      <div class="row-inline wrap">
        <button class="btn ghost" onClick={() => navigate('/settings')}>
          <Icon name="settings" size={18} /> Settings
        </button>
        <button class="btn ghost" onClick={() => navigate('/about')}>
          <Icon name="info" size={18} /> About & credits
        </button>
      </div>
    </div>
  )
}
