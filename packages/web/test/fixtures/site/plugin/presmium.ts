// A plugin with run-time files of its own (`assets`): it writes one with its configuration and serves it as
// `fixture/message.txt`, so the test sees that the site published it, for that configuration.
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

interface Context { deckDir: string, workspaceRoot: string, config: Record<string, unknown> }

export default {
  id: 'fixture.site',
  version: '0.1.0',
  kernel: '^1.0.0',
  assets({ deckDir, config }: Context) {
    const dir = join(deckDir, '.presmium', 'fixture')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'message.txt'), String(config.message))
    return [{ name: 'fixture-site', prefix: 'fixture/', types: { 'message.txt': 'text/plain; charset=utf-8' }, source: (file: string) => join(dir, file) }]
  },
}
