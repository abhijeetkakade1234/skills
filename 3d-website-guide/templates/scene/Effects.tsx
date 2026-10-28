import { useFrame } from '@react-three/fiber'
import { EffectComposer, N8AO, Noise, Vignette } from '@react-three/postprocessing'
import { useRef } from 'react'

// Lazy-loaded from Experience (React.lazy) and only mounted on capable desktops, so phones
// never download postprocessing. `aoWhen` lets wide shots switch AO off.
export function Effects({ aoWhen = () => true }: { aoWhen?: () => boolean }) {
  const ao = useRef<{ enabled: boolean }>(null)
  useFrame(() => { if (ao.current) ao.current.enabled = aoWhen() })
  return <EffectComposer multisampling={0}>
    <N8AO ref={ao} halfRes aoSamples={8} aoRadius={1.3} intensity={1.1} />
    <Vignette eskil={false} offset={0.32} darkness={0.46} />
    <Noise opacity={0.025} />
  </EffectComposer>
}
