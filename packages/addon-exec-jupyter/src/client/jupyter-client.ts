import { environmentExecutor, isRecord } from '@lincyaw/kernel'
import type { EnvironmentSpec, Executor, RunResult } from '@lincyaw/kernel'
import { currentLocale, useServer } from '@lincyaw/host'
import type { ServerConnection } from '@jupyterlab/services'
import { authOf, baseUrl, cleanupPath, EXEC_JUPYTER_ID, jupyterKernelName, languagesOf, originOf, proxyPath } from '../domain/index.ts'
import type { JupyterTerminals, TerminalSession } from '../domain/index.ts'
import { createJupyterKernels } from '../shared/kernels.ts'
import type { JupyterKernels } from '../shared/kernels.ts'
import { loadJupyterServices } from '../shared/load-services.ts'
import { isRefused } from '../shared/refusal.ts'
import { openTerminal } from '../shared/terminals.ts'
import { messages } from './messages.ts'
import { forgetJupyterToken, jupyterTokenFor } from './jupyter-token.ts'

/** The browser's side of the deck's Jupyter environments: an executor for each, and their terminals. */
export interface JupyterClient {
  terminals: JupyterTerminals
  executors: Executor[]
  dispose(): Promise<void>
}

let documentName: Promise<string> | undefined
function servedDocument(): Promise<string> {
  documentName ??= useServer().fetch('presmium.server', 'hello')
    .then(response => (response.ok ? response.json() : {}))
    .then((hello: unknown) => (isRecord(hello) && typeof hello.document === 'string' ? hello.document : ''))
    .catch(() => '')
  return documentName
}

async function hubUser(url: string, accessToken: string): Promise<string> {
  const origin = originOf(url.replace('{user}', 'x'))!
  const response = await fetch(`${origin}/hub/api/user`, { headers: { Authorization: `token ${accessToken}` } })
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

export function createJupyterClient(environments: Record<string, EnvironmentSpec>): JupyterClient {
  const settings = new Map<string, Promise<ServerConnection.ISettings>>()
  const proxyDocuments = new Map<string, string>()
  let disposing: Promise<void> | undefined

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
    const { ServerConnection } = await loadJupyterServices()
    if (authOf(spec) === 'proxy') {
      const document = await servedDocument()
      proxyDocuments.set(name, document)
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
    const accessToken = await jupyterTokenFor(name, originOf(url.replace('{user}', 'x'))!)
    if (!accessToken) throw new Error(messages().noToken(name))
    let resolved: string
    try {
      resolved = url.includes('{user}') ? url.replace('{user}', await hubUser(url, accessToken)) : url
    } catch (error) {
      forget(name)
      throw error
    }
    return ServerConnection.makeSettings({
      baseUrl: baseUrl(resolved), token: accessToken, appendToken: true,
      fetch: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, init).catch((error: unknown) => {
        // Jupyter may omit CORS headers on auth failures, hiding the HTTP status.
        // Let the next attempt ask again instead of retaining an unusable token.
        forget(name)
        throw error
      }),
    })
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
    forgetJupyterToken(name)
  }

  const terminals = new Set<TerminalSession>()
  const kernelPools: JupyterKernels[] = []
  const executors = Object.entries(environments).map(([name, spec]): Executor => {
    const kernels = createJupyterKernels({
      executorId: environmentExecutor(name),
      kernelName: jupyterKernelName(spec),
      languages: languagesOf(spec),
      settings: () => settingsFor(name),
      ...(authOf(spec) === 'proxy' ? {
        shutdown: (kernel: string, directory: string) => {
          const request = fetch(`/__presmium/${EXEC_JUPYTER_ID}/${cleanupPath(name)}`, {
            method: 'POST',
            keepalive: true,
            headers: { 'Content-Type': 'application/json', 'Presmium-Document': encodeURIComponent(proxyDocuments.get(name) ?? '') },
            body: JSON.stringify({ kernel, directory }),
          })
          return request.then(async response => {
            if (!response.ok) throw new Error(`Jupyter cleanup failed (${response.status}): ${await response.text()}`)
          })
        },
      } : {}),
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
    kernelPools.push(kernels)
    return {
      id: environmentExecutor(name),
      supports: lang => kernels.supports(lang),
      run: async (request, signal) => sanitized(await kernels.run(request, signal)),
      endSession: session => kernels.endSession(session),
    }
  })

  const dispose = (): Promise<void> => {
    if (disposing) return disposing
    window.removeEventListener('pagehide', leave)
    // These calls must run before the first await, independently of host disposal order.
    const cleanup = kernelPools.map(kernels => kernels.dispose())
    terminals.forEach(session => session.abandon())
    terminals.clear()
    settings.clear()
    disposing = Promise.all(cleanup).then(() => undefined)
    return disposing
  }
  const leave = () => void dispose().catch(error => console.error('[presmium] Jupyter cleanup failed', error))
  window.addEventListener('pagehide', leave)

  return {
    executors,
    terminals: {
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
          if (isRefused(error)) {
            forget(name)
            throw new Error(messages().refused(name))
          }
          throw error
        }
      },
    },
    dispose,
  }
}
