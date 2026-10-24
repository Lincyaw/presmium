import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { appendFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import type { IRDocument } from '../packages/kernel/src/ir.ts'
import { overrides, packAll, packPlugin, presmiumBin, userEnv } from '../scripts/consumer.ts'
import type { Tarball } from '../scripts/consumer.ts'
import { openDevPage, serve } from './fixtures/deck.ts'

test.describe.configure({ mode: 'serial' })

const PORTS = { web: 5413, slides: 5414 }
const EXAMPLE_PORTS = { web: 5415, slides: 5416 }

let work: string | undefined
let lecture: string
let plugin: string
let site: { url: string, close(): Promise<void> } | undefined
const running: ChildProcess[] = []
const serviceLogs: Array<{ command: string, output(): string }> = []

async function install(dir: string, tarballs: Map<string, Tarball>, extra: Record<string, string> = {}): Promise<void> {
  const file = join(dir, 'package.json')
  const pkg = JSON.parse(readFileSync(file, 'utf8')) as { devDependencies: Record<string, string> }
  for (const name of Object.keys(pkg.devDependencies)) if (tarballs.has(name)) pkg.devDependencies[name] = `file:${tarballs.get(name)!.file}`
  Object.assign(pkg.devDependencies, extra)
  writeFileSync(file, `${JSON.stringify(pkg, null, 2)}\n`)
  appendFileSync(join(dir, 'pnpm-workspace.yaml'), overrides(tarballs, dir))
  await sh('pnpm', ['install', '--reporter=append-only'], dir)
}

const pluginBin = (dir: string) => join(dir, 'node_modules/@lincyaw/cli/bin/presmium.mjs')

async function dev(cwd: string, args: string[], forms: string[], bin = presmiumBin(cwd)): Promise<Record<string, string>> {
  const child = spawn(process.execPath, [bin, ...args], { cwd, env: userEnv(), stdio: ['ignore', 'pipe', 'pipe'] })
  running.push(child)
  return new Promise((resolve, reject) => {
    let output = ''
    serviceLogs.push({ command: `presmium ${args.join(' ')}`, output: () => output })
    const read = (chunk: Buffer) => {
      output += chunk
      const urls = Object.fromEntries(forms.map(form => [form, new RegExp(`^${form} {2}(http\\S+?)\\/?$`, 'm').exec(output)?.[1]]))
      if (Object.values(urls).every(Boolean)) resolve(urls as Record<string, string>)
    }
    child.stdout.on('data', read)
    child.stderr.on('data', read)
    child.once('exit', code => reject(new Error(`presmium ${args.join(' ')} exited (${code}):\n${output}`)))
  })
}

function sh(command: string, args: string[], cwd: string): Promise<string> {
  const child = spawn(command, args, { cwd, env: userEnv(), stdio: ['ignore', 'pipe', 'pipe'] })
  let output = ''
  child.stdout.on('data', (chunk: Buffer) => output += chunk)
  child.stderr.on('data', (chunk: Buffer) => output += chunk)
  return new Promise((resolve, reject) => child.once('close', code => code === 0 ? resolve(output) : reject(new Error(`${command} ${args.join(' ')} exited (${code}):\n${output}`))))
}

test.beforeAll(async () => {
  test.setTimeout(900_000)
  work = mkdtempSync(join(tmpdir(), 'presmium-create-e2e-'))
  const tarballs = await packAll(join(work, 'tarballs'))
  const create = (args: string[]) => sh('pnpm', [`--package=${tarballs.get('create-presmium')!.file}`, 'dlx', 'create-presmium', ...args], work!)
  await create(['greeting', '--type', 'plugin', '--name', 'presmium-plugin-greeting'])
  await create(['lecture', '--type', 'lecture', '--title', '问候'])
  plugin = join(work, 'greeting')
  const packed = await packPlugin(plugin, join(work, 'tarballs'))

  lecture = join(work, 'lecture')
  const source = join(lecture, 'lecture.md')
  writeFileSync(source, readFileSync(source, 'utf8')
    .replace(/^( {2}- '@lincyaw\/addon-core'.*)$/m, `$1\n  - ${packed.name}\nrenderers:\n  web: { port: ${PORTS.web} }\n  slides: { port: ${PORTS.slides} }`)
    .concat('\n(greeting)=\n## 问候\n\n:::{greeting} 读者\n:::\n'))
  await install(lecture, tarballs, { [packed.name]: `file:${packed.file}` })
  await sh(process.execPath, [presmiumBin(lecture), 'build', '--to', 'web,slides'], lecture)
  await install(plugin, tarballs)
  const example = join(plugin, 'example/lecture.md')
  writeFileSync(example, readFileSync(example, 'utf8').replace(/^ {2}web: \{\}$/m, `  web: { port: ${EXAMPLE_PORTS.web} }`).replace(/^ {2}slides: \{\}$/m, `  slides: { port: ${EXAMPLE_PORTS.slides} }`))
  site = await serve(join(lecture, 'dist'), '/slides/')
})

test.afterAll(async () => {
  await site?.close()
  await Promise.all(running.filter(child => child.exitCode === null).map((child) => {
    const exited = new Promise(resolve => child.once('exit', resolve))
    child.kill('SIGTERM')
    return exited
  }))
  if (work) rmSync(work, { recursive: true, force: true })
})

test.afterEach(async ({}, info) => {
  for (const [index, log] of serviceLogs.entries()) {
    await info.attach(`service-${index + 1}.log`, { body: `${log.command}\n${log.output()}`, contentType: 'text/plain' })
  }
})

async function greeting(page: Page, url: string, text = '你好，读者！'): Promise<void> {
  const errors: string[] = []
  const listen = (error: Error) => errors.push(String(error))
  page.on('pageerror', listen)
  await page.goto(url)
  await expect(page.locator('.greeting-card__text').first()).toHaveText(text)
  page.off('pageerror', listen)
  expect(errors.filter(error => !/FloatingVue|Wake Lock/.test(error))).toEqual([])
}

test('the built web page and slides show the plugin\'s component, which a site without a server leaves without its button', async ({ page }) => {
  await greeting(page, `${site!.url}/web/?section=greeting`)
  await expect(page.locator('.greeting-card button')).toHaveCount(0)
  const doc = JSON.parse(readFileSync(join(lecture, 'dist/ir.json'), 'utf8')) as IRDocument
  await greeting(page, `${site!.url}/slides/${doc.sections.find(section => section.id === 'greeting')!.index}`)
})

test('under presmium dev the component waves through the plugin\'s server route', async ({ page }) => {
  test.setTimeout(300_000)
  const { web: url } = await dev(lecture, ['dev', '--to', 'web'], ['web'])
  const card = page.locator('.greeting-card').first()
  await openDevPage(page, `${url}/?section=greeting`, card.getByRole('button', { name: '挥手' }))
  await card.getByRole('button', { name: '挥手' }).click()
  await expect(card.locator('.greeting-card__count')).toHaveText('已挥手 1 次')
  await card.getByRole('button', { name: '挥手' }).click()
  await expect(card.locator('.greeting-card__count')).toHaveText('已挥手 2 次')
})

test('the plugin project\'s pnpm dev shows its example\'s component in the web page and the slides', async ({ page }) => {
  test.setTimeout(300_000)
  const { scripts } = JSON.parse(readFileSync(join(plugin, 'package.json'), 'utf8')) as { scripts: { dev: string } }
  const [command, ...args] = scripts.dev.split(' ')
  expect(command).toBe('presmium')
  const urls = await dev(plugin, args, ['web', 'slides'], pluginBin(plugin))
  const doc = JSON.parse(readFileSync(join(plugin, 'example/.presmium/dev/ir.json'), 'utf8')) as IRDocument
  const pages = [`${urls.web}/?section=greeting`, `${urls.slides}/${doc.sections.find(section => section.id === 'greeting')!.index}`]
  for (const url of pages) {
    await openDevPage(page, url, page.locator('.greeting-card__text').first())
    await greeting(page, url, 'Hello, reader!')
  }
})
