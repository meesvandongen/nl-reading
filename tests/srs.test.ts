import { describe, expect, it } from 'vitest'
import { newCard, schedule } from '../src/services/srs'

const card = () => newCard({ id: 'fiets', word: 'fiets', article: 'de', meaning: 'bicycle' })
const DAY = 86400_000

describe('srs', () => {
  it('moves new cards through learning steps', () => {
    const now = Date.now()
    let c = schedule(card(), 'good', now)
    expect(c.state).toBe('learning')
    expect(c.due - now).toBe(10 * 60 * 1000)
    c = schedule(c, 'good', now)
    expect(c.state).toBe('review')
    expect(c.interval).toBe(1)
  })

  it('easy graduates immediately', () => {
    const c = schedule(card(), 'easy')
    expect(c.state).toBe('review')
    expect(c.interval).toBe(4)
  })

  it('grows intervals and handles lapses', () => {
    const now = Date.now()
    let c = { ...schedule(card(), 'easy', now) }
    c = schedule({ ...c, due: now }, 'good', now)
    expect(c.interval).toBeGreaterThanOrEqual(9)
    expect(c.due).toBeGreaterThan(now + 8 * DAY)
    const lapsed = schedule({ ...c, due: now }, 'again', now)
    expect(lapsed.state).toBe('learning')
    expect(lapsed.lapses).toBe(1)
    const back = schedule(lapsed, 'good', now)
    expect(back.state).toBe('review')
    expect(back.interval).toBeGreaterThanOrEqual(4)
  })
})
