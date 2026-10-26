import type { ServerContext, ServerContribution } from '@lincyaw/kernel'
import { productionRoutes } from './production.ts'
import { recordingRoutes } from './recordings.ts'
import { createServedDeck } from './served-deck.ts'
import { trackRoutes } from './tracks.ts'
import { voiceoverRoutes } from './voiceover.ts'

export function lectureServer(ctx: ServerContext): ServerContribution {
  const served = createServedDeck(ctx)
  const voiceover = voiceoverRoutes(served)
  return { routes: { ...trackRoutes(served), ...productionRoutes(served), ...recordingRoutes(served), ...voiceover.routes }, close: voiceover.close }
}
