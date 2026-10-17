// Reading reminders. Browsers have no reliable way to schedule a local
// notification from a static site, so we combine:
//  1. Periodic Background Sync (installed PWAs on Chromium): the service
//     worker wakes up roughly daily and notifies if you haven't read today.
//  2. An in-app timer while the app is open.
//  3. A calendar (.ics) file with a daily alarm, which works everywhere.

import { activity, today } from '../state/db'
import { settings } from '../state/settings'

export async function enableReminders(): Promise<string> {
  if (!('Notification' in window)) return 'This browser does not support notifications. Use the calendar reminder instead.'
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') return 'Notifications are blocked. Allow them in your browser settings, or use the calendar reminder.'
  saveReminderConfig()
  const reg = await navigator.serviceWorker?.ready.catch(() => null)
  const periodic = (reg as ServiceWorkerRegistration & { periodicSync?: { register(tag: string, o: { minInterval: number }): Promise<void> } } | null)
    ?.periodicSync
  if (periodic) {
    try {
      const status = await navigator.permissions.query({ name: 'periodic-background-sync' as PermissionName })
      if (status.state === 'granted') {
        await periodic.register('reading-reminder', { minInterval: 12 * 60 * 60 * 1000 })
        return 'Reminders on. You will get a notification if you have not read by the reminder time.'
      }
    } catch {
      /* not available */
    }
  }
  return 'Reminders on while the app is open. For reminders when it is closed, install the app or add the calendar reminder.'
}

export async function disableReminders() {
  saveReminderConfig()
  const reg = await navigator.serviceWorker?.ready.catch(() => null)
  const periodic = (reg as ServiceWorkerRegistration & { periodicSync?: { unregister(tag: string): Promise<void> } } | null)?.periodicSync
  await periodic?.unregister('reading-reminder').catch(() => {})
}

/** The service worker reads this (it cannot see localStorage). */
function saveReminderConfig() {
  caches
    .open('settings')
    .then((c) =>
      c.put(
        'reminder-config',
        new Response(JSON.stringify({ enabled: settings.value.reminderEnabled, time: settings.value.reminderTime }), {
          headers: { 'content-type': 'application/json' },
        }),
      ),
    )
    .catch(() => {})
}

let timer: ReturnType<typeof setTimeout> | null = null
export function scheduleInAppReminder() {
  if (timer) clearTimeout(timer)
  const s = settings.value
  if (!s.reminderEnabled || !('Notification' in window) || Notification.permission !== 'granted') return
  const [h, m] = s.reminderTime.split(':').map(Number)
  const at = new Date()
  at.setHours(h, m, 0, 0)
  if (at.getTime() <= Date.now()) at.setDate(at.getDate() + 1)
  timer = setTimeout(async () => {
    const a = activity.value.get(today())
    if (!a || (a.seconds < 60 && !a.stories)) {
      const reg = await navigator.serviceWorker?.ready.catch(() => null)
      const opts = { body: 'A few minutes of reading keeps your streak going.', icon: 'icons/icon-192.png', tag: 'reading-reminder' }
      if (reg) reg.showNotification('Tijd om te lezen — time to read!', opts)
      else new Notification('Tijd om te lezen — time to read!', opts)
    }
    scheduleInAppReminder()
  }, at.getTime() - Date.now())
}

export function downloadIcs() {
  const [h, m] = settings.value.reminderTime.split(':').map(Number)
  const start = new Date()
  start.setHours(h, m, 0, 0)
  const pad = (n: number) => String(n).padStart(2, '0')
  const local = `${start.getFullYear()}${pad(start.getMonth() + 1)}${pad(start.getDate())}T${pad(h)}${pad(m)}00`
  const url = new URL('.', location.href).href
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//NL Reading//Reminder//EN',
    'BEGIN:VEVENT',
    `UID:nl-reading-reminder-${Date.now()}@nl-reading`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '')}`,
    `DTSTART:${local}`,
    'DURATION:PT15M',
    'RRULE:FREQ=DAILY',
    'SUMMARY:Lezen — Dutch reading',
    `DESCRIPTION:Read a story in NL Reading: ${url}`,
    `URL:${url}`,
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    'DESCRIPTION:Time to read some Dutch',
    'TRIGGER:PT0M',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n')
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }))
  a.download = 'nl-reading-reminder.ics'
  a.click()
  URL.revokeObjectURL(a.href)
}
