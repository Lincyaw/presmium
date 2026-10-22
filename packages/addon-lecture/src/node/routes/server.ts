import type { ServerContext, ServerContribution } from '@lincyaw/kernel'
import { editingRoutes } from './editing.ts'
import { recordingRoutes } from './recordings.ts'
import { createServedDeck } from './served-deck.ts'
import { trackRoutes } from './tracks.ts'

export function lectureServer(ctx: ServerContext): ServerContribution {
  const served = createServedDeck(ctx)
  return { routes: { ...trackRoutes(served), ...editingRoutes(served), ...recordingRoutes(served) } }
}
