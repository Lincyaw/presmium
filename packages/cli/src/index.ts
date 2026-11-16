import { createRequire } from 'node:module'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createJiti } from 'jiti'
import { CLI_MESSAGES, systemLocale } from './messages.ts'
import type { MainOptions } from './cli.ts'
export type { MainOptions } from './cli.ts'

/** Starting the editor does not need to import the compiler, exporters or MCP tool tree first. */
export async function main(argv: string[], options: MainOptions = {}): Promise<number> {
  if (argv[0] !== 'studio') return (await import('./cli.ts')).main(argv, options)
  const bundled = options.bundled ?? fileURLToPath(new URL('..', import.meta.url))
  let entry: string
  try { entry = createRequire(join(bundled, 'package.json')).resolve('@lincyaw/studio') }
  catch { process.stderr.write(`${CLI_MESSAGES[systemLocale()].studioMissing}\n`); return 2 }
  const studio = await createJiti(import.meta.url).import<{ main(argv: string[], options: { presmium: string }): Promise<number> }>(entry)
  return studio.main(argv.slice(1), { presmium: options.bin ?? fileURLToPath(new URL('../bin/presmium.mjs', import.meta.url)) })
}
