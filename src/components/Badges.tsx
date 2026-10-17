import { CEFR_NAMES, levelInfo } from '../lib/levels'

/** CEFR level of a word (1 = A1 … 6 = C2), estimated from word frequency. */
export function CefrBadge({ level }: { level?: number }) {
  if (!level) return null
  return (
    <span class={`badge cefr cefr-${level}`} title={`Word level ${CEFR_NAMES[level]} (estimated from how common the word is)`}>
      {CEFR_NAMES[level]}
    </span>
  )
}

export function LevelBadge({ level }: { level: string }) {
  const info = levelInfo(level)
  return (
    <span class="badge level" style={{ background: info.color }}>
      {info.label}
    </span>
  )
}

/** The article of a noun, coloured: de / het. */
export function Article({ a }: { a?: string }) {
  if (!a) return null
  return <span class={`article art-${a === 'het' ? 'het' : a === 'de' ? 'de' : 'both'}`}>{a}</span>
}
