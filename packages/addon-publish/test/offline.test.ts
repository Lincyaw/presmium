// Runs the real `slidev build` on a copy of ./fixtures/offline, which uses this
// addon, and checks the service worker's precache manifest.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'
import { PNG } from 'pngjs'
import { afterAll, expect, it } from 'vitest'
import { copyFixture, removeCopies, slidev } from './helpers.ts'

afterAll(removeCopies)

it('precaches the deck, its remote assets and the Pyodide runtime', async () => {
  // A "remote" image on another origin, downloaded into the build.
  const image = PNG.sync.write(new PNG({ width: 2, height: 2 }))
  const server = createServer((_, res) => res.writeHead(200, { 'content-type': 'image/png' }).end(image))
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const remote = `http://127.0.0.1:${(server.address() as AddressInfo).port}/remote-image.png`

  const dir = copyFixture('offline')
  writeFileSync(join(dir, 'slides.md'), readFileSync(join(dir, 'slides.md'), 'utf8').replace('REMOTE_IMAGE', remote))
  try {
    await slidev(dir, 'build', 'slides.md', '--out', 'dist')
  } finally {
    server.close()
  }

  const dist = join(dir, 'dist')
  const files = readdirSync(dist, { recursive: true, encoding: 'utf8' })
  const precached = [...readFileSync(join(dist, 'sw.js'), 'utf8').matchAll(/url:"([^"]+)"/g)].map(m => m[1])
  const localImage = files.find(f => f.endsWith('.png') && readFileSync(join(dist, f)).equals(image))

  expect(readFileSync(join(dist, 'index.html'), 'utf8')).toContain('registerSW.js')
  expect(precached).toEqual(expect.arrayContaining(['index.html', 'favicon.svg', 'pyodide/pyodide.asm.wasm', localImage]))
  expect(files.filter(f => /\.(js|html)$/.test(f) && readFileSync(join(dist, f), 'utf8').includes(remote))).toEqual([])
}, 120_000)
