import { readFileSync } from 'node:fs'
import { Compiler } from '@lincyaw/compiler'
import { isRecord, SPEECH } from '@lincyaw/kernel'
import type { IRDocument } from '@lincyaw/kernel'
import { lectureTiming, maximumDuration } from '../domain/index.ts'
import type { LectureTiming } from '../domain/index.ts'
import { lectureConfig } from './plan.ts'
import { cachedProduction } from './production.ts'

/** The steps' titles, by stable ID, from the document's source: the runtime snapshot does not carry them. */
export function stepTitles(entry: string): Map<string, string> {
  let steps: unknown
  try {
    steps = (JSON.parse(readFileSync(entry, 'utf8')) as { steps?: unknown }).steps
  } catch {
    return new Map()
  }
  return new Map(isRecord(steps) ? Object.entries(steps).flatMap(([id, step]) => isRecord(step) && typeof step.title === 'string' && step.title ? [[id, step.title] as const] : []) : [])
}

export interface TimingReport {
  doc: IRDocument
  timing: LectureTiming
  titles: Map<string, string>
  limit?: number | 'invalid'
}

/** The lecture's timing from its cache-only production plan, the one `presmium-lecture export` plays. */
export async function timingReport(deckDir: string): Promise<TimingReport> {
  const compilation = await new Compiler(deckDir).compile()
  const { projected } = await cachedProduction(compilation.doc, compilation.deckDir, compilation.service(SPEECH))
  const limit = maximumDuration(lectureConfig(compilation.doc))
  return { doc: compilation.doc, timing: lectureTiming(compilation.doc, projected), titles: stepTitles(compilation.entry), ...limit !== undefined ? { limit } : {} }
}
