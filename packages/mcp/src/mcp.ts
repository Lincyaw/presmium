/**
 * The agent environment (P-110, docs/architecture.md 10.2): the deck as MCP
 * tools, the same data as read-only resources, and instructions. Read tools
 * for every token; operate tools (`navigate`, `run_code`, `build`,
 * `classroom_start`, `classroom_end`, and the plugins' `operate` and `spend`
 * tools) only for the tokens of editors and owners, each confirmed through
 * the host's approvals (scope `content`, for the token's member) first.
 * Every token reads the whole deck (the `full` view). No tool writes
 * files: agents edit the source with their own file tools.
 *
 * `createPresmiumMcp` serves it over HTTP (a fresh server per request, the
 * caller passed in by the host, which checked the token); `presmium://position`
 * can be subscribed to (`subscriptions/listen`) and is announced updated
 * whenever a window reports a position. `serveMcpStdio` serves it on stdio.
 */
import { createRequire } from 'node:module'
import { createMcpHandler, fromJsonSchema, McpServer, ResourceTemplate, UriTemplate } from '@modelcontextprotocol/server'
import type { AuthInfo, CallToolResult, JsonSchemaType, Variables } from '@modelcontextprotocol/server'
import { serveStdio } from '@modelcontextprotocol/server/stdio'
import { deckLocale, docBlocks, errorMessage, isRecord, stepKeys, stepTrail, trailStep } from '@presmium/kernel'
import type { AgentTool, ApprovalKind, ApprovalScope, CodeNode, Finding, IRDocument, Member, MemberRole } from '@presmium/kernel'
import { codeRef, deckInfo, diagnosticsOf, findBlock, findSection, locate, outputsOf, place, runInfo, search, sectionDetail, sectionSummary, stepDetail } from './deck.ts'
import type { McpCaller, McpHost, McpProcess } from './host.ts'
import { MCP_MESSAGES } from './messages.ts'
import type { McpMessages } from './messages.ts'

/** The MCP server's version: this package's. */
export const MCP_VERSION: string = (createRequire(import.meta.url)('../package.json') as { version: string }).version
export const POSITION_URI = 'presmium://position'

/** The read tools, which every token sees. */
export const READ_TOOLS = [
  'list_documents', 'deck_info', 'list_sections', 'get_section', 'get_step', 'search',
  'get_code_ref', 'get_outputs', 'get_diagnostics', 'locate_source', 'get_position', 'get_classroom',
] as const

/** The operate tools, for the tokens of editors and owners. */
export const OPERATE_TOOLS = ['navigate', 'run_code', 'build', 'classroom_start', 'classroom_end'] as const

type Args = Record<string, unknown>

/** One tool call: its arguments, its document and the approvals it asks for. */
interface Call {
  host: McpHost
  caller: McpCaller
  args: Args
  signal: AbortSignal
  /** The document the call names, or the only one. */
  document(): Promise<string>
  /** The document compiled (the whole deck). */
  compiled(): Promise<{ doc: IRDocument, diagnostics: Finding[] }>
  /** Asks for an approval in the deck's language; throws when it is refused. */
  approve(kind: ApprovalKind, title: (messages: McpMessages) => string, options?: { scope?: ApprovalScope, detail?: string }): Promise<void>
}

interface ToolSpec {
  name: string
  description: string
  properties?: Record<string, unknown>
  required?: string[]
  /** `read`, or the approval kind an operation asks for. */
  kind: 'read' | ApprovalKind
  run(call: Call): Promise<unknown>
}

const DOCUMENT = { document: { type: 'string', description: 'The document directory (list_documents); omit it when the host serves one document.' } }
const SECTION = { section: { type: 'string', description: 'The section id (list_sections), or its 1-based number.' } }
const STEP = { step: { type: 'integer', minimum: 0, description: 'The step, from 0 (the section\'s initial state).' } }
const BLOCK = { block: { type: 'string', description: 'The block id (get_section).' } }

const rank: Record<MemberRole, number> = { reader: 0, editor: 1, owner: 2 }
const hasRole = (member: Member, role: MemberRole) => member.roles.some(own => rank[own] >= rank[role])

/** Whether the caller may operate: a token of an editor or owner. */
function operates(caller: McpCaller): boolean {
  return hasRole(caller.member, 'editor')
}

const str = (value: unknown) => (typeof value === 'string' && value !== '' ? value : undefined)
const int = (value: unknown) => (typeof value === 'number' && Number.isInteger(value) ? value : undefined)

/**
 * The position the windows of a document (or of any) last reported, the
 * caller's presenting ones first, in the whole deck (F-41, F-85): the
 * window's section by its id; a window that reports no id names its section
 * by its number. The step is in the whole deck's numbering: a window of
 * another numbering (the slides form, whose blocks only for other renderers
 * take no step) reports the keys of the steps it has reached (`trail`), and
 * the step is the last of the whole deck's that they reach. A section the
 * deck no longer has is null.
 */
async function position(call: Call, document?: string) {
  const found = call.host.positions?.(document, call.caller.member)[0]
  if (!found) return { position: null }
  const { doc } = await call.host.compile(found.document)
  const id = found.section ?? doc.sections.find(s => s.index === found.slide)?.id
  const section = id === undefined ? undefined : doc.sections.find(s => s.id === id)
  const keys = section && found.trail ? stepKeys(section) : undefined
  // A trail this numbering has up to the step is one of the same numbering: the step stands.
  const step = keys && stepTrail(keys, found.step).join('\n') !== found.trail!.join('\n') ? trailStep(keys, found.trail!) : found.step
  return {
    position: {
      document: found.document,
      section: section?.id ?? null,
      title: section?.title ?? null,
      step,
      steps: section?.steps ?? null,
      ...found.view ? { view: found.view } : {},
      ...found.role ? { role: found.role } : {},
      reported: new Date(found.at).toISOString(),
    },
  }
}

const TOOLS: ToolSpec[] = [
  {
    name: 'list_documents',
    description: 'The documents (decks) this host serves: directory, title, language, tags.',
    kind: 'read',
    run: async ({ host }) => ({ documents: (await host.documents()).map(d => ({ document: d.dir, title: d.title, ...d.lang ? { lang: d.lang } : {}, ...d.tags?.length ? { tags: d.tags } : {} })) }),
  },
  {
    name: 'deck_info',
    description: 'A deck at a glance: title, language, entry file, numbers of sections and steps, plugins, renderers, counts of diagnostics.',
    properties: { ...DOCUMENT },
    kind: 'read',
    run: async call => deckInfo((await call.compiled()).doc, await call.document()),
  },
  {
    name: 'list_sections',
    description: 'The sections in order: id, number, title, heading depth, number of steps and the source position.',
    properties: { ...DOCUMENT },
    kind: 'read',
    run: async (call) => {
      const { doc } = await call.compiled()
      return { sections: doc.sections.map(s => sectionSummary(doc, s)) }
    },
  },
  {
    name: 'get_section',
    description: 'A section: its narration by step, and every block on screen with its text, code, code reference, renderer limits (only) and source position.',
    properties: { ...DOCUMENT, ...SECTION },
    required: ['section'],
    kind: 'read',
    run: async (call) => {
      const { doc } = await call.compiled()
      return sectionDetail(doc, findSection(doc, str(call.args.section) ?? ''))
    },
  },
  {
    name: 'get_step',
    description: 'One step of a section: what is on screen at that step (with highlighted lines and code versions) and the narration that belongs to it.',
    properties: { ...DOCUMENT, ...SECTION, ...STEP },
    required: ['section'],
    kind: 'read',
    run: async (call) => {
      const { doc } = await call.compiled()
      return stepDetail(doc, findSection(doc, str(call.args.section) ?? ''), int(call.args.step) ?? 0)
    },
  },
  {
    name: 'search',
    description: 'Searches the deck with the web form\'s search index (titles, narration, prose and code of each section); returns sections by relevance.',
    properties: { ...DOCUMENT, query: { type: 'string' }, limit: { type: 'integer', minimum: 1, maximum: 50 } },
    required: ['query'],
    kind: 'read',
    run: async call => search((await call.compiled()).doc, str(call.args.query) ?? '', int(call.args.limit)),
  },
  {
    name: 'get_code_ref',
    description: 'A code block: its code, and the code of the workspace it references (anchor, file, lines, resolution status, drift, permalink).',
    properties: { ...DOCUMENT, ...SECTION, ...BLOCK },
    required: ['section', 'block'],
    kind: 'read',
    run: async (call) => {
      const { doc } = await call.compiled()
      return codeRef(doc, findSection(doc, str(call.args.section) ?? ''), str(call.args.block) ?? '')
    },
  },
  {
    name: 'get_outputs',
    description: 'The recorded outputs of a section\'s code blocks (or of one block): streams, exit, rich outputs (binary data named only).',
    properties: { ...DOCUMENT, ...SECTION, ...BLOCK },
    required: ['section'],
    kind: 'read',
    run: async (call) => {
      const { doc } = await call.compiled()
      return outputsOf(findSection(doc, str(call.args.section) ?? ''), str(call.args.block))
    },
  },
  {
    name: 'get_diagnostics',
    description: 'The diagnostics of the compilation and the plugins\' checks, with their source positions.',
    properties: { ...DOCUMENT },
    kind: 'read',
    run: async (call) => {
      const { doc } = await call.compiled()
      return { diagnostics: diagnosticsOf(doc, await call.host.check(await call.document())) }
    },
  },
  {
    name: 'locate_source',
    description: 'Where a section, the blocks of a step, a block, or the code blocks referencing an anchor are in the source: file (relative to the deck directory) and lines.',
    properties: { ...DOCUMENT, ...SECTION, ...STEP, ...BLOCK, anchor: { type: 'string', description: 'A code anchor such as region:src/a.py#name.' } },
    kind: 'read',
    run: async (call) => {
      const { doc } = await call.compiled()
      return locate(doc, { section: str(call.args.section), step: int(call.args.step), block: str(call.args.block), anchor: str(call.args.anchor) })
    },
  },
  {
    name: 'get_position',
    description: 'Where the presentation is: the section and step the presenting windows last reported (yours first), or null when no window shows the deck.',
    properties: { ...DOCUMENT },
    kind: 'read',
    run: async call => position(call, str(call.args.document)),
  },
  {
    name: 'get_classroom',
    description: 'The classroom\'s summaries that the open pages report, by plugin (no learner identities).',
    properties: { ...DOCUMENT },
    kind: 'read',
    run: async call => ({ classroom: call.host.classroom?.(await call.document()) ?? {} }),
  },
  {
    name: 'navigate',
    description: 'Moves the presentation (the windows presenting the deck) to a section and step, once a person allows it.',
    properties: { ...DOCUMENT, ...SECTION, ...STEP },
    required: ['section'],
    kind: 'operate',
    run: async (call) => {
      const document = await call.document()
      const { doc } = await call.compiled()
      const section = findSection(doc, str(call.args.section) ?? '')
      const step = Math.min(int(call.args.step) ?? 0, section.steps)
      // `go` reaches only the caller's windows: without one, nothing is asked.
      const own = call.host.positions?.(document, call.caller.member).filter(p => p.member === call.caller.member.id) ?? []
      if (own.length === 0) throw new Error('none of your windows shows the deck: open it first')
      await call.approve('operate', m => m.navigate(section.title, step))
      // The section's id and the keys of the steps reached too: a window of another numbering (the slides
      // form, the student build) finds the place in its own (D-4, F-85).
      const windows = call.host.navigate!(document, { slide: section.index, step, section: section.id, trail: stepTrail(stepKeys(section), step) }, call.caller.member)
      if (windows === 0) throw new Error('none of your windows shows the deck')
      return { section: section.id, step, windows }
    },
  },
  {
    name: 'run_code',
    description: 'Runs one code block now with the host\'s executors (recordings are neither read nor written), once a person allows it; returns its output.',
    properties: { ...DOCUMENT, ...SECTION, ...BLOCK },
    required: ['section', 'block'],
    kind: 'operate',
    run: async (call) => {
      const document = await call.document()
      const { doc } = await call.compiled()
      const section = findSection(doc, str(call.args.section) ?? '')
      const block = findBlock(section, str(call.args.block) ?? '')
      if (block.node.type !== 'code') throw new Error(`block ${block.id} of section ${section.id} is not code`)
      // The person allows everything the run sends: a block of a session runs after the session's blocks before it.
      await call.approve('operate', m => m.run(section.title, block.id), { scope: 'content', detail: runPlan(doc, block.node) })
      return { section: section.id, block: block.id, ...runInfo(await call.host.run(document, { section: section.id, block: block.id }, call.signal)) }
    },
  },
  {
    name: 'build',
    description: 'Builds the deck with its renderers (or those named), once a person allows it; returns the output directories and the findings.',
    properties: { ...DOCUMENT, to: { type: 'array', items: { type: 'string' }, description: 'Renderer ids, e.g. ["web"]; default: the deck\'s renderers.' } },
    kind: 'operate',
    run: async (call) => {
      const document = await call.document()
      const to = Array.isArray(call.args.to) ? call.args.to.filter((id): id is string => typeof id === 'string') : undefined
      await call.approve('operate', m => m.build(to?.join(', ') || m.allRenderers))
      const { doc } = await call.compiled()
      const report = await call.host.build(document, { to })
      return {
        outputs: report.outputs.map(o => ({ renderer: o.renderer, outDir: place(doc, { file: o.outDir, line: 1 }).file })),
        diagnostics: diagnosticsOf(doc, report.findings),
      }
    },
  },
  {
    name: 'classroom_start',
    description: 'Starts the classroom in the presenting windows, once a person allows it.',
    properties: { ...DOCUMENT, name: { type: 'string', description: 'The classroom\'s name.' } },
    kind: 'operate',
    run: async call => classroom(call, 'start'),
  },
  {
    name: 'classroom_end',
    description: 'Ends the classroom in the presenting windows, once a person allows it.',
    properties: { ...DOCUMENT },
    kind: 'operate',
    run: async call => classroom(call, 'end'),
  },
]

async function classroom(call: Call, action: 'start' | 'end') {
  const document = await call.document()
  // Only the caller's own presenting windows: an agent acts on its member's classroom, not on another member's.
  const presenting = call.host.positions?.(document, call.caller.member).filter(p => p.member === call.caller.member.id && (p.role === 'presenter' || p.role === 'audience')) ?? []
  if (presenting.length === 0) throw new Error('none of your windows presents the deck: open its present or presenter view first')
  const name = str(call.args.name) ?? ''
  await call.approve('operate', m => (action === 'start' ? m.classroomStart(name) : m.classroomEnd))
  return { classroom: action, windows: call.host.session!(document, action, name || undefined, call.caller.member) }
}

/**
 * What running a code block sends, for its approval: the block, after the
 * compile-time blocks of its `:session:` before it (as `Compilation.run`
 * sends them), each with its parameters and standard input.
 */
function runPlan(doc: IRDocument, node: CodeNode): string {
  const nodes: { id: string, code: CodeNode }[] = []
  const session = node.run?.session
  for (const { block } of docBlocks(doc)) {
    if (block.node === node) {
      nodes.push({ id: block.id, code: node })
      break
    }
    if (session && block.node.type === 'code' && block.node.run?.session === session && block.node.run.when !== 'live') nodes.push({ id: block.id, code: block.node })
  }
  const one = ({ id, code }: { id: string, code: CodeNode }) => [
    nodes.length > 1 ? `# ${id}` : '',
    code.run?.args && Object.keys(code.run.args).length ? `# args: ${JSON.stringify(code.run.args)}` : '',
    code.run?.stdin !== undefined ? `# stdin: ${JSON.stringify(code.run.stdin)}` : '',
    code.value,
  ].filter(Boolean).join('\n')
  return nodes.map(one).join('\n\n')
}

/** Whether the host can do what a tool needs. */
function supported(host: McpHost, name: string): boolean {
  switch (name) {
    case 'get_position': return Boolean(host.positions)
    case 'get_classroom': return Boolean(host.classroom)
    case 'navigate': return Boolean(host.positions && host.navigate)
    case 'classroom_start':
    case 'classroom_end': return Boolean(host.positions && host.session)
    default: return true
  }
}

function json(data: unknown): string {
  return typeof data === 'string' ? data : JSON.stringify(data, null, 2)
}

async function answer(run: () => Promise<unknown>): Promise<CallToolResult> {
  try {
    return { content: [{ type: 'text', text: json(await run()) }] }
  } catch (error) {
    return { isError: true, content: [{ type: 'text', text: errorMessage(error) }] }
  }
}

function inputSchema(properties: Record<string, unknown> = {}, required: string[] = []) {
  return fromJsonSchema<Args>({ type: 'object', properties, ...required.length ? { required } : {} } as JsonSchemaType)
}

/** How an edit of the source reaches the tools, by the process that serves MCP. */
function recompiles(process: McpProcess | undefined): string {
  switch (process?.command) {
    case 'dev': return 'presmium dev compiles the deck again on save.'
    case 'serve': return 'presmium serve compiles a document again when its files change.'
    case 'presmium-mcp': return 'presmium-mcp compiles the deck again at the next call once its files changed.'
    default: return 'The host compiles the deck again when its files change.'
  }
}

/** The service's instructions: the tools this caller has, the resources, and how operations are allowed. */
function instructions(host: McpHost, caller: McpCaller, tools: { name: string, kind: 'read' | ApprovalKind }[], title?: string): string {
  const pages = Boolean(host.positions)
  const reads = tools.filter(tool => tool.kind === 'read').map(tool => tool.name)
  const operations = tools.filter(tool => tool.kind !== 'read').map(tool => tool.name)
  return [
    `Presmium: ${title ? `the lecture deck "${title}"` : 'lecture decks'} as tools.`,
    `Read tools: ${reads.join(', ')}.`,
    `The same data is offered as resources: presmium://documents, presmium://deck, presmium://sections, presmium://sections/{section}, presmium://sections/{section}/steps/{step}, presmium://sections/{section}/outputs, presmium://diagnostics, presmium://ir (the compiled deck)${pages ? ', presmium://position (subscribe to it to hear when the presentation moves)' : ''}${host.classroom ? ', presmium://classroom' : ''}. With several documents, add ?document=<dir> to a deck's resource (presmium://sections?document=<dir>).`,
    'Sections are named by id (list_sections); steps count from 0. Paths are relative to the deck directory.',
    !operates(caller)
      ? 'This token reads only.'
      : operations.length === 0
        ? (pages ? 'No operation is offered here.' : 'No operation is offered: presmium-mcp offers the kinds of operation its --allow names.')
        : pages
          ? `Operate tools: ${operations.join(', ')}. Each may first wait for a person to allow it (in the page), and fails when refused.`
          : `Operate tools: ${operations.join(', ')}, allowed as presmium-mcp --allow says.`,
    `No tool writes files: edit the deck's source with your own file tools; ${recompiles(host.process)} With several documents, name one with \`document\` (list_documents).`,
  ].join('\n')
}

const RESOURCE = { mimeType: 'application/json' }

/**
 * The template of a resource of one document, `<uri>{?document}`: it matches
 * the URI with or without `?document=<dir>`, and query parameters besides
 * `document`, in any order, do not change the match (the SDK's own matching
 * takes exactly the query the template names).
 */
class DocumentTemplate extends UriTemplate {
  readonly #path: UriTemplate

  constructor(uri: string) {
    super(`${uri}{?document}`)
    this.#path = new UriTemplate(uri)
  }

  override match(uri: string): Variables | null {
    const query = uri.indexOf('?')
    const variables = this.#path.match(query < 0 ? uri : uri.slice(0, query))
    if (!variables) return null
    const document = query < 0 ? null : new URLSearchParams(uri.slice(query + 1)).get('document')
    return document === null ? variables : { ...variables, document }
  }
}

/** A resource URI's variables as a tool's arguments: decoded (`document` is decoded already), `step` a number. */
function argsOf(variables: Variables): Args {
  const args: Args = Object.fromEntries(Object.entries(variables).map(([key, value]) => [key, key === 'document' ? String(value) : decodeURIComponent(String(value))]))
  if (args.step !== undefined) args.step = Number(args.step)
  return args
}

/** The MCP server for one caller: the tools and resources its token may use. */
export async function presmiumServer(host: McpHost, caller: McpCaller): Promise<McpServer> {
  const documents = await host.documents().catch(() => [])
  const only = documents.length === 1 ? documents[0]!.dir : undefined

  const offered = (kind: 'read' | ApprovalKind) => kind === 'read' || (operates(caller) && host.offers(kind))
  const builtIn = TOOLS.filter(tool => offered(tool.kind) && supported(host, tool.name))
  // The plugins' tools: those of the one document, else of the documents the host has loaded.
  const plugins: AgentTool[] = []
  const names = new Set(TOOLS.map(tool => tool.name))
  for (const tool of (await host.tools?.(only).catch(() => undefined))?.tools ?? []) {
    if (names.has(tool.name) || !offered(tool.kind)) continue
    names.add(tool.name)
    plugins.push(tool)
  }

  const server = new McpServer({ name: 'presmium', version: MCP_VERSION }, {
    capabilities: { resources: { subscribe: true } },
    instructions: instructions(host, caller, [...builtIn, ...plugins], documents.length === 1 ? documents[0]!.title : undefined),
  })

  const call = (args: Args, signal: AbortSignal): Call => {
    let document: Promise<string> | undefined
    let compiled: Promise<{ doc: IRDocument, diagnostics: Finding[] }> | undefined
    const self: Call = {
      host,
      caller,
      args,
      signal,
      document: () => document ??= resolveDocument(host, str(args.document)),
      compiled: () => compiled ??= self.document().then(dir => host.compile(dir)),
      async approve(kind, title, options = {}) {
        const { doc } = await self.compiled()
        const messages = MCP_MESSAGES[deckLocale(doc.meta.lang)]
        const allowed = await host.approve({
          kind,
          scope: options.scope ?? 'content',
          title: title(messages),
          detail: options.detail ?? messages.detail(caller.member.name),
          from: 'presmium.mcp',
          member: caller.member.id,
        }, signal)
        if (!allowed) throw new Error('the operation was not allowed')
      },
    }
    return self
  }

  for (const tool of builtIn) {
    server.registerTool(tool.name, {
      description: tool.description,
      inputSchema: inputSchema(tool.properties, tool.required),
      annotations: { readOnlyHint: tool.kind === 'read' },
    }, (args, ctx) => answer(() => tool.run(call(args, ctx.mcpReq.signal))))
  }
  for (const tool of plugins) {
    const schema = isRecord(tool.input) ? tool.input : {}
    const properties = { ...DOCUMENT, ...isRecord(schema.properties) ? schema.properties : {} }
    server.registerTool(tool.name, {
      description: tool.description,
      inputSchema: fromJsonSchema<Args>({ ...schema, type: 'object', properties } as JsonSchemaType),
      annotations: { readOnlyHint: tool.kind === 'read' },
    }, (args, ctx) => answer(() => pluginTool(call(args, ctx.mcpReq.signal), tool)))
  }

  type Read = (call: Call) => Promise<unknown>
  const contents = (url: URL, data: unknown) => ({ contents: [{ uri: url.href, mimeType: 'application/json', text: json(data) }] })
  /** A resource of a document: the one document's, or a named one's with `?document=<dir>` (`DocumentTemplate`). */
  const template = (name: string, uri: string, read: Read) => {
    server.registerResource(name, new ResourceTemplate(new DocumentTemplate(uri), { list: undefined }), RESOURCE, async (url, variables, ctx) => contents(url, await read(call(argsOf(variables), ctx.mcpReq.signal))))
  }
  /** A fixed resource, listed; with `ofDocument` also its template for a named document. */
  const resource = (name: string, uri: string, read: Read, ofDocument = true) => {
    server.registerResource(name, uri, RESOURCE, async (url, ctx) => contents(url, await read(call({}, ctx.mcpReq.signal))))
    if (ofDocument) template(`${name}-of-document`, uri, read)
  }
  const read = (name: string): Read => c => TOOLS.find(tool => tool.name === name)!.run(c)
  resource('documents', 'presmium://documents', read('list_documents'), false)
  resource('deck', 'presmium://deck', read('deck_info'))
  resource('sections', 'presmium://sections', read('list_sections'))
  resource('diagnostics', 'presmium://diagnostics', read('get_diagnostics'))
  resource('ir', 'presmium://ir', async c => (await c.compiled()).doc)
  // The position of any document's windows (a subscription names this URI); get_position takes a document.
  if (host.positions) resource('position', POSITION_URI, c => position(c), false)
  if (host.classroom) resource('classroom', 'presmium://classroom', read('get_classroom'))
  const section = (name: string, uri: string, tool: string) => template(name, uri, read(tool))
  section('section', 'presmium://sections/{section}', 'get_section')
  section('step', 'presmium://sections/{section}/steps/{step}', 'get_step')
  section('outputs', 'presmium://sections/{section}/outputs', 'get_outputs')
  return server
}

/** Calls a plugin's agent tool on the document the call names; `operate` and `spend` tools ask first. */
async function pluginTool(call: Call, tool: AgentTool): Promise<unknown> {
  const document = await call.document()
  const own = await call.host.tools!(document)
  const found = own.tools.find(t => t.name === tool.name)
  if (!found) throw new Error(`the document ${JSON.stringify(document)} has no tool ${tool.name}`)
  // The document's tool of this name may not be the one listed: its kind is checked again.
  if (found.kind !== 'read' && !(operates(call.caller) && call.host.offers(found.kind))) throw new Error(`${tool.name} is not offered to this token`)
  const { document: _document, ...input } = call.args
  if (found.kind !== 'read') await call.approve(found.kind, m => m.tool(found.name), { detail: JSON.stringify(input) })
  return found.run(input, { document, member: call.caller.member, service: own.service, signal: call.signal })
}

async function resolveDocument(host: McpHost, named: string | undefined): Promise<string> {
  const documents = await host.documents()
  if (named !== undefined) {
    if (!documents.some(d => d.dir === named)) throw new Error(`no document ${JSON.stringify(named)}; list_documents names them`)
    return named
  }
  if (documents.length === 1) return documents[0]!.dir
  throw new Error(documents.length === 0 ? 'no document yet (the deck may still be compiling)' : 'several documents: name one with `document` (list_documents), or a resource\'s with ?document=<dir>')
}

/** The MCP service over HTTP: `fetch` answers a request to `/mcp` of a caller the host authenticated. */
export interface PresmiumMcp {
  fetch(request: Request, caller: McpCaller): Promise<Response>
  close(): Promise<void>
}

export function createPresmiumMcp(host: McpHost): PresmiumMcp {
  const handler = createMcpHandler(({ authInfo }) => presmiumServer(host, callerOf(authInfo)))
  // Subscribers of presmium://position re-read it whenever a window reports where it is.
  const stop = host.watchPositions?.(() => void handler.notify.resourceUpdated(POSITION_URI))
  return {
    fetch: (request, caller) => handler.fetch(request, { authInfo: { token: '', clientId: caller.member.id, scopes: [caller.mode], extra: { caller } } }),
    async close() {
      stop?.()
      await handler.close()
    },
  }
}

function callerOf(authInfo: AuthInfo | undefined): McpCaller {
  const caller = authInfo?.extra?.caller as McpCaller | undefined
  // The host authenticates every request before it reaches the handler.
  if (!caller) throw new Error('an MCP request without its caller')
  return caller
}

/** The MCP service on stdio (`presmium-mcp`), for one caller. */
export function serveMcpStdio(host: McpHost, caller: McpCaller): { close(): Promise<void> } {
  return serveStdio(() => presmiumServer(host, caller))
}
