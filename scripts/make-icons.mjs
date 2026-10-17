// Generates the app icons: an open book on Dutch orange, with a Delft-blue bookmark.
// Usage: npm i --no-save playwright-core && node scripts/make-icons.mjs
// (uses a local Chromium; set CHROME to its path)
import { readdirSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const ORANGE = '#e8590c'
const BLUE = '#1f3a93'

/** The icon in a 100×100 box; `scale` shrinks the artwork for maskable icons (safe zone). */
function svg({ radius = 22, scale = 1 } = {}) {
  const t = `translate(50 50) scale(${scale}) translate(-50 -50)`
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
<rect width="100" height="100" rx="${radius}" fill="${ORANGE}"/>
<g transform="${t}">
  <path d="M50 30C40 24 28 23 16 25.5V73C28 70.5 40 71.5 50 78Z" fill="#fff"/>
  <path d="M50 30C60 24 72 23 84 25.5V73C72 70.5 60 71.5 50 78Z" fill="#fff"/>
  <path d="M50 30V78" stroke="${ORANGE}" stroke-width="2.5"/>
  <g stroke="${ORANGE}" stroke-width="2" stroke-linecap="round" opacity=".55">
    <path d="M23 36C30 34.5 37 35 43 37.5M23 45C30 43.5 37 44 43 46.5M23 54C30 52.5 37 53 43 55.5M23 63C30 61.5 37 62 43 64.5"/>
    <path d="M57 46.5C63 44 70 43.5 77 45M57 55.5C63 53 70 52.5 77 54M57 64.5C63 62 70 61.5 77 63"/>
  </g>
  <path d="M63 26.5H73V45L68 40.5L63 45Z" fill="${BLUE}"/>
</g>
</svg>`
}

mkdirSync(join(ROOT, 'public', 'icons'), { recursive: true })
writeFileSync(join(ROOT, 'public', 'favicon.svg'), svg())

function findChrome() {
  if (process.env.CHROME) return process.env.CHROME
  const base = '/opt/pw-browsers'
  const dir = readdirSync(base).find((d) => d.startsWith('chromium-'))
  return dir ? join(base, dir, 'chrome-linux', 'chrome') : undefined
}

const { chromium } = await import('playwright-core')
const browser = await chromium.launch({ executablePath: findChrome() })
const page = await browser.newPage()
async function png(svgText, size, out) {
  await page.setViewportSize({ width: size, height: size })
  await page.setContent(`<html><body style="margin:0;background:transparent">${svgText.replace('<svg ', `<svg style="display:block" width="${size}" height="${size}" `)}</body></html>`)
  await page.screenshot({ path: out, omitBackground: true })
}
const icons = join(ROOT, 'public', 'icons')
await png(svg(), 192, join(icons, 'icon-192.png'))
await png(svg(), 512, join(icons, 'icon-512.png'))
// maskable: full-bleed background, artwork inside the 80% safe zone
await png(svg({ radius: 0, scale: 0.8 }), 512, join(icons, 'maskable-512.png'))
// iOS rounds the corners itself
await png(svg({ radius: 0 }), 180, join(icons, 'apple-touch-icon.png'))
await browser.close()
console.log('icons written to public/icons and public/favicon.svg')
