import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { constants, createReadStream } from 'node:fs'
import { chmod, copyFile, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rename, rm, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'
import { isInside } from '@lincyaw/kernel/node'
import type { HoisterResult, HoisterTree } from '@yarnpkg/nm'

type Manifest = { name?: string, dependencies?: Record<string, string>, devDependencies?: Record<string, string>, optionalDependencies?: Record<string, string>, peerDependencies?: Record<string, string>, bin?: string | Record<string, string> }
type File = { source: string, path: string, mode: number, digest: string }
type Package = { source: string, manifest: Manifest, files: File[], directories: string[], direct: Set<string> }
const validName = (name: string) => /^(?:@[^/\\]+\/)?[^/\\]+$/.test(name) && !name.split('/').some(part => part === '.' || part === '..')
const json = async (file: string): Promise<Manifest> => JSON.parse(await readFile(file, 'utf8').catch(error => { if (error.code === 'ENOENT') return '{}'; throw error }))
const namesOf = (pkg: Manifest, root = false) => new Set(Object.keys({ ...pkg.dependencies, ...pkg.optionalDependencies, ...pkg.peerDependencies, ...root ? pkg.devDependencies : {} }))

/** Materialize the installed graph, never re-resolve versions or rerun install/build scripts. */
export class WindowsDependencies {
  readonly #hashes = new Map<string, { version: string, digest: string }>()

  async #files(root: string): Promise<{ files: File[], directories: string[] }> {
    const files: File[] = []
    const directories: string[] = []
    const walk = async (directory: string, path: string, parents: Set<string>): Promise<void> => {
      const canonical = await realpath(directory)
      if (!isInside(canonical, root)) throw new Error('A Windows dependency asset link leaves its package')
      if (parents.has(canonical)) throw new Error('A Windows dependency has a recursive asset link')
      const ancestors = new Set([...parents, canonical])
      for (const item of (await readdir(directory)).sort()) {
        if (item === '.git' || item === '.presmium' || (!path && item === 'node_modules')) continue
        const source = join(directory, item)
        const target = join(path, item)
        const resolved = await realpath(source)
        if (!isInside(resolved, root)) throw new Error('A Windows dependency asset link leaves its package')
        const info = await stat(resolved, { bigint: true })
        if (info.isDirectory()) { directories.push(target); await walk(resolved, target, ancestors) }
        else if (info.isFile()) {
          const version = [info.dev, info.ino, info.size, info.mtimeNs, info.ctimeNs, info.mode].join(':')
          let known = this.#hashes.get(resolved)
          if (known?.version !== version) {
            const hash = createHash('sha256')
            for await (const chunk of createReadStream(resolved)) hash.update(chunk)
            const digest = hash.digest('hex')
            this.#hashes.set(resolved, known = { version, digest })
          }
          files.push({ source: resolved, path: target, mode: Number(info.mode) & 0o777, digest: known!.digest })
        } else throw new Error('A Windows dependency contains a non-file entry')
      }
    }
    await walk(root, '', new Set())
    return { files, directories }
  }

  async #graph(source: string) {
    const packages = new Map<string, Package>()
    const nodes = new Map<string, HoisterTree>()
    const roots = async (directory: string): Promise<string[]> => {
      const result: string[] = []
      for (const name of (await readdir(directory).catch(error => { if (error.code === 'ENOENT') return []; throw error })).sort()) {
        if (name.startsWith('.')) continue
        if (name.startsWith('@')) for (const member of (await readdir(join(directory, name))).sort()) result.push(`${name}/${member}`)
        else result.push(name)
      }
      return result.filter(validName)
    }
    const find = async (from: string, name: string): Promise<string | undefined> => {
      if (!validName(name)) throw new Error('A Windows dependency has an invalid package name')
      for (const directory of createRequire(join(from, 'package.json')).resolve.paths(name) ?? []) {
        const found = await stat(join(directory, name)).catch(error => { if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return; throw error })
        if (found?.isDirectory()) return realpath(join(directory, name))
      }
    }
    const visit = async (name: string, path: string): Promise<HoisterTree> => {
      path = await realpath(path)
      const id = createHash('sha256').update(path).digest('hex')
      const nodeKey = `${name}:${id}`
      const known = nodes.get(nodeKey)
      if (known) return known
      const manifest = await json(join(path, 'package.json'))
      const node: HoisterTree = { name, identName: manifest.name ?? name, reference: id, dependencies: new Set(), peerNames: new Set(Object.keys(manifest.peerDependencies ?? {})) }
      nodes.set(nodeKey, node)
      if (!packages.has(id)) packages.set(id, { source: path, manifest, ...await this.#files(path), direct: namesOf(manifest) })
      const dependencies = new Set([...namesOf(manifest), ...await roots(join(path, 'node_modules'))])
      for (const dependency of dependencies) {
        const resolved = await find(path, dependency)
        if (resolved) node.dependencies.add(await visit(dependency, resolved))
      }
      return node
    }
    const manifest = await json(join(source, 'package.json'))
    const tree: HoisterTree = { name: 'presmium-candidate', identName: 'presmium-candidate', reference: 'root', dependencies: new Set(), peerNames: new Set() }
    for (const name of await roots(join(source, 'node_modules'))) {
      const path = await find(source, name)
      if (path) tree.dependencies.add(await visit(name, path))
    }
    const stamp = createHash('sha256').update(JSON.stringify([manifest, [...packages].map(([id, pkg]) => [id, pkg.files.map(file => [file.path, file.mode, file.digest]), pkg.directories])])).digest('hex')
    return { tree, packages, stamp, direct: namesOf(manifest, true) }
  }

  async sync(source: string, target: string, state: string, changed: () => void): Promise<void> {
    const graph = await this.#graph(source)
    const record = join(state, `dependencies-${createHash('sha256').update(resolve(target)).digest('hex')}.json`)
    const previous = await readFile(record, 'utf8').catch(() => '')
    const existing = await lstat(target).catch(error => { if (error.code !== 'ENOENT') throw error })
    if (existing?.isDirectory() && !existing.isSymbolicLink() && previous === graph.stamp) return
    const stage = await mkdtemp(join(state, 'dependencies-'))
    try {
      const { hoist } = await import('@yarnpkg/nm')
      const shim = createRequire(import.meta.url)('cmd-shim') as (source: string, target: string) => Promise<void>
      const copy = async (node: HoisterResult, destination: string, direct: Set<string>, parents: Set<string>): Promise<void> => {
        await mkdir(destination, { recursive: true })
        const bins = new Map<string, string>()
        const dependencies = [...node.dependencies].sort((a, b) => Number(direct.has(a.name)) - Number(direct.has(b.name)) || a.name.localeCompare(b.name))
        for (const dependency of dependencies) {
          const identity = `${dependency.name}:${[...dependency.references].sort().join(',')}`
          if (parents.has(identity) || dependency === node) continue
          if (!validName(dependency.name) || dependency.references.size !== 1) throw new Error('The Windows dependency layout is ambiguous')
          const pkg = graph.packages.get([...dependency.references][0]!)!
          const directory = join(destination, dependency.name)
          await mkdir(directory, { recursive: true })
          for (const path of pkg.directories) await mkdir(join(directory, path), { recursive: true })
          for (const file of pkg.files) {
            const output = join(directory, file.path)
            await copyFile(file.source, output, constants.COPYFILE_FICLONE)
            await chmod(output, file.mode)
          }
          const commands = typeof pkg.manifest.bin === 'string' ? { [basename(pkg.manifest.name ?? dependency.name)]: pkg.manifest.bin } : pkg.manifest.bin ?? {}
          for (const [name, path] of Object.entries(commands)) {
            const entry = resolve(directory, path)
            if (!name || name === '.' || name === '..' || /[\\/]/.test(name) || !isInside(entry, directory)) throw new Error('A Windows dependency command leaves its package')
            const file = await stat(entry).catch(error => { if (error.code !== 'ENOENT') throw error })
            if (file?.isFile()) bins.set(name, entry)
          }
          await copy(dependency, join(directory, 'node_modules'), pkg.direct, new Set([...parents, identity]))
        }
        for (const [name, entry] of bins) { await mkdir(join(destination, '.bin'), { recursive: true }); await shim(entry, join(destination, '.bin', name)) }
      }
      await copy(hoist(graph.tree, { check: true }), stage, graph.direct, new Set())
      const ordinary = async (directory: string): Promise<void> => {
        for (const name of await readdir(directory)) {
          const path = join(directory, name)
          const info = await lstat(path)
          if (info.isSymbolicLink() || (!info.isDirectory() && (!info.isFile() || info.nlink !== 1))) throw new Error('Windows candidate dependencies are not independent ordinary files')
          if (info.isDirectory()) await ordinary(path)
        }
      }
      await ordinary(stage)
      if ((await this.#graph(source)).stamp !== graph.stamp) throw new Error('Windows source dependencies changed while their candidate snapshot was copied')
      changed()
      await rm(target, { recursive: true, force: true })
      await rename(stage, target)
      await writeFile(record, graph.stamp)
    } finally { await rm(stage, { recursive: true, force: true, maxRetries: 3 }) }
  }
}
