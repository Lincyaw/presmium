/**
 * The lecture plan of a deck (docs/ir.md 2.9, 6.3), from its IR and the
 * configuration of the `lecture` renderer: the voice (synthesis is on when
 * `renderers.lecture.voice` names one), the separate script, the gap, and
 * the lexicon of `presmium.lecture`. Every plan is made from the view of
 * the IR the `lecture` renderer gets in a build (`lectureView`), so the
 * check, the build, the server and the agent tools plan alike. The server's
 * routes and the agent tools plan from the latest IR the deck compiled in
 * this process, which a pass keeps (`presmium dev` and `presmium serve`
 * compile before they serve): the whole deck.
 */
import { resolve } from 'node:path'
import { viewFor } from '@presmium/compiler'
import { isRecord } from '@presmium/kernel'
import type { Finding, IRDocument, IRPass } from '@presmium/kernel'
import { LECTURE_ID, lectureGap, lecturePlan, lectureVoice, lexiconOf } from '../domain/index.ts'
import type { LecturePlan, LectureVoice } from '../domain/index.ts'
import { readScript } from './script.ts'
import { trackIds } from './store.ts'

export interface DeckPlan {
  plan: LecturePlan
  /** The voice to synthesize with; undefined when the deck names none (no synthesized lecture). */
  voice?: LectureVoice
  lang: string
  lexicon?: Record<string, string>
  gap: number
  /** The problems of the plan and of the script, as findings of `presmium.lecture` (not those the compiler reported, `PlanProblem.compiled`). */
  findings: Finding[]
}

/** The id of the lecture plugin's renderer. */
export const LECTURE_RENDERER = 'lecture'

const views = new WeakMap<IRDocument, IRDocument>()

/** The view of a document the `lecture` renderer gets in a build (`viewFor`): the same object for the same IR. */
export function lectureView(doc: IRDocument): IRDocument {
  let view = views.get(doc)
  if (!view) views.set(doc, view = viewFor(doc, LECTURE_RENDERER))
  return view
}

/** The configuration of the `lecture` renderer of a document. */
export function lectureConfig(doc: IRDocument): Record<string, unknown> {
  const config = doc.config.renderers.lecture
  return isRecord(config) ? config : {}
}

/** The plan of a deck: of `doc`, the lecture renderer's view of the IR (`lectureView`). */
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

/** The latest IR each deck (by directory) compiled in this process. */
const latest = new Map<string, IRDocument>()

/** The latest IR of a deck compiled in this process; undefined before its first compilation. */
export function latestDoc(deckDir: string): IRDocument | undefined {
  return latest.get(deckDir)
}

/** The lecture renderer's view of the latest IR of a deck (what a build would plan from). */
export function latestView(deckDir: string): IRDocument | undefined {
  const doc = latest.get(deckDir)
  return doc && lectureView(doc)
}

/**
 * Keeps each compiled IR of the deck (not those of its translations, which
 * compile as files of its directory), with the recorded outputs (after
 * compile-time execution) for `run` cues; and says in
 * `presmium.lecture.lectures` whether the deck publishes lectures, so a
 * static web form offers its lecture view only then (P-131): lectures
 * published elsewhere (`presmium.lecture.url`), or a voice that says its plan
 * or a recorded lecture where the deck's build runs the lecture renderer (it
 * names it among its `renderers`, or names none: the build then runs every
 * renderer installed, as the web form's link to the slides assumes).
 */
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
    // A copy: the configuration may be the headmatter's own object.
    doc.config.presmium = { ...doc.config.presmium, [LECTURE_ID]: { ...own, lectures } }
  },
}
