// Prints how a line of Dutch is analyzed: pnpm exec vpx scripts/show-words.ts "Ik bel je morgen op."

import { analyzeSentence } from '../src/lib/analyze'
import { loadLexicon } from './load-lexicon'

const lex = loadLexicon(true)!

for (const line of process.argv.slice(2)) {
  console.log(line)
  analyzeSentence(lex, line).forEach((w, i) => {
    if (w.p === 'sym') return
    const bits = [
      `${i}`.padStart(2),
      w.s.padEnd(16),
      w.p.padEnd(5),
      (w.b ?? '').padEnd(16),
      w.a ? `[${w.a}]` : '',
      w.c ? `<${w.c}>` : '',
      w.l ? `L${w.l}` : '',
      w.h ? `"${w.h}"` : '',
      w.sp !== undefined ? `↔${w.sp}` : '',
      w.t ? `#${w.t.join(',')}` : '',
      w.cp ? `{${w.cp.map((p) => p.b).join('+')}}` : '',
      w.m ? `(${w.m})` : '',
    ]
    console.log(bits.filter(Boolean).join(' '))
  })
  console.log()
}
