import { spawn, spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

/** Opt in with an isolated Python containing jupyterhub, jupyter_server and ipykernel. */
export const localHubPython = process.env.PRESMIUM_TEST_JUPYTER_PYTHON
/** The configurable-http-proxy JavaScript entry, installed outside the repository (not a package-manager shell shim). */
export const localHubProxy = process.env.PRESMIUM_TEST_JUPYTER_PROXY

export interface LocalHub {
  url: string
  user: string
  token: string
  userApi(path: string): Promise<unknown>
  stop(): Promise<void>
}

async function freePort(): Promise<number> {
  const server = createServer()
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as { port: number }).port
  await new Promise<void>(resolve => server.close(() => resolve()))
  return port
}

/** A real, single-user JupyterHub and its HTTP/WebSocket proxy; no Docker or system user is needed. */
export async function startLocalHub(python: string, proxy: string): Promise<LocalHub> {
  const dir = mkdtempSync(join(tmpdir(), 'presmium-jupyterhub-'))
  const serviceToken = randomBytes(24).toString('hex')
  const user = 'learner'
  let token = ''
  for (const name of ['root', 'home', 'runtime', 'config', 'data', 'ipython']) mkdirSync(join(dir, name))
  const threads = {
    OMP_NUM_THREADS: '1', OPENBLAS_NUM_THREADS: '1', MKL_NUM_THREADS: '1',
    NUMEXPR_NUM_THREADS: '1', VECLIB_MAXIMUM_THREADS: '1', BLIS_NUM_THREADS: '1',
    GOMAXPROCS: '1', RAYON_NUM_THREADS: '1', UV_THREADPOOL_SIZE: '2',
  }
  const temporary = {
    HOME: join(dir, 'home'),
    JUPYTER_RUNTIME_DIR: join(dir, 'runtime'),
    JUPYTER_CONFIG_DIR: join(dir, 'config'),
    JUPYTER_DATA_DIR: join(dir, 'data'),
    IPYTHONDIR: join(dir, 'ipython'),
  }
  const env: NodeJS.ProcessEnv = {
    PATH: `${dirname(python)}:${dirname(process.execPath)}:${process.env.PATH ?? ''}`,
    TMPDIR: tmpdir(),
    ...temporary,
    ...threads,
  }
  const installed = spawnSync(python, ['-m', 'ipykernel', 'install', '--user', '--name', 'python3'], { env, encoding: 'utf8', timeout: 30_000 })
  if (installed.status !== 0) {
    rmSync(dir, { recursive: true, force: true })
    throw new Error(`cannot register the temporary Hub kernel: ${installed.stderr}`)
  }
  const port = await freePort()
  const hubPort = await freePort()
  const proxyApiPort = await freePort()
  const url = `http://127.0.0.1:${port}/`
  const config = join(dir, 'jupyterhub_config.py')
  const py = (value: unknown) => JSON.stringify(value)
  writeFileSync(config, [
    `c = get_config()`,
    `c.JupyterHub.bind_url = ${py(url)}`,
    `c.JupyterHub.hub_bind_url = ${py(`http://127.0.0.1:${hubPort}`)}`,
    `c.JupyterHub.authenticator_class = 'dummy'`,
    `c.Authenticator.allow_all = True`,
    `c.JupyterHub.spawner_class = 'simple'`,
    `c.JupyterHub.db_url = ${py(`sqlite:///${join(dir, 'jupyterhub.sqlite')}`)}`,
    `c.JupyterHub.cookie_secret_file = ${py(join(dir, 'jupyterhub_cookie_secret'))}`,
    `c.JupyterHub.pid_file = ${py(join(dir, 'jupyterhub.pid'))}`,
    `c.JupyterHub.log_level = 'WARN'`,
    `c.ConfigurableHTTPProxy.api_url = ${py(`http://127.0.0.1:${proxyApiPort}`)}`,
    `c.ConfigurableHTTPProxy.pid_file = ${py(join(dir, 'proxy.pid'))}`,
    `c.ConfigurableHTTPProxy.command = ${py([process.execPath, '--v8-pool-size=1', proxy])}`,
    `c.Spawner.cmd = ${py([python, '-m', 'jupyterhub.singleuser'])}`,
    `c.Spawner.ip = '127.0.0.1'`,
    `c.Spawner.notebook_dir = ${py(join(dir, 'root'))}`,
    `c.SimpleLocalProcessSpawner.home_dir_template = ${py(join(dir, 'home'))}`,
    `c.Spawner.environment = ${py({ ...temporary, ...threads, JUPYTERHUB_ALLOW_TOKEN_IN_URL: '1' })}`,
    `c.Spawner.args = ['--ServerApp.allow_origin_pat=http://(127\\\\.0\\\\.0\\\\.1|localhost):[0-9]+', '--ServerApp.log_level=WARN']`,
    `c.JupyterHub.tornado_settings = {'headers': {'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Authorization, Content-Type'}}`,
    `c.JupyterHub.services = [{'name': 'presmium-test', 'api_token': ${py(serviceToken)}}]`,
    `c.JupyterHub.load_roles = [{'name': 'presmium-test', 'scopes': ['admin:users', 'admin:servers', 'tokens'], 'services': ['presmium-test']}]`,
  ].join('\n'), { mode: 0o600 })
  const child = spawn(python, ['-m', 'jupyterhub', '-f', config], { cwd: dir, env, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] })
  let output = ''
  child.stdout.on('data', chunk => output += chunk)
  child.stderr.on('data', chunk => output += chunk)
  const redacted = () => output.replaceAll(serviceToken, '[redacted]').replaceAll(token || serviceToken, '[redacted]')
  const api = async (method: string, path: string, body?: unknown) => {
    const response = await fetch(`${url}hub/api/${path}`, {
      method,
      headers: { Authorization: `token ${serviceToken}`, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(10_000),
    })
    return { status: response.status, json: response.headers.get('content-type')?.includes('json') ? await response.json() as Record<string, unknown> : undefined }
  }
  let stopping: Promise<void> | undefined
  const stop = (): Promise<void> => {
    stopping ??= (async () => {
      await api('DELETE', `users/${user}/server`).catch(() => {})
      if (child.exitCode === null && child.signalCode === null) {
        const exited = new Promise<void>(resolve => child.once('exit', () => resolve()))
        const timer = setTimeout(() => {
          if (process.platform !== 'win32' && child.pid) {
            try { process.kill(-child.pid, 'SIGKILL') } catch {}
          } else child.kill('SIGKILL')
        }, 10_000)
        child.kill('SIGTERM')
        await exited
        clearTimeout(timer)
      }
      rmSync(dir, { recursive: true, force: true })
    })()
    return stopping
  }
  const ready = async (check: () => Promise<boolean>) => {
    for (let attempt = 0; attempt < 120; attempt++) {
      if (await check().catch(() => false)) return
      if (child.exitCode !== null || child.signalCode !== null) break
      await new Promise(resolve => setTimeout(resolve, 500))
    }
    throw new Error(`local JupyterHub did not become ready:\n${redacted()}`)
  }
  try {
    await ready(async () => (await api('GET', '')).status === 200)
    const created = await api('POST', `users/${user}`)
    if (created.status !== 201) throw new Error(`JupyterHub learner creation: ${created.status}`)
    const started = await api('POST', `users/${user}/server`)
    if (started.status !== 201 && started.status !== 202) throw new Error(`JupyterHub learner server: ${started.status}\n${redacted()}`)
    await ready(async () => Boolean(((await api('GET', `users/${user}`)).json?.servers as Record<string, { ready?: boolean }> | undefined)?.['']?.ready))
    const issued = await api('POST', `users/${user}/tokens`, { note: 'Presmium local Hub verification', expires_in: 3600 })
    if (issued.status !== 201 || typeof issued.json?.token !== 'string') throw new Error(`JupyterHub token creation: ${issued.status}`)
    token = issued.json.token
    return {
      url,
      user,
      token,
      async userApi(path) {
        const response = await fetch(`${url}user/${user}/api/${path}`, { headers: { Authorization: `token ${token}` }, signal: AbortSignal.timeout(10_000) })
        if (!response.ok) throw new Error(`JupyterHub user API ${path}: ${response.status}`)
        return response.json() as Promise<unknown>
      },
      stop,
    }
  } catch (error) {
    await stop()
    throw error
  }
}
