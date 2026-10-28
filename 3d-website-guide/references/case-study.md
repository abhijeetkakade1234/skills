# Case study: a computer-vision company site

Context: an AI company whose first product counts sacks loaded onto trucks from existing
CCTV. One pilot customer, so no customer claims allowed. Built in about two days by one
human owner, Claude (3D, performance, QA) and Codex (sections, motion), in rounds.

## Concept
"How you see it vs how the machine sees it." A matte clay loading bay (truck, conveyor,
sacks, CCTV camera); scroll sweeps a scan plane that turns the world into wireframe and
points while sacks stay solid with amber detection brackets; a counting line draws; each
sack crossing it ticks the counter once (a tested simulation, not a timer).

## Acts
1. Hero: clay -> scan -> machine view -> counting.
2. How it works: the scan retracts while the camera flies back to the physical CCTV camera,
   then follows a cable over the wall through clay stations: edge PC -> GPU card (exploded
   view) -> a monitor drawing the live count. Data packets stream along the cable.
3. Product (opaque): capabilities + a sample-data dashboard shot in the site's style.
4. Demo (opaque): a monitor-framed replay with Camera/Machine view toggle and an event
   ledger, looping, on labelled sample data until real footage is consented.
5. Platform: live product + two unnamed "in development" slots.
6. Contact finale: pull back from the one bay to a grid of 14 docks with ticking counts.
7. Footer "end of feed": scanned wordmark with letter detection and a live clock.

## What changed after owner feedback
- "Looks basic" -> continuous 3D world + motion layer (decode labels, kinetic headings,
  detection cursor, magnetic CTAs, velocity marquee, section wipes, cursor reveal).
- "Video isn't aesthetic" -> footage moved from hero to a framed demo; hero is clay 3D.
- "Remove the stupid audio" -> sound layer deleted.
- "It should match the site" -> dashboard shot redesigned in the site's palette with
  sample data instead of a light-theme app screenshot.

## Numbers
Truck model via bpy: ~40k tris, 0.8 MB GLB. Fps after optimisation: hero 49-58, flight 60,
finale 38-41 (laptop GPU). Initial JS 52 KB gzip.
