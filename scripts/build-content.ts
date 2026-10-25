// Builds the reading library from content/ into public/data/library/:
//   index.json                 list of stories, series + grammar articles
//   stories/<id>.json          pre-analyzed story (StoryDoc)
//   grammar/<id>.json          grammar article (rendered HTML)

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join, basename, relative, sep } from 'node:path'
import { execFileSync } from 'node:child_process'
import { parse as parseYaml } from 'yaml'
import { marked } from 'marked'
import { analyzeChapters, allWords, lemmaKey } from '../src/lib/analyze'
import { textStats } from '../src/lib/stats'
import { parseStoryBody, parseTerms, splitFrontMatter } from '../src/lib/text'
import { LEVELS, levelCefr } from '../src/lib/levels'
import { withArticle } from '../src/lib/gloss'
import type { Lexicon } from '../src/lib/lexicon'
import type { GrammarMeta, Keyword, LibraryIndex, SeriesMeta, StoryDoc, StoryMeta, Word } from '../src/lib/types'
import { EMPTY_LEXICON, loadLexicon, ROOT } from './load-lexicon'

const CONTENT = join(ROOT, 'content')
const STORIES = join(CONTENT, 'stories')
const OUT = join(ROOT, 'public', 'data', 'library')

function walk(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.md') && basename(p) !== 'README.md' ? [p] : []
  })
}

function gitAddedDate(file: string): string | undefined {
  try {
    const out = execFileSync('git', ['log', '--diff-filter=A', '--follow', '--format=%aI', '--', relative(ROOT, file)], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    const lines = out.split('\n').filter(Boolean)
    return lines[lines.length - 1]
  } catch {
    return undefined
  }
}

async function main() {
  const loaded = loadLexicon()
  if (!loaded) console.warn('! dictionary not built (run `pnpm run data`); stories get no dictionary forms, levels or keywords')
  const lex = loaded ?? EMPTY_LEXICON

  if (existsSync(OUT)) rmSync(OUT, { recursive: true })
  mkdirSync(join(OUT, 'stories'), { recursive: true })
  mkdirSync(join(OUT, 'grammar'), { recursive: true })

  const errors: string[] = []

  // ---- series: content/stories/<level>/<series-id>/series.yml + one .md per episode
  const seriesFm = new Map<string, Record<string, unknown>>()
  for (const levelDir of existsSync(STORIES) ? readdirSync(STORIES) : []) {
    if (!statSync(join(STORIES, levelDir)).isDirectory()) continue
    for (const f of readdirSync(join(STORIES, levelDir))) {
      const dir = join(STORIES, levelDir, f)
      if (!statSync(dir).isDirectory()) continue
      const rel = relative(ROOT, dir)
      const yml = join(dir, 'series.yml')
      if (!existsSync(yml)) {
        errors.push(`${rel}: a series folder needs a series.yml`)
        continue
      }
      try {
        const fm = (parseYaml(readFileSync(yml, 'utf8')) ?? {}) as Record<string, unknown>
        if (!fm.title) errors.push(`${rel}/series.yml: missing title`)
        if (!Array.isArray(fm.episodes) || !fm.episodes.length) errors.push(`${rel}/series.yml: missing episodes list`)
        if (seriesFm.has(f)) errors.push(`${rel}: duplicate series id "${f}"`)
        seriesFm.set(f, { ...fm, level: levelDir })
      } catch (err) {
        errors.push(`${rel}/series.yml: invalid YAML: ${(err as Error).message}`)
      }
    }
  }
  const episodeOf = new Map<string, { series: string; episode: number }>()
  for (const [sid, fm] of seriesFm) {
    const eps = Array.isArray(fm.episodes) ? fm.episodes.map(String) : []
    eps.forEach((id, i) => {
      if (episodeOf.has(id)) errors.push(`series ${sid}: episode "${id}" is listed twice`)
      else episodeOf.set(id, { series: sid, episode: i + 1 })
    })
  }

  // ---- stories
  const stories: StoryMeta[] = []
  const ids = new Set<string>()
  for (const file of walk(STORIES)) {
    const id = basename(file, '.md')
    const rel = relative(ROOT, file)
    if (ids.has(id)) {
      errors.push(`${rel}: duplicate story id "${id}"`)
      continue
    }
    ids.add(id)
    const [levelDir, ...sub] = relative(STORIES, file).split(sep)
    const seriesId = sub.length === 2 ? sub[0] : undefined
    if (sub.length > 2) errors.push(`${rel}: stories go in content/stories/<level>/ or content/stories/<level>/<series>/`)
    const ep = episodeOf.get(id)
    if (seriesId && ep?.series !== seriesId) errors.push(`${rel}: not listed in ${seriesId}/series.yml`)
    if (!seriesId && ep) errors.push(`${rel}: listed in series "${ep.series}" but not in its folder`)
    const inSeries = seriesId ? seriesFm.get(seriesId) : undefined
    const { front, body } = splitFrontMatter(readFileSync(file, 'utf8'))
    let fm: Record<string, unknown>
    try {
      fm = (parseYaml(front) ?? {}) as Record<string, unknown>
    } catch (err) {
      errors.push(`${rel}: invalid front matter: ${(err as Error).message}`)
      continue
    }
    const level = String(fm.level ?? levelDir)
    if (!LEVELS.some((l) => l.id === level)) errors.push(`${rel}: unknown level "${level}"`)
    if (level !== levelDir) errors.push(`${rel}: level "${level}" doesn't match its folder "${levelDir}"`)
    if (inSeries && level !== inSeries.level) errors.push(`${rel}: every episode of a series is at the series' level (${inSeries.level})`)
    if (!fm.title) errors.push(`${rel}: missing title`)

    let terms
    try {
      terms = parseTerms(fm)
    } catch (err) {
      errors.push(`${rel}: ${(err as Error).message}`)
      continue
    }
    const chapters = analyzeChapters(lex, parseStoryBody(body), terms)
    const words = allWords(chapters)
    const stats = textStats(chapters)

    const meta: StoryMeta = {
      id,
      title: String(fm.title ?? id),
      ...(fm.title_en ? { title_en: String(fm.title_en) } : {}),
      level: level as StoryMeta['level'],
      category: String(fm.category ?? 'misc'),
      ...(Array.isArray(fm.tags) ? { tags: fm.tags.map(String) } : {}),
      ...(fm.summary ? { summary: String(fm.summary) } : {}),
      ...(fm.author ? { author: String(fm.author) } : {}),
      ...(fm.license ? { license: String(fm.license) } : {}),
      ...(fm.source ? { source: String(fm.source) } : {}),
      ...(fm.year ? { year: Number(fm.year) } : {}),
      ...stats,
      added: (fm.added ? String(fm.added) : undefined) ?? gitAddedDate(file) ?? new Date().toISOString(),
      ...(inSeries && ep ? { series: ep.series, episode: ep.episode } : {}),
    }

    const keywords = buildKeywords(lex, fm.keywords, words, level)
    const doc: StoryDoc = { meta, keywords, chapters }
    writeFileSync(join(OUT, 'stories', `${id}.json`), JSON.stringify(doc))
    stories.push(meta)
  }

  // ---- grammar
  const grammar: GrammarMeta[] = []
  for (const file of walk(join(CONTENT, 'grammar'))) {
    const id = basename(file, '.md')
    const { front, body } = splitFrontMatter(readFileSync(file, 'utf8'))
    let fm: Record<string, unknown> = {}
    try {
      fm = (parseYaml(front) ?? {}) as Record<string, unknown>
    } catch (err) {
      errors.push(`${relative(ROOT, file)}: invalid front matter: ${(err as Error).message}`)
    }
    const meta: GrammarMeta = {
      id,
      title: String(fm.title ?? id),
      ...(fm.title_nl ? { title_nl: String(fm.title_nl) } : {}),
      ...(fm.cefr ? { cefr: String(fm.cefr) } : {}),
      ...(fm.order != null ? { order: Number(fm.order) } : {}),
      ...(fm.summary ? { summary: String(fm.summary) } : {}),
    }
    const html = await marked.parse(body)
    writeFileSync(join(OUT, 'grammar', `${id}.json`), JSON.stringify({ meta, html }))
    grammar.push(meta)
  }
  grammar.sort((a, b) => (a.order ?? 999) - (b.order ?? 999) || a.title.localeCompare(b.title))

  const levelOrder = (l: string) => LEVELS.findIndex((x) => x.id === l)
  // episodes of a series stay together and in order, at the place of the first episode
  const firstEp = new Map<string, number>()
  for (const s of stories) if (s.series && s.episode === 1) firstEp.set(s.series, s.words)
  const sortWords = (s: StoryMeta) => (s.series ? (firstEp.get(s.series) ?? s.words) : s.words)
  stories.sort(
    (a, b) =>
      levelOrder(a.level) - levelOrder(b.level) ||
      sortWords(a) - sortWords(b) ||
      (a.series ?? '').localeCompare(b.series ?? '') ||
      (a.episode ?? 0) - (b.episode ?? 0),
  )

  const series: SeriesMeta[] = []
  for (const [id, fm] of seriesFm) {
    const eps = (Array.isArray(fm.episodes) ? fm.episodes.map(String) : []).map((e) => stories.find((s) => s.id === e))
    eps.forEach((s, i) => {
      if (!s) errors.push(`series ${id}: episode "${(fm.episodes as unknown[])[i]}" has no file in its folder`)
    })
    const found = eps.filter((s): s is StoryMeta => !!s)
    series.push({
      id,
      title: String(fm.title ?? id),
      ...(fm.title_en ? { title_en: String(fm.title_en) } : {}),
      level: fm.level as SeriesMeta['level'],
      category: String(fm.category ?? found[0]?.category ?? 'misc'),
      ...(fm.summary ? { summary: String(fm.summary) } : {}),
      ...(fm.author ? { author: String(fm.author) } : {}),
      episodes: found.map((s) => s.id),
      words: found.reduce((a, s) => a + s.words, 0),
      added: found.map((s) => s.added ?? '').sort().pop(),
    })
  }
  series.sort((a, b) => levelOrder(a.level) - levelOrder(b.level) || a.title.localeCompare(b.title))

  const index: LibraryIndex = { built: new Date().toISOString(), stories, series, grammar }
  writeFileSync(join(OUT, 'index.json'), JSON.stringify(index))

  console.log(`library: ${stories.length} stories, ${series.length} series, ${grammar.length} grammar articles → ${relative(ROOT, OUT)}`)
  if (errors.length) {
    console.error(errors.map((e) => `✗ ${e}`).join('\n'))
    process.exit(1)
  }
}

/** The level of a keyword as written in the front matter ("de fiets", "opbellen"). */
function keywordLevel(lex: Lexicon, w: string): number | undefined {
  const bare = w.replace(/^(de|het|de\/het)\s+/i, '').replace(/^zich\s+/i, '').trim()
  for (const [id] of lex.forms(bare)) {
    const l = lex.lemma(id)?.l
    if (l) return l
  }
  return undefined
}

function buildKeywords(lex: Lexicon, given: unknown, words: Word[], level: string): Keyword[] {
  if (Array.isArray(given) && given.length) {
    const out: Keyword[] = []
    for (const item of given) {
      const [w, ...rest] = String(item).split('|').map((s) => s.trim())
      if (!w) continue
      const kw: Keyword = { w, m: rest.join('|') }
      const l = keywordLevel(lex, w)
      if (l) kw.l = l
      if (!kw.m) {
        const hit = lex.forms(w.replace(/^(de|het)\s+/, ''))[0]
        kw.m = (hit && lex.lemma(hit[0])?.h) || ''
      }
      out.push(kw)
    }
    return out
  }
  // Automatic: content words above the level, weighted by how often they appear.
  const target = levelCefr(level)
  const counts = new Map<string, { w: Word; n: number }>()
  for (const w of words) {
    if (!['n', 'v', 'adj', 'adv'].includes(w.p) || !w.e || !w.l || w.m) continue
    const k = lemmaKey(w)
    const c = counts.get(k)
    if (c) c.n++
    else counts.set(k, { w, n: 1 })
  }
  return [...counts.values()]
    .filter(({ w }) => w.l! > target)
    .map(({ w, n }) => ({ w, score: (w.l! - target) * (1 + Math.log2(n)) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map(({ w }) => ({ w: withArticle(w), m: w.h ?? '', l: w.l }))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
