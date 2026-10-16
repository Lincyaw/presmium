/**
 * The provider of `kind: jupyter` environments (P-100, P-105): at compile
 * time each declared environment is an executor `presmium.env.<name>`
 * running in the server's kernels, connected by the credential rules of
 * `operatorConnection` (the operator's pair in LOCAL mode; the gateway, with
 * the run's or serve's gateway token, in SHARED mode). The environment
 * fingerprint is the deck's image digest, the kernel spec's hash and what
 * `kernel_info` reports. The compiler gives each declared environment to
 * `create`; they are kept by deck, for the server's proxies (./server.ts).
 */
import { createHash } from 'node:crypto'
import { environmentExecutor } from '@presmium/kernel'
import type { EnvironmentContext, EnvironmentProvider, EnvironmentSpec, Executor, GatewayAccess, RunContext } from '@presmium/kernel'
import { kernelOf, languagesOf, operatorConnection } from '../domain/index.ts'
import { createKernels } from '../jupyter/kernels.ts'
import type { Kernels, KernelsText } from '../jupyter/kernels.ts'
import { nodeSettings } from './connection.ts'

/** The `kind: jupyter` environments each deck declared, by deck directory, as the compiler last gave them. */
const declared = new Map<string, Map<string, EnvironmentSpec>>()

export function declaredEnvironments(deckDir: string): Map<string, EnvironmentSpec> {
  return declared.get(deckDir) ?? new Map()
}

/** How long a fingerprint holds before it is asked of the server again (a `presmium dev` outlives image updates). */
const FINGERPRINT_TTL_MS = 60_000

/** The reasons of failed runs (`prefix` names the environment) and of `probe` (whose caller names it). */
function text(prefix: string, url: () => string): KernelsText {
  return {
    unreachable: error => `${prefix}cannot reach ${url()}: ${error}`,
    refused: `${prefix}the server at ${url()} refused the token`,
    noKernel: (kernel, known) => `${prefix}the server has no kernel ${kernel} (it has ${known.join(', ') || 'none'})`,
    wrongLanguage: (kernel, language, lang) => `${prefix}kernel ${kernel} runs ${language}, not ${lang}`,
    timedOut: seconds => `${prefix}timed out after ${seconds} s; the kernel was interrupted`,
  }
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(',')}}`
  return JSON.stringify(value)
}

/**
 * The compile-time executor of a declared environment. One kernel pool per
 * connection: LOCAL has one; in agent-host each run may bring its own
 * gateway token (`RunContext.gateway`).
 */
export function createJupyterExecutor(name: string, spec: EnvironmentSpec, ctx: EnvironmentContext): Executor {
  const id = environmentExecutor(name)
  const kernel = kernelOf(spec)
  const languages = languagesOf(spec)
  const pools = new Map<string, Kernels>()
  const pool = (gateway?: GatewayAccess): Kernels => {
    const resolved = operatorConnection(name, spec, { secret: ctx.secret, gateway: gateway ?? ctx.gateway })
    const key = 'connection' in resolved ? JSON.stringify(resolved.connection) : ''
    let kernels = pools.get(key)
    if (!kernels) {
      kernels = createKernels({
        executorId: id,
        kernel,
        languages,
        settings: () => 'connection' in resolved
          ? nodeSettings(resolved.connection)
          : Promise.reject(new Error(`environment "${name}": ${'unavailable' in resolved ? resolved.unavailable : resolved.mismatch}`)),
        text: text(`environment "${name}": `, () => ('connection' in resolved ? resolved.connection.url : '')),
      })
      pools.set(key, kernels)
    }
    return kernels
  }
  let fingerprint: { at: number, value: Promise<string> } | undefined

  return {
    id,
    supports: lang => pool().supports(lang),
    run: (request, signal, run?: RunContext) => pool(run?.gateway).run(request, signal),
    async endSession(session) {
      await Promise.all([...pools.values()].map(kernels => kernels.endSession(session)))
    },
    fingerprint() {
      if (!fingerprint || Date.now() - fingerprint.at > FINGERPRINT_TTL_MS) {
        const value = pool().describe().then((described) => {
          const specHash = createHash('sha256').update(canonical(described.spec)).digest('hex').slice(0, 16)
          const image = typeof spec.image === 'string' && spec.image ? spec.image : 'unpinned'
          return `jupyter image=${image} kernelspec=${kernel}:sha256:${specHash} kernel=${described.implementation} ${described.implementationVersion} ${described.language} ${described.languageVersion}`
        })
        fingerprint = { at: Date.now(), value }
        value.catch(() => {
          if (fingerprint?.value === value) fingerprint = undefined
        })
      }
      return fingerprint.value
    },
  }
}

export const jupyterProvider: EnvironmentProvider = {
  create(name, spec, ctx) {
    let known = declared.get(ctx.deckDir)
    if (!known) declared.set(ctx.deckDir, known = new Map())
    known.set(name, spec)
    const resolved = operatorConnection(name, spec, { secret: ctx.secret, gateway: ctx.gateway })
    // A deck that sends the operator's token elsewhere is an error; its blocks show their recordings.
    if ('mismatch' in resolved) throw new Error(resolved.mismatch)
    return createJupyterExecutor(name, spec, ctx)
  },
  async probe(name, spec, ctx) {
    const resolved = operatorConnection(name, spec, { secret: ctx.secret, gateway: ctx.gateway })
    if (!('connection' in resolved)) return 'unavailable' in resolved ? resolved.unavailable : resolved.mismatch
    const { connection } = resolved
    const kernels = createKernels({ executorId: environmentExecutor(name), kernel: kernelOf(spec), settings: () => nodeSettings(connection), text: text('', () => connection.url) })
    return kernels.probe()
  },
}
