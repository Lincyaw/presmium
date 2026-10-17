// The consumer install in a browser (P-141; WP-93a): a project outside the monorepo installs
// Presmium's packed tarballs with npm (scripts/consumer.ts) and a third-party plugin from its own
// tarball (e2e/fixtures/consumer/plugin). The plugin's component, which uses @presmium/host, shows in
// the web form and the slides, as built and in `presmium dev`. packages/cli/test/consumer.test.ts
// checks the commands' results without a browser.
import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { consumerProject, FIXTURES, presmiumBin, userEnv } from '../scripts/consumer.ts'
import { serve } from './fixtures/deck.ts'

test.describe.configure({ mode: 'serial' })

let project: string | undefined
let site: { url: string, close(): Promise<void> } | undefined
let dev: ChildProcess | undefined

/** Runs the project's own `presmium` with `args`; resolves with its output, rejects when it fails. */
function presmium(args: string[]): Promise<string> {
  const child = spawn(process.execPath, [presmiumBin(project!), ...args], { cwd: project, env: userEnv(), stdio: ['ignore', 'pipe', 'pipe'] })
  let output = ''
  child.stdout.on('data', (chunk: Buffer) => output += chunk)
  child.stderr.on('data', (chunk: Buffer) => output += chunk)
  return new Promise((resolve, reject) => child.once('exit', code => code === 0 ? resolve(output) : reject(new Error(`presmium ${args.join(' ')} exited (${code}):\n${output}`))))
}

test.beforeAll(async () => {
  test.setTimeout(900_000)
  ;({ dir: project } = await consumerProject({ plugins: [join(FIXTURES, 'plugin')], files: join(FIXTURES, 'deck') }))
  // The dev servers on ports of WP-93a's range; a busy one gives way to the next free port.
  const lecture = join(project, 'lecture.md')
  writeFileSync(lecture, readFileSync(lecture, 'utf8').replace('  web: {}', '  web: { port: 5408 }').replace('  slides: {}', '  slides: { port: 5409 }'))
  await presmium(['build', '--to', 'web,slides'])
  site = await serve(join(project, 'dist'), '/slides/')
})

test.afterAll(async () => {
  await site?.close()
  if (dev && dev.exitCode === null) {
    const exited = new Promise(resolve => dev!.once('exit', resolve))
    dev.kill('SIGTERM')
    await exited
  }
  if (project) rmSync(project, { recursive: true, force: true })
})

/** The plugin's component on a page of a form, in the document's language. */
async function greeting(page: Page, url: string): Promise<void> {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(String(error)))
  await page.goto(url)
  await expect(page.locator('.hello-greeting').first()).toHaveText('Hello, reader!')
  expect(errors.filter(error => !/FloatingVue|Wake Lock/.test(error))).toEqual([])
}

test('the built web form and slides show the third-party plugin\'s component', async ({ page }) => {
  await greeting(page, `${site!.url}/web/`)
  await greeting(page, `${site!.url}/slides/2`)
})

test('presmium dev serves both forms with the third-party plugin\'s component', async ({ page }) => {
  test.setTimeout(300_000)
  const child = spawn(process.execPath, [presmiumBin(project!), 'dev', '--to', 'web,slides'], { cwd: project, env: userEnv(), stdio: ['ignore', 'pipe', 'pipe'] })
  dev = child
  let output = ''
  child.stdout.on('data', (chunk: Buffer) => output += chunk)
  child.stderr.on('data', (chunk: Buffer) => output += chunk)
  await new Promise<void>((resolve, reject) => {
    child.stdout.on('data', () => /^watching/m.test(output) && resolve())
    child.once('exit', code => reject(new Error(`presmium dev exited (${code}):\n${output}`)))
  })
  const url = (form: string) => new RegExp(`^${form} {2}(http://\\S+?)/?$`, 'm').exec(output)?.[1]
  await greeting(page, `${url('web')}/`)
  await greeting(page, `${url('slides')}/2`)
})
