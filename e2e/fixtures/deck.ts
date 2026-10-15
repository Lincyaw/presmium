// Fixture decks of the feature specs: e2e/fixtures/<name> holds a deck (lecture.md and the files it
// includes). It is copied into examples/demo/.presmium, where its plugins, Slidev and VitePress
// resolve from the demo's node_modules, built with the real `presmium build`, and its web form and
// slides are served on free ports. The specs depend on their fixture decks, never on the demo lecture.
import { spawn } from 'node:child_process'
import { cpSync, createReadStream, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { basename, extname, join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from '@playwright/test'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const FIXTURES = join(ROOT, 'e2e/fixtures')

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webm': 'video/webm',
  '.ogg': 'audio/ogg',
  '.wasm': 'application/wasm',
  '.zip': 'application/zip',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
}

/** Serves a build directory on a free port, reading each file when asked; `single` answers unknown paths with index.html (the slides' routes). */
export async function serve(dir: string, single = false): Promise<{ url: string, close(): Promise<void> }> {
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

/** Runs the Presmium CLI in `cwd` and resolves with its output; fails with it. */
export async function presmium(args: string[], cwd: string): Promise<string> {
  const child = spawn(process.execPath, [join(ROOT, 'packages/cli/bin/presmium.mjs'), ...args], { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
  let output = ''
  child.stdout.on('data', (chunk: Buffer) => output += chunk)
  child.stderr.on('data', (chunk: Buffer) => output += chunk)
  const code = await new Promise<number | null>(done => child.once('exit', done))
  if (code !== 0) throw new Error(`presmium ${args.join(' ')} exited (${code}):\n${output}`)
  return output
}

export interface FixtureOptions {
  /** Paths under e2e/fixtures (files or directories) copied into the deck at the same path, for its `{include}`s. */
  with?: string[]
  /** Changes the copy before it is built. */
  edit?: (dir: string) => void
  /** Renderers to build, as `--to` takes them. */
  to?: string
}

export interface FixtureDeck {
  /** The built copy. */
  dir: string
  /** URL of the web form. */
  web: string
  /** URL of the slides. */
  slides: string
  /** Slide number (section number) of a section id. */
  slide(id: string): number
  close(): Promise<void>
}

/** Builds and serves the fixture deck e2e/fixtures/<name>. */
export async function buildFixture(name: string, options: FixtureOptions = {}): Promise<FixtureDeck> {
  const work = join(ROOT, 'examples/demo/.presmium')
  mkdirSync(work, { recursive: true })
  const dir = mkdtempSync(join(work, `e2e-${basename(name)}-`))
  try {
    cpSync(join(FIXTURES, name), dir, { recursive: true })
    for (const path of options.with ?? []) cpSync(join(FIXTURES, path), join(dir, path), { recursive: true })
    writeFileSync(join(dir, '.gitignore'), '*\n')
    // A package of its own, so the build of each copy gets its own Vite cache.
    writeFileSync(join(dir, 'package.json'), `${JSON.stringify({ name: basename(dir).toLowerCase(), private: true, type: 'module' })}\n`)
    options.edit?.(dir)
    await presmium(['build', '--to', options.to ?? 'web,slides'], dir)
  } catch (error) {
    rmSync(dir, { recursive: true, force: true })
    throw error
  }
  const [web, slides] = await Promise.all([serve(join(dir, 'dist/web')), serve(join(dir, 'dist/slides'), true)])
  const { sections } = JSON.parse(readFileSync(join(dir, 'dist/ir.json'), 'utf8')) as { sections: { id: string, index: number }[] }
  return {
    dir,
    web: web.url,
    slides: slides.url,
    slide(id) {
      const section = sections.find(s => s.id === id)
      if (!section) throw new Error(`the fixture deck ${name} has no section ${id}`)
      return section.index
    },
    async close() {
      await Promise.all([web.close(), slides.close()])
      rmSync(dir, { recursive: true, force: true })
    },
  }
}

/**
 * The fixture deck e2e/fixtures/<name>, built before the tests of the enclosing scope and removed
 * after them. The scope should run its tests in one worker (`test.describe.configure({ mode: 'default' })`),
 * so the deck is built once.
 */
export function useFixture(name: string, options?: FixtureOptions): () => FixtureDeck {
  let deck: FixtureDeck | undefined
  test.beforeAll(async () => {
    test.setTimeout(600_000)
    deck = await buildFixture(name, options)
  })
  test.afterAll(async () => {
    await deck?.close()
  })
  return () => {
    if (!deck) throw new Error(`the fixture deck ${name} is not built`)
    return deck
  }
}
