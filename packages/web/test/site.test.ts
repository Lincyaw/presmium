// `presmium build --to web` of a deck with math, an image and a plugin that adds a Vite plugin
// (packages/web/test/fixtures/site), built in a copy beside the fixture so its renderer resolves.
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { presmium } from '@presmium/cli/testing'
import { afterAll, beforeAll, expect, it } from 'vitest'

const FIXTURES = fileURLToPath(new URL('./fixtures', import.meta.url))

let deck: string
beforeAll(() => {
  deck = mkdtempSync(join(FIXTURES, '.site-'))
  cpSync(join(FIXTURES, 'site'), deck, { recursive: true })
  writeFileSync(join(deck, '.gitignore'), '*\n')
})
afterAll(() => rmSync(deck, { recursive: true, force: true }))

const web = () => join(deck, 'dist/web')

async function build() {
  const { code, stdout, stderr } = await presmium(deck, ['build', '--to', 'web'])
  expect(code, stdout + stderr).toBe(0)
}

it('runs the Vite plugins of the deck\'s plugins with their configuration, renders math at build time and precaches woff2 fonts only', async () => {
  await build()
  expect(readFileSync(join(web(), 'fixture-vite.txt'), 'utf8')).toBe('来自文稿的配置')
  expect(readFileSync(join(web(), 'index.html'), 'utf8')).toContain('class="katex"')
  const worker = readFileSync(join(web(), 'presmium-sw.js'), 'utf8')
  expect(worker).toMatch(/KaTeX_Main-Regular[\w.-]*\.woff2/)
  expect(worker).not.toMatch(/KaTeX_[\w.-]+\.(ttf|woff)"/)
}, 300_000)

it('publishes the current version of an image only, after it changed', async () => {
  await build()
  const image = join(deck, 'img/chart.svg')
  writeFileSync(image, readFileSync(image, 'utf8').replace('#2563eb', '#dc2626'))
  await build()
  const media = readdirSync(join(web(), 'media'))
  expect(media).toHaveLength(1)
  expect(readFileSync(join(web(), 'media', media[0]!), 'utf8')).toContain('#dc2626')
  const worker = readFileSync(join(web(), 'presmium-sw.js'), 'utf8')
  expect(worker.match(/chart\.svg/g)).toHaveLength(1)
  expect(existsSync(join(deck, '.presmium/web/build/site/public/media'))).toBe(true)
}, 300_000)
