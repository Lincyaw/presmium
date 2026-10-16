import { OPERATIONS } from '@presmium/host'
import type { PluginDefinition, Unsubscribe } from '@presmium/kernel'
import { LECTURE_ID } from '../domain/index.ts'
import { applyInk, applyPoint, clearInks, clearPointer } from './marks.ts'

let unregister: Unsubscribe[] = []

/**
 * The lecture plugin's part of the host (docs/architecture.md 4.9): the
 * replay of what it reports while a lecture is recorded, the pointer
 * (`point`) and the laser and marker strokes (`ink`). The web package
 * registers it in the document form.
 */
const plugin: PluginDefinition = {
  manifest: { id: LECTURE_ID, version: '0.1.0', kernel: '^0.1.0', requires: [{ token: OPERATIONS, optional: true }] },
  setup(ctx) {
    const operations = ctx.tryGet(OPERATIONS)
    if (!operations) return
    unregister = [
      operations.onReplay('point', { apply: applyPoint, clear: clearPointer }),
      operations.onReplay('ink', { apply: applyInk, clear: clearInks }),
    ]
  },
  dispose() {
    unregister.forEach(off => off())
    unregister = []
    clearPointer()
    clearInks()
  },
}

export default plugin
