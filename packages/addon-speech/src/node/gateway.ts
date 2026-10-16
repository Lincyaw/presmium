/**
 * The speech plugin's gateway contribution (D13, docs/architecture.md 10.9),
 * under `/presmium.speech/` of `presmium gateway`, the one process of a
 * SHARED deployment with speech credentials and the operator directory:
 *
 * - `v1/…`: the speech gateway's protocol with the engines of the gateway's
 *   environment (their providers from it too) and the consent gate of the
 *   gateway's operator directory; for serve's service token and scoped
 *   tokens that include the plugin (a run or a build in agent-host).
 * - `consent/<engine>/<voice>`: registers a consent record in the gateway's
 *   operator directory; serve's service token only (serve passes on an
 *   owner's request from the owner console).
 *
 * The gateway loads no deck: there is no synthesis cache here, the caller
 * keeps one.
 */
import type { GatewayContext, GatewayContribution } from '@presmium/kernel'
import { CONSENT_PATH, PROTOCOL_PATH } from '../domain/index.ts'
import { consentRoute } from './consent.ts'
import { reportEngines, speechCore } from './core.ts'
import { protocolHandler } from './routes.ts'

export function speechGateway(ctx: GatewayContext): GatewayContribution {
  const core = speechCore({ names: () => Object.keys(process.env), secret: name => ctx.secret(name), settings: ctx.settings, operatorDir: ctx.operatorDir, log: ctx.log })
  void reportEngines(core, ctx.log)
  const handle = protocolHandler(core)
  return {
    routes: {
      [`${PROTOCOL_PATH}/*`]: { handle: (request, route) => handle(request, route.rest) },
      [`${CONSENT_PATH}/*`]: { service: true, handle: (request, route) => consentRoute(request, route.rest, (engine, voice, record) => core.registerConsent(engine, voice, record)) },
    },
  }
}
