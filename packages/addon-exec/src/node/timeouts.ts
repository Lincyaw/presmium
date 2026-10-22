import { docBlocks } from '@lincyaw/kernel'
import type { IRPass } from '@lincyaw/kernel'
import { configuredTimeout } from '../domain/index.ts'

/** Code blocks without their own timeout take the one their section configures. */
export const timeoutPass: IRPass = {
  name: 'presmium.exec.timeouts',
  run(doc, ctx) {
    for (const { section, block: { node } } of docBlocks(doc)) {
      if (node.type !== 'code' || !node.run || node.run.timeoutMs !== undefined) continue
      const timeout = configuredTimeout(ctx.configFor(section))
      if (timeout) node.run.timeoutMs = timeout
    }
  },
}
