import { SYNC_TRANSPORTS } from '@presmium/host'
import { SESSION } from '@presmium/kernel'
import type { PluginDefinition, Unsubscribe } from '@presmium/kernel'
import { SESSION_ID } from '../domain/index.ts'
import { classroomTransport } from './classroom.ts'

let stop: Unsubscribe | undefined

/**
 * Slides form only (registered by `setup/main.ts`): joins Slidev's
 * synchronized state (navigation, drawings, the stage's screen) to the
 * classroom through the `syncTransports` service, so learners get the
 * presenter's state across devices (K-06).
 */
export const sessionSyncPlugin: PluginDefinition = {
  manifest: {
    id: `${SESSION_ID}.sync`,
    version: '0.1.0',
    kernel: '^0.1.0',
    requires: [{ token: SESSION }, { token: SYNC_TRANSPORTS }],
    capabilities: ['network'],
  },
  setup(ctx) {
    const transport = classroomTransport(ctx.get(SESSION))
    if (transport) stop = ctx.get(SYNC_TRANSPORTS).add(transport)
    else ctx.log.info('the session service is not the classroom session; Slidev state is not shared')
  },
  dispose() {
    stop?.()
    stop = undefined
  },
}
