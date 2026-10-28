# Pitfalls

## CSS / browser
- **IntersectionObserver + clip-path deadlock**: Chrome honours the target's own `clip-path`.
  An element that starts fully clipped never reports visible, so the class that unclips it
  never arrives. Reveal with an `::after` cover that scales away, or observe a parent.
- **Kerning drift**: per-glyph `inline-block` spans disable kerning; a plain-text layer on
  top drifts. Give every stacked text layer the same per-glyph markup.
- **Leftover global selectors** from a replaced component (`footer span:nth-child(2)`)
  silently style the new markup. Delete old rules with old components.
- Font smoothing colour fringes in screenshots are not palette bugs; check computed styles.

## three.js / R3F
- three r0.186 removed `PCFSoftShadowMap` (warns, falls back to hard shadows): use VSM/PCSS.
- Mounting/unmounting lights recompiles all shaders: keep count constant, fade intensity.
- drei `<Html>` ignores 3D visibility: fade/hide labels yourself.
- Beveled meshes produce no useful `EdgesGeometry` and a dust of vertices: use unbeveled
  twins for wire/points; thin point clouds.
- `TorusGeometry` already faces +z (rotating it like a cylinder tilts it).
- Pulled-back finales need a larger camera `far` and fog range.
- Reading `getBoundingClientRect` in `useFrame` forces layout every frame.

## Scroll
- Child ScrollTriggers created before a parent pin spacer exists fire at the wrong offsets
  (dead zones, animations finishing off-screen): `ScrollTrigger.sort(); refresh()` after.
- Smooth-scroll libraries need real wheel input in automated QA.

## Tooling
- `bpy` must be imported before `bmesh`/`mathutils`; render paths must be absolute.
- Preview renders that include the `__ghost` twins z-fight with the beveled meshes (big black
  faces): set `hide_render` on the twins before rendering.
- Scaffolders that prompt interactively silently skip folder creation in scripts; check the
  folder exists before chaining installs.
- Windows PowerShell 5.1 `-Encoding utf8` writes a BOM (spurious line-1 diffs).
- Two concurrent builds into `dist/` -> chunk 404 -> "the page hangs".
- `husky init` writes `npm test` as the hook.

## Product
- Fake status badges, invented logos/metrics, "bank-grade security": remove.
- Real customer data in public screenshots: use sample data.
- Site audio: inaudible if under ~100 Hz or tiny gains; often unwanted. Ask first.
- Raw footage as the hero: looks cheap; use it as framed, graded proof.
