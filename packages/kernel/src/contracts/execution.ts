import type { Logger, Unsubscribe } from '../contracts.ts'
import { defineService } from './service.ts'

export interface RunRequest {
  lang: string
  code: string
  args?: Record<string, string>
  stdin?: string
  timeoutMs?: number
  files?: Record<string, string>
  executor?: string
  session?: string
}

export type RunOutput =
  | { output_type: 'stream', name: 'stdout' | 'stderr', text: string }
  | { output_type: 'display_data' | 'execute_result', data: Record<string, unknown>, metadata?: Record<string, unknown> }
  | { output_type: 'error', ename: string, evalue: string, traceback: string[] }

export interface RunResult {
  ok: boolean
  stdout: string
  stderr: string
  exitCode: number | null
  durationMs: number
  timedOut: boolean
  source: 'live' | 'recorded'
  executorId: string
  outputs?: RunOutput[]
}

export interface RunContext {
  env: Readonly<Record<string, string>>
  sandbox?: ProcessSandbox
  lang?: string
}

export interface SandboxRun {
  argv: string[]
  files: Record<string, string | Uint8Array>
  collect: string[]
  env: Readonly<Record<string, string>>
  read: string[]
  timeoutMs: number
  signal?: AbortSignal
}

export interface SandboxResult {
  exitCode: number | null
  stdout: string
  stderr: string
  files: Record<string, Uint8Array>
}

export interface ProcessSandbox {
  readonly kind: string
  run(request: SandboxRun): Promise<SandboxResult>
}

export const PROCESS_SANDBOX = defineService<ProcessSandbox>('presmium.processSandbox')

export interface Executor {
  readonly id: string
  readonly runsIn?: 'browser' | 'machine'
  supports(lang: string): boolean
  run(request: RunRequest, signal?: AbortSignal, ctx?: RunContext): Promise<RunResult>
  fingerprint?(lang: string): string | Promise<string>
  revision?(lang: string): string | Promise<string>
  endSession?(session: string): Promise<void>
  params?(lang: string): ParamsDisplay | undefined
}

export interface ParamsDisplay {
  labels: Record<string, string>
  fields?: string[]
  summary?(args: Record<string, string>): string
}

export interface ExecutorRouter extends Executor {
  register(executor: Executor, priority?: number): Unsubscribe
  list(): Executor[]
}

export const EXECUTOR = defineService<ExecutorRouter>('presmium.executor')

export type EnvironmentAuth = 'none' | 'env' | 'proxy' | 'prompt' | 'hub'

export interface EnvironmentSpec {
  kind: string
  url?: string
  kernel?: string
  languages?: string[]
  auth?: EnvironmentAuth
  image?: string
  path?: string
  [option: string]: unknown
}

export interface ExecuteConfig {
  env?: string
  environments?: Record<string, EnvironmentSpec>
  rerun?: 'environment'
}

export function environmentExecutor(name: string): string {
  return `presmium.env.${name}`
}

export interface EnvironmentContext {
  deckDir: string
  workspaceRoot: string
  secret(name: string): string | undefined
  log: Logger
}

export interface EnvironmentProvider {
  create(name: string, spec: EnvironmentSpec, ctx: EnvironmentContext): Executor | Promise<Executor>
  probe?(name: string, spec: EnvironmentSpec, ctx: EnvironmentContext): Promise<string | undefined>
}
