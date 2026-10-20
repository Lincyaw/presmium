// @ts-nocheck: @lincyaw/host resolves from the workspace the tests make (its node_modules link it), not from e2e/.
// The slides form registers a package's kernel plugins from its Slidev setup; the web form loads src/client/plugin.ts itself.
import { registerPresmiumPlugin } from '@lincyaw/host'
import plugins from '../src/client/plugin.ts'

export default () => {
  plugins.forEach(registerPresmiumPlugin)
}
