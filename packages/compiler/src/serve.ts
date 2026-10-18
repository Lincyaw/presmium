import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import type { AddressInfo } from 'node:net'
import { extname, join, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.webm': 'video/webm',
  '.m4a': 'audio/mp4',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.vtt': 'text/vtt',
  '.txt': 'text/plain; charset=utf-8',
}

export type ServedExtra = { file: string, type?: string } | { body: string | Uint8Array, type: string }

export interface StaticServer {
  url: string
  close(): Promise<void>
}

export async function serveDirectory(root: string, options: { base?: string, extra?: Record<string, ServedExtra> } = {}): Promise<StaticServer> {
  const dir = resolve(root)
  const base = options.base ?? '/'
  const server = createServer((request, response) => {
    let path: string
    try {
      path = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname)
    } catch {
      response.writeHead(400)
      response.end()
      return
    }
    const extra = options.extra?.[path]
    if (extra && 'body' in extra) {
      response.writeHead(200, { 'Content-Type': extra.type })
      response.end(extra.body)
      return
    }
    let file = extra ? extra.file : path.startsWith(base) ? join(dir, path.slice(base.length)) : undefined
    if (file && !extra && file !== dir && !file.startsWith(dir + sep)) file = undefined
    if (file && existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html')
    if (!file || !existsSync(file)) {
      const missing = join(dir, '404.html')
      response.writeHead(404, existsSync(missing) ? { 'Content-Type': TYPES['.html']! } : {})
      if (existsSync(missing)) createReadStream(missing).pipe(response)
      else response.end()
      return
    }
    response.writeHead(200, { 'Content-Type': (extra && 'type' in extra && extra.type) || TYPES[extname(file).toLowerCase()] || 'application/octet-stream' })
    createReadStream(file).pipe(response)
  })
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done))
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    close: () => new Promise((done) => {
      server.close(() => done())
      server.closeAllConnections()
    }),
  }
}

export async function playwrightChromium<T = unknown>(deckDir: string, fallbackFrom?: string): Promise<T> {
  for (const from of [join(deckDir, 'package.json'), ...fallbackFrom ? [fallbackFrom] : []]) {
    let entry: string
    try {
      entry = createRequire(from).resolve('playwright-chromium')
    } catch {
      continue
    }
    return (await import(pathToFileURL(entry).href) as { chromium: T }).chromium
  }
  throw new Error('this needs playwright-chromium, as `slidev export` does: install it in the deck (and its browser with pnpm exec playwright install chromium)')
}
