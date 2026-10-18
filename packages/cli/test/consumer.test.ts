// The consumer install (P-140, P-141, P-143; WP-93a): Presmium as a user installs it.
// scripts/consumer.ts packs every public package with pnpm, as it is published, and makes a project
// outside the monorepo that installs the tarballs with npm, with a third-party plugin from its own
// tarball (e2e/fixtures/consumer/plugin) and a document that uses it (e2e/fixtures/consumer/deck).
// There `presmium check`, `build` of the three forms, `dev` and `serve` (a workspace whose sites lie
// outside the project, in serve's state directory) run as a user runs them. A plugin whose peer
// dependencies exclude the installed Presmium is reported, and the build goes on without it.
// e2e/consumer.spec.ts shows the plugin's component in a browser.
import { spawn } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { run } from '../src/testing.ts'

const ROOT = fileURLToPath(new URL('../../..', import.meta.url))
const FIXTURES = join(ROOT, 'e2e/fixtures/consumer')

/** A tarball as `tarballs/index.json` of the project lists it. */
interface Tarball {
  name: string
  dir: string
  files: string[]
}

let project: string
let tarballs: Tarball[]

/** What the fonts' license in a site holds: the SIL OFL, each Fontsource package, each face's copyright (NOTICE). */
const FONT_LICENSE = ['SIL OPEN FONT LICENSE Version 1.1', '@fontsource/ibm-plex-sans', '@fontsource/ibm-plex-mono', '@fontsource/source-serif-4', 'Copyright 2019 IBM Corp.', 'Copyright 2017 IBM Corp.', 'Copyright 2014 - 2021 Adobe Systems Incorporated', 'Reserved Font Name \'Source\'']

/** A user's shell: without the variables pnpm and Vitest set (NODE_ENV=test changes Vite's builds). */
function userEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env = { ...process.env }
  for (const name of Object.keys(env)) if (/^(?:npm|pnpm)_/i.test(name) || ['NODE_ENV', 'INIT_CWD', 'VITEST', 'TEST'].includes(name)) delete env[name]
  return { ...env, ...extra }
}

beforeAll(async () => {
  project = mkdtempSync(join(tmpdir(), 'presmium-consumer-'))
  const made = await run(process.execPath, [join(ROOT, 'scripts/consumer.ts'), project], { env: userEnv() })
  expect(made.code, made.stdout + made.stderr).toBe(0)
  tarballs = JSON.parse(readFileSync(join(project, 'tarballs/index.json'), 'utf8')) as Tarball[]
}, 900_000)
afterAll(() => {
  if (project) rmSync(project, { recursive: true, force: true })
})

/** The project's own `presmium`, as `npx presmium` runs it. */
const presmiumBin = () => join(project, 'node_modules/@presmium/cli/bin/presmium.mjs')
const presmium = (args: string[]) => run(process.execPath, [presmiumBin(), ...args], { cwd: project, env: userEnv() })

/**
 * Starts the project's `presmium` with `args` and resolves once its output
 * matches `ready`, with that output and a function that stops it.
 */
async function start(args: string[], ready: RegExp, env: Record<string, string> = {}): Promise<{ output: () => string, stop: () => Promise<void> }> {
  const child = spawn(process.execPath, [presmiumBin(), ...args], { cwd: project, env: userEnv(env), stdio: ['ignore', 'pipe', 'pipe'] })
  let output = ''
  child.stdout.on('data', (chunk: Buffer) => output += chunk)
  child.stderr.on('data', (chunk: Buffer) => output += chunk)
  const exited = new Promise(resolve => child.once('exit', resolve))
  const stop = async () => {
    if (child.exitCode === null) child.kill('SIGTERM')
    await exited
  }
  try {
    await new Promise<void>((resolve, reject) => {
      child.stdout.on('data', () => ready.test(output) && resolve())
      child.once('exit', code => reject(new Error(`presmium ${args.join(' ')} exited (${code}):\n${output}`)))
    })
  } catch (error) {
    await stop()
    throw error
  }
  return { output: () => output, stop }
}

/** The files an `exports` or `bin` entry names: `./src/index.ts` is `src/index.ts`; a pattern names its directory. */
function targets(value: unknown): string[] {
  if (typeof value === 'string') return [value.replace(/^\.\//, '').replace(/\/?\*.*$/, '')]
  return value && typeof value === 'object' ? Object.values(value).flatMap(targets) : []
}

it('packs every public package with its license and the files its exports and commands name (P-140, P-141)', () => {
  expect(tarballs.length).toBeGreaterThan(25)
  for (const { name, dir, files } of tarballs) {
    const pkg = JSON.parse(readFileSync(join(ROOT, dir, 'package.json'), 'utf8')) as { exports?: unknown, bin?: unknown }
    expect(files, name).toContain('LICENSE')
    for (const target of [...targets(pkg.exports), ...targets(pkg.bin)]) {
      expect(files.some(file => file === target || file.startsWith(`${target}/`)), `${name}: ${target}`).toBe(true)
    }
    expect(files.filter(file => file.startsWith('test/')), name).toEqual([])
  }
  // As installed: `workspace:` ranges are versions, and a plugin has Presmium as its peer.
  const plugin = JSON.parse(readFileSync(join(project, 'node_modules/@presmium/slidev-addon-core/package.json'), 'utf8')) as { license: string, peerDependencies: Record<string, string>, dependencies?: Record<string, string> }
  expect(plugin.license).toBe('Apache-2.0')
  expect(plugin.peerDependencies['@presmium/kernel']).toMatch(/^\^\d+\.\d+\.\d+/)
  expect(Object.keys(plugin.dependencies ?? {}).filter(name => name.startsWith('@presmium/'))).toEqual([])
})

it('checks the document with no problems and builds its web form, slides and notebook with the third-party plugin (P-141)', async () => {
  const check = await presmium(['check'])
  expect(check.code, check.stdout + check.stderr).toBe(0)
  expect(check.stdout).toContain('no problems')

  const build = await presmium(['build', '--to', 'web,slides,notebook'])
  expect(build.code, build.stdout + build.stderr).toBe(0)
  expect(build.stdout).toContain('0 errors, 0 warnings')
  const dist = join(project, 'dist')
  for (const page of ['web/index.html', 'slides/index.html']) expect(existsSync(join(dist, page)), page).toBe(true)
  // The plugin's directive is its component in the IR; the notebook shows the fallback.
  expect(readFileSync(join(dist, 'ir.json'), 'utf8')).toContain('"name": "HelloGreeting"')
  expect(readFileSync(join(dist, 'notebook/lecture.ipynb'), 'utf8')).toContain('Hello, reader! (fallback)')
  // The fonts of the design system go with their license, the SIL Open Font License (P-140, NOTICE).
  for (const form of ['web', 'slides']) {
    const license = readFileSync(join(dist, form, 'presmium/fonts/LICENSE'), 'utf8')
    for (const text of FONT_LICENSE) expect(license, form).toContain(text)
  }
}, 600_000)

it('serves the web form and the slides with presmium dev (P-141)', async () => {
  // Ports of WP-93a's range; a busy one gives way to the next free port.
  const lecture = join(project, 'lecture.md')
  writeFileSync(lecture, readFileSync(lecture, 'utf8').replace('  web: {}', '  web: { port: 5406 }').replace('  slides: {}', '  slides: { port: 5407 }'))
  const dev = await start(['dev', '--to', 'web,slides'], /^watching/m)
  try {
    for (const form of ['web', 'slides']) {
      const url = new RegExp(`^${form} {2}(http://\\S+)$`, 'm').exec(dev.output())?.[1]
      expect(url, dev.output()).toBeDefined()
      const page = await fetch(url!)
      expect(page.status, `${form}: ${url}`).toBe(200)
      expect(await page.text()).toContain('id="app"')
    }
    // VitePress and Slidev loaded their configurations, which import TypeScript under node_modules.
    expect(dev.output()).not.toMatch(/ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING|failed to load config/i)
  } finally {
    await dev.stop()
  }
}, 300_000)

it('serves a workspace with presmium serve, its sites outside the project, the browser dependencies pre-bundled (P-141, P-120)', async () => {
  // A workspace of one document in the project; serve's state directory (its sites) outside it.
  const ws = join(project, 'ws')
  mkdirSync(join(ws, 'intro'), { recursive: true })
  cpSync(join(FIXTURES, 'deck/lecture.md'), join(ws, 'intro/lecture.md'))
  writeFileSync(join(ws, 'presmium.workspace.yaml'), 'title: Consumer workspace\ndocuments: [\'*/lecture.md\']\n')
  const cache = mkdtempSync(join(tmpdir(), 'presmium-consumer-cache-'))
  const serve = await start(['serve', 'ws', '--port', '5404'], /^mcp {2}/m, { XDG_CACHE_HOME: cache })
  try {
    const url = /^serve {2}(http:\/\/\S+)$/m.exec(serve.output())?.[1]
    expect(url, serve.output()).toBeDefined()
    for (const path of ['/', '/intro/']) {
      const page = await fetch(`${url}${path}`)
      expect(page.status, path).toBe(200)
      expect(await page.text(), path).toContain('id="app"')
    }
    // The kernel's import of semver, CommonJS, is served pre-bundled (Vite's dependency cache), not as
    // the package's file, which has no ES exports: the page would stay blank.
    const kernel = await fetch(`${url}/intro/@fs${join(project, 'node_modules/@presmium/kernel/src/services.ts')}`)
    expect(kernel.status).toBe(200)
    const code = await kernel.text()
    expect(code).toMatch(/^import .*semver.* from "[^"]+"/m)
    expect(code).not.toContain('node_modules/semver/')
    // The home page carries the fonts' license too (P-140).
    const license = await fetch(`${url}/presmium/fonts/LICENSE`)
    expect(license.status).toBe(200)
    const text = await license.text()
    for (const line of FONT_LICENSE) expect(text).toContain(line)
  } finally {
    await serve.stop()
    rmSync(cache, { recursive: true, force: true })
  }
}, 300_000)

it('reports a plugin whose peer dependencies exclude the installed Presmium and builds the document without it (P-143)', async () => {
  cpSync(join(FIXTURES, 'incompatible'), join(project, 'incompatible'), { recursive: true })
  const { version } = JSON.parse(readFileSync(join(ROOT, 'packages/kernel/package.json'), 'utf8')) as { version: string }
  const message = `plugin "./plugin" (presmium-plugin-future 2.0.0) is not loaded: it needs @presmium/kernel ^9.0.0 (peerDependencies), and ${version} is installed`
  const check = await presmium(['check', 'incompatible'])
  expect(check.code).toBe(1)
  expect(check.stdout).toContain(`lecture.md:5  error  ${message}`)
  // No crash: the build reports it, without importing the plugin, and writes the notebook.
  const build = await presmium(['build', 'incompatible', '--out', 'incompatible/dist'])
  expect(build.code).toBe(1)
  expect(build.stdout).toContain(message)
  expect(build.stdout + build.stderr).not.toContain('was imported')
  expect(existsSync(join(project, 'incompatible/dist/notebook/lecture.ipynb'))).toBe(true)
}, 300_000)
