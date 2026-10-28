---
name: 3d-website-guide
description: Guide for designing and building award-level, scroll-driven 3D websites with motion (Three.js / React Three Fiber + GSAP + Lenis) for any product or brand, without "AI slop". Covers concept (finding the product's signature visual), art direction, a continuous 3D world the camera travels through, scroll-pinned acts, reveal/scan shaders, procedural 3D models without a 3D artist, kinetic type and cursor effects, visual QA with Playwright screenshots, frame-rate measurement and optimisation, and shipping (CI, pre-commit, Amplify, domains). Use when someone wants a 3D, WebGL, Awwwards-style, scroll-animated or motion-heavy landing page or product site, or says their current site looks basic or generic.
---

# 3D website guide

A product-agnostic method for scroll-driven 3D sites that feel directed, not templated.
Distilled from a real build (case study: `references/case-study.md`). Detail lives in
`references/`, working code in `templates/` (start with `templates/README.md`).

## The bar
A site stands out when three things hold at once:
1. **Art direction**: every frame looks intentional with motion switched off.
2. **Directed motion**: motion explains the product; nothing moves just to move.
3. **Performance**: smooth on a mid laptop, acceptable on a weak one, a lighter route on phones.

## Phase 1: Concept (talk before code)
1. **Research patterns, not looks** (30 min): current Awwwards WebGL / Site-of-the-Day
   winners. Recurring winners: one continuous world the camera travels through, transitions
   that are camera moves, a scene per idea, kinetic type, cursor-driven reveals, a scale
   reveal at the end, weighted smooth scroll. See `references/art-direction.md`.
2. **Find the signature transformation**: the one visual only this product can show.
   Recipes per product type in `references/concepts.md` (e.g. AI vision: "how you see it vs
   how the machine sees it"; payments: money settling into a ledger; dev tools: code
   compiling into a running system; hardware: an exploded view assembling itself).
3. **Write the scroll story as beats**: hero, signature transition, proof, how it works,
   product, demo, platform/roadmap, contact, footer. For each: camera move, copy, what moves.
4. **Pick a 3D style you can actually build** (`references/assets.md`). Matte clay +
   wireframe/points is the safest premium look for a team without a 3D artist. Photoreal
   needs real models and lighting skill; stylised colour needs strong taste.
5. **Get explicit approval** of concept, style and story before building anything.

## Phase 2: Art direction rules (put them in every brief)
- Banned: purple/blue gradients, glow orbs, glassmorphism, 3-icon feature grids, emoji,
  "Revolutionize / Unleash / Transform / Seamless", bounce easing, meaningless particles.
- One accent colour with **one job** (e.g. only for "active / detected / live / primary CTA").
- A grotesk for headings at restrained sizes + a mono for data and labels; hairlines.
- **Honesty**: no invented customers, logos, testimonials, metrics or roadmap names. Sample
  data is labelled. Status badges must reflect something real or be removed.
- Real footage/screens are proof, not hero material: frame them, grade them, get consent.

## Phase 3: Architecture (`references/architecture.md`)
- Vite + React + TS, `@react-three/fiber`, `drei`, `@react-three/postprocessing`,
  GSAP (ScrollTrigger, SplitText, ScrambleText), Lenis.
- **One fixed canvas** for the whole page, lazy-loaded so copy paints first; render loop
  on only while a 3D section is visible.
- **Acts contract** (`templates/scene/acts.ts`): sections WRITE scroll progress per act,
  the scene READS it every frame (no React state per frame). `?act=<name>&p=<0..1>` freezes
  any act for QA. Sections pin and write via `templates/sections/useActPin.ts`.
- **Camera rig** (`templates/scene/cameraRig.ts`): stations with travel-then-hold timing,
  subject framed away from the copy column, a pull-back finale.
- **Reveal system** (`templates/scene/revealSystem.ts` + `LayeredMesh.tsx`): a world-space
  front that turns solid surfaces into wireframe/points (or back); shared materials so whole
  layers can be skipped in one assignment.
- Opaque sections scroll over the canvas like curtains; 3D acts sit behind transparent ones.
- Anything that counts or tracks must be **causal** (a real simulation with a test), never
  a timer pretending.

## Phase 4: Assets (`references/assets.md`)
Procedural models with Blender's `bpy` pip package (`templates/tools/build_model.py`: no
Blender app, no GPU; exports GLB + preview renders you look at). Export unbeveled `__ghost`
twins for wireframe/points layers. Buy CC assets (check commercial licence) or use shaders
for organic forms. Product screenshots: render a designed HTML page with sample data at 2x
(`templates/tools/render-shot.mjs`).

## Phase 5: Optional second developer (`references/collaboration.md`)
Split ownership (3D + QA vs sections + motion), write briefs from
`references/brief-template.md`, and be the eyes: a sandboxed agent can build and lint but
cannot see. Screenshot, then write numbered fix briefs that cite the screenshots.

## Phase 6: Visual QA (`references/qa.md`)
`templates/qa/`: `walk.mjs` (wheel-scroll the whole page, screenshot every N px),
`acts.mjs` (frozen act stops), `fps.mjs` (fps per section at 1x/4x CPU), `profile.mjs`,
`probe.mjs`. Always against the production build. Look at every screenshot yourself before
saying "done": passing build/lint/tests says nothing about how a scroll site looks.

## Phase 7: Performance (`references/performance.md`)
Profile first (idle-heavy main thread = GPU-bound). Biggest wins: DPR cap ~1.35 with
adaptive step-down; shadow map updated every 2-4 frames; static contact shadows baked once;
skip layers that can't be visible; constant light count (fade, don't add/remove); instance
repeats; no layout reads per frame; keep per-frame state out of React and memo the rest;
lazy-load postprocessing on desktop only. Phones get a 2D route.

## Phase 8: Ship (`references/ship.md`)
`templates/ship/`: CI (lint, tests, typecheck+build), husky pre-commit (ESLint on staged
files), Amplify build gated by the same checks, `.gitattributes` for LF hooks, vendor chunk
split. `npm run prod` = build + preview: the only honest local check. Verify domain
availability before suggesting names; never buy without explicit go-ahead.

## Done checklist
- [ ] Concept, style and story approved; one accent with one job; banned list respected
- [ ] Every claim true; sample data labelled; footage consented
- [ ] Walk screenshots at 1440x900 and 390x844 reviewed: no dead zones, no lingering
      overlays, pins play in view, nothing clipped, no horizontal scroll
- [ ] fps measured per section at 1x and 4x CPU; worst section profiled and addressed
- [ ] Reduced motion and no-WebGL routes readable
- [ ] CI green; pre-commit blocks a lint error; deploy gated on checks

Common traps: `references/pitfalls.md`.
