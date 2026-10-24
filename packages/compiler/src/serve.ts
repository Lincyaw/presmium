import { createReadStream, existsSync } from 'node:fs'
import { createServer } from 'node:http'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { createRequire } from 'node:module'
import type { AddressInfo } from 'node:net'
import { basename, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import contentDisposition from 'content-disposition'
import cors from 'cors'
import send from 'send'

export type ServedExtra = { file: string, type?: string } | { body: string | Uint8Array, type: string }

export interface StaticServer {
  url: string
  close(): Promise<void>
}

export interface ServeDirectoryOptions {
  base?: string
  extra?: Record<string, ServedExtra>
  /** The origins whose pages may read the files (CORS), e.g. a video's captions from another origin's page. */
  origins?: string[]
}

/**
 * Serves the files of `root` below `base` on a loopback port, and `extra` at their paths. The files go through `send`
 * (Express's): their types, ranges (a video's player seeks so), validators and conditional requests as HTTP defines them;
 * `?download` asks for one as an attachment (`content-disposition`), and `origins` may read them (`cors`).
 */
export async function serveDirectory(root: string, options: ServeDirectoryOptions = {}): Promise<StaticServer> {
  const dir = resolve(root)
  const base = options.base ?? '/'
  const missing = (response: ServerResponse) => {
    const page = join(dir, '404.html')
    response.writeHead(404, existsSync(page) ? { 'Content-Type': 'text/html; charset=utf-8' } : {})
    if (existsSync(page)) createReadStream(page).pipe(response)
    else response.end()
  }
  const failed = (response: ServerResponse) => (error: { status?: number }) => {
    if (response.headersSent) return response.destroy()
    if (error.status === 404) return missing(response)
    response.writeHead(error.status ?? 500)
    response.end()
  }
  const shared = options.origins?.length ? cors({ origin: options.origins }) : undefined
  const attached = (request: { url?: string }, file: string) => (response: ServerResponse) => {
    if (new URL(request.url ?? '/', 'http://localhost').searchParams.has('download')) response.setHeader('Content-Disposition', contentDisposition(basename(file)))
  }
  const answer = (request: IncomingMessage, response: ServerResponse) => {
    const path = new URL(request.url ?? '/', 'http://localhost').pathname
    let decoded: string
    try {
      decoded = decodeURIComponent(path)
    } catch {
      response.writeHead(400)
      response.end()
      return
    }
    const extra = options.extra?.[decoded]
    if (extra && 'body' in extra) {
      response.writeHead(200, { 'Content-Type': extra.type })
      response.end(extra.body)
      return
    }
    if (extra) {
      if (extra.type) response.setHeader('Content-Type', extra.type)
      send(request, pathToFileURL(extra.file).pathname, { root: '/', dotfiles: 'allow' }).on('error', failed(response)).pipe(response)
      return
    }
    if (!path.startsWith(base)) return missing(response)
    send(request, path.slice(base.length - 1), { root: dir })
      .on('error', failed(response))
      .on('headers', attached(request, decoded))
      // A directory's address without its slash: to the one with it, whose index.html is served.
      .on('directory', () => {
        response.writeHead(301, { Location: `${path}/${new URL(request.url ?? '/', 'http://localhost').search}` })
        response.end()
      })
      .pipe(response)
  }
  const server = createServer((request, response) => {
    if (shared) shared(request, response, () => answer(request, response))
    else answer(request, response)
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
