/**
 * Drift between a lecture track and the deck as it is now (docs/ir.md 9.3):
 * events refer to sections and blocks, and the track keeps the content
 * fingerprint of each block it refers to, so a block that moved is found
 * again and one that is gone is known. Grades as for anchors: `exact`,
 * `moved` (the same content under another id), `fuzzy` (the block is there
 * but its content changed, or a section has another number of steps),
 * `lost` (gone: the player drops the event).
 */
import { fingerprint, fnv1a64, irBlocks } from '@presmium/kernel'
import type { IRBlock, IRDocument, MdastNode, TrackEvent } from '@presmium/kernel'
import { anchorOf } from './timing.ts'
import type { LectureTrack, TrackBlock } from './track.ts'

export type Grade = 'exact' | 'moved' | 'fuzzy' | 'lost'

/** The renderer the lecture plays in: the web form's IR runtime, whose blocks are those the track refers to. */
const PLAYER_RENDERER = 'web'

/** `<section id>/<block id>`. */
export function blockKey(section: string, block: string): string {
  return `${section}/${block}`
}

/** The block an event's data names: `block` as `<section>/<block>`, or `section` and a bare `block` (as `run` reports it). */
export function blockOf(data: Record<string, unknown>): string | undefined {
  if (typeof data.block !== 'string' || !data.block) return undefined
  if (typeof data.section === 'string' && !data.block.includes('/')) return blockKey(data.section, data.block)
  return data.block.includes('/') ? data.block : undefined
}

/** The text of a Markdown tree; URLs are left out, since each form publishes local files under URLs of its own. */
function text(node: MdastNode | undefined): string {
  if (!node) return ''
  const own = [node.value, node.alt].filter((v): v is string => typeof v === 'string')
  return [...own, ...(node.children ?? []).map(text)].join(' ')
}

/**
 * What a block shows, as text: its code, the text of its Markdown, or a
 * component's name, properties and children. The properties that name local
 * files (`assets`) are left out, as URLs are.
 */
function content(block: IRBlock): string {
  const { node } = block
  if (node.type === 'code') return node.value
  if (node.type === 'markdown') return text(node.mdast)
  const files = new Set(Object.keys(node.assets ?? {}).map(path => path.split('.')[0]))
  const props = Object.fromEntries(Object.entries(node.props).filter(([key]) => !files.has(key)))
  return [node.name, JSON.stringify(props), ...(node.children ?? []).map(content)].join('\n')
}

/** The content fingerprint of a block and, for code, its number of lines. */
export function trackBlock(block: IRBlock): TrackBlock {
  const value = content(block)
  return block.node.type === 'code' ? { fp: fingerprint(value), lines: value.replace(/\n$/, '').split('\n').length } : { fp: fingerprint(value) }
}

/** The blocks of the document the player shows (those of the web form), by key. */
export function playedBlocks(doc: IRDocument): Map<string, TrackBlock> {
  const blocks = new Map<string, TrackBlock>()
  for (const section of doc.sections) {
    for (const block of irBlocks(section.blocks)) {
      if (block.only && !block.only.includes(PLAYER_RENDERER)) continue
      blocks.set(blockKey(section.id, block.id), trackBlock(block))
    }
  }
  return blocks
}

/** A hash of the played blocks' keys and fingerprints: equal hashes mean nothing a track refers to can have drifted. */
export function irHash(doc: IRDocument): string {
  return fnv1a64([...playedBlocks(doc)].map(([key, block]) => `${key}\t${block.fp}`).join('\n'))
}

/** The blocks a list of events refers to, with their fingerprints in `doc`. */
export function referencedBlocks(doc: IRDocument, events: readonly TrackEvent[]): Record<string, TrackBlock> {
  const blocks = playedBlocks(doc)
  const referenced: Record<string, TrackBlock> = {}
  for (const [, , data] of events) {
    const key = blockOf(data)
    const block = key && blocks.get(key)
    if (block) referenced[key] = block
  }
  return referenced
}

export interface BlockDrift {
  grade: Grade
  /** Where a moved block is now. */
  to?: string
}

/** How each block the track refers to stands in `doc`. */
export function blockDrift(track: LectureTrack, doc: IRDocument): Map<string, BlockDrift> {
  const current = playedBlocks(doc)
  const byFingerprint = new Map<string, string[]>()
  for (const [key, block] of current) byFingerprint.set(block.fp, [...byFingerprint.get(block.fp) ?? [], key])
  const keys = new Set([...Object.keys(track.blocks), ...track.events.flatMap(([, , data]) => blockOf(data) ?? [])])
  const drift = new Map<string, BlockDrift>()
  for (const key of keys) {
    const recorded = track.blocks[key]
    const now = current.get(key)
    if (!recorded) {
      drift.set(key, { grade: now ? 'exact' : 'lost' })
      continue
    }
    if (now?.fp === recorded.fp) {
      drift.set(key, { grade: 'exact' })
      continue
    }
    const elsewhere = byFingerprint.get(recorded.fp) ?? []
    if (elsewhere.length === 1) drift.set(key, { grade: 'moved', to: elsewhere[0] })
    else drift.set(key, { grade: now ? 'fuzzy' : 'lost' })
  }
  return drift
}

/** How one event stands, with its data as the player applies it (a moved block's new key). */
export interface EventDrift {
  index: number
  grade: Grade
  /** Why it is not exact: the block (`block`), the section or its steps (`section`, `steps`), the lines (`lines`), the utterance its `at` names (`at`). */
  reason?: 'block' | 'section' | 'steps' | 'lines' | 'at'
  /** The block key it refers to, as recorded. */
  block?: string
  data: Record<string, unknown>
}

/** The highest line a `lines` value such as `3-5` or `2,7` names. */
function lastLine(lines: unknown): number | undefined {
  if (typeof lines !== 'string' && typeof lines !== 'number') return undefined
  const numbers = String(lines).match(/\d+/g)?.map(Number) ?? []
  return numbers.length ? Math.max(...numbers) : undefined
}

/**
 * The drift of every event (by its index in `track.events`). A moved block's
 * events get its new key; events of lost blocks and sections are `lost`.
 */
export function eventDrift(track: LectureTrack, doc: IRDocument): EventDrift[] {
  const blocks = blockDrift(track, doc)
  const current = playedBlocks(doc)
  const sections = new Map(doc.sections.map(s => [s.id, s]))
  const utterances = new Set(track.utterances.map(u => u.id))
  return track.events.map(([, type, data], index): EventDrift => {
    if (type === 'go') {
      const section = typeof data.section === 'string' ? sections.get(data.section) : undefined
      if (!section) return { index, grade: 'lost', reason: 'section', data }
      const step = Number(data.step)
      if (Number.isFinite(step) && step > section.steps) return { index, grade: 'fuzzy', reason: 'steps', data }
      return { index, grade: 'exact', data }
    }
    const key = blockOf(data)
    const at = anchorOf(data)
    if (!key) return at && !utterances.has(at[0]) ? { index, grade: 'fuzzy', reason: 'at', data } : { index, grade: 'exact', data }
    const drift = blocks.get(key) ?? { grade: 'lost' }
    if (drift.grade === 'lost') return { index, grade: 'lost', reason: 'block', block: key, data }
    const now = drift.to ?? key
    const moved = drift.to ? moveTo(data, drift.to) : data
    const last = lastLine(data.lines ?? data.line)
    const lines = current.get(now)?.lines
    if (last !== undefined && lines !== undefined && last > lines) return { index, grade: 'lost', reason: 'lines', block: key, data: moved }
    if (drift.grade !== 'exact') return { index, grade: drift.grade, reason: 'block', block: key, data: moved }
    if (at && !utterances.has(at[0])) return { index, grade: 'fuzzy', reason: 'at', data }
    return { index, grade: 'exact', data }
  })
}

/** Event data pointing at the block's new key, in the form it was written (`section` and a bare `block`, or a key). */
function moveTo(data: Record<string, unknown>, key: string): Record<string, unknown> {
  const cut = key.lastIndexOf('/')
  if (typeof data.section === 'string' && typeof data.block === 'string' && !data.block.includes('/')) {
    return { ...data, section: key.slice(0, cut), block: key.slice(cut + 1) }
  }
  return { ...data, block: key }
}
