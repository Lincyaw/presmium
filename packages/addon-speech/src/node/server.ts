import type { ServerContext, ServerContribution } from '@lincyaw/kernel'
import { CONSENT_PATH, PROTOCOL_PATH } from '../domain/index.ts'
import { createDeckSpeech } from './cached-speech.ts'
import { consentRoute } from './consent.ts'
import { reportEngines } from './core.ts'
import { protocolHandler } from './protocol-routes.ts'

const MAX_AUDIO = 32 * 1024 * 1024

export function speechServer(ctx: ServerContext): ServerContribution {
  const { core, speech } = createDeckSpeech(ctx)
  void reportEngines(core, ctx.log)
  const handle = protocolHandler(speech)
  return {
    routes: {
      [`${PROTOCOL_PATH}/*`]: { role: 'editor', maxBody: MAX_AUDIO, handle: (request, route) => handle(request, route.rest) },
      [`${CONSENT_PATH}/*`]: { role: 'owner', handle: (request, route) => consentRoute(request, route.rest, (engine, voice, record) => core.registerConsent(engine, voice, record)) },
    },
  }
}
