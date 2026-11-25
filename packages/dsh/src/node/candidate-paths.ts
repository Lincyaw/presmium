import { execFile } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { lstat, mkdir, readlink, realpath, rename, rm, symlink } from 'node:fs/promises'
import { userInfo } from 'node:os'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { promisify } from 'node:util'
import { acquireCandidateLease, isInside } from '@lincyaw/kernel/node'

const run = promisify(execFile)
const key = (value: string) => createHash('sha256').update(value).digest('hex')
const coordinate = (value: string) => {
  const absolute = resolve(value)
  return process.platform === 'win32' ? (absolute.startsWith('\\\\?\\') ? absolute.slice(4) : absolute).toLowerCase() : absolute
}

/** An execution-world entry, separate from DeltaBox's replaceable private view. */
export class CandidatePaths {
  readonly #views = new Map<string, { root: string, view: string, path: string, release: () => Promise<void> }>()
  readonly #pending = new Map<string, Promise<string>>()
  readonly #lifecycle = new AbortController()
  readonly #base = process.platform === 'win32'
    ? join(process.env.ProgramData || 'C:\\ProgramData', `Presmium-agent-${key(userInfo().username).slice(0, 24)}`)
    : join('/tmp', `presmium-agent-${process.getuid!()}`)

  pathFor(root: string): string { return join(this.#base, key(resolve(root)), 'workspace') }

  /** Only the host may replace this entry; an ordinary sandboxed command cannot unlink it. */
  async install(root: string, view: string): Promise<string> {
    const previous = this.#pending.get(root) ?? Promise.resolve('')
    const pending = previous.catch(() => '').then(() => this.#install(root, view))
    this.#pending.set(root, pending)
    try { return await pending } finally { if (this.#pending.get(root) === pending) this.#pending.delete(root) }
  }

  async #install(root: string, view: string): Promise<string> {
    this.#lifecycle.signal.throwIfAborted()
    let known = this.#views.get(root)
    if (known?.view === view) {
      const entry = await lstat(known.path).catch(error => { if (error.code !== 'ENOENT') throw error })
      if (entry && !entry.isSymbolicLink()) throw new Error('The candidate entry is not a host-owned link')
      if (entry && process.platform !== 'win32' && entry.uid !== process.getuid!()) throw new Error('The candidate entry has another owner')
      if (entry && coordinate(await readlink(known.path)) === coordinate(view)) return known.path
    }
    await this.#directory(this.#base)
    const path = this.pathFor(root)
    await this.#directory(resolve(path, '..'))
    const release = known?.release ?? await acquireCandidateLease(path, this.#lifecycle.signal)
    try {
      const entry = await lstat(path).catch(error => { if (error.code !== 'ENOENT') throw error })
      if (entry && !entry.isSymbolicLink()) throw new Error('The candidate entry is not a host-owned link')
      if (entry && process.platform !== 'win32' && entry.uid !== process.getuid!()) throw new Error('The candidate entry has another owner')
      if (!entry || coordinate(await readlink(path)) !== coordinate(view)) {
        const next = `${path}.${randomUUID()}`
        await symlink(view, next, process.platform === 'win32' ? 'junction' : 'dir')
        try {
          // Windows cannot replace a junction with rename. All readers of this entry await install.
          if (process.platform === 'win32' && entry) await rm(path)
          await rename(next, path)
        } finally { await rm(next, { force: true }) }
      }
      if (coordinate(await realpath(path)) !== coordinate(await realpath(view))) throw new Error('The candidate entry did not reach its private view')
      known = { root, view, path, release }
      this.#views.set(root, known)
      return path
    } catch (error) { if (!known) await release(); throw error }
  }

  async #directory(path: string): Promise<void> {
    const created = await mkdir(path, { recursive: true, mode: 0o700 })
    const info = await lstat(path)
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('The candidate entry directory is not a private directory')
    if (process.platform !== 'win32') {
      if (info.uid !== process.getuid!() || (info.mode & 0o077) !== 0) throw new Error('The candidate entry directory is not private to its owner')
      return
    }
    // Protect metadata against other users while retaining traversal by a PSEC child.
    // Payload access still goes through the original WinFsp view and its own policy/ACLs.
    const script = [
      "$ErrorActionPreference='Stop'",
      `$p='${path.replaceAll("'", "''")}'`,
      '$sid=[Security.Principal.WindowsIdentity]::GetCurrent().User',
      '$directory=[IO.DirectoryInfo]::new($p)',
      '$acl=$directory.GetAccessControl()',
      ...(created ? ['$acl.SetOwner($sid)'] : ["if($acl.Owner -ne $sid.Value -and ([Security.Principal.NTAccount]$acl.Owner).Translate([Security.Principal.SecurityIdentifier]).Value -ne $sid.Value){throw 'Candidate entry directory has another owner'}"]),
      '$acl.SetAccessRuleProtection($true,$false)',
      'foreach($rule in @($acl.Access)){$acl.RemoveAccessRuleSpecific($rule)}',
      "foreach($id in @($sid.Value,'S-1-5-18','S-1-5-32-544')){$acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new($id),'FullControl','ContainerInherit,ObjectInherit','None','Allow'))}",
      "foreach($id in @('S-1-5-32-545','S-1-15-2-1')){$acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new($id),'ReadAndExecute','ContainerInherit,ObjectInherit','None','Allow'))}",
      '$directory.SetAccessControl($acl)',
    ].join('\n')
    await run(join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'), ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { windowsHide: true })
  }

  /** Resolve '..' in the public namespace before translating into the private view. */
  physical(path: string, cwd?: string): string {
    const absolute = isAbsolute(path) ? resolve(path) : resolve(cwd ?? process.cwd(), path)
    for (const item of this.#views.values()) if (isInside(absolute, item.path)) return join(item.view, relative(item.path, absolute))
    return absolute
  }

  visible(path: string): string {
    for (const item of this.#views.values()) {
      for (const source of [item.view, item.root]) if (isInside(path, source)) return join(item.path, relative(source, path))
    }
    return path
  }

  async close(): Promise<void> {
    this.#lifecycle.abort()
    await Promise.allSettled(this.#pending.values())
    await Promise.all([...this.#views.values()].map(async item => {
      try { await rm(item.path, { force: true }) } finally { await item.release() }
    }))
    this.#views.clear()
  }

  async remove(root: string): Promise<void> {
    await this.#pending.get(root)
    const item = this.#views.get(root)
    if (!item) return
    try { await rm(item.path, { force: true }) } finally { this.#views.delete(root); await item.release() }
  }
}
