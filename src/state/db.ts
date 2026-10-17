// Persistent user data in IndexedDB, mirrored into signals for reactive UI.

import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import { signal } from '@preact/signals'
import type { StoryDoc } from '../lib/types'

export interface Card {
  /** the word in lowercase (the lemma) */
  id: string
  word: string
  /** de / het for nouns */
  article?: string
  meaning: string
  entryId?: number
  /** CEFR level 1–6 */
  level?: number
  /** Wikimedia Commons recording path */
  audio?: string
  /** separable verb prefix, verb forms etc. shown on the back: "liep – gelopen" */
  forms?: string
  /** example sentence with the word, and its translation */
  sentence?: string
  sentenceEn?: string
  /** surface form as it appeared in the sentence (for highlighting) */
  surface?: string
  storyId?: string
  created: number
  /** SRS */
  due: number
  interval: number // days
  ease: number
  reps: number
  lapses: number
  state: 'new' | 'learning' | 'review'
  /** learning step index */
  step?: number
  lastReview?: number
}

export interface Progress {
  storyId: string
  /** index of the sentence the reader was at */
  position: number
  started: number
  lastRead: number
  completedAt?: number
  timesCompleted: number
  favorite?: boolean
  seconds: number
}

export interface Activity {
  date: string // YYYY-MM-DD (local)
  seconds: number
  stories: number
  /** words read in finished stories */
  words: number
  reviews: number
  newCards: number
  storyIds: string[]
}

export interface KnownWord {
  id: string
  status: 'known' | 'ignored'
  at: number
}

interface Schema extends DBSchema {
  cards: { key: string; value: Card; indexes: { due: number } }
  progress: { key: string; value: Progress }
  texts: { key: string; value: StoryDoc & { text: string } }
  activity: { key: string; value: Activity }
  known: { key: string; value: KnownWord }
}

let dbp: Promise<IDBPDatabase<Schema>> | null = null
export function db() {
  if (!dbp) {
    dbp = openDB<Schema>('nl-reading', 1, {
      upgrade(d) {
        const cards = d.createObjectStore('cards', { keyPath: 'id' })
        cards.createIndex('due', 'due')
        d.createObjectStore('progress', { keyPath: 'storyId' })
        d.createObjectStore('texts', { keyPath: 'meta.id' })
        d.createObjectStore('activity', { keyPath: 'date' })
        d.createObjectStore('known', { keyPath: 'id' })
      },
    })
  }
  return dbp
}

export const cards = signal<Map<string, Card>>(new Map())
export const progress = signal<Map<string, Progress>>(new Map())
export const activity = signal<Map<string, Activity>>(new Map())
export const known = signal<Map<string, KnownWord>>(new Map())
export const customTexts = signal<StoryDoc['meta'][]>([])
export const dbReady = signal(false)

export async function loadAll() {
  const d = await db()
  const [c, p, a, k, t] = await Promise.all([
    d.getAll('cards'),
    d.getAll('progress'),
    d.getAll('activity'),
    d.getAll('known'),
    d.getAll('texts'),
  ])
  cards.value = new Map(c.map((x) => [x.id, x]))
  progress.value = new Map(p.map((x) => [x.storyId, x]))
  activity.value = new Map(a.map((x) => [x.date, x]))
  known.value = new Map(k.map((x) => [x.id, x]))
  customTexts.value = t.map((x) => x.meta).sort((x, y) => (y.added ?? '').localeCompare(x.added ?? ''))
  dbReady.value = true
}

// ---- cards

export async function putCard(card: Card) {
  await (await db()).put('cards', card)
  const m = new Map(cards.value)
  m.set(card.id, card)
  cards.value = m
}

export async function deleteCard(id: string) {
  await (await db()).delete('cards', id)
  const m = new Map(cards.value)
  m.delete(id)
  cards.value = m
}

// ---- known words

export async function setKnown(id: string, status: KnownWord['status'] | null) {
  const d = await db()
  const m = new Map(known.value)
  if (status) {
    const k = { id, status, at: Date.now() }
    await d.put('known', k)
    m.set(id, k)
  } else {
    await d.delete('known', id)
    m.delete(id)
  }
  known.value = m
}

// ---- progress

export async function updateProgress(storyId: string, patch: Partial<Progress>) {
  const prev = progress.value.get(storyId)
  const now = Date.now()
  const p: Progress = {
    storyId,
    position: 0,
    started: now,
    lastRead: now,
    timesCompleted: 0,
    seconds: 0,
    ...prev,
    ...patch,
  }
  await (await db()).put('progress', p)
  const m = new Map(progress.value)
  m.set(storyId, p)
  progress.value = m
  return p
}

// ---- activity

export function today(d = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export async function logActivity(patch: Partial<Omit<Activity, 'date' | 'storyIds'>> & { storyId?: string }) {
  const date = today()
  const prev = activity.value.get(date) ?? { date, seconds: 0, stories: 0, words: 0, reviews: 0, newCards: 0, storyIds: [] }
  const next: Activity = {
    ...prev,
    seconds: prev.seconds + (patch.seconds ?? 0),
    stories: prev.stories + (patch.stories ?? 0),
    words: (prev.words ?? 0) + (patch.words ?? 0),
    reviews: prev.reviews + (patch.reviews ?? 0),
    newCards: prev.newCards + (patch.newCards ?? 0),
    storyIds: patch.storyId && !prev.storyIds.includes(patch.storyId) ? [...prev.storyIds, patch.storyId] : prev.storyIds,
  }
  await (await db()).put('activity', next)
  const m = new Map(activity.value)
  m.set(date, next)
  activity.value = m
}

// ---- custom texts

export async function saveText(doc: StoryDoc & { text: string }) {
  await (await db()).put('texts', doc)
  customTexts.value = [doc.meta, ...customTexts.value.filter((t) => t.id !== doc.meta.id)]
}

export async function getText(id: string) {
  return (await db()).get('texts', id)
}

export async function deleteText(id: string) {
  await (await db()).delete('texts', id)
  customTexts.value = customTexts.value.filter((t) => t.id !== id)
}

// ---- backup

export async function exportBackup(): Promise<string> {
  const d = await db()
  const data = {
    app: 'nl-reading',
    version: 1,
    exported: new Date().toISOString(),
    settings: JSON.parse(localStorage.getItem('nl-reading:settings') ?? '{}'),
    cards: await d.getAll('cards'),
    progress: await d.getAll('progress'),
    activity: await d.getAll('activity'),
    known: await d.getAll('known'),
    texts: await d.getAll('texts'),
  }
  return JSON.stringify(data)
}

export async function importBackup(json: string) {
  const data = JSON.parse(json)
  if (data.app !== 'nl-reading') throw new Error('Not an NL Reading backup file')
  const d = await db()
  const tx = d.transaction(['cards', 'progress', 'activity', 'known', 'texts'], 'readwrite')
  for (const c of data.cards ?? []) await tx.objectStore('cards').put(c)
  for (const p of data.progress ?? []) await tx.objectStore('progress').put(p)
  for (const a of data.activity ?? []) await tx.objectStore('activity').put(a)
  for (const k of data.known ?? []) await tx.objectStore('known').put(k)
  for (const t of data.texts ?? []) await tx.objectStore('texts').put(t)
  await tx.done
  if (data.settings) localStorage.setItem('nl-reading:settings', JSON.stringify(data.settings))
}

export async function clearAll() {
  const d = await db()
  await Promise.all((['cards', 'progress', 'activity', 'known', 'texts'] as const).map((s) => d.clear(s)))
  await loadAll()
}
