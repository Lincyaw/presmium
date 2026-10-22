import { blockAt, OPERATIONS, presmiumService } from '@lincyaw/host'
import type { ViewerPluginContext } from '@lincyaw/viewer'
import type { OperationCues } from './operation-cues.ts'
import { hintCues, spotlightCues } from './operation-cues.ts'

let pointer: { x: number, y: number } | undefined

function toggle(type: 'spot' | 'hint', cues: OperationCues): boolean {
  const block = pointer && blockAt(pointer.x, pointer.y)?.key
  if (!block) return false
  const data = cues.isShowing({ block }) ? {} : { block }
  cues.apply(data)
  presmiumService(OPERATIONS)?.report({ type, data })
  return true
}

export default function guideViewerPlugin({ registerAction }: ViewerPluginContext): void {
  window.addEventListener('pointermove', (event) => {
    pointer = { x: event.clientX, y: event.clientY }
  }, { passive: true })
  registerAction({ id: 'presmium.guide.spot', keys: ['s'], run: () => toggle('spot', spotlightCues) })
  registerAction({ id: 'presmium.guide.hint', keys: ['h'], run: () => toggle('hint', hintCues) })
}
