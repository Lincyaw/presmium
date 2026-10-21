import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { consumerProject, FIXTURES, presmiumBin, userEnv } from '../scripts/consumer.ts'
import { serve } from './fixtures/deck.ts'

test.describe.configure({ mode: 'serial' })

let project: string | undefined
let site: { url: string, close(): Promise<void> } | undefined
const running: ChildProcess[] = []
const outside: string[] = []
const serviceLogs: Array<{ command: string, output(): string }> = []

function presmium(args: string[]): Promise<string> {
  const child = spawn(process.execPath, [presmiumBin(project!), ...args], { cwd: project, env: userEnv(), stdio: ['ignore', 'pipe', 'pipe'] })
  let output = ''
  child.stdout.on('data', (chunk: Buffer) => output += chunk)
  child.stderr.on('data', (chunk: Buffer) => output += chunk)
  return new Promise((resolve, reject) => child.once('exit', code => code === 0 ? resolve(output) : reject(new Error(`presmium ${args.join(' ')} exited (${code}):\n${output}`))))
}

async function stop(child: ChildProcess): Promise<void> {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return
  const exited = new Promise<void>(resolve => child.once('exit', () => resolve()))
  child.kill('SIGTERM')
  await exited
}

async function start(args: string[], ready: RegExp, forms: string[], env: Record<string, string> = {}): Promise<Record<string, string>> {
  const child = spawn(process.execPath, [presmiumBin(project!), ...args], { cwd: project, env: userEnv(env), stdio: ['ignore', 'pipe', 'pipe'] })
  running.push(child)
  let output = ''
  serviceLogs.push({ command: `presmium ${args.join(' ')}`, output: () => output })
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    await new Promise<void>((resolve, reject) => {
      const read = (chunk: Buffer) => {
        output += chunk
        if (ready.test(output)) resolve()
      }
      timeout = setTimeout(() => reject(new Error(`presmium ${args.join(' ')} did not become ready:\n${output}`)), 120_000)
      child.stdout.on('data', read)
      child.stderr.on('data', read)
      child.once('error', reject)
      child.once('exit', code => reject(new Error(`presmium ${args.join(' ')} exited (${code}):\n${output}`)))
    })
    return Object.fromEntries(forms.map((form) => {
      const url = new RegExp(`^${form} {2}(http://\\S+?)/?$`, 'm').exec(output)?.[1]
      if (!url) throw new Error(`presmium ${args.join(' ')} did not start ${form}:\n${output}`)
      return [form, url]
    }))
  } catch (error) {
    await stop(child)
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

function outsideDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  outside.push(dir)
  return dir
}

test.beforeAll(async () => {
  test.setTimeout(900_000)
  ;({ dir: project } = await consumerProject({ plugins: [join(FIXTURES, 'plugin')], files: join(FIXTURES, 'deck') }))
  const lecture = join(project, 'lecture.md')
  writeFileSync(lecture, readFileSync(lecture, 'utf8').replace('  web: {}', '  web: { port: 5408 }').replace('  slides: {}', '  slides: { port: 5409 }'))
  await presmium(['build', '--to', 'web,slides'])
  site = await serve(join(project, 'dist'), '/slides/')
})

test.afterAll(async () => {
  await site?.close()
  await Promise.all(running.map(stop))
  for (const dir of [...outside, ...project ? [project] : []]) rmSync(dir, { recursive: true, force: true })
})

test.afterEach(async ({}, info) => {
  for (const [index, log] of serviceLogs.entries()) {
    await info.attach(`service-${index + 1}.log`, { body: `${log.command}\n${log.output()}`, contentType: 'text/plain' })
  }
})

async function greeting(page: Page, url: string, timeout = 10_000): Promise<void> {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(String(error)))
  await page.goto(url)
  await expect(page.locator('.hello-greeting').first()).toHaveText('Hello, reader!', { timeout })
  expect(errors.filter(error => !/FloatingVue|Wake Lock/.test(error))).toEqual([])
}

test('the built web form and slides show the third-party plugin\'s component', async ({ page }) => {
  await greeting(page, `${site!.url}/web/`)
  await greeting(page, `${site!.url}/slides/2`)
})

test('presmium dev, its output outside the project, serves both forms with the third-party plugin\'s component', async ({ page }) => {
  test.setTimeout(300_000)
  const urls = await start(['dev', '--to', 'web,slides', '--out', outsideDir('presmium-consumer-dev-')], /^watching/m, ['web', 'slides'])
  await greeting(page, `${urls.web}/`, 60_000)
  await greeting(page, `${urls.slides}/2`, 60_000)
})

test('presmium serve shows a workspace\'s home page and its document with the third-party plugin\'s component', async ({ page }) => {
  test.setTimeout(300_000)
  const ws = join(project!, 'ws')
  mkdirSync(join(ws, 'intro'), { recursive: true })
  cpSync(join(FIXTURES, 'deck/lecture.md'), join(ws, 'intro/lecture.md'))
  writeFileSync(join(ws, 'presmium.workspace.yaml'), 'title: Consumer workspace\ndocuments: [\'*/lecture.md\']\n')
  const { serve: url } = await start(['serve', 'ws', '--port', '0'], /^mcp {2}/m, ['serve'], { XDG_CACHE_HOME: outsideDir('presmium-consumer-cache-') })
  const errors: string[] = []
  page.on('pageerror', error => errors.push(String(error)))
  await page.goto(`${url}/`)
  await expect(page.getByRole('link', { name: /Installed from tarballs/ }).first()).toBeVisible()
  expect(errors).toEqual([])
  await greeting(page, `${url}/intro/`)
})
