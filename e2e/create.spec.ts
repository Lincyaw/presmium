// A plugin made with create-presmium, in a lecture made with it, in a browser (P-142; WP-93b): outside
// the monorepo and without the registry, every public package is packed as it is published
// (scripts/consumer.ts) and create-presmium runs from its tarball (`npm exec`, as `npm create presmium`
// runs it). It makes a plugin and a lecture; the plugin is packed with npm as its author would
// publish it, and the lecture lists it and installs it from that tarball, with Presmium's packages
// from theirs. The plugin's component shows in the built web page and slides, in the lecture's
// language; under `presmium dev` it waves through the plugin's server route.
// packages/create-presmium/test/create.test.ts checks, builds and tests the three kinds of project.
import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import type { IRDocument } from '../packages/kernel/src/ir.ts'
import { closure, packAll, packPlugin, presmiumBin, userEnv } from '../scripts/consumer.ts'
import { openDevPage, serve } from './fixtures/deck.ts'

test.describe.configure({ mode: 'serial' })

/** The dev servers of the lecture, on ports of WP-93b's range (a busy one gives way to the next free port). */
const PORTS = { web: 5413, slides: 5414 }

let work: string | undefined
let lecture: string
let site: { url: string, close(): Promise<void> } | undefined
const running: ChildProcess[] = []

/** Runs a command in `cwd`; resolves with its output, fails with it. */
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
  const create = (args: string[]) => sh('npm', ['exec', '--yes', `--package=${tarballs.get('create-presmium')!.file}`, '--', 'create-presmium', ...args], work!)
  await create(['greeting', '--type', 'plugin', '--name', 'presmium-plugin-greeting'])
  await create(['lecture', '--type', 'lecture', '--title', '问候'])
  const plugin = await packPlugin(join(work, 'greeting'), join(work, 'tarballs'))

  // The lecture lists the plugin and greets with it, in the document's language (zh-CN by default).
  lecture = join(work, 'lecture')
  const source = join(lecture, 'lecture.md')
  writeFileSync(source, readFileSync(source, 'utf8')
    .replace(/^( {2}- '@presmium\/slidev-addon-core'.*)$/m, `$1\n  - ${plugin.name}\nrenderers:\n  web: { port: ${PORTS.web} }\n  slides: { port: ${PORTS.slides} }`)
    .concat('\n(greeting)=\n## 问候\n\n:::{greeting} 读者\n:::\n'))
  // Installed as from the registry: Presmium's packages from their tarballs, the plugin from its own.
  const file = join(lecture, 'package.json')
  const pkg = JSON.parse(readFileSync(file, 'utf8')) as { dependencies: Record<string, string> }
  for (const name of closure(Object.keys(pkg.dependencies))) pkg.dependencies[name] = `file:${tarballs.get(name)!.file}`
  pkg.dependencies[plugin.name] = `file:${plugin.file}`
  writeFileSync(file, `${JSON.stringify(pkg, null, 2)}\n`)
  await sh('npm', ['install', '--no-audit', '--no-fund', '--loglevel=error'], lecture)
  await sh(process.execPath, [presmiumBin(lecture), 'build', '--to', 'web,slides'], lecture)
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

/** The plugin's card on a page: its greeting in the lecture's language. */
async function greeting(page: Page, url: string): Promise<void> {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(String(error)))
  await page.goto(url)
  await expect(page.locator('.greeting-card__text').first()).toHaveText('你好，读者！')
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
  const child = spawn(process.execPath, [presmiumBin(lecture), 'dev', '--to', 'web'], { cwd: lecture, env: userEnv(), stdio: ['ignore', 'pipe', 'pipe'] })
  running.push(child)
  const url = await new Promise<string>((resolve, reject) => {
    let output = ''
    const read = (chunk: Buffer) => {
      output += chunk
      const found = /^web {2}(http\S+?)\/?$/m.exec(output)?.[1]
      if (found) resolve(found)
    }
    child.stdout.on('data', read)
    child.stderr.on('data', read)
    child.once('exit', code => reject(new Error(`presmium dev exited (${code}):\n${output}`)))
  })
  const card = page.locator('.greeting-card').first()
  await openDevPage(page, `${url}/?section=greeting`, card.getByRole('button', { name: '挥手' }))
  await card.getByRole('button', { name: '挥手' }).click()
  await expect(card.locator('.greeting-card__count')).toHaveText('已挥手 1 次')
  await card.getByRole('button', { name: '挥手' }).click()
  await expect(card.locator('.greeting-card__count')).toHaveText('已挥手 2 次')
})
