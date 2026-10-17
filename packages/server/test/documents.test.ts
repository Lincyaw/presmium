// What serve does with the documents' contributions and the windows (WP-89b): a plugin route takes a body up to
// its limit and refuses a larger one before keeping it, dropping the rest for a moment only (F-02); what a route
// answers is not cached (F-33); a document taken down (`unmount`) has no routes, and made again it has its new
// configuration (F-40); the classroom's summary and the position are the teachers', whatever a reader's page
// reports, presenting or not (F-38); the owner console speaks the owner's browser's language, English for French (F-37).
import { cpSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { request as httpRequest } from 'node:http'
import { connect } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Child, EventStream } from './helpers.ts'
import { as, eventStream, FIXTURES, listener, raw, remove, serveHost, sharedEnv, waitFor, workspace } from './helpers.ts'

const DECK = join(FIXTURES, 'deck')

/** The resident memory of a process, in bytes. */
function rss(pid: number): number {
  const kb = /^VmRSS:\s+(\d+) kB$/m.exec(readFileSync(`/proc/${pid}/status`, 'utf8'))?.[1]
  return Number(kb) * 1024
}

/** A POST of `size` bytes to this machine's server, with its `Content-Length` or chunked; its status and body. */
function post(url: string, size: number, chunked: boolean): Promise<{ status: number, text: string }> {
  return new Promise((resolve, reject) => {
    const body = Buffer.alloc(size, 120)
    const headers: Record<string, string> = { 'Presmium-Document': 'doc', 'Content-Type': 'application/octet-stream', ...chunked ? {} : { 'Content-Length': String(size) } }
    const req = httpRequest(url, { method: 'POST', headers }, (res) => {
      let text = ''
      res.setEncoding('utf8')
      res.on('data', (chunk: string) => text += chunk)
      res.on('end', () => resolve({ status: res.statusCode ?? 0, text }))
    })
    req.on('error', reject)
    for (let at = 0; at < size; at += 64 * 1024) req.write(body.subarray(at, at + 64 * 1024))
    req.end()
  })
}

/**
 * A POST whose body never ends, with a `Content-Length` too large or chunked: the answer's status line, and how
 * long the server reads before it ends the connection (-1 when it still reads after 10 seconds).
 */
function endless(url: string, chunked: boolean): Promise<{ status: string, ms: number }> {
  return new Promise((resolve) => {
    const { hostname, port } = new URL(url)
    const socket = connect(Number(port), hostname)
    const started = Date.now()
    let answer = ''
    socket.on('data', (data: Buffer) => answer += data)
    socket.on('error', () => undefined)
    socket.write(`POST /__presmium/fixture.server/upload HTTP/1.1\r\nHost: ${hostname}:${port}\r\nPresmium-Document: doc\r\n${chunked ? 'Transfer-Encoding: chunked' : 'Content-Length: 100000000000'}\r\n\r\n`)
    const data = Buffer.alloc(64 * 1024, 120)
    const piece = chunked ? Buffer.concat([Buffer.from(`${data.length.toString(16)}\r\n`), data, Buffer.from('\r\n')]) : data
    const writing = setInterval(() => socket.writable && socket.write(piece), 1)
    const done = (ms: number) => {
      clearInterval(writing)
      clearTimeout(timer)
      socket.destroy()
      resolve({ status: answer.split('\r\n')[0], ms })
    }
    const timer = setTimeout(() => done(-1), 10_000)
    socket.once('close', () => done(Date.now() - started))
  })
}

describe('presmium serve on this machine (LOCAL): the documents\' routes', () => {
  let dir: string
  let host: Child
  let url: string
  beforeAll(async () => {
    dir = workspace('server-documents', { doc: DECK, other: DECK })
    const started = await serveHost({ SERVE_WORKSPACE: dir })
    if (!started.url) throw new Error(started.error)
    host = started.host
    url = started.url
  }, 120_000)
  afterAll(async () => {
    await host?.stop()
    remove(dir)
  })

  const route = (document: string, path: string) => raw(`${url}/__presmium/fixture.server/${path}`, { headers: { 'Presmium-Document': document } })

  it('refuses a body over a route\'s limit before keeping it (413), and takes what a route declares; nothing it answers is cached', async () => {
    const value = await route('doc', 'value')
    expect(value.status).toBe(200)
    expect(value.headers['cache-control']).toBe('no-store')

    const pid = host.child.pid!
    const before = rss(pid)
    for (const chunked of [false, true, false, true]) {
      const refused = await post(`${url}/__presmium/fixture.server/upload`, 2 << 20, chunked)
      expect(refused.status, `chunked: ${chunked}`).toBe(413)
    }
    expect(rss(pid) - before).toBeLessThan(50 << 20)
    // What a client still sends is read and dropped (so it reads the 413 rather than a reset connection), for a moment only.
    for (const chunked of [false, true]) {
      const { status, ms } = await endless(url, chunked)
      expect(status, `chunked: ${chunked}`).toBe('HTTP/1.1 413 Payload Too Large')
      expect(ms, `chunked: ${chunked}`).toBeGreaterThan(0)
      expect(ms, `chunked: ${chunked}`).toBeLessThan(5_000)
    }
    // Below the default limit, and a route that takes 16 MiB.
    expect(JSON.parse((await post(`${url}/__presmium/fixture.server/upload`, 512 << 10, true)).text)).toEqual({ bytes: 512 << 10 })
    const large = await post(`${url}/__presmium/fixture.server/upload-large`, 10 << 20, false)
    expect(large.status).toBe(200)
    expect(JSON.parse(large.text)).toEqual({ bytes: 10 << 20 })
  }, 60_000)

  it('takes a document\'s contributions down: its routes are gone, and made again it has its new configuration', async () => {
    expect((await route('doc', 'context')).json()).toMatchObject({ config: { greeting: '来自文稿' } })
    const unmount = async (document: string) => {
      host.child.stdin!.write(`unmount ${document}\n`)
      await waitFor(host, new RegExp(`^\\{"unmounted":"${document}"\\}$`, 'm'))
    }
    rmSync(join(dir, 'doc'), { recursive: true, force: true })
    await unmount('doc')
    expect((await route('doc', 'context')).status).toBe(404)
    // Its contribution was closed (the other document's copy of the plugin says how many of the process were).
    expect((await route('other', 'closed')).json()).toEqual({ closed: 1 })

    cpSync(DECK, join(dir, 'doc'), { recursive: true })
    const entry = join(dir, 'doc/lecture.md')
    writeFileSync(entry, readFileSync(entry, 'utf8').replace('greeting: 来自文稿', 'greeting: 新的文稿'))
    expect((await route('doc', 'context')).json()).toMatchObject({ config: { greeting: '新的文稿' } })
  }, 60_000)
})

describe('presmium serve with a login (SHARED): the windows of readers and teachers, and the owner console', () => {
  let dir: string
  let host: Child
  let url: string
  const listeners: Awaited<ReturnType<typeof listener>>[] = []
  const streams: EventStream[] = []
  beforeAll(async () => {
    dir = workspace('server-windows', { doc: DECK })
    writeFileSync(join(dir, 'presmium.workspace.yaml'), readFileSync(join(DECK, 'presmium.workspace.yaml')))
    listeners.push(...await Promise.all([listener(), listener(), listener()]))
    const [gateway, agentHost, site] = listeners as [Awaited<ReturnType<typeof listener>>, ...Awaited<ReturnType<typeof listener>>[]]
    const started = await serveHost(sharedEnv(dir, gateway.url, agentHost!.url, { SERVE_FORWARD: site!.url }))
    if (!started.url) throw new Error(started.error)
    host = started.host
    url = started.url
  }, 120_000)
  afterAll(async () => {
    streams.forEach(s => s.close())
    await host?.stop()
    await Promise.all(listeners.map(l => l.close()))
    remove(dir)
  })

  const control = '/__presmium/presmium.server/control'
  const window = async (id: string, email: string) => {
    const stream = await eventStream(`${url}${control}?window=${id}`, as(email))
    streams.push(stream)
    await stream.next('ready')
    return stream
  }
  const report = (id: string, email: string, body: Record<string, unknown>) =>
    raw(`${url}${control}`, { method: 'POST', headers: { ...as(email), 'Content-Type': 'application/json' }, body: JSON.stringify({ window: id, type: 'report', ...body }) })
  /** A JSON-RPC call of an MCP tool with a token, through `/mcp` on the site's host name. */
  const tool = async (token: string, name: string): Promise<any> => {
    const answer = await raw(`${url}/mcp`, {
      method: 'POST',
      headers: { 'Host': 'site.test', 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: { document: 'doc' } } }),
    })
    expect(answer.status, answer.text).toBe(200)
    const data = answer.text.trimStart().startsWith('{') ? answer.text : answer.text.split('\n').filter(line => line.startsWith('data: ')).map(line => line.slice(6)).join('')
    return JSON.parse(JSON.parse(data).result.content[0].text)
  }

  it('keeps the teacher\'s classroom summary and presenting position when a reader\'s page reports its own', async () => {
    await window('teacher', 'owner@test')
    expect((await report('teacher', 'owner@test', { position: { slide: 2, step: 0, view: 'present' }, role: 'presenter', status: { 'presmium.classroom': { status: 'live', learners: 3 } } })).status).toBe(200)
    // A reader opens the page later: its page reports the classroom it sees, and says it presents.
    await window('reader', 'reader@test')
    expect((await report('reader', 'reader@test', { position: { slide: 1, step: 0, view: 'present' }, role: 'presenter', status: { 'presmium.classroom': { status: 'idle' } } })).status).toBe(200)

    const { token } = (await raw(`${url}/__presmium/fixture.server/mcp`, { method: 'POST', headers: as('editor@test') })).json<{ token: string }>()
    expect(await tool(token, 'get_classroom')).toEqual({ classroom: { 'presmium.classroom': { status: 'live', learners: 3 } } })
    const { position } = await tool(token, 'get_position')
    expect(position).toMatchObject({ section: '第二节', role: 'presenter' })

    // The teacher stops presenting; a reader's page says again that it presents: the teacher's window comes first.
    expect((await report('teacher', 'owner@test', { position: { slide: 2, step: 0, view: 'document' } })).status).toBe(200)
    expect((await report('reader', 'reader@test', { position: { slide: 1, step: 0, view: 'present' }, role: 'presenter' })).status).toBe(200)
    const { position: after } = await tool(token, 'get_position')
    expect(after).toMatchObject({ section: '第二节', view: 'document' })
    expect(after.role).toBeUndefined()
  })

  it('shows the owner console in the language of the owner\'s browser: English for French', async () => {
    const page = (language: string) => raw(`${url}/`, { headers: as('owner@test', 'console.test', { 'Accept-Language': language }) })
    const french = await page('fr-FR,fr;q=0.9')
    expect(french.text).toContain('<html lang="en">')
    expect(french.text).toContain('Owner console')
    expect(french.text).toContain('"allow":"Allow"')
    const chinese = await page('zh-CN,zh;q=0.9')
    expect(chinese.text).toContain('<html lang="zh-CN">')
    expect(chinese.text).toContain('所有者控制台')
    // The script chooses no language: it reads the page's words.
    const script = await raw(`${url}/__presmium/presmium.server/console.js`, { headers: as('owner@test', 'console.test') })
    expect(script.text).not.toMatch(/startsWith\('zh'\)/)
  })
})
