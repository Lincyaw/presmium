/**
 * The lecture plan of a deck (docs/ir.md 2.9, 6.3), from its IR and the
 * configuration of the `lecture` renderer: the voice (synthesis is on when
 * `renderers.lecture.voice` names one), the separate script, the gap, and
 * the lexicon of `presmium.lecture`. The server's routes and the agent tools
 * plan from the latest IR the deck compiled in this process, which a pass
 * keeps (`presmium dev` and `presmium serve` compile before they serve).
 */
import { isRecord } from '@presmium/kernel'
import type { Finding, IRDocument, IRPass } from '@presmium/kernel'
import { LECTURE_ID, lectureGap, lecturePlan, lectureVoice, lexiconOf } from '../domain/index.ts'
import type { LecturePlan, LectureVoice } from '../domain/index.ts'
import { readScript } from './script.ts'

export interface DeckPlan {
  plan: LecturePlan
  /** The voice to synthesize with; undefined when the deck names none (no synthesized lecture). */
  voice?: LectureVoice
  lang: string
  lexicon?: Record<string, string>
  gap: number
  /** The problems of the plan and of the script, as findings of `presmium.lecture`. */
  findings: Finding[]
}

/** The configuration of the `lecture` renderer of a document. */
export function lectureConfig(doc: IRDocument): Record<string, unknown> {
  const config = doc.config.renderers.lecture
  return isRecord(config) ? config : {}
}

/** The plan of a deck: of `doc` (the full IR, or the lecture renderer's view of it). */
export function deckPlan(doc: IRDocument, deckDir: string): DeckPlan {
  const config = lectureConfig(doc)
  const findings: Finding[] = []
  let script
  if (typeof config.script === 'string' && config.script) {
    const read = readScript(deckDir, config.script)
    findings.push(...read.findings)
    script = read.sections
  }
  const plan = lecturePlan(doc, script)
  findings.push(...plan.problems.map((p): Finding => ({ checkId: LECTURE_ID, severity: 'warning', message: p.message, ...p.source ? { source: { file: p.source.file, line: p.source.line } } : {} })))
  const own = doc.config.presmium[LECTURE_ID]
  const voice = lectureVoice(config)
  const lexicon = lexiconOf(isRecord(own) ? own : undefined)
  return { plan, ...voice ? { voice } : {}, lang: doc.meta.lang ?? 'zh-CN', ...lexicon ? { lexicon } : {}, gap: lectureGap(config), findings }
}

/** The latest IR each deck (by directory) compiled in this process. */
const latest = new Map<string, IRDocument>()

/** The latest IR of a deck compiled in this process; undefined before its first compilation. */
export function latestDoc(deckDir: string): IRDocument | undefined {
  return latest.get(deckDir)
}

/** Keeps each compiled IR, with the recorded outputs (after compile-time execution) for `run` cues. */
export const keepPass: IRPass = {
  name: 'presmium.lecture.keep',
  after: 'execute',
  order: 1000,
  run(doc, ctx) {
    latest.set(ctx.deckDir, doc)
  },
}
