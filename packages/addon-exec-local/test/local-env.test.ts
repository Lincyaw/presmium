// Builds a MyST test deck that lives in a fresh git repository with a devcontainer definition
// (`presmium build --to slides`), then starts the real `presmium dev` servers on it. Checks what
// the compiler records (container output, environment archive) and what the dev-server endpoints
// answer. Container cases are skipped (and reported as skipped) when no Docker daemon is available.
import { spawn, spawnSync } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { appendFileSync, cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { presmium, PRESMIUM_BIN } from '@presmium/cli/testing'
import type { CodeNode, ComponentNode, IRBlock, IRDocument } from '@presmium/kernel'
import { strFromU8, unzipSync } from 'fflate'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { imageName } from '../src/node/container.ts'

const PACKAGE = fileURLToPath(new URL('..', import.meta.url))
const PACKAGES = fileURLToPath(new URL('../..', import.meta.url))
const FIXTURE = join(PACKAGE, 'test/fixtures/repo')
// A fresh repository per run, so parallel runs in one checkout do not share it; the
// container sees it as /workspaces/repo.
const SCRATCH = mkdtempSync(join(tmpdir(), 'presmium-local-env-'))
const REPO = join(SCRATCH, 'repo')
const DEFINITION = readFileSync(join(FIXTURE, '.devcontainer/devcontainer.json'), 'utf8')
// Ports of WP-70d's range (docs: E2E ports); the dev servers of this file only.
const SLIDES_PORT = 4743
const WEB_PORT = 4744
// Each run starts in a directory of its own; the workspace is read-only, its modules importable.
const PYTHON_INFO = 'import os, sys\nprint(os.getcwd(), sys.version_info[:2])\nfrom src.greet import greet\nprint(greet("容器"))'
const PYTHON_OUTPUT = '/presmium-run (3, 12)\n你好，Presmium\n你好，容器\n'

const docker = spawnSync('docker', ['version', '--format', '{{.Server.Version}}'], { stdio: 'ignore' }).status === 0
// The web renderer adds the deck's Vite plugins to its dev server once it reads
// `RenderContext.vitePlugins` (C-8, WP-70b); until then its dev server has no endpoints to test.
const webAddsVitePlugins = readdirSync(join(PACKAGES, 'web/src/node')).some(file => readFileSync(join(PACKAGES, 'web/src/node', file), 'utf8').includes('vitePlugins'))

function git(...args: string[]): string {
  const result = spawnSync('git', args, { cwd: REPO, encoding: 'utf8' })
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`)
  return result.stdout.trim()
}

const servers: ChildProcess[] = []
let ir: IRDocument

/** `presmium dev --to <form>` on the test deck, resolved with the URL of its server. */
function startDev(form: string): Promise<string> {
  const { NODE_ENV: _test, ...env } = process.env
  const server = spawn(process.execPath, [PRESMIUM_BIN, 'dev', '--to', form], { cwd: REPO, env, stdio: 'pipe' })
  servers.push(server)
  return new Promise((resolve, reject) => {
    let log = ''
    const onData = (chunk: Buffer) => {
      log += chunk.toString()
      const url = new RegExp(`^${form} {2}(http\\S+?)/?$`, 'm').exec(log)?.[1]
      if (url) resolve(url)
    }
    server.stdout?.on('data', onData)
    server.stderr?.on('data', onData)
    server.on('exit', code => reject(new Error(`presmium dev --to ${form} exited with ${code}:\n${log}`)))
  })
}

const post = (base: string, path: string, body: unknown, language?: string) => fetch(`${base}/__presmium/exec-local/${path}`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', ...language ? { 'accept-language': language } : {} },
  body: JSON.stringify(body),
})

function blocks(doc = ir): IRBlock[] {
  const flat = (list: IRBlock[]): IRBlock[] => list.flatMap(block => [block, ...flat(block.node.type === 'component' ? block.node.children ?? [] : [])])
  return doc.sections.flatMap(section => flat(section.blocks))
}

function archived(zip: Uint8Array): Record<string, string> {
  return Object.fromEntries(Object.entries(unzipSync(zip)).map(([name, data]) => [name, strFromU8(data)]))
}

let slides = ''

beforeAll(async () => {
  cpSync(FIXTURE, REPO, { recursive: true })
  const deck = join(REPO, 'lecture.md')
  writeFileSync(deck, readFileSync(deck, 'utf8')
    .replace('__ADDON_CORE__', join(PACKAGES, 'addon-core'))
    .replace('__ADDON_EXEC_LOCAL__', PACKAGE)
    .replace('__RENDER_SLIDES__', join(PACKAGES, 'render-slides'))
    .replace('__RENDER_WEB__', join(PACKAGES, 'web'))
    .replace('__SLIDES_PORT__', String(SLIDES_PORT))
    .replace('__WEB_PORT__', String(WEB_PORT)))
  // Compile-time execution in the container (P-22) needs Docker; the deck has it only then. Without
  // `:executor:`, python3 code goes to the one executor that runs Python, the container's (R-104).
  if (docker) {
    appendFileSync(deck, `\n## 编译时\n\n\`\`\`{code} python\n:run:\n:executor: presmium.container\n${PYTHON_INFO}\n\`\`\`\n`)
    appendFileSync(deck, `\n## python3\n\n\`\`\`{code} python3\n:run:\nprint("python3", 6 * 7)\n\`\`\`\n`)
  }
  git('init', '-q', '-b', 'main')
  git('config', 'user.name', 'Presmium Test')
  git('config', 'user.email', 'test@presmium.invalid')
  git('config', 'commit.gpgsign', 'false')
  git('add', '-A')
  git('commit', '-q', '-m', 'initial')
  const built = await presmium(REPO, ['build', '--to', 'slides', '--out', 'dist'])
  if (built.code !== 0) throw new Error(`presmium build failed:\n${built.stdout}${built.stderr}`)
  ir = JSON.parse(readFileSync(join(REPO, 'dist/ir.json'), 'utf8'))
  slides = await startDev('slides')
}, 300_000)

afterAll(async () => {
  for (const server of servers) server.kill('SIGTERM')
  await Promise.all(servers.map(server => server.exitCode === null ? new Promise(done => server.once('exit', done)) : undefined))
  if (docker) spawnSync('docker', ['image', 'rm', '--force', imageName(REPO)], { stdio: 'ignore' })
  rmSync(SCRATCH, { recursive: true, force: true })
}, 60_000)

describe('container executor (P-22)', () => {
  it.skipIf(!docker)('runs Python in the image of the devcontainer definition at compile time', () => {
    const recorded = blocks().map(block => block.node).find((node): node is CodeNode => node.type === 'code' && node.run?.executor === 'presmium.container')
    expect(recorded?.outputs?.[0]).toMatchObject({ ok: true, exitCode: 0, executorId: 'presmium.container', stdout: PYTHON_OUTPUT })
    const python3 = blocks().map(block => block.node).find((node): node is CodeNode => node.type === 'code' && node.lang === 'python3')
    expect(python3?.outputs?.[0]).toMatchObject({ ok: true, executorId: 'presmium.container', stdout: 'python3 42\n' })
  })

  it.skipIf(!docker)('answers a run request as the other executors do: files beside the program, parameters as variables (R-24)', async () => {
    // The shape of an exercise check (checkRequest of the classroom plugin): the program reads the
    // learner's code and the checks from files of the request.
    const check = (submission: string) => ({
      lang: 'python',
      code: 'scope = {}\nexec(open("submission.py").read(), scope)\nexec(open("checks.py").read(), scope)\nprint("passed")',
      files: { 'submission.py': submission, 'checks.py': 'assert double(3) == 6, "double(3) is 6"\n' },
    })
    expect(await (await post(slides, 'run', check('def double(x):\n    return x * 2\n'))).json()).toMatchObject({ ok: true, exitCode: 0, stdout: 'passed\n' })
    const failed = await (await post(slides, 'run', check('def double(x):\n    return x + 2\n'))).json()
    expect(failed).toMatchObject({ ok: false, exitCode: 1, stdout: '' })
    expect(failed.stderr).toContain('AssertionError: double(3) is 6')

    const args = await (await post(slides, 'run', { lang: 'python', code: 'print(n * 2, word, type(n).__name__)\nprint(input())', args: { n: '21', word: 'hi' }, stdin: 'from stdin\n' })).json()
    expect(args).toMatchObject({ ok: true, stdout: '42 hi int\nfrom stdin\n', executorId: 'presmium.container' })
  }, 180_000)

  it.skipIf(!docker)('is served by `presmium dev --to slides` (R-25)', async () => {
    expect(await (await fetch(`${slides}/__presmium/exec-local/status`)).json()).toMatchObject({ connected: true, docker: true, devcontainer: '.devcontainer/devcontainer.json', git: true, languages: ['python'] })
    expect(await (await post(slides, 'run', { lang: 'python', code: PYTHON_INFO })).json()).toMatchObject({ ok: true, exitCode: 0, timedOut: false, stdout: PYTHON_OUTPUT })
  }, 180_000)

  it.skipIf(!docker || !webAddsVitePlugins)('is served by `presmium dev --to web` (R-25)', async () => {
    const web = await startDev('web')
    expect(await (await fetch(`${web}/__presmium/exec-local/status`)).json()).toMatchObject({ connected: true, docker: true, devcontainer: '.devcontainer/devcontainer.json' })
    expect(await (await post(web, 'run', { lang: 'python', code: PYTHON_INFO })).json()).toMatchObject({ ok: true, stdout: PYTHON_OUTPUT })
  }, 300_000)

  it.skipIf(!docker)('fails an image build that does not end in time, and builds again for the next run (R-101)', async () => {
    const dir = join(SCRATCH, 'slow')
    mkdirSync(join(dir, '.devcontainer'), { recursive: true })
    writeFileSync(join(dir, '.devcontainer/Dockerfile'), 'FROM python:3.12-slim\nRUN sleep 120\n')
    writeFileSync(join(dir, '.devcontainer/devcontainer.json'), '{ "build": { "dockerfile": "Dockerfile" } }\n')
    const run = (n: number) => `\n\`\`\`{code} python\n:run:\n:executor: presmium.container\nprint(${n})\n\`\`\`\n`
    writeFileSync(join(dir, 'lecture.md'), `---\nplugins:\n  - ${PACKAGE}\npresmium:\n  presmium.execLocal: { buildTimeoutMs: 3000 }\n---\n\n## 两次运行\n${run(1)}${run(2)}`)
    const started = Date.now()
    const { stdout } = await presmium(dir, ['check', '--json'])
    const failures = (JSON.parse(stdout) as { findings: { message: string }[] }).findings.filter(f => f.message.includes('devcontainer build failed'))
    expect(failures.map(f => f.message)).toEqual([1, 2].map(n => `executor presmium.container failed on block code-${n}: devcontainer build failed: stopped after 3000 ms`))
    expect(Date.now() - started).toBeLessThan(60_000)
  }, 120_000)
})

describe('workspace (K-13, R-100)', () => {
  it('is published relative to the deck, in the IR and in the slides bundle', () => {
    // The deck's configuration as the IR and the bundled headmatter of the slides serialize it.
    const written = readdirSync(join(REPO, 'dist'), { recursive: true, withFileTypes: true })
      .filter(entry => entry.isFile() && /\.(json|js)$/.test(entry.name))
      .flatMap(entry => [...readFileSync(join(entry.parentPath, entry.name), 'utf8').matchAll(/"presmium\.execLocal":\s*\{\s*"?workspace"?:\s*["'`]([^"'`]*)/g)])
      .map(match => match[1])
    expect(written.length).toBeGreaterThanOrEqual(2)
    expect(new Set(written)).toEqual(new Set(['.']))
  })

  it('is one per deck: a {local-env} that names another one is an error', async () => {
    const dir = join(SCRATCH, 'two')
    mkdirSync(join(dir, 'other/.devcontainer'), { recursive: true })
    cpSync(join(FIXTURE, '.devcontainer'), join(dir, '.devcontainer'), { recursive: true })
    cpSync(join(FIXTURE, '.devcontainer'), join(dir, 'other/.devcontainer'), { recursive: true })
    const env = (workspace: string) => `\n\`\`\`{local-env} python\n:file: a.py\n:workspace: ${workspace}\nprint(1)\n\`\`\`\n`
    writeFileSync(join(dir, 'lecture.md'), `---\nplugins:\n  - ${PACKAGE}\n---\n\n## 两个工作区\n${env('.')}${env('other')}`)
    const { code, stdout } = await presmium(dir, ['check', '--json'])
    expect(code).toBe(1)
    expect((JSON.parse(stdout) as { findings: unknown[] }).findings).toContainEqual(expect.objectContaining({
      checkId: 'presmium.execLocal.workspace',
      severity: 'error',
      message: '{local-env} names the workspace other, but the deck\'s workspace is .: the snippet would run and be committed in .',
      source: { file: join(dir, 'lecture.md'), line: 14 },
    }))
  })
})

describe('dev server (N-07)', () => {
  it('answers in the language the page asks for', async () => {
    const ask = (language: string) => fetch(`${slides}/__presmium/exec-local/replicate`, {
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
    const res = await post(slides, 'replicate', { file: 'src/snippet.py', content: snippet, lang: 'python' }, 'en-US')
    expect(res.headers.get('content-type')).toBe('application/zip')
    expect(res.headers.get('content-disposition')).toContain('presmium-env-snippet.zip')
    const served = archived(new Uint8Array(await res.arrayBuffer()))
    expect(Object.keys(served).sort()).toEqual(['.devcontainer/devcontainer.json', 'README.md', 'src/snippet.py'])
    expect(served['src/snippet.py']).toBe(snippet)
    expect(served['README.md']).toMatch(/^# Environment exported by Presmium\n/)
    expect(served['.devcontainer/devcontainer.json']).toBe(DEFINITION)
  })
})
