import { useEffect, useState } from 'preact/hooks'
import { settings, updateSettings, resetSettings } from '../state/settings'
import { clearAll, exportBackup, importBackup, loadAll } from '../state/db'
import { LEVELS, LEVEL_HINTS } from '../lib/levels'
import { dictDownload, dictionaryOffline, downloadDictionary } from '../services/dictionary'
import { disableReminders, downloadIcs, enableReminders, scheduleInAppReminder } from '../services/reminders'
import { installPrompt, promptInstall, isStandalone } from '../services/pwa'
import { back, navigate } from '../router'
import { Icon } from '../components/Icon'
import { ReadingOptions } from '../components/ReaderSettings'

function useStorageEstimate() {
  const [est, setEst] = useState<{ usage: number; quota: number; persisted: boolean } | null>(null)
  const refresh = async () => {
    if (!navigator.storage?.estimate) return
    const e = await navigator.storage.estimate()
    const persisted = (await navigator.storage.persisted?.()) ?? false
    setEst({ usage: e.usage ?? 0, quota: e.quota ?? 0, persisted })
  }
  useEffect(() => {
    refresh()
  }, [dictDownload.value?.running])
  return { est, refresh }
}

export function SettingsPage() {
  const s = settings.value
  const [msg, setMsg] = useState<string | null>(null)
  const { est, refresh } = useStorageEstimate()
  const dl = dictDownload.value
  const offlineVersion = dictionaryOffline()

  const toggleReminder = async (on: boolean) => {
    updateSettings({ reminderEnabled: on })
    if (on) setMsg(await enableReminders())
    else {
      await disableReminders()
      setMsg('Reminders off.')
    }
    scheduleInAppReminder()
  }

  const backup = async () => {
    const blob = new Blob([await exportBackup()], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `nl-reading-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const restore = async (e: Event) => {
    const file = (e.target as HTMLInputElement).files?.[0]
    if (!file) return
    try {
      await importBackup(await file.text())
      await loadAll()
      setMsg('Backup restored. Reload the app to apply restored settings.')
    } catch (err) {
      setMsg(`Restore failed: ${(err as Error).message}`)
    }
  }

  return (
    <div class="page settings-page">
      <header class="topbar">
        <button class="icon-btn" onClick={() => back('/progress')} aria-label="Back">
          <Icon name="back" />
        </button>
        <div class="topbar-title">Settings</div>
      </header>
      {msg && (
        <div class="notice" onClick={() => setMsg(null)}>
          {msg}
        </div>
      )}

      <section>
        <h2 class="section-title">My level</h2>
        <select value={s.level} onChange={(e) => updateSettings({ level: (e.target as HTMLSelectElement).value, onboarded: true })}>
          {LEVELS.filter((l) => l.id !== 'classics').map((l) => (
            <option value={l.id}>
              {l.label} · {LEVEL_HINTS[l.id]}
            </option>
          ))}
        </select>
        <p class="muted small">Used for recommendations.</p>
      </section>

      <section>
        <h2 class="section-title">Reading</h2>
        <ReadingOptions />
      </section>

      <section>
        <h2 class="section-title">Reminders</h2>
        <label class="toggle row">
          <span>Daily reading reminder</span>
          <input type="checkbox" checked={s.reminderEnabled} onChange={(e) => toggleReminder((e.target as HTMLInputElement).checked)} />
        </label>
        <div class="row-inline">
          <span class="small">Remind me at</span>
          <input
            type="time"
            value={s.reminderTime}
            onChange={(e) => {
              updateSettings({ reminderTime: (e.target as HTMLInputElement).value })
              if (s.reminderEnabled) enableReminders()
              scheduleInAppReminder()
            }}
          />
          <button class="btn small ghost" onClick={downloadIcs}>
            <Icon name="bell" size={16} /> Add to calendar
          </button>
        </div>
      </section>

      <section>
        <h2 class="section-title">App & offline</h2>
        {!isStandalone() && installPrompt.value && (
          <button class="btn primary" onClick={promptInstall}>
            <Icon name="download" size={18} /> Install app
          </button>
        )}
        {!isStandalone() && !installPrompt.value && (
          <p class="muted small">
            To install: in Safari use <b>Share → Add to Home Screen</b>; in Chrome/Edge use the install icon in the address bar or menu.
          </p>
        )}
        <p class="small">All library stories and grammar articles work offline automatically once the app has loaded.</p>
        <div class="offline-row">
          <div>
            <b>Dictionary</b>
            <div class="muted small">
              {offlineVersion ? 'Downloaded for offline use.' : 'Words you look up are cached. Download everything (≈ 10 MB) to use it fully offline.'}
            </div>
          </div>
          <button class="btn small" disabled={dl?.running} onClick={() => downloadDictionary().then(refresh)}>
            {dl?.running ? `${Math.round((dl.done / dl.total) * 100)}%` : offlineVersion ? 'Update' : 'Download'}
          </button>
        </div>
        {dl?.running && (
          <div class="bar">
            <span style={{ width: `${(dl.done / dl.total) * 100}%` }} />
          </div>
        )}
        {dl?.error && <div class="notice error">{dl.error}</div>}
        {est && (
          <p class="muted small">
            Storage used: {(est.usage / 1e6).toFixed(1)} MB{est.quota ? ` of ${(est.quota / 1e9).toFixed(1)} GB` : ''}.{' '}
            {!est.persisted && navigator.storage?.persist && (
              <button class="link small" onClick={() => navigator.storage.persist().then(refresh)}>
                Keep data permanently
              </button>
            )}
          </p>
        )}
      </section>

      <section>
        <h2 class="section-title">Your data</h2>
        <p class="muted small">Everything (flashcards, progress, your texts) is stored only in this browser. Back it up to move to another device.</p>
        <div class="row-inline wrap">
          <button class="btn ghost" onClick={backup}>
            <Icon name="download" size={18} /> Export backup
          </button>
          <label class="btn ghost">
            <Icon name="upload" size={18} /> Restore backup
            <input type="file" accept="application/json,.json" hidden onChange={restore} />
          </label>
        </div>
        <div class="row-inline wrap danger-zone">
          <button class="btn ghost" onClick={() => confirm('Reset all settings to defaults?') && resetSettings()}>
            Reset settings
          </button>
          <button
            class="btn ghost danger"
            onClick={async () => {
              if (confirm('Delete ALL flashcards, progress and your texts? This cannot be undone.')) {
                await clearAll()
                setMsg('All data deleted.')
              }
            }}
          >
            <Icon name="trash" size={18} /> Delete all data
          </button>
        </div>
      </section>
      <button class="link" onClick={() => navigate('/about')}>
        About & credits →
      </button>
    </div>
  )
}
