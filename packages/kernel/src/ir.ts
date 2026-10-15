/**
 * Presmium intermediate representation (IR), the published language between
 * the compiler and the renderers. See docs/ir.md.
 *
 * Adding optional fields is allowed; any other change bumps IR_VERSION.
 */
import type {
  AnchorLockFile,
  AnchorResolverRegistry,
  AnchorString,
  Executor,
  Finding,
  ResolutionStatus,
  RunResult,
  SourceReader,
} from './contracts.ts'

export const IR_VERSION = 1

/** 'web' | 'slides' | 'notebook' | any id a renderer plugin declares. */
export type RendererId = string

/** A structural mdast node (https://github.com/syntax-tree/mdast); typed loosely to keep the kernel dependency-free. */
export interface MdastNode {
  type: string
  children?: MdastNode[]
  value?: string
  [key: string]: unknown
}

export interface SourcePos {
  /** Absolute path of the source file. */
  file: string
  /** 1-based line. */
  line: number
  endLine?: number
}

// ---------------------------------------------------------------------------
// Document
// ---------------------------------------------------------------------------

export interface IRDocument {
  ir: typeof IR_VERSION
  meta: {
    title: string
    /** Absolute path of the entry file. */
    entry: string
    lang?: string
    [key: string]: unknown
  }
  config: {
    /** Plugin package names, in declaration order. */
    plugins: string[]
    /** `presmium.<plugin id>` configuration from the frontmatter. */
    presmium: Record<string, unknown>
    /** Per-renderer configuration from the frontmatter. */
    renderers: Record<RendererId, Record<string, unknown>>
  }
  sections: IRSection[]
  diagnostics: Finding[]
}

export interface IRSection {
  /** Stable id: the MyST label before the heading, or a slug of the title. */
  id: string
  /** 1-based; equals the slide number in the slides form. */
  index: number
  title: string
  /** Heading depth that opened the section (0 for the cover section). */
  depth: number
  source: SourcePos
  /** Number of steps; step 0 is the initial state, so a section without reveals has steps = 0. */
  steps: number
  /** Layout hints per renderer, from `{hints}`; renderers ignore what they do not know. */
  hints: Record<RendererId, Record<string, unknown>>
  blocks: IRBlock[]
}

export type BlockRole = 'visual' | 'narration'

export interface IRBlock {
  /** Unique and stable within the section. */
  id: string
  role: BlockRole
  /** Step at which a visual block appears, or to which a narration block belongs. */
  at: number
  /** Step at which the block disappears; undefined means it stays. */
  until?: number
  /** Steps the block advances internally after `at` (e.g. stepwise highlight); default 0. */
  span?: number
  /** Restricts the block to these renderers. */
  only?: RendererId[]
  source: SourcePos
  node: IRNode
}

// ---------------------------------------------------------------------------
// Nodes
// ---------------------------------------------------------------------------

export type IRNode = MarkdownNode | CodeNode | ComponentNode

/** Prose, lists, tables, math, images: a standard mdast subtree (usually a 'root'). */
export interface MarkdownNode {
  type: 'markdown'
  mdast: MdastNode
  /**
   * 'items': the top-level list items appear one per step, item k (0-based, in
   * document order) at `at + 1 + k`; the block's `span` equals the item count.
   */
  reveal?: 'items'
}

export interface CodeOrigin {
  anchor: AnchorString
  /** Workspace-relative path. */
  file: string
  startLine: number
  endLine: number
  /** Git revision the text was read from; undefined means the working tree. */
  pin?: string
  permalink?: string
  status: ResolutionStatus
  /** Logical units (nested regions) with lines relative to the snippet, 1-based. */
  units?: Record<string, { startLine: number; endLine: number }>
}

export interface RunSpec {
  lang: string
  args?: Record<string, string>
  stdin?: string
  timeoutMs?: number
  /** Preferred executor id; the router decides when omitted. */
  executor?: string
  /** 'compile' records output at build time; 'live' runs in the viewer; 'both' does both. */
  when: 'compile' | 'live' | 'both'
}

export interface RecordedRun extends RunResult {
  cacheKey: string
}

export interface CodeVariant {
  label: string
  value: string
}

export interface CodeNode {
  type: 'code'
  lang: string
  value: string
  title?: string
  origin?: CodeOrigin
  /** Line sets (1-based, relative to `value`) highlighted at step at+0, at+1, ...; length = span + 1 or span. */
  highlight?: number[][]
  run?: RunSpec
  outputs?: RecordedRun[]
  /** Alternative versions shown in place of `value`, one per step. */
  variants?: CodeVariant[]
}

export interface ComponentNode {
  type: 'component'
  /** Plugin id that owns the component, e.g. 'presmium.classroom'. */
  plugin: string
  /** Component name the browser renderers resolve, e.g. 'PmQuiz'. */
  name: string
  props: Record<string, unknown>
  children?: IRBlock[]
  /** Static rendering used by renderers that cannot run the component. */
  fallback?: MdastNode
}

// ---------------------------------------------------------------------------
// Compiler-facing plugin contract
// ---------------------------------------------------------------------------

export type DirectiveOptionType = 'string' | 'number' | 'boolean' | 'list'

export interface DirectiveInput {
  name: string
  arg?: string
  options: Record<string, unknown>
  /** Raw body text. */
  body: string
}

export interface DirectiveContext {
  /** Absolute path of the file that contains the directive. */
  file: string
  deckDir: string
  workspaceRoot: string
  /** This plugin's configuration. */
  config: Record<string, unknown>
  source: SourcePos
  /** Parses MyST markdown (e.g. a directive body) into mdast. */
  parse(markdown: string): MdastNode
  report(finding: Finding): void
}

export interface DirectiveResult {
  node: IRNode
  role?: BlockRole
  span?: number
}

export interface DirectiveSpec {
  name: string
  arg?: boolean
  body?: boolean
  options?: Record<string, DirectiveOptionType>
  toIR(input: DirectiveInput, ctx: DirectiveContext): DirectiveResult | Promise<DirectiveResult>
}

export interface RunCache {
  get(key: string): RecordedRun | undefined
  set(key: string, run: RecordedRun): void
}

export interface PassContext {
  deckDir: string
  workspaceRoot: string
  src: SourceReader
  resolvers: AnchorResolverRegistry
  lock: AnchorLockFile
  /** Node-side executors contributed by plugins, for compile-time execution. */
  executors: Executor[]
  cache: RunCache
  /** Configuration of the plugin that owns the pass. */
  config: Record<string, unknown>
  report(finding: Finding): void
}

export interface IRPass {
  name: string
  /** Lower runs first among plugin passes; default 0. */
  order?: number
  run(doc: IRDocument, ctx: PassContext): void | Promise<void>
}

// ---------------------------------------------------------------------------
// Renderers
// ---------------------------------------------------------------------------

export type Support = 'full' | 'degraded' | 'none'

export interface RenderContext {
  deckDir: string
  outDir: string
  /** This renderer's configuration from the frontmatter. */
  config: Record<string, unknown>
  /** Renderer extensions contributed by plugins for this renderer. */
  extensions: RendererExtension[]
  /** Plugin package names, so browser renderers can load their components. */
  plugins: string[]
  report(finding: Finding): void
}

export interface RenderOutput {
  outDir: string
  /** Blocks not rendered, with the reason. */
  skipped: { section: string; block: string; reason: string }[]
}

export interface RenderDevServer {
  url: string
  update(doc: IRDocument): Promise<void>
  close(): Promise<void>
}

export interface Renderer {
  id: RendererId
  support(node: IRNode, extensions: RendererExtension[]): Support
  build(doc: IRDocument, ctx: RenderContext): Promise<RenderOutput>
  dev?(doc: IRDocument, ctx: RenderContext): Promise<RenderDevServer>
}

/** What a plugin contributes to one renderer, e.g. how the notebook renders its components. */
export interface RendererExtension {
  plugin: string
  /** Component name -> renderer-specific output (e.g. notebook cells). */
  components?: Record<string, (node: ComponentNode, block: IRBlock) => unknown>
}
