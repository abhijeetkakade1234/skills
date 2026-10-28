// Screenshot 3D acts at frozen progress values via the QA URL override
// (?act=<name>&p=<0..1>&before=<earlier acts>, see templates/scene/acts.ts). Inspect every
// camera stop without scrolling, even before the page's scroll pins exist.
// Edit STOPS for your act names. node acts.mjs <outdir>
import { BASE, launch, watchErrors } from './_browser.mjs'

const STOPS = [
  { act: 'journey', p: 0.1 }, { act: 'journey', p: 0.3 }, { act: 'journey', p: 0.6 }, { act: 'journey', p: 0.9 },
  { act: 'finale', p: 0.2, before: 'journey' }, { act: 'finale', p: 0.6, before: 'journey' }, { act: 'finale', p: 1, before: 'journey' },
]
const [out] = process.argv.slice(2)
const browser = await launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const errors = watchErrors(page)
for (const { act, p, before } of STOPS) {
  const q = new URLSearchParams({ act, p: String(p), ...(before ? { before } : {}) })
  await page.goto(`${BASE}/?${q}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(3500) // shader compile + a few frames
  await page.screenshot({ path: `${out}/${act}_${String(Math.round(p * 100)).padStart(3, '0')}.png` })
}
console.log(errors.length ? [...new Set(errors)].join('\n') : 'no errors')
await browser.close()
