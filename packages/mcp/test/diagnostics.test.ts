import { execFileSync, spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client } from '@modelcontextprotocol/client'
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio'
import type { DiagnosticSnapshot } from '@lincyaw/kernel'
import { expect, it } from 'vitest'
import { connectPresmiumMcp } from '../src/client.ts'
import type { PresmiumMcpClient } from '../src/client.ts'
import { DIAGNOSTICS_URI } from '../src/index.ts'

const FIXTURE = fileURLToPath(new URL('./fixtures/diagnostics', import.meta.url))
const PRESMIUM = fileURLToPath(new URL('../../cli/bin/presmium.mjs', import.meta.url))
const MCP = fileURLToPath(new URL('../bin/presmium-mcp.mjs', import.meta.url))
const WORK = fileURLToPath(new URL('../../../e2e/fixtures/regression/.presmium', import.meta.url))
const TOKEN = 'diagnostics-integration-service-token'

function fixture(): string {
  mkdirSync(WORK, { recursive: true })
  const dir = mkdtempSync(join(WORK, 'mcp-diagnostics-'))
  cpSync(FIXTURE, dir, { recursive: true })
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'diagnostic-subscriptions', private: true, type: 'module' }))
  writeFileSync(join(dir, '.gitignore'), '.home/\nnode_modules/\ndist/\n.presmium/\n')
  execFileSync('git', ['init', '-q'], { cwd: dir })
  return dir
}

function env(dir: string): NodeJS.ProcessEnv {
  const own: NodeJS.ProcessEnv = {}
  for (const [name, value] of Object.entries(process.env)) {
    if (name === 'NODE_ENV' || /^(?:PRESMIUM_|DEEPSEEK_|DSH_|XDG_)/.test(name) || /(?:_KEY|_TOKEN|_SECRET|_PASSWORD|_APPID)$/i.test(name)) continue
    own[name] = value
  }
  const home = join(dir, '.home')
  mkdirSync(home)
  return { ...own, HOME: home, XDG_CACHE_HOME: join(home, 'cache'), XDG_STATE_HOME: join(home, 'state'), XDG_CONFIG_HOME: join(home, 'config'), PRESMIUM_SERVICE_TOKEN: TOKEN }
}

async function started(child: ChildProcess, pattern = /^serve {2}(http\S+)$/m): Promise<string> {
  let output = ''
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`the service did not start:\n${output}`)), 120_000)
    const read = (chunk: Buffer) => {
      output += chunk
      const match = pattern.exec(output)
      if (!match) return
      clearTimeout(timer)
      resolve(match[1]!)
    }
    child.stdout!.on('data', read)
    child.stderr!.on('data', read)
    child.once('exit', code => { clearTimeout(timer); reject(new Error(`the service exited (${code}):\n${output}`)) })
  })
}

async function stop(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return
  const exited = new Promise<void>(resolve => child.once('exit', () => resolve()))
  child.kill('SIGTERM')
  await exited
}

it('subscribes to current diagnostics, observes errors and repairs without running checks, and keeps document-bound notifications isolated', async () => {
  const dir = fixture()
  const child = spawn(process.execPath, [PRESMIUM, 'serve', '--port', '0'], { cwd: dir, env: env(dir), stdio: ['ignore', 'pipe', 'pipe'] })
  const clients: PresmiumMcpClient[] = []
  try {
    const url = await started(child)
    const connect = async (document: string) => {
      const response = await fetch(`${url}/__presmium/presmium.server/tokens`, { method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ document, session: `diagnostics-${document}` }) })
      expect(response.status, await response.clone().text()).toBe(201)
      const grant = await response.json() as { url: string, token: string }
      const client = await connectPresmiumMcp(grant.url, grant.token, 'diagnostics-integration')
      clients.push(client)
      return client
    }
    const one = await connect('one')
    const two = await connect('two')
    const uri = (document: string) => `${DIAGNOSTICS_URI}?document=${encodeURIComponent(document)}`
    const read = async (client: PresmiumMcpClient, document: string) => await client.read(uri(document)) as DiagnosticSnapshot
    const initial = await read(one, 'one')
    expect(initial.diagnostics).toEqual([])
    expect((await read(two, 'two')).diagnostics).toEqual([])
    expect(await one.read(DIAGNOSTICS_URI)).toEqual(initial)
    await expect(one.read(uri('two'))).rejects.toThrow('this token is for the document "one"')

    let first = 0
    let duplicate = 0
    let bare = 0
    let second = 0
    const cancelFirst = await one.subscribe(uri('one'), () => first++)
    const cancelDuplicate = await one.subscribe(uri('one'), () => duplicate++)
    const cancelBare = await one.subscribe(DIAGNOSTICS_URI, () => bare++)
    const cancelSecond = await two.subscribe(uri('two'), () => second++)
    const file = join(dir, 'one/lecture.md')
    const original = readFileSync(file, 'utf8')
    writeFileSync(file, original.replace('title: First document', 'title: Broken first document'))
    await expect.poll(() => first).toBeGreaterThan(0)
    expect(duplicate).toBeGreaterThan(0)
    expect(bare).toBeGreaterThan(0)
    expect(second).toBe(0)
    const broken = await read(one, 'one')
    expect(broken.version).toBeGreaterThan(initial.version)
    expect(broken.diagnostics).toEqual([expect.objectContaining({ document: 'one', origin: 'compile', severity: 'error', checkId: 'fixture.diagnostics.compile', source: { file: 'one/lecture.md', line: 2 } })])
    expect(broken.diagnostics[0]!.id).toBeTruthy()
    expect(existsSync(join(dir, 'check-ran'))).toBe(false)

    await cancelFirst()
    const seen = first
    const beforeRepair = duplicate
    writeFileSync(file, original)
    await expect.poll(() => duplicate).toBeGreaterThan(beforeRepair)
    expect(first).toBe(seen)
    const repaired = await read(one, 'one')
    expect(repaired.version).toBeGreaterThan(broken.version)
    expect(repaired.diagnostics).toEqual([])
    const bareBeforeSecond = bare
    const firstBeforeSecond = duplicate
    const secondFile = join(dir, 'two/lecture.md')
    writeFileSync(secondFile, readFileSync(secondFile, 'utf8').replace('title: Second document', 'title: Broken second document'))
    await expect.poll(() => second).toBeGreaterThan(0)
    expect(bare).toBe(bareBeforeSecond)
    expect(duplicate).toBe(firstBeforeSecond)
    expect((await read(two, 'two')).diagnostics).toEqual([expect.objectContaining({ document: 'two', origin: 'compile' })])
    expect(existsSync(join(dir, 'check-ran'))).toBe(false)
    await cancelDuplicate()
    await cancelDuplicate()
    await cancelBare()
    await cancelSecond()
    const stopped = [first, duplicate, bare, second]
    const checked = await one.call('get_diagnostics', {})
    expect(checked.isError, checked.text).toBe(false)
    expect(existsSync(join(dir, 'check-ran'))).toBe(true)
    expect([first, duplicate, bare, second]).toEqual(stopped)
  } finally {
    await Promise.all(clients.map(client => client.close()))
    await stop(child)
    rmSync(dir, { recursive: true, force: true })
  }
}, 180_000)

it('stdio diagnostics are a current compilation snapshot; full plugin checks remain an explicit tool', async () => {
  const dir = fixture()
  const client = new Client({ name: 'diagnostics-stdio-test', version: '0.1.0' })
  try {
    await client.connect(new StdioClientTransport({ command: process.execPath, args: [MCP, join(dir, 'one')], env: env(dir) as Record<string, string>, stderr: 'ignore' }))
    const read = async () => JSON.parse(((await client.readResource({ uri: DIAGNOSTICS_URI })).contents[0] as { text: string }).text) as DiagnosticSnapshot
    const initial = await read()
    expect(initial.diagnostics).toEqual([])
    const file = join(dir, 'one/lecture.md')
    const original = readFileSync(file, 'utf8')
    writeFileSync(file, original.replace('title: First document', 'title: Broken first document'))
    const broken = await read()
    expect(broken.version).toBeGreaterThan(initial.version)
    expect(broken.diagnostics).toEqual([expect.objectContaining({ document: '', origin: 'compile', severity: 'error', source: { file: 'lecture.md', line: 2 } })])
    expect(await read()).toEqual(broken)
    writeFileSync(file, original)
    const repaired = await read()
    expect(repaired.version).toBeGreaterThan(broken.version)
    expect(repaired.diagnostics).toEqual([])
    expect(existsSync(join(dir, 'check-ran'))).toBe(false)
    const checked = await client.callTool({ name: 'get_diagnostics', arguments: {} })
    expect(checked.isError).toBeFalsy()
    expect(existsSync(join(dir, 'check-ran'))).toBe(true)
  } finally {
    await client.close()
    rmSync(dir, { recursive: true, force: true })
  }
}, 120_000)

it('presmium dev notifies an unbound bare-resource subscriber and invalidates full-check findings after saving', async () => {
  const dir = fixture()
  const deck = join(dir, 'one')
  const child = spawn(process.execPath, [PRESMIUM, 'dev', '--to', 'notebook'], { cwd: deck, env: env(dir), stdio: ['ignore', 'pipe', 'pipe'] })
  let client: PresmiumMcpClient | undefined
  try {
    const url = await started(child, /^server {2}(http\S+)$/m)
    const { token } = JSON.parse(readFileSync(join(deck, '.presmium/server.json'), 'utf8')) as { token: string }
    client = await connectPresmiumMcp(`${url}/mcp`, token, 'diagnostics-dev-test')
    const read = async () => await client!.read(DIAGNOSTICS_URI) as DiagnosticSnapshot
    let updates = 0
    const unsubscribe = await client.subscribe(DIAGNOSTICS_URI, () => updates++)
    const checked = await client.call('get_diagnostics', {})
    expect(checked.isError, checked.text).toBe(false)
    await expect.poll(() => updates).toBeGreaterThan(0)
    const before = await read()
    expect(before.diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({ origin: 'check', checkId: 'fixture.diagnostics.check' })]))
    const beforeSave = updates
    const file = join(deck, 'lecture.md')
    writeFileSync(file, `${readFileSync(file, 'utf8')}\nA saved document.\n`)
    await expect.poll(() => updates).toBeGreaterThan(beforeSave)
    await expect.poll(async () => (await read()).diagnostics.filter(diagnostic => diagnostic.origin === 'check')).toEqual([])
    expect((await read()).version).toBeGreaterThan(before.version)
    await unsubscribe()
  } finally {
    await client?.close()
    await stop(child)
    rmSync(dir, { recursive: true, force: true })
  }
}, 120_000)

it('a delayed slides startup failure belongs to its original revision and cannot replace the repaired document diagnostics', async () => {
  const dir = fixture()
  const file = join(dir, 'one/lecture.md')
  const source = readFileSync(file, 'utf8').replace('renderers: { web: {} }', "renderers: { web: {}, slides: { package: '../slow-renderer' } }")
  writeFileSync(file, source)
  const gate = join(dir, 'one/hold-preview')
  writeFileSync(gate, '')
  const child = spawn(process.execPath, [PRESMIUM, 'serve', '--port', '0'], { cwd: dir, env: env(dir), stdio: ['ignore', 'pipe', 'pipe'] })
  const controller = new AbortController()
  let pending: Promise<Response> | undefined
  let client: PresmiumMcpClient | undefined
  try {
    const url = await started(child)
    const grantResponse = await fetch(`${url}/__presmium/presmium.server/tokens`, { method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ document: 'one', session: 'slow-preview-diagnostics' }) })
    expect(grantResponse.status, await grantResponse.clone().text()).toBe(201)
    const grant = await grantResponse.json() as { url: string, token: string }
    client = await connectPresmiumMcp(grant.url, grant.token, 'diagnostics-slow-preview')
    const read = async () => await client!.read(`${DIAGNOSTICS_URI}?document=one`) as DiagnosticSnapshot
    expect((await read()).diagnostics).toEqual([])
    pending = fetch(`${url}/__presmium/presmium.workspace/preview?document=one&view=slides`, { headers: { Authorization: `Bearer ${TOKEN}` }, signal: controller.signal })
    await expect.poll(() => existsSync(join(dir, 'one/preview-started'))).toBe(true)
    writeFileSync(file, source.replace('title: First document', 'title: Updated first document'))
    await expect.poll(async () => {
      const response = await fetch(`${url}/__presmium/presmium.workspace/ir?document=one`, { headers: { Authorization: `Bearer ${TOKEN}` } })
      return (await response.json() as { doc: { meta: { title: string } } }).doc.meta.title
    }).toBe('Updated first document')
    rmSync(gate)
    const response = await pending
    expect(response.status).toBe(500)
    expect(await response.text()).toContain('The preview failed for First document')
    expect((await read()).diagnostics).toEqual([])

    const currentPreview = await fetch(`${url}/__presmium/presmium.workspace/preview?document=one&view=slides`, { headers: { Authorization: `Bearer ${TOKEN}` } })
    expect(currentPreview.status).toBe(500)
    expect((await read()).diagnostics).toEqual([expect.objectContaining({ origin: 'preview', renderer: 'slides', severity: 'error', message: expect.stringContaining('The preview failed for Updated first document') })])
    writeFileSync(file, readFileSync(file, 'utf8').replace("renderers: { web: {}, slides: { package: '../slow-renderer' } }", 'renderers: { web: {} }'))
    await expect.poll(async () => (await read()).diagnostics.filter(diagnostic => diagnostic.origin === 'preview' && diagnostic.renderer === 'slides')).toEqual([])
    expect(existsSync(join(dir, 'check-ran'))).toBe(false)
  } finally {
    rmSync(gate, { force: true })
    controller.abort()
    await pending?.catch(() => undefined)
    await client?.close()
    await stop(child)
    rmSync(dir, { recursive: true, force: true })
  }
}, 120_000)
