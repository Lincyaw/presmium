// The operator's pair (docs/architecture.md section 11, WP-76): PRESMIUM_ENV_<NAME>_TOKEN goes to
// PRESMIUM_ENV_<NAME>_URL only. A deck whose `url` names another address gets no connection from
// `presmium build` nor from the proxy of `presmium dev`, and is told why; a token without its
// address is not sent anywhere. Listeners stand in for the deck's address and the operator's.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Listener } from './helpers.ts'
import { cleanEnv, listener, presmium, presmiumProcess, remove, testDeck, waitFor } from './helpers.ts'

const TOKEN = 'operator-token-of-the-gpu-environment'

let deckAddress: Listener
let operatorAddress: Listener

beforeAll(async () => {
  deckAddress = await listener()
  operatorAddress = await listener()
})

afterAll(async () => {
  await deckAddress?.close()
  await operatorAddress?.close()
})

/** A deck whose environment `gpu` (proxied) names the deck's listener, with a code block that runs in it. */
function deck(prefix: string): string {
  return testDeck(prefix, `
execute:
  environments:
    gpu: { kind: jupyter, auth: proxy, url: '${deckAddress.url}' }
`, `
## 远端

\`\`\`{code} python
:run: both
:env: gpu
print("不应运行")
\`\`\`
`)
}

/** `presmium build`, then `presmium dev` and a request through its proxy of `gpu`; both outputs and the proxy's answer. */
async function buildAndProxy(dir: string, env: Record<string, string>): Promise<{ build: string, dev: string, proxied: { status: number, text: string } }> {
  const built = await presmium(dir, ['build', '--to', 'notebook'], env)
  const dev = presmiumProcess(dir, ['dev', '--to', 'notebook'], cleanEnv(env))
  try {
    const server = (await waitFor(dev, /^server {2}(http\S+)$/m))[1]!
    const response = await fetch(`${server}/__presmium/presmium.execJupyter/env/gpu/api/kernelspecs`)
    return { build: built.stdout + built.stderr, dev: dev.output(), proxied: { status: response.status, text: await response.text() } }
  } finally {
    await dev.stop()
  }
}

describe('a deck url other than the operator\'s address', () => {
  let dir: string
  beforeAll(() => {
    dir = deck('credentials-mismatch')
  })
  afterAll(() => remove(dir))

  it('is connected neither by presmium build nor by the proxy of presmium dev, and the diagnostics say the addresses differ', async () => {
    const { build, dev, proxied } = await buildAndProxy(dir, { PRESMIUM_ENV_GPU_URL: operatorAddress.url, PRESMIUM_ENV_GPU_TOKEN: TOKEN })
    const mismatch = `the deck's url ${deckAddress.url} is not the operator's address (PRESMIUM_ENV_GPU_URL, ${operatorAddress.url.replace(/\/$/, '')})`
    expect(build).toContain(mismatch)
    expect(build).toMatch(/lecture\.md:\d+ {2}error {2}environment "gpu"/)
    expect(dev).toContain(mismatch)
    expect(proxied.status).toBe(502)
    expect(proxied.text).toContain(mismatch)
    expect(deckAddress.received).toEqual([])
    expect(operatorAddress.received).toEqual([])
    for (const text of [build, dev, proxied.text]) expect(text).not.toContain(TOKEN)
  }, 300_000)
})

describe('a token without its address', () => {
  let dir: string
  beforeAll(() => {
    dir = deck('credentials-no-url')
  })
  afterAll(() => remove(dir))

  it('is sent nowhere', async () => {
    const { build, proxied } = await buildAndProxy(dir, { PRESMIUM_ENV_GPU_TOKEN: TOKEN })
    expect(build).toContain('PRESMIUM_ENV_GPU_URL is not set')
    expect(proxied.status).toBe(502)
    expect(proxied.text).toContain('PRESMIUM_ENV_GPU_URL is not set')
    expect(deckAddress.received).toEqual([])
    expect(operatorAddress.received).toEqual([])
    for (const text of [build, proxied.text]) expect(text).not.toContain(TOKEN)
  }, 300_000)
})
