import { spawn } from 'node:child_process'
import { expect, it } from 'vitest'
import { backgroundPriority, NODE_RESOURCE_ARGS, resourceEnvironment } from '../src/node/index.ts'

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
