/**
 * The speech plugin's server contribution (docs/architecture.md 4.7, 10.9),
 * under `/__presmium/presmium.speech/`:
 *
 * - `v1/…` (editors): the speech gateway's protocol, which the browser's
 *   `SPEECH` uses, through the deck's synthesis cache as the Node `SPEECH`
 *   (a hit sends no request). LOCAL mode: the engines of this process's
 *   environment. SHARED mode: the plugin's contribution in `presmium gateway`
 *   with serve's gateway token (./remote.ts); serve has no speech credential.
 * - `consent/<engine>/<voice>` (owners): registers a consent record. LOCAL
 *   mode: in the operator directory outside the workspace. SHARED mode: only
 *   on the owner console's origin (the server mounts owner routes there
 *   only), passed on to the gateway's route of the same name, which takes the
 *   service token only.
 */
import { DOCUMENT_FILES, gatewayFetch } from '@presmium/kernel'
import type { GatewayAccess, Route, ServerContext, ServerContribution } from '@presmium/kernel'
import { CONSENT_PATH, deckSpeechConfig, PROTOCOL_PATH, SPEECH_ID } from '../domain/index.ts'
import type { SpeechBackend } from './backend.ts'
import { SynthesisCache } from './cache.ts'
import { consentRoute } from './consent.ts'
import { reportEngines, speechCore } from './core.ts'
import { DeckSpeech } from './deck.ts'
import { gatewayBackend } from './remote.ts'
import { protocolHandler } from './routes.ts'

/** The largest request of the speech routes: a transcription's audio (OpenAI's own limit is 25 MB). */
const MAX_AUDIO = 32 * 1024 * 1024

/** The gateway's `consent/<engine>/<voice>` for an owner's request on the console, with serve's service token. */
function sharedConsent(gateway: GatewayAccess): Route {
  return {
    role: 'owner',
    async handle(request, ctx) {
      const path = ctx.rest.split('/').map(encodeURIComponent).join('/')
      const response = await gatewayFetch(gateway, SPEECH_ID, `${CONSENT_PATH}/${path}`, {
        method: request.method,
        headers: { 'Content-Type': 'application/json' },
        ...request.method === 'GET' || request.method === 'HEAD' ? {} : { body: await request.text() },
      })
      return new Response(await response.text(), { status: response.status, headers: { 'Content-Type': response.headers.get('content-type') ?? 'application/json; charset=utf-8' } })
    },
  }
}

export function speechServer(ctx: ServerContext): ServerContribution {
  let inner: SpeechBackend
  let consent: Route
  if (ctx.gateway) {
    inner = gatewayBackend(ctx.gateway)
    consent = sharedConsent(ctx.gateway)
  } else {
    const core = speechCore({ names: () => Object.keys(process.env), secret: name => ctx.secret(name), settings: ctx.settings, operatorDir: ctx.operatorDir, log: ctx.log })
    void reportEngines(core, ctx.log)
    inner = core
    consent = { role: 'owner', handle: (request, route) => consentRoute(request, route.rest, (engine, voice, record) => core.registerConsent(engine, voice, record)) }
  }
  const handle = protocolHandler(new DeckSpeech(inner, new SynthesisCache(ctx.deckDir, ctx.workspaceRoot, () => ctx.service(DOCUMENT_FILES)), deckSpeechConfig(ctx.config).config))
  return {
    routes: {
      [`${PROTOCOL_PATH}/*`]: { role: 'editor', maxBody: MAX_AUDIO, handle: (request, route) => handle(request, route.rest) },
      [`${CONSENT_PATH}/*`]: consent,
    },
  }
}
