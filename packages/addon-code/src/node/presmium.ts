import { createRequire } from 'node:module'
import type { PresmiumNodePlugin } from '@lincyaw/kernel'
import { CODE_ID, regionResolver } from '../domain/index.ts'
import { codeRefDirective } from './directive.ts'
import { codeRefAnchors, codeRefPass } from './resolve.ts'
import { patternResolver, symbolResolver } from './symbol.ts'

const { version } = createRequire(import.meta.url)('../../package.json') as { version: string }

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
