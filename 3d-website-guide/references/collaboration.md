# Working with a second developer (human or agent)

## Split by ownership, not by feature
| Dev A: 3D + performance + QA | Dev B: sections + motion + copy |
|---|---|
| `src/scene/**`, overlays, scene config, build config, base CSS | `src/App.tsx`, `src/sections/**`, `src/motion/**`, section styles, `content.ts` |
| owns `src/story/acts.ts` (the contract) | may import acts.ts and call `setAct`, nothing else |
Rules for both: if you need a change in the other's files, write it under "Requests for the
other dev" in NOTES.md. If the build breaks inside the other's files, note it and continue.

## When the second dev is a sandboxed coding agent
- It typically has **no network** (install packages for it first, pinned) and **no
  browser** (it cannot see the result). The other dev is the eyes.
- Run it in the background with the brief on stdin, e.g.
  `codex exec --sandbox workspace-write -C <repo> -o <repo>/agent_final.md -`
- Build your own QA copies into a separate `--outDir`; two builds writing `dist/` at the
  same time swap chunk hashes and the page 404s on a lazy chunk.

## The loop
1. Brief (`brief-template.md`) with ownership, contract, numbered items, acceptance.
2. While it works, build your part; test with the `?act=` override.
3. When it finishes: run checks, then **walk-screenshot the whole page** (desktop + phone).
4. Copy screenshots into a gitignored `output/qa-refN/`, write `FIX_BRIEF_N.md` citing them.
5. Commit each side's files separately after QA.

## What agents commonly get wrong (check first)
- Scroll-pinned timelines that finish while the section is still invisible; dead zones after
  a pinned parent (fix with `ScrollTrigger.sort(); ScrollTrigger.refresh()` after the pin).
- Mobile headers wrapping; content under fixed headers.
- Timelines/ledgers showing future events; accent colour used everywhere.
- Reveals that never fire (clip-path on the observed element).
- Features that "work" but are imperceptible (inaudible audio, invisible contrast).
- Over-claiming copy: demand honesty explicitly in the brief.
