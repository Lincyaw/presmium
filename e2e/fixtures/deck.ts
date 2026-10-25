// Fixture decks of the feature specs: e2e/fixtures/<name> holds a deck (lecture.md and the files it
// includes). It is copied into e2e/fixtures/regression/.presmium, where its plugins, Slidev and VitePress
// resolve from the regression fixture's node_modules, built with the real `presmium build`, and its web form and
// slides are served on free ports. The specs depend on their fixture decks, independent of the public example.
import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { cpSync, createReadStream, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { basename, dirname, extname, join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'
import type { IRDocument } from '../../packages/kernel/src/ir.ts'

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

/**
 * Serves a build directory on a free port, reading each file when asked. `single` answers unknown
 * paths with index.html (the slides' routes); a path such as `/slides/` does so for the paths under
 * it, with that directory's index.html (a `dist/` holding both forms). Other unknown paths get the
 * site's 404 page. Pages the browser keeps open do not keep the server from closing.
 */
export async function serve(dir: string, single: boolean | string = false): Promise<{ url: string, close(): Promise<void> }> {
  const missing = existsSync(join(dir, '404.html')) ? join(dir, '404.html') : join(dir, 'web/404.html')
  const server = createServer((request, response) => {
    const path = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname)
    let file = join(dir, path)
    if (!file.startsWith(dir + sep) && file !== dir) file = dir
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html')
    const found = existsSync(file)
    const route = single === true || (typeof single === 'string' && path.startsWith(single))
    if (!found) file = single === true ? join(dir, 'index.html') : route ? join(dir, single as string, 'index.html') : missing
    response.writeHead(found || route ? 200 : 404, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' })
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

/**
 * A new deck directory inside e2e/fixtures/regression/.presmium (ignored by git), where the deck finds the
 * workspace's packages, with a package of its own (so each build gets its own Vite cache). `link`
 * links more packages into its node_modules, by name, from paths of the repository: e.g. the
 * `@lincyaw/host` that a fixture plugin imports, which the demo does not depend on.
 */
export function deckDir(prefix: string, link: Record<string, string> = {}): string {
  const work = join(ROOT, 'e2e/fixtures/regression/.presmium')
  mkdirSync(work, { recursive: true })
  const dir = mkdtempSync(join(work, `e2e-${prefix}-`))
  writeFileSync(join(dir, '.gitignore'), '*\n')
  writeFileSync(join(dir, 'package.json'), `${JSON.stringify({ name: basename(dir).toLowerCase(), private: true, type: 'module' })}\n`)
  for (const [name, path] of Object.entries(link)) {
    mkdirSync(dirname(join(dir, 'node_modules', name)), { recursive: true })
    symlinkSync(join(ROOT, path), join(dir, 'node_modules', name), 'junction')
  }
  return dir
}

export interface DevServer {
  url: string
  child: ChildProcess
  /** Stops the server; the deck directory stays. */
  stop(): Promise<void>
}

/** Runs `presmium dev --to <to>` (with `args`, e.g. `--port`) in the deck directory `dir` and resolves with the URL it prints for `to`. */
export async function startDev(dir: string, to: string, env: NodeJS.ProcessEnv = {}, args: string[] = []): Promise<DevServer> {
  const child = spawn(process.execPath, [join(ROOT, 'packages/cli/bin/presmium.mjs'), 'dev', '--to', to, ...args], {
    cwd: dir,
    stdio: ['ignore', 'pipe', 'inherit'],
    env: { ...process.env, ...env },
  })
  const stop = async () => {
    if (child.exitCode !== null || child.signalCode !== null) return
    const exited = new Promise(done => child.once('exit', done))
    child.kill('SIGTERM')
    await exited
  }
  const url = await new Promise<string>((done, fail) => {
    let output = ''
    child.stdout!.on('data', (chunk: Buffer) => {
      output += chunk
      const match = new RegExp(`^${to} {2}(http\\S+)$`, 'm').exec(output)
      if (match) done(match[1]!)
    })
    child.once('exit', code => fail(new Error(`presmium dev exited (${code}):\n${output}`)))
  }).catch(async (error: unknown) => {
    await stop()
    throw error
  })
  return { url, child, stop }
}

/**
 * Opens a page of a dev server once the server has optimized its dependencies: while Vite optimizes
 * them it may reload the first visits, or abort their module requests, so a visit is repeated until
 * `ready` shows, then the page is visited once more.
 */
export async function openDevPage(page: Page, url: string, ready: Locator): Promise<void> {
  for (let visit = 0; visit < 2; visit++) {
    await expect(async () => {
      await page.goto(url)
      await expect(ready).toBeVisible({ timeout: 20_000 })
    }).toPass({ timeout: 120_000 })
    await page.waitForLoadState('networkidle')
  }
}

export interface FixtureOptions {
  /** Paths under e2e/fixtures (files or directories) copied into the deck at the same path, for its `{include}`s. */
  with?: string[]
  /** Changes the copy before it is built. */
  edit?: (dir: string) => void
  /** Renderers to build, as `--to` takes them. */
  to?: string
  /** Builds the view of this audience (`presmium build --audience`), e.g. the student build. */
  audience?: string
  /** Packages linked into the deck's node_modules (see `deckDir`). */
  link?: Record<string, string>
  /**
   * Serves `dist/` as one site, each form under its base: the web form at `/web/`, the slides at
   * `/slides/`. A build of both forms whose bases are not `/` (those the deck sets, or those a
   * build of both forms gets by default) is served so anyway.
   */
  bases?: boolean
}

export interface FixtureDeck {
  /** The built copy. */
  dir: string
  /** Origin of the site (with `bases`), else of the web form. */
  url: string
  /** URL of the web form. */
  web: string
  /** URL of the slides. */
  slides: string
  /** The IR of the build (`dist/ir.json`). */
  doc: IRDocument
  /** Slide number (section number) of a section id. */
  slide(id: string): number
  close(): Promise<void>
}

/** The public base a form was built for (`RenderContext.base`), read from its index.html; `/` when there is none. */
function builtBase(dir: string): string {
  const index = join(dir, 'index.html')
  if (!existsSync(index)) return '/'
  const html = readFileSync(index, 'utf8')
  // A page of the web form says its site path (its configuration's `base`); the slides' is that of their assets.
  const config = /<script type="application\/json" id="presmium-app">(.*?)<\/script>/s.exec(html)?.[1]
  if (config) return (JSON.parse(config) as { base: string }).base
  return /(?:src|href)="(\/[^"]*?)assets\//.exec(html)?.[1] ?? '/'
}

/** Builds and serves the fixture deck e2e/fixtures/<name>. */
export async function buildFixture(name: string, options: FixtureOptions = {}): Promise<FixtureDeck> {
  const dir = deckDir(basename(name), options.link)
  try {
    cpSync(join(FIXTURES, name), dir, { recursive: true })
    for (const path of options.with ?? []) cpSync(join(FIXTURES, path), join(dir, path), { recursive: true })
    options.edit?.(dir)
    await presmium(['build', '--to', options.to ?? 'web,slides', ...options.audience ? ['--audience', options.audience] : []], dir)
  } catch (error) {
    rmSync(dir, { recursive: true, force: true })
    throw error
  }
  const bases = { web: builtBase(join(dir, 'dist/web')), slides: builtBase(join(dir, 'dist/slides')) }
  const site = options.bases || (bases.web !== '/' && bases.slides !== '/')
  const servers = site
    ? [await serve(join(dir, 'dist'), bases.slides !== '/' && bases.slides)]
    : await Promise.all([serve(join(dir, 'dist/web')), serve(join(dir, 'dist/slides'), true)])
  const doc = JSON.parse(readFileSync(join(dir, 'dist/ir.json'), 'utf8')) as IRDocument
  const url = servers[0]!.url
  return {
    dir,
    url,
    web: site ? `${url}${bases.web.replace(/\/$/, '')}` : url,
    slides: site ? `${url}${bases.slides.replace(/\/$/, '')}` : servers[1]!.url,
    doc,
    slide(id) {
      const section = doc.sections.find(s => s.id === id)
      if (!section) throw new Error(`the fixture deck ${name} has no section ${id}`)
      return section.index
    },
    async close() {
      await Promise.all(servers.map(server => server.close()))
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
