import { isRecord } from '../errors.ts'

export const PREVIEW_PROTOCOL = 1

export const PREVIEW_NAME = 'presmium-preview'

export const PREVIEW_PARAM = 'presmium-preview'

/** The workbench's appearance when it loads a preview (`dark` or `light`), so that the page's first paint matches it. */
export const PREVIEW_APPEARANCE_PARAM = 'presmium-appearance'

export const PREVIEW_REVISION = 'presmiumRevision'

export const AUTHOR_MARKS_CLASS = 'pm-author-marks'

/** Read-only, version-bound control of an individual document widget. */
export interface BlockPreviewCommand {
  type: 'presmium:block-preview-command'
  document: string
  blockId: string
  revision: string
  sectionId: string
  stepId: string
  action: 'seek' | 'pause' | 'sync'
  /** The parent's current navigation intent, including repeat visits to the same step. */
  navigation?: string
  /** Omitted seeks show the completed step; initial/reload seeks explicitly request its start. */
  at?: 'start' | 'end'
}

export interface BlockPreviewPosition {
  type: 'presmium:block-preview-position'
  document: string
  blockId: string
  revision: string
  sectionId: string
  stepId: string
  navigation: string
}

export interface BlockPreviewPlaybackIdentity {
  document: string
  blockId: string
  revision: string
  request: number
}

export interface BlockPreviewPlaybackRequest extends BlockPreviewPlaybackIdentity {
  type: 'presmium:block-preview-playback-request'
  sectionId: string
  stepId: string
  navigation: string
}

export interface BlockPreviewPlaybackGranted extends BlockPreviewPlaybackIdentity {
  type: 'presmium:block-preview-playback-granted'
  error?: string
  navigation: string
}

export interface BlockPreviewPlaybackCancelled extends BlockPreviewPlaybackIdentity {
  type: 'presmium:block-preview-playback-cancelled'
}

export interface PreviewAnchor {
  section: string
  block?: string
}

/** A box in the preview page's viewport, in CSS pixels. */
export interface PreviewRect {
  x: number
  y: number
  width: number
  height: number
}

/** A point in the preview page's viewport, in CSS pixels. */
export interface PreviewPoint {
  x: number
  y: number
}

export interface PreviewPin {
  id: string
  section: string
  block: string
  label: string
}

export interface PreviewPosition {
  section: string
  step: number
  trail: string[]
  view?: string
}

/** Source-oriented edits from the block editor. Opaque blocks retain their source verbatim. */
export interface PreviewEditedBlock {
  id: string
  source?: string
  at?: number
  markdown?: string
  scene?: string
  durations?: number[]
}

/** The source of one anchored block, read by the workbench from its current IR binding. */
export interface PreviewSource {
  part: 'definition' | 'block'
  path: string
  language: string
  content: string
  version: string
  shared: number
}

export type PreviewCommand =
  | { type: 'document-history', action: 'undo' | 'redo', request: number }
  | { type: 'document-history-reset' }
  | { type: 'pause-playback', request: number }
  | { type: 'playback-granted', request: number }
  | { type: 'flush', request: number }
  | { type: 'edit-result', target: PreviewAnchor, request: number, revision?: string, binding?: string, error?: string }
  | { type: 'blocks-result', section: string, request: number, revision?: string, error?: string }
  | { type: 'source-result', section: string, block: string, request: number, source?: PreviewSource, error?: string }
  | { type: 'source-saved', section: string, block: string, request: number, sourceVersion?: string, error?: string }
  | { type: 'source-created', section: string, request: number, block?: string, error?: string }
  | { type: 'page-insert', section: string, id: string, request: number }
  | { type: 'page-created', section: string, request: number, page?: string, error?: string }
  | { type: 'go', section: string, step?: number, trail?: string[], view?: string }
  | { type: 'highlight', target: PreviewAnchor | null }
  | { type: 'pick', on: boolean }
  | { type: 'pins', targets: PreviewPin[] }
  | { type: 'marks', on: boolean }
  | { type: 'appearance', dark: boolean }
  | { type: 'activity', active: boolean, request: number }
  /** Edits the text of a block (a section's heading when there is no block) in place, the caret at `at`; null ends editing and puts the text back. */
  | { type: 'edit', target: PreviewAnchor | null, at?: PreviewPoint, revision?: string, binding?: string }
  /** Makes the blocks (or sections) blink a few times, the first brought into view: what the AI just changed. */
  | { type: 'flash', targets: PreviewAnchor[] }

export type PreviewCommandType = PreviewCommand['type']

/** A workbench command the page's keyboard asks for while it has the focus. */
export type PreviewShortcut = 'undo' | 'redo' | 'dismiss'

export type PreviewReport =
  | { type: 'document-history-state', section?: string, undo: boolean, redo: boolean }
  | { type: 'document-history-result', request: number, handled: boolean, error?: string }
  | { type: 'playback-paused', request: number, error?: string }
  | { type: 'playback-request', request: number }
  | { type: 'flushed', request: number, error?: string }
  | { type: 'blocks-edited', section: string, request: number, revision: string, blocks: PreviewEditedBlock[] }
  | { type: 'source-read', section: string, block: string, request: number, part?: 'definition' | 'block' }
  | { type: 'source-save', section: string, block: string, request: number, path: string, base: string, content: string, part?: 'definition' | 'block' }
  | { type: 'source-create', section: string, id: string, after?: string, request: number, revision: string }
  | { type: 'source-draft', dirty: boolean }
  /** Aggregate unsaved body blocks, independent of generated-source and narration drafts. */
  | { type: 'body-draft', dirty: boolean }
  /** Aggregate unacknowledged native title and complex-text drafts. */
  | { type: 'native-draft', dirty: boolean }
  | { type: 'page-create', section: string, id: string, request: number, revision: string }
  | { type: 'page-create-error', request: number, error: string }
  | { type: 'narrate', section: string, step: number, navigate?: boolean }
  | { type: 'ready', renderer: 'web' | 'slides', document: string, revision?: string, capabilities: PreviewCommandType[] }
  | ({ type: 'position' } & PreviewPosition)
  | { type: 'picked', section: string, block?: string, step?: number, trail?: string[], rect?: PreviewRect, point?: PreviewPoint, clicks?: number }
  | { type: 'selection', selection: (PreviewAnchor & { text: string, rect?: PreviewRect, obstacles?: PreviewRect[] }) | null }
  /** Where the picked block or the selection is after the page scrolled or resized; null when it is out of sight. */
  | { type: 'rect', rect: PreviewRect | null, obstacles?: PreviewRect[] }
  | { type: 'editing', target: PreviewAnchor, active: boolean }
  /** The text of a block edited in place, before and after (its `textContent`); sent only when it changed. */
  | { type: 'edited', target: PreviewAnchor, before: string, after: string, request?: number, revision?: string, binding?: string }
  | { type: 'updated', revision?: string }
  | { type: 'activity', active: boolean, request: number, revision?: string, error?: string }
  | { type: 'report', level: 'error' | 'warning', plugin?: string, message: string, resolved?: boolean }
  | { type: 'shortcut', command: PreviewShortcut }

export type PreviewEnvelope<M> = M & { protocol: typeof PREVIEW_NAME, version: number, nonce: string }

export function previewEnvelope<M extends PreviewCommand | PreviewReport>(nonce: string, message: M): PreviewEnvelope<M> {
  return { ...message, protocol: PREVIEW_NAME, version: PREVIEW_PROTOCOL, nonce }
}

const text = (value: unknown): value is string => typeof value === 'string'
const optional = <T>(value: unknown, is: (v: unknown) => v is T) => value === undefined || is(value)
const step = (value: unknown): value is number => Number.isInteger(value) && (value as number) >= 0
const request = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.length <= 10_000 && value.every(text)
const anchor = (value: unknown): value is PreviewAnchor => isRecord(value) && text(value.section) && optional(value.block, text)
const length = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const rect = (value: unknown): value is PreviewRect => isRecord(value) && length(value.x) && length(value.y) && length(value.width) && length(value.height) && value.width >= 0 && value.height >= 0
const obstacles = (value: unknown): value is PreviewRect[] => Array.isArray(value) && value.length <= 16 && value.every(rect)
const point = (value: unknown): value is PreviewPoint => isRecord(value) && length(value.x) && length(value.y)
const clicks = (value: unknown): value is number => Number.isInteger(value) && (value as number) >= 1 && (value as number) <= 3
const toAnchor = (value: PreviewAnchor): PreviewAnchor => ({ section: value.section, ...value.block ? { block: value.block } : {} })
const toRect = (value: PreviewRect): PreviewRect => ({ x: value.x, y: value.y, width: value.width, height: value.height })
const toPoint = (value: PreviewPoint): PreviewPoint => ({ x: value.x, y: value.y })
const MAX_EDITED = 200_000
const bounded = (value: unknown, max: number): value is string => text(value) && value.length > 0 && value.length <= max
const editBaseline = (m: Record<string, unknown>) => m.revision === undefined && m.binding === undefined || bounded(m.revision, 200) && bounded(m.binding, 200)
const editedRequest = (m: Record<string, unknown>) => m.request === undefined && m.revision === undefined && m.binding === undefined || request(m.request) && bounded(m.revision, 200) && bounded(m.binding, 200)
const sourceTarget = (m: Record<string, unknown>) => bounded(m.section, 200) && bounded(m.block, 200) && request(m.request)
const sourcePart = (value: unknown): value is 'definition' | 'block' => value === 'definition' || value === 'block'
const pageId = (value: unknown): value is string => text(value) && /^page-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value)
const sourceValue = (value: unknown): value is PreviewSource => isRecord(value) && sourcePart(value.part) && bounded(value.path, 4096) && bounded(value.language, 100) && text(value.content) && value.content.length <= MAX_EDITED && bounded(value.version, 200) && request(value.shared) && value.shared > 0

export function toBlockPreviewCommand(value: unknown): BlockPreviewCommand | undefined {
  if (!isRecord(value) || value.type !== 'presmium:block-preview-command' || !text(value.document)
    || !text(value.blockId) || !value.blockId || !text(value.revision) || !value.revision
    || !text(value.sectionId) || !value.sectionId || !text(value.stepId) || !value.stepId
    || value.action !== 'seek' && value.action !== 'pause' && value.action !== 'sync'
    || (value.action === 'pause' ? !optional(value.navigation, value => bounded(value, 200)) : !bounded(value.navigation, 200))
    || value.at !== undefined && value.at !== 'start' && value.at !== 'end') return undefined
  return { type: value.type, document: value.document, blockId: value.blockId, revision: value.revision, sectionId: value.sectionId, stepId: value.stepId, action: value.action, ...value.navigation !== undefined ? { navigation: value.navigation as string } : {}, ...value.at !== undefined ? { at: value.at } : {} }
}

export function toBlockPreviewPosition(value: unknown): BlockPreviewPosition | undefined {
  if (!isRecord(value) || value.type !== 'presmium:block-preview-position' || !text(value.document)
    || !bounded(value.blockId, 4096) || !bounded(value.revision, 200) || !bounded(value.sectionId, 4096)
    || !bounded(value.stepId, 4096) || !bounded(value.navigation, 200)) return undefined
  return { type: value.type, document: value.document, blockId: value.blockId, revision: value.revision, sectionId: value.sectionId, stepId: value.stepId, navigation: value.navigation }
}

const playbackIdentity = (value: unknown): value is Record<string, unknown> & BlockPreviewPlaybackIdentity => isRecord(value) && text(value.document) && bounded(value.blockId, 4096) && bounded(value.revision, 200) && request(value.request)
const toPlaybackIdentity = (value: BlockPreviewPlaybackIdentity): BlockPreviewPlaybackIdentity => ({ document: value.document, blockId: value.blockId, revision: value.revision, request: value.request })

export function toBlockPreviewPlaybackRequest(value: unknown): BlockPreviewPlaybackRequest | undefined {
  return playbackIdentity(value) && value.type === 'presmium:block-preview-playback-request' && bounded(value.sectionId, 4096) && bounded(value.stepId, 4096) && bounded(value.navigation, 200)
    ? { ...toPlaybackIdentity(value), type: value.type, sectionId: value.sectionId, stepId: value.stepId, navigation: value.navigation } : undefined
}

export function toBlockPreviewPlaybackGranted(value: unknown): BlockPreviewPlaybackGranted | undefined {
  return playbackIdentity(value) && value.type === 'presmium:block-preview-playback-granted' && optional(value.error, text) && bounded(value.navigation, 200)
    ? { ...toPlaybackIdentity(value), type: value.type, navigation: value.navigation, ...value.error !== undefined ? { error: value.error as string } : {} } : undefined
}

export function toBlockPreviewPlaybackCancelled(value: unknown): BlockPreviewPlaybackCancelled | undefined {
  return playbackIdentity(value) && value.type === 'presmium:block-preview-playback-cancelled' ? { ...toPlaybackIdentity(value), type: value.type } : undefined
}

export function isPreviewEnvelope(data: unknown, nonce: string): data is PreviewEnvelope<{ type: string }> {
  return isRecord(data) && data.protocol === PREVIEW_NAME && data.nonce === nonce && typeof data.version === 'number' && text(data.type)
}

export function toPreviewCommand(data: unknown, nonce: string): PreviewCommand | undefined {
  if (!isPreviewEnvelope(data, nonce) || data.version !== PREVIEW_PROTOCOL) return undefined
  const m = data as Record<string, unknown>
  switch (m.type) {
    case 'document-history': return request(m.request) && (m.action === 'undo' || m.action === 'redo') ? { type: 'document-history', request: m.request, action: m.action } : undefined
    case 'document-history-reset': return { type: 'document-history-reset' }
    case 'pause-playback':
    case 'playback-granted': return request(m.request) ? { type: m.type, request: m.request } : undefined
    case 'flush': return request(m.request) ? { type: 'flush', request: m.request } : undefined
    case 'edit-result': return anchor(m.target) && request(m.request) && editBaseline(m) && optional(m.error, text) ? { type: 'edit-result', target: toAnchor(m.target), request: m.request, ...m.revision === undefined ? {} : { revision: m.revision as string, binding: m.binding as string }, ...m.error === undefined ? {} : { error: m.error as string } } : undefined
    case 'blocks-result': return text(m.section) && request(m.request) && optional(m.revision, text) && optional(m.error, text) ? { type: 'blocks-result', section: m.section, request: m.request, ...m.revision === undefined ? {} : { revision: m.revision as string }, ...m.error === undefined ? {} : { error: m.error as string } } : undefined
    case 'source-result': return sourceTarget(m) && optional(m.source, sourceValue) && optional(m.error, text) ? { type: 'source-result', section: m.section as string, block: m.block as string, request: m.request as number, ...m.source === undefined ? {} : { source: m.source as PreviewSource }, ...m.error === undefined ? {} : { error: m.error as string } } : undefined
    case 'source-saved': return sourceTarget(m) && optional(m.sourceVersion, (value): value is string => bounded(value, 200)) && optional(m.error, text) ? { type: 'source-saved', section: m.section as string, block: m.block as string, request: m.request as number, ...m.sourceVersion === undefined ? {} : { sourceVersion: m.sourceVersion as string }, ...m.error === undefined ? {} : { error: m.error as string } } : undefined
    case 'source-created': return bounded(m.section, 200) && request(m.request) && optional(m.block, (value): value is string => bounded(value, 200)) && optional(m.error, text) ? { type: 'source-created', section: m.section, request: m.request, ...m.block === undefined ? {} : { block: m.block as string }, ...m.error === undefined ? {} : { error: m.error as string } } : undefined
    case 'page-insert': return bounded(m.section, 200) && pageId(m.id) && request(m.request) ? { type: 'page-insert', section: m.section, id: m.id, request: m.request } : undefined
    case 'page-created': return bounded(m.section, 200) && request(m.request) && optional(m.page, pageId) && optional(m.error, text) ? { type: 'page-created', section: m.section, request: m.request, ...m.page === undefined ? {} : { page: m.page as string }, ...m.error === undefined ? {} : { error: m.error as string } } : undefined
    case 'go': return text(m.section) && optional(m.step, step) && optional(m.trail, strings) && optional(m.view, text) ? { type: 'go', section: m.section, ...m.step === undefined ? {} : { step: m.step as number }, ...m.trail ? { trail: m.trail as string[] } : {}, ...m.view ? { view: m.view as string } : {} } : undefined
    case 'highlight': return m.target === null || anchor(m.target) ? { type: 'highlight', target: m.target === null ? null : { section: m.target.section, ...m.target.block ? { block: m.target.block } : {} } } : undefined
    case 'pick':
    case 'marks': return typeof m.on === 'boolean' ? { type: m.type, on: m.on } : undefined
    case 'appearance': return typeof m.dark === 'boolean' ? { type: 'appearance', dark: m.dark } : undefined
    case 'activity': return typeof m.active === 'boolean' && request(m.request) ? { type: 'activity', active: m.active, request: m.request } : undefined
    case 'edit': return (m.target === null || anchor(m.target)) && optional(m.at, point) && editBaseline(m) ? { type: 'edit', target: m.target === null ? null : toAnchor(m.target), ...m.at ? { at: toPoint(m.at as PreviewPoint) } : {}, ...m.revision === undefined ? {} : { revision: m.revision as string, binding: m.binding as string } } : undefined
    case 'pins': return Array.isArray(m.targets) && m.targets.length <= 1000 && m.targets.every(t => isRecord(t) && text(t.id) && text(t.section) && text(t.block) && text(t.label))
      ? { type: 'pins', targets: (m.targets as PreviewPin[]).map(({ id, section, block, label }) => ({ id, section, block, label })) }
      : undefined
    case 'flash': return Array.isArray(m.targets) && m.targets.length <= 1000 && m.targets.every(anchor) ? { type: 'flash', targets: (m.targets as PreviewAnchor[]).map(toAnchor) } : undefined
    default: return undefined
  }
}

export function toPreviewReport(data: unknown, nonce: string): PreviewReport | undefined {
  if (!isPreviewEnvelope(data, nonce) || data.version !== PREVIEW_PROTOCOL) return undefined
  const m = data as Record<string, unknown>
  switch (m.type) {
    case 'document-history-state': return optional(m.section, text) && typeof m.undo === 'boolean' && typeof m.redo === 'boolean' ? { type: 'document-history-state', ...m.section === undefined ? {} : { section: m.section as string }, undo: m.undo, redo: m.redo } : undefined
    case 'document-history-result': return request(m.request) && typeof m.handled === 'boolean' && optional(m.error, text) ? { type: 'document-history-result', request: m.request, handled: m.handled, ...m.error === undefined ? {} : { error: m.error as string } } : undefined
    case 'playback-request': return request(m.request) ? { type: 'playback-request', request: m.request } : undefined
    case 'playback-paused': return request(m.request) && optional(m.error, text) ? { type: 'playback-paused', request: m.request, ...m.error === undefined ? {} : { error: m.error as string } } : undefined
    case 'flushed': return request(m.request) && optional(m.error, text) ? { type: 'flushed', request: m.request, ...m.error === undefined ? {} : { error: m.error as string } } : undefined
    case 'blocks-edited': return text(m.section) && request(m.request) && text(m.revision) && Array.isArray(m.blocks) && m.blocks.length <= 2000 && m.blocks.every(b => isRecord(b) && text(b.id) && b.id.length <= 200 && optional(b.source, text) && optional(b.at, step) && optional(b.markdown, (v): v is string => text(v) && v.length <= MAX_EDITED) && optional(b.scene, text) && optional(b.durations, (v): v is number[] => Array.isArray(v) && v.length <= 1000 && v.every(n => typeof n === 'number' && Number.isFinite(n) && n >= 0))) ? { type: 'blocks-edited', section: m.section, request: m.request, revision: m.revision, blocks: m.blocks as unknown as PreviewEditedBlock[] } : undefined
    case 'source-read': return sourceTarget(m) && optional(m.part, sourcePart) ? { type: 'source-read', section: m.section as string, block: m.block as string, request: m.request as number, ...m.part === undefined ? {} : { part: m.part as 'definition' | 'block' } } : undefined
    case 'source-save': return sourceTarget(m) && optional(m.part, sourcePart) && bounded(m.path, 4096) && bounded(m.base, 200) && text(m.content) && m.content.length <= MAX_EDITED ? { type: 'source-save', section: m.section as string, block: m.block as string, request: m.request as number, path: m.path as string, base: m.base as string, content: m.content, ...m.part === undefined ? {} : { part: m.part as 'definition' | 'block' } } : undefined
    case 'source-create': return bounded(m.section, 200) && text(m.id) && /^scene-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(m.id) && request(m.request) && bounded(m.revision, 200) && optional(m.after, (value): value is string => bounded(value, 200)) ? { type: 'source-create', section: m.section, id: m.id, request: m.request, revision: m.revision, ...m.after === undefined ? {} : { after: m.after as string } } : undefined
    case 'source-draft': return typeof m.dirty === 'boolean' ? { type: 'source-draft', dirty: m.dirty } : undefined
    case 'body-draft': return typeof m.dirty === 'boolean' ? { type: 'body-draft', dirty: m.dirty } : undefined
    case 'native-draft': return typeof m.dirty === 'boolean' ? { type: 'native-draft', dirty: m.dirty } : undefined
    case 'page-create': return bounded(m.section, 200) && pageId(m.id) && request(m.request) && bounded(m.revision, 200) ? { type: 'page-create', section: m.section, id: m.id, request: m.request, revision: m.revision } : undefined
    case 'page-create-error': return request(m.request) && bounded(m.error, 4000) ? { type: 'page-create-error', request: m.request, error: m.error } : undefined
    case 'narrate': return text(m.section) && step(m.step) && optional(m.navigate, (value): value is boolean => typeof value === 'boolean') ? { type: 'narrate', section: m.section, step: m.step, ...m.navigate === undefined ? {} : { navigate: m.navigate as boolean } } : undefined
    case 'ready': return (m.renderer === 'web' || m.renderer === 'slides') && text(m.document) && optional(m.revision, text) && strings(m.capabilities) ? { type: 'ready', renderer: m.renderer, document: m.document, ...m.revision ? { revision: m.revision as string } : {}, capabilities: m.capabilities as PreviewCommandType[] } : undefined
    case 'position': return text(m.section) && step(m.step) && strings(m.trail) && optional(m.view, text) ? { type: 'position', section: m.section, step: m.step, trail: m.trail, ...m.view ? { view: m.view as string } : {} } : undefined
    case 'picked': return text(m.section) && optional(m.block, text) && optional(m.step, step) && optional(m.trail, strings) && optional(m.rect, rect) && optional(m.point, point) && optional(m.clicks, clicks)
      ? { type: 'picked', section: m.section, ...m.block ? { block: m.block as string } : {}, ...m.step === undefined ? {} : { step: m.step as number }, ...m.trail ? { trail: m.trail as string[] } : {}, ...m.rect ? { rect: toRect(m.rect as PreviewRect) } : {}, ...m.point ? { point: toPoint(m.point as PreviewPoint) } : {}, ...m.clicks === undefined ? {} : { clicks: m.clicks as number } }
      : undefined
    case 'selection': {
      if (m.selection === null) return { type: 'selection', selection: null }
      const selected = m.selection
      return isRecord(selected) && text(selected.text) && anchor(selected) && optional(selected.rect, rect) && optional(selected.obstacles, obstacles)
        ? { type: 'selection', selection: { ...toAnchor(selected), text: selected.text, ...selected.rect ? { rect: toRect(selected.rect as PreviewRect) } : {}, ...selected.obstacles !== undefined ? { obstacles: (selected.obstacles as PreviewRect[]).map(toRect) } : {} } }
        : undefined
    }
    case 'rect': return (m.rect === null || rect(m.rect)) && optional(m.obstacles, obstacles) ? { type: 'rect', rect: m.rect === null ? null : toRect(m.rect), ...m.obstacles !== undefined ? { obstacles: (m.obstacles as PreviewRect[]).map(toRect) } : {} } : undefined
    case 'editing': return anchor(m.target) && typeof m.active === 'boolean' ? { type: 'editing', target: toAnchor(m.target), active: m.active } : undefined
    case 'edited': return anchor(m.target) && text(m.before) && text(m.after) && m.before.length <= MAX_EDITED && m.after.length <= MAX_EDITED && editedRequest(m) ? { type: 'edited', target: toAnchor(m.target), before: m.before, after: m.after, ...m.request === undefined ? {} : { request: m.request as number, revision: m.revision as string, binding: m.binding as string } } : undefined
    case 'updated': return optional(m.revision, text) ? { type: 'updated', ...m.revision ? { revision: m.revision as string } : {} } : undefined
    case 'activity': return typeof m.active === 'boolean' && request(m.request) && optional(m.revision, text) && optional(m.error, text)
      ? { type: 'activity', active: m.active, request: m.request, ...m.revision === undefined ? {} : { revision: m.revision as string }, ...m.error === undefined ? {} : { error: m.error as string } }
      : undefined
    case 'report': return (m.level === 'error' || m.level === 'warning') && text(m.message) && optional(m.plugin, text) && (m.resolved === undefined || typeof m.resolved === 'boolean') ? { type: 'report', level: m.level, message: m.message, ...m.plugin ? { plugin: m.plugin as string } : {}, ...m.resolved === undefined ? {} : { resolved: m.resolved as boolean } } : undefined
    case 'shortcut': return m.command === 'undo' || m.command === 'redo' || m.command === 'dismiss' ? { type: 'shortcut', command: m.command } : undefined
    default: return undefined
  }
}
