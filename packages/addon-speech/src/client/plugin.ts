import { SPEECH } from '@presmium/kernel'
import type { PluginDefinition } from '@presmium/kernel'
import { SPEECH_ID } from '../domain/index.ts'
import { browserSpeech } from './speech.ts'

/**
 * Provides the browser's `SPEECH` through the server's speech gateway
 * routes. Registered by `setup/main.ts` in the slides form and by the web
 * package in the document form.
 */
const plugin: PluginDefinition = {
  manifest: {
    id: SPEECH_ID,
    version: '0.1.0',
    kernel: '^0.1.0',
    provides: [SPEECH],
    capabilities: ['network'],
  },
  setup(ctx) {
    ctx.provide(SPEECH, browserSpeech(ctx.config))
  },
}

export default plugin
