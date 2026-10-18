import { SPEECH } from '@presmium/kernel'
import type { PluginDefinition } from '@presmium/kernel'
import { version } from '../../package.json'
import { SPEECH_ID } from '../domain/index.ts'
import { browserSpeech } from './speech.ts'

/**
 * Provides the browser's `SPEECH` through the server's speech protocol
 * routes. Registered by `setup/main.ts` in the slides form and by the web
 * package in the document form.
 */
const plugin: PluginDefinition = {
  manifest: {
    id: SPEECH_ID,
    version,
    kernel: '^1.0.0',
    provides: [SPEECH],
    capabilities: ['network'],
  },
  setup(ctx) {
    ctx.provide(SPEECH, browserSpeech(ctx.config))
  },
}

export default plugin
