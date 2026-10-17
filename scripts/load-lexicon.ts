// Loads the dictionary's form index and lemma table (built by `npm run data`) for scripts.

import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { EMPTY_LEXICON, parseLexicon, type Lexicon } from '../src/lib/lexicon'

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
export const DICT = join(ROOT, 'public', 'data', 'dict')

export function loadLexicon(required = false): Lexicon | null {
  const forms = join(DICT, 'forms.txt')
  if (!existsSync(forms)) {
    if (required) throw new Error('dictionary not built: run `npm run data` first')
    return null
  }
  return parseLexicon(readFileSync(forms, 'utf8'), readFileSync(join(DICT, 'lemmas.txt'), 'utf8'))
}

export { EMPTY_LEXICON }
