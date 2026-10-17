/**
 * The agent runtime this process registers (`AGENT_RUNTIME`, D11, P-111):
 * the operator's choice (`runtimeChoice`), asked again whenever it is read,
 * so the model settings saved in the page apply to the next session without
 * a restart: a replacement runtime, or the bundled DeepSeek Harness with the
 * model access of the environment or of the page; none without either (its
 * `provider` is undefined, it starts nothing, and the server says why,
 * ./server.ts). When the process starts, the assistant says on its log
 * whether it is available and with what, or which settings it misses.
 */
import { AGENT_RUNTIME, errorMessage } from '@presmium/kernel'
import type { AgentRuntime, AgentSession, AgentSessionOptions, NodeServiceContext, ServiceToken } from '@presmium/kernel'
import { choiceProvider, runtimeChoice } from '../domain/index.ts'
import type { RuntimeChoice } from '../domain/index.ts'
import { dshArgs, dshBin, dshVersion, localEnv, replacementEnv } from './launch.ts'
import { readModelSettings, settingsFile } from './model-settings.ts'
import { AcpRuntime } from './runtime.ts'

/** The operator's choice now: the environment, the workspace's settings, then the page's saved model settings. */
export function currentChoice(ctx: Pick<NodeServiceContext, 'secret' | 'settings'>): RuntimeChoice {
  const secret = (name: string) => ctx.secret(name)
  return runtimeChoice(secret, ctx.settings, readModelSettings(settingsFile(secret)))
}

/** The bundled DeepSeek Harness is not installed: what the choice says then. */
const NOT_INSTALLED = 'the bundled DeepSeek Harness is not installed'

/** `AGENT_RUNTIME` over the operator's current choice: a new ACP runtime (and runtime name) whenever the choice changed. */
export class AssistantRuntime implements AgentRuntime {
  readonly #ctx: NodeServiceContext
  readonly #env: NodeJS.ProcessEnv
  #current?: { key: string, runtime: AcpRuntime }

  constructor(ctx: NodeServiceContext, env: NodeJS.ProcessEnv = process.env) {
    this.#ctx = ctx
    this.#env = env
  }

  get provider(): string | undefined {
    return this.#runtime()?.provider
  }

  get runtime(): string | undefined {
    return this.#runtime()?.runtime
  }

  open(options: AgentSessionOptions): Promise<AgentSession> {
    const runtime = this.#runtime()
    if (!runtime) {
      const choice = currentChoice(this.#ctx)
      return Promise.reject(new Error(choice.kind === 'none' ? choice.missing : NOT_INSTALLED))
    }
    return runtime.open(options)
  }

  #runtime(): AcpRuntime | undefined {
    const choice = currentChoice(this.#ctx)
    if (choice.kind === 'none' || (choice.kind === 'bundled' && !dshBin())) return (this.#current = undefined)
    const key = JSON.stringify(choice)
    if (this.#current?.key === key) return this.#current.runtime
    const ctx = this.#ctx
    const common = { provider: choiceProvider(choice)!, lang: ctx.lang, ...ctx.operatorDir ? { operatorDir: ctx.operatorDir } : {}, log: ctx.log }
    const env = this.#env
    const runtime = choice.kind === 'replacement'
      ? new AcpRuntime({ ...common, launch: async () => ({ command: choice.command[0]!, args: choice.command.slice(1), env: replacementEnv(env) }) })
      : new AcpRuntime({ ...common, launch: async () => ({ command: process.execPath, args: dshArgs(dshBin()!), env: localEnv(env, choice.access) }) })
    this.#current = { key, runtime }
    return runtime
  }
}

/** What the assistant says on the log when the process starts: once. */
let announced = false

/** The start-up line: available with the provider, the runtime and where they come from; or what to set. */
export function statusLine(choice: RuntimeChoice): string {
  if (choice.kind === 'none') return `the assistant is unavailable: ${choice.missing}`
  if (choice.kind === 'bundled' && !dshBin()) return `the assistant is unavailable: ${NOT_INSTALLED}`
  const runtime = choice.kind === 'replacement' ? `the replacement runtime ${choice.command[0]}` : `the bundled DeepSeek Harness ${dshVersion() ?? ''}`.trim()
  const from = choice.source === 'page' ? 'the model settings saved in the page' : choice.from.join(', ')
  return `the assistant is available: provider ${choiceProvider(choice)}, ${runtime} (from ${from})${choice.kind === 'bundled' && choice.problem ? `; ${choice.problem}` : ''}`
}

export function assistantServices(ctx: NodeServiceContext): [ServiceToken<unknown>, unknown][] {
  if (!announced) {
    announced = true
    try {
      ctx.log.info(statusLine(currentChoice(ctx)))
    } catch (error) {
      ctx.log.warn(`the assistant's settings could not be read: ${errorMessage(error)}`)
    }
  }
  return [[AGENT_RUNTIME, new AssistantRuntime(ctx)]]
}
