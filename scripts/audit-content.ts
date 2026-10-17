// Content quality report for content/stories. Run after `npm run data`:
//   npm run audit -- [filter] [--errors]
// Prints, per story, problems a reviewer should look at:
//   - original stories with sentences that have no translation
//   - lines that look like more than one sentence
//   - keywords that don't occur in the text
//   - names: capitalized words in mid-sentence that aren't in `names:`, and listed names
//     that don't occur in the text
//   - words the dictionary doesn't know (typos, or words that need a `glosses:` entry)
//   - length outside the level's guideline, and the share of vocabulary far above the level
// Exit code 1 when any story has errors (missing translations, keywords not in the text,
// names in an original story that aren't in `names:`); --errors prints only those (used in CI).

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { parse as parseYaml } from 'yaml'
import { analyzeSentence, isLookupWord, lemmaKey } from '../src/lib/analyze'
import { parseStoryBody, parseTerms, splitFrontMatter, splitSentences } from '../src/lib/text'
import { levelCefr } from '../src/lib/levels'
import { CEFR_NAMES } from '../src/lib/levels'
import { normalizeKey } from '../src/lib/dictKeys.js'
import type { Term, Word } from '../src/lib/types'
import type { Lexicon } from '../src/lib/lexicon'
import { loadLexicon, ROOT } from './load-lexicon'

// words per level (content/README.md), with some slack
const LENGTH: Record<string, [number, number]> = {
  a1: [40, 200],
  a2: [120, 380],
  b1: [250, 750],
  b2: [400, 1100],
  c1: [550, 1500],
  classics: [0, Infinity],
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.md') ? [p] : []
  })
}

/** Does a keyword ("de fiets", "opbellen", "zich vergissen") occur in the text in some form? */
function keywordFound(kw: string, words: Word[], lex: Lexicon): boolean {
  const bare = normalizeKey(kw.replace(/^(de|het|de\/het)\s+/i, '').replace(/^zich\s+/i, ''))
  if (bare.includes(' ')) {
    const parts = bare.split(/\s+/)
    return parts.every((p) => words.some((w) => normalizeKey(w.s) === p || lemmaKey(w) === p))
  }
  return words.some(
    (w) =>
      normalizeKey(w.s) === bare ||
      lemmaKey(w) === bare ||
      w.cp?.some((p) => normalizeKey(p.b) === bare) ||
      // a keyword given as a compound the text inflects (fietsenstallingen)
      (bare.length > 5 && normalizeKey(w.s).startsWith(bare)) ||
      // a form the analyzer read as another word (sloten: sluiten or sloot)
      lex.forms(w.s).some(([id]) => normalizeKey(lex.lemma(id)?.w ?? '') === bare),
  )
}

async function main() {
  const args = process.argv.slice(2)
  const errorsOnly = args.includes('--errors')
  const filter = args.find((a) => !a.startsWith('--'))
  const lex = loadLexicon(true)!

  let failed = 0
  for (const file of walk(join(ROOT, 'content', 'stories')).sort()) {
    const rel = relative(ROOT, file)
    if (filter && !rel.includes(filter)) continue
    const errors: string[] = []
    const notes: string[] = []
    const { front, body } = splitFrontMatter(readFileSync(file, 'utf8'))
    const fm = (parseYaml(front) ?? {}) as Record<string, unknown>
    const levelDir = relative(join(ROOT, 'content', 'stories'), file).split(sep)[0]
    const level = String(fm.level ?? levelDir)
    const original = !fm.source
    const raw = parseStoryBody(body)
    const sentences = raw.flatMap((c) => c.p.flatMap((p) => p.s))
    let terms: Term[]
    try {
      terms = parseTerms(fm)
    } catch (err) {
      errors.push((err as Error).message)
      terms = []
    }

    const untranslated = sentences.filter((s) => !s.en)
    if (original && untranslated.length) errors.push(`${untranslated.length} sentence(s) without translation, e.g. "${untranslated[0].text}"`)

    const allWords: Word[] = []
    const unknown = new Map<string, number>()
    const missingNames = new Set<string>()
    for (const s of sentences) {
      if (splitSentences(s.text.replace(/"[^"]*"/g, 'Q')).length > 1) notes.push(`more than one sentence on a line? "${s.text}"`)
      if (/[“”„]/.test(s.text)) notes.push(`curly quotes (use straight "…"): "${s.text}"`)
      const words = analyzeSentence(lex, s.text, { terms })
      allWords.push(...words)
      words.forEach((w) => {
        if (!isLookupWord(w) || w.p === 'num') return
        if (w.p === 'name' && !w.m && w.e === undefined) missingNames.add(w.s)
        else if (w.e === undefined && !w.m && w.p !== 'name') unknown.set(w.s, (unknown.get(w.s) ?? 0) + 1)
      })
    }
    if (missingNames.size) (original ? errors : notes).push(`names not in \`names:\`: ${[...missingNames].join(', ')}`)
    for (const t of terms) {
      if (!sentences.some((s) => (t.name ? s.text.includes(t.s) : s.text.toLowerCase().includes(t.s.toLowerCase())))) notes.push(`${t.name ? 'name' : 'gloss'} "${t.s}" doesn't occur in the text`)
    }
    if (unknown.size) notes.push(`unknown words: ${[...unknown.keys()].join(', ')}`)

    for (const item of Array.isArray(fm.keywords) ? fm.keywords : []) {
      const [w] = String(item).split('|')
      if (!keywordFound(w.trim(), allWords, lex)) errors.push(`keyword "${w.trim()}" doesn't occur in the text`)
    }

    const content = allWords.filter((w) => isLookupWord(w) && w.p !== 'num' && w.p !== 'name')
    const range = LENGTH[level]
    if (range && (content.length < range[0] || content.length > range[1])) notes.push(`${content.length} words (guideline for ${level}: ${range[0]}–${range[1]})`)
    const target = levelCefr(level)
    if (level !== 'classics') {
      const hard = new Map<string, number>()
      for (const w of content) if (w.l && w.l >= target + 2 && !w.m) hard.set(lemmaKey(w), w.l)
      const share = content.filter((w) => w.l && w.l >= target + 2 && !w.m).length / (content.length || 1)
      if (share > 0.06) notes.push(`${Math.round(share * 100)}% of words are 2+ levels above ${level}: ${[...hard].slice(0, 12).map(([k, l]) => `${k} (${CEFR_NAMES[l]})`).join(', ')}`)
    }

    if (errors.length) failed++
    if (errors.length || (!errorsOnly && notes.length)) {
      console.log(`\n${rel}`)
      for (const e of errors) console.log(`  ERROR ${e}`)
      if (!errorsOnly) for (const n of notes) console.log(`  · ${n}`)
    }
  }
  if (failed) {
    console.log(`\n${failed} story/stories with errors`)
    process.exit(1)
  }
  console.log('\nno errors')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
