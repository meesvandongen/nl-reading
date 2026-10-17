export interface LevelInfo {
  id: string
  label: string
  short: string
  /** CEFR level of the vocabulary, 1 = A1 … 6 = C2 */
  cefr: number
  color: string
  /** reading speed for time estimates, words per minute */
  wpm: number
}

export const LEVELS: LevelInfo[] = [
  { id: 'a1', label: 'A1', short: 'A1', cefr: 1, color: '#2e9d4f', wpm: 60 },
  { id: 'a2', label: 'A2', short: 'A2', cefr: 2, color: '#1f8a8a', wpm: 80 },
  { id: 'b1', label: 'B1', short: 'B1', cefr: 3, color: '#2f6fd1', wpm: 100 },
  { id: 'b2', label: 'B2', short: 'B2', cefr: 4, color: '#7b4fc4', wpm: 120 },
  { id: 'c1', label: 'C1', short: 'C1', cefr: 5, color: '#d0582a', wpm: 150 },
  { id: 'classics', label: 'Classics', short: 'CL', cefr: 6, color: '#b2262f', wpm: 150 },
]

export const LEVEL_HINTS: Record<string, string> = {
  a1: 'Beginner',
  a2: 'Elementary',
  b1: 'Intermediate',
  b2: 'Upper intermediate',
  c1: 'Advanced',
  classics: 'Literature in the original',
}

export function levelInfo(id: string): LevelInfo {
  return LEVELS.find((l) => l.id === id) ?? { id, label: id === 'custom' ? 'My text' : id, short: '•', cefr: 0, color: '#757575', wpm: 100 }
}

export function levelCefr(id: string): number {
  return levelInfo(id).cefr || 6
}

export function readingMinutes(words: number, level: string): number {
  return Math.max(1, Math.round(words / levelInfo(level).wpm))
}

export const CATEGORIES: Record<string, string> = {
  'daily-life': 'Daily life',
  food: 'Food',
  travel: 'Travel',
  culture: 'Culture',
  folktale: 'Folktales',
  history: 'History',
  nature: 'Nature',
  school: 'School',
  work: 'Work',
  society: 'Society',
  science: 'Science',
  sport: 'Sport',
  humor: 'Humor',
  literature: 'Literature',
  'news-style': 'News',
  conversation: 'Conversation',
  misc: 'Other',
}

/** CEFR labels of word levels (index 1..6). */
export const CEFR_NAMES = ['', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2']
