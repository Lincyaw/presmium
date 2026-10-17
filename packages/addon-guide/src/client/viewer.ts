/**
 * Spotlights and hints made while presenting, in the web form's present view
 * and presenter window: `s` spotlights the block under the pointer, `h` puts
 * a hint beacon on it; the same key over the same block takes it away. Each
 * is reported as the operation `spot` or `hint` (docs/ir.md 9.2), so a
 * lecture recording keeps it and its player shows it again.
 */
import { blockAt, OPERATIONS, presmiumService } from '@presmium/host'
import type { AdhocCues } from './adhoc.ts'
import { hints, spots } from './adhoc.ts'

/** What the guide uses of the viewer plugin context (`ViewerPluginContext` of @presmium/viewer). */
export interface GuideViewerContext {
  registerAction(action: { id: string, keys: readonly string[], run(viewer: unknown): boolean | void }): void
}

/** Where the pointer last was on the page. */
let pointer: { x: number, y: number } | undefined

function toggle(type: 'spot' | 'hint', cues: AdhocCues): boolean {
  const block = pointer && blockAt(pointer.x, pointer.y)?.key
  if (!block) return false
  const data = cues.showing({ block }) ? {} : { block }
  cues.apply(data)
  presmiumService(OPERATIONS)?.report({ type, data })
  return true
}

/** The viewer plugin (docs/ir.md section 8.2) the web form loads from `src/client/viewer.ts`. */
export default function guideViewerPlugin({ registerAction }: GuideViewerContext): void {
  window.addEventListener('pointermove', (event) => {
    pointer = { x: event.clientX, y: event.clientY }
  }, { passive: true })
  registerAction({ id: 'presmium.guide.spot', keys: ['s'], run: () => toggle('spot', spots) })
  registerAction({ id: 'presmium.guide.hint', keys: ['h'], run: () => toggle('hint', hints) })
}
