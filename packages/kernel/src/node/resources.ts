import { spawn } from 'node:child_process'
import type { ChildProcess, SpawnOptions } from 'node:child_process'
import { availableParallelism, constants, freemem, loadavg, setPriority } from 'node:os'
import { TYPESCRIPT_IMPORT } from './packages.ts'

const THREAD_VARIABLES = ['GOMAXPROCS', 'RAYON_NUM_THREADS', 'OMP_NUM_THREADS', 'OPENBLAS_NUM_THREADS', 'MKL_NUM_THREADS', 'BLIS_NUM_THREADS', 'VECLIB_MAXIMUM_THREADS', 'NUMEXPR_MAX_THREADS', 'NUMEXPR_NUM_THREADS', 'POLARS_MAX_THREADS']
export const NODE_RESOURCE_ARGS: readonly string[] = ['--v8-pool-size=1']

/**
 * `interactive`: what the author waits for, the workspace service and the previews' dev servers; `background`: what
 * runs while the author does something else, builds, exports and code runs.
 */
export type ResourceClass = 'interactive' | 'background'

/** What the machine has now: its processors, how many of them are busy (the one-minute load), and its free memory. */
export interface MachineState {
  cpus: number
  load: number
  free: number
}

export function machineState(): MachineState {
  return { cpus: availableParallelism(), load: loadavg()[0] ?? 0, free: freemem() }
}

// Bundlers gain little from more threads than this, and each thread holds memory.
const INTERACTIVE_MAX = 8
// Below this much free memory an interactive child takes two threads at most.
const LOW_MEMORY = 2 * 1024 ** 3

/**
 * The native threads a child may use. A background child keeps to the operator's `PRESMIUM_MAX_THREADS`, one by default
 * and at most half the processors. An interactive child takes three quarters of the processors that are idle now (all
 * of them where the load is not known, as on Windows), keeping one for the rest of the machine, at most eight, and two
 * when memory is short; `PRESMIUM_MAX_THREADS` caps it.
 */
export function threadBudget(kind: ResourceClass, source: NodeJS.ProcessEnv = process.env, machine: MachineState = machineState()): number {
  const requested = Number(source.PRESMIUM_MAX_THREADS)
  const operator = Number.isInteger(requested) && requested > 0 ? requested : undefined
  if (kind === 'background') return Math.min(operator ?? 1, Math.max(1, Math.floor(machine.cpus / 2)))
  const idle = Math.max(1, machine.cpus - Math.min(machine.load, machine.cpus))
  let threads = Math.max(1, Math.min(Math.floor(idle * 0.75), machine.cpus - 1, INTERACTIVE_MAX))
  if (machine.free < LOW_MEMORY) threads = Math.min(threads, 2)
  return operator === undefined ? threads : Math.min(threads, operator)
}

/** Bound native thread pools as well as JS jobs; leave CPU capacity for other apps. */
export function resourceEnvironment(source: NodeJS.ProcessEnv = process.env, kind: ResourceClass = 'background', machine?: MachineState): Record<string, string> {
  const env = Object.fromEntries(Object.entries(source).filter((entry): entry is [string, string] => entry[1] !== undefined))
  const threads = threadBudget(kind, source, machine)
  if (source.PRESMIUM_MAX_THREADS !== undefined && kind === 'background') env.PRESMIUM_MAX_THREADS = String(threads)
  for (const name of THREAD_VARIABLES) {
    const current = Number(source[name])
    // An interactive child takes its own budget: a smaller value it inherited came from a background parent's limit.
    env[name] = String(kind === 'background' && Number.isInteger(current) && current > 0 ? Math.min(current, threads) : threads)
  }
  const ioThreads = Number(source.UV_THREADPOOL_SIZE)
  env.UV_THREADPOOL_SIZE = kind === 'interactive'
    ? String(Math.max(4, threads))
    : String(Number.isInteger(ioThreads) && ioThreads > 0 ? Math.min(ioThreads, 2) : 2)
  return env
}

/** Node's own arguments for a child: V8's background pool as large as its thread budget. */
export function nodeResourceArgs(kind: ResourceClass, source: NodeJS.ProcessEnv = process.env, machine?: MachineState): string[] {
  return kind === 'background' ? [...NODE_RESOURCE_ARGS] : [`--v8-pool-size=${threadBudget(kind, source, machine)}`]
}

/** Child priorities are best effort on platforms that restrict changing niceness. */
export function backgroundPriority(pid: number | undefined): void {
  if (pid === undefined) return
  try { setPriority(pid, constants.priority.PRIORITY_BELOW_NORMAL) } catch {}
}

/** Starts Node on `script` as a background child: one V8 worker, bounded thread pools, TypeScript imports and a lower priority. */
export function spawnBackgroundNode(script: string, args: readonly string[], options: SpawnOptions = {}): ChildProcess {
  const child = spawn(process.execPath, [...NODE_RESOURCE_ARGS, ...TYPESCRIPT_IMPORT, script, ...args], { env: resourceEnvironment(), ...options })
  backgroundPriority(child.pid)
  return child
}

/** Starts Node on `script` as a child the author waits for: the interactive thread budget at normal priority, with TypeScript imports. */
export function spawnInteractiveNode(script: string, args: readonly string[], options: SpawnOptions = {}): ChildProcess {
  const machine = machineState()
  return spawn(process.execPath, [...nodeResourceArgs('interactive', process.env, machine), ...TYPESCRIPT_IMPORT, script, ...args], { env: resourceEnvironment(process.env, 'interactive', machine), ...options })
}
