import { defineService } from '@presmium/kernel/contracts'
import type { RunRequest, RunResult } from '@presmium/kernel/contracts'

/** Dev-server endpoints of the local environment (K-09 write access goes through here). */
export const ENDPOINT = '/__presmium/exec-local'

export const CONTAINER_EXECUTOR_ID = 'presmium.container'

export interface LocalEnvStatus {
  /** False outside the dev server: in a built deck or the web form. */
  connected: boolean
  /** The Docker daemon answers. */
  docker: boolean
  /** devcontainer definition relative to the workspace, or null when there is none. */
  devcontainer: string | null
  /** The workspace is inside a git repository with at least one commit. */
  git: boolean
  /** Languages the container executor runs. */
  languages: string[]
  /** Why the environment is (partly) unavailable. */
  reason?: string
}

/** P-25: commit edited code to a new branch; the current branch and the working tree stay as they are. */
export interface CommitRequest {
  /** Path relative to the workspace. */
  file: string
  /** New file content; omitted to commit the file as it is in the working tree. */
  content?: string
  /** Defaults to `presmium/edit-<timestamp>`; must not exist yet. */
  branch?: string
  message?: string
}

export interface CommitResult {
  branch: string
  commit: string
  /** Commit the new branch starts from (HEAD of the current branch). */
  base: string
  /** Current branch, unchanged by the commit. */
  baseBranch: string
  /** Committed path relative to the repository root. */
  file: string
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
  /** Runs code in the devcontainer image; `args` become environment variables. */
  run(request: RunRequest, signal?: AbortSignal): Promise<RunResult>
  commit(request: CommitRequest): Promise<CommitResult>
  replicate(request: ReplicateRequest): Promise<Blob>
}

export const LOCAL_ENV = defineService<LocalEnvService>('presmium.localEnv')

/** The status of a view that has no dev server behind it. */
export function disconnected(reason: string): LocalEnvStatus {
  return { connected: false, docker: false, devcontainer: null, git: false, languages: [], reason }
}

/** A failed run that never reached the program, e.g. Docker is missing. */
export function failedRun(message: string, durationMs = 0): RunResult {
  return { ok: false, stdout: '', stderr: message, exitCode: null, durationMs, timedOut: false, source: 'live', executorId: CONTAINER_EXECUTOR_ID }
}
