import { useEffect } from 'preact/hooks'
import { route, navigate } from './router'
import { dbReady, cards } from './state/db'
import { settings } from './state/settings'
import { isDue } from './services/srs'
import { offlineReady, online, updateAvailable } from './services/pwa'
import { Icon } from './components/Icon'
import { LibraryPage } from './pages/LibraryPage'
import { ReaderPage } from './pages/ReaderPage'
import { SeriesPage } from './pages/SeriesPage'
import { ImportPage } from './pages/ImportPage'
import { ReviewPage } from './pages/ReviewPage'
import { DictionaryPage } from './pages/DictionaryPage'
import { GrammarListPage, GrammarArticlePage } from './pages/GrammarPage'
import { ProgressPage } from './pages/ProgressPage'
import { SettingsPage } from './pages/SettingsPage'
import { AboutPage } from './pages/AboutPage'

const TABS = [
  { path: '/', icon: 'book', label: 'Read', match: (p: string) => p === '/' || p.startsWith('/import') || p.startsWith('/series') },
  { path: '/review', icon: 'cards', label: 'Flashcards', match: (p: string) => p.startsWith('/review') },
  { path: '/dictionary', icon: 'search', label: 'Dictionary', match: (p: string) => p.startsWith('/dictionary') },
  { path: '/grammar', icon: 'grammar', label: 'Grammar', match: (p: string) => p.startsWith('/grammar') },
  { path: '/progress', icon: 'user', label: 'Me', match: (p: string) => ['/progress', '/settings', '/about'].some((x) => p.startsWith(x)) },
]

function Page() {
  const { parts } = route.value
  switch (parts[0]) {
    case undefined:
      return <LibraryPage />
    case 'read':
      return <ReaderPage id={parts[1]} />
    case 'series':
      return <SeriesPage id={parts[1]} />
    case 'import':
      return <ImportPage />
    case 'review':
      return <ReviewPage />
    case 'dictionary':
      return <DictionaryPage />
    case 'grammar':
      return parts[1] ? <GrammarArticlePage id={parts[1]} /> : <GrammarListPage />
    case 'progress':
      return <ProgressPage />
    case 'settings':
      return <SettingsPage />
    case 'about':
      return <AboutPage />
    default:
      return (
        <div class="page">
          <p>Page not found.</p>
          <button class="btn" onClick={() => navigate('/')}>
            Go home
          </button>
        </div>
      )
  }
}

export function App() {
  const path = route.value.path
  const inReader = path.startsWith('/read/')
  const due = [...cards.value.values()].filter((c) => isDue(c)).length

  useEffect(() => {
    if (!inReader) window.scrollTo(0, 0)
  }, [path])
  useEffect(() => {
    if (!offlineReady.value) return
    const t = setTimeout(() => (offlineReady.value = false), 4000)
    return () => clearTimeout(t)
  }, [offlineReady.value])

  if (!dbReady.value) return <div class="page loading">Loading…</div>

  return (
    <div class={`app ${inReader ? 'in-reader' : ''}`} data-font-size={settings.value.fontSize}>
      {!online.value && <div class="offline-banner">Offline — stories and saved data still work</div>}
      <main id="main">
        <Page />
      </main>
      {!inReader && (
        <nav class="tabbar" aria-label="Main">
          {TABS.map((t) => (
            <a href={`#${t.path}`} class={`tab-link ${t.match(path) ? 'on' : ''}`} aria-current={t.match(path) ? 'page' : undefined}>
              <span class="tab-icon">
                <Icon name={t.icon} />
                {t.path === '/review' && due > 0 && <span class="tab-badge">{due > 99 ? '99+' : due}</span>}
              </span>
              <span class="tab-label">{t.label}</span>
            </a>
          ))}
        </nav>
      )}
      {updateAvailable.value && (
        <div class="toast">
          A new version is available.
          <button class="btn small primary" onClick={() => updateAvailable.value?.()}>
            Update
          </button>
          <button class="icon-btn" aria-label="Dismiss" onClick={() => (updateAvailable.value = null)}>
            <Icon name="close" size={18} />
          </button>
        </div>
      )}
      {offlineReady.value && (
        <div class="toast" onClick={() => (offlineReady.value = false)}>
          Ready to work offline.
        </div>
      )}
    </div>
  )
}
