import { Vector3 } from 'three'

// Camera choreography as pure functions of scroll progress. A pose is where the camera
// is plus what it looks at; the frame loop copies the result onto the camera.

export type Pose = { position: Vector3; target: Vector3 }

export type Station = {
  /** The object the camera visits. */
  subject: Vector3
  /** Camera position relative to the subject. */
  offset: Vector3
  /** Sideways shift of the look-at point (world units). Positive moves the subject right
   *  of centre, leaving the left of the screen free for copy. */
  frameShift?: number
}

const UP = new Vector3(0, 1, 0)
export const smoother = (t: number) => t * t * t * (t * (t * 6 - 15) + 10)
export const clamp01 = (t: number) => Math.max(0, Math.min(1, t))

export function pose(position: Vector3, target: Vector3): Pose {
  return { position: position.clone(), target: target.clone() }
}

export function mixPose(a: Pose, b: Pose, t: number, out: Pose) {
  out.position.lerpVectors(a.position, b.position, t)
  out.target.lerpVectors(a.target, b.target, t)
  return out
}

function stationPose(s: Station): Pose {
  const position = s.subject.clone().add(s.offset)
  const right = s.subject.clone().sub(position).cross(UP).normalize()
  return { position, target: s.subject.clone().addScaledVector(right, -(s.frameShift ?? 0)) }
}

/**
 * A journey through stations. Progress is split into equal slices, one per station; in
 * each slice the camera travels for `travel` (default 45%) and then holds with a slow
 * drift so the stage copy can be read.
 */
export function stationPath(start: Pose, stations: Station[], { travel = 0.45, drift = 0.12 } = {}) {
  const poses = stations.map(stationPose)
  return (progress: number, time: number, out: Pose) => {
    const scaled = clamp01(progress) * poses.length
    const i = Math.min(poses.length - 1, Math.floor(scaled))
    const local = scaled - i
    mixPose(i === 0 ? start : poses[i - 1], poses[i], smoother(clamp01(local / travel)), out)
    const hold = clamp01((local - travel) / (1 - travel))
    out.position.x += Math.sin(time * 0.25) * drift * hold
    out.position.y += Math.sin(time * 0.31) * drift * 0.4 * hold
    return out
  }
}

/** Finale: ease from one pose to a wide reveal (one unit -> many). */
export function pullBack(from: Pose, to: Pose, { sway = 0.6 } = {}) {
  return (progress: number, time: number, out: Pose) => {
    mixPose(from, to, smoother(clamp01(progress)), out)
    out.position.x += Math.sin(time * 0.1) * sway * clamp01(progress)
    return out
  }
}

/**
 * 0 -> 1 -> 0 envelope for something that happens while the camera holds on station `index`
 * (e.g. an exploded view): opens over [open0, open1] of that slice, closes after close0.
 */
export function holdEnvelope(progress: number, stations: number, index: number, open0 = 0.5, open1 = 0.9, close0 = 1.15) {
  const local = clamp01(progress) * stations - index
  return smoother(clamp01((local - open0) / (open1 - open0))) * (1 - smoother(clamp01((local - close0) / 0.3)))
}
