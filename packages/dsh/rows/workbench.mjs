// The presmium-workbench row (web carrier): src/node/workbench.ts; its client half is the package's `./client`, the
// bundle build/client.mjs makes (docs/design-dsh.md 6.2 and 7.8). In a checkout the bundle is built first when its
// sources changed (build/ensure.mjs): DeepSeek Harness reads it as the row starts.
import { ensureClient } from '../build/ensure.mjs'
import { load } from './load.mjs'

await ensureClient()
const row = await load('workbench.ts')

export const name = row.name
export const inject = row.inject
export const apply = row.apply
