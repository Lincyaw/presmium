import { createRequire } from 'node:module'
import type { PresmiumNodePlugin } from '@presmium/kernel'
import { CODE_ID, regionResolver } from '../domain/index.ts'
import { codeRefDirective } from './directive.ts'
import { codeRefAnchors, codeRefPass } from './resolve.ts'
import { patternResolver, symbolResolver } from './symbol.ts'

const { version } = createRequire(import.meta.url)('../../package.json') as { version: string }

/**
 * Code references (P-10..P-16): the `region`, `symbol` and `pattern` anchors,
 * the `{code-ref}` directive and the pass that resolves it into a code node.
 * The pass reports the anchor, drift and link diagnostics of `presmium check`.
 */
const plugin: PresmiumNodePlugin = {
  id: CODE_ID,
  version,
  kernel: '^1.0.0',
  resolvers: [regionResolver, symbolResolver, patternResolver],
  directives: [codeRefDirective],
  passes: [codeRefPass],
  anchors: ctx => codeRefAnchors(ctx.ir),
}

export default plugin
