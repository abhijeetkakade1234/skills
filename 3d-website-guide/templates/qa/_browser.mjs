// Shared launcher for the QA scripts. A real GPU path matters: headless Chrome with the
// default flags falls back to software WebGL and every frame-rate number becomes fiction.
//   CHROME_PATH  path to a local Chrome/Edge (default: Windows Chrome)
//   BASE_URL     the served PRODUCTION build (default: vite preview on :4173)
import { chromium } from 'playwright-core'

export const BASE = process.env.BASE_URL ?? 'http://localhost:4173'

export function launch(opts = {}) {
  return chromium.launch({
    executablePath: process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'],
    ...opts,
  })
}

/** Collect page errors and console errors (ignoring known-noisy shader compile warnings). */
export function watchErrors(page, tag = '') {
  const errors = []
  page.on('pageerror', e => errors.push(`${tag}pageerror: ${e.message}`))
  page.on('console', m => { if (m.type() === 'error') errors.push(`${tag}console: ${m.text()}`) })
  return errors
}

/** Scroll with real wheel input (smooth-scroll libraries like Lenis ignore scrollTo). */
export async function wheelTo(page, targetY, { tolerance = 150, maxSteps = 80 } = {}) {
  await page.mouse.move(700, 450)
  for (let i = 0; i < maxSteps; i++) {
    const y = await page.evaluate(() => scrollY)
    if (Math.abs(y - targetY) < tolerance) break
    await page.mouse.wheel(0, Math.max(-700, Math.min(700, targetY - y)))
    await page.waitForTimeout(110)
  }
}

/** Every top-level section with an id, as page offsets. */
export function sections(page) {
  return page.evaluate(() => [...document.querySelectorAll('section[id], footer')].map(el => {
    const r = el.getBoundingClientRect()
    return { id: el.id || el.tagName.toLowerCase(), top: Math.round(r.top + scrollY), height: Math.round(r.height) }
  }))
}
