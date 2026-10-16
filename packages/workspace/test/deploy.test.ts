// The compose template of a shared deployment (N-09, D13; docs/architecture.md 10.5), started for real:
// oauth2-proxy sends a request without a login to the login, on the site's and the console's host names;
// only it publishes a port; serve, gateway and sandbox run as different uids; the third-party credentials
// of .env are in the gateway only, serve's tokens are not in its environment; serve reaches no outside
// address; sandbox reaches neither the outside nor serve, only the gateway; sandbox writes document
// directories and nothing else of the workspace, and cannot read agent-host's environment.
// Needs Docker with compose (and the network for the base image's packages); skipped without it.
import { execFile, spawnSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { raw, ROOT } from './helpers.ts'

const docker = spawnSync('docker', ['compose', 'version'], { stdio: 'ignore' }).status === 0
  && spawnSync('docker', ['info'], { stdio: 'ignore' }).status === 0
if (!docker) console.warn('[presmium] packages/workspace/test/deploy.test.ts is skipped: it needs Docker with compose (docker compose version); install them and run it again')

const PROJECT = 'wp-79-deploy'
const PORT = 4898
const EDGE = '172.29.79'
const COMPOSE = join(ROOT, 'templates/workspace/compose/compose.yaml')
const id = Math.random().toString(36).slice(2, 10)
const CREDENTIAL = `deploy-credential-${id}`
const TOKENS = { gateway_token: `gateway-${id}`, agent_host_token: `agent-host-${id}` }

describe.skipIf(!docker)('the compose template of a shared deployment', () => {
  let dir: string
  const compose = (args: string[], timeoutMs = 600_000): Promise<{ code: number, stdout: string, stderr: string }> => new Promise((resolve) => {
    execFile('docker', ['compose', '-p', PROJECT, '-f', COMPOSE, '--project-directory', dir, ...args], {
      env: { ...process.env, PRESMIUM_SOURCE: ROOT, PRESMIUM_IMAGE: 'wp-79-presmium-workspace:test' },
      maxBuffer: 64 << 20,
      timeout: timeoutMs,
    }, (error, stdout, stderr) => resolve({ code: error ? (typeof error.code === 'number' ? error.code : 1) : 0, stdout, stderr }))
  })
  /** A command in a service's container (as `user`, default the service's), its exit code and output. */
  const exec = (service: string, command: string[], user?: string) => compose(['exec', '-T', ...user ? ['-u', user] : [], service, ...command], 60_000)
  /** Whether a request from a service's container gets an HTTP answer at all. */
  const reaches = async (service: string, url: string) => (await exec(service, ['node', '-e', `fetch(${JSON.stringify(url)}, { signal: AbortSignal.timeout(5000) }).then(() => process.exit(0), () => process.exit(3))`])).code === 0

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'presmium-wp79-deploy-'))
    writeFileSync(join(dir, '.env'), `DEEPSEEK_API_KEY=${CREDENTIAL}\nPRESMIUM_CONSOLE_HOST=console.test\nPRESMIUM_PORT=${PORT}\nPRESMIUM_EDGE=${EDGE}\n`)
    writeFileSync(join(dir, 'oauth2-proxy.env'), [
      'OAUTH2_PROXY_PROVIDER=github',
      'OAUTH2_PROXY_CLIENT_ID=presmium-test',
      'OAUTH2_PROXY_CLIENT_SECRET=presmium-test-secret',
      'OAUTH2_PROXY_COOKIE_SECRET=0123456789abcdef0123456789abcdef',
      'OAUTH2_PROXY_COOKIE_SECURE=false',
      'OAUTH2_PROXY_EMAIL_DOMAINS=*',
      `OAUTH2_PROXY_REDIRECT_URL=http://site.test:${PORT}/oauth2/callback`,
      '',
    ].join('\n'))
    mkdirSync(join(dir, 'secrets'))
    for (const [name, value] of Object.entries(TOKENS)) {
      writeFileSync(join(dir, 'secrets', name), value)
      chmodSync(join(dir, 'secrets', name), 0o600)
    }
    mkdirSync(join(dir, 'seed/course'), { recursive: true })
    writeFileSync(join(dir, 'seed/presmium.workspace.yaml'), 'title: 部署测试\nmembers:\n  owners: [owner@test]\n')
    writeFileSync(join(dir, 'seed/course/lecture.md'), '---\ntitle: 课程\n---\n\n# 课程\n\n部署测试的文档。\n')
    const up = await compose(['up', '-d', '--build'], 1_200_000)
    if (up.code !== 0) throw new Error(`docker compose up failed:\n${up.stdout}\n${up.stderr}`)
    // Up once oauth2-proxy answers and serve, gateway and sandbox listen.
    const end = Date.now() + 180_000
    for (;;) {
      const answered = await raw(`http://127.0.0.1:${PORT}/ping`, { timeoutMs: 5000 }).then(r => r.status === 200, () => false)
      const listening = answered && (await Promise.all([reaches('sandbox', 'http://gateway:4320/info'), reaches('gateway', `http://${EDGE}.11:4310/`)])).every(Boolean)
      if (listening) break
      if (Date.now() > end) throw new Error(`the deployment did not come up:\n${(await compose(['logs', '--no-color'])).stdout}`)
      await new Promise(done => setTimeout(done, 2000))
    }
  }, 1_500_000)

  afterAll(async () => {
    if (dir) {
      await compose(['down', '-v', '--remove-orphans'], 300_000)
      rmSync(dir, { recursive: true, force: true })
    }
  }, 300_000)

  it('sends a request without a login to the login, on the site\'s host name and the console\'s', async () => {
    for (const host of ['site.test', 'console.test']) {
      const answer = await raw(`http://127.0.0.1:${PORT}/`, { headers: { Host: `${host}:${PORT}` } })
      expect(answer.status, `${host}: ${answer.text.slice(0, 200)}`).toBe(302)
      expect(answer.headers.location).toMatch(/^https:\/\/github\.com\/login\/oauth\/authorize\?/)
    }
  })

  it('publishes oauth2-proxy\'s port only; serve, gateway and sandbox run as different uids', async () => {
    const listed = (await compose(['ps', '--format', 'json'])).stdout.trim().split('\n').filter(Boolean).map(line => JSON.parse(line) as { Service: string, Publishers?: { PublishedPort: number }[] })
    const published = Object.fromEntries(listed.map(c => [c.Service, (c.Publishers ?? []).map(p => p.PublishedPort).filter(Boolean)]))
    expect(published['oauth2-proxy']).toContain(PORT)
    for (const service of ['serve', 'gateway', 'sandbox']) expect(published[service], service).toEqual([])
    const uids = await Promise.all(['serve', 'gateway', 'sandbox'].map(async service => /^Uid:\s+(\d+)/m.exec((await exec(service, ['cat', '/proc/1/status'])).stdout)?.[1]))
    expect(uids).toEqual(['1001', '1002', '1003'])
  })

  it('keeps the third-party credentials in the gateway and serve\'s tokens out of its environment', async () => {
    // The containers' environments, and serve's process's own (non-dumpable after it dropped root: read with CAP_SYS_PTRACE).
    const environment = async (service: string) => (await exec(service, ['env'])).stdout
    expect(await environment('gateway')).toContain(CREDENTIAL)
    for (const service of ['serve', 'sandbox']) expect(await environment(service), service).not.toContain(CREDENTIAL)
    const serve = await compose(['exec', '-T', '--privileged', 'serve', 'cat', '/proc/1/environ'], 60_000)
    expect(serve.code, serve.stderr).toBe(0)
    expect(serve.stdout).toContain('PRESMIUM_GATEWAY_TOKEN_FILE=')
    for (const token of Object.values(TOKENS)) expect(serve.stdout).not.toContain(token)
    expect(serve.stdout).not.toContain(CREDENTIAL)
  })

  it('lets serve reach no outside address, and sandbox only the gateway', async () => {
    expect(await reaches('serve', 'https://example.com/')).toBe(false)
    expect(await reaches('sandbox', 'https://example.com/')).toBe(false)
    expect(await reaches('sandbox', 'http://serve:4310/')).toBe(false)
    expect(await reaches('sandbox', `http://${EDGE}.11:4310/`)).toBe(false)
    expect(await reaches('sandbox', 'http://gateway:4320/info')).toBe(true)
  })

  it('lets sandbox write a document directory and nothing else of the workspace, nor read agent-host\'s environment', async () => {
    const write = (path: string) => exec('sandbox', ['sh', '-c', `echo sandbox >> ${path}`], 'sandbox')
    expect((await write('/workspace/.git/config')).code).not.toBe(0)
    expect((await write('/workspace/presmium.workspace.yaml')).code).not.toBe(0)
    expect((await write('/workspace/course/notes.txt')).code).toBe(0)
    expect((await exec('sandbox', ['cat', '/proc/1/environ'], 'sandbox')).code).not.toBe(0)
  })
})
