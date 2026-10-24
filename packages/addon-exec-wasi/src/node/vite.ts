import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { RuntimeAssets } from '@lincyaw/kernel'
import { RUNTIME_DIR } from '../domain/index.ts'
import { RUNTIMES } from '../shared/wasi-runner.mjs'
import type { Runtime } from '../shared/wasi-runner.mjs'
import { runtimeDir } from './runtime.ts'

const EXTENSION_TYPES: Record<string, string> = { '.wasm': 'application/wasm', '.gz': 'application/gzip' }
const LICENSES = 'LICENSES'
const LICENSES_FILE = fileURLToPath(new URL('../../LICENSES', import.meta.url))

/** Every WASI runtime at `<base>wasi/`; a build copies those the deck's live code needs, with their licenses. */
export function wasiAssets(runtimes: readonly string[]): RuntimeAssets {
  const files = [...new Set(runtimes.flatMap(runtime => Object.hasOwn(RUNTIMES, runtime) ? RUNTIMES[runtime as Runtime] : []))]
  const types = Object.fromEntries([
    ...Object.values(RUNTIMES).flat().map(file => [file, EXTENSION_TYPES[file.slice(file.lastIndexOf('.'))] ?? 'application/octet-stream']),
    [LICENSES, 'text/plain; charset=utf-8'],
  ])
  return {
    name: 'presmium:wasi-runtime',
    prefix: RUNTIME_DIR,
    types,
    emitted: files.length === 0 ? [] : [...files, LICENSES],
    source: file => (file === LICENSES ? LICENSES_FILE : join(runtimeDir(), file)),
  }
}
