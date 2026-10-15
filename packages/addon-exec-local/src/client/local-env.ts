import type { Executor, RunRequest, RunResult } from '@presmium/kernel/contracts'
import { CONTAINER_EXECUTOR_ID, disconnected, ENDPOINT, failedRun, languageId } from '../domain/index.ts'
import type { CommitRequest, CommitResult, LocalEnvService, LocalEnvStatus, ReplicateRequest } from '../domain/index.ts'
import { messages } from './messages.ts'

export interface LocalEnv extends LocalEnvService {
  /** The container executor (P-22) for the `executor` router. */
  readonly executor: Executor
}

async function post(path: string, body: unknown, signal?: AbortSignal): Promise<Response> {
  const res = await fetch(`${ENDPOINT}/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
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
  // Built decks and the web form have no dev server behind them.
  if (!import.meta.env.DEV) return disconnected('devServerOnly')
  try {
    const res = await fetch(`${ENDPOINT}/status`)
    if (!res.ok || !res.headers.get('content-type')?.includes('application/json')) return disconnected('noEndpoints')
    return await res.json() as LocalEnvStatus
  }
  catch {
    return disconnected('unreachable')
  }
}

/** Client of the dev-server endpoints (see src/node/server.ts). */
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
      }
      catch (error) {
        return failedRun(error instanceof Error ? error.message : String(error))
      }
    },
    async commit(request: CommitRequest): Promise<CommitResult> {
      return await (await post('commit', request)).json() as CommitResult
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
