// Shared contract between the page (sections) and the 3D scene.
// Sections WRITE scroll progress per act; the scene READS it every frame.
// Plain mutable values: no React state, no re-renders. Keep this file tiny and stable.

export const acts = {
  /** true when the full 3D route is on (desktop, WebGL, no reduced motion). Set once by App. */
  world3d: false,
  /** 0..1 per act, written by each act section's ScrollTrigger (see sections/useActPin.ts). */
  progress: {} as Record<string, number>,
}

export function setAct(name: string, value: number) {
  acts.progress[name] = Math.max(0, Math.min(1, value))
}

export function actProgress(name: string) {
  return acts.progress[name] ?? 0
}

/** Which of `stages` equal slices an act is in. Copy and camera both use this, so they agree. */
export function stageOf(name: string, stages: number) {
  return Math.min(stages - 1, Math.floor(actProgress(name) * stages))
}

// QA only: `?act=<name>&p=0.6` freezes an act at a progress value so a screenshot can
// capture any camera stop without scrolling. `&before=a,b` marks earlier acts as finished.
const qa = new URLSearchParams(window.location.search)
const qaAct = qa.get('act')
const qaP = Number(qa.get('p') ?? 0.5)
const qaBefore = (qa.get('before') ?? '').split(',').filter(Boolean)

/** Call first in the frame loop; re-applies the override after the page's own writes. */
export function applyQaOverride() {
  if (!qaAct) return
  acts.world3d = true
  for (const name of qaBefore) acts.progress[name] = 1
  acts.progress[qaAct] = qaP
}
