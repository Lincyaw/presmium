import { SPEECH } from '@lincyaw/kernel'
import type { PluginDefinition } from '@lincyaw/kernel'
import { version } from '../../package.json'
import { SPEECH_ID } from '../domain/index.ts'
import { browserSpeech } from './speech.ts'

const plugin: PluginDefinition = {
  // dispose releases everything setup made; a paused preview starts the same definition again.
  restartable: true,
  manifest: {
    id: SPEECH_ID,
    name: { 'zh-CN': '语音服务', en: 'Voice Service' },
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
