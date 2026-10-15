// Test decks of the classroom, content, code and editor plugins (e2e/fixtures/plugins): built with
// the real CLI in a directory under examples/demo/.presmium, where the deck finds the workspace's
// packages, served on a free port, with a real classroom server when a test needs one.
import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { createReadStream, existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { dirname, extname, join, resolve, sep } from 'node:path'

/** This directory: the fixture pages and plugins. */
export const FIXTURES = resolve('e2e/fixtures/plugins')

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.wasm': 'application/wasm',
  '.zip': 'application/zip',
  '.woff2': 'font/woff2',
}

/** Serves a build directory on a free port, reading each file when asked, so a rebuild shows at once; `single` answers unknown paths with index.html (the slides' routes). */
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

/** `presmium-classroom-server --port 0`, archiving to `deck` when given, until it prints its URL. */
export async function startClassroomServer(deck?: string): Promise<{ url: string, child: ChildProcess }> {
  const args = ['--port', '0', '--host', '127.0.0.1', ...deck ? ['--deck', deck] : []]
  const child = spawn(process.execPath, [resolve('packages/classroom-server/bin/server.mjs'), ...args], { stdio: ['ignore', 'pipe', 'inherit'] })
  const url = await new Promise<string>((done, fail) => {
    let output = ''
    child.stdout!.on('data', (chunk: Buffer) => {
      output += chunk
      const match = /^classroom server {2}(ws:\S+)$/m.exec(output)
      if (match) done(match[1]!)
    })
    child.once('exit', code => fail(new Error(`classroom server exited (${code}): ${output}`)))
  })
  return { url, child }
}

/**
 * A new deck directory: `lecture.md` with `headmatter` and a title, including
 * the fixture pages `pages` (copied, with `{{deck}}` replaced by the deck's
 * path relative to the workspace root, where code anchors start, and as
 * `transform` changes them).
 */
export function writeDeck(name: string, headmatter: string, pages: string[], transform?: (text: string) => string): string {
  const work = resolve('examples/demo/.presmium')
  mkdirSync(work, { recursive: true })
  const deck = mkdtempSync(join(work, `e2e-${name}-`))
  writeFileSync(join(deck, '.gitignore'), '*\n')
  for (const page of pages) writePage(deck, page, transform)
  writeFileSync(join(deck, 'lecture.md'), `---
${headmatter.trim()}
---

# Test deck ${name}

${pages.map(page => `\`\`\`{include} pages/${page}\n\`\`\``).join('\n\n')}
`)
  return deck
}

/** Copies a fixture page into the deck's `pages/`, as `transform` changes it. */
export function writePage(deck: string, page: string, transform = (text: string) => text): void {
  const file = join(deck, 'pages', page)
  mkdirSync(dirname(file), { recursive: true })
  const text = readFileSync(join(FIXTURES, page), 'utf8').replaceAll('{{deck}}', deck.slice(resolve('.').length + 1).split(sep).join('/'))
  writeFileSync(file, transform(text))
}

/** `presmium build --to <forms>` in the deck; fails with the CLI's output. */
export async function build(deck: string, forms = 'web'): Promise<void> {
  const child = spawn(process.execPath, [resolve('packages/cli/bin/presmium.mjs'), 'build', '--to', forms], { cwd: deck, stdio: ['ignore', 'pipe', 'pipe'] })
  let output = ''
  child.stdout!.on('data', (chunk: Buffer) => output += chunk)
  child.stderr!.on('data', (chunk: Buffer) => output += chunk)
  const code = await new Promise<number | null>(done => child.once('exit', done))
  if (code !== 0) throw new Error(`presmium build exited (${code}):\n${output}`)
}
