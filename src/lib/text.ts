// Parsing of story bodies (see content/README.md) and of arbitrary pasted text.

import type { Term } from './types'

export interface RawSentence {
  text: string
  en?: string
}
export interface RawParagraph {
  s: RawSentence[]
}
export interface RawChapter {
  title?: string
  p: RawParagraph[]
}

/**
 * Story-specific words from the front matter: `names:` (proper nouns) and
 * `glosses:` (words the dictionary gets wrong in this story). Each item is
 * `word|meaning`.
 */
export function parseTerms(fm: Record<string, unknown>): Term[] {
  const out: Term[] = []
  for (const [field, name] of [['names', true], ['glosses', false]] as const) {
    const list = fm[field]
    if (!Array.isArray(list)) continue
    for (const item of list) {
      const parts = String(item).split('|').map((x) => x.trim())
      const [s, m] = [parts[0], parts.slice(1).join('|')]
      if (!s || !m) throw new Error(`malformed ${field} item "${item}" (expected word|meaning)`)
      out.push({ s, m, ...(name ? { name } : {}) })
    }
  }
  return out
}

/** Split `---` YAML front matter from a Markdown document. */
export function splitFrontMatter(md: string): { front: string; body: string } {
  const m = /^﻿?---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(md)
  if (!m) return { front: '', body: md }
  return { front: m[1], body: md.slice(m[0].length) }
}

/** Parse a story body: one sentence per line, `> ` translations, `## ` chapters. */
export function parseStoryBody(body: string): RawChapter[] {
  const chapters: RawChapter[] = [{ p: [] }]
  let para: RawParagraph | null = null
  let last: RawSentence | null = null
  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line) {
      para = null
      last = null
      continue
    }
    if (line.startsWith('## ')) {
      const ch = chapters[chapters.length - 1]
      if (!ch.p.length && !ch.title) ch.title = line.slice(3).trim()
      else chapters.push({ title: line.slice(3).trim(), p: [] })
      para = null
      last = null
      continue
    }
    if (line.startsWith('# ') || line.startsWith('<!--')) continue
    if (line.startsWith('>')) {
      const en = line.replace(/^>\s?/, '').trim()
      if (last) last.en = last.en ? `${last.en} ${en}` : en
      continue
    }
    if (!para) {
      para = { s: [] }
      chapters[chapters.length - 1].p.push(para)
    }
    last = { text: line }
    para.s.push(last)
  }
  return chapters.filter((c) => c.p.length || c.title)
}

/** Abbreviations whose full stop doesn't end a sentence. */
const ABBREVIATIONS = new Set([
  'dhr', 'mevr', 'mr', 'mw', 'dr', 'drs', 'ir', 'ing', 'prof', 'st', 'bijv', 'bv', 'enz', 'etc', 'o.a', 'm.a.w', 'd.w.z', 'i.p.v', 'z.g.a.n',
  'ca', 'nr', 'blz', 'jl', 'vs', 'resp', 'evt', 'incl', 'excl', 'max', 'min', 'tel', 'jr', 'sr', 'mln', 'mld', 'ong', 'zgn', 'vgl', 'pag',
  'no', 'jan', 'feb', 'mrt', 'apr', 'aug', 'sep', 'sept', 'okt', 'nov', 'dec', 'n.chr', 'v.chr', 'a.s', 'p.s', 't.a.v', 'z.s.m',
])

/** Split a run of text into sentences, keeping quotes and abbreviations together. */
export function splitSentences(text: string): string[] {
  const out: string[] = []
  const re = /[^.!?…]+(?:[.!?…]+["'”’)\]]*|$)/g
  let cur = ''
  for (const m of text.matchAll(re)) {
    const part = m[0]
    if (!part.trim()) continue
    cur += part
    const t = cur.trimEnd()
    // "dhr. Jansen", "bijv. een", "3.5", initials ("J. Cruijff")
    const lastWord = /([\p{L}.]+)\.$/u.exec(t)?.[1]?.toLowerCase()
    const abbrev = !!lastWord && (ABBREVIATIONS.has(lastWord) || /^\p{L}$/u.test(lastWord))
    const nextStartsLower = /^\s*[\p{Ll}\d]/u.test(text.slice((m.index ?? 0) + part.length))
    if (/[.!?…]["'”’)\]]*$/.test(t) && !abbrev && !(t.endsWith('…') && nextStartsLower)) {
      out.push(cur.trim())
      cur = ''
    }
  }
  if (cur.trim()) out.push(cur.trim())
  return out
}

/** Parse arbitrary pasted text into chapters/paragraphs/sentences. */
export function parsePlainText(text: string): RawChapter[] {
  const paragraphs: RawParagraph[] = []
  const blocks = text.replace(/\r\n?/g, '\n').split(/\n\s*\n/)
  for (const block of blocks) {
    // single line breaks inside a block: a new paragraph when the line is indented or
    // starts dialogue, otherwise just wrapped text
    const lines = block.split('\n').map((l) => l.replace(/\s+$/, '')).filter((l) => l.trim())
    let cur: string[] = []
    const flush = () => {
      if (!cur.length) return
      const sentences = splitSentences(cur.join(' '))
      if (sentences.length) paragraphs.push({ s: sentences.map((t) => ({ text: t })) })
      cur = []
    }
    for (const line of lines) {
      if (/^\s{2,}|\t/.test(line) || /^["“'‘–—-]\s?/.test(line.trim())) flush()
      cur.push(line.trim())
    }
    flush()
  }
  return [{ p: paragraphs }]
}

/** Does this look like Dutch? A cheap check before analyzing pasted text. */
export function looksDutch(text: string): boolean {
  const words = text.toLowerCase().match(/\p{L}+/gu) ?? []
  if (words.length < 2) return words.length === 1
  const common = new Set('de het een en van is in dat op te ik je niet zijn met voor er die hij ze we wat maar als aan bij ook nog naar om was dan of wel heb heeft hebben uit door zo al'.split(' '))
  const hits = words.filter((w) => common.has(w)).length
  return hits / words.length > 0.08
}
