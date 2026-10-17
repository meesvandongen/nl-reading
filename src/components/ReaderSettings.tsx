import { settings, updateSettings, FONTS, type FontFamily, type Settings } from '../state/settings'
import { voices, speak } from '../services/tts'
import { CEFR_NAMES } from '../lib/levels'
import { Sheet } from './Sheet'

function Seg<K extends keyof Settings>({
  k,
  options,
}: {
  k: K
  options: [Settings[K], string][]
}) {
  const v = settings.value[k]
  return (
    <div class="seg-control" role="radiogroup">
      {options.map(([val, label]) => (
        <button role="radio" aria-checked={v === val} class={v === val ? 'on' : ''} onClick={() => updateSettings({ [k]: val } as Partial<Settings>)}>
          {label}
        </button>
      ))}
    </div>
  )
}

function Toggle({ k, label, hint }: { k: keyof Settings; label: string; hint?: string }) {
  return (
    <label class="toggle row">
      <span>
        {label}
        {hint && <span class="muted small block">{hint}</span>}
      </span>
      <input type="checkbox" checked={!!settings.value[k]} onChange={(e) => updateSettings({ [k]: (e.target as HTMLInputElement).checked } as Partial<Settings>)} />
    </label>
  )
}

export function ReadingOptions() {
  const s = settings.value
  return (
    <div class="settings-list">
      <div class="setting">
        <div class="setting-label">Meaning above words</div>
        <Seg k="glossScope" options={[['off', 'Off'], ['unknown', 'New words'], ['level', 'By level'], ['all', 'All']]} />
        {s.glossScope === 'unknown' && <p class="muted small">Hidden for words you marked as known and flashcards you have learned well.</p>}
        {s.glossScope === 'level' && (
          <div class="row-inline">
            <span class="small">Show for words above</span>
            <select value={String(s.glossLevel)} onChange={(e) => updateSettings({ glossLevel: Number((e.target as HTMLSelectElement).value) })}>
              {[1, 2, 3, 4, 5].map((n) => (
                <option value={String(n)}>{CEFR_NAMES[n]}</option>
              ))}
            </select>
          </div>
        )}
      </div>
      <div class="setting">
        <div class="setting-label">Translations</div>
        <Seg k="translation" options={[['off', 'Off'], ['sentence', 'Per sentence'], ['paragraph', 'Per paragraph']]} />
        {s.translation === 'sentence' && <p class="muted small">Tap a blurred translation to reveal it.</p>}
      </div>
      <Toggle k="articleColors" label="Colour nouns by article" hint="Learn de and het while you read" />
      {s.articleColors && (
        <div class="legend small">
          <span class="art-de">■ de-words</span> <span class="art-het">■ het-words</span>
        </div>
      )}
      <Toggle k="levelHighlight" label="Underline words by level" hint="Estimated from how common a word is" />
      {s.levelHighlight && (
        <div class="legend small">
          {[1, 2, 3, 4, 5, 6].map((l) => (
            <span class={`lv-${l}`}>{CEFR_NAMES[l]} </span>
          ))}
        </div>
      )}
      <Toggle k="highlightSaved" label="Underline saved words" />

      <div class="setting">
        <div class="setting-label">Font</div>
        <div class="font-options">
          {(Object.keys(FONTS) as FontFamily[]).map((f) => (
            <button class={`font-opt ${s.fontFamily === f ? 'on' : ''}`} style={{ fontFamily: FONTS[f].css }} onClick={() => updateSettings({ fontFamily: f })}>
              <span lang="nl">Lezen</span>
              <span class="small">{FONTS[f].label}</span>
            </button>
          ))}
        </div>
      </div>
      <div class="setting">
        <div class="setting-label">
          Text size <span class="muted">{s.fontSize}px</span>
        </div>
        <input type="range" min="14" max="36" step="1" value={s.fontSize} onInput={(e) => updateSettings({ fontSize: Number((e.target as HTMLInputElement).value) })} />
      </div>
      <div class="setting">
        <div class="setting-label">
          Line spacing <span class="muted">{s.lineHeight.toFixed(2)}</span>
        </div>
        <input type="range" min="1.3" max="2.6" step="0.05" value={s.lineHeight} onInput={(e) => updateSettings({ lineHeight: Number((e.target as HTMLInputElement).value) })} />
      </div>
      <div class="setting">
        <div class="setting-label">Theme</div>
        <Seg k="theme" options={[['system', 'Auto'], ['light', 'Light'], ['sepia', 'Sepia'], ['dark', 'Dark']]} />
      </div>
      <div class="setting">
        <div class="setting-label">Voice</div>
        {voices.value.length ? (
          <div class="row-inline">
            <select value={s.voice} onChange={(e) => updateSettings({ voice: (e.target as HTMLSelectElement).value })}>
              <option value="">Automatic</option>
              {voices.value.map((v) => (
                <option value={v.voiceURI}>
                  {v.name} ({v.lang})
                  {v.localService ? '' : ' · online'}
                </option>
              ))}
            </select>
            <button class="chip" onClick={() => speak('Goedemorgen! Zullen we samen een verhaal lezen?')}>
              Test
            </button>
          </div>
        ) : (
          <p class="muted small">No Dutch voice found on this device. Install a Dutch text-to-speech voice in your system settings to listen to stories.</p>
        )}
      </div>
      <div class="setting">
        <div class="setting-label">
          Speech speed <span class="muted">{s.rate}×</span>
        </div>
        <input type="range" min="0.5" max="1.5" step="0.05" value={s.rate} onInput={(e) => updateSettings({ rate: Number((e.target as HTMLInputElement).value) })} />
      </div>
      <Toggle k="recordings" label="Native recordings for single words" hint="Played from Wikimedia Commons when a word has one" />
      <Toggle k="autoScroll" label="Follow audio while listening" />
    </div>
  )
}

export function ReaderSettings({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Reading settings">
      <ReadingOptions />
    </Sheet>
  )
}
