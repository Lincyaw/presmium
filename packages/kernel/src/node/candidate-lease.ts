import { createHash } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { setTimeout } from 'node:timers/promises'

const lockfile = createRequire(import.meta.url)('proper-lockfile') as {
  lock(file: string, options: { realpath: boolean, retries: number }): Promise<() => Promise<void>>
}

/** Serializes native access and host review writes to one private candidate, across processes. */
export async function acquireCandidateLease(root: string, signal?: AbortSignal): Promise<() => Promise<void>> {
  const directory = join(dirname(dirname(root)), '.leases')
  await mkdir(directory, { recursive: true })
  const file = join(directory, createHash('sha256').update(resolve(root)).digest('hex'))
  for (;;) {
    signal?.throwIfAborted()
    try {
      const release = await lockfile.lock(file, { realpath: false, retries: 0 })
      if (signal?.aborted) { await release(); signal.throwIfAborted() }
      return release
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ELOCKED') throw error
      await setTimeout(100, undefined, { signal })
    }
  }
}
