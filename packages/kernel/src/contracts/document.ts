import type { ExecuteConfig } from './execution.ts'
import type { SpeechVoice } from './speech.ts'

export const DOCUMENT_SCHEMA_VERSION = 1 as const
export const DOCUMENT_ENTRY = 'lecture.json'

export type JsonValue = null | boolean | number | string | JsonValue[] | JsonObject
export interface JsonObject { [key: string]: JsonValue }
export type JsonSchema = JsonObject | boolean
export type DocumentId = string
export type SectionId = string
export type BlockId = string
export type StepId = string
export type NarrationId = string
export type AssetId = string
export type DefinitionId = string
export type ClipId = string

export interface DocumentMetadata {
  title: string
  lang: string
  description?: string
  tags?: string[]
  plugins?: string[]
  presmium?: Record<string, JsonObject>
  renderers?: Record<string, JsonObject>
  execute?: ExecuteConfig
  checks?: JsonObject
  translations?: Record<string, string>
  translationOf?: { entry: string, digest: string }
}

/** Canonical authoring data. Runtime positions, resolved assets and playback plans are derived. */
export interface TeachingDocument {
  schemaVersion: typeof DOCUMENT_SCHEMA_VERSION
  id: DocumentId
  metadata: DocumentMetadata
  sectionOrder: SectionId[]
  sections: Record<SectionId, Section>
  blocks: Record<BlockId, DocumentBlock>
  steps: Record<StepId, Step>
  narrations: Record<NarrationId, Narration>
  assets: Record<AssetId, Asset>
  definitions: Record<DefinitionId, Definition>
  production: Production
  comments?: Record<string, DocumentThread>
}

export interface Layout {
  type: 'stack' | 'columns' | 'canvas' | 'scrolly'
  properties?: JsonObject
  renderers?: Record<string, JsonObject>
}
export interface Section {
  id: SectionId
  title: string
  level?: 1 | 2 | 3 | 4 | 5 | 6
  children: BlockId[]
  stepOrder: StepId[]
  layout: Layout
  audience?: string[]
  config?: Record<string, JsonObject>
}

export type TextAlignment = 'left' | 'center' | 'right' | 'justify'
export interface TextStyle { alignment?: TextAlignment, color?: string, background?: string }
export type TextMark =
  | { type: 'bold' | 'italic' | 'underline' | 'strike' | 'code' }
  | { type: 'color' | 'background', value: string }
export type InlineNode =
  | { type: 'text', text: string, marks?: TextMark[] }
  | { type: 'link', href: string, children: InlineNode[] }
  | { type: 'math', value: string }
  | { type: 'break' }
  | InlineExtensionNode

/** A registered extension retains its own versioned semantics and an explicit readable fallback. */
export interface InlineExtensionNode { type: 'extension', kind: string, schemaVersion: number, data: JsonObject, fallback: string }
export interface RichTextExtensionNode { id: string, type: 'extension', kind: string, schemaVersion: number, data: JsonObject, fallback: RichTextNode[] }

export interface ParagraphNode { id: string, type: 'paragraph', children: InlineNode[], style?: TextStyle }
export interface HeadingNode { id: string, type: 'heading', level: 1 | 2 | 3 | 4 | 5 | 6, children: InlineNode[], style?: TextStyle }
export interface ListItemNode { id: string, type: 'listItem', children: RichTextNode[], checked?: boolean }
export interface ListNode { id: string, type: 'list', ordered: boolean, start?: number, children: ListItemNode[] }
export interface QuoteNode { id: string, type: 'blockquote', children: RichTextNode[] }
export interface CodeTextNode { id: string, type: 'code', language: string, value: string }
export interface MathTextNode { id: string, type: 'math', value: string }
export interface TableCellNode { id: string, type: 'tableCell', children: InlineNode[], style?: TextStyle, colspan?: number, rowspan?: number }
export interface TableRowNode { id: string, type: 'tableRow', children: TableCellNode[] }
export interface TableNode { id: string, type: 'table', children: TableRowNode[], headerRows?: number, headerColumns?: number, columnWidths?: number[] }
export type RichTextNode = ParagraphNode | HeadingNode | ListNode | QuoteNode | CodeTextNode | MathTextNode | TableNode | RichTextExtensionNode

export interface BlockScope { only?: string[], audience?: string[] }
export interface TextBlock extends BlockScope { id: BlockId, type: 'text', content: RichTextNode[], reveal?: { type: 'items', order: string[] } }
export interface ContainerProperties { title?: string, columnWidths?: number[], tabTitles?: string[] }
export interface ContainerBlock extends BlockScope { id: BlockId, type: 'container', layout: 'stack' | 'columns' | 'tabs', children: BlockId[], properties: ContainerProperties }
export interface ImageBlock extends BlockScope { id: BlockId, type: 'image', assetId: AssetId, alt: string, caption?: InlineNode[], width?: number, alignment?: TextAlignment }
export interface CodeReference { anchor: string, pin?: string, repo?: string, highlightRegions?: Record<StepId, string> }
export interface CodeExecution { args?: Record<string, string>, stdin?: string, timeoutMs?: number, executor?: string, when: 'compile' | 'live' | 'both', session?: string }
export interface CodeVariantSource { id: string, title: string, value?: string, origin?: Omit<CodeReference, 'highlightRegions'> }
export interface CodeBlock extends BlockScope {
  id: BlockId
  type: 'code'
  language: string
  value?: string
  origin?: CodeReference
  title?: string
  execution?: CodeExecution
  highlight?: Record<StepId, number[]>
  variants?: CodeVariantSource[]
  echo?: boolean
}
export interface ComponentBlock extends BlockScope { id: BlockId, type: 'component', definitionId: DefinitionId, parameters: JsonObject, children?: BlockId[] }
export type DocumentBlock = TextBlock | ContainerBlock | ImageBlock | CodeBlock | ComponentBlock

/** State is independent from ordering and production timing. Omitted blocks are invisible. */
export interface Step {
  id: StepId
  sectionId: SectionId
  title?: string
  visuals: VisualState[]
  narrationIds: NarrationId[]
  inherits?: StepId
}
export interface VisualState { blockId: BlockId, visible: boolean, state?: string, parameters?: JsonObject }
export type NarrationNode =
  | { type: 'text', text: string }
  | { type: 'pronunciation', display: string, spoken: string }
  | { id: string, type: 'cue', action: string, target?: { blockId: BlockId, element?: string }, parameters?: JsonObject }
export interface Narration { id: NarrationId, content: NarrationNode[] }

export interface Asset { id: AssetId, kind: 'image' | 'audio' | 'video' | 'file', location: string, fingerprint?: string, mediaType?: string }
export type ImplementationRef =
  | { type: 'file', path: string, exportName?: string, fingerprint?: string }
  | { type: 'module', specifier: string, exportName?: string }
  | { type: 'plugin', plugin: string, name: string }
export interface StateDescriptor {
  id: string
  title?: string
  parameterSchema?: JsonSchema
  /** A migration must retain numerical implementation bindings explicitly, never invent semantic names. */
  legacyIndex?: number
}
export interface Definition {
  id: DefinitionId
  kind: string
  schemaVersion: number
  implementation: ImplementationRef
  parameterSchema: JsonSchema
  states: StateDescriptor[]
  data?: JsonObject
}

export type VoiceSource = { type: 'none' } | { type: 'tts', voice: SpeechVoice } | { type: 'recording', assetId: AssetId }
export interface StepProduction {
  narrationStart?: 'with-animation' | 'after-animation'
  minimumHoldMs?: number
  trailingPauseMs?: number
  voiceSource?: VoiceSource
}
export interface ProductionDefaults extends StepProduction {}
export interface TimeRange { startMs: number, endMs: number }
export interface MediaClip {
  id: ClipId
  assetId: AssetId
  sourceRange: TimeRange
  attachment: { stepId: StepId, offsetMs: number }
  /** Output gain, from zero to one; muting does not replace this value. */
  volume: number
  muted?: boolean
}
export interface Production {
  defaults: ProductionDefaults
  sectionOverrides?: Record<SectionId, StepProduction>
  stepOverrides: Record<StepId, StepProduction>
  /** Migrated narration defaults: after page settings, before an explicit step override; shared narrations retain this source. */
  narrationOverrides?: Record<NarrationId, { narrationStart: 'with-animation' | 'after-animation' }>
  /** Cue placement is authored in narration; its delay is owned only here. */
  cueTimings?: Record<string, { pauseMs: number }>
  mediaClips: MediaClip[]
}

export interface DocumentTextPoint { blockId: string, offset: number }
export interface DocumentComment {
  id: string
  type: 'comment'
  userId: string
  createdAt: string
  updatedAt: string
  deletedAt?: string
  content?: RichTextNode[]
  metadata?: JsonObject
  reactions: { emoji: string, createdAt: string, userIds: string[] }[]
}
export interface DocumentThread {
  id: string
  type: 'thread'
  createdAt: string
  updatedAt: string
  resolved: boolean
  resolvedUpdatedAt?: string
  resolvedBy?: string
  metadata?: JsonObject
  deletedAt?: string
  anchor?: { from: DocumentTextPoint, to: DocumentTextPoint }
  comments: DocumentComment[]
}

export interface DocumentIssue { path: string, code: string, message: string, severity: 'error' | 'warning' }
export interface DocumentValidation { document?: TeachingDocument, issues: DocumentIssue[] }

/** A source-document transaction. Its CAS version is unrelated to a compiled snapshot ID. */
export type DocumentEditOperation =
  | { type: 'insertBlock', sectionId: SectionId, parentId?: BlockId, index: number, block: DocumentBlock }
  | { type: 'moveBlock', blockId: BlockId, sectionId: SectionId, parentId?: BlockId, index: number }
  | { type: 'deleteBlock', blockId: BlockId }
  | { type: 'updateText', blockId: BlockId, content: RichTextNode[] }
  | { type: 'updateSection', sectionId: SectionId, title?: string, layout?: Layout }
  | { type: 'setStepState', stepId: StepId, visuals: VisualState[], inherits?: StepId }
  | { type: 'setNarration', narration: Narration, stepId?: StepId, index?: number }
  | { type: 'setTiming', stepId?: StepId, sectionId?: SectionId, value: StepProduction }
  | { type: 'replaceAsset', asset: Asset }
