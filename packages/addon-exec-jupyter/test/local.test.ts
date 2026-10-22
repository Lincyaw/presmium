import { mkdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import type { EnvironmentContext, EnvironmentSpec, Executor, IRDocument, RunRequest } from '@lincyaw/kernel'
import { docBlocks } from '@lincyaw/kernel'
import { run } from '@lincyaw/cli/testing'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { localPython, startLocalJupyter } from './local-jupyter.ts'
import type { LocalJupyter } from './local-jupyter.ts'
import { jupyterProvider } from '../src/node/environments.ts'
import { nodeSettings } from '../src/node/connection.ts'
import { createKernels } from '../src/jupyter/kernels.ts'
import type { Kernels } from '../src/jupyter/kernels.ts'
import { closedPort, PACKAGES, presmium, remove, testDeck } from './helpers.ts'

if (!localPython) console.warn('[local.test] skipped: set PRESMIUM_TEST_JUPYTER_PYTHON to a Python with jupyter_server, ipykernel, nbformat and nbclient installed')

const BUDGET = {
  UV_THREADPOOL_SIZE: '2', GOMAXPROCS: '1', RAYON_NUM_THREADS: '1',
  OMP_NUM_THREADS: '1', OPENBLAS_NUM_THREADS: '1', MKL_NUM_THREADS: '1',
  NUMEXPR_NUM_THREADS: '1', VECLIB_MAXIMUM_THREADS: '1', BLIS_NUM_THREADS: '1',
}

describe.skipIf(!localPython)('the actual Jupyter provider and notebook CLI, with a local real server', () => {
  let jupyter: LocalJupyter
  let dir: string
  let closed: number
  let context: EnvironmentContext
  const managed: { executor: Executor, sessions: Set<string> }[] = []
  const pools: Kernels[] = []
  const spec: EnvironmentSpec = { kind: 'jupyter', kernel: 'python3', image: 'local-protocol-smoke' }

  const env = () => ({
    ...BUDGET,
    PRESMIUM_ENV_REMOTE_URL: jupyter.url,
    PRESMIUM_ENV_REMOTE_TOKEN: jupyter.token,
    PRESMIUM_ENV_CLOSED_URL: `http://127.0.0.1:${closed}/`,
    PRESMIUM_ENV_CLOSED_TOKEN: 'must-not-appear-in-diagnostics',
  })

  beforeAll(async () => {
    jupyter = await startLocalJupyter(localPython!)
    closed = await closedPort()
    dir = testDeck('jupyter-local', `
execute:
  environments:
    remote: { kind: jupyter, kernel: python3, image: local-protocol-smoke }
    closed: { kind: jupyter }
`, `
## Python notebook

(where)=
\`\`\`{code} python
:run:
:env: remote
print("notebook-42", 6 * 7)
\`\`\`

(define)=
\`\`\`{code} python
:run:
:env: remote
:session: notebook-counter
x = 41
print("defined")
\`\`\`

(use)=
\`\`\`{code} python
:run:
:env: remote
:session: notebook-counter
print(x + 1)
\`\`\`

:::{terminal} remote
:::
`, [join(PACKAGES, 'addon-core'), join(PACKAGES, 'addon-exec')])
    context = {
      deckDir: dir,
      workspaceRoot: dir,
      secret: name => env()[name as keyof ReturnType<typeof env>],
      log: console,
    }
  }, 60_000)

  afterEach(async () => {
    for (const own of managed.splice(0)) {
      for (const session of own.sessions) await own.executor.endSession?.(session)
    }
    for (const pool of pools.splice(0)) await pool.dispose()
    if (jupyter) {
      await expect.poll(() => jupyter.api('kernels'), { timeout: 10_000 }).toEqual([])
      const runs = await jupyter.api('contents/presmium-runs?content=1').catch(() => ({ content: [] })) as { content: unknown[] }
      expect(runs.content).toEqual([])
    }
  }, 30_000)

  afterAll(async () => {
    await jupyter?.stop()
    remove(dir)
  })

  async function executor(selected: EnvironmentSpec = spec): Promise<Executor> {
    const actual = await jupyterProvider.create('remote', selected, context)
    const own = { executor: actual, sessions: new Set<string>() }
    managed.push(own)
    return {
      ...actual,
      run(request, signal, runContext) {
        if (request.session) own.sessions.add(request.session)
        return actual.run(request, signal, runContext)
      },
    }
  }

  const python = (code: string, extra: Partial<RunRequest> = {}): RunRequest => ({ lang: 'python', code, ...extra })

  it('probes real kernel specs, fingerprints the runtime, and reports unreachable or incompatible environments without credentials', async () => {
    expect(await jupyterProvider.probe!('remote', spec, context)).toBeUndefined()
    expect(await jupyterProvider.probe!('remote', { ...spec, kernel: 'missing-presmium-kernel' }, context)).toContain('has no kernel missing-presmium-kernel')
    expect(await jupyterProvider.probe!('remote', { ...spec, auth: 'hub' }, context)).toContain('auth: hub is reserved')
    const refusedContext = { ...context, secret: (name: string) => name.endsWith('_TOKEN') ? 'invalid-test-token' : context.secret(name) }
    expect(await jupyterProvider.probe!('remote', spec, refusedContext)).toContain('refused the token')
    const remote = await executor()
    const fingerprint = await remote.fingerprint!('python')
    expect(fingerprint).toMatch(/^jupyter image=local-protocol-smoke kernelspec=python3:sha256:[0-9a-f]{16} kernel=ipython \d+\.\d+\.\d+ python 3\.\d+\.\d+$/)
    expect(await remote.fingerprint!('python')).toBe(fingerprint)
    const wrongLanguage = await remote.run({ lang: 'javascript', code: 'console.log(42)' })
    expect(wrongLanguage.ok).toBe(false)
    expect(wrongLanguage.stderr).toContain('runs python, not javascript')
    const checked = await presmium(dir, ['check', '--env'], env())
    const diagnostics = checked.stdout + checked.stderr
    expect(checked.code).toBe(1)
    expect(diagnostics).toContain('environment "closed" (jupyter) is not reachable')
    expect(diagnostics).toContain('ECONNREFUSED')
    expect(diagnostics).not.toContain(jupyter.token)
    expect(diagnostics).not.toContain(env().PRESMIUM_ENV_CLOSED_TOKEN)
  }, 60_000)

  it('keeps session state ordered and isolated, resets ended sessions, and cleans transient kernels', async () => {
    const remote = await executor()
    const definition = remote.run(python('x = 41\nprint("defined")', { session: 'counter' }))
    const use = remote.run(python('print(x + 1)', { session: 'counter' }))
    expect(await definition).toMatchObject({ ok: true, stdout: 'defined\n' })
    expect(await use).toMatchObject({ ok: true, stdout: '42\n' })
    const other = await remote.run(python('print(x)', { session: 'other' }))
    expect(other).toMatchObject({ ok: false, exitCode: 1 })
    expect(other.outputs).toContainEqual(expect.objectContaining({ output_type: 'error', ename: 'NameError' }))
    await remote.endSession!('counter')
    expect(await remote.run(python('print("x" in globals())', { session: 'counter' }))).toMatchObject({ ok: true, stdout: 'False\n' })
    expect(await remote.run(python('transient_value = 42\nprint(transient_value)'))).toMatchObject({ ok: true, stdout: '42\n' })
    expect(await remote.run(python('print("transient_value" in globals())'))).toMatchObject({ ok: true, stdout: 'False\n' })
  }, 60_000)

  it('uploads nested files into an isolated working directory and passes typed arguments, stdin, stdout and stderr', async () => {
    const remote = await executor()
    const result = await remote.run(python([
      'import os, sys',
      'from pathlib import Path',
      'print(Path("data/input.txt").read_text())',
      'print(Path.cwd().parent.name, Path.cwd().name)',
      'print(type(n).__name__, type(ratio).__name__, type(flag).__name__, type(word).__name__)',
      'print(n * int(input()), ratio, flag, word)',
      'print("error-stream", file=sys.stderr)',
      'Path("generated/nested").mkdir(parents=True)',
      'Path("generated/nested/result.txt").write_text("42")',
    ].join('\n'), {
      files: { 'data/input.txt': '输入文件' },
      args: { n: '7', ratio: '0.5', flag: 'true', word: 'hello' },
      stdin: '6\n',
    }))
    expect(result.ok).toBe(true)
    expect(result.stdout).toMatch(/^输入文件\npresmium-runs [a-z0-9]+-[a-z0-9]+\nint float bool str\n42 0\.5 True hello\n$/)
    expect(result.stderr).toBe('error-stream\n')
    expect(result.executorId).toBe('presmium.env.remote')
  }, 30_000)

  it('captures HTML, a valid PNG, display updates and clear_output, and preserves structured Python errors', async () => {
    const remote = await executor()
    const rich = await remote.run(python([
      'import base64',
      'from IPython.display import HTML, Image, display',
      'display(HTML("<b>rich-42</b>"))',
      'display(Image(data=base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jD1kAAAAASUVORK5CYII="), format="png"))',
      'handle = display(HTML("<i>old</i>"), display_id=True)',
      'handle.update(HTML("<i>updated-42</i>"))',
    ].join('\n')))
    expect(rich.ok).toBe(true)
    const data = (rich.outputs ?? []).filter(output => 'data' in output).map(output => output.data)
    expect(data).toContainEqual(expect.objectContaining({ 'text/html': '<b>rich-42</b>' }))
    expect(data).toContainEqual(expect.objectContaining({ 'text/html': '<i>updated-42</i>' }))
    expect(data.some(output => output['text/html'] === '<i>old</i>')).toBe(false)
    const png = data.find(output => typeof output['image/png'] === 'string')?.['image/png'] as string
    expect(Buffer.from(png, 'base64').subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
    const cleared = await remote.run(python('from IPython.display import clear_output\nprint("removed")\nclear_output(wait=True)\nprint("kept-42")'))
    expect(cleared).toMatchObject({ ok: true, stdout: 'kept-42\n' })
    expect(JSON.stringify(cleared.outputs)).not.toContain('removed')
    const error = await remote.run(python('raise ValueError("structured-failure")'))
    expect(error).toMatchObject({ ok: false, exitCode: 1, timedOut: false })
    expect(error.outputs).toContainEqual(expect.objectContaining({ output_type: 'error', ename: 'ValueError', evalue: 'structured-failure' }))
    expect(error.stderr).toContain('ValueError: structured-failure')
  }, 60_000)

  it('interrupts timeout and explicit abort requests, then reuses the same live session successfully', async () => {
    const remote = await executor()
    expect(await remote.run(python('x = 41', { session: 'recovery' }))).toMatchObject({ ok: true })
    const timedOut = await remote.run(python('import time\ntime.sleep(30)', { session: 'recovery', timeoutMs: 1000 }))
    expect(timedOut).toMatchObject({ ok: false, timedOut: true, exitCode: null })
    expect(await remote.run(python('print(x + 1)', { session: 'recovery' }))).toMatchObject({ ok: true, stdout: '42\n' })
    const abort = new AbortController()
    const running = remote.run(python('import time\ntime.sleep(30)', { session: 'recovery' }), abort.signal)
    await expect.poll(async () => (await jupyter.api('kernels') as { execution_state: string }[]).some(kernel => kernel.execution_state === 'busy'), { timeout: 5000 }).toBe(true)
    abort.abort()
    expect(await running).toMatchObject({ ok: false, timedOut: false })
    expect(await remote.run(python('print(x + 1)', { session: 'recovery' }))).toMatchObject({ ok: true, stdout: '42\n' })
  }, 30_000)

  it('does not execute a request whose abort signal was already cancelled', async () => {
    const remote = await executor()
    const abort = new AbortController()
    abort.abort()
    const result = await remote.run(python('print("must-not-run")'), abort.signal)
    expect(result).toMatchObject({ ok: false, stdout: '' })
    const first = remote.run(python('import time\ntime.sleep(0.25)\nprint("first")', { session: 'cancel-queue' }))
    const queuedAbort = new AbortController()
    const queued = remote.run(python('print("must-not-run")', { session: 'cancel-queue' }), queuedAbort.signal)
    queuedAbort.abort()
    expect(await first).toMatchObject({ ok: true, stdout: 'first\n' })
    expect(await queued).toMatchObject({ ok: false, stdout: '' })
  }, 15_000)

  it('disposes a starting or active real kernel and removes directories after a failed kernel start', async () => {
    const pool = createKernels({
      executorId: 'presmium.env.disposal', kernel: 'python3', languages: ['python'],
      settings: () => nodeSettings({ url: jupyter.url, headers: { Authorization: `token ${jupyter.token}` } }),
      text: {
        unreachable: error => `unreachable: ${error}`, refused: 'refused',
        noKernel: kernel => `no kernel ${kernel}`, wrongLanguage: () => 'wrong language', timedOut: () => 'timed out',
      },
    })
    pools.push(pool)
    const running = pool.run(python('import time\ntime.sleep(30)', { session: 'dispose' }))
    await expect.poll(() => jupyter.api('kernels'), { timeout: 10_000 }).not.toEqual([])
    await pool.dispose()
    expect((await running).ok).toBe(false)
    expect(await pool.run(python('print(42)'))).toMatchObject({ ok: false, stderr: expect.stringContaining('disposed') })
    const invalid = await executor({ ...spec, kernel: 'missing-presmium-kernel', languages: ['python'] })
    expect((await invalid.run(python('print(42)'))).ok).toBe(false)
  }, 45_000)

  it('reports missing, unknown and non-Jupyter terminal environments at their source directive', async () => {
    const invalid = testDeck('jupyter-terminal-invalid', `
execute:
  environments:
    remote: { kind: jupyter }
    other: { kind: no-terminal-provider }
`, `
## Invalid terminals

:::{terminal}
:::

:::{terminal} missing
:::

:::{terminal} other
:::
`, [join(PACKAGES, 'addon-core')])
    try {
      const checked = await presmium(invalid, ['check'], BUDGET)
      const diagnostics = checked.stdout + checked.stderr
      expect(checked.code).toBe(1)
      expect(diagnostics).toContain('{terminal} needs the name of a kind: jupyter environment')
      expect(diagnostics).toContain('{terminal} missing: no such environment')
      expect(diagnostics).toContain('{terminal} other: the environment is of kind no-terminal-provider')
      expect(diagnostics).toMatch(/lecture\.md:\d+ {2}error/)
    } finally {
      remove(invalid)
    }
  }, 30_000)

  it('builds a valid notebook, reproduces recorded output on a fresh Python kernel, and reuses the recording cache', async () => {
    // The earlier real `check --env` compiles this deck and may already record it.
    rmSync(join(dir, '.presmium/freeze'), { recursive: true, force: true })
    const built = await presmium(dir, ['build', '--to', 'notebook'], env())
    expect(built.code, built.stdout + built.stderr).toBe(0)
    expect(built.stdout).toContain('code runs: 3 executed')
    const ir = JSON.parse(readFileSync(join(dir, 'dist/ir.json'), 'utf8')) as IRDocument
    const code = [...docBlocks(ir)].map(({ block }) => block.node).filter(node => node.type === 'code')
    expect(code.map(node => node.outputs?.[0]?.stdout)).toEqual(['notebook-42 42\n', 'defined\n', '42\n'])
    const terminal = [...docBlocks(ir)].find(({ block }) => block.node.type === 'component' && block.node.name === 'PmTerminal')?.block.node
    expect(terminal).toMatchObject({ type: 'component', props: { env: 'remote' }, fallback: { type: 'root' } })
    const file = join(dir, 'dist/notebook/lecture.ipynb')
    const serialized = readFileSync(file, 'utf8')
    expect(serialized).not.toContain(jupyter.token)
    interface NotebookOutput { output_type: string, name?: string, text?: string | string[] }
    const notebook = JSON.parse(serialized) as { cells: { cell_type: string, outputs?: NotebookOutput[] }[] }
    const cells = notebook.cells.filter(cell => cell.cell_type === 'code')
    expect(cells).toHaveLength(3)
    expect(serialized).not.toContain('PmTerminal')
    const pythonEnv: NodeJS.ProcessEnv = {
      PATH: process.env.PATH, TMPDIR: process.env.TMPDIR,
      ...BUDGET,
    }
    for (const [name, child] of Object.entries({ HOME: 'home', JUPYTER_CONFIG_DIR: 'config', JUPYTER_DATA_DIR: 'data', JUPYTER_RUNTIME_DIR: 'runtime', IPYTHONDIR: 'ipython' })) {
      const path = join(dir, `replay-${child}`)
      mkdirSync(path)
      pythonEnv[name] = path
    }
    const registered = await run(localPython!, ['-m', 'ipykernel', 'install', '--user', '--name', 'python3'], { env: pythonEnv })
    expect(registered.code, registered.stderr).toBe(0)
    const checker = join(PACKAGES, 'render-notebook/test/notebook.py')
    const validation = await run(localPython!, [checker, 'validate', file], { env: pythonEnv })
    expect(validation.code, validation.stderr).toBe(0)
    const replay = await run(localPython!, [checker, 'run', file], { cwd: dir, env: pythonEnv })
    expect(replay.code, replay.stderr).toBe(0)
    // nbformat accepts multiline strings as text or arrays of lines on disk.
    const streams = (outputs: NotebookOutput[] = []) => outputs.map(output => {
      expect(output.output_type).toBe('stream')
      return { name: output.name, text: [output.text ?? ''].flat().join('') }
    })
    expect((JSON.parse(replay.stdout) as NotebookOutput[][]).map(streams)).toEqual(cells.map(cell => streams(cell.outputs)))
    const cached = await presmium(dir, ['build', '--to', 'notebook'], env())
    expect(cached.code, cached.stdout + cached.stderr).toBe(0)
    expect(cached.stdout).toMatch(/code runs: 0 executed, 3 from cache/)
  }, 120_000)
})
