// A plugin with a run-time file of its own (`assets`) that holds its configuration of the document: the test reads it
// from each document's site path, built and served, and sees a saved change of the configuration.
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export default {
  id: 'fixture.workspaceVite',
  assets({ deckDir, config }) {
    const dir = join(deckDir, '.presmium', 'fixture')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'message.txt'), String(config.message))
    return [{ name: 'fixture-workspace', prefix: 'fixture/', types: { 'message.txt': 'text/plain; charset=utf-8' }, source: file => join(dir, file) }]
  },
}
