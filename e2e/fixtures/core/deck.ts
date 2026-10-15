// The fixture deck of e2e/core.spec.ts and e2e/web.spec.ts (./deck): built with `presmium build`
// in a copy inside the demo, whose node_modules hold the Presmium packages, and served with the
// web form under /web/ and the slides under /slides/ (the bases the deck sets), so each form's
// default link to the other works.
import { spawn } from 'node:child_process'
import { cpSync, createReadStream, existsSync, mkdirSync, mkdtempSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { extname, join, resolve, sep } from 'node:path'

const FIXTURE = resolve('e2e/fixtures/core/deck')

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
}

export interface FixtureDeck {
  /** Origin of the server: the web form at `${url}/web/`, the slides at `${url}/slides/`. */
  url: string
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
    close: () => new Promise(done => server.close(() => done())),
  }
}

/** Builds and serves the fixture deck; `edit` may change the copy first. */
export async function fixtureDeck(edit?: (dir: string) => void): Promise<FixtureDeck> {
  const work = resolve('examples/demo/.presmium')
  mkdirSync(work, { recursive: true })
  const dir = mkdtempSync(join(work, 'e2e-core-'))
  try {
    cpSync(FIXTURE, dir, { recursive: true })
    writeFileSync(join(dir, '.gitignore'), '*\n')
    // The fixture plugin imports @presmium/host as a plugin package does; the demo does not depend on it.
    mkdirSync(join(dir, 'node_modules/@presmium'), { recursive: true })
    symlinkSync(resolve('packages/host'), join(dir, 'node_modules/@presmium/host'), 'junction')
    edit?.(dir)
    await presmium(['build', '--to', 'web,slides'], dir)
  } catch (error) {
    rmSync(dir, { recursive: true, force: true })
    throw error
  }
  const server = await serve(join(dir, 'dist'))
  const { sections } = await (await fetch(`${server.url}/web/ir.json`)).json() as { sections: { id: string, index: number }[] }
  return {
    url: server.url,
    slide: id => sections.find(section => section.id === id)!.index,
    async close() {
      await server.close()
      rmSync(dir, { recursive: true, force: true })
    },
  }
}
