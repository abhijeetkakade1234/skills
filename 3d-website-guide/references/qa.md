# Visual QA with Playwright

Build, lint and unit tests say nothing about how a scroll-driven page looks. Screenshot it.

## Setup
- `npm i -D playwright-core` and point `CHROME_PATH` at a local Chrome/Edge.
- GPU flags (`--enable-gpu --ignore-gpu-blocklist`, plus `--use-angle=d3d11` on Windows /
  `--use-angle=metal` on macOS) so WebGL is hardware-rendered; otherwise fps is fiction.
- Test the **production** build: `npm run build && npm run preview` (BASE_URL defaults to
  http://localhost:4173).

## Scripts (`templates/qa/`)
| Script | Purpose |
|---|---|
| `walk.mjs <out> [w h step]` | Wheel-scroll to the bottom, screenshot each step, label by section. Run at 1440x900 and 390x844. |
| `acts.mjs <out>` | Screenshot frozen act stops (`?act=&p=`); edit STOPS. |
| `fps.mjs [throttle]` | FPS + p95 per section (25/50/75% inside tall pinned ones). Run at 1 and 4. |
| `profile.mjs <scrollY> [throttle]` | Heaviest functions by self time. |
| `probe.mjs <url> <png>` | Main thread blocked vs asset 404 when a screenshot hangs. |

Use real wheel input: smooth-scroll libraries and pins don't respond properly to `scrollTo`.
Wait a few seconds after load for preloaders and shader compiles.

## Review checklist per screenshot set
- Dead zones (only an empty/blurred canvas on screen).
- Pins whose first visible frame is already their end state.
- Overlays overlapping, clipped at edges, or lingering into the next section.
- Headlines over busy 3D: reframe or hide labels on the copy's side.
- Phone: header wrapping, content behind fixed elements, horizontal overflow.
- Layered effects out of register; unexpected fills from leftover global CSS.
- Accent colour outside its job.

## Human-in-the-loop captures
For screens behind a login: open a headed persistent browser, let the human type
credentials, poll for the logged-in state, capture, close. Never handle passwords. Prefer
sample-data product shots for public sites anyway.
