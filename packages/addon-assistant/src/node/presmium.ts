/**
 * The assistant (P-111, P-112; D11, D13, D15; docs/architecture.md 4.8):
 * an operator plugin. Its Node part registers the agent runtime (the ACP
 * client, with DeepSeek Harness bundled, ./services.ts), serves the task
 * routes (./server.ts) and, in the gateway, the model proxy (./gateway.ts).
 * The page's part (`src/client/`) is the `AGENT` client, the question panel
 * of the web form's reading view and of the presenter panels.
 */
import { createRequire } from 'node:module'
import type { PresmiumNodePlugin } from '@presmium/kernel'
import { ASSISTANT_ID } from '../domain/index.ts'
import { assistantGateway } from './gateway.ts'
import { assistantServer } from './server.ts'
import { assistantServices } from './services.ts'

const { version } = createRequire(import.meta.url)('../../package.json') as { version: string }

const plugin: PresmiumNodePlugin = {
  id: ASSISTANT_ID,
  version,
  kernel: '^0.1.0',
  operator: true,
  services: assistantServices,
  server: assistantServer,
  gateway: assistantGateway,
}

export default plugin
