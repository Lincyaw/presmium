import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { presmium } from '@lincyaw/cli/testing'
import { afterAll, beforeAll, expect, it } from 'vitest'

const FIXTURES = fileURLToPath(new URL('./fixtures', import.meta.url))

let deck: string
beforeAll(async () => {
  deck = mkdtempSync(join(FIXTURES, '.site-'))
  cpSync(join(FIXTURES, 'site'), deck, { recursive: true })
  writeFileSync(join(deck, '.gitignore'), '*\n')
  await build()
}, 300_000)
afterAll(() => rmSync(deck, { recursive: true, force: true }))

const web = () => join(deck, 'dist/web')

async function build() {
  const { code, stdout, stderr } = await presmium(deck, ['build', '--to', 'web'])
  expect(code, stdout + stderr).toBe(0)
}

it('publishes the run-time files of the deck\'s plugins for their configuration, renders math at build time and precaches woff2 fonts only', () => {
  expect(readFileSync(join(web(), 'fixture/message.txt'), 'utf8')).toBe('来自文稿的配置')
  expect(readFileSync(join(web(), 'index.html'), 'utf8')).toContain('class="katex"')
  const worker = readFileSync(join(web(), 'presmium-sw.js'), 'utf8')
  expect(worker).toMatch(/KaTeX_Main-Regular[\w.-]*\.woff2/)
  expect(worker).not.toMatch(/KaTeX_[\w.-]+\.(ttf|woff)"/)
})

it('publishes the local files a link and a link definition name, under their published names; a malformed URL stays as written', () => {
  const media = readdirSync(join(web(), 'media'))
  const handout = media.find(name => /^[\da-f]{8}-handout\.pdf$/.test(name))
  const notes = media.find(name => /^[\da-f]{8}-notes\.txt$/.test(name))
  expect(handout, media.join(', ')).toBeDefined()
  expect(notes, media.join(', ')).toBeDefined()
  expect(readFileSync(join(web(), 'media', handout!), 'utf8')).toContain('Presmium fixture handout')
  const page = readFileSync(join(web(), 'index.html'), 'utf8')
  expect(page).toContain(`href="/media/${handout}"`)
  expect(page).toContain(`href="/media/${notes}"`)
  expect(page).toContain('href="bad%E0%A4.pdf"')
})

it('publishes the current version of an image only, after it changed', async () => {
  const image = join(deck, 'img/chart.svg')
  writeFileSync(image, readFileSync(image, 'utf8').replace('#2563eb', '#dc2626'))
  await build()
  const charts = readdirSync(join(web(), 'media')).filter(name => name.endsWith('-chart.svg'))
  expect(charts).toHaveLength(1)
  expect(readFileSync(join(web(), 'media', charts[0]!), 'utf8')).toContain('#dc2626')
  const worker = readFileSync(join(web(), 'presmium-sw.js'), 'utf8')
  expect(worker.match(/chart\.svg/g)).toHaveLength(1)
}, 300_000)
