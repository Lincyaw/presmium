// A kind: jupyter environment at compile time (P-105, WP-76): `presmium build` runs the deck's code in
// the kernels of the compose environment (templates/env/compose/compose.yaml) with the operator's pair
// PRESMIUM_ENV_<NAME>_URL and _TOKEN, and records the outputs with the environment's fingerprint,
// leaving no run directory on the server; `presmium check --env` reports an environment it cannot
// reach. Needs Docker; skipped without it.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { CodeNode, IRDocument } from '@presmium/kernel'
import { docBlocks } from '@presmium/kernel'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Jupyter } from './helpers.ts'
import { closedPort, dockerCompose, presmium, remove, startJupyter, testDeck } from './helpers.ts'

/** The compose environment's port, in WP-79e2's range. */
const PORT = 4933
const IMAGE = 'quay.io/jupyter/base-notebook:2026-10-12@sha256:3fc2b8023bb7e3f11a09bd77aa07575c1ece16a0b9b64556757e34c52f667a1a'

if (!dockerCompose) console.warn('[remote.test] skipped: needs Docker with docker compose (templates/env/compose); start the Docker daemon to run it')

describe.skipIf(!dockerCompose)('remote environment (P-105)', () => {
  let jupyter: Jupyter | undefined
  let dir: string
  let closed: number

  beforeAll(async () => {
    jupyter = startJupyter('wp79e2-remote-test', PORT)
    closed = await closedPort()
    dir = testDeck('remote', `
execute:
  environments:
    remote: { kind: jupyter, image: '${IMAGE}' }
    closed: { kind: jupyter }
`, `
## 远端内核

(where)=
\`\`\`{code} python
:run:
:env: remote
import os, platform
print("远端内核", platform.python_version(), os.getcwd().startswith("/home/jovyan/presmium-runs/"))
print(sorted(name for name in os.environ if name.startswith(("PRESMIUM_", "FIXTURE_"))))
\`\`\`

(define)=
\`\`\`{code} python
:run:
:env: remote
:session: counter
x = 41
\`\`\`

(use)=
\`\`\`{code} python
:run:
:env: remote
:session: counter
print(x + 1)
\`\`\`
`)
  }, 600_000)

  afterAll(() => {
    jupyter?.stop()
    remove(dir)
  }, 120_000)

  const env = () => ({
    PRESMIUM_ENV_REMOTE_URL: jupyter!.url,
    PRESMIUM_ENV_REMOTE_TOKEN: jupyter!.token,
    PRESMIUM_ENV_CLOSED_URL: `http://127.0.0.1:${closed}/`,
    PRESMIUM_ENV_CLOSED_TOKEN: 'closed-environment-token',
    // The build's own variables do not reach the kernel: it starts with the server's environment.
    FIXTURE_BUILD_VALUE: 'build-only',
  })

  it('presmium build records the remote kernel\'s output, and its fingerprint names the image digest and the kernel\'s version', async () => {
    const built = await presmium(dir, ['build', '--to', 'notebook'], env())
    expect(built.code, built.stdout + built.stderr).toBe(0)
    expect(built.stdout).toMatch(/code runs: 3 executed/)
    const doc = JSON.parse(readFileSync(join(dir, 'dist/ir.json'), 'utf8')) as IRDocument
    const output = (id: string) => ([...docBlocks(doc)].find(({ block }) => block.id === id)?.block.node as CodeNode).outputs?.[0]
    expect(output('where')).toMatchObject({ ok: true, executorId: 'presmium.env.remote', stdout: expect.stringMatching(/^远端内核 3\.\d+\.\d+ True\n\[\]\n$/) })
    expect(output('use')).toMatchObject({ ok: true, stdout: '42\n' })

    const freeze = join(dir, '.presmium/freeze')
    const environments = readdirSync(freeze).filter(file => file.endsWith('.json')).map(file => (JSON.parse(readFileSync(join(freeze, file), 'utf8')) as { environment?: string }).environment)
    expect(environments).toHaveLength(3)
    for (const environment of environments) {
      expect(environment).toContain(`image=${IMAGE}`)
      expect(environment).toMatch(/kernelspec=python3:sha256:[0-9a-f]{16} kernel=ipython \d+\.\d+\.\d+ python 3\.\d+\.\d+$/)
    }
    // The second build answers from the recordings.
    const again = await presmium(dir, ['build', '--to', 'notebook'], env())
    expect(again.stdout).toMatch(/code runs: 0 executed, 3 from cache/)

    // Each kernel's run directory (presmium-runs/<id>/, its working directory) went with the kernel.
    const runs = await fetch(`${jupyter!.url}api/contents/presmium-runs?content=1`, { headers: { Authorization: `token ${jupyter!.token}` } })
    expect(runs.status).toBe(200)
    expect((await runs.json() as { content: unknown[] }).content).toEqual([])
  }, 300_000)

  it('presmium check --env reports an environment on a closed port as unreachable', async () => {
    const checked = await presmium(dir, ['check', '--env'], env())
    const text = checked.stdout + checked.stderr
    expect(checked.code).toBe(1)
    expect(text).toMatch(new RegExp(`environment "closed" \\(jupyter\\) is not reachable: cannot reach http://127\\.0\\.0\\.1:${closed}/: .*ECONNREFUSED`))
    expect(text).not.toMatch(/environment "remote"/)
    expect(text).not.toContain('closed-environment-token')
  }, 120_000)
})
