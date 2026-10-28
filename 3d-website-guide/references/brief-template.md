# Brief template

```markdown
# <Phase / fix round>: <one-line goal>

Read `BRIEF.md` (art direction, palette, type, motion, forbidden list) and `NOTES.md` first.
Owner feedback this round, verbatim: "<quote>".

## Ownership (another dev works in parallel)
| You own | Do NOT edit |
|---|---|
| ... | ... |
No network. Already installed: <packages@versions>. No new packages. No commits.

## Context and honesty rules
<What the product is. No invented customers, metrics, product names. Sample data labelled.>

## Contract
<acts.ts usage, data formats with JSON shapes, canvas visibility rules.>

## Items
### 1. <Name>  (priority: critical | high | normal)
- Screenshot: `output/qa-ref2/<file>.png`
- What a visitor sees now: <concrete>
- Target: <behaviour with numbers: durations, pin lengths, opacities, sizes>
- Phone / reduced motion: <...>

## Acceptance
1. Build, lint and all test scripts pass.
2. No horizontal scroll at 360 / 768 / 1440.
3. Accent colour only for <its job>.
4. Reduced motion fully readable.

## When done
Add "<round>" to NOTES.md: changes per item, values chosen, what you could not verify
visually, requests for the other dev.
```

Writing tips: quote the owner, list forbidden things by name, define "done" in numbers,
keep one round to what can be visually checked in one pass.
