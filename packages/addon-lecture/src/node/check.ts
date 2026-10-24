import { errorMessage, SPEECH } from '@lincyaw/kernel'
import type { Check, CheckContext, Finding, IRDocument, Severity } from '@lincyaw/kernel'
import { blockOf, clockText, eventDrift, eventLine, LECTURE_ID, plannedUtterances, unchanged } from '../domain/index.ts'
import type { EventDrift } from '../domain/index.ts'
import { synthesisEngine } from './engines.ts'
import { lectureView } from './latest-ir.ts'
import { deckPlan } from './plan.ts'
import { readTrack, trackIds } from './store.ts'
import { synthesizeClip } from './synthesize.ts'

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
  const deck = deckPlan(view, ctx.deckDir)
  const findings = [...deck.findings]
  if (!deck.voice) return findings
  const speech = ctx.service?.(SPEECH)
  const source = { file: ctx.ir.meta.entry, line: 1 }
  if (!speech) {
    findings.push({ checkId: LECTURE_ID, severity: 'error', message: 'renderers.lecture.voice: the lecture is said through the speech service, which no plugin provides; add @lincyaw/addon-speech to plugins', source })
    return findings
  }
  if (await synthesisEngine(speech, view, deck.voice.engine).catch(() => undefined)) return findings
  for (const u of plannedUtterances(deck.plan)) {
    try {
      await synthesizeClip(speech, u, { voice: deck.voice, lang: deck.lang, ...deck.lexicon ? { lexicon: deck.lexicon } : {}, alignByTranscription: false })
    } catch (error) {
      const text = u.text.length > 40 ? `${u.text.slice(0, 40)}…` : u.text
      findings.push({
        checkId: LECTURE_ID,
        severity: 'error',
        message: `the lecture's 「${text}」 (section ${u.section}) cannot be said from the synthesis cache, and no speech engine can synthesize it: ${errorMessage(error)}`,
        source: u.source ? { file: u.source.file, line: u.source.line } : source,
        hint: 'define the engine of the voice (PRESMIUM_SPEECH_<ID>_URL and _PROVIDER) and build once, then commit .presmium/speech/',
      })
    }
  }
  return findings
}

export const lectureCheck: Check = {
  id: LECTURE_ID,
  run: async ctx => [...trackIds(ctx.deckDir).flatMap(id => trackFindings(ctx.deckDir, id, ctx.ir)), ...await planFindings(ctx)],
}
