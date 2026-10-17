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
  ExecuteConfig,
  Executor,
  Finding,
  ResolutionStatus,
  RunResult,
  ServiceToken,
  SourceReader,
  TrustMode,
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
    /** The deck's language, from the headmatter `lang`; the compiler writes `DEFAULT_LANG` when it names none. */
    lang?: string
    /** When this deck is a translation: the original's entry file (relative to the deck directory) and the digest of the original it follows (P-123). */
    translationOf?: { entry: string, digest: string }
    [key: string]: unknown
  }
  config: {
    /** Plugin package names, in declaration order. */
    plugins: string[]
    /** `presmium.<plugin id>` configuration from the frontmatter. */
    presmium: Record<string, unknown>
    /** Per-renderer configuration from the frontmatter. */
    renderers: Record<RendererId, Record<string, unknown>>
    /** The headmatter's `execute`, without credentials (P-100). */
    execute?: ExecuteConfig
    /** The headmatter's `translations`: language to the entry file of its translation (P-123). */
    translations?: Record<string, string>
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
  /**
   * Set in a renderer's view of the document (`viewFor`) when blocks limited
   * to other renderers took steps of their own, which the view drops: entry s
   * is the step of this view that step s of the whole document shows, so a
   * position can go from one form to another (P-74). Absent when the steps
   * are those of the document.
   */
  stepMap?: number[]
  /** Layout hints per renderer, from `{hints}`; renderers ignore what they do not know. */
  hints: Record<RendererId, Record<string, unknown>>
  /**
   * Plugin configuration of this section, from `{config}`, keyed by plugin id;
   * each plugin's options override its global `presmium.<plugin id>` here.
   * Absent when the section configures nothing.
   */
  config?: Record<string, Record<string, unknown>>
  blocks: IRBlock[]
  /** Only for these audiences, e.g. `['teacher']`; omitted, for every audience (P-55). */
  audience?: string[]
}

export type BlockRole = 'visual' | 'narration'

export interface IRBlock {
  /**
   * Unique within the section: the block's MyST label, or `<kind>-<n>`
   * numbered per kind in source order. A generated id is the same on every
   * compilation of the same source but shifts when a block of its kind is
   * inserted before it; references that must survive edits (notes, anchors)
   * should use labelled blocks.
   */
  id: string
  role: BlockRole
  /**
   * Step at which a visual block appears, or to which a narration block
   * belongs. After a visual block B, the k-th narration block (0-based) up to
   * the next visual block belongs to `B.at + min(k, B.span)` (docs/ir.md 2.4).
   */
  at: number
  /** Step at which the block disappears; undefined means it stays. */
  until?: number
  /**
   * Steps the block advances internally; default 0. The block has `span + 1`
   * internal states, state k shown at step `at + k` (e.g. highlight k, list item k).
   */
  span?: number
  /** Restricts the block to these renderers. */
  only?: RendererId[]
  /** Only for these audiences (P-55). */
  audience?: string[]
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
   * document order) at `at + k`; the block's `span` is the item count minus one.
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
  /** 'drifted' when the referenced code changed after the pinned commit. */
  drift?: 'synced' | 'drifted'
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
  /** Execution session (`:session:`). */
  session?: string
}

export interface RecordedRun extends RunResult {
  cacheKey: string
}

export interface CodeVariant {
  label: string
  value: string
  permalink?: string
  /** Lines of the version in its file (1-based, inclusive), like `CodeOrigin`'s for the version on screen. */
  startLine?: number
  endLine?: number
}

export interface CodeNode {
  type: 'code'
  lang: string
  value: string
  title?: string
  origin?: CodeOrigin
  /** Line sets (1-based, relative to `value`) highlighted at steps at, at+1, ..., at+span; length = span + 1. */
  highlight?: number[][]
  run?: RunSpec
  outputs?: RecordedRun[]
  /** Alternative versions shown in place of `value`, one per step. */
  variants?: CodeVariant[]
  /** `false`: neither the code nor its run controls show, only the output; a `text/markdown` output shows as prose (P-102). */
  echo?: false
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
  /**
   * Props that hold the URL of a local file (relative to the block's source
   * file, or `/...` in the deck's `public/`), by prop name: renderers publish
   * the file with their output and set the prop to its published URL. A key
   * may be a property path, such as `captions.en`: each `.` goes one object
   * property deeper (`withProp`).
   */
  assets?: Record<string, string>
  /**
   * 'overlay': the component draws over the page (e.g. a cursor) rather than
   * in the flow of the content; renderers do not give it a place of its own.
   */
  layer?: 'overlay'
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
  /** The deck's language (`IRDocument.meta.lang`), for text the directive writes; see `deckLocale`. */
  lang?: string
  /** This plugin's configuration: global, with the `{config}` of the directive's section over it. */
  config: Record<string, unknown>
  source: SourcePos
  /** Parses MyST markdown (e.g. a directive body) into mdast. */
  parse(markdown: string): MdastNode
  report(finding: Finding): void
  /** Declares files the result depends on, as `PassContext.watch` does. */
  watch(...files: string[]): void
}

export interface DirectiveResult {
  node: IRNode
  role?: BlockRole
  span?: number
}

/** The input of an inline role: {name key=value}`value`. */
export interface RoleInput {
  name: string
  /** The content between the backticks. */
  value: string
  options: Record<string, unknown>
}

/** An inline role a plugin registers (docs/ir.md 2.8). */
export interface RoleSpec {
  name: string
  options?: Record<string, DirectiveOptionType>
  /** The role node's children; omitted, one text node of `value`. `{cue}` returns an empty array, its command in `options.value`. */
  children?(input: RoleInput, ctx: DirectiveContext): MdastNode[]
}

/** A registered role in the IR (in the mdast of `markdown` nodes); renderers that do not know it show its `children`. */
export interface PresmiumRoleNode extends MdastNode {
  type: 'presmiumRole'
  /** Id of the plugin that registers the role. */
  plugin: string
  name: string
  /** The options, and `value` (the content between the backticks). */
  options: Record<string, unknown>
  children: MdastNode[]
}

export interface DirectiveSpec {
  name: string
  /** Whether the directive takes an argument; 'anchor' when the argument is an anchor (`scheme:target`), which editors resolve. */
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
  /** The deck's language (`IRDocument.meta.lang`), for text the pass writes; see `deckLocale`. */
  lang?: string
  src: SourceReader
  resolvers: AnchorResolverRegistry
  lock: AnchorLockFile
  /** Node-side executors contributed by plugins, for compile-time execution. */
  executors: Executor[]
  cache: RunCache
  /** Configuration of the plugin that owns the pass. */
  config: Record<string, unknown>
  /** That configuration in one section: `config` with the section's `{config}` for the plugin over it. */
  configFor(section: IRSection): Record<string, unknown>
  report(finding: Finding): void
  /**
   * Declares files outside the source that the output depends on (absolute,
   * or relative to the workspace root), e.g. git files that name a commit;
   * `presmium dev` recompiles when one changes. Files read through `src` or
   * `resolvers` are recorded without it.
   */
  watch(...files: string[]): void
  /** Node services (docs/architecture.md 4.6); the compiler always gives it, optional for compatibility (a plugin writes `ctx.service?.(SPEECH)`). */
  service?<T>(token: ServiceToken<T>): T | undefined
  /**
   * The trust mode of the process that compiles (as `NodeServiceContext.trust`):
   * in SHARED mode a pass fetches no address a document names (serve and
   * agent-host reach internal services only, 10.5). Undefined means LOCAL.
   */
  trust?: TrustMode
}

export interface IRPass {
  name: string
  /** Lower runs first among plugin passes; default 0. */
  order?: number
  /**
   * 'execute': the pass runs after compile-time execution (step 7), when
   * code nodes have their `outputs`, e.g. to put them in a fallback.
   */
  after?: 'execute'
  run(doc: IRDocument, ctx: PassContext): void | Promise<void>
}

// ---------------------------------------------------------------------------
// Renderers
// ---------------------------------------------------------------------------

export type Support = 'full' | 'degraded' | 'none'

export interface RenderContext {
  deckDir: string
  /** The deck's repository (its git root, else the deck directory), as in `PassContext`. */
  workspaceRoot: string
  outDir: string
  /**
   * Where the renderer keeps what it generates on the way to its output, from
   * one run to the next: `<deck>/.presmium/<renderer id>` in `build`, the
   * output directory in `dev`. A renderer that writes there creates it and
   * keeps it out of git. The slides renderer writes its Slidev deck there
   * (`slides.md`), so `slidev export` can work on it.
   */
  workDir: string
  /** This renderer's configuration from the frontmatter. */
  config: Record<string, unknown>
  /** Renderer extensions contributed by plugins for this renderer. */
  extensions: RendererExtension[]
  /** Plugin package names, so browser renderers can load their components. */
  plugins: string[]
  /** Absolute package directory of each plugin, by package name as `plugins` lists it, as the compiler loaded it. */
  pluginDirs: Record<string, string>
  /** The deck's language (`IRDocument.meta.lang`); see `deckLocale`. */
  lang?: string
  /** Ids of the renderers this build or dev session runs, this one included. */
  renderers: RendererId[]
  /**
   * Public base path the renderer's output is served under, `/` or
   * `/<path>/`: `renderers.<id>.base`; else, when a build runs two or more
   * site renderers (`Renderer.site`) and none of them sets a base, `/<id>/`,
   * so the output directory deploys as one site (`dist/web/`, `dist/slides/`);
   * else `/`. In dev, where each server has an origin of its own, the
   * configured base, else `/`.
   */
  base: string
  /** Vite plugins of the deck's plugins (`PresmiumNodePlugin.vitePlugins`), for the renderers that run Vite. */
  vitePlugins: unknown[]
  /**
   * This renderer's extension for a component: that of the plugin the node
   * names (`node.plugin`), else of any plugin that renders a component of its
   * name. Every renderer picks the same one.
   */
  extensionFor(node: ComponentNode): ((node: ComponentNode, block: IRBlock) => unknown) | undefined
  /**
   * A configuration value as an output publishes it: absolute paths in the
   * deck's repository become relative to `from` (a directory), so the output
   * does not depend on where the deck is checked out; other values stay.
   */
  portable(value: unknown, from: string): unknown
  /**
   * The local file a URL of a block names: relative to the block's source
   * file (`source.file`), or `/...` in the deck's `public/`; query and
   * fragment are ignored, escapes decoded (a malformed one is kept as it is).
   * `name` is the name to publish it under, `<first 8 hex of its content
   * hash>-<file name>`. Undefined for a remote URL or no file, and for the
   * source of a document (`documentLink`), which is not published.
   */
  localAsset(source: SourcePos, url: string): LocalAsset | undefined
  /**
   * The document a URL of a block links to (docs/ir.md 6.2): a document's
   * entry file (`<document>/lecture.md`) or its directory, another document
   * of the workspace or this one, with the URL's `#fragment` (a section id
   * or a label there). Its source is never published: a workspace site links
   * the document's page; a single deck's build keeps the link as written,
   * with a `presmium.links` warning. Undefined for any other URL. Optional:
   * hosts that make their own contexts may not have it.
   */
  documentLink?(source: SourcePos, url: string): DocumentLink | undefined
  report(finding: Finding): void
  /** As `PassContext.service`. */
  service?<T>(token: ServiceToken<T>): T | undefined
  /** The translations the headmatter declares, compiled apart (language, IR); the web renderer uses them (P-123). */
  translations?: { lang: string, doc: IRDocument }[]
  /** In `presmium dev`: the server's address, to which the dev servers proxy `/__presmium/`; omitted in builds. */
  server?: { url: string }
}

/** A local file a URL of a block names, as the renderers publish it (`RenderContext.localAsset`). */
export interface LocalAsset {
  /** Absolute path of the file, or of the directory to copy (a directory of the deck, prepared with its listing `index.html`). */
  file: string
  /** The name to publish it under: `<first 8 hex of its content hash>-<file name>`. */
  name: string
  /** `file` is a directory, whose URL opens its listing (`publishedUrl`). Hosts' own contexts may leave it out. */
  directory?: boolean
}

/** A link to a document (`RenderContext.documentLink`). */
export interface DocumentLink {
  /** The document's directory, relative to the workspace root ('' for the root), as `SiteDocument.dir`. */
  dir: string
  /** The URL's fragment without `#`, decoded: a section id or a label of that document. */
  fragment?: string
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
  /** The renderer builds a site served under a public base path, which it takes from `RenderContext.base`. */
  site?: boolean
  support(node: IRNode, extensions: RendererExtension[]): Support
  /**
   * Writes what the renderer generates in `ctx.workDir` on the way to its
   * output, without building it (e.g. the Slidev deck that `slidev export`
   * works on). `build` does this first.
   */
  prepare?(doc: IRDocument, ctx: RenderContext): Promise<void>
  build(doc: IRDocument, ctx: RenderContext): Promise<RenderOutput>
  dev?(doc: IRDocument, ctx: RenderContext): Promise<RenderDevServer>
  /** Builds several documents into one site (P-122); only the web renderer implements it. */
  buildSite?(site: SiteSpec, ctx: RenderContext): Promise<RenderOutput>
  /** The dev server of a workspace site; when a page asks for a document not compiled yet it calls `compile`. */
  devSite?(site: SiteSpec, ctx: RenderContext, compile: (dir: string) => Promise<IRDocument>): Promise<SiteDevServer>
}

/** A document of a workspace site (P-122). */
export interface SiteDocument {
  /** Its directory, relative to the workspace root; its pages lie under `<base><dir>/`. */
  dir: string
  title: string
  lang?: string
  tags?: string[]
  /** The compiled IR; absent in dev for a document not visited yet. */
  doc?: IRDocument
}

export interface SiteSpec {
  title: string
  /** In the order of the workspace configuration, also that of the previous and next links between documents. */
  documents: SiteDocument[]
  /** The directory of the document that is the home page; omitted, the home page lists the documents. */
  home?: string
  /** The workspace configuration's `site`: the same options as the site shell of `renderers.web`. */
  config: Record<string, unknown>
}

export interface SiteDevServer {
  url: string
  /** Called after a document compiled or recompiled. */
  update(dir: string, doc: IRDocument): Promise<void>
  close(): Promise<void>
}

/**
 * Renders a plugin's component for one renderer, e.g. as notebook cells or as
 * Slidev Markdown. `ctx` is the context of the renderer being run, e.g. for
 * paths relative to what it writes.
 */
export type ComponentRenderer = (node: ComponentNode, block: IRBlock, ctx: RenderContext) => unknown

/** What a plugin contributes to one renderer (`PresmiumNodePlugin.rendererExtensions`). */
export interface RendererContribution {
  /** Component name -> its renderer. */
  components?: Record<string, ComponentRenderer>
}

/**
 * A plugin's contribution as a renderer receives it in `RenderContext.extensions`:
 * the compiler binds each component renderer to that renderer's context.
 */
export interface RendererExtension {
  plugin: string
  /** Component name -> renderer-specific output (e.g. notebook cells). */
  components?: Record<string, (node: ComponentNode, block: IRBlock) => unknown>
}
