import { execFileSync, spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import { openDevPage } from './fixtures/deck.ts'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const WORKSPACE = join(ROOT, 'examples/workspace')
const PRESMIUM = join(ROOT, 'packages/cli/bin/presmium.mjs')

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

test('presmium serve examples/workspace starts and its home page lists the two documents; the BPE document is the demo lecture', async ({ page }) => {
  execFileSync(process.execPath, [join(WORKSPACE, 'sync.mjs'), '--check'], { stdio: 'pipe' })
  const server = await serve(WORKSPACE)
  try {
    await page.goto(server.url)
    const documents = page.locator('.pm-site-home__document')
    await expect(documents).toHaveCount(2)
    await expect(documents.nth(0)).toHaveAttribute('data-document', 'bpe')
    await expect(documents.nth(0)).toContainText('BPE 分词')
    await expect(documents.nth(1)).toHaveAttribute('data-document', 'glance')
    await expect(documents.nth(1)).toContainText('分词速览')
  } finally {
    await stop(server.child)
  }
})

test('the copy that try.mjs makes serves both documents with their plugins', async ({ page }) => {
  const work = join(ROOT, 'examples/demo/.presmium')
  mkdirSync(work, { recursive: true })
  const dir = mkdtempSync(join(work, 'e2e-example-workspace-'))
  let server: Awaited<ReturnType<typeof serve>> | undefined
  try {
    execFileSync(process.execPath, [join(WORKSPACE, 'try.mjs'), dir], { stdio: 'pipe' })
    expect(execFileSync('git', ['rev-list', '--count', 'HEAD'], { cwd: dir, encoding: 'utf8' }).trim()).toBe('1')
    server = await serve(dir)

    await openDevPage(page, `${server.url}/bpe/extend.html`, page.locator('.pm-block[data-component="PmRunPanel"]'))
    await expect(page.locator('.pm-block[data-component="PmPredict"]')).toBeVisible()
    await expect(page.locator('.pm-block[data-block="merges-table"] tbody tr')).toHaveCount(10)
    await expect(page.locator('.pm-diagnostics')).toHaveCount(0)

    await openDevPage(page, `${server.url}/glance/`, page.locator('.pm-block[data-component="PmQuiz"]'))
    await expect(page.locator('.pm-diagnostics')).toHaveCount(0)

    await page.locator('.pm-section[data-section="glance"] a', { hasText: 'BPE 分词' }).click()
    await expect(page).toHaveURL(`${server.url}/bpe/`)
    await expect(page.locator('.pm-section[data-section="cover"] h1')).toContainText('BPE 分词：从字节到词元', { timeout: 60_000 })
  } finally {
    await stop(server?.child)
    rmSync(dir, { recursive: true, force: true })
  }
})
