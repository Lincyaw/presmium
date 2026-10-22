import { spawn, spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/** Opt in with a Python containing jupyter_server and ipykernel; no Docker is required. */
export const localPython = process.env.PRESMIUM_TEST_JUPYTER_PYTHON

export interface LocalJupyter {
  url: string
  token: string
  api(path: string): Promise<unknown>
  stop(): Promise<void>
}

export async function startLocalJupyter(python: string, options: { cors?: boolean, noAuth?: boolean } = {}): Promise<LocalJupyter> {
  const dir = mkdtempSync(join(tmpdir(), 'presmium-jupyter-cleanup-'))
  const token = options.noAuth ? '' : randomBytes(24).toString('hex')
  for (const name of ['root', 'home', 'runtime', 'config', 'data', 'ipython']) mkdirSync(join(dir, name))
  const env: NodeJS.ProcessEnv = {
    PATH: process.env.PATH,
    HOME: join(dir, 'home'),
    TMPDIR: tmpdir(),
    JUPYTER_RUNTIME_DIR: join(dir, 'runtime'),
    JUPYTER_CONFIG_DIR: join(dir, 'config'),
    JUPYTER_DATA_DIR: join(dir, 'data'),
    IPYTHONDIR: join(dir, 'ipython'),
    OMP_NUM_THREADS: '1', OPENBLAS_NUM_THREADS: '1', MKL_NUM_THREADS: '1',
    NUMEXPR_NUM_THREADS: '1', VECLIB_MAXIMUM_THREADS: '1', BLIS_NUM_THREADS: '1',
  }
  const installed = spawnSync(python, ['-m', 'ipykernel', 'install', '--user', '--name', 'python3'], { env, encoding: 'utf8', timeout: 30_000 })
  if (installed.status !== 0) {
    rmSync(dir, { recursive: true, force: true })
    throw new Error(`cannot register the temporary Python kernel: ${installed.stderr}`)
  }
  const free = createServer()
  await new Promise<void>(resolve => free.listen(0, '127.0.0.1', resolve))
  const port = (free.address() as { port: number }).port
  await new Promise<void>(resolve => free.close(() => resolve()))
  const config = join(dir, 'server.py')
  writeFileSync(config, [
    `c.ServerApp.ip = '127.0.0.1'`,
    `c.ServerApp.port = ${port}`,
    `c.ServerApp.port_retries = 0`,
    `c.ServerApp.open_browser = False`,
    `c.ServerApp.log_level = 'WARN'`,
    `c.ServerApp.root_dir = ${JSON.stringify(join(dir, 'root'))}`,
    `c.ServerApp.jpserver_extensions = {'jupyter_server_terminals': True}`,
    ...options.cors ? [`c.ServerApp.allow_origin_pat = r'^http://(127\\.0\\.0\\.1|localhost):\\d+$'`] : [],
    ...options.noAuth ? ['c.ServerApp.disable_check_xsrf = True'] : [],
    `c.IdentityProvider.token = ${JSON.stringify(token)}`,
    `c.FileContentsManager.delete_to_trash = False`,
  ].join('\n'), { mode: 0o600 })
  const child = spawn(python, ['-m', 'jupyter_server', '--config', config], { env, stdio: ['ignore', 'pipe', 'pipe'] })
  let output = ''
  child.stdout.on('data', chunk => output += chunk)
  child.stderr.on('data', chunk => output += chunk)
  const url = `http://127.0.0.1:${port}/`
  const api = async (path: string) => {
    const response = await fetch(`${url}api/${path}`, { headers: token ? { Authorization: `token ${token}` } : {} })
    if (!response.ok) throw new Error(`Jupyter ${path}: ${response.status}`)
    return response.json() as Promise<unknown>
  }
  const stop = async () => {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = new Promise<void>(resolve => child.once('exit', () => resolve()))
      const timeout = setTimeout(() => child.kill('SIGKILL'), 10_000)
      child.kill('SIGTERM')
      await exited
      clearTimeout(timeout)
    }
    rmSync(dir, { recursive: true, force: true })
  }
  try {
    for (let attempt = 0; attempt < 120; attempt++) {
      if (await api('kernelspecs').then(() => true, () => false)) return { url, token, api, stop }
      if (child.exitCode !== null || child.signalCode !== null) break
      await new Promise(resolve => setTimeout(resolve, 250))
    }
    throw new Error(`local Jupyter did not start: ${token ? output.replaceAll(token, '[redacted]') : output}`)
  } catch (error) {
    await stop()
    throw error
  }
}
