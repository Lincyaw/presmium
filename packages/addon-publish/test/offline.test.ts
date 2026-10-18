import { randomBytes } from 'node:crypto'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'
import { PNG } from 'pngjs'
import { afterAll, expect, it } from 'vitest'
import { bin, copyFixture, removeCopies } from './helpers.ts'

afterAll(removeCopies)

it('downloads the remote images of the deck and precaches them with the deck, the Pyodide runtime and the WASI runtime, the runtimes\' licenses with them', async () => {
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
    result = await bin('presmium', dir, 'build', '--to', 'web,slides', '--out', 'dist')
  } finally {
    server.close()
  }
  expect(result.code, result.stdout + result.stderr).toBe(0)

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
  const LICENSES = ['pyodide/LICENSES', 'presmium/jax-js/LICENSE', 'wasi/LICENSES']
  expect(precached).toEqual(expect.arrayContaining(LICENSES))
  const web = join(dir, 'dist/web')
  const worker = readFileSync(join(web, 'presmium-sw.js'), 'utf8')
  const list = (name: string) => JSON.parse(new RegExp(`^const ${name} = (.*)$`, 'm').exec(worker)![1]!) as string[]
  const webPrecached = list('URLS')
  expect(webPrecached).toEqual(expect.arrayContaining(LICENSES.map(file => `/web/${file}`)))
  const RUNTIMES = ['/web/pyodide/pyodide.asm.wasm', '/web/wasi/ruby-3.2.0.wasm', '/web/wasi/ruby-3.2.0.tar.gz']
  expect(webPrecached).toEqual(expect.arrayContaining(['/web/index.html']))
  expect(webPrecached.filter(url => RUNTIMES.includes(url))).toEqual([])
  expect(list('RUNTIMES')).toEqual(expect.arrayContaining(RUNTIMES))
  for (const form of [dist, web]) {
    expect(readFileSync(join(form, 'wasi/LICENSES'), 'utf8')).toContain('Ruby 3.2.0')
    const pyodide = readFileSync(join(form, 'pyodide/LICENSES'), 'utf8')
    expect(pyodide).toContain('Mozilla Public License Version 2.0')
    expect(pyodide).toContain('PYTHON SOFTWARE FOUNDATION LICENSE VERSION 2')
    expect(readFileSync(join(form, 'presmium/jax-js/LICENSE'), 'utf8')).toMatch(/^MIT License\n/)
  }
  expect(files.filter(f => /\.(js|html)$/.test(f) && readFileSync(join(dist, f), 'utf8').includes(remote))).toEqual([])
}, 180_000)
