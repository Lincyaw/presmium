// The fixture deck of e2e/web.spec.ts and e2e/viewer.spec.ts (./deck): a zh-CN deck of three
// chapters (a source file without a chapter title, then two chapter titles in one file) with a
// test plugin whose component steps. It is built with `presmium build` in a copy inside the demo,
// whose node_modules hold the Presmium packages, and served with the web form under /web/ and the
// slides under /slides/ (the bases the deck sets), so each form's default link to the other works.
import { spawn } from 'node:child_process'
import { cpSync, createReadStream, existsSync, mkdirSync, mkdtempSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { extname, join, resolve, sep } from 'node:path'

const FIXTURE = resolve('e2e/fixtures/web/deck')

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.wasm': 'application/wasm',
  '.woff2': 'font/woff2',
}

/** The parts of the IR (packages/kernel/src/ir.ts) the tests read. */
export interface MdastNode { type: string, value?: string, children?: MdastNode[] }
export interface IRBlock {
  id: string
  role: 'visual' | 'narration'
  node: { type: 'markdown', mdast: MdastNode } | { type: 'code', lang: string, value: string } | { type: 'component', name: string }
}
export interface IRSection { id: string, index: number, title: string, depth: number, steps: number, blocks: IRBlock[] }
export interface IRDocument { sections: IRSection[], config: { renderers: Record<string, { addons?: unknown }> } }

export interface WebDeck {
  /** Origin of the server. */
  url: string
  /** A page of the web form, e.g. `basics.html?view=present`. */
  web(path?: string): string
  /** A route of the slides form, e.g. `3?clicks=2`. */
  slides(path?: string): string
  /** The IR the web form publishes. */
  doc: IRDocument
  /** Section number (slide number) by section id. */
  slide(id: string): number
  close(): Promise<void>
}

function presmium(args: string[], cwd: string): Promise<void> {
  const child = spawn(process.execPath, [resolve('packages/cli/bin/presmium.mjs'), ...args], { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
  let output = ''
  child.stdout!.on('data', (chunk: Buffer) => output += chunk)
  child.stderr!.on('data', (chunk: Buffer) => output += chunk)
  return new Promise((done, fail) => child.once('exit', code => code === 0 ? done() : fail(new Error(`presmium ${args[0]} exited (${code}):\n${output}`))))
}

/** Serves `dist`: a path under /slides/ that is no file is a slide route (the slides' index.html). */
async function serve(dist: string): Promise<{ url: string, close(): Promise<void> }> {
  const server = createServer((request, response) => {
    const path = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname)
    let file = join(dist, path)
    if (!file.startsWith(dist + sep)) file = join(dist, 'web/404.html')
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html')
    const found = existsSync(file)
    const single = path.startsWith('/slides/')
    if (!found) file = join(dist, single ? 'slides/index.html' : 'web/404.html')
    response.writeHead(found || single ? 200 : 404, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' })
    createReadStream(file).pipe(response)
  })
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done))
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    // Pages kept open by the browser hold connections; they do not keep the server.
    close: () => new Promise((done) => {
      server.close(() => done())
      server.closeAllConnections()
    }),
  }
}

/**
 * Copies the fixture deck into a directory of its own inside the demo, where the plugin
 * packages resolve; `@presmium/host`, which the test plugin imports, is linked in.
 */
function copyDeck(): string {
  const work = resolve('examples/demo/.presmium')
  mkdirSync(work, { recursive: true })
  const dir = mkdtempSync(join(work, 'e2e-web-'))
  cpSync(FIXTURE, dir, { recursive: true })
  writeFileSync(join(dir, '.gitignore'), '*\n')
  mkdirSync(join(dir, 'node_modules/@presmium'), { recursive: true })
  symlinkSync(resolve('packages/host'), join(dir, 'node_modules/@presmium/host'), 'junction')
  return dir
}

/** Builds the fixture deck into the forms `to` (e.g. `web,slides`) and serves them. */
export async function webDeck(to: string): Promise<WebDeck> {
  const dir = copyDeck()
  try {
    await presmium(['build', '--to', to], dir)
  } catch (error) {
    rmSync(dir, { recursive: true, force: true })
    throw error
  }
  const server = await serve(join(dir, 'dist'))
  const doc = await (await fetch(`${server.url}/web/ir.json`)).json() as IRDocument
  return {
    url: server.url,
    web: (path = '') => `${server.url}/web/${path}`,
    slides: (path = '') => `${server.url}/slides/${path}`,
    doc,
    slide: id => doc.sections.find(section => section.id === id)!.index,
    async close() {
      await server.close()
      rmSync(dir, { recursive: true, force: true })
    },
  }
}
