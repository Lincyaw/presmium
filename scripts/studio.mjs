// Repository shortcut: prepare the example workspace once, then reuse its editable files.
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { parseArgs } from 'node:util'

let parsed
try {
  parsed = parseArgs({
    allowPositionals: true,
    strict: false,
    options: {
      port: { type: 'string' },
      host: { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
  })
} catch {
  // Let the workbench CLI report invalid arguments using its normal usage message.
}

if (parsed?.values.help) console.log('pnpm studio [dir]: repository shortcut (default: .presmium/cs336-workspace)\n')
if (parsed?.positionals.length === 0 && !parsed.values.help) {
  const dir = '.presmium/cs336-workspace'
  if (!existsSync(dir)) {
    execFileSync(process.execPath, ['examples/cs336/try.mjs', dir], { stdio: ['ignore', 'ignore', 'inherit'] })
  }
  process.argv.splice(2, 0, dir)
}

await import('../packages/studio/bin/presmium-studio.mjs')
