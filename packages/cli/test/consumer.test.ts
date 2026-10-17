// The consumer install (P-140, P-141, P-143; WP-93a): Presmium as a user installs it.
// scripts/consumer.ts packs every public package with pnpm, as it is published, and makes a project
// outside the monorepo that installs the tarballs with npm, with a third-party plugin from its own
// tarball (e2e/fixtures/consumer/plugin) and a document that uses it (e2e/fixtures/consumer/deck).
// There `presmium check`, `build` of the three forms and `dev` run as a user runs them. A plugin
// whose peer dependencies exclude the installed Presmium is reported, and the build goes on without
// it. e2e/consumer.spec.ts shows the plugin's component in a browser.
import { spawn } from 'node:child_process'
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
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

/** A user's shell: without the variables pnpm and Vitest set (NODE_ENV=test changes Vite's builds). */
function userEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env }
  for (const name of Object.keys(env)) if (/^(?:npm|pnpm)_/i.test(name) || ['NODE_ENV', 'INIT_CWD', 'VITEST', 'TEST'].includes(name)) delete env[name]
  return env
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
    for (const text of ['SIL OPEN FONT LICENSE Version 1.1', '@fontsource/ibm-plex-sans', '@fontsource/ibm-plex-mono', '@fontsource/source-serif-4']) expect(license, form).toContain(text)
  }
}, 600_000)

it('serves the web form and the slides with presmium dev (P-141)', async () => {
  // Ports of WP-93a's range; a busy one gives way to the next free port.
  const lecture = join(project, 'lecture.md')
  writeFileSync(lecture, readFileSync(lecture, 'utf8').replace('  web: {}', '  web: { port: 5406 }').replace('  slides: {}', '  slides: { port: 5407 }'))
  const dev = spawn(process.execPath, [presmiumBin(), 'dev', '--to', 'web,slides'], { cwd: project, env: userEnv(), stdio: ['ignore', 'pipe', 'pipe'] })
  let output = ''
  dev.stdout.on('data', (chunk: Buffer) => output += chunk)
  dev.stderr.on('data', (chunk: Buffer) => output += chunk)
  const exited = new Promise(resolve => dev.once('exit', resolve))
  try {
    await new Promise<void>((resolve, reject) => {
      dev.stdout.on('data', () => /^watching/m.test(output) && resolve())
      dev.once('exit', code => reject(new Error(`presmium dev exited (${code}):\n${output}`)))
    })
    for (const form of ['web', 'slides']) {
      const url = new RegExp(`^${form} {2}(http://\\S+)$`, 'm').exec(output)?.[1]
      expect(url, output).toBeDefined()
      const page = await fetch(url!)
      expect(page.status, `${form}: ${url}`).toBe(200)
      expect(await page.text()).toContain('id="app"')
    }
    // VitePress and Slidev loaded their configurations, which import TypeScript under node_modules.
    expect(output).not.toMatch(/ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING|failed to load config/i)
  } finally {
    dev.kill('SIGTERM')
    await exited
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
