# Architecture

## Stack (pin versions that are at least ~2 weeks old)
```
vite, react, typescript
three, @react-three/fiber, @react-three/drei, @react-three/postprocessing, postprocessing
gsap (ScrollTrigger, SplitText, ScrambleTextPlugin are free), lenis
dev: eslint, husky, playwright-core
```

## Page shape
```
<div.canvas-wrap position:fixed>   one <Canvas>, React.lazy-loaded
<header>                           solid once past the hero
<main>
  <section#hero>        pinned ~3.5 viewports, drives the hero act
  <section#act-a>       transparent, pinned, writes acts.progress.actA
  <section#product>     opaque "curtain" (no 3D needed behind it)
  <section#demo>        opaque curtain
  <section#act-b>       transparent, pinned, writes acts.progress.actB (finale)
<footer>                last scene
```
App decides `acts.world3d = webgl && !reducedMotion && innerWidth >= 1024 && finePointer`,
sets `<html data-world="3d">` for CSS, and toggles the canvas visibility + `frameloop`
with an IntersectionObserver on the 3D sections.

## Acts contract (`templates/scene/acts.ts`)
A tiny mutable store, not React state:
```ts
acts.world3d            // set once by App
acts.progress.<name>    // 0..1, written by section ScrollTriggers via setAct()
stageOf(name, stages)   // shared by copy and camera so they never disagree
applyQaOverride()       // ?act=name&p=0.6 freezes an act (call first in the frame loop)
```
Sections use `templates/sections/useActPin.ts` to pin and write progress.

## Frame loop: one owner per frame
```ts
const mode = currentMode()            // which act owns the camera this frame
switch (mode) { case 'hero': ...; case 'actA': ...; case 'finale': ... }
// per mode: reveal front position, light intensities, fog, camera pose
```
Enter an act a little **before** its pin writes progress (e.g. when its section top crosses
the viewport bottom), otherwise the camera jumps as the section scrolls in. Cache section
offsets; re-read layout at most ~1/s, never every frame.

## Camera rig (`templates/scene/cameraRig.ts`)
- Poses are `{position, target}`; transitions use smootherstep.
- `stationPath(start, stations)`: each station gets an equal slice of progress; travel for
  ~45% of the slice, hold with a slow drift for the rest so copy can be read.
- `frameShift` moves the look-at target sideways so the subject sits opposite the copy.
- `pullBack(from, to)`: the finale reveal (one unit -> many).

## Reveal system (`templates/scene/revealSystem.ts`, `LayeredMesh.tsx`)
One world-space uniform (`front`) along an axis:
- **Solid layer**: `MeshStandardMaterial` patched with `onBeforeCompile`, discards fragments
  behind the front, adds a thin bright band at it.
- **Ghost layers**: one shared wire material + one shared points material, visible only
  behind the front; wire fades into sparse points with distance.
- `LayeredMesh` = solid mesh + `EdgesGeometry` lines + thinned points (<= ~500 per part),
  with an optional `ghostGeometry` (unbeveled twin).
- `syncLayers()` each frame hides whichever layer cannot be visible.
Sweep the front with scroll for the signature moment; sweep it back to "un-reveal".

## Overlays (2D UI tracking 3D objects)
Project positions in the frame loop at ~15-20 Hz into an external store read with
`useSyncExternalStore`; render DOM/SVG. Rules: box only what is moving/relevant; group the
rest under one muted label; depth-sorted label collision rejection; clamp to the viewport;
fade out on act hand-off; publish only while the overlay is on screen.

## Causal simulations
If the page counts, matches or balances something, drive it from a pure simulation module
with a node test (`npm run test:sim`): each object counted once, only on a real crossing.
Replays/ledgers show only elapsed events (`test:demo`). Fake timers destroy trust.

## Routes
- Desktop 3D: everything above.
- Phones/touch: no acts, no postprocessing download, fewer instances, 2D section variants,
  native scroll, no custom cursor.
- Reduced motion: static end states, no pins/scrub.
- No WebGL: static hero copy.
