import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { Child, Listener } from './helpers.ts'
import { cleanEnv, listener, presmiumProcess, remove, testDeck, waitFor } from './helpers.ts'

let jupyter: Listener
let dir: string
let dev: Child | undefined

beforeAll(async () => {
  jupyter = await listener()
  dir = testDeck('proxy', `
execute:
  environments:
    gpu: { kind: jupyter, auth: proxy }
`, `
## 远端

正文。
`)
})

afterAll(async () => {
  await dev?.stop()
  await jupyter?.close()
  remove(dir)
})

it('follows the headmatter: an environment taken out of it loses its proxy at the next compile', async () => {
  dev = presmiumProcess(dir, ['dev', '--to', 'notebook'], cleanEnv({ PRESMIUM_ENV_GPU_URL: jupyter.url, PRESMIUM_ENV_GPU_TOKEN: 'operator-token' }))
  const server = (await waitFor(dev, /^server {2}(http\S+)$/m))[1]!
  const proxied = () => fetch(`${server}/__presmium/presmium.execJupyter/env/gpu/api/kernelspecs`).then(response => response.status)
  expect(await proxied()).toBe(200)
  expect(jupyter.received.map(request => request.url)).toContain('/api/kernelspecs')

  const deck = join(dir, 'lecture.md')
  writeFileSync(deck, readFileSync(deck, 'utf8').replace(/^execute:\n(?: .*\n)+/m, ''))
  await expect.poll(proxied, { timeout: 60_000, interval: 500 }).toBe(404)
}, 180_000)
