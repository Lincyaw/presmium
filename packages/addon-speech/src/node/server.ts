import { DOCUMENT_FILES } from '@presmium/kernel'
import type { ServerContext, ServerContribution } from '@presmium/kernel'
import { CONSENT_PATH, deckSpeechConfig, PROTOCOL_PATH } from '../domain/index.ts'
import { SynthesisCache } from './cache.ts'
import { consentRoute } from './consent.ts'
import { reportEngines, speechCore } from './core.ts'
import { DeckSpeech } from './deck.ts'
import { protocolHandler } from './routes.ts'

const MAX_AUDIO = 32 * 1024 * 1024

export function speechServer(ctx: ServerContext): ServerContribution {
  const core = speechCore({ names: () => Object.keys(process.env), secret: name => ctx.secret(name), settings: ctx.settings, operatorDir: ctx.operatorDir, log: ctx.log })
  void reportEngines(core, ctx.log)
  const handle = protocolHandler(new DeckSpeech(core, new SynthesisCache(ctx.deckDir, ctx.workspaceRoot, () => ctx.service(DOCUMENT_FILES)), deckSpeechConfig(ctx.config).config))
  return {
    routes: {
      [`${PROTOCOL_PATH}/*`]: { role: 'editor', maxBody: MAX_AUDIO, handle: (request, route) => handle(request, route.rest) },
      [`${CONSENT_PATH}/*`]: { role: 'owner', handle: (request, route) => consentRoute(request, route.rest, (engine, voice, record) => core.registerConsent(engine, voice, record)) },
    },
  }
}
