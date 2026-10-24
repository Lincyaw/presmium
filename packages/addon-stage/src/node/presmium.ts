import { createRequire } from 'node:module'
import type { PresmiumNodePlugin } from '@lincyaw/kernel'
import { DRAWINGS_ROUTE, placeFootnotes, STAGE_ID } from '../domain/index.ts'
import { drawingsRoute } from './drawings.ts'

const { version } = createRequire(import.meta.url)('../../package.json') as { version: string }

const plugin: PresmiumNodePlugin = {
  id: STAGE_ID,
  version,
  kernel: '^1.0.0',
  passes: [{ name: 'presmium.stage.footnotes', run: doc => placeFootnotes(doc) }],
  server: ctx => ({ routes: { [`${DRAWINGS_ROUTE}/*`]: drawingsRoute(ctx) } }),
}

export default plugin
