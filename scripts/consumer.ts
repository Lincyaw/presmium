#!/usr/bin/env node
import { execFile } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const run = promisify(execFile)

export const ROOT = fileURLToPath(new URL('..', import.meta.url))

export const FIXTURES = join(ROOT, 'e2e/fixtures/consumer')

export const ESSENTIALS = ['@presmium/cli', '@presmium/web', '@presmium/render-slides', '@presmium/render-notebook', '@presmium/slidev-addon-core']

export const STUDIO = [...ESSENTIALS, '@presmium/studio']

export interface PublicPackage {
  name: string
  dir: string
  needs: string[]
}

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
  dir: string
  file: string
  files: string[]
}

const PACK_LOCK = join(ROOT, 'node_modules', '.presmium-pack.lock')

const alive = (pid: number) => {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM'
  }
}

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
      }
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

export async function packPlugin(dir: string, dest: string): Promise<{ name: string, file: string }> {
  mkdirSync(dest, { recursive: true })
  const { stdout } = await run('npm', ['pack', resolve(dir), '--pack-destination', dest, '--json'], { cwd: dest, env: userEnv(), maxBuffer: 64 << 20 })
  const [packed] = JSON.parse(stdout) as { name: string, filename: string }[]
  return { name: packed!.name, file: resolve(dest, packed!.filename) }
}

export interface ConsumerOptions {
  dir?: string
  packages?: string[]
  plugins?: string[]
  files?: string
}

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

export function userEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env }
  for (const name of Object.keys(env)) {
    if (/^(?:npm|pnpm)_/i.test(name) || ['NODE_ENV', 'INIT_CWD', 'VITEST', 'VITEST_WORKER_ID', 'VITEST_POOL_ID', 'TEST'].includes(name)) delete env[name]
  }
  return { ...env, ...extra }
}

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
