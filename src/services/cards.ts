import { glossList, type Entry } from '../lib/dict'
import { cards, deleteCard, logActivity, putCard, type Card } from '../state/db'
import { newCard } from './srs'

export function cardId(word: string) {
  return word.trim().toLowerCase()
}

export interface CardContext {
  sentence?: string
  sentenceEn?: string
  surface?: string
  storyId?: string
}

/** Principal parts worth seeing on a card: "liep – gelopen (zijn)", "huizen", "belde op – opgebeld". */
export function entryForms(e: Entry): string | undefined {
  if (e.v && (e.v.k || e.v.sep)) {
    const parts = [e.v.pt, e.v.pp].filter(Boolean).join(' – ')
    return parts ? `${parts}${e.v.aux ? ` (${e.v.aux})` : ''}` : undefined
  }
  if (e.p === 'n' && e.pl?.length) return `plural ${e.pl[0]}`
  return undefined
}

export function isSaved(word: string) {
  return cards.value.has(cardId(word))
}

export async function saveEntry(e: Entry, ctx: CardContext = {}) {
  const id = cardId(e.w)
  if (cards.value.has(id)) return cards.value.get(id)!
  const forms = entryForms(e)
  const card = newCard({
    id,
    word: e.w,
    meaning: glossList(e, 3),
    entryId: e.i,
    ...(e.p === 'n' && e.g ? { article: e.g } : {}),
    ...(e.l ? { level: e.l } : {}),
    ...(e.a ? { audio: e.a } : {}),
    ...(forms ? { forms } : {}),
    ...ctx,
  })
  await putCard(card)
  return card
}

export async function toggleSaved(e: Entry, ctx: CardContext = {}): Promise<boolean> {
  const id = cardId(e.w)
  if (cards.value.has(id)) {
    await deleteCard(id)
    return false
  }
  await saveEntry(e, ctx)
  return true
}

/** Save a keyword from a story's list ("de fiets|bicycle"). */
export async function toggleKeyword(word: string, meaning: string, level?: number, storyId?: string) {
  const m = /^(de|het|de\/het)\s+(.+)$/i.exec(word.trim())
  const bare = m ? m[2] : word.trim()
  const id = cardId(bare)
  if (cards.value.has(id)) {
    await deleteCard(id)
    return
  }
  await putCard(newCard({ id, word: bare, meaning, ...(m ? { article: m[1].toLowerCase() } : {}), ...(level ? { level } : {}), ...(storyId ? { storyId } : {}) }))
}

export async function recordReview(card: Card) {
  await putCard(card)
  await logActivity({ reviews: 1 })
}

/** Anki-friendly TSV export. */
export function exportCardsTsv(list: Card[]): string {
  const esc = (s = '') => s.replace(/[\t\n]/g, ' ')
  const rows = list.map((c) =>
    [c.article ? `${c.article} ${c.word}` : c.word, c.meaning, c.forms ?? '', c.sentence ?? '', c.sentenceEn ?? ''].map(esc).join('\t'),
  )
  return ['#separator:tab', '#html:false', '#columns:Word\tMeaning\tForms\tSentence\tTranslation', ...rows].join('\n')
}
