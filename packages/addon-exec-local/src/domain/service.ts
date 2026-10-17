import { defineService, failedRun } from '@presmium/kernel'
import type { RunRequest, RunResult } from '@presmium/kernel'

export const CONTAINER_EXECUTOR_ID = 'presmium.container'

/**
 * Why a view has no local environment; the client says it in the page's
 * language. `devServerOnly`: no Presmium server serves the page (a static
 * build); `notAllowed`: the member is no editor.
 */
export type DisconnectedReason = 'devServerOnly' | 'noEndpoints' | 'notAllowed' | 'unreachable' | 'pluginOff'

export interface LocalEnvStatus {
  /** False where no Presmium server serves the page: a static build. */
  connected: boolean
  /** The Docker daemon answers. */
  docker: boolean
  /** devcontainer definition relative to the workspace, or null when there is none. */
  devcontainer: string | null
  /** Languages the container executor runs. */
  languages: string[]
  /** Why a view is not connected; a connected view tells what is missing from the flags above. */
  reason?: DisconnectedReason
}

/** P-26: the snippet and the devcontainer definition as a zip archive. */
export interface ReplicateRequest {
  /** Path of the snippet relative to the workspace. */
  file: string
  content: string
  lang?: string
}

export interface LocalEnvService {
  status(): Promise<LocalEnvStatus>
  /**
   * Runs code in a fresh container of the devcontainer image, as the
   * container executor does: the request's files are in the working
   * directory, its stdin is the program's; Python gets the parameters as
   * variables, other runners as environment variables. The server asks for
   * an `operate` approval first.
   */
  run(request: RunRequest, signal?: AbortSignal): Promise<RunResult>
  replicate(request: ReplicateRequest): Promise<Blob>
}

export const LOCAL_ENV = defineService<LocalEnvService>('presmium.localEnv')

/** The status of a view that has no local environment. */
export function disconnected(reason: DisconnectedReason): LocalEnvStatus {
  return { connected: false, docker: false, devcontainer: null, languages: [], reason }
}

/** A failed run of the container executor that never reached the program, e.g. Docker is missing. */
export function failedContainerRun(message: string, durationMs = 0): RunResult {
  return failedRun(CONTAINER_EXECUTOR_ID, message, durationMs)
}
