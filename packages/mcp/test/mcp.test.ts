import { execFileSync, spawn, spawnSync } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client } from '@modelcontextprotocol/client'
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { connectMcp, controlWindow, resultOf } from './client.ts'
import type { ControlWindow } from './client.ts'

const DECK = fileURLToPath(new URL('./fixtures/deck', import.meta.url))
const PRESMIUM_BIN = fileURLToPath(new URL('../../cli/bin/presmium.mjs', import.meta.url))
const MCP_BIN = fileURLToPath(new URL('../bin/presmium-mcp.mjs', import.meta.url))
const WORK = fileURLToPath(new URL('../../../examples/demo/.presmium', import.meta.url))

const READ = ['list_documents', 'deck_info', 'list_sections', 'get_section', 'get_step', 'search', 'get_code_ref', 'get_outputs', 'get_diagnostics', 'locate_source']
const OPERATE = ['navigate', 'run_code', 'build', 'classroom_start', 'classroom_end']

function deck(): string {
  mkdirSync(WORK, { recursive: true })
  const dir = mkdtempSync(join(WORK, 'mcp-'))
  cpSync(DECK, dir, { recursive: true })
  writeFileSync(join(dir, '.gitignore'), '*\n')
  writeFileSync(join(dir, 'package.json'), `${JSON.stringify({ name: dir.split('/').at(-1)!.toLowerCase(), private: true, type: 'module' })}\n`)
  execFileSync('git', ['init', '-q'], { cwd: dir })
  return dir
}

function env(): NodeJS.ProcessEnv {
  const { NODE_ENV: _test, ...rest } = process.env
  return Object.fromEntries(Object.entries(rest).filter(([name]) => !name.startsWith('PRESMIUM_')))
}

const names = async (client: Client) => (await client.listTools()).tools.map(tool => tool.name)

describe('presmium dev', () => {
  let dir: string
  let dev: ChildProcess
  let server: string
  let token: string
  const clients: Client[] = []
  const windows: ControlWindow[] = []
  const connect = async (with_ = token) => {
    const client = await connectMcp(`${server}/mcp`, with_)
    clients.push(client)
    return client
  }
  const window = async (id: string) => {
    const opened = await controlWindow(server, id)
    windows.push(opened)
    await opened.next('ready')
    return opened
  }

  beforeAll(async () => {
    dir = deck()
    dev = spawn(process.execPath, [PRESMIUM_BIN, 'dev', '--to', 'notebook'], { cwd: dir, env: env(), stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''
    server = await new Promise<string>((resolve, reject) => {
      const read = (chunk: Buffer) => {
        output += chunk
        const match = /^server {2}(http\S+)$/m.exec(output)
        if (match) resolve(match[1]!)
      }
      dev.stdout!.on('data', read)
      dev.stderr!.on('data', read)
      dev.once('exit', code => reject(new Error(`presmium dev exited (${code}):\n${output}`)))
    })
    token = (JSON.parse(readFileSync(join(dir, '.presmium/server.json'), 'utf8')) as { token: string }).token
  }, 180_000)
  afterAll(async () => {
    for (const client of clients) await client.close().catch(() => undefined)
    for (const opened of windows) opened.close()
    if (dev && dev.exitCode === null) {
      const exited = new Promise(done => dev.once('exit', done))
      dev.kill('SIGTERM')
      await exited
    }
    if (dir) rmSync(dir, { recursive: true, force: true })
  })

  it('lists the sections and reads a section\'s narration and code; without a token /mcp answers 401', async () => {
    expect((await fetch(`${server}/mcp`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status).toBe(401)

    const client = await connect()
    expect(client.getInstructions()).toContain('No tool writes files')
    expect(client.getInstructions()).toContain('presmium dev compiles the deck again on save')
    expect(client.getInstructions()).toMatch(/^Operate tools: navigate, run_code, build, classroom_start, classroom_end\. Each may first wait for a person to allow it \(in the page\)/m)
    const tools = await names(client)
    expect(tools).toEqual(expect.arrayContaining([...READ, 'get_position', 'get_classroom', 'run_code', 'build', 'navigate', 'fixture_echo']))
    expect(tools.some(name => /write|edit/.test(name))).toBe(false)

    const { sections } = resultOf(await client.callTool({ name: 'list_sections', arguments: {} }))
    expect(sections.map((s: { id: string }) => s.id)).toEqual(['mcp-测试文稿', 'merge', 'teacher', '第三节'])

    const section = resultOf(await client.callTool({ name: 'get_section', arguments: { section: 'merge' } }))
    expect(section.title).toBe('合并')
    expect(section.narration.map((n: { text: string }) => n.text).join('\n')).toContain('每一轮合并出现次数最多的相邻对')
    const code = section.blocks.find((b: { kind: string }) => b.kind === 'code')
    expect(code).toMatchObject({ lang: 'python', code: 'print(6 * 7)', source: { file: 'lecture.md' } })

    const step = await client.readResource({ uri: 'presmium://sections/merge/steps/0' })
    expect(JSON.parse((step.contents[0] as { text: string }).text)).toMatchObject({ section: 'merge', step: 0, screen: [{ lang: 'python' }] })
    await expect(client.readResource({ uri: 'presmium://sections/merge?document=elsewhere' })).rejects.toThrow('no document "elsewhere"')
    await expect(client.readResource({ uri: 'presmium://sections/merge?x=1&document=elsewhere' })).rejects.toThrow('no document "elsewhere"')
    const plain = await client.readResource({ uri: 'presmium://sections/merge?x=1' })
    expect(JSON.parse((plain.contents[0] as { text: string }).text)).toMatchObject({ id: 'merge', title: '合并' })
    const deck = await client.readResource({ uri: 'presmium://deck?document=&x=1' })
    expect(JSON.parse((deck.contents[0] as { text: string }).text)).toMatchObject({ title: 'MCP 测试文稿', sections: 4 })

    const found = resultOf(await client.callTool({ name: 'search', arguments: { query: '相邻对' } }))
    expect(found.results[0].section).toBe('merge')
    expect(resultOf(await client.callTool({ name: 'fixture_echo', arguments: { text: 'hi' } }))).toEqual({ echo: 'hi', document: '', member: 'local' })
  })

  it('run_code asks the control channel: allowed it gives the output, refused an error result', async () => {
    const page = await window('runner')
    const client = await connect()
    const code = (await resultOf(await client.callTool({ name: 'get_section', arguments: { section: 'merge' } }))).blocks.find((b: { kind: string }) => b.kind === 'code').id

    const allowed = client.callTool({ name: 'run_code', arguments: { section: 'merge', block: code } })
    const asked = await page.next('approval')
    expect(asked.request).toMatchObject({ kind: 'operate', scope: 'content', title: `运行「合并」一节的 ${code}`, detail: 'print(6 * 7)', member: 'local' })
    expect(await page.answer(asked.id, true)).toBe(200)
    const ran = await allowed
    expect(ran.isError).toBeFalsy()
    expect(resultOf(ran)).toMatchObject({ ok: true, stdout: '42\n' })

    const refused = client.callTool({ name: 'run_code', arguments: { section: 'merge', block: code } })
    expect(await page.answer((await page.next('approval')).id, false)).toBe(200)
    const denied = await refused
    expect(denied.isError).toBe(true)
    expect(resultOf(denied)).toContain('not allowed')
  })

  it('run_code shows in its approval everything the run sends: the session\'s blocks before the one named, then it', async () => {
    const page = await window('session-runner')
    const client = await connect()
    const blocks = (await resultOf(await client.callTool({ name: 'get_section', arguments: { section: '第三节' } }))).blocks.filter((b: { kind: string }) => b.kind === 'code')
    const last = blocks.at(-1).id
    const running = client.callTool({ name: 'run_code', arguments: { section: '第三节', block: last } })
    const asked = await page.next('approval')
    expect(asked.request.detail).toContain('x = 6')
    expect(asked.request.detail).toContain('print(x * 7)')
    expect(asked.request.detail.indexOf('x = 6')).toBeLessThan(asked.request.detail.indexOf('print(x * 7)'))
    expect(await page.answer(asked.id, true)).toBe(200)
    expect(resultOf(await running)).toMatchObject({ ok: true, stdout: '42\n' })
  })

  it('a token a plugin\'s route issued gets 401 once revoked, which ends its subscription', async () => {
    const grant = await (await fetch(`${server}/__presmium/fixture.mcp/token`)).json() as { url: string, token: string }
    expect(grant.url).toBe(`${server}/mcp`)
    const issued = await connect(grant.token)
    expect(await names(issued)).toEqual(expect.arrayContaining([...READ, ...OPERATE]))
    const updated = new Promise<string>(resolve => issued.setNotificationHandler('notifications/resources/updated', n => resolve(n.params.uri)))
    const subscription = await issued.listen({ resourceSubscriptions: ['presmium://position'] })
    const page = await window('issued-page')
    expect(await page.report({ position: { slide: 2, step: 0, view: 'document' }, role: 'reader', status: {} })).toBe(200)
    expect(await updated).toBe('presmium://position')
    const open = await Promise.race([subscription.closed, new Promise(done => setTimeout(() => done('open'), 300))])
    expect(open).toBe('open')

    await (await fetch(`${server}/__presmium/fixture.mcp/revoke`, { method: 'POST' })).json()
    expect(await subscription.closed).not.toBe('local')
    const after = await fetch(grant.url, { method: 'POST', headers: { 'Authorization': `Bearer ${grant.token}`, 'Content-Type': 'application/json' }, body: '{}' })
    expect(after.status).toBe(401)
  })

  it('a subscriber of presmium://position hears resources/updated when a page reports a new position', async () => {
    const page = await window('presenter')
    const client = await connect()
    const updated = new Promise<string>(resolve => client.setNotificationHandler('notifications/resources/updated', n => resolve(n.params.uri)))
    const subscription = await client.listen({ resourceSubscriptions: ['presmium://position'] })
    expect(subscription.honoredFilter.resourceSubscriptions).toEqual(['presmium://position'])

    expect(await page.report({ position: { slide: 4, step: 0, view: 'present' }, role: 'audience', status: {} })).toBe(200)
    expect(await updated).toBe('presmium://position')
    const read = await client.readResource({ uri: 'presmium://position' })
    expect(JSON.parse((read.contents[0] as { text: string }).text).position).toMatchObject({ section: '第三节', step: 0, view: 'present' })
    await subscription.close()
  })

  it('gives the position of the presenting window by its section, the step in the whole deck\'s numbering by the keys a window of another numbering reports; navigate sends those keys (F-41, F-85)', async () => {
    const page = await window('teaching')
    const client = await connect()
    const where = async () => resultOf(await client.callTool({ name: 'get_position', arguments: {} })).position as Record<string, unknown>
    expect(await page.report({ position: { slide: 2, step: 0, view: 'present', section: 'teacher' }, role: 'audience', status: {} })).toBe(200)
    expect(await where()).toMatchObject({ section: 'teacher', title: '教师讲评', step: 0 })
    const { blocks } = resultOf(await client.callTool({ name: 'get_section', arguments: { section: '第三节' } })) as { blocks: { id: string, at: number, only?: string[] }[] }
    const notebookOnly = blocks.find(b => b.only?.includes('notebook'))!
    const shared = blocks.find(b => b.at === 2 && !b.only)!
    expect(notebookOnly.at).toBe(1)
    expect(await page.report({ position: { slide: 4, step: 1, view: 'present', section: '第三节', trail: [shared.id] }, role: 'audience', status: {} })).toBe(200)
    expect(await where()).toMatchObject({ section: '第三节', step: 2, steps: 2 })
    expect(await page.report({ position: { slide: 4, step: 1, view: 'present', section: '第三节', trail: [notebookOnly.id] }, role: 'audience', status: {} })).toBe(200)
    expect(await where()).toMatchObject({ section: '第三节', step: 1 })
    const moving = client.callTool({ name: 'navigate', arguments: { section: '第三节', step: 2 } })
    expect(await page.answer((await page.next('approval')).id, true)).toBe(200)
    expect(await page.next('go')).toMatchObject({ section: '第三节', step: 2, trail: [notebookOnly.id, shared.id] })
    expect((await moving).isError).toBeFalsy()
  })
})

it('presmium-mcp finds what presmium check finds, a plugin\'s finding on its line; its host compiles the whole deck (F-03)', async () => {
  const dir = deck()
  const client = new Client({ name: 'presmium-test', version: '0.1.0' })
  try {
    const checked = spawnSync(process.execPath, [PRESMIUM_BIN, 'check', '--json'], { cwd: dir, env: env(), encoding: 'utf8' })
    const { findings } = JSON.parse(checked.stdout) as { findings: { checkId: string, severity: string, message: string, source: { file: string, line: number } }[] }
    const plugin = findings.find(f => f.checkId === 'fixture.mcp.check')
    expect(plugin?.source).toEqual({ file: join(dir, 'lecture.md'), line: 5 })

    await client.connect(new StdioClientTransport({ command: process.execPath, args: [MCP_BIN, dir], env: env() as Record<string, string>, stderr: 'ignore' }))
    const { diagnostics } = resultOf(await client.callTool({ name: 'get_diagnostics', arguments: {} })) as { diagnostics: { check: string, severity: string, message: string, file: string, line: number }[] }
    const key = (f: { check: string, severity: string, message: string, file: string, line: number }) => `${f.check} ${f.severity} ${f.file}:${f.line} ${f.message}`
    expect(diagnostics.map(key).sort()).toEqual(findings.map(f => key({ check: f.checkId, severity: f.severity, message: f.message, file: f.source.file.slice(dir.length + 1), line: f.source.line })).sort())
    expect(diagnostics.map(f => f.check)).toContain('fixture.mcp.check')

    const { compilerHost } = await import('../src/stdio.ts')
    const host = compilerHost(join(dir, 'lecture.md'), [])
    const { doc } = await host.compile('')
    expect(doc.sections.map(s => s.id)).toContain('teacher')
    expect(JSON.stringify(doc)).toContain('TEACHERNOTE27')
  } finally {
    await client.close()
    rmSync(dir, { recursive: true, force: true })
  }
}, 120_000)

it('presmium-mcp lists the read tools on stdio, no operation without --allow operate, and loads what the CLI installs', async () => {
  const dir = deck()
  const cli = join(dir, 'node_modules/@presmium/cli')
  mkdirSync(join(cli, 'node_modules/@presmium'), { recursive: true })
  writeFileSync(join(cli, 'package.json'), `${JSON.stringify({ name: '@presmium/cli', private: true, type: 'module' })}\n`)
  cpSync(fileURLToPath(new URL('./fixtures/bundled', import.meta.url)), join(cli, 'node_modules/@presmium/slidev-addon-deltabox'), { recursive: true })
  const client = new Client({ name: 'presmium-test', version: '0.1.0' })
  try {
    await client.connect(new StdioClientTransport({ command: process.execPath, args: [MCP_BIN, dir], env: env() as Record<string, string>, stderr: 'ignore' }))
    const tools = await names(client)
    expect(tools).toEqual(expect.arrayContaining(READ))
    expect(tools.filter(name => OPERATE.includes(name))).toEqual([])
    expect(client.getInstructions()).toContain('No operation is offered')
    expect(client.getInstructions()).toContain('presmium-mcp compiles the deck again at the next call')
    expect(resultOf(await client.callTool({ name: 'fixture_bundled', arguments: {} }))).toEqual({ bundled: true })
    const info = resultOf(await client.callTool({ name: 'deck_info', arguments: {} }))
    expect(info).toMatchObject({ title: 'MCP 测试文稿', sections: 4, entry: 'lecture.md' })
  } finally {
    await client.close()
    rmSync(dir, { recursive: true, force: true })
  }
}, 120_000)
