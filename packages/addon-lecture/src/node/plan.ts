import { isRecord } from '@lincyaw/kernel'
import type { Finding, IRDocument } from '@lincyaw/kernel'
import { configuredLectureVoice, LECTURE_ID, lectureGap, lecturePlan, lexiconOf, plannedUtterances } from '../domain/index.ts'
import type { LecturePlan, LectureVoice } from '../domain/index.ts'
import { productionDiagnostics } from '../domain/production.ts'

export interface DeckPlan {
  plan: LecturePlan
  voice?: LectureVoice
  silent: boolean
  lang: string
  lexicon?: Record<string, string>
  gap: number
  findings: Finding[]
}

export function lectureConfig(doc: IRDocument): Record<string, unknown> {
  const config = doc.config.renderers.lecture
  return isRecord(config) ? config : {}
}

export function deckPlan(doc: IRDocument): DeckPlan {
  const config = lectureConfig(doc)
  const findings: Finding[] = []
  const plan = lecturePlan(doc)
  findings.push(...plan.problems.filter(p => !p.reportedAtCompile).map((p): Finding => ({ checkId: LECTURE_ID, severity: 'warning', message: p.message, ...p.source ? { source: { file: p.source.file, line: p.source.line } } : {} })))
  findings.push(...productionDiagnostics(doc, plan).map(issue => ({ checkId: LECTURE_ID, severity: issue.severity, message: issue.message, source: issue.sectionId ? doc.sections.find(section => section.id === issue.sectionId)?.source : { file: doc.meta.entry, line: 1 } })))
  const silent = plannedUtterances(plan).length === 0 || Boolean(doc.production && [doc.production.defaults, ...Object.values(doc.production.sectionOverrides ?? {}), ...Object.values(doc.production.stepOverrides)].some(setting => setting.voiceSource?.type === 'none'))
  const own = doc.config.presmium[LECTURE_ID]
  const voice = configuredLectureVoice(doc)
  const lexicon = lexiconOf(isRecord(own) ? own : undefined)
  return { plan, silent, ...voice ? { voice } : {}, lang: doc.meta.lang ?? 'zh-CN', ...lexicon ? { lexicon } : {}, gap: lectureGap(config), findings }
}
