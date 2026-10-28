// Scroll the whole page with real wheel events and screenshot every <step> px, labelled by
// the section in the middle of the viewport. The single most useful QA pass: it shows dead
// zones, pins that never play, overlays that linger and sections that never reveal.
// node walk.mjs <outdir> [width=1440] [height=900] [step=500]
import { BASE, launch, watchErrors } from './_browser.mjs'

const [out, w = '1440', h = '900', step = '500'] = process.argv.slice(2)
const browser = await launch()
const page = await browser.newPage({ viewport: { width: +w, height: +h } })
const errors = watchErrors(page)
await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
await page.screenshot({ path: `${out}/000_load.png` })
await page.waitForTimeout(5000) // preloader / shader compile
await page.mouse.move(+w * 0.7, +h * 0.5)

let i = 1, last = -1
for (;;) {
  await page.mouse.wheel(0, +step)
  await page.waitForTimeout(1100)
  const y = await page.evaluate(() => Math.round(scrollY))
  if (y === last) break // reached the bottom
  last = y
  const label = await page.evaluate(() => {
    const mid = innerHeight / 2
    const hit = [...document.querySelectorAll('section[id], footer')].find(el => { const r = el.getBoundingClientRect(); return r.top <= mid && r.bottom >= mid })
    return hit ? (hit.id || 'footer') : 'none'
  })
  await page.screenshot({ path: `${out}/${String(i++).padStart(3, '0')}_${label}_${y}.png` })
}
console.log(`${i - 1} shots, overflow-x: ${await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)}`)
console.log(errors.length ? [...new Set(errors)].join('\n') : 'no errors')
await browser.close()
