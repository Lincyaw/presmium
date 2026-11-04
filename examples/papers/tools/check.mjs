import { spawnSync } from 'node:child_process'
import { globSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'

const root = fileURLToPath(new URL('..', import.meta.url))
const config = parse(readFileSync(resolve(root, 'presmium.workspace.yaml'), 'utf8'))
const manifest = createRequire(import.meta.url).resolve('@lincyaw/presmium/package.json')
const cli = resolve(dirname(manifest), JSON.parse(readFileSync(manifest, 'utf8')).bin.presmium)
const entries = globSync(config.documents, { cwd: root }).sort()
if (entries.length === 0) throw new Error('No paper documents match presmium.workspace.yaml')

for (const entry of entries) {
  const result = spawnSync(process.execPath, [cli, 'check', entry, ...process.argv.slice(2)], {
    cwd: root, stdio: ['ignore', 'inherit', 'inherit'],
  })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}
