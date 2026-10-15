import type { PresmiumNodePlugin } from '@presmium/kernel'
import { regionResolver } from '../domain/index.ts'
import { codeChecks, usages } from './checks.ts'
import { symbolResolver } from './symbol.ts'
import { transformCodeRefs } from './transform.ts'

/** Code references (P-10..P-16): `region` and `symbol` anchors, checks and the `coderef` block syntax. */
const plugin: PresmiumNodePlugin = {
  id: 'presmium.code',
  resolvers: [regionResolver, symbolResolver],
  checks: codeChecks,
  async anchors(ctx) {
    return (await usages(ctx)).flatMap(u => (u.spec ? [u.spec.anchor] : []))
  },
  transformMarkdown: transformCodeRefs,
}

export default plugin
