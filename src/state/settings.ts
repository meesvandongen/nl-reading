import { effect, signal } from '@preact/signals'

export type Theme = 'system' | 'light' | 'dark' | 'sepia'
export type GlossScope = 'off' | 'unknown' | 'level' | 'all'
export type TranslationMode = 'off' | 'sentence' | 'paragraph'
export type FontFamily = 'serif' | 'sans' | 'legible' | 'system'
export type ReviewMode = 'recognition' | 'listening' | 'production'

export interface Settings {
  theme: Theme
  /** English meaning in small print above words */
  glossScope: GlossScope
  /** with glossScope = 'level': show for words above this CEFR level (1 = A1) */
  glossLevel: number
  translation: TranslationMode
  /** colour nouns by article: de / het */
  articleColors: boolean
  /** underline words by CEFR level */
  levelHighlight: boolean
  highlightSaved: boolean
  fontFamily: FontFamily
  fontSize: number
  lineHeight: number
  /** TTS */
  voice: string
  rate: number
  autoScroll: boolean
  /** play native-speaker recordings (Wikimedia Commons) for single words when there is one */
  recordings: boolean
  /** flashcards */
  newPerDay: number
  reviewMode: ReviewMode
  reviewShowSentence: boolean
  autoplayCardAudio: boolean
  /** ask de or het on noun cards */
  reviewArticle: boolean
  /** goals */
  weeklyGoal: number
  goalUnit: 'stories' | 'minutes'
  /** reminders */
  reminderEnabled: boolean
  reminderTime: string
  /** chosen during onboarding */
  level: string
  onboarded: boolean
  /** library filters, remembered across visits ('all' = no filter) */
  libraryLevel: string
  libraryCategory: string
  libraryFilter: string
}

const DEFAULTS: Settings = {
  theme: 'system',
  glossScope: 'off',
  glossLevel: 2,
  translation: 'off',
  articleColors: false,
  levelHighlight: false,
  highlightSaved: true,
  fontFamily: 'serif',
  fontSize: 20,
  lineHeight: 1.75,
  voice: '',
  rate: 0.9,
  autoScroll: true,
  recordings: true,
  newPerDay: 15,
  reviewMode: 'recognition',
  reviewShowSentence: true,
  autoplayCardAudio: false,
  reviewArticle: true,
  weeklyGoal: 3,
  goalUnit: 'stories',
  reminderEnabled: false,
  reminderTime: '20:00',
  level: 'a1',
  onboarded: false,
  libraryLevel: 'all',
  libraryCategory: 'all',
  libraryFilter: 'all',
}

const KEY = 'nl-reading:settings'

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) }
  } catch {
    /* storage unavailable */
  }
  return { ...DEFAULTS }
}

export const settings = signal<Settings>(load())

export function updateSettings(patch: Partial<Settings>) {
  settings.value = { ...settings.value, ...patch }
}

export function resetSettings() {
  settings.value = { ...DEFAULTS, onboarded: true }
}

effect(() => {
  const s = settings.value
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    /* ignore */
  }
})

// Theme → <html data-theme>
const media = typeof matchMedia !== 'undefined' ? matchMedia('(prefers-color-scheme: dark)') : null
function applyTheme() {
  const t = settings.value.theme
  const resolved = t === 'system' ? (media?.matches ? 'dark' : 'light') : t
  document.documentElement.dataset.theme = resolved
  const meta = document.querySelectorAll('meta[name="theme-color"]')
  const color = resolved === 'dark' ? '#16191f' : resolved === 'sepia' ? '#f3e9d7' : '#e8590c'
  meta.forEach((m) => m.setAttribute('content', color))
}
effect(applyTheme)
media?.addEventListener('change', applyTheme)

export const FONTS: Record<FontFamily, { label: string; css: string; google?: string }> = {
  serif: { label: 'Serif', css: "'Literata', Georgia, 'Times New Roman', serif", google: 'Literata:opsz,wght@7..72,400;7..72,600' },
  sans: { label: 'Sans', css: "'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif", google: 'Inter:wght@400;600' },
  legible: { label: 'Legible', css: "'Atkinson Hyperlegible', Verdana, sans-serif", google: 'Atkinson+Hyperlegible:wght@400;700' },
  system: { label: 'System', css: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" },
}

const loadedFonts = new Set<string>()
export function ensureFont(f: FontFamily) {
  const g = FONTS[f].google
  if (!g || loadedFonts.has(g)) return
  loadedFonts.add(g)
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = `https://fonts.googleapis.com/css2?family=${g}&display=swap`
  document.head.appendChild(link)
}
effect(() => ensureFont(settings.value.fontFamily))
