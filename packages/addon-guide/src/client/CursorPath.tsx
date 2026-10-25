import {
  useStep,
  usePrefersReducedMotion,
  useStepScope,
  useStepTime,
} from '@lincyaw/host'
import { useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import type { PlannedWaypoint } from '../domain/index.ts'
import { centerIn } from './geometry.ts'
import type { Point } from './geometry.ts'
import { resolveTarget, useTargetMark } from './targets.ts'
import './CursorPath.css'
export default function CursorPath({ plan }: { plan: PlannedWaypoint[] }) {
  const scope = useStepScope(),
    hostStep = useStep(),
    stepTime = useStepTime({ until: 850 }),
    reduced = usePrefersReducedMotion()
  const index =
      plan.filter((point) => hostStep - scope.at >= point.at).length - 1,
    point = plan[index]
  const time = point && hostStep - scope.at === point.at ? stepTime : Infinity
  const cursor = useRef<HTMLDivElement>(null)
  const [points, setPoints] = useState<{ from?: Point; to?: Point }>({})
  useLayoutEffect(() => {
    const measure = () => {
      const el = cursor.current,
        frame = el?.offsetParent
      if (!(frame instanceof HTMLElement)) return
      const at = (i: number) => {
        const target = resolveTarget(el ?? undefined, plan[i]?.to)
        return target ? centerIn(target, frame) : undefined
      }
      const to = at(Math.max(index, 0))
      setPoints({ to, from: index > 0 ? (at(index - 1) ?? to) : to })
    }
    const observer = new ResizeObserver(measure)
    if (cursor.current?.parentElement)
      observer.observe(cursor.current.parentElement)
    for (const waypoint of plan) {
      const target = resolveTarget(cursor.current ?? undefined, waypoint.to)
      if (target) observer.observe(target)
    }
    measure()
    return () => observer.disconnect()
  }, [index, plan])
  useTargetMark(
    cursor,
    point?.to ?? '',
    'data-pm-cursor',
    point?.action === 'move' ? undefined : point?.action,
  )
  const k = 1 - (1 - Math.min(1, time / 500)) ** 3
  const position =
    points.from && points.to
      ? {
          x: points.from.x + (points.to.x - points.from.x) * k,
          y: points.from.y + (points.to.y - points.from.y) * k,
        }
      : points.to
  const press = Math.min(1, Math.max(0, (time - 450) / 400))
  return (
    <div
      ref={cursor}
      className="pm-cursor"
      aria-hidden="true"
      data-waypoint={index}
      data-action={point?.action ?? 'none'}
      data-motion={reduced ? 'reduced' : 'full'}
      style={
        {
          ...(position
            ? { transform: `translate(${position.x}px, ${position.y}px)` }
            : {}),
          '--pm-cursor-press': press,
        } as CSSProperties
      }
    >
      <span className="pm-cursor__ring" />
      <svg className="pm-cursor__arrow" viewBox="-2 -2 20 26">
        <path d="M0 0V18L5 13.5L8.5 21L11.5 19.5L8 12H14.5Z" />
      </svg>
    </div>
  )
}
