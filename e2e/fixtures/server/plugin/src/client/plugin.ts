// Records the host's operations in the page (`window.fixtureOperations`) and replays one on request
// (`window.fixtureReplay`), as a lecture recorder and player would (e2e/server.spec.ts). It imports
// nothing at run time: service tokens are matched by id.
import type { Operation, PluginDefinition, ServiceToken } from '../../../../../../packages/kernel/src/contracts.ts'
import type { Operations } from '../../../../../../packages/host/src/types.ts'

declare global {
  interface Window {
    fixtureOperations?: Operation[]
    fixtureReplay?: (operation: Operation) => boolean
  }
}

const OPERATIONS = { id: 'presmium.operations' } as ServiceToken<Operations>

const recorder: PluginDefinition = {
  manifest: { id: 'fixture.server.operations', version: '0.1.0', kernel: '^0.1.0', requires: [{ token: OPERATIONS, optional: true }] },
  setup(ctx) {
    const operations = ctx.tryGet(OPERATIONS)
    if (!operations) return
    const recorded: Operation[] = []
    window.fixtureOperations = recorded
    operations.subscribe(operation => recorded.push(operation))
    window.fixtureReplay = operation => operations.replay(operation)
  },
}

export default recorder
