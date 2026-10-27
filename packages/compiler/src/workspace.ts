import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { promisify } from 'node:util'
import type { SourceReader } from '@lincyaw/kernel'
import { isInside } from '@lincyaw/kernel/node'
import { WORKSPACE_CONFIG } from './workspace-settings.ts'

const run = promisify(execFile)

export const COMMIT_HASH = /^(?:[\da-f]{40}|[\da-f]{64})$/i

export async function findWorkspaceRoot(dir: string): Promise<string> {
  const start = resolve(dir)
  const repository = await run('git', ['rev-parse', '--show-toplevel'], { cwd: start })
    .then(({ stdout }) => resolve(stdout.trim()), () => undefined)
  for (let current = start; ; current = dirname(current)) {
    if (existsSync(join(current, WORKSPACE_CONFIG))) return current
    if (current === repository || dirname(current) === current) break
  }
  return repository ?? start
}

export function createSourceReader(root: string): SourceReader {
  return {
    async read(file, ref) {
      const path = resolve(root, file)
      const rel = relative(root, path)
      if (rel === '' || !isInside(path, root)) return undefined
      if (ref === undefined) return readFile(join(root, rel), 'utf8').catch(() => undefined)
      if (ref.startsWith('-')) return undefined
      return run('git', ['show', `${ref}:./${rel.split(sep).join('/')}`], { cwd: root, maxBuffer: 64 << 20 })
        .then(({ stdout }) => stdout, () => undefined)
    },
  }
}
