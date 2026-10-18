/**
 * The assistant (P-111, P-112; D11, D15; docs/architecture.md 4.8): an
 * operator plugin. Its Node part registers the agent runtime (the ACP
 * client, with DeepSeek Harness bundled, ./services.ts) and serves the task
 * and model settings routes (./server.ts). The page's part (`src/client/`)
 * is the `AGENT` client, "AI changes" with the model settings, and the
 * question panel, which asks the reader's own model service from the
 * browser (`ASK`).
 */
import { createRequire } from 'node:module'
import type { PresmiumNodePlugin } from '@presmium/kernel'
import { ASSISTANT_ID } from '../domain/index.ts'
import { assistantServer } from './server.ts'
import { assistantServices } from './services.ts'

const { version } = createRequire(import.meta.url)('../../package.json') as { version: string }

const plugin: PresmiumNodePlugin = {
  id: ASSISTANT_ID,
  version,
  kernel: '^1.0.0',
  operator: true,
  services: assistantServices,
  server: assistantServer,
}

export default plugin
