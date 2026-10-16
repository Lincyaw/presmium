// Runs the real `presmium build --to slides` on a copy of ./fixtures/offline, which
// uses this addon: the compile pass downloads a remote image whose URL has no
// extension (as PlantUML's have), and the service worker precaches the build,
// the WASI runtime of the deck's live Ruby code (a gzip archive among its files)
// included.
import { randomBytes } from 'node:crypto'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'
import { PNG } from 'pngjs'
import { afterAll, expect, it } from 'vitest'
import { bin, copyFixture, removeCopies } from './helpers.ts'

afterAll(removeCopies)

it('downloads the remote images of the deck and precaches them with the deck, the Pyodide runtime and the WASI runtime', async () => {
  // A "remote" image on another origin, served without a file extension; noise keeps it
  // above the size Vite inlines, so the build has it as a file.
  const png = new PNG({ width: 64, height: 64 })
  randomBytes(png.data.length).copy(png.data)
  const image = PNG.sync.write(png)
  const server = createServer((_, res) => res.writeHead(200, { 'content-type': 'image/png' }).end(image))
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const remote = `http://127.0.0.1:${(server.address() as AddressInfo).port}/diagram/svg/SoWkIImgAStDuN`

  const dir = copyFixture('offline')
  writeFileSync(join(dir, 'lecture.md'), readFileSync(join(dir, 'lecture.md'), 'utf8').replace('REMOTE_IMAGE', remote))
  let result
  try {
    result = await bin('presmium', dir, 'build', '--to', 'slides', '--out', 'dist')
  } finally {
    server.close()
  }
  expect(result.code, result.stdout + result.stderr).toBe(0)

  // The image is kept in the deck, so later builds have it without network.
  const assets = readdirSync(join(dir, '.presmium/assets'))
  expect(assets).toHaveLength(1)
  expect(assets[0]).toMatch(/\.png$/)
  expect(readFileSync(join(dir, '.presmium/assets', assets[0]!)).equals(image)).toBe(true)

  const dist = join(dir, 'dist/slides')
  const files = readdirSync(dist, { recursive: true, encoding: 'utf8' })
  const precached = [...readFileSync(join(dist, 'sw.js'), 'utf8').matchAll(/url:"([^"]+)"/g)].map(m => m[1])
  const localImage = files.find(f => f.endsWith('.png') && readFileSync(join(dist, f)).equals(image))

  expect(readFileSync(join(dist, 'index.html'), 'utf8')).toContain('registerSW.js')
  expect(precached).toEqual(expect.arrayContaining(['index.html', 'favicon.svg', 'pyodide/pyodide.asm.wasm', localImage, 'wasi/ruby-3.2.0.wasm', 'wasi/ruby-3.2.0.tar.gz']))
  // The runtimes' licenses go with them.
  expect(readFileSync(join(dist, 'wasi/LICENSES'), 'utf8')).toContain('Ruby 3.2.0')
  expect(files.filter(f => /\.(js|html)$/.test(f) && readFileSync(join(dist, f), 'utf8').includes(remote))).toEqual([])
}, 180_000)
