import { execFileSync, spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import { serve as staticSite } from './fixtures/deck.ts'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const EXAMPLE = join(ROOT, 'examples/animations')
const PRESMIUM = join(ROOT, 'packages/cli/bin/presmium.mjs')
const LECTURES = [{ dir: 'bubble-sort', title: '冒泡排序' }, { dir: 'libraries', title: '代码写成的动画' }]

/** The environment of a machine with no speech engine and no credentials. */
function clean(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env }
  delete env.NODE_ENV
  for (const name of Object.keys(env)) {
    if (name.startsWith('PRESMIUM_') || /(?:_KEY|_TOKEN|_SECRET|_PASSWORD|_APPID)$/i.test(name)) delete env[name]
  }
  return env
}

function serve(dir: string): Promise<{ child: ChildProcess, url: string }> {
  const child = spawn(process.execPath, [PRESMIUM, 'serve', dir, '--port', '0'], { cwd: ROOT, env: clean(), stdio: ['ignore', 'pipe', 'pipe'] })
  let output = ''
  return new Promise((resolve, reject) => {
    child.stdout!.on('data', (chunk: Buffer) => {
      output += chunk
      const found = /^serve {2}(http\S+)$/m.exec(output)
      if (found) resolve({ child, url: found[1]! })
    })
    child.stderr!.on('data', (chunk: Buffer) => output += chunk)
    child.once('exit', code => reject(new Error(`presmium serve exited (${code}):\n${output}`)))
  })
}

async function stop(child: ChildProcess | undefined): Promise<void> {
  if (!child || child.exitCode !== null || child.signalCode !== null) return
  const exited = new Promise(done => child.once('exit', done))
  child.kill('SIGTERM')
  const timer = setTimeout(() => child.kill('SIGKILL'), 20_000)
  await exited
  clearTimeout(timer)
}

test.describe.configure({ mode: 'serial', timeout: 300_000 })

let site: Awaited<ReturnType<typeof staticSite>>
test.beforeAll(async () => {
  test.setTimeout(600_000)
  // Built from the committed synthesis cache, with no speech engine: what CI and a new checkout have.
  if (!existsSync(join(EXAMPLE, 'dist/web/index.html'))) execFileSync('pnpm', ['demo:build'], { cwd: ROOT, env: clean(), stdio: 'pipe', timeout: 550_000 })
  site = await staticSite(join(EXAMPLE, 'dist/web'))
})
test.afterAll(async () => { await site?.close() })

test('the copy pnpm studio opens is its own repository, with the lectures, their voice and the notes for the AI, and checks clean without a speech engine', async ({ page }) => {
  const work = join(ROOT, '.presmium')
  mkdirSync(work, { recursive: true })
  const dir = mkdtempSync(join(work, 'e2e-example-'))
  let server: Awaited<ReturnType<typeof serve>> | undefined
  try {
    execFileSync(process.execPath, [join(EXAMPLE, 'try.mjs'), dir], { stdio: 'pipe' })
    const files = execFileSync('git', ['ls-files'], { cwd: dir, encoding: 'utf8' }).split('\n')
    expect(files).toEqual(expect.arrayContaining(['AGENTS.md', 'bubble-sort/lecture.md', 'bubble-sort/scenes/bubble.ts', 'bubble-sort/.presmium/speech.lock.json', 'libraries/lecture.md']))
    expect(files.some(file => file.startsWith('libraries/.presmium/speech/'))).toBe(true)
    expect(files.filter(file => file === 'node_modules' || file.startsWith('node_modules/') || file.includes('/dist/'))).toEqual([])
    for (const { dir: lecture } of LECTURES) expect(execFileSync(process.execPath, [PRESMIUM, 'check', lecture], { cwd: dir, env: clean(), encoding: 'utf8' })).toContain('no problems')
    server = await serve(dir)
    await page.goto(server.url)
    // A new copy's first page starts the site's dev server.
    await expect(page.locator('.pm-site-home__document')).toHaveCount(LECTURES.length, { timeout: 120_000 })
  } finally {
    await stop(server?.child)
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a new copy\'s lecture opens with every library pre-bundled at once: the page is not reloaded to take one found late', async ({ page }) => {
  const work = join(ROOT, '.presmium')
  mkdirSync(work, { recursive: true })
  const dir = mkdtempSync(join(work, 'e2e-example-'))
  let server: Awaited<ReturnType<typeof serve>> | undefined
  try {
    execFileSync(process.execPath, [join(EXAMPLE, 'try.mjs'), dir], { stdio: 'pipe' })
    server = await serve(dir)
    let loads = 0
    page.on('load', () => loads++)
    page.on('pageerror', error => { throw error })
    await page.goto(`${server.url}/bubble-sort/`, { timeout: 120_000 })
    // The scene draws with GSAP, which only the scene's file loads: a library Vite would otherwise find this late.
    await expect(page.locator('.bs__bar').first()).toBeVisible({ timeout: 120_000 })
    await page.waitForLoadState('networkidle')
    expect(loads).toBe(1)
  } finally {
    await stop(server?.child)
    rmSync(dir, { recursive: true, force: true })
  }
})
