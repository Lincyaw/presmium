import { environmentExecutor, isRecord } from '@presmium/kernel'
import type { EnvironmentSpec, Executor, RunResult } from '@presmium/kernel'
import { currentLocale, useServer } from '@presmium/host'
import type { ServerConnection } from '@jupyterlab/services'
import { authOf, baseUrl, EXEC_JUPYTER_ID, kernelOf, languagesOf, originOf, proxyPath } from '../domain/index.ts'
import type { JupyterEnvironments } from '../domain/index.ts'
import type { TerminalSession } from '../domain/service.ts'
import { createKernels, services } from '../jupyter/kernels.ts'
import type { Kernels } from '../jupyter/kernels.ts'
import { openTerminal } from '../jupyter/terminals.ts'
import { messages } from './messages.ts'
import { forgetToken, tokenFor } from './token.ts'

export interface RemoteEnvironments {
  service: JupyterEnvironments
  executors: Executor[]
  dispose(): void
}

let documentName: Promise<string> | undefined
function servedDocument(): Promise<string> {
  documentName ??= useServer().fetch('presmium.server', 'hello')
    .then(response => (response.ok ? response.json() : {}))
    .then((hello: unknown) => (isRecord(hello) && typeof hello.document === 'string' ? hello.document : ''))
    .catch(() => '')
  return documentName
}

async function hubUser(url: string, token: string): Promise<string> {
  const origin = originOf(url.replace('{user}', 'x'))!
  const response = await fetch(`${origin}/hub/api/user`, { headers: { Authorization: `token ${token}` } })
  if (!response.ok) throw Object.assign(new Error(`${origin}/hub/api/user: ${response.status}`), { response })
  const user: unknown = await response.json()
  if (!isRecord(user) || typeof user.name !== 'string') throw new Error(`${origin}/hub/api/user: no name`)
  return encodeURIComponent(user.name)
}

const IMAGES = ['image/png', 'image/jpeg', 'image/gif']
const BASE64 = /^[A-Za-z0-9+/=\s]*$/
const badImage = (data: Record<string, unknown>) => IMAGES.some(type => data[type] !== undefined && (typeof data[type] !== 'string' || !BASE64.test(data[type])))

async function sanitized(result: RunResult): Promise<RunResult> {
  if (!result.outputs?.some(output => 'data' in output && (typeof output.data['text/html'] === 'string' || typeof output.data['image/svg+xml'] === 'string' || badImage(output.data)))) return result
  const { default: DOMPurify } = await import('dompurify')
  return {
    ...result,
    outputs: result.outputs.map((output) => {
      if (!('data' in output)) return output
      const data = { ...output.data }
      if (typeof data['text/html'] === 'string') data['text/html'] = DOMPurify.sanitize(data['text/html'])
      if (typeof data['image/svg+xml'] === 'string') data['image/svg+xml'] = DOMPurify.sanitize(data['image/svg+xml'], { USE_PROFILES: { svg: true, svgFilters: true } })
      for (const type of IMAGES) {
        if (data[type] !== undefined && (typeof data[type] !== 'string' || !BASE64.test(data[type]))) delete data[type]
      }
      return { ...output, data }
    }),
  }
}

export function createRemoteEnvironments(environments: Record<string, EnvironmentSpec>): RemoteEnvironments {
  const settings = new Map<string, Promise<ServerConnection.ISettings>>()

  const unavailable = (name: string): string | undefined => {
    const t = messages()
    const spec = environments[name]
    if (!spec) return t.unknown(name)
    const auth = authOf(spec)
    if (auth === 'env') return t.envOnly(name)
    if (auth === 'hub') return t.hubReserved(name)
    if (auth === 'proxy') return useServer().available ? undefined : t.proxyStatic(name)
    return originOf(typeof spec.url === 'string' ? spec.url.replace('{user}', 'x') : undefined) ? undefined : t.noUrl(name)
  }

  const connect = async (name: string): Promise<ServerConnection.ISettings> => {
    const reason = unavailable(name)
    if (reason) throw new Error(reason)
    const spec = environments[name]!
    const { ServerConnection } = await services()
    if (authOf(spec) === 'proxy') {
      const document = await servedDocument()
      const base = `${location.origin}/__presmium/${EXEC_JUPYTER_ID}/${proxyPath(name)}/`
      class DocumentSocket extends WebSocket {
        constructor(url: string | URL, protocols?: string | string[]) {
          const target = new URL(url)
          target.searchParams.set('document', document)
          super(target, protocols)
        }
      }
      return ServerConnection.makeSettings({
        baseUrl: base,
        wsUrl: base.replace(/^http/, 'ws'),
        token: '',
        appendToken: false,
        WebSocket: DocumentSocket,
        fetch: (input: RequestInfo | URL, init?: RequestInit) => {
          const request = new Request(input, init)
          request.headers.set('Presmium-Document', encodeURIComponent(document))
          if (!request.headers.has('Accept-Language')) request.headers.set('Accept-Language', currentLocale())
          return fetch(request)
        },
      })
    }
    const url = String(spec.url)
    if (authOf(spec) === 'none') return ServerConnection.makeSettings({ baseUrl: baseUrl(url), token: '' })
    const token = await tokenFor(name, originOf(url.replace('{user}', 'x'))!)
    if (!token) throw new Error(messages().noToken(name))
    const resolved = url.includes('{user}') ? url.replace('{user}', await hubUser(url, token)) : url
    return ServerConnection.makeSettings({ baseUrl: baseUrl(resolved), token, appendToken: true })
  }

  const settingsFor = (name: string) => {
    let known = settings.get(name)
    if (!known) {
      known = connect(name)
      settings.set(name, known)
      known.catch(() => settings.delete(name))
    }
    return known
  }

  const forget = (name: string) => {
    settings.delete(name)
    forgetToken(name)
  }

  const terminals = new Set<TerminalSession>()
  const pools: Kernels[] = []
  const executors = Object.entries(environments).map(([name, spec]): Executor => {
    const kernels = createKernels({
      executorId: environmentExecutor(name),
      kernel: kernelOf(spec),
      languages: languagesOf(spec),
      settings: () => settingsFor(name),
      refused: () => forget(name),
      text: {
        unreachable: error => messages().unreachable(name, error),
        get refused() {
          return messages().refused(name)
        },
        noKernel: (kernel, known) => messages().noKernel(name, kernel, known),
        wrongLanguage: (kernel, language, lang) => messages().wrongLanguage(name, kernel, language, lang),
        timedOut: seconds => messages().timedOut(seconds),
      },
    })
    pools.push(kernels)
    return {
      id: environmentExecutor(name),
      supports: lang => kernels.supports(lang),
      run: async (request, signal) => sanitized(await kernels.run(request, signal)),
      endSession: session => kernels.endSession(session),
    }
  })

  return {
    executors,
    service: {
      unavailable,
      async openTerminal(name, events) {
        const connection = await settingsFor(name)
        try {
          const session = await openTerminal(connection, events)
          terminals.add(session)
          return {
            ...session,
            close: () => {
              terminals.delete(session)
              return session.close()
            },
          }
        } catch (error) {
          const status = (error as { response?: { status?: number } }).response?.status
          if (status === 401 || status === 403) {
            forget(name)
            throw new Error(messages().refused(name))
          }
          throw error
        }
      },
    },
    dispose() {
      pools.forEach(kernels => kernels.dispose())
      terminals.forEach(session => session.abandon())
      terminals.clear()
      settings.clear()
    },
  }
}
