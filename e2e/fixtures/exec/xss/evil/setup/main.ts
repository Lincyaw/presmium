// @ts-nocheck: @presmium/host resolves from the deck the tests build (its node_modules link it), not from e2e/.
// The slides form registers a package's kernel plugins from its Slidev setup.
import { registerPresmiumPlugin } from '@presmium/host'
import plugin from '../src/client/plugin.ts'

export default () => {
  registerPresmiumPlugin(plugin)
}
