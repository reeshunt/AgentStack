import { useEffect, useRef, useState } from 'react'

type Delegation = { id: string; from: string; to: string }

type Line = { id: string; x1: number; y1: number; x2: number; y2: number }

type Props = {
  delegations: Delegation[]
  deskRefs: Map<string, HTMLDivElement>
  containerRef: React.RefObject<HTMLDivElement>
}

/** Animated dashed lines drawn between two desks while the Floor Manager has an active
 *  delegation in flight. Positions are recomputed from live `getBoundingClientRect()`
 *  measurements — desk cards have no fixed layout coordinates, and department rows/the
 *  floor itself scroll independently, so this can't be computed once and cached. */
export default function DelegationOverlay({ delegations, deskRefs, containerRef }: Props): React.JSX.Element | null {
  const [lines, setLines] = useState<Line[]>([])
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    function recompute(): void {
      const container = containerRef.current
      if (!container) return
      const containerRect = container.getBoundingClientRect()

      const next: Line[] = []
      for (const d of delegations) {
        const fromEl = deskRefs.get(d.from)
        const toEl = deskRefs.get(d.to)
        if (!fromEl || !toEl) continue
        const fromRect = fromEl.getBoundingClientRect()
        const toRect = toEl.getBoundingClientRect()
        next.push({
          id: d.id,
          x1: fromRect.left + fromRect.width / 2 - containerRect.left,
          y1: fromRect.top + fromRect.height / 2 - containerRect.top,
          x2: toRect.left + toRect.width / 2 - containerRect.left,
          y2: toRect.top + toRect.height / 2 - containerRect.top
        })
      }
      setLines(next)
    }

    function scheduleRecompute(): void {
      if (rafRef.current !== null) return
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null
        recompute()
      })
    }

    recompute()

    // Scroll events don't bubble, but a capture-phase listener on document still sees
    // them fire on any scrollable descendant (the vertical floor-zones list, or any
    // individual department's independently horizontally-scrolling floor-zone-grid).
    document.addEventListener('scroll', scheduleRecompute, true)
    window.addEventListener('resize', scheduleRecompute)
    const observer = new ResizeObserver(scheduleRecompute)
    if (containerRef.current) observer.observe(containerRef.current)

    return () => {
      document.removeEventListener('scroll', scheduleRecompute, true)
      window.removeEventListener('resize', scheduleRecompute)
      observer.disconnect()
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [delegations, deskRefs, containerRef])

  if (lines.length === 0) return null

  return (
    <svg className="delegation-overlay">
      {lines.map((line) => (
        <line key={line.id} className="delegation-line" x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} />
      ))}
    </svg>
  )
}
