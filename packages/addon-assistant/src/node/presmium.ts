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
