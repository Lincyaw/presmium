// The process sandbox through deltabox (D13, docs/architecture.md 10.6; WP-90). The test deck has no
// workspace configuration: the plugin comes with the CLI. Its Python block probes what it can reach:
// the environments of its ancestors and of every process it can see, a listener of the test on
// 127.0.0.1, the deck directory and its run directory, Docker's socket. Built with a secret in the
// environment of `presmium build` (and, in the last case, of `presmium dev`, the LOCAL server, whose
// own /proc/<pid>/environ the block is told to read), none of it leaks. With
// `settings.presmium.deltabox.sandbox: false` the same build runs without the sandbox, reaches all of
// it, and its report says why. Children the code detaches with `setsid` end at the timeout or with the
// run, so they neither hold the build nor outlive it.
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, Socket } from 'node:net'
import type { AddressInfo, Server } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ADDON_EXEC, env, presmium, presmiumProcess, qualification } from './helpers.ts'

const host = qualification()
if (!host.ok) console.warn(`sandbox.test.ts skipped: ${host.why}`)

const SECRET = `secret-${process.pid}-${Date.now()}`
const DOCKER = '/var/run/docker.sock'

/** The probe block: what it finds, as one JSON line. `server` is a pid whose environment it reads too. */
function probe(port: number, deck: string, server = 0): string {
  return `import json, os, socket

def environ(pid):
    try:
        with open(f'/proc/{pid}/environ', 'rb') as f:
            return 'secret' if b'PRESMIUM_TEST_SECRET=' in f.read() else 'clean'
    except OSError:
        return 'unreadable'

def parent(pid):
    try:
        with open(f'/proc/{pid}/stat') as f:
            stat = f.read()
        return int(stat[stat.rindex(')') + 2:].split()[1])
    except (OSError, ValueError):
        return 0

ancestors = []
pid = os.getppid()
while pid > 0:
    ancestors.append(environ(pid))
    pid = parent(pid)
leaks = [p for p in os.listdir('/proc') if p.isdigit() and environ(p) == 'secret']

def connect(family, address):
    s = socket.socket(family)
    s.settimeout(3)
    try:
        s.connect(address)
        return 'connected'
    except OSError as e:
        return type(e).__name__
    finally:
        s.close()

def write(path):
    try:
        with open(path, 'w') as f:
            f.write('x')
        return 'written'
    except OSError as e:
        return type(e).__name__

print(json.dumps({
    'ancestors': ancestors,
    'leaks': len(leaks),
    'server': environ(${server}) if ${server} else None,
    'listener': connect(socket.AF_INET, ('127.0.0.1', ${port})),
    'deck': write(${JSON.stringify(join(deck, 'sandbox-wrote.txt'))}),
    'run': write('run-dir.txt'),
    'docker': connect(socket.AF_UNIX, ${JSON.stringify(DOCKER)}),
}))
`
}

const deckText = (code: string) => `---
title: 进程沙箱
plugins:
  - ${ADDON_EXEC}
---

## 探测

\`\`\`{code} python
:run:
${code}\`\`\`
`

interface Found { ancestors: string[], leaks: number, server: string | null, listener: string, deck: string, run: string, docker: string }

/** What the probe block recorded in an IR. */
function found(ir: string): Found {
  const doc = JSON.parse(readFileSync(ir, 'utf8')) as { sections: { blocks: { node: { type: string, outputs?: { stdout: string, stderr: string }[] } }[] }[] }
  const output = doc.sections[0]!.blocks.find(block => block.node.type === 'code')!.node.outputs![0]!
  expect(output.stdout, output.stderr).not.toBe('')
  return JSON.parse(output.stdout) as Found
}

/** Whether this test process reaches Docker's socket, which the probe without the sandbox should too. */
function dockerReachable(): Promise<boolean> {
  if (!existsSync(DOCKER)) return Promise.resolve(false)
  return new Promise((resolve) => {
    const socket = new Socket()
    socket.once('connect', () => {
      socket.destroy()
      resolve(true)
    })
    socket.once('error', () => resolve(false))
    socket.connect(DOCKER)
  })
}

describe.skipIf(!host.ok)('process sandbox through deltabox', () => {
  let base: string
  let listener: Server
  let connections = 0
  let port: number

  beforeAll(async () => {
    base = mkdtempSync(join(tmpdir(), 'presmium-sandbox-'))
    listener = createServer((socket) => {
      connections++
      socket.destroy()
    })
    await new Promise<void>(done => listener.listen(0, '127.0.0.1', done))
    port = (listener.address() as AddressInfo).port
  })
  afterAll(async () => {
    await new Promise(done => listener.close(done))
    rmSync(base, { recursive: true, force: true })
  })

  /** A deck of its own (a workspace without configuration, unless `settings` is given) and its build with the secret. */
  async function build(name: string, settings?: string) {
    const deck = join(base, name)
    mkdirSync(deck)
    writeFileSync(join(deck, 'lecture.md'), deckText(probe(port, deck)))
    if (settings) writeFileSync(join(deck, 'presmium.workspace.yaml'), settings)
    const before = connections
    const result = await presmium(['build'], { cwd: deck, env: env({ PRESMIUM_TEST_SECRET: SECRET, XDG_STATE_HOME: join(base, 'state') }) })
    expect(result.code, result.stdout + result.stderr).toBe(0)
    return { deck, result, probed: found(join(deck, 'dist/ir.json')), connected: connections - before }
  }

  it('runs a build\'s code in deltabox: no secret along the parents or anywhere, no network, only the run directory writable, no Docker; the report says so, and says why when the operator turns it off', async () => {
    const sandboxed = await build('sandboxed')
    expect(sandboxed.result.stdout).toContain('isolated by deltabox cbcow-through')
    expect(sandboxed.probed.ancestors.length).toBeGreaterThan(0)
    expect(sandboxed.probed.ancestors).not.toContain('secret')
    expect(sandboxed.probed.leaks).toBe(0)
    expect(sandboxed.probed.listener).not.toBe('connected')
    expect(sandboxed.connected).toBe(0)
    expect(sandboxed.probed.deck).not.toBe('written')
    expect(existsSync(join(sandboxed.deck, 'sandbox-wrote.txt'))).toBe(false)
    expect(sandboxed.probed.run).toBe('written')
    expect(sandboxed.probed.docker).not.toBe('connected')
    expect(readFileSync(join(sandboxed.deck, 'dist/ir.json'), 'utf8')).not.toContain(SECRET)

    // Turned off by the operator: the same build reaches all of it, and the report says why.
    const plain = await build('plain', 'settings:\n  presmium.deltabox:\n    sandbox: false\n')
    expect(plain.result.stdout).not.toContain('isolated by')
    expect(plain.result.stdout).toContain('编译时执行的代码不经进程沙箱运行：运营者设置 settings.presmium.deltabox.sandbox 为 false')
    expect(plain.probed.ancestors).toContain('secret')
    expect(plain.probed.listener).toBe('connected')
    expect(plain.connected).toBe(1)
    expect(plain.probed.deck).toBe('written')
    if (await dockerReachable()) expect(plain.probed.docker).toBe('connected')
  }, 120_000)

  it('ends what the code leaves running: a detached child holding its output at the timeout, one detached away from it with the run', async () => {
    // Without that, the first block would hold the build for its child's whole sleep, and both children would outlive it.
    const holding = 3000 + (process.pid % 1000)
    const away = holding + 1000
    const deck = join(base, 'detached')
    mkdirSync(deck)
    writeFileSync(join(deck, 'lecture.md'), `---
title: 进程沙箱
plugins:
  - ${ADDON_EXEC}
---

## 留下的进程

\`\`\`{code} python
:run:
:timeout: 2000
import subprocess
subprocess.Popen(['sleep', '${holding}'], start_new_session=True)
print('holding')
\`\`\`

\`\`\`{code} python
:run:
import subprocess
subprocess.Popen(['sleep', '${away}'], start_new_session=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
print('away')
\`\`\`
`)
    const result = await presmium(['build'], { cwd: deck, env: env({ XDG_STATE_HOME: join(base, 'state') }) })
    expect(result.code, result.stdout + result.stderr).toBe(0)
    const doc = JSON.parse(readFileSync(join(deck, 'dist/ir.json'), 'utf8')) as { sections: { blocks: { node: { type: string, outputs?: { stdout: string }[] } }[] }[] }
    expect(doc.sections[0]!.blocks.filter(block => block.node.type === 'code').map(block => block.node.outputs![0]!.stdout)).toEqual(['holding\n', 'away\n'])
    const sleeping = readdirSync('/proc').filter(pid => /^\d+$/.test(pid)).flatMap((pid) => {
      try {
        return [readFileSync(`/proc/${pid}/cmdline`, 'utf8')]
      } catch {
        return []
      }
    }).filter(cmdline => cmdline === `sleep\0${holding}\0` || cmdline === `sleep\0${away}\0`)
    expect(sleeping).toEqual([])
  }, 120_000)

  it('keeps the environment of the LOCAL server (presmium dev) out of reach of the code it runs', async () => {
    const deck = join(base, 'dev')
    mkdirSync(deck)
    writeFileSync(join(deck, 'lecture.md'), deckText('print("waiting")\n'))
    const dev = presmiumProcess(['dev'], { cwd: deck, env: env({ PRESMIUM_TEST_SECRET: SECRET, XDG_STATE_HOME: join(base, 'state') }) })
    try {
      await dev.wait(/^watching;/m)
      // The block now names the server's pid; presmium dev compiles it again and runs it.
      writeFileSync(join(deck, 'lecture.md'), deckText(probe(port, deck, dev.child.pid!)))
      const ir = join(deck, '.presmium/dev/ir.json')
      await expect.poll(() => readFileSync(ir, 'utf8'), { timeout: 30_000 }).toContain('ancestors')
      const probed = found(ir)
      expect(probed.server).not.toBe('secret')
      expect(probed.ancestors).not.toContain('secret')
      expect(probed.leaks).toBe(0)
      expect(probed.listener).not.toBe('connected')
    } finally {
      await dev.stop()
    }
  }, 120_000)
})
