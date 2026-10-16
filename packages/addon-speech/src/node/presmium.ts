import { createRequire } from 'node:module'
import { SPEECH } from '@presmium/kernel'
import type { PresmiumNodePlugin } from '@presmium/kernel'
import { SPEECH_ID } from '../domain/index.ts'
import { speechGateway } from './gateway.ts'
import { speechConfigPass } from './pass.ts'
import { speechServer } from './server.ts'
import { nodeSpeech } from './service.ts'

const { version } = createRequire(import.meta.url)('../../package.json') as { version: string }

/**
 * Speech (P-132, P-133): the Node `SPEECH` service with the deck's synthesis
 * cache, the speech gateway's routes in `presmium dev` and `presmium serve`,
 * the contribution to `presmium gateway` in SHARED mode, and the check of
 * the deck's `presmium.speech`. An operator plugin: listed in
 * `settings.presmium.workspace.plugins`, every document has speech; a deck
 * of `presmium dev` lists it in `plugins`. The browser side
 * (src/client/plugin.ts) provides `SPEECH` through the gateway's routes.
 */
const plugin: PresmiumNodePlugin = {
  id: SPEECH_ID,
  version,
  kernel: '^0.1.0',
  operator: true,
  passes: [speechConfigPass],
  services: ctx => [[SPEECH, nodeSpeech(ctx)]],
  server: speechServer,
  gateway: speechGateway,
}

export default plugin
