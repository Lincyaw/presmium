/**
 * The speech plugin's server contribution (docs/architecture.md 4.7, 10.9),
 * under `/__presmium/presmium.speech/`:
 *
 * - `v1/…` (editors): the speech gateway's protocol, which the browser's
 *   `SPEECH` uses. LOCAL mode: the engines of this process's environment and
 *   the deck's synthesis cache. SHARED mode: a proxy to the plugin's
 *   contribution in `presmium gateway` with serve's gateway token; serve has
 *   no speech credential.
 * - `consent/<engine>/<voice>` (owners): registers a consent record. LOCAL
 *   mode: in the operator directory outside the workspace. SHARED mode: only
 *   on the owner console's origin (the server mounts owner routes there
 *   only), passed on to the gateway's route of the same name, which takes the
 *   service token only.
 */
import type { GatewayAccess, ServerContext, ServerContribution } from '@presmium/kernel'
import { CONSENT_PATH, deckSpeechConfig, PROTOCOL_PATH, SPEECH_ID } from '../domain/index.ts'
import { SynthesisCache } from './cache.ts'
import { consentRoute } from './consent.ts'
import { reportEngines, speechCore } from './core.ts'
import { DeckSpeech } from './deck.ts'
import { protocolHandler } from './routes.ts'

function sharedServer(gateway: GatewayAccess): ServerContribution {
  const base = `${gateway.url.replace(/\/+$/, '')}/${SPEECH_ID}`
  return {
    // The gateway checks `Host`, takes no `Origin` (serve leaves it out towards the gateway) and gets serve's token, not the browser's headers.
    proxies: [{ path: PROTOCOL_PATH, target: `${base}/${PROTOCOL_PATH}`, headers: { host: new URL(gateway.url).host, authorization: `Bearer ${gateway.token}` }, role: 'editor' }],
    routes: {
      [`${CONSENT_PATH}/*`]: {
        role: 'owner',
        async handle(request, ctx) {
          const path = ctx.rest.split('/').map(encodeURIComponent).join('/')
          const response = await fetch(`${base}/${CONSENT_PATH}/${path}`, {
            method: request.method,
            headers: { 'Authorization': `Bearer ${gateway.token}`, 'Content-Type': 'application/json' },
            ...request.method === 'GET' || request.method === 'HEAD' ? {} : { body: await request.text() },
            redirect: 'error',
          })
          return new Response(await response.text(), { status: response.status, headers: { 'Content-Type': response.headers.get('content-type') ?? 'application/json; charset=utf-8' } })
        },
      },
    },
  }
}

export function speechServer(ctx: ServerContext): ServerContribution {
  if (ctx.gateway) return sharedServer(ctx.gateway)
  const core = speechCore({ names: () => Object.keys(process.env), secret: name => ctx.secret(name), settings: ctx.settings, operatorDir: ctx.operatorDir, log: ctx.log })
  void reportEngines(core, ctx.log)
  const handle = protocolHandler(new DeckSpeech(core, new SynthesisCache(ctx.deckDir), deckSpeechConfig(ctx.config).config))
  return {
    routes: {
      [`${PROTOCOL_PATH}/*`]: { role: 'editor', handle: (request, route) => handle(request, route.rest) },
      [`${CONSENT_PATH}/*`]: { role: 'owner', handle: (request, route) => consentRoute(request, route.rest, (engine, voice, record) => core.registerConsent(engine, voice, record)) },
    },
  }
}
