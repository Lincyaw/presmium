import { createRequire } from 'node:module'

/** User-logon DOS names need neither a drive letter nor the symlink privilege. */
export class WindowsCandidateDevices {
  private readonly kernel = (createRequire(import.meta.url)('koffi') as typeof import('koffi')).load('kernel32.dll')
  private readonly define = this.kernel.func('__stdcall', 'DefineDosDeviceW', 'int', ['uint32', 'str16', 'str16'])
  private readonly query = this.kernel.func('__stdcall', 'QueryDosDeviceW', 'uint32', ['str16', 'void *', 'uint32'])
  private readonly lastError = this.kernel.func('__stdcall', 'GetLastError', 'uint32', [])

  target(name: string): string | undefined {
    const buffer = Buffer.alloc(65536)
    if (this.query(name, buffer, buffer.length / 2)) return buffer.toString('utf16le').split('\0')[0]
    const code = this.lastError()
    if (code === 2) return undefined
    throw new Error(`Cannot inspect the candidate device (${code})`)
  }

  remove(name: string): void {
    for (let depth = 0; depth < 64; depth++) {
      const target = this.target(name)
      if (target === undefined) return
      // RAW_TARGET_PATH | REMOVE_DEFINITION | EXACT_MATCH_ON_REMOVE | NO_BROADCAST_SYSTEM
      if (!this.define(15, name, target)) throw new Error(`Cannot retire the candidate device (${this.lastError()})`)
    }
    throw new Error('The candidate device has too many definitions')
  }

  volumeTarget(view: string): string {
    if (view.startsWith('\\\\?\\UNC\\')) view = `\\\\${view.slice(8)}`
    else if (/^\\\\\?\\[a-z]:/i.test(view)) view = view.slice(4)
    if (/^\\\\[^\\]+\\[^\\]+(?:\\|$)/.test(view)) {
      // Harness canonicalizes a WinFsp network drive to its unique UNC share.
      // The share names the view itself; it does not depend on a recyclable drive letter.
      return `\\??\\UNC\\${view.slice(2).replace(/[\\/]$/, '')}`
    }
    const match = /^([a-z]:)([\\/].*)$/i.exec(view)
    const volume = match && this.target(match[1]!)
    if (!match || !volume) throw new Error('The candidate volume is unavailable')
    // Bind the unique NT volume, not Z:, which WinFsp can give to a different workspace later.
    return volume.replace(/[\\/]$/, '') + match[2]!.replaceAll('/', '\\')
  }

  set(name: string, target: string): void {
    if (this.target(name)?.toLowerCase() === target.toLowerCase()) return
    this.remove(name)
    // RAW_TARGET_PATH | NO_BROADCAST_SYSTEM. Default scope is the caller's logon, not Global.
    if (!this.define(9, name, target)) throw new Error(`Cannot establish the candidate device (${this.lastError()})`)
  }
}
