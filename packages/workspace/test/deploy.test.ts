// The compose template of a shared deployment (N-09, D13; docs/architecture.md 10.5), started for real.
//
// The layout: oauth2-proxy sends a request without a login to the login, on the site's and the console's
// host names; only it publishes a port; serve, gateway and sandbox run as different uids; the third-party
// credentials of .env are in the gateway only, serve's tokens are not in its environment; serve reaches no
// outside address; sandbox reaches neither the outside nor serve, only the gateway; sandbox writes
// document directories and nothing else of the workspace, and cannot read agent-host's environment.
//
// The SHARED boundary (WP-91), with a login proxy of the test's beside oauth2-proxy (no identity provider
// to log in to) and a Messages-compatible model service that only the gateway reaches, so that the bundled
// DeepSeek Harness works in the sandbox: serve writes nothing where the sandbox may write. While a change
// task waits for its review, the sandbox replaces the document's files with links to .git/config and to
// the workspace configuration and writes attributes naming the operator's git filter: rejecting the
// review, going back to before a step and cancelling the task replace the links, change neither file and
// run no filter. The document operations and a revert are written by agent-host, as the sandbox, and follow
// no link; compile-time code is run and recorded by agent-host, and a link of the execution cache leads
// nowhere; a plugin's writes in serve (a lecture recorded) go through agent-host too, over the sandbox's
// links, and serve fetches no address a document names; a reader's site serves only what the student view's
// pages load (no Markdown, no data file, nothing of the installation but its browser code); the operator's
// files beside compose.yaml never reach the image; serve started as root takes its secrets from files only,
// and none the user it becomes can read.
//
// Needs Docker with compose (and the network for the base image's packages); skipped without it. Several
// checkouts may run it at once: the project and image are named per run (PRESMIUM_TEST_COMPOSE_PREFIX),
// the ports and the edge subnet can be set (PRESMIUM_DEPLOY_PORT, PRESMIUM_DEPLOY_EDGE).
import { execFile, spawnSync } from 'node:child_process'
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { request as httpRequest } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { FIXTURES, raw, ROOT } from './helpers.ts'
import type { RawResponse } from './helpers.ts'

const docker = spawnSync('docker', ['compose', 'version'], { stdio: 'ignore' }).status === 0
  && spawnSync('docker', ['info'], { stdio: 'ignore' }).status === 0
if (!docker) console.warn('[presmium] packages/workspace/test/deploy.test.ts is skipped: it needs Docker with compose (docker compose version); install them and run it again')

const id = Math.random().toString(36).slice(2, 10)
const PREFIX = process.env.PRESMIUM_TEST_COMPOSE_PREFIX ?? 'presmium-test'
const PROJECT = `${PREFIX}-deploy-${id}`
const IMAGE = `${PREFIX}-workspace:test`
const PORT = Number(process.env.PRESMIUM_DEPLOY_PORT ?? 5063)
const LOGIN = PORT + 1
const EDGE = process.env.PRESMIUM_DEPLOY_EDGE ?? '172.29.91'
const COMPOSE = join(ROOT, 'templates/workspace/compose/compose.yaml')
const TEST_COMPOSE = join(FIXTURES, 'compose/compose.test.yaml')
const CREDENTIAL = `deploy-credential-${id}`
const MODEL_KEY = `model-key-${id}`
const TOKENS = { gateway_token: `gateway-${id}`, agent_host_token: `agent-host-${id}` }
const TEACHER = `TEACHERONLY${id}`
/** The operator's files beside compose.yaml in the checkout, as the README has them made (each with this marker). */
const TEMPLATE = join(ROOT, 'templates/workspace/compose')
const OPERATOR = `OPERATORONLY${id}`
const PLANTED = [`.env`, `deploy-${id}.env`, `secrets/deploy-${id}`, `seed/deploy-${id}/lecture.md`]

const CONFIG = `title: 部署测试
# The other documents' links follow a rename; a link to this file in a document is no document's: [笔记](../notes/lecture.md)
members:
  owners: [owner@test]
  editors: [editor@test]
settings:
  presmium.workspace:
    plugins: ['@presmium/slidev-addon-assistant', '@presmium/slidev-addon-exec', '@presmium/slidev-addon-lecture', '@presmium/slidev-addon-publish']
  presmium.exec:
    compile: trusted
`

const LECTURE = (title: string) => `---
title: ${title}
plugins:
  - '@presmium/slidev-addon-exec'
---

# ${title}

部署测试的文档。

\`\`\`{run-panel} python
import os
print('RECORDED BY', os.getuid())
\`\`\`

## 教师笔记

:::{audience} teacher
:::

只给教师：${TEACHER}。
`

/** A document with the lecture plugin, and the publish plugin with a remote image at the test's probe (on `edge`, where serve is). */
const TALK = `---
title: 讲授
plugins:
  - '@presmium/slidev-addon-lecture'
  - '@presmium/slidev-addon-publish'
---

# 讲授

![探针](http://${EDGE}.12:8080/__probe/${id}.png)
`

let dir: string
/** The operator's files this test planted in the checkout (removed afterwards). */
const planted: string[] = []
const compose = (args: string[], timeoutMs = 600_000): Promise<{ code: number, stdout: string, stderr: string }> => new Promise((resolve) => {
  execFile('docker', ['compose', '-p', PROJECT, '-f', COMPOSE, '-f', TEST_COMPOSE, '--project-directory', dir, ...args], {
    env: { ...process.env, PRESMIUM_SOURCE: ROOT, PRESMIUM_IMAGE: IMAGE, PRESMIUM_TEST_FIXTURES: join(FIXTURES, 'compose'), PRESMIUM_LOGIN_PORT: String(LOGIN), PRESMIUM_EDGE: EDGE },
    maxBuffer: 64 << 20,
    timeout: timeoutMs,
  }, (error, stdout, stderr) => resolve({ code: error ? (typeof error.code === 'number' ? error.code : 1) : 0, stdout, stderr }))
})
/** A command in a service's container (as `user`, default the service's), its exit code and output. */
const exec = (service: string, command: string[], user?: string) => compose(['exec', '-T', ...user ? ['-u', user] : [], service, ...command], 60_000)
/** A shell command in the sandbox's container, as the sandbox's user: what the decks' code and the agent may do. */
const asSandbox = (script: string) => exec('sandbox', ['sh', '-c', script], 'sandbox')
/** The sha256 of files of the workspace volume, read as root. */
const hashes = async (...paths: string[]) => (await exec('serve', ['sha256sum', ...paths], 'root')).stdout
/** Whether a request from a service's container gets an HTTP answer at all. */
const reaches = async (service: string, url: string) => (await exec(service, ['node', '-e', `fetch(${JSON.stringify(url)}, { signal: AbortSignal.timeout(5000) }).then(() => process.exit(0), () => process.exit(3))`])).code === 0

/** A request through the test's login proxy, as a member, on the site's host name. */
function route(member: string, path: string, options: { json?: unknown, body?: Uint8Array, method?: string, document?: string } = {}): Promise<RawResponse> {
  return raw(`http://127.0.0.1:${LOGIN}${path}`, { json: options.json, body: options.body, method: options.method, headers: { 'Host': `site.test:${LOGIN}`, 'X-Test-Member': member, ...options.document ? { 'Presmium-Document': options.document } : {} } })
}

/** The events of a task (SSE) as a page follows them. */
function taskEvents(task: string, member: string): Promise<{ next(...types: string[]): Promise<Record<string, any>>, close(): void }> {
  return new Promise((resolve, reject) => {
    const queue: Record<string, any>[] = []
    const waiting: (() => void)[] = []
    let buffer = ''
    const req = httpRequest({ hostname: '127.0.0.1', port: LOGIN, path: `/__presmium/presmium.assistant/tasks/${task}/events`, headers: { 'Host': `site.test:${LOGIN}`, 'X-Test-Member': member, 'Presmium-Document': 'course', 'Accept': 'text/event-stream' } }, (res) => {
      if (res.statusCode !== 200) return reject(new Error(`the events answered ${res.statusCode}`))
      res.setEncoding('utf8').on('data', (chunk: string) => {
        buffer += chunk
        let end: number
        while ((end = buffer.indexOf('\n\n')) >= 0) {
          const data = buffer.slice(0, end).split('\n').filter(line => line.startsWith('data: ')).map(line => line.slice(6)).join('\n')
          buffer = buffer.slice(end + 2)
          if (data) queue.push(JSON.parse(data) as Record<string, any>)
        }
        for (const wake of waiting.splice(0)) wake()
      })
      resolve({
        async next(...types) {
          const end = Date.now() + 300_000
          for (;;) {
            const event = queue.shift()
            if (event && types.includes(event.type)) return event
            if (event?.type === 'error') throw new Error(`the task failed: ${event.message}`)
            if (event) continue
            if (Date.now() > end) throw new Error(`no ${types.join(' or ')} event`)
            await new Promise<void>((wake) => {
              waiting.push(wake)
              setTimeout(wake, 1000)
            })
          }
        },
        close: () => req.destroy(),
      })
    })
    req.on('error', (error) => {
      if (!('code' in error && error.code === 'ECONNRESET')) reject(error)
    })
    req.end()
  })
}

/** Serve's log, to wait for what it says it did. */
async function serveLog(pattern: RegExp, timeoutMs = 180_000): Promise<void> {
  const end = Date.now() + timeoutMs
  for (;;) {
    if (pattern.test((await compose(['logs', '--no-color', 'serve'])).stdout)) return
    if (Date.now() > end) throw new Error(`serve never said ${pattern}`)
    await new Promise(done => setTimeout(done, 2000))
  }
}

describe.skipIf(!docker)('a shared deployment on the compose template', () => {
  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'presmium-deploy-'))
    writeFileSync(join(dir, '.env'), [
      `DEEPSEEK_API_KEY=${CREDENTIAL}`,
      'PRESMIUM_MODEL_URL=http://model:8000',
      `PRESMIUM_MODEL_KEY=${MODEL_KEY}`,
      'PRESMIUM_MODEL_PROVIDER=Test Provider',
      'PRESMIUM_CONSOLE_HOST=console.test',
      `PRESMIUM_PORT=${PORT}`,
      `PRESMIUM_EDGE=${EDGE}`,
      '',
    ].join('\n'))
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
    mkdirSync(join(dir, 'model'))
    // The seed: the configuration, three documents, and the operator's packages at the root (as installed in the image).
    for (const doc of ['course', 'other', 'notes']) {
      mkdirSync(join(dir, 'seed', doc), { recursive: true })
      writeFileSync(join(dir, 'seed', doc, 'lecture.md'), LECTURE(doc === 'course' ? '课程' : doc === 'other' ? '另一份' : '笔记'))
    }
    writeFileSync(join(dir, 'seed/presmium.workspace.yaml'), CONFIG)
    // What only teachers see beside the course's source (a solution, data), and a component of the deck's.
    writeFileSync(join(dir, 'seed/course/solution.py'), `# ${TEACHER}\n`)
    writeFileSync(join(dir, 'seed/course/answers.json'), `{ "answer": "${TEACHER}" }\n`)
    mkdirSync(join(dir, 'seed/course/components'))
    writeFileSync(join(dir, 'seed/course/components/Probe.vue'), '<template><span>probe</span></template>\n')
    mkdirSync(join(dir, 'seed/talk'))
    writeFileSync(join(dir, 'seed/talk/lecture.md'), TALK)
    // The operator's files where the README has them made, in the checkout the image is built from (an
    // existing .env is the operator's own, and stays).
    for (const file of PLANTED) {
      const path = join(TEMPLATE, file)
      if (existsSync(path)) continue
      for (const top of ['secrets', 'seed']) if (file.startsWith(`${top}/`) && !existsSync(join(TEMPLATE, top))) planted.push(join(TEMPLATE, top))
      mkdirSync(join(path, '..'), { recursive: true })
      writeFileSync(path, `PLANTED=${OPERATOR}\n`)
      planted.push(path)
    }
    // The packages the template links at the root (the demo's, as init.sh does), and the assistant.
    const demo = join(ROOT, 'examples/demo/node_modules')
    for (const name of readdirSync(demo).filter(name => !name.startsWith('.'))) {
      for (const entry of name.startsWith('@') ? readdirSync(join(demo, name)).map(child => `${name}/${child}`) : [name]) {
        mkdirSync(join(dir, 'seed/node_modules', entry, '..'), { recursive: true })
        symlinkSync(`/opt/presmium/examples/demo/node_modules/${entry}`, join(dir, 'seed/node_modules', entry))
      }
    }
    // The assistant and the lecture plugin, unless the demo already depends on them.
    for (const [name, pkg] of [['slidev-addon-assistant', 'addon-assistant'], ['slidev-addon-lecture', 'addon-lecture']]) {
      const link = join(dir, 'seed/node_modules/@presmium', name)
      // The links point into the image (/opt/presmium), so look at the link itself, not at what it points to.
      try {
        lstatSync(link)
      } catch {
        symlinkSync(`/opt/presmium/packages/${pkg}`, link)
      }
    }
    writeFileSync(join(dir, 'seed/.gitignore'), 'node_modules\ndist\n.presmium\n')
    const up = await compose(['up', '-d', '--build'], 1_200_000)
    if (up.code !== 0) throw new Error(`docker compose up failed:\n${up.stdout}\n${up.stderr}`)
    // Up once oauth2-proxy and the login proxy answer and serve, gateway and sandbox listen.
    const end = Date.now() + 240_000
    for (;;) {
      const answered = await raw(`http://127.0.0.1:${PORT}/ping`, { timeoutMs: 5000 }).then(r => r.status === 200, () => false)
      const listening = answered && (await Promise.all([reaches('sandbox', 'http://gateway:4320/info'), reaches('gateway', `http://${EDGE}.11:4310/`)])).every(Boolean)
        && (await route('owner@test', '/__presmium/presmium.workspace/documents').then(r => r.status === 200, () => false))
      if (listening) break
      if (Date.now() > end) throw new Error(`the deployment did not come up:\n${(await compose(['logs', '--no-color'])).stdout}`)
      await new Promise(done => setTimeout(done, 2000))
    }
  }, 1_500_000)

  afterAll(async () => {
    for (const path of planted.reverse()) rmSync(path, { recursive: true, force: true })
    // PRESMIUM_DEPLOY_KEEP=1 leaves the deployment up to look at (docker compose -p <project> logs).
    if (process.env.PRESMIUM_DEPLOY_KEEP === '1') return console.warn(`[presmium] the deployment ${PROJECT} stays up in ${dir}`)
    if (dir) {
      await compose(['down', '-v', '--remove-orphans'], 300_000)
      rmSync(dir, { recursive: true, force: true })
    }
  }, 300_000)

  describe('the layout (D13)', () => {
    it('sends a request without a login to the login, on the site\'s host name and the console\'s', async () => {
      for (const host of ['site.test', 'console.test']) {
        const answer = await raw(`http://127.0.0.1:${PORT}/`, { headers: { Host: `${host}:${PORT}` } })
        expect(answer.status, `${host}: ${answer.text.slice(0, 200)}`).toBe(302)
        expect(answer.headers.location).toMatch(/^https:\/\/github\.com\/login\/oauth\/authorize\?/)
      }
    })

    it('publishes no port of serve, gateway and sandbox; they run as different uids', async () => {
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

    it('keeps the operator\'s files beside compose.yaml out of the image: neither the sandbox nor a reader reads them', async () => {
      // Only init.sh of the template's directory is in the image, as root sees it.
      expect((await exec('serve', ['ls', '-A', '/opt/presmium/templates/workspace/compose'], 'root')).stdout.trim()).toBe('init.sh')
      expect((await exec('serve', ['ls', '-A', '/opt/presmium'], 'root')).stdout.trim().split('\n').sort()).toEqual(['examples', 'node_modules', 'package.json', 'packages', 'pnpm-workspace.yaml', 'templates'])
      for (const file of PLANTED) {
        const read = await asSandbox(`cat /opt/presmium/templates/workspace/compose/${file}`)
        expect(read.code, file).not.toBe(0)
        expect(read.stdout).not.toContain(OPERATOR)
        const reader = await route('reader@test', `/course/@fs/opt/presmium/templates/workspace/compose/${file}?raw`)
        expect(reader.status, file).toBe(404)
        expect(reader.text).not.toContain(OPERATOR)
      }
    })

    it('lets sandbox write a document directory and nothing else of the workspace, nor read agent-host\'s environment', async () => {
      const write = (path: string) => exec('sandbox', ['sh', '-c', `echo sandbox >> ${path}`], 'sandbox')
      expect((await write('/workspace/.git/config')).code).not.toBe(0)
      expect((await write('/workspace/presmium.workspace.yaml')).code).not.toBe(0)
      expect((await write('/workspace/course/notes.txt')).code).toBe(0)
      expect((await exec('sandbox', ['rm', '-f', '/workspace/course/notes.txt'], 'sandbox')).code).toBe(0)
      expect((await exec('sandbox', ['cat', '/proc/1/environ'], 'sandbox')).code).not.toBe(0)
    })
  })

  describe('the SHARED boundary (WP-91)', () => {
    const PROTECTED = ['/workspace/.git/config', '/workspace/presmium.workspace.yaml']
    /** The fake model's script from now on. */
    const script = (round: string, steps: unknown[]) => writeFileSync(join(dir, 'model/steps.json'), JSON.stringify({ round, steps }))
    /** A task of the document `course` (a change task of the editor's, or a reader's question). */
    const submit = async (prompt: string, kind: 'chat' | 'question' = 'chat') => {
      const member = kind === 'chat' ? 'editor@test' : 'reader@test'
      const submitted = await route(member, '/__presmium/presmium.assistant/tasks', { document: 'course', json: { kind, prompt, context: { document: 'course', section: 'x' } } })
      expect(submitted.status, submitted.text).toBe(201)
      return { task: submitted.json<{ id: string }>().id, member }
    }
    /** A task, followed (its event stream answers once it has an event, and replays from the first). */
    const start = async (prompt: string, kind: 'chat' | 'question' = 'chat') => {
      const { task, member } = await submit(prompt, kind)
      return { task, events: await taskEvents(task, member) }
    }

    it('rolls a change task back over the sandbox\'s links to .git/config and the configuration, following none and running no git filter: rejected, gone back on, cancelled', async () => {
      // The operator's filter, as git LFS would be configured: it leaves a trace when it runs. Documents name it.
      for (const [key, value] of [['filter.probe.clean', 'sh -c "date >> /tmp/probe-ran; cat"'], ['filter.probe.smudge', 'sh -c "date >> /tmp/probe-ran; cat"'], ['diff.probe.textconv', 'sh -c "date >> /tmp/probe-ran; cat"'], ['merge.probe.driver', 'sh -c "date >> /tmp/probe-ran; true"']] as const) {
        expect((await exec('serve', ['git', '--git-dir', '/workspace/.git', 'config', key, value], 'serve')).code).toBe(0)
      }
      const before = await hashes(...PROTECTED)
      const lecture = (await exec('serve', ['cat', '/workspace/course/lecture.md'])).stdout
      const plant = () => asSandbox([
        'ln -sfn /workspace/.git/config /workspace/course/lecture.md',
        'ln -sfn /workspace/presmium.workspace.yaml /workspace/course/notes.md',
        'printf "* filter=probe diff=probe merge=probe\\n" > /workspace/course/.gitattributes',
      ].join(' && '))
      const unchanged = async () => {
        expect(await hashes(...PROTECTED)).toBe(before)
        expect((await exec('serve', ['test', '-e', '/tmp/probe-ran'])).code).not.toBe(0)
        expect((await exec('serve', ['cat', '/workspace/course/lecture.md'])).stdout).toBe(lecture)
        expect((await exec('serve', ['test', '-L', '/workspace/course/lecture.md'])).code).not.toBe(0)
      }
      const post = (task: string, action: string, json: unknown) => route('editor@test', `/__presmium/presmium.assistant/tasks/${task}/${action}`, { document: 'course', json })

      // Rejected: the agent wrote a note; the sandbox planted its links and attributes meanwhile.
      script('reject', [{ tool: 'write', input: { file_path: 'notes.md', content: '笔记\n' } }, { text: '写了笔记。' }])
      const first = await start('写一条笔记')
      expect((await first.events.next('review')).changes.map((c: { path: string }) => c.path)).toEqual(['course/notes.md'])
      expect((await plant()).code).toBe(0)
      expect((await post(first.task, 'review', { accept: false })).status).toBe(204)
      await first.events.next('done')
      first.events.close()
      await unchanged()
      expect((await exec('serve', ['test', '-e', '/workspace/course/notes.md'])).code).not.toBe(0)
      expect((await exec('serve', ['test', '-e', '/workspace/course/.gitattributes'])).code).not.toBe(0)

      // Gone back to before the second step over the links, then cancelled over them again.
      script('restore', [{ tool: 'write', input: { file_path: 'notes.md', content: '第一步\n' } }, { tool: 'write', input: { file_path: 'summary.md', content: '第二步\n' } }, { text: '写了两个文件。' }])
      const second = await start('写两个文件')
      const review = await second.events.next('review')
      expect(review.steps.length).toBeGreaterThanOrEqual(2)
      expect((await plant()).code).toBe(0)
      expect((await post(second.task, 'restore', { step: review.steps.at(-1).id })).status).toBe(204)
      await second.events.next('review')
      expect(await hashes(...PROTECTED)).toBe(before)
      expect((await exec('serve', ['cat', '/workspace/course/notes.md'])).stdout).toBe('第一步\n')
      expect((await exec('serve', ['test', '-e', '/workspace/course/summary.md'])).code).not.toBe(0)
      expect((await plant()).code).toBe(0)
      expect((await post(second.task, 'cancel', {})).status).toBe(204)
      await second.events.next('done')
      second.events.close()
      await unchanged()
      expect((await exec('serve', ['test', '-e', '/workspace/course/notes.md'])).code).not.toBe(0)
      // Nothing was committed, and the sandbox wrote what was put back.
      expect((await exec('serve', ['git', '--git-dir', '/workspace/.git', 'log', '--format=%s', '-1'], 'serve')).stdout.trim()).toBe('Initial commit')
      expect((await exec('serve', ['stat', '-c', '%u', '/workspace/course/lecture.md'])).stdout.trim()).toBe('1003')
    }, 900_000)

    it('is as 9.4 says: another process of the sandbox reads a running agent\'s environment, whose session token reaches the model until the session ends; agent-host\'s it cannot read', async () => {
      // The agent waits for its model meanwhile.
      script('residual', [{ text: '稍等之后的回答。', delayMs: 30_000 }])
      const { task, member } = await submit('一个问题', 'question')
      const probe = `const fs = require('fs'); for (const pid of fs.readdirSync('/proc').filter(n => /^\\d+$/.test(n))) { try { const key = /DEEPSEEK_API_KEY=([^\\0]+)/.exec(fs.readFileSync('/proc/' + pid + '/environ', 'utf8')); if (key) console.log(key[1]) } catch {} }`
      let token = ''
      for (const end = Date.now() + 60_000; !token && Date.now() < end;) {
        const found = await exec('sandbox', ['node', '-e', probe], 'sandbox')
        token = found.stdout.trim().split('\n')[0] ?? ''
        if (!token) await new Promise(done => setTimeout(done, 500))
      }
      expect(token).not.toBe('')
      const model = async () => (await exec('sandbox', ['node', '-e', `fetch('http://gateway:4320/presmium.assistant/model/v1/messages', { method: 'POST', headers: { authorization: 'Bearer ${token}', 'content-type': 'application/json' }, body: '{"model":"m","max_tokens":1,"messages":[{"role":"user","content":"x"}]}' }).then(r => console.log(r.status))`], 'sandbox')).stdout.trim()
      expect(await model()).toBe('200')
      const events = await taskEvents(task, member)
      await events.next('done')
      events.close()
      expect(await model()).toBe('401')
      expect((await exec('sandbox', ['cat', '/proc/1/environ'], 'sandbox')).code).not.toBe(0)
    }, 300_000)

    it('writes the document operations and a revert as the sandbox, following no link of the documents', async () => {
      const before = await hashes(...PROTECTED)
      // The sandbox's links in a document: to the configuration (which holds a link a rename would rewrite) and to the git directory.
      expect((await asSandbox('ln -s /workspace/presmium.workspace.yaml /workspace/other/evil.md && ln -s /workspace/.git /workspace/other/repository')).code).toBe(0)
      const operate = (json: unknown) => route('editor@test', '/__presmium/presmium.workspace/documents', { json })
      const renamed = await operate({ op: 'rename', dir: 'notes', to: 'notes2' })
      expect(renamed.status, renamed.text).toBe(200)
      expect((await operate({ op: 'copy', dir: 'other', to: 'other-copy' })).status).toBe(200)
      expect((await exec('serve', ['stat', '-c', '%u %F', '/workspace/other-copy/lecture.md', '/workspace/other-copy/evil.md', '/workspace/other-copy/repository'])).stdout.trim().split('\n')).toEqual(['1003 regular file', '1003 symbolic link', '1003 symbolic link'])
      expect((await operate({ op: 'create', dir: 'week3', title: '第三周' })).status).toBe(200)
      expect((await exec('serve', ['stat', '-c', '%u %g %a', '/workspace/week3', '/workspace/week3/lecture.md'])).stdout.trim().split('\n')).toEqual(['1001 1100 2775', '1003 1100 664'])
      expect((await operate({ op: 'delete', dir: 'other-copy' })).status).toBe(200)
      // The revert of the rename: serve makes the directory back, the sandbox writes its files.
      const reverted = await route('editor@test', '/__presmium/presmium.workspace/revisions/revert', { json: { id: renamed.json<{ revision: { id: string } }>().revision.id } })
      expect(reverted.status, reverted.text).toBe(200)
      expect((await exec('serve', ['stat', '-c', '%u %g %a', '/workspace/notes', '/workspace/notes/lecture.md'])).stdout.trim().split('\n')).toEqual(['1001 1100 2775', '1003 1100 664'])
      expect((await exec('serve', ['test', '-e', '/workspace/notes2/lecture.md'])).code).not.toBe(0)
      expect(await hashes(...PROTECTED)).toBe(before)
      expect((await exec('serve', ['ls', '/workspace/.git'], 'root')).stdout).not.toMatch(/lecture|evil/)
      // The operator's own change of the configuration: an editor may not revert it, an owner may.
      const git = 'git -c user.name=Operator -c user.email=operator@test -C /workspace'
      expect((await exec('serve', ['sh', '-c', `printf "# a setting of the operator's\\n" >> /workspace/presmium.workspace.yaml && ${git} commit -qm "Operator settings" -- presmium.workspace.yaml && ${git} rev-parse HEAD`], 'serve')).code).toBe(0)
      const operator = (await exec('serve', ['git', '-C', '/workspace', 'rev-parse', 'HEAD'], 'serve')).stdout.trim()
      const byEditor = await route('editor@test', '/__presmium/presmium.workspace/revisions/revert', { json: { id: operator } })
      expect(byEditor.status, byEditor.text).toBe(403)
      expect((await exec('serve', ['git', '-C', '/workspace', 'rev-parse', 'HEAD'], 'serve')).stdout.trim()).toBe(operator)
      expect((await route('owner@test', '/__presmium/presmium.workspace/revisions/revert', { json: { id: operator } })).status).toBe(200)
    }, 600_000)

    it('runs and records compile-time code in agent-host, as the sandbox; a link of the execution cache leads nowhere', async () => {
      // `other`'s execution cache is a link to the git directory, planted before anyone opened it.
      expect((await asSandbox('mkdir -p /workspace/other/.presmium && ln -s /workspace/.git /workspace/other/.presmium/freeze')).code).toBe(0)
      const listing = (await exec('serve', ['ls', '-a', '/workspace/.git'], 'root')).stdout
      for (const doc of ['course', 'other']) expect((await route('editor@test', `/${doc}/`)).status).toBe(200)
      await serveLog(/agent-host ran and recorded \d+ of 1 code block of course/)
      await serveLog(/agent-host ran and recorded \d+ of 1 code block of other/)
      const recorded = (await exec('serve', ['sh', '-c', 'stat -c %u /workspace/course/.presmium/freeze/*.json && cat /workspace/course/.presmium/freeze/*.json'])).stdout
      expect(recorded.split('\n')[0]).toBe('1003')
      expect(recorded).toContain('RECORDED BY 1003')
      expect((await exec('serve', ['ls', '-a', '/workspace/.git'], 'root')).stdout).toBe(listing)
    }, 600_000)

    it('lets no `.git` or `node_modules` the sandbox plants in a document move the workspace\'s root or load a plugin, in serve or in agent-host', async () => {
      // A new document whose first compilation is still to come: the sandbox plants a `.git` git cannot read, and a
      // package of its own where the operator's plugin would be if the document were the workspace's root.
      expect((await route('editor@test', '/__presmium/presmium.workspace/documents', { json: { op: 'create', dir: 'planted', title: '埋下' } })).status).toBe(200)
      const plugin = '/workspace/planted/node_modules/@presmium/slidev-addon-exec'
      expect((await asSandbox([
        'printf "gitdir: /nowhere\\n" > /workspace/planted/.git',
        `mkdir -p ${plugin}`,
        `printf '{"name":"@presmium/slidev-addon-exec","type":"module","exports":{"./presmium":"./presmium.mjs"}}' > ${plugin}/package.json`,
        `printf 'import { writeFileSync } from "node:fs"\\nwriteFileSync("/tmp/planted-plugin-ran", String(process.getuid()))\\nexport default { id: "presmium.exec", version: "0.1.0", kernel: "^0.1.0", operator: true }\\n' > ${plugin}/presmium.mjs`,
      ].join(' && '))).code).toBe(0)
      // Compiled in serve for the page, and in agent-host for its site.
      expect((await route('editor@test', '/planted/')).status).toBe(200)
      for (const service of ['serve', 'sandbox']) expect((await exec(service, ['test', '-e', '/tmp/planted-plugin-ran'])).code, service).not.toBe(0)
    }, 300_000)

    it('serves a reader only what the student view\'s pages load through the site\'s dev server, nor the history; an editor the whole document', async () => {
      const path = '/course/@fs/workspace/course/lecture.md?raw'
      expect((await route('reader@test', '/course/')).status).toBe(200)
      const reader = await route('reader@test', path)
      expect(reader.status).toBe(404)
      expect(reader.text).not.toContain(TEACHER)
      // Neither the configuration, nor a file only the teachers' parts include (a solution, data), nor a link to one.
      expect((await asSandbox('ln -sfn /workspace/course/solution.py /workspace/course/components/Answer.js')).code).toBe(0)
      for (const file of ['presmium.workspace.yaml', 'course/solution.py', 'course/answers.json', 'course/components/Answer.js', 'course/components/x&/../../solution.py']) {
        const answer = await route('reader@test', `/course/@fs/workspace/${file}?raw`)
        expect(answer.status, file).toBeGreaterThanOrEqual(400)
        expect(answer.text).not.toContain(TEACHER)
      }
      // Nor what is no browser code of the installation; a component of the deck and Presmium's browser code it does.
      for (const file of ['/opt/presmium/package.json', '/opt/presmium/packages/workspace/src/node/files.ts', '/opt/presmium/packages/cli/bin/presmium.mjs']) {
        expect((await route('reader@test', `/course/@fs${file}?raw`)).status, file).toBe(404)
      }
      expect((await route('reader@test', '/course/@fs/workspace/course/components/Probe.vue?raw')).status).toBe(200)
      expect((await route('reader@test', '/course/@fs/opt/presmium/packages/viewer/src/viewer.ts')).status).toBe(200)
      expect((await asSandbox('rm /workspace/course/components/Answer.js')).code).toBe(0)
      const editor = await route('editor@test', path)
      expect(editor.status).toBe(200)
      expect(editor.text).toContain(TEACHER)
      expect((await route('editor@test', '/course/@fs/workspace/course/solution.py?raw')).text).toContain(TEACHER)
      // Nor the history, whose messages quote what editors asked of the agent.
      expect((await route('reader@test', '/__presmium/presmium.workspace/revisions')).status).toBe(403)
    }, 300_000)

    it('has a plugin\'s writes in serve made by agent-host, following none of the sandbox\'s links: a lecture recorded; serve fetches no address a document names', async () => {
      const before = await hashes(...PROTECTED)
      const listing = (await exec('serve', ['ls', '-a', '/workspace/.git'], 'root')).stdout
      const lecture = (rest: string, options: { json?: unknown, body?: Uint8Array, method?: string } = {}) => route('editor@test', `/__presmium/presmium.lecture/${rest}`, { ...options, document: 'talk' })
      // The lectures' directory is a link to the git directory: the recording's git files go in a directory of its own.
      expect((await asSandbox('ln -sfn /workspace/.git /workspace/talk/lectures')).code).toBe(0)
      const started = await lecture('recordings', { json: {} })
      expect(started.status, started.text).toBe(200)
      const track = started.json<{ id: string }>().id
      expect((await exec('serve', ['stat', '-c', '%F', '/workspace/talk/lectures'])).stdout.trim()).toBe('directory')
      // The media file is a link to .git/config, the track one to a new file in the git directory, when serve writes them.
      const media = await lecture(`recordings/${track}/media`, { json: { folder: 'audio', section: 'intro', ext: 'ogg' } })
      expect(media.status, media.text).toBe(200)
      const src = media.json<{ src: string }>().src
      expect((await asSandbox(`mkdir -p /workspace/talk/lectures/${track}/audio && ln -sfn /workspace/.git/config /workspace/talk/lectures/${track}/${src} && ln -sfn /workspace/.git/planted-track.json /workspace/talk/lectures/${track}/track.json`)).code).toBe(0)
      const chunk = await lecture(`recordings/${track}/files/${src}?at=0`, { method: 'PUT', body: new TextEncoder().encode('OggS recorded') })
      expect(chunk.status, chunk.text).toBe(200)
      const head = { doc: 'lecture.md', irHash: 'x', lang: 'zh-CN', sections: {}, voice: { kind: 'recorded' }, blocks: {} }
      const finished = await lecture(`recordings/${track}/finish`, { json: { head, recording: { events: [], audio: [], video: [], utterances: [], duration: 1000 } } })
      expect(finished.status, finished.text).toBe(200)
      expect(await hashes(...PROTECTED)).toBe(before)
      expect((await exec('serve', ['ls', '-a', '/workspace/.git'], 'root')).stdout).toBe(listing)
      const files = (await exec('serve', ['stat', '-c', '%u %F', `/workspace/talk/lectures/${track}/${src}`, `/workspace/talk/lectures/${track}/track.json`])).stdout.trim().split('\n')
      expect(files).toEqual(['1003 regular file', '1003 regular file'])
      expect((await exec('serve', ['cat', `/workspace/talk/lectures/${track}/${src}`])).stdout).toBe('OggS recorded')
      // The page compiled in serve (and its site in agent-host) with a remote image at the probe: nothing fetched it.
      expect((await route('editor@test', '/talk/')).status).toBe(200)
      expect((await raw(`http://127.0.0.1:${LOGIN}/__probes`)).json<string[]>()).toEqual([])
      expect((await exec('serve', ['test', '-e', '/workspace/talk/.presmium/assets'])).code).not.toBe(0)
    }, 300_000)

    it('takes serve\'s secrets from files only when it starts as root, and only files the user it becomes cannot read', async () => {
      // A second serve in serve's container, as compose starts it (root, to become serve), with a token in a variable too.
      const run = await compose(['exec', '-T', '-u', 'root', '-e', 'PRESMIUM_GATEWAY_TOKEN=plain-variable', 'serve', 'presmium', 'serve', '/workspace', '--host', '127.0.0.1', '--port', '4399', '--trust-proxy-from', '127.0.0.2', '--user', 'serve'], 120_000)
      expect(run.code).not.toBe(0)
      expect(`${run.stdout}${run.stderr}`).toMatch(/PRESMIUM_GATEWAY_TOKEN is set in the environment of a process started as root/)
      // A token file the user it becomes can read (a host file owned by serve's uid): refused once it became that user.
      const readable = await compose(['exec', '-T', '-u', 'root', 'serve', 'sh', '-c', 'cp /run/secrets/gateway_token /tmp/gateway_token && chown serve /tmp/gateway_token && chmod 600 /tmp/gateway_token && PRESMIUM_GATEWAY_TOKEN_FILE=/tmp/gateway_token exec presmium serve /workspace --host 127.0.0.1 --port 4398 --trust-proxy-from 127.0.0.2 --user serve'], 120_000)
      expect(readable.code).not.toBe(0)
      expect(`${readable.stdout}${readable.stderr}`).toMatch(/\/tmp\/gateway_token can be read by the user this process became/)
    }, 300_000)
  })
})
