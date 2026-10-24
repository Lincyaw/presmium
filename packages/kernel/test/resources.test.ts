import { spawn } from 'node:child_process'
import { expect, it } from 'vitest'
import { backgroundPriority, NODE_RESOURCE_ARGS, nodeResourceArgs, resourceEnvironment } from '../src/node/index.ts'
import type { MachineState, ResourceClass } from '../src/node/index.ts'

it('starts a child with bounded native thread pools, preserving a stricter caller budget', async () => {
  const env = resourceEnvironment({ PATH: process.env.PATH, GOMAXPROCS: '64', OMP_NUM_THREADS: '64', RAYON_NUM_THREADS: '64', UV_THREADPOOL_SIZE: '64' })
  const result = await new Promise<{ code: number | null, output: string }>((resolve, reject) => {
    const child = spawn(process.execPath, [...NODE_RESOURCE_ARGS, '-e', 'console.log(JSON.stringify({go:process.env.GOMAXPROCS,omp:process.env.OMP_NUM_THREADS,rayon:process.env.RAYON_NUM_THREADS,io:process.env.UV_THREADPOOL_SIZE,args:process.execArgv.includes("--v8-pool-size=1")}))'], { env, stdio: ['ignore', 'pipe', 'pipe'] })
    backgroundPriority(child.pid)
    let output = ''
    child.stdout.on('data', chunk => output += chunk)
    child.once('error', reject)
    child.once('close', code => resolve({ code, output }))
  })
  expect(result.code).toBe(0)
  expect(JSON.parse(result.output)).toEqual({ go: '1', omp: '1', rayon: '1', io: '2', args: true })
})

it('gives a child the author waits for most of the idle processors, fewer when the machine is busy or short of memory, and its own background children one', async () => {
  const report = 'console.log(JSON.stringify({go:process.env.GOMAXPROCS,io:process.env.UV_THREADPOOL_SIZE,pool:process.execArgv.find(a=>a.startsWith("--v8-pool-size")),background:process.env.__BACKGROUND}))'
  const run = (kind: ResourceClass, machine: MachineState) => new Promise<Record<string, string>>((resolve, reject) => {
    const env = resourceEnvironment({ PATH: process.env.PATH }, kind, machine)
    const child = spawn(process.execPath, [...nodeResourceArgs(kind, env, machine), '-e', report], { env: { ...env, __BACKGROUND: resourceEnvironment(env, 'background').GOMAXPROCS! }, stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''
    child.stdout.on('data', chunk => output += chunk)
    child.once('error', reject)
    child.once('close', () => resolve(JSON.parse(output) as Record<string, string>))
  })
  const GiB = 1024 ** 3
  expect(await run('interactive', { cpus: 8, load: 0, free: 16 * GiB })).toEqual({ go: '6', io: '6', pool: '--v8-pool-size=6', background: '1' })
  expect(await run('interactive', { cpus: 8, load: 7.5, free: 16 * GiB })).toEqual({ go: '1', io: '4', pool: '--v8-pool-size=1', background: '1' })
  expect(await run('interactive', { cpus: 64, load: 0, free: 16 * GiB })).toEqual({ go: '8', io: '8', pool: '--v8-pool-size=8', background: '1' })
  expect(await run('interactive', { cpus: 8, load: 0, free: GiB })).toEqual({ go: '2', io: '4', pool: '--v8-pool-size=2', background: '1' })
  expect(await run('background', { cpus: 8, load: 0, free: 16 * GiB })).toEqual({ go: '1', io: '2', pool: '--v8-pool-size=1', background: '1' })
})
