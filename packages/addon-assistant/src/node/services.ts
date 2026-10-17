/**
 * The agent runtime this process registers (`AGENT_RUNTIME`, D11): the
 * operator's choice (`runtimeChoice`): a replacement runtime, or the bundled
 * DeepSeek Harness with the process's model access; none without either
 * (nothing starts; the server says why, ./server.ts).
 */
import { AGENT_RUNTIME } from '@presmium/kernel'
import type { AgentRuntime, NodeServiceContext, ServiceToken } from '@presmium/kernel'
import { runtimeChoice } from '../domain/index.ts'
import { dshArgs, dshBin, localEnv, replacementEnv, templateOf } from './launch.ts'
import { AcpRuntime } from './runtime.ts'

export function agentRuntime(ctx: NodeServiceContext, env: NodeJS.ProcessEnv = process.env): AgentRuntime | undefined {
  const common = { lang: ctx.lang, ...ctx.operatorDir ? { operatorDir: ctx.operatorDir } : {}, log: ctx.log }
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
      return { command: process.execPath, args: dshArgs(bin, templateOf(options.mode)), env: localEnv(env, choice.access) }
    },
  })
}

export function assistantServices(ctx: NodeServiceContext): [ServiceToken<unknown>, unknown][] {
  const runtime = agentRuntime(ctx)
  return runtime ? [[AGENT_RUNTIME, runtime]] : []
}
