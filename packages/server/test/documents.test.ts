import { cpSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { request as httpRequest } from 'node:http'
import { connect } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Child } from './helpers.ts'
import { FIXTURES, listener, raw, remove, serveHost, waitFor, workspace } from './helpers.ts'

const DECK = join(FIXTURES, 'deck')

function rss(pid: number): number {
  const kb = /^VmRSS:\s+(\d+) kB$/m.exec(readFileSync(`/proc/${pid}/status`, 'utf8'))?.[1]
  if (!kb) throw new Error(`/proc/${pid}/status has no VmRSS measurement`)
  return Number(kb) * 1024
}

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

describe('presmium serve: the documents\' routes and proxies', () => {
  let dir: string
  let host: Child
  let url: string
  const listeners: Awaited<ReturnType<typeof listener>>[] = []
  beforeAll(async () => {
    dir = workspace('server-documents', { doc: DECK, other: DECK })
    listeners.push(...await Promise.all([listener(), listener()]))
    const [site, upstream] = listeners as [Awaited<ReturnType<typeof listener>>, Awaited<ReturnType<typeof listener>>]
    const started = await serveHost({ SERVE_WORKSPACE: dir, SERVE_FORWARD: site.url, FIXTURE_UPSTREAM_URL: upstream.url })
    if (!started.url) throw new Error(started.error)
    host = started.host
    url = started.url
  }, 120_000)
  afterAll(async () => {
    await host?.stop()
    await Promise.all(listeners.map(l => l.close()))
    remove(dir)
  })

  const route = (document: string, path: string) => raw(`${url}/__presmium/fixture.server/${path}`, { headers: { 'Presmium-Document': document } })

  it('refuses a body over a route\'s limit before keeping it (413), and takes what a route declares; nothing it answers is cached', async () => {
    const value = await route('doc', 'value')
    expect(value.status).toBe(200)
    expect(value.headers['cache-control']).toBe('no-store')

    const pid = host.child.pid!
    const before = process.platform === 'linux' ? rss(pid) : undefined
    for (const chunked of [false, true, false, true]) {
      const refused = await post(`${url}/__presmium/fixture.server/upload`, 2 << 20, chunked)
      expect(refused.status, `chunked: ${chunked}`).toBe(413)
    }
    if (before !== undefined) expect(rss(pid) - before).toBeLessThan(50 << 20)
    else console.info('Skipping RSS growth measurement: Linux /proc/<pid>/status is required; HTTP body-limit assertions still run.')
    for (const chunked of [false, true]) {
      const { status, ms } = await endless(url, chunked)
      expect(status, `chunked: ${chunked}`).toBe('HTTP/1.1 413 Payload Too Large')
      expect(ms, `chunked: ${chunked}`).toBeGreaterThan(0)
      expect(ms, `chunked: ${chunked}`).toBeLessThan(5_000)
    }
    expect(JSON.parse((await post(`${url}/__presmium/fixture.server/upload`, 512 << 10, true)).text)).toEqual({ bytes: 512 << 10 })
    const large = await post(`${url}/__presmium/fixture.server/upload-large`, 10 << 20, false)
    expect(large.status).toBe(200)
    expect(JSON.parse(large.text)).toEqual({ bytes: 10 << 20 })
  }, 60_000)

  it('forwards the site\'s paths and a plugin\'s proxy; refuses a path that climbs out of the proxy', async () => {
    const [site, upstream] = listeners as [Awaited<ReturnType<typeof listener>>, Awaited<ReturnType<typeof listener>>]
    expect((await raw(`${url}/doc/`)).json()).toMatchObject({ path: '/doc/' })
    expect(site.requests.at(-1)!.path).toBe('/doc/')
    const proxied = await raw(`${url}/__presmium/fixture.server/upstream/api/x?y=1`, { headers: { 'Presmium-Document': 'doc' } })
    expect(proxied.json()).toMatchObject({ path: '/api/x?y=1' })
    const before = upstream.requests.length
    for (const path of ['upstream/..%2F..%2Fsecret', 'upstream/%2e%2e%2Fsecret', 'upstream/a%5C..%5Csecret']) {
      expect((await raw(`${url}/__presmium/fixture.server/${path}`, { headers: { 'Presmium-Document': 'doc' } })).status, path).toBe(400)
    }
    expect(upstream.requests.length).toBe(before)
  })

  it('takes a document\'s contributions down: its routes are gone, and made again it has its new configuration', async () => {
    expect((await route('doc', 'context')).json()).toMatchObject({ config: { greeting: '来自文稿' } })
    const unmount = async (document: string) => {
      host.child.stdin!.write(`unmount ${document}\n`)
      await waitFor(host, new RegExp(`^\\{"unmounted":"${document}"\\}$`, 'm'))
    }
    rmSync(join(dir, 'doc'), { recursive: true, force: true })
    await unmount('doc')
    expect((await route('doc', 'context')).status).toBe(404)
    expect((await route('other', 'closed')).json()).toEqual({ closed: 1 })

    cpSync(DECK, join(dir, 'doc'), { recursive: true })
    const entry = join(dir, 'doc/lecture.md')
    writeFileSync(entry, readFileSync(entry, 'utf8').replace('greeting: 来自文稿', 'greeting: 新的文稿'))
    expect((await route('doc', 'context')).json()).toMatchObject({ config: { greeting: '新的文稿' } })
  }, 60_000)
})
