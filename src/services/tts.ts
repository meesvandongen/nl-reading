// Audio: the browser's Dutch text-to-speech voices, with sentence-level playback
// queues (for story audio) and Media Session integration (for lock-screen /
// background "audiobook" controls), plus native-speaker recordings of single
// words from Wikimedia Commons where the dictionary has one.

import { signal } from '@preact/signals'
import { settings } from '../state/settings'
import { audioUrl } from '../lib/dict'

export const voices = signal<SpeechSynthesisVoice[]>([])
export const ttsSupported = typeof window !== 'undefined' && 'speechSynthesis' in window

function refreshVoices() {
  if (!ttsSupported) return
  const all = speechSynthesis.getVoices()
  voices.value = all
    .filter((v) => v.lang.replace('_', '-').toLowerCase().startsWith('nl'))
    .sort(
      (a, b) =>
        // Netherlands before Belgium, local before online
        Number(b.lang.toLowerCase().includes('nl-nl')) - Number(a.lang.toLowerCase().includes('nl-nl')) ||
        Number(b.localService) - Number(a.localService) ||
        a.name.localeCompare(b.name),
    )
}
if (ttsSupported) {
  refreshVoices()
  speechSynthesis.addEventListener?.('voiceschanged', refreshVoices)
}

function pickVoice(): SpeechSynthesisVoice | undefined {
  const name = settings.value.voice
  return voices.value.find((v) => v.voiceURI === name) ?? voices.value.find((v) => /natural|enhanced|premium|google/i.test(v.name)) ?? voices.value[0]
}

function utter(text: string, rate: number): SpeechSynthesisUtterance {
  const u = new SpeechSynthesisUtterance(text)
  const v = pickVoice()
  u.lang = v?.lang ?? 'nl-NL'
  if (v) u.voice = v
  u.rate = rate
  return u
}

let clip: HTMLAudioElement | null = null

/** Speak a single word or phrase, interrupting anything playing. With a recording path, play that instead. */
export function speak(text: string, opts: { rate?: number; recording?: string } = {}) {
  stopQueue()
  clip?.pause()
  if (opts.recording && settings.value.recordings) {
    clip = new Audio(audioUrl(opts.recording))
    clip.play().catch(() => speakTts(text, opts.rate))
    return
  }
  speakTts(text, opts.rate)
}

function speakTts(text: string, rate = settings.value.rate) {
  if (!ttsSupported) return
  speechSynthesis.cancel()
  speechSynthesis.speak(utter(text, rate))
}

// ---- sentence queue

export interface QueueItem {
  text: string
}

export const playing = signal<{ index: number; total: number; paused: boolean } | null>(null)

let queue: QueueItem[] = []
let index = 0
let token = 0
let onIndex: ((i: number) => void) | null = null
let keepAlive: ReturnType<typeof setInterval> | null = null

export function playQueue(items: QueueItem[], start: number, cb: (i: number) => void, meta?: { title: string; artist?: string }) {
  if (!ttsSupported) return
  speechSynthesis.cancel()
  queue = items
  index = start
  onIndex = cb
  token++
  setupMediaSession(meta)
  playCurrent()
  // Chrome stops long utterances after ~15s unless poked
  if (keepAlive) clearInterval(keepAlive)
  keepAlive = setInterval(() => {
    if (playing.value && !playing.value.paused && speechSynthesis.speaking) {
      speechSynthesis.pause()
      speechSynthesis.resume()
    }
  }, 10000)
}

function playCurrent() {
  if (index >= queue.length) {
    stopQueue()
    return
  }
  const my = ++token
  const u = utter(queue[index].text, settings.value.rate)
  u.onend = () => {
    if (my !== token) return
    index++
    if (index < queue.length) {
      onIndex?.(index)
      playCurrent()
    } else stopQueue()
  }
  u.onerror = (e) => {
    if (my !== token || e.error === 'interrupted' || e.error === 'canceled') return
    stopQueue()
  }
  playing.value = { index, total: queue.length, paused: false }
  onIndex?.(index)
  speechSynthesis.speak(u)
  if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing'
}

export function pauseQueue() {
  if (!playing.value) return
  token++
  speechSynthesis.cancel()
  playing.value = { ...playing.value, paused: true }
  if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused'
}

export function resumeQueue() {
  if (!playing.value) return
  playCurrent()
}

export function seekQueue(i: number) {
  if (!queue.length) return
  index = Math.max(0, Math.min(queue.length - 1, i))
  token++
  speechSynthesis.cancel()
  playCurrent()
}

export function stopQueue() {
  token++
  if (ttsSupported) speechSynthesis.cancel()
  playing.value = null
  if (keepAlive) clearInterval(keepAlive)
  keepAlive = null
  if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'none'
}

export function queueIndex() {
  return index
}

function setupMediaSession(meta?: { title: string; artist?: string }) {
  if (!('mediaSession' in navigator)) return
  const ms = navigator.mediaSession
  try {
    ms.metadata = new MediaMetadata({
      title: meta?.title ?? 'Dutch reading',
      artist: meta?.artist ?? 'NL Reading',
      album: 'NL Reading',
      artwork: [{ src: new URL('icons/icon-512.png', location.href).href, sizes: '512x512', type: 'image/png' }],
    })
    ms.setActionHandler('play', () => resumeQueue())
    ms.setActionHandler('pause', () => pauseQueue())
    ms.setActionHandler('stop', () => stopQueue())
    ms.setActionHandler('previoustrack', () => seekQueue(index - 1))
    ms.setActionHandler('nexttrack', () => seekQueue(index + 1))
  } catch {
    /* unsupported action */
  }
}
