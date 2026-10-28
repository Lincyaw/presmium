import { deckLocale, errorMessage, SPEECH } from '@lincyaw/kernel'
import type { Check, CheckContext, Finding, IRDocument, Severity } from '@lincyaw/kernel'
import { blockOf, clockText, eventDrift, eventLine, LECTURE_ID, LECTURE_MESSAGES, plannedUtterances, unchanged } from '../domain/index.ts'
import type { EventDrift } from '../domain/index.ts'
import { lectureView } from './latest-ir.ts'
import { deckPlan } from './plan.ts'
import { readTrack, trackIds } from './store.ts'
import { synthesizeClip, synthesizeLecture } from './synthesize.ts'

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

async function planFindings(ctx: CheckContext): Promise<Finding[]> {
  const view = lectureView(ctx.ir)
  const deck = deckPlan(view)
  const findings = [...deck.findings]
  const prepared = view.production?.mediaClips.length || Object.keys(view.production?.captionTimings ?? {}).length || deck.recorded ? await synthesizeLecture(view, ctx.deckDir, ctx.service?.(SPEECH), undefined, { cacheOnly: true }) : undefined
  findings.push(...(prepared?.mediaDiagnostics ?? []).map(issue => ({ checkId: LECTURE_ID, severity: issue.severity, message: issue.message, source: { file: ctx.ir.meta.entry, line: 1 } })))
  findings.push(...(prepared?.captionDiagnostics ?? []).map(issue => ({ checkId: LECTURE_ID, severity: issue.severity, message: issue.message, source: { file: ctx.ir.meta.entry, line: 1 } })))
  if (!deck.voice) return findings
  const speech = ctx.service?.(SPEECH)
  const source = { file: ctx.ir.meta.entry, line: 1 }, t = LECTURE_MESSAGES[deckLocale(ctx.ir.meta.lang)].production
  if (!speech) {
    findings.push({ checkId: LECTURE_ID, severity: 'error', message: t.missingSpeech, source })
    return findings
  }
  for (const u of plannedUtterances(deck.plan)) {
    if (u.sourceKind === 'none' || u.sourceKind === 'recording') continue
    try {
      if (u.voiceIssue) throw new Error(u.voiceIssue)
      if (prepared) { const failure = prepared.failures.find(failure => failure.id === u.id); if (failure) throw new Error(failure.reason) }
      else await synthesizeClip(speech, u, { voice: u.voice ?? deck.voice, lang: deck.lang, ...deck.lexicon ? { lexicon: deck.lexicon } : {}, cacheOnly: true })
    } catch (error) {
      const text = u.text.length > 40 ? `${u.text.slice(0, 40)}…` : u.text
      findings.push({
        checkId: LECTURE_ID,
        severity: 'error',
        message: t.cacheMissing(text, u.section, errorMessage(error)),
        source: u.source ? { file: u.source.file, line: u.source.line } : source,
        hint: t.generateHint,
      })
    }
  }
  return findings
}

export const lectureCheck: Check = {
  id: LECTURE_ID,
  run: async ctx => [...trackIds(ctx.deckDir).flatMap(id => trackFindings(ctx.deckDir, id, ctx.ir)), ...await planFindings(ctx)],
}
