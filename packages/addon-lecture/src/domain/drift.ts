import { fingerprint, fnv1a64, irBlocks } from '@lincyaw/kernel'
import type { IRBlock, IRDocument, MdastNode, TrackEvent } from '@lincyaw/kernel'
import { anchorOf } from './timing.ts'
import type { LectureTrack, TrackBlock } from './track.ts'

export type Grade = 'exact' | 'moved' | 'fuzzy' | 'lost'

const PLAYER_RENDERER = 'web'

export function blockKey(section: string, block: string): string {
  return `${section}/${block}`
}

export function blockOf(data: Record<string, unknown>): string | undefined {
  if (typeof data.block !== 'string' || !data.block) return undefined
  if (typeof data.section === 'string' && !data.block.includes('/')) return blockKey(data.section, data.block)
  return data.block.includes('/') ? data.block : undefined
}

function text(node: MdastNode | undefined): string {
  if (!node) return ''
  const own = [node.value, node.alt].filter((v): v is string => typeof v === 'string')
  return [...own, ...(node.children ?? []).map(text)].join(' ')
}

function content(block: IRBlock): string {
  const { node } = block
  if (node.type === 'code') return node.value
  if (node.type === 'markdown') return text(node.mdast)
  const files = new Set(Object.keys(node.assets ?? {}).map(path => path.split('.')[0]))
  const props = Object.fromEntries(Object.entries(node.props).filter(([key]) => !files.has(key)))
  return [node.name, JSON.stringify(props), ...(node.children ?? []).map(content)].join('\n')
}

export function trackBlock(block: IRBlock): TrackBlock {
  const value = content(block)
  return block.node.type === 'code' ? { fp: fingerprint(value), lines: value.replace(/\n$/, '').split('\n').length } : { fp: fingerprint(value) }
}

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

export function irHash(doc: IRDocument): string {
  return fnv1a64([...playedBlocks(doc)].map(([key, block]) => `${key}\t${block.fp}`).join('\n'))
}

export function sectionHashes(doc: IRDocument): Record<string, string> {
  return Object.fromEntries(doc.sections.map(section => [section.id, irHash({ ...doc, sections: [section] })]))
}

export function unchanged(track: LectureTrack, doc: IRDocument): boolean {
  const recorded = track.ir.sections
  if (!recorded) return track.ir.hash === irHash(doc)
  const now = sectionHashes(doc)
  return Object.entries(recorded).every(([section, hash]) => now[section] === hash)
}

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
  to?: string
}

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

export interface EventDrift {
  index: number
  grade: Grade
  reason?: 'block' | 'section' | 'steps' | 'lines' | 'at'
  block?: string
  data: Record<string, unknown>
}

function lastLine(lines: unknown): number | undefined {
  if (typeof lines !== 'string' && typeof lines !== 'number') return undefined
  const numbers = String(lines).match(/\d+/g)?.map(Number) ?? []
  return numbers.length ? Math.max(...numbers) : undefined
}

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

function moveTo(data: Record<string, unknown>, key: string): Record<string, unknown> {
  const cut = key.lastIndexOf('/')
  if (typeof data.section === 'string' && typeof data.block === 'string' && !data.block.includes('/')) {
    return { ...data, section: key.slice(0, cut), block: key.slice(cut + 1) }
  }
  return { ...data, block: key }
}
