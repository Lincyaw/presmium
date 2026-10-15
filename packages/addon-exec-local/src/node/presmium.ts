import type { PresmiumNodePlugin } from '@presmium/kernel'
import { EXEC_LOCAL_ID } from '../domain/index.ts'

/**
 * The local environment works through dev-server endpoints (see ./server.ts,
 * registered by setup/vite-plugins.ts); it adds no resolvers, checks or transforms.
 */
const plugin: PresmiumNodePlugin = { id: EXEC_LOCAL_ID }

export default plugin
