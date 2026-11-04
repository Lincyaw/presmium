import { createHash } from 'node:crypto'
import { closeSync, constants, fstatSync, lstatSync, openSync, readSync, readlinkSync, realpathSync } from 'node:fs'
import { join } from 'node:path'
import type { DocumentFileChange } from '@lincyaw/kernel'
import { RequestError } from './errors.ts'
import { DOCUMENT_OPERATION_MAX_BACKUP_BYTES, DOCUMENT_OPERATION_MAX_BACKUP_ENTRIES } from './writer.ts'

export interface RevisionFile {
  path: string
  mode: '000000' | '100644' | '100755' | '120000' | 'unsupported'
  stamp: string
  change?: DocumentFileChange
}
export const revisionDigest = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex')

/** Raw preimages are distinct from filtered Git blobs, particularly for CRLF files and symlinks. */
export function revisionFiles(root: string, paths: string[]): RevisionFile[] {
  if (paths.length > DOCUMENT_OPERATION_MAX_BACKUP_ENTRIES) throw new RequestError(413, 'changes-selection-too-large')
  let total = 0
  return paths.map(path => {
    const parts = path.split('/')
    if (!path || path.startsWith('/') || path.includes('\0') || parts.some(part => !part || part === '.' || part === '..' || part === '.git')) throw new RequestError(403, 'changes-path-forbidden')
    if (path.includes('\\')) return { path, mode: 'unsupported', stamp: 'unsupported-name' }
    let parent = root
    for (const part of parts.slice(0, -1)) {
      parent = join(parent, part)
      const entry = lstatSync(parent, { throwIfNoEntry: false })
      if (!entry) break
      if (!entry.isDirectory() || realpathSync(parent) !== parent) return { path, mode: 'unsupported', stamp: 'unsafe-parent' }
    }
    const file = join(root, path), before = lstatSync(file, { throwIfNoEntry: false })
    if (!before) return { path, mode: '000000', stamp: 'absent', change: { path, remove: true } }
    if (before.isSymbolicLink()) {
      const link = readlinkSync(file), after = lstatSync(file)
      if (before.ino !== after.ino || before.dev !== after.dev || before.ctimeMs !== after.ctimeMs) throw new RequestError(409, 'changes-state-changed')
      return { path, mode: '120000', stamp: revisionDigest('link:' + link), change: { path, link } }
    }
    if (!before.isFile()) return { path, mode: 'unsupported', stamp: `unsupported:${before.mode}` }
    if ((total += before.size) > DOCUMENT_OPERATION_MAX_BACKUP_BYTES) throw new RequestError(413, 'changes-selection-too-large')
    const fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
    try {
      const opened = fstatSync(fd)
      if (!opened.isFile() || opened.ino !== before.ino || opened.dev !== before.dev || opened.size !== before.size) throw new RequestError(409, 'changes-state-changed')
      const buffer = Buffer.alloc(opened.size + 1)
      let length = 0, count = 0
      while (length < buffer.length && (count = readSync(fd, buffer, length, buffer.length - length, null)) > 0) length += count
      const bytes = buffer.subarray(0, length), after = fstatSync(fd), current = lstatSync(file)
      if (length !== opened.size || after.size !== opened.size || after.mtimeMs !== opened.mtimeMs || after.ctimeMs !== opened.ctimeMs
        || current.ino !== opened.ino || current.dev !== opened.dev || realpathSync(file) !== file) throw new RequestError(409, 'changes-state-changed')
      const executable = (opened.mode & 0o111) !== 0
      return { path, mode: executable ? '100755' : '100644', stamp: revisionDigest(bytes), change: { path, content: bytes, executable } }
    } finally { closeSync(fd) }
  })
}
