// Gathers what the Tauri bundle carries for the platform of this machine: the Node runtime (as the sidecar
// `presmium-node`), the installed `@lincyaw/presmium` with Studio (`build/runtime`), and the launcher page (`build/ui`).
import { execFileSync, spawnSync } from 'node:child_process'
import { chmodSync, copyFileSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const pkg = fileURLToPath(new URL('..', import.meta.url))
const root = fileURLToPath(new URL('../../..', import.meta.url))
const out = join(pkg, 'build')
const pnpm = process.env.npm_execpath
if (!pnpm) throw new Error('Run this command with pnpm --filter presmium-desktop <script>')

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit' })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status}`)
}

// The same Node that runs this build runs Studio, so native modules installed by the deploy below match it.
async function nodeRuntime() {
  const triple = /^host: (\S+)$/m.exec(execFileSync('rustc', ['-vV'], { encoding: 'utf8' }))[1]
  const windows = process.platform === 'win32'
  const sidecar = join(pkg, 'src-tauri', 'binaries', `presmium-node-${triple}${windows ? '.exe' : ''}`)
  const stamp = join(out, 'cache', `${triple}.node-version`)
  if (existsSync(sidecar) && existsSync(stamp) && readFileSync(stamp, 'utf8') === process.version) return
  const platform = { darwin: 'darwin', linux: 'linux', win32: 'win' }[process.platform]
  const name = `node-${process.version}-${platform}-${process.arch}`
  const archive = windows ? `${name}.zip` : `${name}.tar.gz`
  const cache = join(out, 'cache')
  mkdirSync(cache, { recursive: true })
  const file = join(cache, archive)
  if (!existsSync(file)) {
    const response = await fetch(`https://nodejs.org/dist/${process.version}/${archive}`)
    if (!response.ok) throw new Error(`Downloading ${archive}: HTTP ${response.status}`)
    writeFileSync(`${file}.part`, Buffer.from(await response.arrayBuffer()))
    renameSync(`${file}.part`, file)
  }
  const unpacked = join(cache, name)
  rmSync(unpacked, { recursive: true, force: true })
  // Windows' own tar is bsdtar, which reads zip; Git's GNU tar, often first on PATH, takes `D:` for a host.
  const tar = windows ? join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe') : 'tar'
  run(tar, ['-xf', file, '-C', cache], cache)
  mkdirSync(join(pkg, 'src-tauri', 'binaries'), { recursive: true })
  copyFileSync(join(unpacked, windows ? 'node.exe' : 'bin/node'), sidecar)
  if (!windows) chmodSync(sidecar, 0o755)
  writeFileSync(stamp, process.version)
  rmSync(unpacked, { recursive: true, force: true })
}

// pnpm may hard-link workspace sources even with a copy import method; the bundle must own its bytes.
function snapshotFiles(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const file = join(dir, entry.name)
    if (entry.isDirectory()) snapshotFiles(file)
    else if (entry.isFile() && lstatSync(file).nlink > 1) {
      copyFileSync(file, `${file}.presmium-copy`)
      renameSync(`${file}.presmium-copy`, file)
    }
  }
}

function runtime() {
  // The prebuilt Studio client and the author skills, as `presmium studio` uses them from an installed package.
  run(process.execPath, [pnpm, '--filter', '@lincyaw/skills', 'run', 'prepack'], root)
  run(process.execPath, [pnpm, '--filter', '@lincyaw/dsh', 'run', 'prepack'], root)
  const target = join(out, 'runtime')
  rmSync(target, { recursive: true, force: true })
  run(process.execPath, [pnpm, '--filter', 'presmium-desktop', 'deploy', '--prod', '--frozen-lockfile',
    '--config.inject-workspace-packages=true', '--config.node-linker=hoisted', '--config.package-import-method=copy', target], root)
  snapshotFiles(join(target, 'node_modules', '@lincyaw'))
  for (const file of ['.pnpm', '.bin', '.modules.yaml']) rmSync(join(target, 'node_modules', file), { recursive: true, force: true })
  for (const file of ['pnpm-lock.yaml', 'pnpm-workspace.yaml', 'scripts', 'src-tauri', 'ui', '.gitignore']) rmSync(join(target, file), { recursive: true, force: true })
  prune(join(target, 'node_modules'))
}

// Files no installed program reads: source maps, type declarations, Windows debug symbols, a package's own
// tests and demos, and node-pty's prebuilt binaries for the other platforms. About a third of the runtime.
const unused = /\.(map|d\.[cm]?ts|pdb)$/
const unusedInPackage = new Set(['test', 'tests', '__tests__', 'demo'])
function prune(modules) {
  const sweep = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const file = join(dir, entry.name)
      if (entry.isDirectory()) sweep(file)
      else if (unused.test(entry.name)) rmSync(file)
    }
  }
  sweep(modules)
  const folders = (dir) => readdirSync(dir, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => join(dir, entry.name))
  for (const folder of folders(modules)) {
    const packages = folder.split(/[\\/]/).pop().startsWith('@') ? folders(folder) : [folder]
    for (const dir of packages) for (const sub of unusedInPackage) rmSync(join(dir, sub), { recursive: true, force: true })
  }
  const prebuilds = join(modules, 'node-pty', 'prebuilds')
  if (existsSync(prebuilds)) {
    for (const name of readdirSync(prebuilds)) if (name !== `${process.platform}-${process.arch}`) rmSync(join(prebuilds, name), { recursive: true, force: true })
  }
}

async function launcher() {
  const ui = join(out, 'ui')
  rmSync(ui, { recursive: true, force: true })
  await build({
    entryPoints: [join(pkg, 'ui', 'main.ts'), join(pkg, 'ui', 'style.css')],
    outdir: ui,
    bundle: true,
    format: 'esm',
    minify: true,
    loader: { '.woff2': 'file', '.woff': 'file' },
    logLevel: 'warning',
  })
  copyFileSync(join(pkg, 'ui', 'index.html'), join(ui, 'index.html'))
}

const only = process.argv[2]
if (!only || only === 'node') await nodeRuntime()
if (!only || only === 'ui') await launcher()
if (!only || only === 'runtime') runtime()
