import { isRecord } from '@lincyaw/kernel'
import type { Finding, IRDocument } from '@lincyaw/kernel'
import { configuredLectureVoice, LECTURE_ID, lectureGap, lecturePlan, lexiconOf } from '../domain/index.ts'
import type { LecturePlan, LectureVoice } from '../domain/index.ts'
import { readScriptFile } from './script-file.ts'

export interface DeckPlan {
  plan: LecturePlan
  voice?: LectureVoice
  lang: string
  lexicon?: Record<string, string>
  gap: number
  findings: Finding[]
}

export function lectureConfig(doc: IRDocument): Record<string, unknown> {
  const config = doc.config.renderers.lecture
  return isRecord(config) ? config : {}
}

export function deckPlan(doc: IRDocument, deckDir: string): DeckPlan {
  const config = lectureConfig(doc)
  const findings: Finding[] = []
  let scriptFile
  if (typeof config.script === 'string' && config.script) {
    const read = readScriptFile(deckDir, config.script)
    findings.push(...read.findings)
    scriptFile = read.sections
  }
  const plan = lecturePlan(doc, scriptFile)
  findings.push(...plan.problems.filter(p => !p.reportedAtCompile).map((p): Finding => ({ checkId: LECTURE_ID, severity: 'warning', message: p.message, ...p.source ? { source: { file: p.source.file, line: p.source.line } } : {} })))
  if (doc.production?.mediaClips.length) findings.push({ checkId: LECTURE_ID, severity: 'error', message: 'Production media clips are retained, but this runtime cannot yet mix or trim them. Lecture export is unavailable for this production.', source: { file: doc.meta.entry, line: 1 } })
  for (const section of plan.sections) if (section.trailingPauseMs && section.paragraphs.some(paragraph => paragraph.pieces.some(piece => piece.cues.some(cue => cue.name === 'next')))) findings.push({ checkId: LECTURE_ID, severity: 'error', message: `Section ${section.id}: step trailing pauses cannot yet be placed inside narration audio that advances with a next cue. Split the narration into step-bound entries before exporting this production.`, source: { file: doc.meta.entry, line: 1 } })
  const own = doc.config.presmium[LECTURE_ID]
  const voice = configuredLectureVoice(doc)
  const lexicon = lexiconOf(isRecord(own) ? own : undefined)
  return { plan, ...voice ? { voice } : {}, lang: doc.meta.lang ?? 'zh-CN', ...lexicon ? { lexicon } : {}, gap: lectureGap(config), findings }
}
