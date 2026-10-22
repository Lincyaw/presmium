import { spawn } from 'node:child_process'
import type { ChildProcess, SpawnOptions } from 'node:child_process'
import { availableParallelism, constants, setPriority } from 'node:os'
import { TYPESCRIPT_IMPORT } from './packages.ts'

const THREAD_VARIABLES = ['GOMAXPROCS', 'RAYON_NUM_THREADS', 'OMP_NUM_THREADS', 'OPENBLAS_NUM_THREADS', 'MKL_NUM_THREADS', 'BLIS_NUM_THREADS', 'VECLIB_MAXIMUM_THREADS', 'NUMEXPR_MAX_THREADS', 'NUMEXPR_NUM_THREADS', 'POLARS_MAX_THREADS']
export const NODE_RESOURCE_ARGS: readonly string[] = ['--v8-pool-size=1']

/** Bound native thread pools as well as JS jobs; leave CPU capacity for other apps. */
export function resourceEnvironment(source: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const env = Object.fromEntries(Object.entries(source).filter((entry): entry is [string, string] => entry[1] !== undefined))
  const maximum = Math.max(1, Math.floor(availableParallelism() / 2))
  const requested = Number(source.PRESMIUM_MAX_THREADS ?? 1)
  const threads = Number.isInteger(requested) && requested > 0 ? Math.min(requested, maximum) : 1
  if (source.PRESMIUM_MAX_THREADS !== undefined) env.PRESMIUM_MAX_THREADS = String(threads)
  for (const name of THREAD_VARIABLES) {
    const current = Number(source[name])
    env[name] = String(Number.isInteger(current) && current > 0 ? Math.min(current, threads) : threads)
  }
  const ioThreads = Number(source.UV_THREADPOOL_SIZE)
  env.UV_THREADPOOL_SIZE = String(Number.isInteger(ioThreads) && ioThreads > 0 ? Math.min(ioThreads, 2) : 2)
  return env
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
