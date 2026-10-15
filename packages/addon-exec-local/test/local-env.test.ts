// Starts a real Slidev dev server on a test deck that lives in a fresh git
// repository with a devcontainer definition, then uses the local-environment
// endpoints directly and through the deck in Chromium. Container cases are
// skipped (and reported as skipped) when no Docker daemon is available.
import { execFileSync, spawn, spawnSync } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { cpSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { createServer } from 'node:net'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'
import type { Browser } from '@playwright/test'
import { strFromU8, unzipSync } from 'fflate'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { imageName } from '../src/node/container.ts'

const PACKAGE = fileURLToPath(new URL('..', import.meta.url))
const ADDON_CORE = fileURLToPath(new URL('../../addon-core', import.meta.url))
// The demo deck's Slidev installation; test decks must live inside the workspace to resolve the addons.
const SLIDEV = createRequire(fileURLToPath(new URL('../../../examples/demo/package.json', import.meta.url))).resolve('@slidev/cli/bin/slidev.mjs')
const FIXTURE = join(PACKAGE, 'test/fixtures/repo')
const REPO = join(PACKAGE, 'test/.tmp/repo')

const docker = (() => {
  try {
    execFileSync('docker', ['version', '--format', '{{.Server.Version}}'], { stdio: 'ignore' })
    return true
  }
  catch {
    return false
  }
})()

const git = (...args: string[]) => execFileSync('git', args, { cwd: REPO, encoding: 'utf8' }).trim()

let server: ChildProcess
let base = ''
let browser: Browser | undefined

function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const probe = createServer().listen(0, () => {
      const { port } = probe.address() as { port: number }
      probe.close(() => resolve(port))
    })
  })
}

async function startSlidev(): Promise<string> {
  const port = String(await freePort())
  return new Promise((resolve, reject) => {
    server = spawn(process.execPath, [SLIDEV, 'slides.md', '--port', port], { cwd: REPO, stdio: 'pipe' })
    let log = ''
    const onData = (chunk: Buffer) => {
      log += chunk.toString()
      const port = /localhost:(\d+)\//.exec(log)?.[1]
      if (port) resolve(`http://localhost:${port}`)
    }
    server.stdout?.on('data', onData)
    server.stderr?.on('data', onData)
    server.on('exit', code => reject(new Error(`slidev exited with ${code}:\n${log}`)))
  })
}

const post = (path: string, body: unknown) => fetch(`${base}/__presmium/exec-local/${path}`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
})

beforeAll(async () => {
  rmSync(REPO, { recursive: true, force: true })
  cpSync(FIXTURE, REPO, { recursive: true })
  const deck = join(REPO, 'slides.md')
  writeFileSync(deck, readFileSync(deck, 'utf8').replace('__ADDON_CORE__', ADDON_CORE).replace('__ADDON_EXEC_LOCAL__', PACKAGE))
  git('init', '-q', '-b', 'main')
  git('config', 'user.name', 'Presmium Test')
  git('config', 'user.email', 'test@presmium.invalid')
  git('config', 'commit.gpgsign', 'false')
  git('add', '-A')
  git('commit', '-q', '-m', 'initial')
  base = await startSlidev()
}, 60_000)

afterAll(async () => {
  await browser?.close()
  server?.kill()
  if (docker) spawnSync('docker', ['image', 'rm', '--force', imageName(REPO)], { stdio: 'ignore' })
  rmSync(REPO, { recursive: true, force: true })
})

describe('container executor (P-22)', () => {
  it.skipIf(!docker)('runs Python in the image of the devcontainer definition, with the workspace mounted', async () => {
    const res = await post('run', { lang: 'python', code: 'import os, sys\nprint(os.getcwd(), sys.version_info[:2])\nprint(open("src/greet.py").read().count("def"))\n' })
    const result = await res.json()
    expect(result).toMatchObject({ ok: true, exitCode: 0, timedOut: false, executorId: 'presmium.container' })
    expect(result.stdout).toBe('/workspaces/repo (3, 12)\n1\n')
  }, 120_000)
})

describe('write-back (P-25)', () => {
  it('commits the edit on a new branch and leaves the original branch and working tree unchanged', async () => {
    const main = git('rev-parse', 'main')
    const edited = 'def greet(name):\n    return f"Hello, {name}"\n'
    const res = await post('commit', { file: 'src/greet.py', content: edited, branch: 'presmium/test-edit' })
    expect(res.status).toBe(200)
    const result = await res.json()
    expect(result).toMatchObject({ branch: 'presmium/test-edit', base: main, baseBranch: 'main', file: 'src/greet.py' })

    expect(git('rev-parse', 'presmium/test-edit')).toBe(result.commit)
    expect(git('rev-parse', 'presmium/test-edit^')).toBe(main)
    expect(git('show', 'presmium/test-edit:src/greet.py')).toBe(edited.trim())
    expect(git('rev-parse', 'main')).toBe(main)
    expect(git('branch', '--show-current')).toBe('main')
    expect(git('status', '--porcelain')).toBe('')

    expect((await post('commit', { file: 'src/greet.py', content: edited, branch: 'presmium/test-edit' })).status).toBe(409)
  })
})

describe('environment replicate (P-26)', () => {
  it('exports the snippet and the devcontainer definition as a zip archive', async () => {
    const snippet = 'print("snippet")\n'
    const res = await post('replicate', { file: 'src/snippet.py', content: snippet, lang: 'python' })
    expect(res.headers.get('content-type')).toBe('application/zip')
    expect(res.headers.get('content-disposition')).toContain('presmium-env-snippet.zip')
    const files = unzipSync(new Uint8Array(await res.arrayBuffer()))
    expect(Object.keys(files).sort()).toEqual(['.devcontainer/devcontainer.json', 'README.md', 'src/snippet.py'])
    expect(strFromU8(files['src/snippet.py']!)).toBe(snippet)
    expect(strFromU8(files['.devcontainer/devcontainer.json']!)).toBe(readFileSync(join(FIXTURE, '.devcontainer/devcontainer.json'), 'utf8'))
    expect(strFromU8(files['README.md']!)).toContain('devcontainer exec --workspace-folder . python3 src/snippet.py')
  })
})

describe('the PmLocalEnv component in the dev server', () => {
  async function openDeck() {
    browser ??= await chromium.launch()
    const page = await browser.newPage({ acceptDownloads: true })
    await page.goto(`${base}/1`)
    const env = page.locator('.pm-local-env')
    await expect.poll(() => env.getAttribute('data-state'), { timeout: 60_000 }).toBe('connected')
    return { page, env }
  }

  it.skipIf(!docker)('runs the edited snippet in the container', async () => {
    const { page, env } = await openDeck()
    await env.locator('[data-action="edit"]').click()
    await env.locator('textarea').fill('print("edited in the deck")')
    await env.locator('[data-action="run"]').click()
    await expect.poll(() => env.locator('.pm-local-env__output').textContent(), { timeout: 60_000 }).toBe('edited in the deck\n')
    await page.close()
  }, 120_000)

  it('commits the snippet to a new branch and downloads the environment', async () => {
    const { page, env } = await openDeck()
    await env.locator('[data-action="commit"]').click()
    const notice = env.locator('.pm-local-env__commit')
    await expect.poll(() => notice.getAttribute('data-branch')).toMatch(/^presmium\/edit-\d{8}-\d{6}$/)
    const branch = (await notice.getAttribute('data-branch'))!
    expect(git('show', `${branch}:src/greet.py`)).toBe(readFileSync(join(FIXTURE, 'src/greet.py'), 'utf8').trim())

    const [download] = await Promise.all([page.waitForEvent('download'), env.locator('[data-action="replicate"]').click()])
    expect(download.suggestedFilename()).toBe('presmium-env-greet.zip')
    const files = unzipSync(new Uint8Array(readFileSync((await download.path())!)))
    expect(Object.keys(files)).toContain('.devcontainer/devcontainer.json')
    expect(strFromU8(files['src/greet.py']!)).toContain('print(greet("Presmium"))')
    await page.close()
  }, 120_000)
})
