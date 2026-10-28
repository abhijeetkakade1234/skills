// Load one URL; report errors, whether the main thread stays responsive, and screenshot.
// Use when a screenshot times out: tells "page is blocked" apart from "asset 404'd".
// node probe.mjs <url> <shot.png>
import { launch } from './_browser.mjs'

const [url, shot] = process.argv.slice(2)
const browser = await launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
page.on('pageerror', e => console.log('pageerror:', e.message))
page.on('console', m => { if (m.type() === 'error') console.log('error:', m.text().slice(0, 300)) })
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 })
for (const wait of [1000, 3000, 6000]) {
  await page.waitForTimeout(wait)
  const alive = await Promise.race([page.evaluate(() => 'responsive'), new Promise(r => setTimeout(() => r('BLOCKED'), 4000))])
  console.log(`+${wait}ms main thread: ${alive}`)
  if (alive === 'BLOCKED') break
}
try { await page.screenshot({ path: shot, timeout: 8000 }); console.log('screenshot ok') } catch (e) { console.log('screenshot failed:', e.message.split('\n')[0]) }
await browser.close()
