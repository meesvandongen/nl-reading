// Analyzer tests against the real dictionary. They need `npm run data` first
// (CI builds the dictionary before running the tests); without it they're skipped.

import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { analyzeSentence } from '../src/lib/analyze'
import { parseLexicon } from '../src/lib/lexicon'
import type { Word } from '../src/lib/types'

const DICT = 'public/data/dict'
const have = existsSync(`${DICT}/forms.txt`)
const lex = have ? parseLexicon(readFileSync(`${DICT}/forms.txt`, 'utf8'), readFileSync(`${DICT}/lemmas.txt`, 'utf8')) : null

const words = (s: string) => analyzeSentence(lex!, s)
const find = (ws: Word[], surface: string) => ws.find((w) => w.s === surface)!

describe.skipIf(!have)('analyzer', () => {
  it('finds dictionary forms and what form a word is', () => {
    const ws = words('Het meisje liep gisteren naar huis.')
    expect(find(ws, 'liep')).toMatchObject({ b: 'lopen', p: 'v', c: 'pst' })
    expect(find(ws, 'liep').t).toContain('strong-verbs')
    expect(find(ws, 'Het').p).toBe('art')
  })

  it('knows de and het, and that diminutives are het', () => {
    const ws = words('De fiets staat bij het huisje.')
    expect(find(ws, 'fiets').a).toBe('de')
    expect(find(ws, 'huisje')).toMatchObject({ a: 'het', c: 'dim', b: 'huis' })
  })

  it('links the parts of separable verbs', () => {
    const ws = words('Ik bel je morgen op.')
    const bel = find(ws, 'bel')
    const op = find(ws, 'op')
    expect(bel.b).toBe('opbellen')
    expect(op).toMatchObject({ b: 'opbellen', p: 'prt' })
    expect(ws[bel.sp!]).toBe(op)
    expect(ws[op.sp!]).toBe(bel)
  })

  it('links "op te bellen"', () => {
    const ws = words('Ze probeerde hem op te bellen.')
    expect(find(ws, 'bellen').b).toBe('opbellen')
    expect(find(ws, 'op').p).toBe('prt')
  })

  it('does not take a preposition for a separable prefix', () => {
    const ws = words('Hij stapte uit de trein.')
    expect(find(ws, 'uit').p).toBe('prep')
    expect(find(ws, 'stapte').sp).toBeUndefined()
  })

  it('picks the right word among homographs', () => {
    expect(find(words('Het was koud.'), 'was').b).toBe('zijn')
    expect(find(words('Ik zie zijn fiets.'), 'zijn').p).toBe('det')
    expect(find(words('Zij zijn moe.'), 'zijn').p).toBe('v')
    expect(find(words('Ik bel je morgen.'), 'je').p).toBe('pron')
    expect(find(words('Ik zie je moeder.'), 'je').p).toBe('det')
  })

  it('tags the perfect tense and the passive', () => {
    const perfect = words('Ze heeft het boek gelezen.')
    expect(find(perfect, 'heeft').t).toContain('perfect-tense')
    expect(find(perfect, 'gelezen')).toMatchObject({ b: 'lezen', c: 'pp' })
    const passive = words('Er wordt veel gefietst.')
    expect(find(passive, 'gefietst').t).toContain('passive')
    expect(find(passive, 'Er').t).toContain('er')
  })

  it('splits compounds the dictionary does not have', () => {
    const w = find(words('Hij zag een fietsenwinkeltje.'), 'fietsenwinkeltje')
    expect(w.cp?.map((p) => p.b)).toEqual(['fiets', 'winkel'])
  })

  it('treats unknown capitalized words in mid-sentence as names', () => {
    expect(find(words('Gisteren belde Joukje mij.'), 'Joukje').p).toBe('name')
  })

  it('reads fixed expressions', () => {
    expect(find(words('Ten slotte ging hij naar huis.'), 'slotte').x?.b).toBe('ten slotte')
  })
})
