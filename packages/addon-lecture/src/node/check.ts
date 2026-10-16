/**
 * The check `presmium.lecture` (docs/ir.md 9.3): each recorded lecture of
 * the deck against the deck as it is now. Events whose block or section is
 * gone are reported with their time (the player drops them), as are blocks
 * that moved or changed and sections whose steps changed.
 */
import { errorMessage } from '@presmium/kernel'
import type { Check, Finding, IRDocument, Severity } from '@presmium/kernel'
import { blockOf, clockText, eventDrift, eventLine, LECTURE_ID, unchanged } from '../domain/index.ts'
import type { EventDrift } from '../domain/index.ts'
import { readTrack, trackIds } from './store.ts'

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

/** The findings of one lecture against the deck. */
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

export const lectureCheck: Check = {
  id: LECTURE_ID,
  run: async ctx => trackIds(ctx.deckDir).flatMap(id => trackFindings(ctx.deckDir, id, ctx.ir)),
}
