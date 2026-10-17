import { useServer } from '@presmium/host'
import { errorMessage, languageId } from '@presmium/kernel'
import type { Executor, RunRequest, RunResult } from '@presmium/kernel'
import { CONTAINER_EXECUTOR_ID, disconnected, EXEC_LOCAL_ID, failedContainerRun } from '../domain/index.ts'
import type { LocalEnvService, LocalEnvStatus, ReplicateRequest } from '../domain/index.ts'
import { messages } from './messages.ts'

export interface LocalEnv extends LocalEnvService {
  /** The container executor (P-22) for the `executor` router. */
  readonly executor: Executor
}

/** A POST to a route of the plugin (`useServer().fetch` sends the page's language); its error as an exception. */
async function post(path: string, body: unknown, signal?: AbortSignal): Promise<Response> {
  const res = await useServer().fetch(EXEC_LOCAL_ID, path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })
  if (!res.ok) {
    const error = await res.json().then((json: { error?: string }) => json.error, () => undefined)
    throw new Error(error ?? messages().requestFailed(res.status))
  }
  return res
}

async function probe(): Promise<LocalEnvStatus> {
  // A static build has no Presmium server behind it.
  if (!useServer().available) return disconnected('devServerOnly')
  try {
    const res = await useServer().fetch(EXEC_LOCAL_ID, 'status')
    if (res.status === 403) return disconnected('notAllowed')
    if (!res.ok || !res.headers.get('content-type')?.includes('application/json')) return disconnected('noEndpoints')
    return await res.json() as LocalEnvStatus
  } catch {
    return disconnected('unreachable')
  }
}

/** Client of the plugin's routes (see src/node/server.ts). */
export function createLocalEnv(): LocalEnv {
  let status: Promise<LocalEnvStatus> | undefined
  let languages: string[] = []
  const service: LocalEnvService = {
    status() {
      status ??= probe().then((result) => {
        languages = result.languages
        return result
      })
      return status
    },
    async run(request: RunRequest, signal?: AbortSignal): Promise<RunResult> {
      try {
        return await (await post('run', request, signal)).json() as RunResult
      } catch (error) {
        return failedContainerRun(errorMessage(error))
      }
    },
    async replicate(request: ReplicateRequest): Promise<Blob> {
      return (await post('replicate', request)).blob()
    },
  }
  const executor: Executor = {
    id: CONTAINER_EXECUTOR_ID,
    // Languages are known once the status probe has answered; until then the router falls back.
    supports: lang => languages.includes(languageId(lang)),
    run: (request, signal) => service.run(request, signal),
  }
  return { ...service, executor }
}
