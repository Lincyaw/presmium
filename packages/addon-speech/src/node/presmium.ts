import { createRequire } from 'node:module'
import { SPEECH } from '@presmium/kernel'
import type { PresmiumNodePlugin } from '@presmium/kernel'
import { SPEECH_ID } from '../domain/index.ts'
import { speechConfigPass } from './pass.ts'
import { speechServer } from './server.ts'
import { nodeSpeech } from './service.ts'

const { version } = createRequire(import.meta.url)('../../package.json') as { version: string }

const plugin: PresmiumNodePlugin = {
  id: SPEECH_ID,
  version,
  kernel: '^1.0.0',
  operator: true,
  passes: [speechConfigPass],
  services: ctx => [[SPEECH, nodeSpeech(ctx)]],
  server: speechServer,
}

export default plugin
