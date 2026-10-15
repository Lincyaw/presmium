// Builds a MyST test deck that lives in a fresh git repository with a devcontainer
// definition (`presmium build --to slides`), then starts a real Slidev dev server on
// the Slidev deck the build leaves. Checks what the compiler records (container
// output, environment archive) and what the dev-server endpoints answer. Container
// cases are skipped (and reported as skipped) when no Docker daemon is available.
import { execFile, execFileSync, spawn, spawnSync } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { appendFileSync, cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { CodeNode, ComponentNode, IRBlock, IRDocument } from '@presmium/kernel'
import { strFromU8, unzipSync } from 'fflate'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { imageName } from '../src/node/container.ts'

const PACKAGE = fileURLToPath(new URL('..', import.meta.url))
const PACKAGES = fileURLToPath(new URL('../..', import.meta.url))
const PRESMIUM = join(PACKAGES, 'cli/bin/presmium.mjs')
// The demo deck's Slidev installation; the test deck names the addons by absolute path.
const SLIDEV = createRequire(fileURLToPath(new URL('../../../examples/demo/package.json', import.meta.url))).resolve('@slidev/cli/bin/slidev.mjs')
const FIXTURE = join(PACKAGE, 'test/fixtures/repo')
// A fresh repository per run, so parallel runs in one checkout do not share it; the
// container sees it as /workspaces/repo.
const SCRATCH = mkdtempSync(join(tmpdir(), 'presmium-local-env-'))
const REPO = join(SCRATCH, 'repo')
const DEFINITION = readFileSync(join(FIXTURE, '.devcontainer/devcontainer.json'), 'utf8')
const PYTHON_INFO = 'import os, sys\nprint(os.getcwd(), sys.version_info[:2])\nprint(open("src/greet.py").read().count("def"))'

const docker = spawnSync('docker', ['version', '--format', '{{.Server.Version}}'], { stdio: 'ignore' }).status === 0

const git = (...args: string[]) => execFileSync('git', args, { cwd: REPO, encoding: 'utf8' }).trim()

let server: ChildProcess
let base = ''
let ir: IRDocument

function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const probe = createServer().listen(0, () => {
      const { port } = probe.address() as { port: number }
      probe.close(() => resolve(port))
    })
  })
}

function build(): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(process.execPath, [PRESMIUM, 'build', '--to', 'slides', '--out', 'dist'], { cwd: REPO, maxBuffer: 16 << 20 }, (error, stdout, stderr) => {
      if (error) reject(new Error(`presmium build failed:\n${stdout}${stderr}`))
      else resolve()
    })
  })
}

async function startSlidev(): Promise<string> {
  const port = String(await freePort())
  return new Promise((resolve, reject) => {
    server = spawn(process.execPath, [SLIDEV, 'slides.md', '--port', port], { cwd: join(REPO, '.presmium/slides'), stdio: 'pipe' })
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

const post = (path: string, body: unknown, language?: string) => fetch(`${base}/__presmium/exec-local/${path}`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', ...language ? { 'accept-language': language } : {} },
  body: JSON.stringify(body),
})

function blocks(): IRBlock[] {
  return ir.sections.flatMap(section => section.blocks)
}

function archived(zip: Uint8Array): Record<string, string> {
  return Object.fromEntries(Object.entries(unzipSync(zip)).map(([name, data]) => [name, strFromU8(data)]))
}

beforeAll(async () => {
  cpSync(FIXTURE, REPO, { recursive: true })
  const deck = join(REPO, 'lecture.md')
  writeFileSync(deck, readFileSync(deck, 'utf8')
    .replace('__ADDON_CORE__', join(PACKAGES, 'addon-core'))
    .replace('__ADDON_EXEC_LOCAL__', PACKAGE)
    .replace('__RENDER_SLIDES__', join(PACKAGES, 'render-slides')))
  // Compile-time execution in the container (P-22) needs Docker; the deck has it only then.
  if (docker) appendFileSync(deck, `\n## 编译时\n\n\`\`\`{code} python\n:run:\n:executor: presmium.container\n${PYTHON_INFO}\n\`\`\`\n`)
  git('init', '-q', '-b', 'main')
  git('config', 'user.name', 'Presmium Test')
  git('config', 'user.email', 'test@presmium.invalid')
  git('config', 'commit.gpgsign', 'false')
  git('add', '-A')
  git('commit', '-q', '-m', 'initial')
  await build()
  ir = JSON.parse(readFileSync(join(REPO, 'dist/ir.json'), 'utf8'))
  base = await startSlidev()
}, 240_000)

afterAll(async () => {
  server?.kill()
  if (docker) spawnSync('docker', ['image', 'rm', '--force', imageName(REPO)], { stdio: 'ignore' })
  rmSync(SCRATCH, { recursive: true, force: true })
})

describe('container executor (P-22)', () => {
  it.skipIf(!docker)('runs Python in the image of the devcontainer definition at compile time and from the dev server', async () => {
    const recorded = blocks().map(block => block.node).find((node): node is CodeNode => node.type === 'code' && node.run?.executor === 'presmium.container')
    expect(recorded?.outputs?.[0]).toMatchObject({ ok: true, exitCode: 0, executorId: 'presmium.container', stdout: '/workspaces/repo (3, 12)\n1\n' })

    const result = await (await post('run', { lang: 'python', code: PYTHON_INFO })).json()
    expect(result).toMatchObject({ ok: true, exitCode: 0, timedOut: false, executorId: 'presmium.container' })
    expect(result.stdout).toBe('/workspaces/repo (3, 12)\n1\n')
  }, 180_000)
})

describe('workspace (K-13)', () => {
  it('is published relative to the deck, in the IR and in the slides bundle; the dev server still finds it', () => {
    // The deck's configuration as the IR and the bundled headmatter of the slides serialize it.
    const written = readdirSync(join(REPO, 'dist'), { recursive: true, withFileTypes: true })
      .filter(entry => entry.isFile() && /\.(json|js)$/.test(entry.name))
      .flatMap(entry => [...readFileSync(join(entry.parentPath, entry.name), 'utf8').matchAll(/"presmium\.execLocal":\s*\{\s*"?workspace"?:\s*["'`]([^"'`]*)/g)])
      .map(match => match[1])
    expect(written.length).toBeGreaterThanOrEqual(2)
    expect(new Set(written)).toEqual(new Set(['.']))
  })
})

describe('dev server (N-07)', () => {
  it('answers in the language the page asks for', async () => {
    const ask = (language: string) => fetch(`${base}/__presmium/exec-local/replicate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'accept-language': language },
      body: JSON.stringify({ file: '../outside.py', content: '' }),
    }).then(res => res.json())
    expect(await ask('en')).toEqual({ error: 'The path must be inside the workspace: ../outside.py' })
    expect(await ask('zh-CN')).toEqual({ error: '路径必须位于工作区内：../outside.py' })
  })
})

describe('environment replicate (P-26)', () => {
  it('exports the snippet and the devcontainer definition, archived at compile time and from the dev server', async () => {
    const env = blocks().map(block => block.node).find((node): node is ComponentNode => node.type === 'component' && node.name === 'PmLocalEnv')!
    expect(env.props).toMatchObject({ file: 'src/greet.py', devcontainer: '.devcontainer/devcontainer.json' })
    const built = archived(Buffer.from(String(env.props.archive), 'base64'))
    expect(Object.keys(built).sort()).toEqual(['.devcontainer/devcontainer.json', 'README.md', 'src/greet.py'])
    expect(built['.devcontainer/devcontainer.json']).toBe(DEFINITION)
    expect(built['src/greet.py']).toBe(readFileSync(join(FIXTURE, 'src/greet.py'), 'utf8'))
    expect(built['README.md']).toContain('devcontainer exec --workspace-folder . python3 src/greet.py')
    // The archive built at compile time is in the deck's language (zh-CN by default)...
    expect(built['README.md']).toMatch(/^# Presmium 导出的运行环境\n/)

    // ...the one the dev server builds in the page's.
    const snippet = 'print("snippet")\n'
    const res = await post('replicate', { file: 'src/snippet.py', content: snippet, lang: 'python' }, 'en-US')
    expect(res.headers.get('content-type')).toBe('application/zip')
    expect(res.headers.get('content-disposition')).toContain('presmium-env-snippet.zip')
    const served = archived(new Uint8Array(await res.arrayBuffer()))
    expect(Object.keys(served).sort()).toEqual(['.devcontainer/devcontainer.json', 'README.md', 'src/snippet.py'])
    expect(served['src/snippet.py']).toBe(snippet)
    expect(served['README.md']).toMatch(/^# Environment exported by Presmium\n/)
    expect(served['.devcontainer/devcontainer.json']).toBe(DEFINITION)
  })
})
