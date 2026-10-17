import { readFileSync } from 'node:fs'
import { parse } from 'yaml'
import { analyzeSentence } from '../src/lib/analyze'
import { parseStoryBody, parseTerms, splitFrontMatter } from '../src/lib/text'
import { loadLexicon } from './load-lexicon'
const lex = loadLexicon(true)!
const { front, body } = splitFrontMatter(readFileSync(process.argv[2], 'utf8'))
const terms = parseTerms(parse(front))
for (const c of parseStoryBody(body)) for (const p of c.p) for (const s of p.s) {
  const ws = analyzeSentence(lex, s.text, { terms })
  console.log(ws.filter(w => w.p !== 'sym').map(w => {
    let x = w.s
    if (w.b) x += `→${w.b}`
    x += `/${w.p}`
    if (w.c) x += `<${w.c}>`
    if (w.sp !== undefined) x += '↔'
    if (w.t) x += `#${w.t.join(',')}`
    return x
  }).join('  '))
}
