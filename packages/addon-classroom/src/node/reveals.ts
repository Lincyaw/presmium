import { deckLocale, docBlocks } from '@lincyaw/kernel'
import type { IRPass } from '@lincyaw/kernel'
import { CLASSROOM_ID, MESSAGES } from '../domain/index.ts'
import { isPredict } from './components.ts'

/** Predictions consume authored child identities and their explicit step visibility. */
export const revealsPass: IRPass = {
  name: 'presmium.classroom.predict-reveals',
  order: -1,
  run(doc, ctx) {
    const t = MESSAGES[deckLocale(ctx.lang)].predict
    for (const { block } of docBlocks(doc)) {
      const { node } = block
      if (!isPredict(node)) continue
      const children = new Set(node.children?.map(child => child.id) ?? [])
      for (const property of ['reveal', 'notes'] as const) {
        const targets = node.props[property]
        if (targets === undefined) continue
        if (!Array.isArray(targets) || targets.some(target => typeof target !== 'string') || new Set(targets).size !== targets.length) {
          ctx.report({ checkId: CLASSROOM_ID, severity: 'error', message: t.invalidTargets(property), source: block.source })
          continue
        }
        for (const target of targets) if (!children.has(target)) ctx.report({
          checkId: CLASSROOM_ID, severity: 'error', message: t.missingTarget(property, target, block.id), source: block.source,
        })
      }
    }
  },
}
