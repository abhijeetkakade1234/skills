# Performance

## Method
1. `qa/fps.mjs 1` and `qa/fps.mjs 4` (4x CPU throttle approximates a weak office PC).
2. `qa/profile.mjs <scrollY>` on the worst section.
3. Fix the biggest cause, re-measure, repeat. Stop when the remaining cost is the scene
   itself; further gains mean visibly simplifying it. Say so.

Reading a profile: mostly `(idle)` => GPU-bound (pixels, passes, overdraw, draws);
`(program)` high => native work (draw-call submission, layout, style); your functions
high => frame-loop or render work on the main thread.

## Example result (laptop GPU, real project)
| Section | Before | After |
|---|---|---|
| Hero (scan scene) | 22-25 fps | 49-58 |
| Camera-flight act | 26-43 | 60 |
| Grid finale | 22 | 38-41 |
| Hero @ 4x CPU | 5-14 | 20 |

## Fixes, highest payoff first
1. **DPR cap ~1.35** with `PerformanceMonitor`: step down to 1, then drop postprocessing.
2. **Manual shadow updates**: `gl.shadowMap.autoUpdate = false`; `needsUpdate = true`
   every 2nd frame where things move, every 4th elsewhere. Map ~1536.
3. **Bake static contact shadows** (`<ContactShadows frames={1}>`).
4. **Skip invisible layers**: `material.visible = false` on shared materials the reveal
   front can't show.
5. **Constant light count**: never mount/unmount lights mid-page (every shader recompiles,
   visible hitch); fade intensity to 0.
6. **Instance repeats**: one `InstancedMesh` per part for N copies (170 draws -> 13).
7. **No layout reads per frame**: cache offsets; refresh ~1/s or on resize.
8. **React off the hot path**: per-frame data in refs/external stores; publish overlay state
   only while visible; `memo` sections/footer so a fast store doesn't re-render the page.
9. **Code splitting**: lazy 3D chunk after first paint; postprocessing in its own chunk,
   desktop only (phones skip ~100 KB gzip).
10. **AO** (N8AO half-res, ~8 samples) only where it visibly helps.

## Budgets
Initial JS ~50 KB gzip; 3D vendor ~350-400 KB gzip after paint; hero model < 1 MB; target
60 fps on a mid laptop, >= 30 at 4x throttle in the worst section, LCP < 2.5 s.
