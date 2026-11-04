import { deckLocale, errorMessage, SPEECH } from '@lincyaw/kernel'
import type { Check, CheckContext, Finding, IRDocument, ProductionPlan, Severity } from '@lincyaw/kernel'
import { blockOf, clockText, eventDrift, eventLine, LECTURE_ID, LECTURE_MESSAGES, lectureTiming, maximumDuration, missingVoiceover, overLimit, plannedUtterances, unchanged } from '../domain/index.ts'
import type { EventDrift } from '../domain/index.ts'
import { lectureView } from './latest-ir.ts'
import { deckPlan, lectureConfig } from './plan.ts'
import { cachedProduction } from './production.ts'
import { readTrack, trackIds } from './store.ts'
import { synthesizeClip, synthesizeLecture } from './synthesize.ts'
import type { SynthesizedLecture } from './synthesize.ts'

const SEVERITY: Record<EventDrift['grade'], Severity> = { exact: 'info', moved: 'info', fuzzy: 'warning', lost: 'warning' }

const HINTS: Partial<Record<EventDrift['grade'], string>> = {
  lost: 'playback skips this event; give blocks a lecture refers to a label, or record the section again',
  moved: 'playback follows the block to its new place',
}

function what(type: string, drift: EventDrift): string {
  const target = drift.block ?? (typeof drift.data.section === 'string' ? `section ${drift.data.section}` : '')
  switch (drift.reason) {
    case 'section': return `${type} goes to ${target}, which the deck no longer has (lost)`
    case 'steps': return `${type} goes to step ${String(drift.data.step)} of ${target}, which has fewer steps now`
    case 'lines': return `${type} on ${target} names lines (${String(drift.data.lines ?? drift.data.line)}) the block no longer has (lost)`
    case 'at': return `${type} is bound to utterance ${String((drift.data.at as unknown[])[0])}, which the track no longer has`
    default:
      if (drift.grade === 'moved') return `${type} on ${target}: the block moved to ${blockOf(drift.data)}`
      if (drift.grade === 'fuzzy') return `${type} on ${target}: the block changed since the recording (fuzzy)`
      return `${type} on ${target}, which the deck no longer has (lost)`
  }
}

export function trackFindings(deckDir: string, id: string, doc: IRDocument): Finding[] {
  let stored
  try {
    stored = readTrack(deckDir, id)
  } catch (error) {
    return [{ checkId: LECTURE_ID, severity: 'error', message: `lecture ${id}: ${errorMessage(error)}` }]
  }
  if (!stored) return []
  const { track, text, file, problems } = stored
  const findings: Finding[] = problems.map(message => ({ checkId: LECTURE_ID, severity: 'warning', message: `lecture ${id}: ${message}`, source: { file } }))
  if (unchanged(track, doc)) return findings
  for (const drift of eventDrift(track, doc)) {
    if (drift.grade === 'exact') continue
    const [t, type] = track.events[drift.index]!
    findings.push({
      checkId: LECTURE_ID,
      severity: SEVERITY[drift.grade],
      message: `lecture ${id} at ${clockText(t)} (${t} ms): ${what(type, drift)}`,
      source: { file, line: eventLine(text, drift.index) },
      ...HINTS[drift.grade] ? { hint: HINTS[drift.grade] } : {},
    })
  }
  return findings
}

/** How the author knows a page: its title, or its id when it has none. */
function pageTitle(doc: IRDocument, section: string): string {
  return doc.sections.find(s => s.id === section)?.title || section
}

/** The lecture video against `maximumDurationMs`: an error when its confirmed length is over it. */
function lengthFindings(ctx: CheckContext, plan: Omit<ProductionPlan, 'binding'>, limit: number): Finding[] {
  const timing = lectureTiming(ctx.ir, plan), over = plan.timing === 'confirmed' ? overLimit(timing, limit) : undefined
  if (!over) return []
  const t = LECTURE_MESSAGES[deckLocale(ctx.ir.meta.lang)].timing
  const cut = over.cut && timing.rate ? { rate: timing.rate.toFixed(1), characters: over.cut } : undefined
  return [{ checkId: LECTURE_ID, severity: 'error', message: t.tooLong(clockText(timing.durationMs!), clockText(limit), (over.overMs / 1000).toFixed(1), cut), source: { file: ctx.ir.meta.entry, line: 1 } }]
}

async function planFindings(ctx: CheckContext): Promise<Finding[]> {
  const view = lectureView(ctx.ir)
  const deck = deckPlan(view)
  const findings = [...deck.findings]
  const source = { file: ctx.ir.meta.entry, line: 1 }, messages = LECTURE_MESSAGES[deckLocale(ctx.ir.meta.lang)], t = messages.production
  const limit = maximumDuration(lectureConfig(ctx.ir))
  if (limit === 'invalid') findings.push({ checkId: LECTURE_ID, severity: 'error', message: messages.timing.limitInvalid, source })
  let prepared: SynthesizedLecture | undefined
  if (typeof limit === 'number') {
    // Missing voiceover leaves the length estimated: the findings below say so, and the length is checked once it is generated.
    const production = await cachedProduction(ctx.ir, ctx.deckDir, ctx.service?.(SPEECH)).catch(() => undefined)
    if (production) findings.push(...lengthFindings(ctx, production.projected, limit))
    prepared = production?.made
  }
  if (!prepared && (view.production?.mediaClips.length || Object.keys(view.production?.captionTimings ?? {}).length || deck.recorded)) prepared = await synthesizeLecture(view, ctx.deckDir, ctx.service?.(SPEECH), undefined, { cacheOnly: true })
  findings.push(...(prepared?.mediaDiagnostics ?? []).map(issue => ({ checkId: LECTURE_ID, severity: issue.severity, message: issue.message, source })))
  findings.push(...(prepared?.captionDiagnostics ?? []).map(issue => ({ checkId: LECTURE_ID, severity: issue.severity, message: issue.message, source })))
  if (!deck.voice) return findings
  const speech = ctx.service?.(SPEECH)
  if (!speech) {
    findings.push({ checkId: LECTURE_ID, severity: 'error', message: t.missingSpeech, source })
    return findings
  }
  const missing: { section: string, reason: string, source: { file: string, line?: number } }[] = []
  for (const u of plannedUtterances(deck.plan)) {
    if (u.sourceKind === 'none' || u.sourceKind === 'recording') continue
    try {
      if (u.voiceIssue) throw new Error(u.voiceIssue)
      if (prepared) { const failure = prepared.failures.find(failure => failure.id === u.id); if (failure) throw new Error(failure.reason) }
      else await synthesizeClip(speech, u, { voice: u.voice ?? deck.voice, lang: deck.lang, ...deck.lexicon ? { lexicon: deck.lexicon } : {}, cacheOnly: true })
    } catch (error) {
      missing.push({ section: pageTitle(ctx.ir, u.section), reason: errorMessage(error), source: u.source ? { file: u.source.file, line: u.source.line } : source })
    }
  }
  for (const group of missingVoiceover(missing)) {
    findings.push({
      checkId: LECTURE_ID,
      severity: 'error',
      message: t.cacheMissing(group.count, group.pages, t.reasons[group.reason] ?? t.reasonGeneric),
      source: group.source ?? source,
      hint: t.generateHint,
    })
  }
  return findings
}

export const lectureCheck: Check = {
  id: LECTURE_ID,
  run: async ctx => [...trackIds(ctx.deckDir).flatMap(id => trackFindings(ctx.deckDir, id, ctx.ir)), ...await planFindings(ctx)],
}
