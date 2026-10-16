/**
 * The agent runtime this process registers (`AGENT_RUNTIME`, D11, D13):
 *
 * - LOCAL: the operator's choice (`runtimeChoice`): a replacement runtime, or
 *   the bundled DeepSeek Harness with the process's model access; none
 *   without either (nothing starts; the server says why, ./server.ts).
 * - SHARED, agent-host (no gateway access in the context): the bundled
 *   DeepSeek Harness only, one per session, whose model access is the
 *   session's (`AgentSessionOptions.model`: the gateway's model proxy and a
 *   scoped token, through ./relay.ts); its provider is the gateway's, which
 *   serve asks the gateway for.
 * - SHARED, serve: nothing; the workspace registers agent-host's client
 *   there (`AGENT_RUNTIME` is the host's).
 */
import { AGENT_RUNTIME } from '@presmium/kernel'
import type { AgentRuntime, NodeServiceContext, ServiceToken } from '@presmium/kernel'
import { runtimeChoice } from '../domain/index.ts'
import { dshArgs, dshBin, localEnv, replacementEnv, sharedEnv, templateOf } from './launch.ts'
import { modelRelay } from './relay.ts'
import { AcpRuntime } from './runtime.ts'

/** The provider agent-host's runtime names: the real one is the gateway's (`GET presmium.assistant/info`). */
export const GATEWAY_PROVIDER = 'gateway'

export function agentRuntime(ctx: NodeServiceContext, env: NodeJS.ProcessEnv = process.env): AgentRuntime | undefined {
  const common = { lang: ctx.lang, ...ctx.operatorDir ? { operatorDir: ctx.operatorDir } : {}, log: ctx.log }
  if (ctx.trust === 'shared') {
    const bin = ctx.gateway ? undefined : dshBin()
    if (!bin) return undefined
    return new AcpRuntime({
      ...common,
      provider: GATEWAY_PROVIDER,
      async launch(options) {
        if (!options.model) throw new Error('a SHARED session needs its model access (AgentSessionOptions.model)')
        const relay = await modelRelay(options.model)
        return { command: process.execPath, args: dshArgs(bin, templateOf(options.mode, 'shared')), env: sharedEnv(env, { url: relay.url, token: options.model.token }), close: () => relay.close() }
      },
    })
  }
  const choice = runtimeChoice(name => ctx.secret(name), ctx.settings)
  if (choice.kind === 'none') return undefined
  if (choice.kind === 'replacement') {
    return new AcpRuntime({
      ...common,
      provider: choice.provider,
      async launch(options) {
        const [command, ...args] = options.mode === 'tutor' ? choice.tutor : choice.author
        return { command: command!, args, env: replacementEnv(env) }
      },
    })
  }
  const bin = dshBin()
  if (!bin) return undefined
  return new AcpRuntime({
    ...common,
    provider: choice.access.provider,
    async launch(options) {
      return { command: process.execPath, args: dshArgs(bin, templateOf(options.mode, 'local')), env: localEnv(env, choice.access) }
    },
  })
}

export function assistantServices(ctx: NodeServiceContext): [ServiceToken<unknown>, unknown][] {
  const runtime = agentRuntime(ctx)
  return runtime ? [[AGENT_RUNTIME, runtime]] : []
}
