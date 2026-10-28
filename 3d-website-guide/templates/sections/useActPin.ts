import { useEffect, type RefObject } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { acts, setAct } from '../scene/acts'

gsap.registerPlugin(ScrollTrigger)

/**
 * Pin a section for `viewports` screen heights and write its scroll progress into the
 * acts store. Only on the 3D route; on phones / reduced motion the section scrolls normally.
 *
 *   const ref = useRef<HTMLElement>(null)
 *   useActPin(ref, 'journey', 4.5)
 *   return <section id="journey" ref={ref}>...</section>
 */
export function useActPin(ref: RefObject<HTMLElement | null>, act: string, viewports: number, onProgress?: (p: number) => void) {
  useEffect(() => {
    const el = ref.current
    if (!el || !acts.world3d) return
    const trigger = ScrollTrigger.create({
      trigger: el,
      start: 'top top',
      end: () => `+=${window.innerHeight * viewports}`,
      pin: true,
      scrub: true,
      onUpdate: self => { setAct(act, self.progress); onProgress?.(self.progress) },
      onLeave: () => setAct(act, 1),
      onLeaveBack: () => setAct(act, 0),
    })
    // Triggers created before a parent pin spacer exists get wrong offsets (dead zones,
    // animations finishing off-screen). Re-sort and refresh once everything is mounted.
    ScrollTrigger.sort()
    ScrollTrigger.refresh()
    return () => trigger.kill()
  }, [ref, act, viewports, onProgress])
}
