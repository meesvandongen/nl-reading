import { back } from '../router'
import { Icon } from '../components/Icon'
import { library } from '../services/library'

export function AboutPage() {
  const lib = library.value
  return (
    <div class="page about prose">
      <header class="topbar">
        <button class="icon-btn" onClick={() => back('/progress')} aria-label="Back">
          <Icon name="back" />
        </button>
        <div class="topbar-title">About</div>
      </header>
      <h1>
        <span lang="nl">Lees mee</span> · NL Reading
      </h1>
      <p>
        A free, open-source Dutch reader. Graded stories from A1 to C1 about life in the Netherlands and Flanders, classic Dutch literature, and
        any text you paste. Tap a word for its meaning, de or het, its dictionary form and its verb forms; separable verbs are recognised even when
        their parts are far apart (<i lang="nl">Ik bel je morgen op</i> → <i lang="nl">opbellen</i>). Sentence translations, audio, grammar guides and
        spaced-repetition flashcards. It runs entirely in your browser and works offline.
      </p>
      {lib && (
        <p class="muted">
          Library: {lib.stories.length} stories · {lib.grammar.length} grammar articles · updated {new Date(lib.built).toLocaleDateString()}
        </p>
      )}
      <h2>Add a story</h2>
      <p>
        Every text is a Markdown file in the <code>content/stories</code> folder of the repository. Add one with a pull request and it appears in the
        app after the next deploy. See <code>content/README.md</code> for the format and <code>content/STYLE.md</code> for the house style.
      </p>
      <h2>Credits & licenses</h2>
      <ul>
        <li>
          <b>Dictionary</b> — the Dutch entries of the English{' '}
          <a href="https://en.wiktionary.org" target="_blank" rel="noopener noreferrer">
            Wiktionary
          </a>
          , extracted by{' '}
          <a href="https://kaikki.org/dictionary/Dutch/" target="_blank" rel="noopener noreferrer">
            Wiktextract (kaikki.org)
          </a>
          . CC BY-SA 4.0 and GFDL.
        </li>
        <li>
          <b>Recordings</b> of single words — Wikimedia Commons contributors, mostly CC BY-SA; each recording links to its page.
        </li>
        <li>
          <b>Word frequencies</b> (for the word levels) — OpenSubtitles via{' '}
          <a href="https://github.com/hermitdave/FrequencyWords" target="_blank" rel="noopener noreferrer">
            hermitdave/FrequencyWords
          </a>
          , CC BY-SA 4.0.
        </li>
        <li>
          <b>Classic literature</b> — public domain (Project Gutenberg, DBNL). Spelling modernized.
        </li>
        <li>
          <b>Original stories and grammar articles</b> — written for this project, CC BY 4.0.
        </li>
      </ul>
      <p class="muted small">
        Word levels (A1–C2) are estimated from how common a word is, not from an official list. Inspired by graded-reader apps. Not affiliated with
        any of them.
      </p>
    </div>
  )
}
