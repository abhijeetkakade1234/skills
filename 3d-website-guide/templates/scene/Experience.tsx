import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { ContactShadows, Environment, Lightformer, PerformanceMonitor } from '@react-three/drei'
import { ACESFilmicToneMapping, SRGBColorSpace, Vector3, VSMShadowMap, type DirectionalLight, type Fog } from 'three'
import { actProgress, acts, applyQaOverride } from './acts'
import { pose, pullBack, stationPath, type Pose } from './cameraRig'
import { reveal } from './revealSystem'

// Skeleton of the one page-wide canvas with the performance settings that mattered.
// Replace the scene contents and the act names ('hero', 'journey', 'finale') with yours.

const Effects = lazy(() => import('./Effects').then(m => ({ default: m.Effects })))

const BG = '#0E1110'
const HERO = pose(new Vector3(6.8, 7.2, 9), new Vector3(-2, 0.8, 0))
const journey = stationPath(HERO, [
  { subject: new Vector3(-1.7, 2.9, -3), offset: new Vector3(1.5, 0.45, 2.1), frameShift: 0.4 },
  { subject: new Vector3(-1.2, 5, -7), offset: new Vector3(1.4, 0.55, 2.5), frameShift: 0.55 },
  { subject: new Vector3(2.8, 5.4, -10.5), offset: new Vector3(2.4, 1.2, 5.4), frameShift: 1.15 },
])
const finale = pullBack(HERO, pose(new Vector3(20, 31, 33), new Vector3(-8, 0, 1)))
const scratch: Pose = pose(new Vector3(), new Vector3())

type Mode = 'hero' | 'journey' | 'finale'
let finaleTop = Infinity, checkedAt = -Infinity
/** Which act owns the camera. The finale starts when its section ENTERS the viewport (before
 *  its pin writes progress) so the camera doesn't jump; its offset is cached, not read per frame. */
function currentMode(time: number): Mode {
  if (!acts.world3d) return 'hero'
  if (time - checkedAt > 1) {
    const el = document.getElementById('finale')
    finaleTop = el ? el.getBoundingClientRect().top + window.scrollY : Infinity
    checkedAt = time
  }
  if (actProgress('finale') > 0 || window.scrollY + window.innerHeight > finaleTop) return 'finale'
  return actProgress('journey') > 0 ? 'journey' : 'hero'
}

function World({ heroProgress, slow, onReady }: { heroProgress: React.RefObject<number>; slow: boolean; onReady: () => void }) {
  const key = useRef<DirectionalLight>(null)
  const fog = useRef<Fog>(null)
  const frame = useRef(0)
  const mode = useRef<Mode>('hero')
  useEffect(() => { onReady() }, [onReady])

  useFrame((state) => {
    applyQaOverride()
    const time = state.clock.elapsedTime
    mode.current = currentMode(time)
    const p = heroProgress.current ?? 0

    // Reveal front per mode: the hero sweeps it across; later acts can sweep it back.
    if (mode.current === 'hero') reveal.front.value = p < 0.2 ? -100 : p > 0.55 ? 100 : -6 + ((p - 0.2) / 0.35) * 12
    else reveal.front.value = -100
    reveal.syncLayers()

    // Shadows: autoUpdate is off; refresh every few frames only.
    frame.current++
    if (frame.current % (mode.current === 'hero' ? 2 : 4) === 0) state.gl.shadowMap.needsUpdate = true

    if (fog.current) { const f = mode.current === 'finale' ? actProgress('finale') : 0; fog.current.near = 10 + f * 48; fog.current.far = 19 + f * 96 }
    if (key.current) key.current.intensity = 2.2

    if (mode.current === 'journey') journey(actProgress('journey'), time, scratch)
    else if (mode.current === 'finale') finale(actProgress('finale'), time, scratch)
    else { scratch.position.copy(HERO.position); scratch.target.copy(HERO.target) }
    state.camera.position.copy(scratch.position)
    state.camera.lookAt(scratch.target)
  })

  return <>
    <color attach="background" args={[BG]} />
    <fog ref={fog} attach="fog" args={[BG, 10, 19]} />
    <ambientLight intensity={0.28} />
    <hemisphereLight args={['#EEE9DF', '#777E79', 0.55]} />
    <directionalLight ref={key} position={[-3, 9, 7]} intensity={2.2} castShadow shadow-mapSize={slow ? [1024, 1024] : [1536, 1536]} shadow-bias={-0.00015} shadow-radius={4} shadow-blurSamples={8} />
    <Environment resolution={128}>
      <Lightformer form="rect" intensity={2.2} position={[-3, 8, 3]} scale={[10, 5, 1]} />
      <Lightformer form="rect" intensity={0.8} position={[5, 4, -6]} scale={[8, 5, 1]} />
    </Environment>
    {/* <YourScene /> : LayeredMesh / LayeredBox objects, a GLB model, act groups... */}
    {/* Static receivers: bake once instead of re-rendering the scene every frame. */}
    {!slow && <ContactShadows frames={1} position={[0, 0.008, 0]} opacity={0.32} scale={15} blur={2.8} far={3.5} resolution={512} />}
    {!slow && <Suspense fallback={null}><Effects aoWhen={() => mode.current !== 'finale'} /></Suspense>}
  </>
}

export function Experience({ heroProgress, active, onReady }: { heroProgress: React.RefObject<number>; active: boolean; onReady: () => void }) {
  const [mobile] = useState(() => window.innerWidth < 768)
  const [slow, setSlow] = useState(mobile)
  // Resolution is the biggest GPU cost (every post effect runs per pixel). Start modest and
  // step down before dropping the effects.
  const [dpr, setDpr] = useState(() => Math.min(window.devicePixelRatio, 1.35))
  return <Canvas dpr={slow ? 1 : dpr} frameloop={active ? 'always' : 'never'}
    shadows={{ type: VSMShadowMap }} camera={{ fov: 39, near: 0.1, far: 140 }}
    gl={{ antialias: true, toneMapping: ACESFilmicToneMapping, outputColorSpace: SRGBColorSpace, powerPreference: 'high-performance' }}
    onCreated={({ gl }) => { gl.shadowMap.autoUpdate = false; gl.shadowMap.needsUpdate = true }}>
    <PerformanceMonitor onDecline={() => { if (dpr > 1) setDpr(1); else setSlow(true) }} />
    <Suspense fallback={null}><World heroProgress={heroProgress} slow={slow} onReady={onReady} /></Suspense>
  </Canvas>
}
