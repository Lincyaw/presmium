// A reader's path to the synthesized lecture in SHARED mode (WP-84, WP-83's leftover; docs/ir.md 6.3): on this
// machine `presmium serve` behind a login proxy's secret, `presmium gateway` with the fake speech engine
// (`presmium-speech fake`, a process of its own) and `presmium agent-host`. Synthesis is paid, so a reader's
// request for `tracks/script` before any editor's is refused (409, the player's hint) and asks the engine for
// nothing; an editor's request has it made; the reader then gets that lecture, and the engine no new request.
import { execFileSync, spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { request as httpRequest } from 'node:http'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PRESMIUM_BIN } from '@presmium/cli/testing'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const ADDON = fileURLToPath(new URL('..', import.meta.url))
const SPEECH = fileURLToPath(new URL('../../addon-speech', import.meta.url))
/** Workspaces served live in examples/demo/.presmium (ignored by git), where VitePress resolves. */
const WORK = fileURLToPath(new URL('../../../examples/demo/.presmium', import.meta.url))

/** The environment without Presmium's variables or credentials, plus `extra`. */
function env(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const clean: NodeJS.ProcessEnv = { ...process.env }
  delete clean.NODE_ENV
  for (const name of Object.keys(clean)) if (name.startsWith('PRESMIUM_') || /(?:_KEY|_TOKEN|_SECRET|_PASSWORD|_APPID)$/i.test(name)) delete clean[name]
  return { ...clean, ...extra }
}

interface Running {
  child: ChildProcess
  output(): string
  /** Resolves with the first match of `pattern` in the output. */
  wait(pattern: RegExp): Promise<string>
  stop(): Promise<void>
}

function start(command: string, args: string[], cwd: string, extra: Record<string, string>): Running {
  const child = spawn(process.execPath, [command, ...args], { cwd, env: env(extra), stdio: ['ignore', 'pipe', 'pipe'] })
  let output = ''
  child.stdout!.on('data', (chunk: Buffer) => output += chunk)
  child.stderr!.on('data', (chunk: Buffer) => output += chunk)
  return {
    child,
    output: () => output,
    wait: pattern => new Promise((resolve, reject) => {
      const check = () => {
        const found = pattern.exec(output)
        if (found) resolve(found[1]!)
      }
      child.stdout!.on('data', check)
      child.stderr!.on('data', check)
      child.once('exit', code => reject(new Error(`exited (${code}) before ${pattern}:\n${output}`)))
      check()
    }),
    async stop() {
      if (child.exitCode !== null || child.signalCode !== null) return
      const exited = new Promise(done => child.once('exit', done))
      child.kill('SIGTERM')
      await exited
    },
  }
}

/** A GET with exactly these headers (`Host` included, which fetch cannot set). */
function get(url: string, headers: Record<string, string>): Promise<{ status: number, text: string }> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(url, { headers, setHost: false, timeout: 120_000 }, (res) => {
      let text = ''
      res.setEncoding('utf8')
      res.on('data', (chunk: string) => text += chunk)
      res.on('end', () => resolve({ status: res.statusCode ?? 0, text }))
    })
    req.on('timeout', () => req.destroy(new Error(`timed out: ${url}`)))
    req.on('error', reject)
    req.end()
  })
}

describe('the synthesized lecture for a reader (SHARED)', () => {
  const id = Math.random().toString(36).slice(2, 10)
  const secrets = { proxy: `proxy-${id}`, gateway: `gateway-${id}`, agentHost: `agent-host-${id}` }
  let dir: string
  let operator: string
  const running: Running[] = []
  let fake: string
  let url: string

  beforeAll(async () => {
    const engine = start(join(SPEECH, 'bin/presmium-speech.mjs'), ['fake', '--port', '0'], tmpdir(), {})
    running.push(engine)
    fake = await engine.wait(/^fake {2}(http\S+)$/m)
    mkdirSync(WORK, { recursive: true })
    dir = mkdtempSync(join(WORK, 'lecture-reader-'))
    operator = mkdtempSync(join(tmpdir(), 'presmium-lecture-operator-'))
    const files: Record<string, string> = {
      'presmium.workspace.yaml': 'title: 讲授\nmembers:\n  owners: [owner@test]\n  editors: [editor@test]\nsettings:\n  presmium.workspace:\n    plugins: ["@presmium/slidev-addon-lecture", "@presmium/slidev-addon-speech"]\n',
      'talk/lecture.md': '---\ntitle: 讲授\nplugins:\n  - "@presmium/slidev-addon-lecture"\n  - "@presmium/slidev-addon-speech"\nrenderers:\n  lecture:\n    voice: { engine: fake, voice: alpha }\n---\n\n(intro)=\n# 开场\n\n读者听到的讲授。\n',
      '.gitignore': 'node_modules/\ndist/\n.presmium/\n',
      'package.json': `${JSON.stringify({ name: dir.split('/').at(-1)!.toLowerCase(), private: true, type: 'module' })}\n`,
    }
    for (const [path, text] of Object.entries(files)) {
      mkdirSync(dirname(join(dir, path)), { recursive: true })
      writeFileSync(join(dir, path), text)
    }
    mkdirSync(join(dir, 'node_modules/@presmium'), { recursive: true })
    symlinkSync(ADDON, join(dir, 'node_modules/@presmium/slidev-addon-lecture'), 'junction')
    symlinkSync(SPEECH, join(dir, 'node_modules/@presmium/slidev-addon-speech'), 'junction')
    const git = (args: string[]) => execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', '-c', 'commit.gpgSign=false', '-c', 'core.hooksPath=/dev/null', ...args], { cwd: dir })
    git(['init', '-q', '-b', 'main'])
    git(['add', '-A'])
    git(['commit', '-q', '-m', 'Initial commit'])

    const agentHost = start(PRESMIUM_BIN, ['agent-host', '--port', '0'], dir, { PRESMIUM_AGENT_HOST_TOKEN: secrets.agentHost })
    const gateway = start(PRESMIUM_BIN, ['gateway', '--port', '0', '--operator-dir', operator], dir, { PRESMIUM_GATEWAY_TOKEN: secrets.gateway, PRESMIUM_SPEECH_FAKE_URL: fake, PRESMIUM_SPEECH_FAKE_PROVIDER: 'Presmium fake' })
    running.push(agentHost, gateway)
    const [agentHostUrl, gatewayUrl] = await Promise.all([agentHost.wait(/^agent-host {2}(http\S+)$/m), gateway.wait(/^gateway {2}(http\S+)$/m)])
    const serve = start(PRESMIUM_BIN, ['serve', '--port', '0'], dir, {
      PRESMIUM_PROXY_SECRET: secrets.proxy,
      PRESMIUM_GATEWAY_URL: gatewayUrl,
      PRESMIUM_GATEWAY_TOKEN: secrets.gateway,
      PRESMIUM_AGENT_HOST_URL: agentHostUrl,
      PRESMIUM_AGENT_HOST_TOKEN: secrets.agentHost,
      PRESMIUM_CONSOLE_HOST: 'console.test',
    })
    running.unshift(serve)
    url = await serve.wait(/^serve {2}(http\S+)$/m)
  }, 240_000)

  afterAll(async () => {
    for (const child of running) await child.stop()
    for (const path of [dir, operator]) if (path) rmSync(path, { recursive: true, force: true })
  }, 60_000)

  /** A route of the lecture plugin as the login proxy forwards a member's request. */
  const as = (email: string, path: string) => get(`${url}/__presmium/presmium.lecture/${path}`, {
    'Host': `site.test:${new URL(url).port}`,
    'X-Presmium-Proxy-Secret': secrets.proxy,
    'X-Forwarded-Email': email,
    'Presmium-Document': 'talk',
  })
  const syntheses = async () => ((await (await fetch(new URL('/requests', fake))).json()) as { requests: { method: string, path: string }[] }).requests.filter(r => r.method === 'POST' && r.path.startsWith('/v1/audio/speech')).length

  it('refuses a reader before an editor had it made, asking the engine nothing; then gives the reader the editor\'s', async () => {
    const listed = await as('reader@test', 'tracks')
    expect(listed.status, `${listed.text}\n${running[0]!.output()}`).toBe(200)
    expect(JSON.parse(listed.text)).toEqual([expect.objectContaining({ id: 'script', voice: expect.objectContaining({ kind: 'synthetic' }) })])

    const refused = await as('reader@test', 'tracks/script')
    expect(refused.status, refused.text).toBe(409)
    expect(JSON.parse(refused.text).error).toContain('synthesized when an editor opens it')
    expect(await syntheses()).toBe(0)

    const made = await as('editor@test', 'tracks/script')
    expect(made.status, made.text).toBe(200)
    const track = JSON.parse(made.text) as { voice: Record<string, unknown>, utterances: { text: string }[] }
    expect(track.voice).toMatchObject({ kind: 'synthetic', engine: 'fake', voice: 'alpha', provider: 'Presmium fake' })
    expect(track.utterances.map(u => u.text)).toEqual(['读者听到的讲授。'])
    const asked = await syntheses()
    expect(asked).toBe(1)

    const read = await as('reader@test', 'tracks/script')
    expect(read.status, read.text).toBe(200)
    expect(JSON.parse(read.text)).toEqual(track)
    expect(await syntheses()).toBe(asked)
  }, 180_000)
})
