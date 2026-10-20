import { resolve } from 'node:path'
import { viewFor } from '@lincyaw/compiler'
import { isRecord } from '@lincyaw/kernel'
import type { Finding, IRDocument, IRPass } from '@lincyaw/kernel'
import { LECTURE_ID, lectureGap, lecturePlan, lectureVoice, lexiconOf } from '../domain/index.ts'
import type { LecturePlan, LectureVoice } from '../domain/index.ts'
import { readScript } from './script.ts'
import { trackIds } from './store.ts'

export interface DeckPlan {
  plan: LecturePlan
  voice?: LectureVoice
  lang: string
  lexicon?: Record<string, string>
  gap: number
  findings: Finding[]
}

export const LECTURE_RENDERER = 'lecture'

const views = new WeakMap<IRDocument, IRDocument>()

export function lectureView(doc: IRDocument): IRDocument {
  let view = views.get(doc)
  if (!view) views.set(doc, view = viewFor(doc, LECTURE_RENDERER))
  return view
}

export function lectureConfig(doc: IRDocument): Record<string, unknown> {
  const config = doc.config.renderers.lecture
  return isRecord(config) ? config : {}
}

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
  findings.push(...plan.problems.filter(p => !p.compiled).map((p): Finding => ({ checkId: LECTURE_ID, severity: 'warning', message: p.message, ...p.source ? { source: { file: p.source.file, line: p.source.line } } : {} })))
  const own = doc.config.presmium[LECTURE_ID]
  const voice = lectureVoice(config)
  const lexicon = lexiconOf(isRecord(own) ? own : undefined)
  return { plan, ...voice ? { voice } : {}, lang: doc.meta.lang ?? 'zh-CN', ...lexicon ? { lexicon } : {}, gap: lectureGap(config), findings }
}

const latest = new Map<string, IRDocument>()

export function latestDoc(deckDir: string): IRDocument | undefined {
  return latest.get(deckDir)
}

export function latestView(deckDir: string): IRDocument | undefined {
  const doc = latest.get(deckDir)
  return doc && lectureView(doc)
}

export const keepPass: IRPass = {
  name: 'presmium.lecture.keep',
  after: 'execute',
  order: 1000,
  run(doc, ctx) {
    const kept = latest.get(ctx.deckDir)
    const translation = Boolean(doc.meta.translationOf) || Object.values(kept?.config.translations ?? {}).some(entry => resolve(ctx.deckDir, entry) === doc.meta.entry)
    if (!translation) latest.set(ctx.deckDir, doc)
    const own = isRecord(doc.config.presmium[LECTURE_ID]) ? doc.config.presmium[LECTURE_ID] as Record<string, unknown> : {}
    const renderers = Object.keys(doc.config.renderers)
    const built = renderers.length === 0 || renderers.includes(LECTURE_RENDERER)
    const lectures = typeof own.url === 'string' || (built && (Boolean(lectureVoice(lectureConfig(doc))) || trackIds(ctx.deckDir).length > 0))
    doc.config.presmium = { ...doc.config.presmium, [LECTURE_ID]: { ...own, lectures } }
  },
}
