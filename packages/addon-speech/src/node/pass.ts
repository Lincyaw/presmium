/**
 * Reports what is wrong with the deck's `presmium.speech` (../domain/config.ts):
 * engine definitions in a deck (`url`, `keyEnv`, …) are error diagnostics
 * and are not used, so `presmium check` and `presmium build` fail on them.
 */
import { readFileSync } from 'node:fs'
import type { IRPass } from '@presmium/kernel'
import { deckSpeechConfig, SPEECH_ID } from '../domain/index.ts'

/** The headmatter line that names `presmium.speech`, else the first. */
function configLine(file: string): number {
  try {
    const index = readFileSync(file, 'utf8').split('\n').findIndex(line => /presmium\.speech\b/.test(line))
    return index >= 0 ? index + 1 : 1
  } catch {
    return 1
  }
}

export const speechConfigPass: IRPass = {
  name: 'presmium.speech.config',
  run(doc, ctx) {
    const { problems } = deckSpeechConfig(ctx.config)
    if (problems.length === 0) return
    const source = { file: doc.meta.entry, line: configLine(doc.meta.entry) }
    for (const { severity, message } of problems) ctx.report({ checkId: SPEECH_ID, severity, message, source })
  },
}
