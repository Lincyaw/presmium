// The remote environments of e2e/exec-remote.spec.ts: templates/env/compose/compose.yaml, run by
// docker compose under a project name of the work package, on a port of its range, with a token of
// its own; and a JupyterHub (./hub) whose learner's server is the environment of `auth: prompt` with
// `{user}`.
import { spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const COMPOSE = join(fileURLToPath(new URL('../../..', import.meta.url)), 'templates/env/compose/compose.yaml')

/** Whether docker compose answers; the spec is skipped without it. */
export const dockerCompose = spawnSync('docker', ['compose', 'version'], { stdio: 'ignore' }).status === 0
  && spawnSync('docker', ['version', '--format', '{{.Server.Version}}'], { stdio: 'ignore' }).status === 0

export interface Jupyter {
  /** The server's address, as the operator gives it in PRESMIUM_ENV_<NAME>_URL. */
  url: string
  token: string
  stop(): void
}

function compose(project: string, args: string[], env: NodeJS.ProcessEnv = {}): void {
  const result = spawnSync('docker', ['compose', '-p', project, '-f', COMPOSE, ...args], { env: { ...process.env, ...env }, encoding: 'utf8', timeout: 600_000 })
  if (result.status !== 0) throw new Error(`docker compose ${args.join(' ')} failed:\n${result.stdout}${result.stderr}`)
}

/** Starts the template's Jupyter Server and waits until it is healthy; browsers of this machine may call it from any port. */
export function startJupyter(project: string, port: number): Jupyter {
  const token = randomBytes(24).toString('hex')
  const env = { JUPYTER_TOKEN: token, JUPYTER_PORT: String(port), JUPYTER_ALLOW_ORIGIN_PAT: 'http://(127\\.0\\.0\\.1|localhost):\\d+' }
  compose(project, ['up', '-d', '--wait'], env)
  return {
    url: `http://127.0.0.1:${port}/`,
    token,
    stop: () => compose(project, ['down', '--volumes', '--timeout', '5'], env),
  }
}

export interface Hub {
  url: string
  /** The learner's name, and the token of theirs the learner pastes into the page. */
  user: string
  token: string
  stop(): void
}

const HUB_IMAGE = 'presmium-test-jupyterhub:wp89e'

function docker(args: string[], options: { cwd?: string } = {}): string {
  const result = spawnSync('docker', args, { ...options, encoding: 'utf8', timeout: 900_000 })
  if (result.status !== 0) throw new Error(`docker ${args[0]} failed:\n${result.stdout}${result.stderr}`)
  return result.stdout.trim()
}

/**
 * Builds and starts the JupyterHub of ./hub on `port` (this machine only), signs a learner up, starts
 * their server and gives back a token of theirs, as the hub's token page would.
 */
export async function startHub(name: string, port: number): Promise<Hub> {
  docker(['build', '-q', '-t', HUB_IMAGE, fileURLToPath(new URL('./hub', import.meta.url))])
  const service = randomBytes(24).toString('hex')
  docker(['rm', '-f', name])
  docker(['run', '-d', '--name', name, '-p', `127.0.0.1:${port}:8000`, '-e', `PRESMIUM_TEST_HUB_TOKEN=${service}`, '-e', 'PRESMIUM_TEST_ORIGIN_PAT=http://(127\\.0\\.0\\.1|localhost):\\d+', HUB_IMAGE])
  const url = `http://127.0.0.1:${port}/`
  const stop = () => void spawnSync('docker', ['rm', '-f', name], { stdio: 'ignore' })
  const api = async (method: string, path: string, body?: unknown) => {
    const response = await fetch(`${url}hub/api/${path}`, { method, headers: { Authorization: `token ${service}` }, ...body ? { body: JSON.stringify(body) } : {} })
    return { status: response.status, json: response.status === 204 || !response.headers.get('content-type')?.includes('json') ? undefined : await response.json() as Record<string, unknown> }
  }
  try {
    const ready = async (check: () => Promise<boolean>) => {
      for (let i = 0; i < 120; i++) {
        if (await check().catch(() => false)) return
        await new Promise(done => setTimeout(done, 1000))
      }
      throw new Error(`the hub of ${name} did not get ready:\n${spawnSync('docker', ['logs', name], { encoding: 'utf8' }).stderr}`)
    }
    await ready(async () => (await api('GET', '')).status === 200)
    await api('POST', 'users/learner')
    await api('POST', 'users/learner/server')
    await ready(async () => Boolean(((await api('GET', 'users/learner')).json?.servers as Record<string, { ready?: boolean }> | undefined)?.['']?.ready))
    const { json } = await api('POST', 'users/learner/tokens', { note: 'e2e/exec-remote.spec.ts', expires_in: 3600 })
    return { url, user: 'learner', token: String(json!.token), stop }
  } catch (error) {
    stop()
    throw error
  }
}
