import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PRESMIUM_BIN, presmium } from '@lincyaw/cli/testing'
import type { IRDocument } from '@lincyaw/kernel'
import { afterAll, expect, it } from 'vitest'
import { chromium } from 'playwright-chromium'
import type { Browser } from 'playwright-chromium'

const FIXTURES = fileURLToPath(new URL('./fixtures', import.meta.url))
const CORE = fileURLToPath(new URL('../../addon-core', import.meta.url))
const WEB = fileURLToPath(new URL('../../web', import.meta.url))
const SLIDES = fileURLToPath(new URL('..', import.meta.url))
const NOTEBOOK = fileURLToPath(new URL('../../render-notebook', import.meta.url))
const dirs: string[] = []
afterAll(() => dirs.forEach(dir => rmSync(dir, { recursive: true, force: true })))

function fixture(): string {
  const dir = mkdtempSync(join(FIXTURES, '.plugin-contract-'))
  dirs.push(dir)
  for (const name of ['first', 'second']) {
    const root = join(dir, 'node_modules', name)
    mkdirSync(join(root, 'components'), { recursive: true })
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: `fixture-${name}`, private: true, type: 'module', exports: { './presmium': { import: './plugin.mjs', default: './plugin.mjs' } }, ...name === 'first' ? { dependencies: { 'fixture-source-view': '1.0.0' } } : {} }))
    if (name === 'first') {
      const dependency = join(root, 'node_modules/fixture-source-view')
      mkdirSync(dependency, { recursive: true })
      writeFileSync(join(dependency, 'package.json'), JSON.stringify({ name: 'fixture-source-view', version: '1.0.0', type: 'module', exports: './View.vue' }))
      writeFileSync(join(dependency, 'View.vue'), '<template><p><slot /></p></template>')
      writeFileSync(join(root, 'components/Shared.vue'), `<script setup>\nimport SourceView from 'fixture-source-view'\n</script>\n<template><SourceView>${name.toUpperCase()}_COMPONENT</SourceView></template>`)
    } else writeFileSync(join(root, 'components/Shared.vue'), `<template><p>${name.toUpperCase()}_COMPONENT</p></template>`)
    writeFileSync(join(root, 'plugin.mjs'), `export default {
  id: 'fixture.${name}',
  rendererExtensions: { notebook: { components: { Shared: () => '${name.toUpperCase()}_STATIC' } } },
  ${name === 'first' ? `vitePlugins: ({ config }) => [{ name: 'fixture-vite', generateBundle() { this.emitFile({ type: 'asset', fileName: 'vite-config.txt', source: config.message }) } }],` : ''}
}`)
  }
  writeFileSync(join(dir, '.gitignore'), '*\n')
  writeFileSync(join(dir, 'lecture.md'), `---
plugins: [${JSON.stringify(CORE)}, 'first', 'second']
presmium:
  fixture.first: { message: conditional-exports }
renderers:
  web: { package: ${JSON.stringify(WEB)} }
  slides: { package: ${JSON.stringify(SLIDES)} }
  notebook: { package: ${JSON.stringify(NOTEBOOK)} }
---
# Plugin contracts

:::{component} Shared
:::
`)
  return dir
}

function javascript(dir: string): string {
  return readdirSync(dir, { recursive: true }).filter((file): file is string => typeof file === 'string' && file.endsWith('.js')).map(file => readFileSync(join(dir, file), 'utf8')).join('\n')
}

it('builds conditional Node exports and an installed Vue source dependency, with the component owner recorded by the compiler', async () => {
  const dir = fixture()
  const result = await presmium(dir, ['build', '--to', 'web,slides,notebook'])
  expect(result.code, result.stdout + result.stderr).toBe(0)
  expect(result.stdout + result.stderr).toContain('component Shared is already registered by fixture.first')
  const doc = JSON.parse(readFileSync(join(dir, 'dist/ir.json'), 'utf8')) as IRDocument
  expect(doc.sections.flatMap(section => section.blocks).find(block => block.node.type === 'component')?.node).toMatchObject({ plugin: 'fixture.first' })
  for (const form of ['web', 'slides']) {
    const output = join(dir, 'dist', form)
    expect(readFileSync(join(output, 'vite-config.txt'), 'utf8')).toBe('conditional-exports')
    const scripts = javascript(output)
    expect(scripts).toContain('FIRST_COMPONENT')
    expect(scripts).not.toContain('SECOND_COMPONENT')
  }
  const notebook = readFileSync(join(dir, 'dist/notebook/lecture.ipynb'), 'utf8')
  expect(notebook).toContain('FIRST_STATIC')
  expect(notebook).not.toContain('SECOND_STATIC')
}, 300_000)

it('reports a manually supplied Vite plugin without its Node entry instead of silently dropping it', async () => {
  const dir = fixture()
  const wrapper = join(dir, 'wrapper')
  mkdirSync(wrapper)
  writeFileSync(join(wrapper, 'package.json'), JSON.stringify({ name: 'fixture-wrapper', private: true, type: 'module', exports: { './presmium': './plugin.ts' } }))
  writeFileSync(join(wrapper, 'plugin.ts'), `import plugin from ${JSON.stringify(join(SLIDES, 'src/node/presmium.ts'))}
export default { id: 'fixture.wrapper', renderer: { ...plugin.renderer, async build(doc, ctx) { const { nodeVitePlugins, ...manual } = ctx; return plugin.renderer.build(doc, manual) } } }
`)
  const entry = join(dir, 'lecture.md')
  writeFileSync(entry, readFileSync(entry, 'utf8').replace(JSON.stringify(SLIDES), JSON.stringify(wrapper)).replace(", 'second'", ''))
  const result = await presmium(dir, ['build', '--to', 'slides'])
  expect(result.code, result.stdout + result.stderr).toBe(1)
  expect(result.stdout + result.stderr).toContain('needs nodeVitePlugins entries')
}, 120_000)

it('continues updating the live slides through a symlink output directory after its last Vite-contributing plugin is removed', async () => {
  const dir = fixture()
  const physical = join(dir, 'physical/output')
  const alias = join(dir, 'output-alias')
  mkdirSync(physical, { recursive: true })
  symlinkSync(physical, alias, 'dir')
  const outDir = join(alias, 'dev')
  const reserve = createServer()
  await new Promise<void>(resolve => reserve.listen(0, '127.0.0.1', resolve))
  const port = (reserve.address() as AddressInfo).port
  await new Promise<void>(resolve => reserve.close(() => resolve()))
  const entry = join(dir, 'lecture.md')
  const original = readFileSync(entry, 'utf8').replace(`slides: { package: ${JSON.stringify(SLIDES)} }`, `slides: { package: ${JSON.stringify(SLIDES)}, port: ${port} }`)
  writeFileSync(entry, original)
  const { NODE_ENV: _test, ...env } = process.env
  const dev = spawn(process.execPath, [PRESMIUM_BIN, 'dev', '--to', 'slides', '--out', outDir], { cwd: dir, env, stdio: ['ignore', 'pipe', 'pipe'] })
  const stopped = new Promise<void>(resolve => dev.once('close', () => resolve()))
  let output = ''
  const record = (chunk: Buffer) => { output += chunk }
  dev.stdout.on('data', record)
  dev.stderr.on('data', record)
  dev.on('error', error => { output += String(error) })
  let browser: Browser | undefined
  try {
    browser = await chromium.launch({ headless: true })
    const address = () => /^slides {2}(http\S+)$/m.exec(output)?.[1]
    await expect.poll(() => address() ?? output, { timeout: 60_000 }).toMatch(/^http\S+$/)
    await expect.poll(() => output).toContain(`watching; IR in ${join('physical/output/dev/ir.json')}`)
    const url = address()!
    const page = await browser.newPage()
    await page.goto(url)
    await page.getByRole('heading', { name: 'Plugin contracts', exact: true }).first().waitFor({ state: 'visible' })
    await page.getByText('FIRST_COMPONENT', { exact: true }).waitFor({ state: 'visible' })
    writeFileSync(entry, `${original}\n:::{slide}\nBODY_ONLY_SAVE\n:::\n`)
    await page.getByText('BODY_ONLY_SAVE', { exact: true }).waitFor({ state: 'visible', timeout: 30_000 })
    await page.getByText('FIRST_COMPONENT', { exact: true }).waitFor({ state: 'visible' })
    writeFileSync(entry, original.replace(", 'first'", '').replace('# Plugin contracts', '# Saved without Vite plugin'))
    await page.getByRole('heading', { name: 'Saved without Vite plugin', exact: true }).first().waitFor({ state: 'visible', timeout: 30_000 })
    const saved = JSON.parse(readFileSync(join(physical, 'dev/ir.json'), 'utf8')) as IRDocument
    expect(saved.sections[0]?.title).toBe('Saved without Vite plugin')
    const config = readFileSync(join(physical, 'dev/slides/vite.config.ts'), 'utf8')
    expect(config).not.toContain('.vitePlugins(')
    expect(output).not.toContain('needs nodeVitePlugins entries')
  } finally {
    await browser?.close()
    if (dev.exitCode === null && dev.signalCode === null) dev.kill('SIGTERM')
    await stopped
  }
}, 120_000)
