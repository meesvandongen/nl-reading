import { describe, expect, it } from 'vite-plus/test'
import { looksDutch, parsePlainText, parseStoryBody, parseTerms, splitSentences } from '../src/lib/text'
import { tokenize } from '../src/lib/analyze'

describe('story format', () => {
  it('parses chapters, sentences and translations', () => {
    const ch = parseStoryBody('## Deel 1\n\nHet regent.\n> It is raining.\nIk blijf thuis.\n> I stay at home.\n\nDe zon schijnt.\n')
    expect(ch).toHaveLength(1)
    expect(ch[0].title).toBe('Deel 1')
    expect(ch[0].p).toHaveLength(2)
    expect(ch[0].p[0].s).toEqual([
      { text: 'Het regent.', en: 'It is raining.' },
      { text: 'Ik blijf thuis.', en: 'I stay at home.' },
    ])
    expect(ch[0].p[1].s[0].en).toBeUndefined()
  })

  it('parses names and glosses', () => {
    expect(parseTerms({ names: ['Sanne|Sanne (given name)'], glosses: ['amai|wow (Flemish)'] })).toEqual([
      { s: 'Sanne', m: 'Sanne (given name)', name: true },
      { s: 'amai', m: 'wow (Flemish)' },
    ])
    expect(() => parseTerms({ names: ['Sanne'] })).toThrow()
  })
})

describe('sentences', () => {
  it('splits on . ! ? but not after abbreviations or initials', () => {
    expect(splitSentences('Het is laat. Kom je? Ja!')).toEqual(['Het is laat.', 'Kom je?', 'Ja!'])
    expect(splitSentences('Dhr. Jansen woont in Delft. Hij fietst.')).toEqual(['Dhr. Jansen woont in Delft.', 'Hij fietst.'])
    expect(splitSentences('Dat zei J. Cruijff vaak.')).toHaveLength(1)
    expect(splitSentences('"Kom je?" vroeg ze.')).toEqual(['"Kom je?"', 'vroeg ze.'])
  })

  it('joins wrapped lines and keeps paragraphs', () => {
    const ch = parsePlainText('Het regent al dagen.\nIk blijf\nthuis.\n\nMorgen wordt het droog.')
    expect(ch[0].p.map((p) => p.s.map((s) => s.text))).toEqual([['Het regent al dagen.', 'Ik blijf thuis.'], ['Morgen wordt het droog.']])
  })

  it('recognizes Dutch', () => {
    expect(looksDutch('Ik heb een fiets en die is rood.')).toBe(true)
    expect(looksDutch('The quick brown fox jumps over the lazy dog.')).toBe(false)
  })
})

describe('tokens', () => {
  it("keeps apostrophes, hyphens and 's together", () => {
    const words = tokenize("Zo'n auto's rijden 's ochtends naar Noord-Holland.").filter((t) => t.kind === 'word').map((t) => t.s)
    expect(words).toEqual(["Zo'n", "auto's", 'rijden', "'s", 'ochtends', 'naar', 'Noord-Holland'])
  })

  it('cuts story names as one word, also with a possessive s', () => {
    const terms = [{ s: 'Den Haag', m: 'The Hague', name: true }, { s: 'Willem', m: 'Willem', name: true }]
    const words = tokenize('Willems oma woont in Den Haag.', terms).filter((t) => t.kind === 'word')
    expect(words.map((t) => t.s)).toEqual(['Willems', 'oma', 'woont', 'in', 'Den Haag'])
    expect(words[0].term?.s).toBe('Willem')
  })
})
