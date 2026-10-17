// A kind: jupyter environment at compile time (P-105, WP-76): `presmium build` runs the deck's code in
// the kernels of the compose environment (templates/env/compose/compose.yaml) with the operator's pair
// PRESMIUM_ENV_<NAME>_URL and _TOKEN, and records the outputs with the environment's fingerprint,
// leaving no run directory on the server; a run panel's parameters keep their types; a block that
// exceeds its timeout interrupts the kernel, which runs the session's next block; a run's files are in
// its working directory; `presmium check --env` reports an environment it cannot reach. The template's
// overlays: the GPU one gives the kernel the host's NVIDIA GPUs (where the host has them), the gVisor
// one names the runtime `runsc`. Needs Docker; skipped without it.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { CodeNode, ComponentNode, IRDocument } from '@presmium/kernel'
import { docBlocks } from '@presmium/kernel'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import plugin from '../src/node/presmium.ts'
import type { Jupyter } from './helpers.ts'
import { closedPort, compose, dockerCompose, nvidiaGpu, PACKAGES, presmium, remove, startJupyter, testDeck } from './helpers.ts'

/** The compose environment's ports, in WP-89e's range. */
const PORT = 5335
const GPU_PORT = 5336
const IMAGE = 'quay.io/jupyter/base-notebook:2026-10-12@sha256:3fc2b8023bb7e3f11a09bd77aa07575c1ece16a0b9b64556757e34c52f667a1a'

if (!dockerCompose) console.warn('[remote.test] skipped: needs Docker with docker compose (templates/env/compose); start the Docker daemon to run it')

describe.skipIf(!dockerCompose)('remote environment (P-105)', () => {
  let jupyter: Jupyter | undefined
  let dir: string
  let closed: number

  beforeAll(async () => {
    jupyter = startJupyter('wp89e-remote-test', PORT)
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

## 参数

(params)=
\`\`\`{run-panel} python
:env: remote
:params: {n: 2, x: 0.5, word: hi, verbose: false}
print(type(n).__name__, type(x).__name__, type(word).__name__, type(verbose).__name__, n * 21, "on" if verbose else "off")
\`\`\`

## 超时

(slow)=
\`\`\`{code} python
:run:
:env: remote
:session: slow
:timeout: 3000
import time
started = time.time()
time.sleep(60)
\`\`\`

(after)=
\`\`\`{code} python
:run:
:env: remote
:session: slow
print("after", round(time.time() - started) < 30)
\`\`\`
`, [join(PACKAGES, 'addon-exec')])
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
    expect(built.stdout).toMatch(/code runs: 6 executed/)
    const doc = JSON.parse(readFileSync(join(dir, 'dist/ir.json'), 'utf8')) as IRDocument
    const output = (id: string) => ([...docBlocks(doc)].find(({ block }) => block.id === id)?.block.node as CodeNode).outputs?.[0]
    expect(output('where')).toMatchObject({ ok: true, executorId: 'presmium.env.remote', stdout: expect.stringMatching(/^远端内核 3\.\d+\.\d+ True\n\[\]\n$/) })
    expect(output('use')).toMatchObject({ ok: true, stdout: '42\n' })

    // A run panel's parameters keep their types in the kernel, as in the browser and the local runner (F-17).
    const panel = [...docBlocks(doc)].find(({ block }) => block.id === 'params')!.block.node as ComponentNode
    expect((panel.children![0]!.node as CodeNode).outputs?.[0]).toMatchObject({ ok: true, stdout: 'int float str bool 42 off\n' })

    // The block over its timeout interrupted the kernel; the session's next block ran in it at once.
    expect(output('slow')).toMatchObject({ ok: false, timedOut: true })
    expect(output('after')).toMatchObject({ ok: true, stdout: 'after True\n' })

    const freeze = join(dir, '.presmium/freeze')
    const environments = readdirSync(freeze).filter(file => file.endsWith('.json')).map(file => (JSON.parse(readFileSync(join(freeze, file), 'utf8')) as { environment?: string }).environment)
    expect(environments.length).toBeGreaterThanOrEqual(4)
    for (const environment of environments) {
      expect(environment).toContain(`image=${IMAGE}`)
      expect(environment).toMatch(/kernelspec=python3:sha256:[0-9a-f]{16} kernel=ipython \d+\.\d+\.\d+ python 3\.\d+\.\d+$/)
    }
    // The second build answers from the recordings (the timed-out block is not recorded, and runs again).
    const again = await presmium(dir, ['build', '--to', 'notebook'], env())
    expect(again.stdout).toMatch(/code runs: \d executed, [45] from cache/)

    // Each kernel's run directory (presmium-runs/<id>/, its working directory) went with the kernel.
    const runs = await fetch(`${jupyter!.url}api/contents/presmium-runs?content=1`, { headers: { Authorization: `token ${jupyter!.token}` } })
    expect(runs.status).toBe(200)
    expect((await runs.json() as { content: unknown[] }).content).toEqual([])
  }, 300_000)

  // No block of a deck sends files to an environment: the Executor contract's callers do (a classroom
  // exercise's check sends the learner's code and the checks as files). So the case calls the plugin's
  // environment provider as the compiler does, from the entry it loads (`./presmium`).
  it('puts a run\'s files in its working directory, where the code reads them', async () => {
    const executor = await plugin.environments!.jupyter!.create('remote', { kind: 'jupyter' }, {
      deckDir: dir,
      workspaceRoot: dir,
      secret: name => (env() as Record<string, string>)[name],
      log: console,
    })
    const result = await executor.run({ lang: 'python', code: 'import os\nprint(open("data/input.txt").read(), os.path.isfile(os.path.join(os.getcwd(), "data", "input.txt")))', files: { 'data/input.txt': '来自请求的文件' } })
    expect(result).toMatchObject({ ok: true, stdout: '来自请求的文件 True\n' })
  }, 120_000)

  it('presmium check --env reports an environment on a closed port as unreachable', async () => {
    const checked = await presmium(dir, ['check', '--env'], env())
    const text = checked.stdout + checked.stderr
    expect(checked.code).toBe(1)
    expect(text).toMatch(new RegExp(`environment "closed" \\(jupyter\\) is not reachable: cannot reach http://127\\.0\\.0\\.1:${closed}/: .*ECONNREFUSED`))
    expect(text).not.toMatch(/environment "remote"/)
    expect(text).not.toContain('closed-environment-token')
  }, 120_000)
})

describe.skipIf(!dockerCompose)('the template\'s overlays (P-106)', () => {
  it('compose.gvisor.yaml names the gVisor runtime for the Jupyter Server', () => {
    const config = compose('wp89e-gvisor-config', ['config'], { JUPYTER_TOKEN: 'config-only' }, ['compose.gvisor.yaml'])
    expect(config).toMatch(/^\s+runtime: runsc$/m)
  })
})

if (dockerCompose && !nvidiaGpu) console.warn('[remote.test] the GPU overlay is skipped: the host has no NVIDIA GPU registered with Docker (the NVIDIA Container Toolkit)')

describe.skipIf(!nvidiaGpu)('compose.gpu.yaml (P-106, needs an NVIDIA GPU)', () => {
  let jupyter: Jupyter | undefined
  let dir: string
  beforeAll(() => {
    jupyter = startJupyter('wp89e-remote-gpu', GPU_PORT, ['compose.gpu.yaml'])
    dir = testDeck('remote-gpu', `
execute:
  environments:
    gpu: { kind: jupyter }
`, `
## GPU

(gpus)=
\`\`\`{code} python
:run:
:env: gpu
import subprocess
print(subprocess.run(["nvidia-smi", "-L"], capture_output=True, text=True).stdout)
\`\`\`
`)
  }, 600_000)

  afterAll(() => {
    jupyter?.stop()
    remove(dir)
  }, 120_000)

  it('gives the kernel the host\'s GPUs: the recording lists them', async () => {
    const built = await presmium(dir, ['build', '--to', 'notebook'], { PRESMIUM_ENV_GPU_URL: jupyter!.url, PRESMIUM_ENV_GPU_TOKEN: jupyter!.token })
    expect(built.code, built.stdout + built.stderr).toBe(0)
    const doc = JSON.parse(readFileSync(join(dir, 'dist/ir.json'), 'utf8')) as IRDocument
    const run = (doc.sections[0]!.blocks[0]!.node as CodeNode).outputs![0]!
    expect(run).toMatchObject({ ok: true, executorId: 'presmium.env.gpu' })
    expect(run.stdout).toMatch(/^GPU 0: NVIDIA /m)
  }, 300_000)
})
