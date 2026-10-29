import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

/** Resolve an executable through a package's public manifest, preferring the selected project. */
export function runtimeBin(name: string, command: string, directories: string | readonly string[] | undefined, extensionPath: string): string | undefined {
  for (const base of [...typeof directories === 'string' ? [directories] : directories ?? [], join(extensionPath, 'runtime'), extensionPath]) {
    try {
      const manifest = createRequire(join(base, 'package.json')).resolve(`${name}/package.json`)
      const { bin } = JSON.parse(readFileSync(manifest, 'utf8')) as { bin?: string | Record<string, string> }
      const entry = typeof bin === 'string' ? bin : bin?.[command]
      if (entry) {
        const file = join(dirname(manifest), entry)
        if (existsSync(file)) return file
      }
    } catch { /* A project may use the extension's bundled runtime. */ }
  }
}
