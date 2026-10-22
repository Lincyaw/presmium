import { blockAt, OPERATIONS, presmiumService } from '@lincyaw/host'
import type { OperationCues } from './operation-cues.ts'
import { hintCues, spotlightCues } from './operation-cues.ts'

export interface GuideViewerContext {
  registerAction(action: { id: string, keys: readonly string[], run(viewer: unknown): boolean | void }): void
}

let pointer: { x: number, y: number } | undefined

function toggle(type: 'spot' | 'hint', cues: OperationCues): boolean {
  const block = pointer && blockAt(pointer.x, pointer.y)?.key
  if (!block) return false
  const data = cues.isShowing({ block }) ? {} : { block }
  cues.apply(data)
  presmiumService(OPERATIONS)?.report({ type, data })
  return true
}

export default function guideViewerPlugin({ registerAction }: GuideViewerContext): void {
  window.addEventListener('pointermove', (event) => {
    pointer = { x: event.clientX, y: event.clientY }
  }, { passive: true })
  registerAction({ id: 'presmium.guide.spot', keys: ['s'], run: () => toggle('spot', spotlightCues) })
  registerAction({ id: 'presmium.guide.hint', keys: ['h'], run: () => toggle('hint', hintCues) })
}
