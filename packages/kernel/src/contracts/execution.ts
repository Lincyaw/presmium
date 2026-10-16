/**
 * Code execution (docs/architecture.md 4.5, 4.6): requests, results and rich
 * outputs, executors and their router, the context of a compile-time run,
 * the process sandbox, and named environments (P-100 to P-102).
 */
import type { Logger, Unsubscribe } from '../contracts.ts'
import type { GatewayAccess } from './server.ts'
import { defineService } from './service.ts'

export interface RunRequest {
  lang: string
  code: string
  /** Named parameters injected by the runtime (e.g. as variables). */
  args?: Record<string, string>
  stdin?: string
  timeoutMs?: number
  /** Extra files available to the program, path -> content. */
  files?: Record<string, string>
  /**
   * The executor to run it (the IR's `RunSpec.executor`; `:env:` compiles to
   * `environmentExecutor(name)`). The router gives the request to this
   * executor only; when it is not registered or does not support the
   * language, the result is a failed run (`failedRun`) and the recorded
   * output stands in (P-24), no other executor is tried. Omitted: chosen by
   * language and priority.
   */
  executor?: string
  /** Execution session: runs of one session share interpreter state, in request order; executors without sessions ignore it. */
  session?: string
}

/** A cell output of nbformat v4 (the structure copied; the kernel does not depend on nbformat). */
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
  /** 'recorded' when the output is a fallback recording. */
  source: 'live' | 'recorded'
  executorId: string
  /** Rich outputs in the order produced; `stdout` and `stderr` stay the text streams, for users that read text only. */
  outputs?: RunOutput[]
}

/** The context of one compile-time run, which the compiler gives; runs in the browser and outside the compiler have none. */
export interface RunContext {
  /**
   * Every environment variable the executed code may get (docs/architecture.md
   * 4.6, section 11). Executors do not read `process.env`: a child process
   * gets this environment; the `docker` and devcontainer command lines get it
   * plus the Docker client's variables (10.6); containers, WASI programs, the
   * Chromium of WebGPU recordings and kernels get at most its variables.
   */
  env: Readonly<Record<string, string>>
  /**
   * The process sandbox, when the Node services hold `PROCESS_SANDBOX`.
   * Executors that start a child process (the exec plugin's `python3`,
   * `node`) run the code through it, inputs and results in files of the run
   * directory; without it they start the child process as before (10.6).
   */
  sandbox?: ProcessSandbox
  /**
   * SHARED mode: the gateway access agent-host gives this run (a scoped token
   * serve issued, 4.7): executors that need third-party credentials (remote
   * environments) connect through the gateway. Omitted in LOCAL mode, where
   * credentials come from `EnvironmentContext.secret`.
   */
  gateway?: GatewayAccess
  /**
   * The deck's language (its headmatter's `lang`, `zh-CN` when it has none).
   * Text an executor writes into a recording itself, e.g. the summary of a
   * WebGPU run, is in it (`deckLocale`), as other text written into the
   * build output at compile time is (docs/architecture.md 5.7).
   */
  lang?: string
}

/** One run in the process sandbox (D13): the command runs in a new run directory, inputs and results are files in it. */
export interface SandboxRun {
  /** Command and arguments; the command is looked up in `env.PATH`. */
  argv: string[]
  /** Files written to the run directory, by relative path; it is the command's working directory and the only one it can write. */
  files: Record<string, string | Uint8Array>
  /** Files read back from the run directory when the run ends (relative paths). */
  collect: string[]
  /** Every environment variable the command gets (`RunContext.env`); the helper that starts the sandbox has only `PATH`, `HOME` and `DELTABOX_STATE_DIR` (10.6). */
  env: Readonly<Record<string, string>>
  /** Absolute paths outside the run directory it may read, e.g. the interpreter's installation and the deck directory; all read-only. */
  read: string[]
  timeoutMs: number
  signal?: AbortSignal
}

export interface SandboxResult {
  /** null on a timeout or an abort. */
  exitCode: number | null
  stdout: string
  stderr: string
  /** The files of `collect` that exist when the run ends. */
  files: Record<string, Uint8Array>
}

export interface ProcessSandbox {
  /** How it isolates, written to build reports and diagnostics, e.g. `deltabox cbcow-through`. */
  readonly kind: string
  /**
   * Runs in isolation: all network denied; no process outside the sandbox
   * visible (their `/proc/<pid>/environ` unreadable), nor Unix sockets; only
   * the run directory writable. The command's own children run inside too.
   */
  run(request: SandboxRun): Promise<SandboxResult>
}

/**
 * Node service: `addon-deltabox` (the operator plugin installed with the CLI)
 * registers it where the host qualifies (10.6); the compiler puts it in
 * `RunContext.sandbox`.
 */
export const PROCESS_SANDBOX = defineService<ProcessSandbox>('presmium.processSandbox')

export interface Executor {
  readonly id: string
  supports(lang: string): boolean
  /**
   * `ctx` is given by the compiler at compile time; old implementations and
   * callers are unaffected. Without `ctx` an executor gives the code only
   * `PATH`, `LANG` and a temporary `HOME`.
   */
  run(request: RunRequest, signal?: AbortSignal, ctx?: RunContext): Promise<RunResult>
  /**
   * Identifies the runtime environment for `lang` (e.g. interpreter version or
   * image digest). Part of the compile-time execution cache key; '' when omitted.
   */
  fingerprint?(lang: string): string | Promise<string>
  /** Drops the state of a session (restarts or closes the interpreter or kernel); "reset session" and the end of a build call it. */
  endSession?(session: string): Promise<void>
}

/** Routes requests to registered executors; higher priority wins. */
export interface ExecutorRouter extends Executor {
  register(executor: Executor, priority?: number): Unsubscribe
  list(): Executor[]
}

export const EXECUTOR = defineService<ExecutorRouter>('presmium.executor')

// Named environments (P-100) ---------------------------------------------------

/** How an environment authenticates (P-105); the credentials themselves stay on the server. */
export type EnvironmentAuth = 'none' | 'env' | 'proxy' | 'prompt' | 'hub'

/** An entry of the headmatter's `execute.environments` (P-100); holds no credentials. */
export interface EnvironmentSpec {
  /** Provider kind: `jupyter`, `devcontainer`, `wasi`, `webgpu`, or one another plugin registers. */
  kind: string
  /**
   * Service URL (`jupyter`). Connections with server credentials (`env`,
   * `proxy`) go only to the address the operator gives in
   * `PRESMIUM_ENV_<name>_URL`; this one, when of another origin, is not connected (section 11).
   */
  url?: string
  /** Kernel spec name (`jupyter`, default `python3`). */
  kernel?: string
  /** Languages it runs; omitted, the provider decides. */
  languages?: string[]
  /** Default `none`; `jupyter` defaults to `env`. */
  auth?: EnvironmentAuth
  /** Image digest `name@sha256:…`, part of the environment fingerprint. */
  image?: string
  /** Directory of the definition (`devcontainer`), relative to the deck directory. */
  path?: string
  /** The provider's own options. */
  [option: string]: unknown
}

/** The headmatter's `execute`, which the compiler writes to the IR's `config.execute`. */
export interface ExecuteConfig {
  /** Environment of the code blocks with `:run:` and no `:env:`; omitted, or the reserved name `browser`, routes by language. */
  env?: string
  environments?: Record<string, EnvironmentSpec>
  /** `environment`: recordings made in another runtime environment run again (4.3). */
  rerun?: 'environment'
}

/** The executor id of a named environment: `presmium.env.<name>`. */
export function environmentExecutor(name: string): string {
  return `presmium.env.${name}`
}

export interface EnvironmentContext {
  deckDir: string
  workspaceRoot: string
  /**
   * The server's environment variables, e.g. `secret('PRESMIUM_ENV_GPU_TOKEN')`
   * and its pair `secret('PRESMIUM_ENV_GPU_URL')`; undefined when unset. A
   * provider sends a credential only to the address of its pair. In SHARED
   * mode neither serve nor agent-host has third-party credentials.
   */
  secret(name: string): string | undefined
  /**
   * SHARED mode, in serve: the gateway access (service token); `probe`
   * reaches the environment through this plugin's proxy in the gateway.
   * Omitted in agent-host (runs use `RunContext.gateway`) and in LOCAL mode.
   */
  gateway?: GatewayAccess
  log: Logger
}

export interface EnvironmentProvider {
  /** Creates the compile-time executor of a declared environment; its id is `environmentExecutor(name)`. */
  create(name: string, spec: EnvironmentSpec, ctx: EnvironmentContext): Executor | Promise<Executor>
  /** `presmium check --env`: connects to the environment; undefined when reachable, else the reason. */
  probe?(name: string, spec: EnvironmentSpec, ctx: EnvironmentContext): Promise<string | undefined>
}
