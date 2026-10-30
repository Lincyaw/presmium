import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, RefObject } from 'react'
import type { MascotAction } from '@lincyaw/design/mascot'
import { PmMascot } from '../components.tsx'
import { useMascotEnabled } from '../mascot-preference.ts'
import { useWorkbenchState } from '../context.tsx'
import { pageId, richNodeIds } from '../document-editor/projection.ts'

/** How long the kitten walks from one changed place to the next, pats it, and stays when it is done (ms). */
const WALK_MS = 700, PAT_MS = 900, DONE_MS = 2200
/** At most this many changed places are visited. */
const STOPS = 6

type Point = { x: number, y: number }
type Phase = 'walk' | 'pat' | 'done' | 'gone'

/**
 * The kitten visiting a list of points in its host (each the lower left of a changed place): it walks to each, pats it,
 * hops when it is done and leaves. A new `id` starts it again from the first point; `where(i)` is asked on every
 * render, so the kitten follows the places as the host lays out again. Nothing shows when the kitten is turned off.
 */
function KittenTrail({ id, count, where }: { id: number | undefined, count: number, where(index: number): Point | undefined }) {
  const enabled = useMascotEnabled()
  const [step, setStep] = useState<{ id: number, stop: number, phase: Phase }>()
  const facing = useRef<'left' | 'right'>('right'), last = useRef<Point>()
  useEffect(() => {
    if (id !== undefined && count > 0) setStep(current => current?.id === id ? current : { id, stop: 0, phase: 'walk' })
  }, [id, count])
  useEffect(() => {
    if (!step || step.phase === 'gone') return
    const stops = Math.min(STOPS, count)
    const next: typeof step = step.phase === 'walk' ? { ...step, phase: 'pat' }
      : step.phase === 'pat' ? (step.stop + 1 < stops ? { ...step, stop: step.stop + 1, phase: 'walk' } : { ...step, phase: 'done' })
        : { ...step, phase: 'gone' }
    const timer = setTimeout(() => setStep(next), step.phase === 'walk' ? WALK_MS : step.phase === 'pat' ? PAT_MS : DONE_MS)
    return () => clearTimeout(timer)
  }, [step, count])
  if (!enabled || !step || step.phase === 'gone' || step.id !== id) return null
  const point = where(Math.min(step.stop, count - 1))
  if (!point) return null
  if (last.current && Math.abs(point.x - last.current.x) > 2 && step.phase === 'walk') facing.current = point.x < last.current.x ? 'left' : 'right'
  if (step.phase === 'walk') last.current = point
  const action: MascotAction = step.phase === 'walk' ? 'walk' : step.phase === 'pat' ? 'write' : 'done'
  return (
    <div className="pmw-change-trail" data-phase={step.phase} style={{ '--pmw-trail-x': `${point.x}px`, '--pmw-trail-y': `${point.y}px` } as CSSProperties}>
      <div className="pmw-change-trail__facing" data-facing={facing.current}><PmMascot size="small" action={action} /></div>
    </div>
  )
}

/** In the preview: the blocks the preview reports blinking, in the active frame's viewport. */
export function PreviewChangeTrail({ stage, frames }: { stage: RefObject<HTMLDivElement | null>, frames: RefObject<HTMLDivElement | null> }) {
  const trail = useWorkbenchState(state => state.changeTrail)
  return <KittenTrail id={trail?.id} count={trail?.rects.length ?? 0} where={index => {
    const rect = trail?.rects[index]
    const frame = frames.current?.querySelector<HTMLIFrameElement>('iframe[data-active="true"]:not([hidden])')
    const host = stage.current
    if (!rect || !frame || !host) return undefined
    const offset = frame.getBoundingClientRect(), origin = host.getBoundingClientRect()
    return { x: offset.left - origin.left + rect.x, y: offset.top - origin.top + rect.y + rect.height }
  }} />
}

/** In the editor: each changed block (a text block by its first paragraph), else its page's title, on the sheet. */
export function EditorChangeTrail({ sheet }: { sheet: RefObject<HTMLDivElement | null> }) {
  const places = useWorkbenchState(state => state.changedPlaces)
  const content = useWorkbenchState(state => state.authoring?.content)
  return <KittenTrail id={places?.id} count={places?.targets.length ?? 0} where={index => {
    const target = places?.targets[index], host = sheet.current
    if (!target || !host) return undefined
    const block = target.block ? content?.blocks[target.block] : undefined
    const ids = [...target.block ? [target.block] : [], ...block?.type === 'text' ? richNodeIds(block.content) : [], pageId(target.section)]
    const element = ids.map(id => host.querySelector<HTMLElement>(`[data-id="${CSS.escape(id)}"]`)).find(Boolean)
    if (!element) return undefined
    const box = element.getBoundingClientRect(), origin = host.getBoundingClientRect()
    // the kitten stands on the place's first line, at its left edge
    return { x: box.left - origin.left, y: box.top - origin.top + Math.min(box.height, 28) }
  }} />
}
