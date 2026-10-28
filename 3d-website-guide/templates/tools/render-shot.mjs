// Render an HTML page (e.g. a product/dashboard shot built with SAMPLE data in the site's
// style) to a crisp PNG with Playwright.
// node render-shot.mjs <page.html> <out.png> [width=1280] [height=800] [scale=2]
// CHROME_PATH overrides the browser (default: Windows Chrome).
import { chromium } from 'playwright-core'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const [input, output, w = '1280', h = '800', scale = '2'] = process.argv.slice(2)
if (!input || !output) { console.error('usage: node render-shot.mjs <page.html> <out.png> [w h scale]'); process.exit(1) }

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' })
const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: +scale })
await page.goto(pathToFileURL(resolve(input)).href, { waitUntil: 'networkidle' })
await page.evaluate(() => document.fonts.ready) // web fonts must finish before capture
await page.screenshot({ path: resolve(output) })
await browser.close()
console.log(`wrote ${resolve(output)}`)
