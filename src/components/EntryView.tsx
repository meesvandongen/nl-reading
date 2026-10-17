import { cards } from '../state/db'
import type { Entry } from '../lib/dict'
import { cardId, toggleSaved, type CardContext } from '../services/cards'
import { speak } from '../services/tts'
import { navigate } from '../router'
import { Icon } from './Icon'
import { Article, CefrBadge } from './Badges'

export const POS_LABELS: Record<string, string> = {
  n: 'noun',
  v: 'verb',
  adj: 'adjective',
  adv: 'adverb',
  pron: 'pronoun',
  prep: 'preposition',
  conj: 'conjunction',
  det: 'determiner',
  art: 'article',
  num: 'number',
  intj: 'interjection',
  name: 'proper noun',
  phrase: 'expression',
  contr: 'contraction',
  prefix: 'prefix',
  suffix: 'suffix',
  part: 'particle',
}

const TAG_LABELS: Record<string, string> = {
  Netherlands: 'NL',
  Belgium: 'BE',
  Flanders: 'Flemish',
  Suriname: 'Surinamese',
  figuratively: 'figurative',
  'plural-only': 'plural only',
}

function Tags({ tags }: { tags?: string[] }) {
  if (!tags?.length) return null
  return (
    <span class="tags">
      {tags.map((t) => (
        <span class="tag">{TAG_LABELS[t] ?? t}</span>
      ))}
    </span>
  )
}

function Speak({ text, recording, size = 18 }: { text: string; recording?: string; size?: number }) {
  return (
    <button
      class="icon-btn small"
      aria-label={`Listen: ${text}`}
      onClick={(e) => {
        e.stopPropagation()
        speak(text, { recording })
      }}
    >
      <Icon name="volume" size={size} />
    </button>
  )
}

/** Principal parts of a verb: infinitive, past tense, participle (+ zijn), separable prefix. */
function VerbForms({ e }: { e: Entry }) {
  const v = e.v
  if (!v || (!v.pt && !v.pp)) return null
  return (
    <div class="verb-forms">
      <table>
        <thead>
          <tr>
            <th>infinitive</th>
            <th>past</th>
            <th>participle</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>{e.w}</td>
            <td>
              {v.pt}
              {v.ptp && v.ptp !== v.pt && <span class="muted"> / {v.ptp}</span>}
            </td>
            <td>
              {v.aux === 'zijn' ? 'is ' : v.aux ? 'heeft/is ' : 'heeft '}
              {v.pp}
            </td>
          </tr>
        </tbody>
      </table>
      <div class="verb-notes small">
        {v.k && (
          <button class="chip small" onClick={() => navigate('/grammar/strong-verbs')}>
            {v.k === 'strong' ? 'strong verb' : 'irregular verb'}
          </button>
        )}
        {v.sep && (
          <button class="chip small" onClick={() => navigate('/grammar/separable-verbs')}>
            separable: {splitExample(e.w, v.sep)}
          </button>
        )}
        {e.rf && (
          <button class="chip small" onClick={() => navigate('/grammar/reflexive-verbs')}>
            reflexive: zich {e.w}
          </button>
        )}
        {v.aux && (
          <button class="chip small" onClick={() => navigate('/grammar/perfect-tense')}>
            perfect with {v.aux}
          </button>
        )}
      </div>
    </div>
  )
}

/** "opbellen" → "ik bel … op" */
function splitExample(word: string, sep: string): string {
  return `ik ${presentStem(word.slice(sep.length))} … ${sep}`
}

/** The ik-form of a verb, from its infinitive: bellen → bel, nemen → neem, geven → geef, gaan → ga. */
function presentStem(inf: string): string {
  const irregular: Record<string, string> = { komen: 'kom', zijn: 'ben', hebben: 'heb', kunnen: 'kan', willen: 'wil', zullen: 'zal', mogen: 'mag' }
  if (irregular[inf]) return irregular[inf]
  if (/(aan|oen|ien)$/.test(inf)) return inf.slice(0, -1)
  let stem = inf.replace(/en$/, '')
  if (/(.)\1$/.test(stem)) stem = stem.slice(0, -1)
  else if (/(^|[^aeiou])[aeou][^aeiouwj]$/.test(stem)) stem = stem.replace(/([aeou])([^aeiouwj])$/, '$1$1$2')
  return stem.replace(/v$/, 'f').replace(/z$/, 's')
}

/** Full view of one dictionary entry. */
export function EntryView({ entry: e, ctx, compact = false, form }: { entry: Entry; ctx?: CardContext; compact?: boolean; form?: string }) {
  const saved = cards.value.has(cardId(e.w))
  return (
    <div class="entry">
      <div class="entry-head">
        <div class="entry-word" lang="nl">
          {e.p === 'n' && <Article a={e.g} />} {e.w}
        </div>
        <div class="entry-actions">
          <Speak text={e.w} recording={e.a} size={22} />
          <button
            class={`icon-btn save ${saved ? 'on' : ''}`}
            aria-label={saved ? 'Remove from flashcards' : 'Save to flashcards'}
            onClick={() => toggleSaved(e, ctx)}
          >
            <Icon name="star" fill={saved} />
          </button>
        </div>
      </div>
      <div class="entry-sub">
        <span class="pos">{POS_LABELS[e.p] ?? e.p}</span>
        {e.ipa && <span class="ipa">{e.ipa}</span>}
        <CefrBadge level={e.l} />
        {form && <span class="badge form">{form}</span>}
      </div>
      {e.p === 'n' && (e.pl?.length || e.dim || e.g) && (
        <div class="noun-forms small">
          {e.g === 'het' && (
            <button class="chip small het-chip" onClick={() => navigate('/grammar/de-het')}>
              het-word
            </button>
          )}
          {e.g === 'de/het' && (
            <button class="chip small" onClick={() => navigate('/grammar/de-het')}>
              de or het
            </button>
          )}
          {e.pl?.length ? (
            <span>
              <span class="label">plural</span> de {e.pl.join(', ')}
            </span>
          ) : e.po ? (
            <span class="muted">plural only</span>
          ) : null}
          {e.dim && (
            <span>
              <span class="label">small</span> het {e.dim}
            </span>
          )}
        </div>
      )}
      {!compact && <VerbForms e={e} />}
      {compact && e.v && (e.v.k || e.v.sep) && (
        <div class="small muted">
          {[e.v.pt, e.v.pp].filter(Boolean).join(' – ')}
          {e.v.sep ? ` · separable` : ''}
        </div>
      )}
      {e.c && !compact && (
        <div class="small">
          <span class="label">comparison</span> {e.w} – {e.c[0]} – {e.c[1] ? `het ${e.c[1]}(e)` : ''}
        </div>
      )}
      <ol class="senses">
        {e.s.slice(0, compact ? 3 : undefined).map((s) => (
          <li>
            <Tags tags={s.t} />
            <span class="gloss">{s.g}</span>
            {!compact && s.x && (
              <div class="example">
                <span lang="nl">{s.x[0]}</span> <Speak text={s.x[0]} size={14} />
                <div class="muted small">{s.x[1]}</div>
              </div>
            )}
          </li>
        ))}
      </ol>
      {!compact && (
        <div class="entry-links small muted">
          <a href={`https://en.wiktionary.org/wiki/${encodeURIComponent(e.w)}#Dutch`} target="_blank" rel="noopener noreferrer">
            Wiktionary <Icon name="external" size={12} />
          </a>
          {' · '}
          <a href={`https://woordenlijst.org/zoeken/?q=${encodeURIComponent(e.w)}`} target="_blank" rel="noopener noreferrer">
            Woordenlijst <Icon name="external" size={12} />
          </a>
          {e.a && (
            <>
              {' · '}
              <a href={`https://commons.wikimedia.org/wiki/File:${encodeURIComponent(e.a.split('/').pop()!)}`} target="_blank" rel="noopener noreferrer">
                recording (CC BY-SA)
              </a>
            </>
          )}
        </div>
      )}
    </div>
  )
}
