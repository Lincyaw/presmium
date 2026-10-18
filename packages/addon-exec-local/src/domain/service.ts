import { defineService, failedRun } from '@presmium/kernel'
import type { RunRequest, RunResult } from '@presmium/kernel'

export const CONTAINER_EXECUTOR_ID = 'presmium.container'

export type DisconnectedReason = 'devServerOnly' | 'noEndpoints' | 'notAllowed' | 'unreachable' | 'pluginOff'

export interface LocalEnvStatus {
  connected: boolean
  docker: boolean
  devcontainer: string | null
  languages: string[]
  reason?: DisconnectedReason
}

export interface ReplicateRequest {
  file: string
  content: string
  lang?: string
}

export interface LocalEnvService {
  status(): Promise<LocalEnvStatus>
  run(request: RunRequest, signal?: AbortSignal): Promise<RunResult>
  replicate(request: ReplicateRequest): Promise<Blob>
}

export const LOCAL_ENV = defineService<LocalEnvService>('presmium.localEnv')

export function disconnected(reason: DisconnectedReason): LocalEnvStatus {
  return { connected: false, docker: false, devcontainer: null, languages: [], reason }
}

export function failedContainerRun(message: string, durationMs = 0): RunResult {
  return failedRun(CONTAINER_EXECUTOR_ID, message, durationMs)
}
