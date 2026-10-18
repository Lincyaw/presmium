import { spawn } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { BIN, presmium } from './helpers.ts'

const FIXTURE = fileURLToPath(new URL('./fixtures/preview', import.meta.url))
const WORK = fileURLToPath(new URL('../../../examples/demo/.presmium', import.meta.url))
const AGENT = /presmium-preview|data-preview-highlight|pm-preview-pin/

let dir: string
let env: Record<string, string>
beforeAll(() => {
  mkdirSync(WORK, { recursive: true })
  dir = mkdtempSync(join(WORK, 'preview-'))
  cpSync(FIXTURE, dir, { recursive: true })
  const home = `${dir}.home`
  mkdirSync(home)
  env = { HOME: home, XDG_CACHE_HOME: join(home, 'cache'), XDG_STATE_HOME: join(home, 'state'), XDG_CONFIG_HOME: join(home, 'config') }
})
afterAll(() => {
  rmSync(dir, { recursive: true, force: true })
  rmSync(`${dir}.home`, { recursive: true, force: true })
})

function matching(root: string, pattern: RegExp): string[] {
  return readdirSync(root, { recursive: true, encoding: 'utf8' }).filter(file => /\.(?:html|js|mjs|css|json)$/.test(file) && pattern.test(readFileSync(join(root, file), 'utf8')))
}

it('builds the web form and the slides without the preview agent; the slides have the sections\' and the blocks\' anchors', async () => {
  const { code, stdout, stderr } = await presmium(dir, ['build', '--to', 'web,slides', '--out', 'out'], env)
  expect(code, stdout + stderr).toBe(0)
  for (const form of ['web', 'slides']) {
    const files = readdirSync(join(dir, 'out', form), { recursive: true, encoding: 'utf8' })
    expect(files.some(file => file.endsWith('.js')), form).toBe(true)
    expect(matching(join(dir, 'out', form), AGENT), form).toEqual([])
  }
  const slides = readFileSync(join(dir, '.presmium/slides/slides.md'), 'utf8')
  expect(slides).toContain('<div class="pm-slide-section" data-section="start">\n\n# Start\n\n<div class="pm-block" data-block="intro" data-section="start" data-step="0">\n\nA block of the first section.\n\n</div>')
  expect(slides).toContain('<div class="pm-block" data-block="later" data-section="start" data-step="1">\n\n<div v-click="1">\n\nA block of its first step.')
  expect(existsSync(join(dir, '.presmium/slides/setup'))).toBe(false)
}, 300_000)

async function dev<T>(args: string[], form: 'web' | 'slides', read: (url: string) => Promise<T>): Promise<T> {
  const { NODE_ENV: _test, ...inherited } = process.env
  const child = spawn(process.execPath, [BIN, 'dev', ...args], { cwd: dir, env: { ...inherited, ...env }, stdio: ['ignore', 'pipe', 'pipe'] })
  let output = ''
  child.stdout.on('data', (chunk: Buffer) => output += chunk)
  child.stderr.on('data', (chunk: Buffer) => output += chunk)
  try {
    const url = await new Promise<string>((done, fail) => {
      const timer = setTimeout(() => fail(new Error(`no ${form} dev server:\n${output}`)), 180_000)
      child.stdout.on('data', () => {
        const match = new RegExp(`^${form} {2}(http\\S+)$`, 'm').exec(output)
        if (match) {
          clearTimeout(timer)
          done(match[1]!)
        }
      })
      child.once('exit', code => fail(new Error(`presmium dev exited (${code}):\n${output}`)))
    })
    return await read(url)
  } finally {
    const exited = new Promise(done => child.once('exit', done))
    child.kill('SIGTERM')
    await exited
  }
}

async function served(url: string, path: string): Promise<Response> {
  const response = await fetch(new URL(path, url))
  expect(response.status, path).toBe(200)
  return response
}

const devTheme = (args: string[]) => dev(['--to', 'web', ...args], 'web', async web => ({
  index: await (await served(web, '.vitepress/theme/index.ts')).text(),
  addons: await (await served(web, '.vitepress/theme/addons.ts')).text(),
}))

it('runs presmium dev without edit mode and without the preview agent; with --edit, edit mode is there', async () => {
  const plain = await devTheme([])
  expect(plain.addons).toContain('addon-core')
  expect(plain.addons).not.toContain('workspace/src/client')
  expect(plain.index).not.toContain('client/preview.ts')
  const editing = await devTheme(['--edit'])
  expect(editing.addons).toContain('workspace/src/client/plugin.ts')
  expect(editing.index).not.toContain('client/preview.ts')

  const deck = join(dir, '.presmium/dev/slides')
  const page = await dev(['--to', 'slides'], 'slides', async (slides) => {
    const response = await served(slides, '')
    return { csp: response.headers.get('content-security-policy'), config: readFileSync(join(deck, 'vite.config.ts'), 'utf8'), markdown: readFileSync(join(deck, 'slides.md'), 'utf8') }
  })
  expect(page.markdown).toContain('<div class="pm-block" data-block="intro" data-section="start" data-step="0">')
  expect(existsSync(join(deck, 'setup')) || existsSync(join(deck, 'preview.json'))).toBe(false)
  expect(page.config).not.toMatch(/presmiumPreview|frame-ancestors|client\/preview\.ts/)
  expect(page.markdown).not.toContain('presmiumDocument')
  expect(page.csp).toBeNull()
}, 500_000)
