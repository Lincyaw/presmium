import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { RUNTIMES, runtimeOf } from '../runner.mjs'

const require = createRequire(import.meta.url)

let found: string | undefined

export function runtimeDir(): string {
  if (found) return found
  for (const modules of require.resolve.paths('@runno/sandbox') ?? []) {
    const dir = join(modules, '@runno/sandbox/dist/langs')
    if (existsSync(dir)) return found = dir
  }
  throw new Error('the WASI runtimes (@runno/sandbox) are not installed')
}

export function missingRuntime(lang: string): string | undefined {
  const runtime = runtimeOf(lang)
  if (!runtime) return `no WASI runtime runs ${lang}`
  try {
    const dir = runtimeDir()
    const missing = RUNTIMES[runtime].filter(file => !existsSync(join(dir, file)))
    return missing.length ? `missing runtime files: ${missing.join(', ')}` : undefined
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
}

const fingerprints = new Map<string, string>()

export function runtimeFingerprint(lang: string): string {
  const runtime = runtimeOf(lang)
  if (!runtime) return ''
  let fingerprint = fingerprints.get(runtime)
  if (!fingerprint) {
    const hash = createHash('sha256')
    for (const file of RUNTIMES[runtime]) hash.update(readFileSync(join(runtimeDir(), file)))
    fingerprint = `wasi ${runtime} sha256:${hash.digest('hex').slice(0, 16)}`
    fingerprints.set(runtime, fingerprint)
  }
  return fingerprint
}
