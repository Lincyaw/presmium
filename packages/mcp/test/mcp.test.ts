import { Client } from '@modelcontextprotocol/client'
import type { ChildProcess } from 'node:child_process'
import { execFileSync, spawn } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { ControlWindow } from './client.ts'
import { connectMcp, controlWindow } from './client.ts'

const DECK = fileURLToPath(new URL('./fixtures/deck', import.meta.url))
const PRESMIUM_BIN = fileURLToPath(new URL('../../cli/bin/presmium.mjs', import.meta.url))
const MCP_BIN = fileURLToPath(new URL('../bin/presmium-mcp.mjs', import.meta.url))
const WORK = fileURLToPath(new URL('../../../e2e/fixtures/regression/.presmium', import.meta.url))

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
})
