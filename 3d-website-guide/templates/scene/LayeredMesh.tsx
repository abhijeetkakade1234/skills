import { useMemo } from 'react'
import { BoxGeometry, CylinderGeometry, EdgesGeometry, SphereGeometry, type BufferGeometry } from 'three'
import { reveal, thinPoints } from './revealSystem'

// One object, three layers: solid (in front of the reveal front), wire edges and sparse
// points (behind it). ghostGeometry: optional unbeveled twin of a beveled mesh; bevels
// produce no useful edges (steps under the angle threshold) and a dust of points.

type Props = {
  geometry: BufferGeometry
  ghostGeometry?: BufferGeometry
  color: string
  position?: [number, number, number]
  rotation?: [number, number, number]
  castShadow?: boolean
  receiveShadow?: boolean
  edgeAngle?: number
}

export function LayeredMesh({ geometry, ghostGeometry, color, position, rotation, castShadow = false, receiveShadow = false, edgeAngle = 20 }: Props) {
  const solid = useMemo(() => reveal.solidMaterial(color), [color])
  const ghost = ghostGeometry ?? geometry
  const edges = useMemo(() => new EdgesGeometry(ghost, edgeAngle), [ghost, edgeAngle])
  const cloud = useMemo(() => thinPoints(ghost), [ghost])
  return <group position={position} rotation={rotation}>
    <mesh geometry={geometry} material={solid} castShadow={castShadow} receiveShadow={receiveShadow} />
    <lineSegments geometry={edges} material={reveal.wire} />
    <points geometry={cloud} material={reveal.dots} />
  </group>
}

// Convenience primitives for blocking out a scene.
export function LayeredBox({ size, ...props }: Omit<Props, 'geometry'> & { size: [number, number, number] }) {
  const geometry = useMemo(() => new BoxGeometry(...size), [size])
  return <LayeredMesh geometry={geometry} {...props} />
}

export function LayeredCylinder({ radius, depth, ...props }: Omit<Props, 'geometry'> & { radius: number; depth: number }) {
  const geometry = useMemo(() => new CylinderGeometry(radius, radius, depth, 24), [radius, depth])
  return <LayeredMesh geometry={geometry} {...props} />
}

export function LayeredSphere({ radius, ...props }: Omit<Props, 'geometry'> & { radius: number }) {
  const geometry = useMemo(() => new SphereGeometry(radius, 16, 10), [radius])
  return <LayeredMesh geometry={geometry} {...props} />
}
