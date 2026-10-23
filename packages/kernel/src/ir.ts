import type {
  AnchorLockFile,
  AnchorResolverRegistry,
  AnchorString,
  ExecuteConfig,
  Executor,
  Finding,
  ResolutionStatus,
  RunResult,
  ServiceToken,
  SourceReader,
} from './contracts.ts'

export const IR_VERSION = 1

export type RendererId = string

export interface MdastNode {
  type: string
  children?: MdastNode[]
  value?: string
  [key: string]: unknown
}

export interface SourcePos {
  file: string
  line: number
  endLine?: number
}

export interface IRDocument {
  ir: typeof IR_VERSION
  meta: {
    title: string
    entry: string
    lang?: string
    translationOf?: { entry: string, digest: string }
    [key: string]: unknown
  }
  config: {
    plugins: string[]
    presmium: Record<string, unknown>
    renderers: Record<RendererId, Record<string, unknown>>
    execute?: ExecuteConfig
    translations?: Record<string, string>
  }
  sections: IRSection[]
  diagnostics: Finding[]
}

export interface IRSection {
  id: string
  index: number
  title: string
  depth: number
  source: SourcePos
  steps: number
  stepMap?: number[]
  hints: Record<RendererId, Record<string, unknown>>
  config?: Record<string, Record<string, unknown>>
  blocks: IRBlock[]
  audience?: string[]
}

export type BlockRole = 'visual' | 'narration'

export interface IRBlock {
  id: string
  role: BlockRole
  at: number
  until?: number
  span?: number
  only?: RendererId[]
  audience?: string[]
  source: SourcePos
  node: IRNode
}

export type IRNode = MarkdownNode | CodeNode | ComponentNode

export interface MarkdownNode {
  type: 'markdown'
  mdast: MdastNode
  reveal?: 'items'
}

export interface CodeOrigin {
  anchor: AnchorString
  file: string
  startLine: number
  endLine: number
  pin?: string
  permalink?: string
  status: ResolutionStatus
  units?: Record<string, { startLine: number; endLine: number }>
  drift?: 'synced' | 'drifted'
}

export interface RunSpec {
  lang: string
  args?: Record<string, string>
  stdin?: string
  timeoutMs?: number
  executor?: string
  when: 'compile' | 'live' | 'both'
  session?: string
}

export interface RecordedRun extends RunResult {
  cacheKey: string
}

export interface CodeVariant {
  label: string
  value: string
  permalink?: string
  startLine?: number
  endLine?: number
}

export interface CodeNode {
  type: 'code'
  lang: string
  value: string
  title?: string
  origin?: CodeOrigin
  highlight?: number[][]
  run?: RunSpec
  outputs?: RecordedRun[]
  variants?: CodeVariant[]
  echo?: false
}

export interface ComponentNode {
  type: 'component'
  plugin: string
  name: string
  props: Record<string, unknown>
  children?: IRBlock[]
  ownsCode?: boolean
  fallback?: MdastNode
  assets?: Record<string, string>
  layer?: 'overlay'
  durations?: number[]
}

export type DirectiveOptionType = 'string' | 'number' | 'boolean' | 'list'

export interface DirectiveInput {
  name: string
  arg?: string
  options: Record<string, unknown>
  body: string
}

export interface DirectiveContext {
  file: string
  deckDir: string
  workspaceRoot: string
  lang?: string
  config: Record<string, unknown>
  source: SourcePos
  parse(markdown: string): MdastNode
  report(finding: Finding): void
  watch(...files: string[]): void
}

export interface DirectiveResult {
  node: IRNode
  role?: BlockRole
  span?: number
}

export interface RoleInput {
  name: string
  value: string
  options: Record<string, unknown>
}

export interface RoleSpec {
  name: string
  options?: Record<string, DirectiveOptionType>
  children?(input: RoleInput, ctx: DirectiveContext): MdastNode[]
}

export interface PresmiumRoleNode extends MdastNode {
  type: 'presmiumRole'
  plugin: string
  name: string
  options: Record<string, unknown>
  children: MdastNode[]
}

export interface DirectiveSpec {
  name: string
  arg?: boolean | 'anchor'
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
  lang?: string
  src: SourceReader
  resolvers: AnchorResolverRegistry
  lock: AnchorLockFile
  executors: Executor[]
  cache: RunCache
  config: Record<string, unknown>
  configFor(section: IRSection): Record<string, unknown>
  report(finding: Finding): void
  watch(...files: string[]): void
  service?<T>(token: ServiceToken<T>): T | undefined
}

export interface IRPass {
  name: string
  order?: number
  after?: 'execute'
  run(doc: IRDocument, ctx: PassContext): void | Promise<void>
}

export type Support = 'full' | 'degraded' | 'none'

export interface RenderContext {
  deckDir: string
  workspaceRoot: string
  outDir: string
  workDir: string
  config: Record<string, unknown>
  extensions: BoundRendererExtension[]
  plugins: string[]
  pluginDirs: Record<string, string>
  lang?: string
  renderers: RendererId[]
  base: string
  vitePlugins: unknown[]
  nodeVitePlugins?: NodeVitePlugin[]
  extensionFor(node: ComponentNode): ((node: ComponentNode, block: IRBlock) => unknown) | undefined
  portable(value: unknown, from: string): unknown
  localAsset(source: SourcePos, url: string): LocalAsset | undefined
  documentLink?(source: SourcePos, url: string): DocumentLink | undefined
  report(finding: Finding): void
  service?<T>(token: ServiceToken<T>): T | undefined
  translations?: { lang: string, doc: IRDocument }[]
  server?: { url: string }
  preview?: { origins: string[] }
}

export interface NodeVitePlugin {
  id: string
  entry: string
  config: Record<string, unknown>
}

export interface LocalAsset {
  file: string
  name: string
  directory?: boolean
}

export interface DocumentLink {
  dir: string
  fragment?: string
}

export interface RenderOutput {
  outDir: string
  skipped: { section: string; block: string; reason: string }[]
}

export interface RenderDevServer {
  url: string
  update(doc: IRDocument): Promise<void>
  close(): Promise<void>
}

export interface Renderer {
  id: RendererId
  site?: boolean
  support(node: IRNode, extensions: BoundRendererExtension[]): Support
  prepare?(doc: IRDocument, ctx: RenderContext): Promise<void>
  build(doc: IRDocument, ctx: RenderContext): Promise<RenderOutput>
  dev?(doc: IRDocument, ctx: RenderContext): Promise<RenderDevServer>
  buildSite?(site: SiteSpec, ctx: RenderContext): Promise<RenderOutput>
  devSite?(site: SiteSpec, ctx: RenderContext, compile: (dir: string) => Promise<IRDocument>): Promise<SiteDevServer>
}

export interface SiteDocument {
  dir: string
  title: string
  lang?: string
  tags?: string[]
  doc?: IRDocument
  translations?: { lang: string, doc: IRDocument }[]
  nodeVitePlugins?: NodeVitePlugin[]
}

export interface SiteSpec {
  title: string
  documents: SiteDocument[]
  home?: string
  config: Record<string, unknown>
}

export interface SiteDevServer {
  url: string
  update(dir: string, doc: IRDocument): Promise<void>
  close(): Promise<void>
}

export type ComponentRenderer = (node: ComponentNode, block: IRBlock, ctx: RenderContext) => unknown

export interface RendererContribution {
  components?: Record<string, ComponentRenderer>
}

export interface BoundRendererExtension {
  plugin: string
  components?: Record<string, (node: ComponentNode, block: IRBlock) => unknown>
}
