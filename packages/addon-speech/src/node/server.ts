import type { ServerContext, ServerContribution } from '@lincyaw/kernel'
import { CLONE_PATH, CONSENT_PATH, PROTOCOL_PATH } from '../domain/index.ts'
import { createDeckSpeech } from './cached-speech.ts'
import { cloneRoute, MAX_CLONE_AUDIO } from './clone-route.ts'
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
      // Training registers the speaker's consent and spends money: the owner's alone, like consent.
      [CLONE_PATH]: { role: 'owner', maxBody: 2 * MAX_CLONE_AUDIO + 65536, handle: request => cloneRoute(request, '', speech) },
      [`${CLONE_PATH}/*`]: { role: 'owner', handle: (request, route) => cloneRoute(request, route.rest, speech) },
    },
  }
}
