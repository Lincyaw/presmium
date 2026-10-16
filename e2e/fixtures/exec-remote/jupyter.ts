// The remote environment of e2e/exec-remote.spec.ts: templates/env/compose/compose.yaml, run by
// docker compose under a project name of WP-76, on a port of its range, with a token of its own.
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
