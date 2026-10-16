/**
 * The assistant's part of the gateway (SHARED, D13, docs/architecture.md
 * 10.9), the one process with the model's credentials:
 *
 * - `info`: the model's provider (`DeepSeek` for `DEEPSEEK_API_KEY`, or
 *   `PRESMIUM_MODEL_PROVIDER`); 404 without model access.
 * - `model/*`: the model proxy, Messages-compatible, which DeepSeek Harness
 *   in agent-host reaches with a session's scoped token (the gateway checked
 *   it): `POST model/v1/messages` goes to the operator's model address only,
 *   with the operator's key in place of the caller's credentials.
 */
import { errorMessage } from '@presmium/kernel'
import type { GatewayContext, GatewayContribution } from '@presmium/kernel'
import { modelAccess, modelTarget } from '../domain/index.ts'

/** Request headers a Messages request keeps on its way; the credentials are the operator's. */
const KEPT = ['content-type', 'accept', 'anthropic-version', 'anthropic-beta']

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } })

export function assistantGateway(ctx: GatewayContext): GatewayContribution {
  const { access, problem } = modelAccess(ctx.secret)
  if (problem) ctx.log.warn(problem)
  if (access) ctx.log.info(`model proxy: ${access.provider}`)
  else ctx.log.info('no model access (DEEPSEEK_API_KEY, or PRESMIUM_MODEL_URL, PRESMIUM_MODEL_KEY and PRESMIUM_MODEL_PROVIDER): the assistant is unavailable')
  return {
    routes: {
      'info': {
        handle: () => (access ? json({ provider: access.provider }) : json({ error: 'the gateway has no model access' }, 404)),
      },
      'model/*': {
        async handle(request, { rest }) {
          if (!access) return json({ error: 'the gateway has no model access' }, 404)
          if (request.method !== 'POST' || !/^v1\/messages(?:\/count_tokens)?$/.test(rest)) return json({ error: 'POST v1/messages' }, 404)
          const headers: Record<string, string> = { 'x-api-key': access.key, 'authorization': `Bearer ${access.key}` }
          for (const name of KEPT) {
            const value = request.headers.get(name)
            if (value) headers[name] = value
          }
          try {
            const upstream = await fetch(modelTarget(access, rest), { method: 'POST', headers, body: await request.arrayBuffer(), redirect: 'error', signal: request.signal })
            const type = upstream.headers.get('content-type')
            return new Response(upstream.body, { status: upstream.status, headers: { ...type ? { 'Content-Type': type } : {}, 'Cache-Control': 'no-store' } })
          } catch (error) {
            return json({ error: `the model service did not answer: ${errorMessage(error)}` }, 502)
          }
        },
      },
    },
  }
}
