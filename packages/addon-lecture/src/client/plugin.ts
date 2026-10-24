import { OPERATIONS } from '@lincyaw/host'
import type { PluginDefinition, Unsubscribe } from '@lincyaw/kernel'
import { version } from '../../package.json'
import { LECTURE_ID } from '../domain/index.ts'
import { applyInk, applyPoint, clearInks, clearPointer } from './pointer-ink.ts'
import { readLecturesFlag } from './state.ts'

let unregister: Unsubscribe[] = []

const plugin: PluginDefinition = {
  // dispose releases everything setup made; a paused preview starts the same definition again.
  restartable: true,
  manifest: { id: LECTURE_ID, version, kernel: '^1.0.0', requires: [{ token: OPERATIONS, optional: true }] },
  setup(ctx) {
    readLecturesFlag(ctx.config)
    const operations = ctx.tryGet(OPERATIONS)
    unregister = operations
      ? [operations.onReplay('point', { apply: applyPoint, clear: clearPointer }), operations.onReplay('ink', { apply: applyInk, clear: clearInks })]
      : []
  },
  dispose() {
    unregister.forEach(off => off())
    unregister = []
    clearPointer()
    clearInks()
  },
}

export default plugin
