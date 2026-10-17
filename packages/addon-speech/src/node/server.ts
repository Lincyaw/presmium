/**
 * The speech plugin's server contribution (docs/architecture.md 4.7), under
 * `/__presmium/presmium.speech/`:
 *
 * - `v1/…` (editors): the speech protocol, which the browser's `SPEECH`
 *   uses, through the deck's synthesis cache as the Node `SPEECH` (a hit
 *   sends no request), over the engines of this process's environment.
 * - `consent/<engine>/<voice>` (owners): registers a consent record in the
 *   operator directory outside the workspace.
 */
import { DOCUMENT_FILES } from '@presmium/kernel'
import type { ServerContext, ServerContribution } from '@presmium/kernel'
import { CONSENT_PATH, deckSpeechConfig, PROTOCOL_PATH } from '../domain/index.ts'
import { SynthesisCache } from './cache.ts'
import { consentRoute } from './consent.ts'
import { reportEngines, speechCore } from './core.ts'
import { DeckSpeech } from './deck.ts'
import { protocolHandler } from './routes.ts'

/** The largest request of the speech routes: a transcription's audio (OpenAI's own limit is 25 MB). */
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
