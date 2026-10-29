import { createHash } from 'node:crypto'
import { link, lstat, mkdir, mkdtemp, realpath, rm, rmdir, stat, unlink, writeFile } from 'node:fs/promises'
import type { Stats } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { resourceBytes, resourceFiles, skillDirectory, skillName, SKILL_NAMES, SkillError } from './resources.ts'
import type { SkillName } from './resources.ts'

export interface InstallSkillsOptions { names?: readonly string[], signal?: AbortSignal }
export interface InstallSkillsResult { installed: SkillName[], skipped: SkillName[] }
const missing = (error: unknown) => (error as NodeJS.ErrnoException).code === 'ENOENT'
const present = async (path: string) => { try { return await lstat(path) } catch (error) { if (missing(error)) return undefined; throw error } }
const same = (a: Stats, b: Stats | undefined) => Boolean(b?.isDirectory() && !b.isSymbolicLink() && a.ino === b.ino && a.dev === b.dev)
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
const cancelled = (signal?: AbortSignal) => { if (signal?.aborted) throw new SkillError('skill-install-cancelled') }

async function directories(root: string): Promise<string> {
  let path = root
  for (const part of ['.agents', 'skills']) {
    path = join(path, part)
    try { await mkdir(path) } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error }
    const entry = await lstat(path)
    if (entry.isSymbolicLink() || !entry.isDirectory() || await realpath(path) !== path) throw new SkillError('skill-install-unsafe')
  }
  return path
}

/** Missing skills become visible together; an existing path, including a dangling link, is always preserved. */
export async function installBundledSkills(projectDir: string, options: InstallSkillsOptions = {}): Promise<InstallSkillsResult> {
  cancelled(options.signal)
  const names = [...new Set((options.names ?? SKILL_NAMES).map(skillName))]
  let root: string
  try { root = await realpath(resolve(projectDir)); if (!(await stat(root)).isDirectory()) throw new Error() }
  catch { throw new SkillError('skill-project-invalid') }
  try {
    const destination = await directories(root)
    const result: InstallSkillsResult = { installed: [], skipped: [] }
    for (const name of names) {
      cancelled(options.signal)
      const target = join(destination, name)
      if (await present(target)) { result.skipped.push(name); continue }
      const source = skillDirectory(name)
      const temporary = await mkdtemp(join(destination, `.presmium-${name}-`))
      let reserved: Stats | undefined
      const createdFiles: { path: string, stat: Stats, hash: string }[] = []
      const createdDirectories: { path: string, stat: Stats }[] = []
      const hashes = new Map<string, string>()
      try {
        const files = resourceFiles(source)
        for (const path of files) {
          cancelled(options.signal)
          const file = join(temporary, path)
          await mkdir(dirname(file), { recursive: true })
          const bytes = resourceBytes(source, path)
          await writeFile(file, bytes, { flag: 'wx' })
          hashes.set(path, hash(bytes))
        }
        cancelled(options.signal)
        if (await directories(root) !== destination) throw new SkillError('skill-install-unsafe')
        cancelled(options.signal)
        // mkdir reserves an absent name without replacing a concurrent install or user-owned entry.
        try { await mkdir(target) }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; result.skipped.push(name); continue }
        reserved = await lstat(target)
        // A skill is discoverable only after SKILL.md is linked last. Each link is atomic and never replaces an entry.
        for (const path of [...files.filter(path => path !== 'SKILL.md'), 'SKILL.md']) {
          cancelled(options.signal)
          if (await directories(root) !== destination || !same(reserved, await present(target))) throw new SkillError('skill-install-unsafe')
          let parent = target
          for (const part of path.split('/').slice(0, -1)) {
            parent = join(parent, part)
            let made = false
            try { await mkdir(parent); made = true } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error }
            const entry = await lstat(parent)
            if (entry.isSymbolicLink() || !entry.isDirectory() || await realpath(parent) !== parent) throw new SkillError('skill-install-unsafe')
            if (made) createdDirectories.push({ path: parent, stat: entry })
          }
          const file = join(target, path)
          cancelled(options.signal)
          await link(join(temporary, path), file)
          createdFiles.push({ path, stat: await lstat(file), hash: hashes.get(path)! })
        }
        cancelled(options.signal)
        reserved = undefined
        result.installed.push(name)
      } finally {
        const safe = await realpath(destination).then(path => path === destination, () => false)
        if (safe) {
          if (reserved && same(reserved, await present(target))) {
            for (const file of createdFiles.reverse()) {
              try {
                const current = await lstat(join(target, file.path))
                if (current.isFile() && current.ino === file.stat.ino && current.dev === file.stat.dev && hash(resourceBytes(target, file.path)) === file.hash) await unlink(join(target, file.path))
              } catch { /* Preserve entries changed by another writer. */ }
            }
            for (const directory of createdDirectories.reverse()) if (same(directory.stat, await present(directory.path))) await rmdir(directory.path).catch(() => {})
            await rmdir(target).catch(() => {})
          }
          await rm(temporary, { recursive: true, force: true })
        }
      }
    }
    return result
  } catch (error) { if (error instanceof SkillError) throw error; throw new SkillError('skill-install-unsafe') }
}
