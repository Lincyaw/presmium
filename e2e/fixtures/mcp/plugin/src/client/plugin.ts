// Registers a status summary with the host's `STATUS` (e2e/mcp.spec.ts), as the classroom plugins do:
// the page reports it over the control channel and MCP's get_classroom returns it. It imports nothing
// at run time: service tokens are matched by id.
import type { PluginDefinition, ServiceToken } from '../../../../../../packages/kernel/src/contracts.ts'
import type { StatusRegistry } from '../../../../../../packages/host/src/types.ts'

const STATUS = { id: 'presmium.status' } as ServiceToken<StatusRegistry>

let unregister: (() => void) | undefined

const status: PluginDefinition = {
  manifest: { id: 'fixture.mcp.status', version: '0.1.0', kernel: '^1.0.0', requires: [{ token: STATUS, optional: true }] },
  setup(ctx) {
    unregister = ctx.tryGet(STATUS)?.register({ id: 'fixture.mcp', read: () => ({ answered: 3, question: '哪一对先合并？' }) })
  },
  dispose() {
    unregister?.()
    unregister = undefined
  },
}

export default status
