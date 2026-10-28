# Art direction

## Patterns from recent winners (verify against the current month)
| Pattern | Example sites (2026) | How to use it |
|---|---|---|
| Continuous world, camera travels | Cartier Watches & Wonders, Oryzo | Acts behind sections; no hard cuts |
| Transitions are camera moves | Uncommon Studio, By-Kin | Push in, pull back, fly through |
| A scene per idea ("rooms") | Cartier | One act per concept |
| Type that scatters and re-forms | Shopify Editions | Decode labels, masked line rises |
| Cursor-driven reveal | Hubtown | Flashlight mask, scan band under cursor |
| Scale reveal | many | One unit -> grid of many at the end |
| Weighted smooth scroll | By-Kin | Lenis lerp ~0.085 |
Juror test: static frame intentional, motion meaningful, smooth on mid hardware.

## Palette: one accent with one job
Start from near-black base, warm off-white ink, a muted grey, a hairline grey and ONE accent:
```
--bg #0E1110  --ink #E9E7DF  --muted #8A8F8B  --line #2A2F2D  --accent #E8A83D
```
Define the accent's job in one sentence (e.g. "only for things that are active, detected,
counted or live") and enforce it. A counter stays ink; only the digit that just changed
flashes the accent. Light themes work the same way with inverted base/ink.

## Type
- Headings: one grotesk (Space Grotesk, Neue Montreal, Söhne, Inter Display) at 500,
  slight negative tracking, restrained sizes (hero ~clamp(40px, 6vw, 88px)).
- Data/labels: one mono (IBM Plex Mono, JetBrains Mono), uppercase, +0.08em, 9-13px.
- Labels like `[ 04 ] HOW IT WORKS` and indices `01 / 03` give an instrument feel.

## Motion vocabulary
- Easing: `power2.inOut`, `expo.out`. Never bounce/elastic for content.
- **Decode** labels (characters resolve left to right, ~600 ms): GSAP ScrambleText.
- **Kinetic headings**: SplitText lines in a mask, rise with 0.08 s stagger.
- **Detection cursor**: corner brackets that lock onto interactive elements with a tiny
  label; accent only on the primary CTA. Pointer devices only.
- **Magnetic CTAs**: max ~10 px pull within ~80 px.
- **Section wipes**: a 1 px line travels down while `clip-path` reveals the section.
- **Velocity marquee**: a mono data strip whose speed/skew follows scroll velocity.
- Reduced motion: every effect has a readable static end state.

## Footer as a last scene
Edge-to-edge wordmark drawn as an outline; a scan band under the cursor fills it; letters
"lock" with labels on hover; a live clock/status; "REWIND ↑" scrolls home with a sweep.
Both wordmark layers must share identical per-glyph markup (see pitfalls).

## Copy
Short sentences, concrete nouns. Ban filler buzzwords. No claim you cannot prove.

## Sound
Off by default if at all, and ask the owner first: many find site audio annoying. If used,
nothing below ~100 Hz (laptop speakers can't play it) and audible event cues.
