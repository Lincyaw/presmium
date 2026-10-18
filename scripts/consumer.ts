#!/usr/bin/env node
// The consumer install of P-141: Presmium as a user gets it from npm. Every public package is packed
// with pnpm, as `pnpm publish` publishes it (`workspace:` ranges become versions); a project outside
// the monorepo then installs the tarballs it needs, and the plugins given (packed with npm, as a
// third party publishes them), with npm; `tarballs/index.json` lists what each tarball holds.
// e2e/consumer.spec.ts builds on it; packages/cli/test/consumer.test.ts runs it, and
// packages/studio/test/studio.test.ts installs `presmium studio` (STUDIO) with it. Run alone, it makes
// such a project with the document and the plugin of e2e/fixtures/consumer and prints where it is;
// with --studio the project has `presmium studio` too (DeepSeek Harness, about 865 MB):
//
//   node scripts/consumer.ts [<dir>] [--studio]
import { execFile } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const run = promisify(execFile)

export const ROOT = fileURLToPath(new URL('..', import.meta.url))

/** The document (`deck/`), the third-party plugin (`plugin/`) and the plugin for another Presmium (`incompatible/`). */
export const FIXTURES = join(ROOT, 'e2e/fixtures/consumer')

/** What a project installs to check a document, build its three forms and serve them with `presmium dev`. */
export const ESSENTIALS = ['@presmium/cli', '@presmium/web', '@presmium/render-slides', '@presmium/render-notebook', '@presmium/slidev-addon-core']

/** What a project installs for `presmium studio` besides (docs/design-dsh.md 11.1). */
export const STUDIO = [...ESSENTIALS, '@presmium/studio']

export interface PublicPackage {
  name: string
  dir: string
  /** Presmium's packages it cannot do without: its dependencies and required peers. */
  needs: string[]
}

/** The workspace's public packages: those not `private`. */
export function publicPackages(): PublicPackage[] {
  return readdirSync(join(ROOT, 'packages')).sort().flatMap((dir) => {
    const file = join(ROOT, 'packages', dir, 'package.json')
    if (!existsSync(file)) return []
    const pkg = JSON.parse(readFileSync(file, 'utf8')) as { name: string, private?: boolean, dependencies?: object, peerDependencies?: object, peerDependenciesMeta?: object }
    if (pkg.private) return []
    const optional = new Set(Object.keys(pkg.peerDependenciesMeta ?? {}))
    const needs = Object.keys({ ...pkg.dependencies, ...pkg.peerDependencies }).filter(name => name.startsWith('@presmium/') && !optional.has(name))
    return [{ name: pkg.name, dir: join(ROOT, 'packages', dir), needs }]
  })
}

/** `names` with the Presmium packages they need, transitively. */
export function closure(names: string[]): string[] {
  const known = new Map(publicPackages().map(pkg => [pkg.name, pkg]))
  const found = new Set<string>()
  const visit = (name: string): void => {
    const pkg = known.get(name)
    if (!pkg) throw new Error(`${name} is not a public package of the workspace`)
    if (found.has(name)) return
    found.add(name)
    pkg.needs.forEach(visit)
  }
  names.forEach(visit)
  return [...found].sort()
}

export interface Tarball {
  name: string
  /** The package's directory in the workspace, from the root. */
  dir: string
  file: string
  /** The paths it holds, as `pnpm pack` lists them. */
  files: string[]
}

/** The lock that lets one process of this checkout pack at a time. */
const PACK_LOCK = join(ROOT, 'node_modules', '.presmium-pack.lock')

const alive = (pid: number) => {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM'
  }
}

/**
 * Runs `pack` while no other process of this checkout packs: a package's
 * `prepack` writes into its directory and its `postpack` removes what it
 * wrote (@presmium/dsh's skills), so two tests packing at once (the CLI's and
 * studio's consumer installs) would pack each other's half-removed files. A
 * lock whose process is gone is taken over.
 */
async function packing<T>(pack: () => Promise<T>): Promise<T> {
  for (;;) {
    try {
      mkdirSync(PACK_LOCK)
      writeFileSync(join(PACK_LOCK, 'pid'), String(process.pid))
      break
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
      let holder: number | undefined
      try {
        holder = Number(readFileSync(join(PACK_LOCK, 'pid'), 'utf8'))
      } catch {
        // Taken a moment ago, the pid not written yet; or left by a process that ended in between.
      }
      // Without a pid, a lock older than a minute is stale (and one gone in between, too: the next round takes it).
      const stale = holder ? !alive(holder) : Date.now() - (statSync(PACK_LOCK, { throwIfNoEntry: false })?.mtimeMs ?? 0) > 60_000
      if (stale) rmSync(PACK_LOCK, { recursive: true, force: true })
      else await new Promise(done => setTimeout(done, 500))
    }
  }
  try {
    return await pack()
  } finally {
    rmSync(PACK_LOCK, { recursive: true, force: true })
  }
}

/** Packs every public package into `dest` with pnpm, by name. */
export async function packAll(dest: string): Promise<Map<string, Tarball>> {
  mkdirSync(dest, { recursive: true })
  const tarballs = new Map<string, Tarball>()
  await packing(async () => {
    for (const pkg of publicPackages()) {
      const { stdout } = await run('pnpm', ['pack', '--pack-destination', dest, '--json'], { cwd: pkg.dir, maxBuffer: 64 << 20 })
      const packed = JSON.parse(stdout) as { filename: string, files: { path: string }[] }
      tarballs.set(pkg.name, { name: pkg.name, dir: relative(ROOT, pkg.dir), file: resolve(dest, packed.filename), files: packed.files.map(f => f.path) })
    }
  })
  writeFileSync(join(dest, 'index.json'), `${JSON.stringify([...tarballs.values()], null, 2)}\n`)
  return tarballs
}

/** Packs a package that is not the workspace's (a third-party plugin) with npm into `dest`. */
export async function packPlugin(dir: string, dest: string): Promise<{ name: string, file: string }> {
  mkdirSync(dest, { recursive: true })
  const { stdout } = await run('npm', ['pack', resolve(dir), '--pack-destination', dest, '--json'], { cwd: dest, env: userEnv(), maxBuffer: 64 << 20 })
  const [packed] = JSON.parse(stdout) as { name: string, filename: string }[]
  return { name: packed!.name, file: resolve(dest, packed!.filename) }
}

export interface ConsumerOptions {
  /** The project's directory; by default a new one in the system's temporary directory. */
  dir?: string
  /** Presmium's packages it depends on (with those they need). */
  packages?: string[]
  /** Directories of plugins that are not Presmium's, each installed from its own tarball. */
  plugins?: string[]
  /** A directory whose files are copied into the project first (a document). */
  files?: string
}

/**
 * A project that installs Presmium and `plugins` from their tarballs with npm,
 * as a user installs them from the registry (install scripts too; the other
 * dependencies come from the registry, or npm's cache). Resolves with its
 * directory and the tarballs of every public package.
 */
export async function consumerProject(options: ConsumerOptions = {}): Promise<{ dir: string, tarballs: Map<string, Tarball> }> {
  const dir = options.dir ?? mkdtempSync(join(tmpdir(), 'presmium-consumer-'))
  mkdirSync(dir, { recursive: true })
  if (options.files) cpSync(options.files, dir, { recursive: true })
  const tarballs = await packAll(join(dir, 'tarballs'))
  const dependencies: Record<string, string> = {}
  for (const name of closure(options.packages ?? ESSENTIALS)) dependencies[name] = `file:./tarballs/${basename(tarballs.get(name)!.file)}`
  for (const plugin of options.plugins ?? []) {
    const { name, file } = await packPlugin(plugin, join(dir, 'tarballs'))
    dependencies[name] = `file:./tarballs/${basename(file)}`
  }
  writeFileSync(join(dir, 'package.json'), `${JSON.stringify({ name: 'presmium-consumer', private: true, type: 'module', dependencies }, null, 2)}\n`)
  await run('npm', ['install', '--no-audit', '--no-fund', '--loglevel=error'], { cwd: dir, env: userEnv(), maxBuffer: 64 << 20 })
  return { dir, tarballs }
}

/** The environment of a user's shell: without the variables pnpm and Vitest set for the monorepo's scripts and tests. */
export function userEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env }
  for (const name of Object.keys(env)) {
    if (/^(?:npm|pnpm)_/i.test(name) || ['NODE_ENV', 'INIT_CWD', 'VITEST', 'VITEST_WORKER_ID', 'VITEST_POOL_ID', 'TEST'].includes(name)) delete env[name]
  }
  return { ...env, ...extra }
}

/** The `presmium` command the project installed. */
export function presmiumBin(project: string): string {
  return join(project, 'node_modules/@presmium/cli/bin/presmium.mjs')
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  const dir = args.find(arg => !arg.startsWith('--'))
  const { dir: made } = await consumerProject({
    dir: dir ? resolve(dir) : undefined,
    ...args.includes('--studio') ? { packages: STUDIO } : {},
    plugins: [join(FIXTURES, 'plugin')],
    files: join(FIXTURES, 'deck'),
  })
  console.log(made)
}
