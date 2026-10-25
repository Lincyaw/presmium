import { documentVoice, hasRole, isRecord, jsonResponse, resolvedVoice, speechVoice, stepVoiceReason, voiceOverrides, voiceTarget } from '@lincyaw/kernel'
import type { IRDocument, RequestContext, Route, SpeechVoice, VoiceScope, VoiceSettingsAnswer, VoiceSettingsChange, VoiceSettingsUpdate, VoiceTarget } from '@lincyaw/kernel'
import { isMap, parseDocument } from 'yaml'
import { RequestError, catchRequestErrors } from './errors.ts'
import type { Revisions } from './revisions.ts'
import type { SourceEditor, SourceTransactionHistory } from './source-editor.ts'
import { saveSummary } from '../domain/commit-message.ts'
import type { WorkbenchApi } from './workbench-api.ts'

interface Options { editor: SourceEditor, workbench: WorkbenchApi, revisions?: Revisions }

function target(value: unknown): value is VoiceTarget {
  return isRecord(value) && typeof value.section === 'string' && Number.isSafeInteger(value.step) && (value.step as number) >= 0 && typeof value.binding === 'string'
}

function scope(value: unknown): value is VoiceScope {
  return isRecord(value) && (value.kind === 'document' || value.kind === 'page' && typeof value.section === 'string' || value.kind === 'step' && target(value.target) || value.kind === 'steps' && Array.isArray(value.targets) && value.targets.length > 0 && value.targets.length <= 500 && value.targets.every(target))
}

function updatedDocument(doc: IRDocument, change: VoiceSettingsUpdate): { doc: IRDocument, updated: number, preserved: number } {
  const overrides = voiceOverrides(doc), before = new Map(doc.sections.flatMap(section => Array.from({ length: section.steps + 1 }, (_, step) => { const found = resolvedVoice(doc, section, step); return [JSON.stringify([section.id, step]), found] as const })))
  let fallback = documentVoice(doc)
  const sectionOf = (id: string) => {
    const section = doc.sections.find(section => section.id === id)
    if (!section) throw new RequestError(409, 'voice-target-changed')
    return section
  }
  const setStep = (at: VoiceTarget, preserve: boolean) => {
    const section = sectionOf(at.section), reason = stepVoiceReason(doc, section)
    if (reason) throw new RequestError(409, `voice-${reason}`)
    if (voiceTarget(section, at.step).binding !== at.binding) throw new RequestError(409, 'voice-step-binding-stale')
    const index = overrides.steps.findIndex(entry => entry.section === at.section && entry.step === at.step)
    if (preserve && index >= 0) return
    if (index >= 0) overrides.steps.splice(index, 1)
    if (change.voice) overrides.steps.push({ ...at, voice: change.voice })
  }
  switch (change.scope.kind) {
    case 'document':
      fallback = change.voice ?? undefined
      if (change.replaceOverrides) { overrides.pages = {}; overrides.steps = [] }
      break
    case 'page': {
      const { section } = change.scope
      sectionOf(section)
      if (change.voice) overrides.pages[section] = change.voice
      else delete overrides.pages[section]
      if (change.replaceOverrides) overrides.steps = overrides.steps.filter(entry => entry.section !== section)
      break
    }
    case 'step': setStep(change.scope.target, false); break
    case 'steps':
      for (const at of change.scope.targets) setStep(at, !change.replaceOverrides)
      break
  }
  const lecture = { ...doc.config.renderers.lecture, voiceOverrides: overrides } as Record<string, unknown>
  if (fallback) lecture.voice = fallback
  else delete lecture.voice
  const next = { ...doc, config: { ...doc.config, renderers: { ...doc.config.renderers, lecture } } }
  const chosenScope = change.scope
  const affected = new Set(chosenScope.kind === 'document' ? [...before.keys()] : chosenScope.kind === 'page' ? [...before.entries()].filter(([, entry]) => entry.target.section === chosenScope.section).map(([key]) => key) : chosenScope.kind === 'step' ? [JSON.stringify([chosenScope.target.section, chosenScope.target.step])] : chosenScope.targets.map(at => JSON.stringify([at.section, at.step])))
  let updated = 0, preserved = 0
  for (const key of affected) {
    const prior = before.get(key)!
    const after = resolvedVoice(next, sectionOf(prior.target.section), prior.target.step)
    if (JSON.stringify([prior.voice, prior.inheritedFrom, prior.override]) !== JSON.stringify([after.voice, after.inheritedFrom, after.override])) updated++
    else if (!change.replaceOverrides && (chosenScope.kind === 'document' && (prior.inheritedFrom === 'page' || prior.inheritedFrom === 'step') || chosenScope.kind === 'page' && prior.inheritedFrom === 'step' || chosenScope.kind === 'steps' && prior.inheritedFrom === 'step')) preserved++
  }
  return { doc: next, updated, preserved }
}

function voiceSource(source: string) {
  const bom = source.startsWith('\uFEFF') ? '\uFEFF' : '', raw = source.slice(bom.length)
  if (/^---[ \t]*\r(?!\n)/.test(raw)) throw new RequestError(409, 'voice-source-format')
  const match = /^---[ \t]*\r?\n(?:([\s\S]*?)\r?\n)?---[ \t]*(?:\r?\n|$)/.exec(raw)
  const yaml = parseDocument(match?.[1] ?? '', { keepSourceTokens: true })
  if (yaml.errors.length || yaml.contents && !isMap(yaml.contents)) throw new RequestError(409, 'voice-source-format')
  for (const path of [['renderers'], ['renderers', 'lecture']]) {
    const node = yaml.getIn(path, true)
    if (node !== undefined && !isMap(node)) throw new RequestError(409, 'voice-source-format')
  }
  return { bom, raw, match, yaml, newline: /\r\n|\n/.exec(source)?.[0] ?? '\n' }
}

/** YAML nodes retain comments and authored values; the body and BOM are sliced verbatim. */
function writeVoiceSettings({ bom, raw, match, yaml, newline }: ReturnType<typeof voiceSource>, doc: IRDocument): string {
  const voice = documentVoice(doc)
  if (voice) yaml.setIn(['renderers', 'lecture', 'voice'], voice)
  else yaml.deleteIn(['renderers', 'lecture', 'voice'])
  yaml.setIn(['renderers', 'lecture', 'voiceOverrides'], voiceOverrides(doc))
  const head = yaml.toString({ lineWidth: 0 }).replace(/\r?\n/g, newline).replace(new RegExp(`${newline}$`), '')
  return `${bom}---${newline}${head}${newline}---${newline}${match ? raw.slice(match[0].length) : raw}`
}

export function voiceSettingsRoutes({ editor, workbench, revisions }: Options): Record<string, Route> {
  const read = async (ctx: RequestContext): Promise<{ answer: VoiceSettingsAnswer, doc: IRDocument, content: string }> => {
    const { doc, revision } = await workbench.ir(ctx.document)
    const source = editor.read(editor.scope(ctx.document), doc.meta.entry, ctx.member)
    const steps = doc.sections.flatMap(section => Array.from({ length: section.steps + 1 }, (_, step) => resolvedVoice(doc, section, step)))
    const { defaultEngine, ...capabilities } = await workbench.voiceCapabilities(ctx.document)
    return { doc, content: source.content, answer: { document: ctx.document, revision, source: { path: source.path, version: source.version }, ...documentVoice(doc) ? { default: documentVoice(doc) } : {}, overrides: voiceOverrides(doc), steps, capabilities, ...defaultEngine ? { defaultEngine } : {} } }
  }
  return {
    'voice-settings': {
      role: 'editor', maxBody: 64 << 10,
      handle: (request, ctx) => catchRequestErrors(async () => {
        const { answer, doc, content } = await read(ctx)
        if (request.method === 'GET') {
          const params = new URL(request.url).searchParams, section = params.get('section'), step = Number(params.get('step') ?? 0)
          const selected = section ? answer.steps.find(entry => entry.target.section === section && entry.target.step === step) : undefined
          return jsonResponse({ ...answer, ...selected ? { selected } : {} })
        }
        if (request.method !== 'POST') return jsonResponse({ error: 'GET or POST' }, 405)
        if (!hasRole(ctx.member, 'editor')) throw new RequestError(403, 'voice-editor-required')
        const body: unknown = await request.json().catch(() => undefined)
        if (!isRecord(body) || typeof body.revision !== 'string' || typeof body.base !== 'string' || !scope(body.scope) || body.voice !== null && !speechVoice(body.voice) || body.apply !== undefined && typeof body.apply !== 'boolean' || body.replaceOverrides !== undefined && typeof body.replaceOverrides !== 'boolean') throw new RequestError(400, 'voice-update-invalid')
        if (body.revision !== answer.revision || body.base !== answer.source.version) throw new RequestError(409, 'voice-source-changed')
        const header = voiceSource(content)
        const change = { ...body, voice: body.voice === null ? null : speechVoice(body.voice) } as VoiceSettingsUpdate
        if (change.voice) {
          const { engines, catalog, engine: chosen } = await workbench.voiceCatalog(ctx.document, change.voice.engine, doc.meta.lang, request.signal)
          if (catalog.status !== 'available') throw new RequestError(409, 'voice-catalog-unavailable')
          if (!catalog.voices.some(voice => voice.id === change.voice!.voice)) throw new RequestError(400, 'voice-unavailable')
          const engine = engines.find(engine => engine.id === chosen)
          if (change.voice.rate !== undefined && (!engine?.parameters?.rate || change.voice.rate < engine.parameters.rate.min || change.voice.rate > engine.parameters.rate.max)) throw new RequestError(400, 'voice-rate-unsupported')
          if (change.voice.style !== undefined && !engine?.parameters?.styles?.includes(change.voice.style)) throw new RequestError(400, 'voice-style-unsupported')
        }
        if ((await workbench.ir(ctx.document)).revision !== answer.revision) throw new RequestError(409, 'voice-source-changed')
        const next = updatedDocument(doc, change)
        const unchanged = JSON.stringify([documentVoice(doc), voiceOverrides(doc)]) === JSON.stringify([documentVoice(next.doc), voiceOverrides(next.doc)])
        const written = unchanged ? content : writeVoiceSettings(header, next.doc)
        const result: VoiceSettingsChange = { ...answer, ...documentVoice(next.doc) ? { default: documentVoice(next.doc) } : { default: undefined }, overrides: voiceOverrides(next.doc), steps: next.doc.sections.flatMap(section => Array.from({ length: section.steps + 1 }, (_, step) => resolvedVoice(next.doc, section, step))), updated: next.updated, preserved: next.preserved, applied: false }
        if (change.apply !== true) return jsonResponse(result)
        if (written === content) return jsonResponse({ ...result, applied: true, sourceVersion: answer.source.version })
        const history: SourceTransactionHistory | undefined = revisions ? {
          run: work => revisions.transaction(work),
          commit: async (paths, lang) => {
            const ignored = (await Promise.all(paths.map(async path => await revisions.ignores(path) ? path : undefined))).filter((path): path is string => path !== undefined)
            if (ignored.length) throw new RequestError(409, 'voice-source-ignored', { ignored })
            return revisions.commitWhileLocked({ paths, summary: saveSummary(paths[0]!, lang), body: '', origin: { kind: 'editor', member: ctx.member } })
          },
        } : undefined
        const saved = await editor.transaction(editor.scope(ctx.document), [{ path: answer.source.path, content: written, base: answer.source.version }], ctx.member, history)
        return jsonResponse({ ...result, applied: true, sourceVersion: saved.versions[0]?.version, ...saved.revision ? { commit: saved.revision } : {} })
      }),
    },
  }
}
