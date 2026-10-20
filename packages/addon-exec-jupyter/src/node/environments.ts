import { createHash } from 'node:crypto'
import { environmentExecutor } from '@lincyaw/kernel'
import type { EnvironmentContext, EnvironmentProvider, EnvironmentSpec, Executor } from '@lincyaw/kernel'
import { kernelOf, languagesOf, operatorConnection } from '../domain/index.ts'
import { createKernels } from '../jupyter/kernels.ts'
import type { Kernels, KernelsText } from '../jupyter/kernels.ts'
import { nodeSettings } from './connection.ts'

const declared = new Map<string, Map<string, EnvironmentSpec>>()

export function declaredEnvironments(deckDir: string): Map<string, EnvironmentSpec> {
  return declared.get(deckDir) ?? new Map()
}

const FINGERPRINT_TTL_MS = 60_000

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

export function createJupyterExecutor(name: string, spec: EnvironmentSpec, ctx: EnvironmentContext): Executor {
  const id = environmentExecutor(name)
  const kernel = kernelOf(spec)
  const languages = languagesOf(spec)
  let kernels: Kernels | undefined
  const pool = (): Kernels => {
    if (kernels) return kernels
    const resolved = operatorConnection(name, spec, { secret: ctx.secret })
    return kernels = createKernels({
      executorId: id,
      kernel,
      languages,
      settings: () => 'connection' in resolved
        ? nodeSettings(resolved.connection)
        : Promise.reject(new Error(`environment "${name}": ${'unavailable' in resolved ? resolved.unavailable : resolved.mismatch}`)),
      text: text(`environment "${name}": `, () => ('connection' in resolved ? resolved.connection.url : '')),
    })
  }
  let fingerprint: { at: number, value: Promise<string> } | undefined

  return {
    id,
    supports: lang => pool().supports(lang),
    run: (request, signal) => pool().run(request, signal),
    async endSession(session) {
      await kernels?.endSession(session)
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
    const resolved = operatorConnection(name, spec, { secret: ctx.secret })
    if ('mismatch' in resolved) throw new Error(resolved.mismatch)
    return createJupyterExecutor(name, spec, ctx)
  },
  async probe(name, spec, ctx) {
    const resolved = operatorConnection(name, spec, { secret: ctx.secret })
    if (!('connection' in resolved)) return 'unavailable' in resolved ? resolved.unavailable : resolved.mismatch
    const { connection } = resolved
    const kernels = createKernels({ executorId: environmentExecutor(name), kernel: kernelOf(spec), settings: () => nodeSettings(connection), text: text('', () => connection.url) })
    return kernels.probe()
  },
}
