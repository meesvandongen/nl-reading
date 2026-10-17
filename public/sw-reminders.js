// Imported into the generated service worker (see vite.config.ts).
// Shows a reading reminder from Periodic Background Sync, and focuses the app
// when a notification is clicked.

function todayKey() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function readToday() {
  return new Promise((resolve) => {
    const req = indexedDB.open('nl-reading')
    req.onerror = () => resolve(null)
    req.onsuccess = () => {
      try {
        const db = req.result
        const get = db.transaction('activity').objectStore('activity').get(todayKey())
        get.onsuccess = () => resolve(get.result || null)
        get.onerror = () => resolve(null)
      } catch (e) {
        resolve(null)
      }
    }
  })
}

async function maybeRemind() {
  const res = await caches.match('reminder-config')
  if (!res) return
  const cfg = await res.json()
  if (!cfg.enabled) return
  const [h, m] = String(cfg.time || '20:00').split(':').map(Number)
  const now = new Date()
  if (now.getHours() * 60 + now.getMinutes() < h * 60 + m) return
  const a = await readToday()
  if (a && (a.seconds >= 60 || a.stories > 0)) return
  await self.registration.showNotification('Tijd om te lezen — time to read!', {
    body: 'A few minutes of reading keeps your streak going.',
    icon: 'icons/icon-192.png',
    badge: 'icons/icon-192.png',
    tag: 'reading-reminder',
  })
}

self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'reading-reminder') event.waitUntil(maybeRemind())
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) if ('focus' in c) return c.focus()
      return self.clients.openWindow('./')
    }),
  )
})
