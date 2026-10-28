// Frame rate per section, optionally with CPU throttling to mimic a weak processor.
// Samples the middle of every section plus 25/50/75% inside tall (pinned) ones.
// Run against the PRODUCTION build (npm run build && npm run preview), never the dev server.
// node fps.mjs [throttle=1]        e.g. node fps.mjs 4   (4x slower CPU)
import { BASE, launch, sections, wheelTo } from './_browser.mjs'

const [throttle = '1'] = process.argv.slice(2)
const browser = await launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const cdp = await page.context().newCDPSession(page)
await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
await page.waitForTimeout(6000)
await cdp.send('Emulation.setCPUThrottlingRate', { rate: +throttle })

const stops = []
for (const s of await sections(page)) {
  const span = Math.max(0, s.height - 900)
  const fractions = span > 900 ? [0.25, 0.5, 0.75] : [0.5]
  for (const f of fractions) stops.push([`${s.id}${fractions.length > 1 ? `@${f * 100}%` : ''}`, s.top + span * f])
}

console.log(`CPU throttle ${throttle}x`)
for (const [name, y] of stops) {
  await wheelTo(page, y)
  await page.waitForTimeout(1200)
  const frames = await page.evaluate(() => new Promise(done => {
    const t = []; let last = performance.now(); const end = last + 3000
    const tick = now => { t.push(now - last); last = now; now < end ? requestAnimationFrame(tick) : done(t) }
    requestAnimationFrame(tick)
  }))
  const sorted = [...frames].sort((a, b) => a - b)
  const fps = 1000 / (frames.reduce((a, b) => a + b, 0) / frames.length)
  console.log(`${name.padEnd(22)} fps ${fps.toFixed(0).padStart(3)}  p95 ${sorted[Math.floor(sorted.length * 0.95)].toFixed(1).padStart(6)}ms  frames>50ms ${frames.filter(x => x > 50).length}`)
}
await browser.close()
