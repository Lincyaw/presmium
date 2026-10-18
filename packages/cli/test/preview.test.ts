// The products without the workbench (G-1, G-4; docs/design-dsh.md 4.2, 4.4, WP-96a): the static builds of the web
// form and of the slides have no code of the preview agent, and the slides have the blocks' anchors; `presmium dev`
// without `--edit` has no edit mode and no preview agent in its pages, with `--edit` it has edit mode as before. The
// copy of fixtures/preview lies in the demo, whose node_modules hold the renderers, Slidev and its theme.
import { spawn } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { BIN, presmium } from './helpers.ts'

const FIXTURE = fileURLToPath(new URL('./fixtures/preview', import.meta.url))
const WORK = fileURLToPath(new URL('../../../examples/demo/.presmium', import.meta.url))
/** What only the preview agent has: the protocol's name and its marks of the page. */
const AGENT = /presmium-preview|data-preview-highlight|pm-preview-pin/

let dir: string
beforeAll(() => {
  mkdirSync(WORK, { recursive: true })
  dir = mkdtempSync(join(WORK, 'preview-'))
  cpSync(FIXTURE, dir, { recursive: true })
})
afterAll(() => rmSync(dir, { recursive: true, force: true }))

/** Every file under `root` whose text matches. */
function matching(root: string, pattern: RegExp): string[] {
  return readdirSync(root, { recursive: true, encoding: 'utf8' }).filter(file => /\.(?:html|js|mjs|css|json)$/.test(file) && pattern.test(readFileSync(join(root, file), 'utf8')))
}

it('builds the web form and the slides without the preview agent; the slides have the blocks\' anchors', async () => {
  const { code, stdout, stderr } = await presmium(dir, ['build', '--to', 'web,slides', '--out', 'out'])
  expect(code, stdout + stderr).toBe(0)
  for (const form of ['web', 'slides']) {
    const files = readdirSync(join(dir, 'out', form), { recursive: true, encoding: 'utf8' })
    expect(files.some(file => file.endsWith('.js')), form).toBe(true)
    expect(matching(join(dir, 'out', form), AGENT), form).toEqual([])
  }
  // The anchors of the slides, around the blocks and their clicks; no setup of a preview in the generated deck.
  const slides = readFileSync(join(dir, '.presmium/slides/slides.md'), 'utf8')
  expect(slides).toContain('<div class="pm-block" data-block="intro" data-section="start" data-step="0">\n\nA block of the first section.\n\n</div>')
  expect(slides).toContain('<div class="pm-block" data-block="later" data-section="start" data-step="1">\n\n<div v-click="1">\n\nA block of its first step.')
  expect(existsSync(join(dir, '.presmium/slides/setup'))).toBe(false)
}, 300_000)

/** `presmium dev --to web` with `args`: the theme modules of its page as the dev server gives them. */
async function devTheme(args: string[]): Promise<{ index: string, addons: string }> {
  const { NODE_ENV: _test, ...env } = process.env
  const child = spawn(process.execPath, [BIN, 'dev', '--to', 'web', ...args], { cwd: dir, env, stdio: ['ignore', 'pipe', 'pipe'] })
  let output = ''
  child.stdout.on('data', (chunk: Buffer) => output += chunk)
  child.stderr.on('data', (chunk: Buffer) => output += chunk)
  try {
    const web = await new Promise<string>((done, fail) => {
      const timer = setTimeout(() => fail(new Error(`no web dev server:\n${output}`)), 180_000)
      child.stdout.on('data', () => {
        const match = /^web {2}(http\S+)$/m.exec(output)
        if (match) {
          clearTimeout(timer)
          done(match[1]!)
        }
      })
      child.once('exit', code => fail(new Error(`presmium dev exited (${code}):\n${output}`)))
    })
    const module = async (path: string) => {
      const response = await fetch(new URL(path, web))
      expect(response.status, path).toBe(200)
      return await response.text()
    }
    return { index: await module('.vitepress/theme/index.ts'), addons: await module('.vitepress/theme/addons.ts') }
  } finally {
    const exited = new Promise(done => child.once('exit', done))
    child.kill('SIGTERM')
    await exited
  }
}

it('runs presmium dev without edit mode and without the preview agent; with --edit, edit mode is there', async () => {
  const plain = await devTheme([])
  expect(plain.addons).toContain('addon-core')
  expect(plain.addons).not.toContain('workspace/src/client')
  expect(plain.index).not.toContain('client/preview.ts')
  const editing = await devTheme(['--edit'])
  expect(editing.addons).toContain('workspace/src/client/plugin.ts')
  expect(editing.index).not.toContain('client/preview.ts')
}, 400_000)
