// Test decks of the exec group's specs: built with the real `presmium build` and served
// on free ports. A deck is written inside examples/demo/.presmium (ignored by git), so
// its plugins, Slidev and VitePress resolve from the demo's node_modules.
import { spawn } from 'node:child_process'
import { cpSync, createReadStream, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { extname, join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../../..', import.meta.url))

export interface BuiltDeck {
  dir: string
  /** Slide number of each section id, from the built IR. */
  slides: Record<string, number>
  remove(): void
}

/** Writes the deck of the fixture directory `e2e/fixtures/exec/<name>`. */
export const fixture = (name: string) => (dir: string) => cpSync(fileURLToPath(new URL(name, import.meta.url)), dir, { recursive: true })

/** A new deck written by `write`, built for the renderers `to` into `<dir>/dist`. */
export async function buildDeck(prefix: string, write: (dir: string) => void, to = ['web', 'slides']): Promise<BuiltDeck> {
  const work = join(ROOT, 'examples/demo/.presmium')
  mkdirSync(work, { recursive: true })
  const dir = mkdtempSync(join(work, `e2e-${prefix}-`))
  const remove = () => rmSync(dir, { recursive: true, force: true })
  try {
    write(dir)
    const child = spawn(process.execPath, [join(ROOT, 'packages/cli/bin/presmium.mjs'), 'build', '--to', to.join(',')], { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''
    child.stdout.on('data', (chunk: Buffer) => output += chunk)
    child.stderr.on('data', (chunk: Buffer) => output += chunk)
    const code = await new Promise<number | null>(done => child.once('exit', done))
    if (code !== 0) throw new Error(`presmium build exited (${code}):\n${output}`)
  } catch (error) {
    remove()
    throw error
  }
  const ir = JSON.parse(readFileSync(join(dir, 'dist/ir.json'), 'utf8')) as { sections: { id: string, index: number }[] }
  return { dir, slides: Object.fromEntries(ir.sections.map(s => [s.id, s.index])), remove }
}

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm',
  '.zip': 'application/zip',
  '.woff2': 'font/woff2',
}

/** Serves a build directory on a free port; `single` answers unknown paths with index.html (the slides' routes). */
export async function serve(dir: string, single: boolean): Promise<{ url: string, close(): Promise<void> }> {
  const server = createServer((request, response) => {
    let file = join(dir, decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname))
    if (!file.startsWith(dir + sep) && file !== dir) file = dir
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html')
    const found = existsSync(file)
    if (!found) file = join(dir, single ? 'index.html' : '404.html')
    response.writeHead(found || single ? 200 : 404, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' })
    createReadStream(file).pipe(response)
  })
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done))
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    close: () => new Promise(done => server.close(() => done())),
  }
}
