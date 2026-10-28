// CPU-profile 3 s at a scroll position and print the heaviest functions by self time.
// Read it like this: mostly "(idle)" => GPU-bound (cut pixels/passes/draws);
// "(program)" high => native/driver work (draw-call count, layout reads);
// app functions high => your frame loop or React re-renders.
// node profile.mjs <scrollY> [throttle=1]
import { BASE, launch, wheelTo } from './_browser.mjs'

const [target = '3000', throttle = '1'] = process.argv.slice(2)
const browser = await launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const cdp = await page.context().newCDPSession(page)
await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
await page.waitForTimeout(6000)
await wheelTo(page, +target)
await page.waitForTimeout(1500)
await cdp.send('Emulation.setCPUThrottlingRate', { rate: +throttle })
await cdp.send('Profiler.enable')
await cdp.send('Profiler.setSamplingInterval', { interval: 200 })
await cdp.send('Profiler.start')
await page.waitForTimeout(3000)
const { profile } = await cdp.send('Profiler.stop')

const byId = new Map(profile.nodes.map(n => [n.id, n]))
const self = new Map()
profile.samples.forEach((id, i) => {
  const f = byId.get(id).callFrame
  const key = `${f.functionName || '(anon)'} ${f.url.split('/').pop()}:${f.lineNumber}`
  self.set(key, (self.get(key) ?? 0) + (profile.timeDeltas[i] ?? 0))
})
const total = [...self.values()].reduce((a, b) => a + b, 0)
for (const [k, v] of [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20))
  console.log(`${(v / total * 100).toFixed(1).padStart(5)}%  ${(v / 1000).toFixed(0).padStart(5)}ms  ${k}`)
await browser.close()
