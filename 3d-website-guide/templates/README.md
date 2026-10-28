# Templates

Generic, working building blocks. Copy what you need into `src/` and rename the act names.

| File | What it is |
|---|---|
| `scene/acts.ts` | Progress store shared by sections and the 3D scene; `stageOf()`; `?act=&p=&before=` QA override |
| `scene/cameraRig.ts` | `stationPath()` (travel-then-hold through stations, subject framed off-centre), `pullBack()` finale, `holdEnvelope()` for exploded views |
| `scene/revealSystem.ts` | World-space reveal front: solid layer patched via `onBeforeCompile`, shared wire/point ghost materials, `syncLayers()`, `thinPoints()` |
| `scene/LayeredMesh.tsx` | Solid + edges + points per object (+ optional unbeveled ghost geometry); box/cylinder/sphere helpers for blocking out |
| `scene/Effects.tsx` | Postprocessing (N8AO, vignette, grain) as a lazy desktop-only chunk |
| `scene/Experience.tsx` | Page-wide canvas skeleton: mode switching, cached section offset, manual shadow updates, baked contact shadows, DPR cap + PerformanceMonitor, lazy effects |
| `sections/useActPin.ts` | Pin a section and write its progress into the acts store (3D route only) |
| `tools/build_model.py` | bpy procedural model builder: `Part` helper, bevels, `__ghost` twins, GLB export, Cycles previews (example model included) |
| `tools/render-shot.mjs` | Render an HTML product shot to a 2x PNG |
| `qa/*.mjs` | Visual QA + performance scripts (`walk`, `acts`, `fps`, `profile`, `probe`; `_browser.mjs` shared) |
| `ship/ci.yml`, `ship/amplify.yml` | Lint, `npm test --if-present`, typecheck + build gates |
| `ship/pre-commit` | Husky: ESLint on staged files |
| `ship/gitattributes` | Rename to `.gitattributes`: LF for hooks and YAML |
| `ship/vite.config.ts` | Vendor split; postprocessing in its own lazy chunk |

Dependencies: `three @react-three/fiber @react-three/drei @react-three/postprocessing
postprocessing gsap lenis`, dev: `playwright-core husky`. QA scripts expect a local Chrome
(`CHROME_PATH`) and a served production build (`BASE_URL`, default http://localhost:4173).
