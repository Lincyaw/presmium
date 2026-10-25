import { resolve } from 'node:path'
import { viewFor } from '@lincyaw/compiler'
import { isRecord } from '@lincyaw/kernel'
import type { IRDocument, IRPass } from '@lincyaw/kernel'
import { configuredLectureVoice, LECTURE_ID, LECTURE_RENDERER, prepareNarrationVoices } from '../domain/index.ts'
import { trackIds } from './store.ts'

const views = new WeakMap<IRDocument, IRDocument>()

export function lectureView(doc: IRDocument): IRDocument {
  let view = views.get(doc)
  if (!view) views.set(doc, view = viewFor(doc, LECTURE_RENDERER))
  return view
}

const latest = new Map<string, IRDocument>()

export function latestDoc(deckDir: string): IRDocument | undefined {
  return latest.get(deckDir)
}

export function latestView(deckDir: string): IRDocument | undefined {
  const doc = latest.get(deckDir)
  return doc && lectureView(doc)
}

function rememberLatestIr(doc: IRDocument, deckDir: string): void {
  const remembered = latest.get(deckDir)
  const translation = Boolean(doc.meta.translationOf) || Object.values(remembered?.config.translations ?? {}).some(entry => resolve(deckDir, entry) === doc.meta.entry)
  if (!translation) latest.set(deckDir, doc)
}

function writeLecturesFlag(doc: IRDocument, deckDir: string): void {
  const own = isRecord(doc.config.presmium[LECTURE_ID]) ? doc.config.presmium[LECTURE_ID] as Record<string, unknown> : {}
  const renderers = Object.keys(doc.config.renderers)
  const built = renderers.length === 0 || renderers.includes(LECTURE_RENDERER)
  const lectures = typeof own.url === 'string' || (built && (Boolean(configuredLectureVoice(doc)) || trackIds(deckDir).length > 0))
  doc.config.presmium = { ...doc.config.presmium, [LECTURE_ID]: { ...own, lectures } }
}

export const rememberLatestIrPass: IRPass = {
  name: 'presmium.lecture.keep',
  after: 'execute',
  order: 1000,
  run(doc, ctx) {
    try { prepareNarrationVoices(doc) } catch (error) {
      ctx.report({ checkId: LECTURE_ID, severity: 'error', message: error instanceof Error ? error.message : String(error), source: { file: doc.meta.entry, line: 1 } })
    }
    rememberLatestIr(doc, ctx.deckDir)
    writeLecturesFlag(doc, ctx.deckDir)
  },
}
