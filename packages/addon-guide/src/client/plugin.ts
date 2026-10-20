import { NAVIGATION, OPERATIONS } from '@lincyaw/host'
import type { PluginDefinition, Unsubscribe } from '@lincyaw/kernel'
import { version } from '../../package.json'
import { GUIDE_ID } from '../domain/index.ts'
import { hints, spots } from './adhoc.ts'

let unregister: Unsubscribe[] = []

const plugin: PluginDefinition = {
  manifest: {
    id: GUIDE_ID,
    version,
    kernel: '^1.0.0',
    requires: [{ token: OPERATIONS, optional: true }, { token: NAVIGATION, optional: true }],
  },
  setup(ctx) {
    const operations = ctx.tryGet(OPERATIONS)
    const navigation = ctx.tryGet(NAVIGATION)
    unregister = [spots, hints].map((cues, i) => {
      cues.bind(navigation)
      const off = operations?.onReplay(i === 0 ? 'spot' : 'hint', {
        apply: (data, seeking) => cues.apply(data, !seeking),
        clear: () => cues.off(),
      })
      return () => {
        off?.()
        cues.unbind()
      }
    })
  },
  dispose() {
    unregister.forEach(off => off())
    unregister = []
  },
}

export default plugin
