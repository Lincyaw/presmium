import type { BigIntStats } from 'node:fs'

/** A local file's identity and observed contents, including replacements that preserve its modification time. */
export function fileVersion(stat: Pick<BigIntStats, 'dev' | 'ino' | 'size' | 'mtimeNs' | 'ctimeNs'>): string {
  return [stat.dev, stat.ino, stat.size, stat.mtimeNs, stat.ctimeNs].join(':')
}
