import { BufferGeometry, BufferAttribute, Color, MeshStandardMaterial, ShaderMaterial, type IUniform } from 'three'

// A world-space reveal front along one axis. In front of it: solid (clay) surfaces.
// Behind it: the same geometry as wireframe that decays into sparse points ("how the
// machine sees it"). Sweep `front.value` with scroll; sweep it back to reverse.
//
// All solid materials are registered and the ghost materials are shared, so syncLayers()
// can stop the GPU drawing whichever layer cannot be visible.

export type Axis = 'x' | 'y' | 'z'
const ALL_GHOST = 99   // front beyond the scene: everything is ghost
const ALL_SOLID = -99  // front before the scene: everything is solid

export function createRevealSystem({ axis = 'x' as Axis, ghostColor = '#8A8F8B', bandColor = 0.10, pointSize = 2.1 } = {}) {
  const front: IUniform<number> = { value: -100 }
  const solids = new Set<MeshStandardMaterial>()

  function solidMaterial(color: string, params: { roughness?: number; side?: 0 | 1 | 2 } = {}) {
    const m = new MeshStandardMaterial({ color, roughness: params.roughness ?? 0.92, metalness: 0, side: params.side ?? 2 })
    m.onBeforeCompile = shader => {
      shader.uniforms.uFront = front
      shader.vertexShader = shader.vertexShader
        .replace('void main() {', 'varying vec3 vRevealWorld;\nvoid main() {')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n vRevealWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;')
      shader.fragmentShader = shader.fragmentShader
        .replace('void main() {', 'varying vec3 vRevealWorld; uniform float uFront;\nvoid main() {')
        .replace('#include <dithering_fragment>',
          `if (vRevealWorld.${axis} < uFront - 0.015) discard;
           float band = 1.0 - smoothstep(0.0, 0.09, abs(vRevealWorld.${axis} - uFront));
           gl_FragColor.rgb += vec3(${bandColor.toFixed(3)}) * band;
           #include <dithering_fragment>`)
    }
    m.customProgramCacheKey = () => `reveal-solid-${axis}`
    solids.add(m)
    return m
  }

  const vertex = `varying vec3 vWorld; uniform float uSize;
    void main() { vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz;
      gl_Position = projectionMatrix * viewMatrix * w; gl_PointSize = uSize; }`
  const fragment = `uniform float uFront; uniform vec3 uColor; uniform float uMode; varying vec3 vWorld;
    void main() { float age = uFront - vWorld.${axis}; if (age < 0.0) discard;
      float entry = smoothstep(0.0, 0.14, age);
      float alpha = uMode < 0.5 ? (0.12 + 0.31 * (1.0 - smoothstep(0.5, 2.4, age))) : (0.13 + 0.10 * smoothstep(0.4, 2.5, age));
      if (uMode > 0.5 && length(gl_PointCoord - vec2(0.5)) > 0.42) discard;
      gl_FragColor = vec4(uColor, alpha * entry); }`
  const ghost = (points: boolean) => new ShaderMaterial({
    uniforms: { uFront: front, uColor: { value: new Color(ghostColor) }, uMode: { value: points ? 1 : 0 }, uSize: { value: pointSize } },
    vertexShader: vertex, fragmentShader: fragment, transparent: true, depthWrite: false, wireframe: !points,
  })
  const wire = ghost(false)
  const dots = ghost(true)

  /** Call once per frame after moving the front. */
  function syncLayers() {
    const solidVisible = front.value < ALL_GHOST
    for (const m of solids) m.visible = solidVisible
    wire.visible = dots.visible = front.value > ALL_SOLID
  }

  return { front, solidMaterial, wire, dots, syncLayers }
}

/** Dense meshes turn into a smudge of points; keep an even stride, max `limit` points. */
export function thinPoints(geometry: BufferGeometry, limit = 500) {
  const pos = geometry.getAttribute('position')
  if (pos.count <= limit) return geometry
  const stride = Math.ceil(pos.count / limit)
  const out = new Float32Array(Math.ceil(pos.count / stride) * 3)
  for (let i = 0, j = 0; i < pos.count; i += stride, j += 3) out.set([pos.getX(i), pos.getY(i), pos.getZ(i)], j)
  const thinned = new BufferGeometry()
  thinned.setAttribute('position', new BufferAttribute(out, 3))
  return thinned
}

// One shared instance for the whole scene. Change axis/colours here.
export const reveal = createRevealSystem()
