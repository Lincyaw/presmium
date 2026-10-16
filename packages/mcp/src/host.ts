/**
 * The host interface the MCP service needs (docs/architecture.md 10.2), declared
 * here so that `@presmium/mcp` does not depend on the server: the server
 * implements it over its `ServerHost`, control channel and `APPROVALS`, and
 * `presmium-mcp` over the compiler (without positions or a classroom).
 */
import type {
  AgentMode,
  AgentTool,
  ApprovalKind,
  ApprovalRequest,
  ApprovalScope,
  Finding,
  IRDocument,
  Member,
  RunResult,
  ServiceToken,
} from '@presmium/kernel'

/** Who calls, as the token the request carries says: the member and the mode it was issued for. */
export interface McpCaller {
  member: Member
  mode: AgentMode
}

/** A view of a document: the whole deck, or what its audience `student` may see (P-55). */
export type McpView = 'full' | 'student'

/** A document of the host (P-120). */
export interface McpDocument {
  /** Its directory, relative to the workspace root; '' for the deck of `presmium dev` and `presmium-mcp`. */
  dir: string
  title: string
  lang?: string
  tags?: string[]
}

/** Where a window shows the deck, as the page reported it. */
export interface McpPosition {
  document: string
  /** 1-based section number (`Cursor.slide`). */
  slide: number
  step: number
  /** The runtime view of the web form (`present`, `presenter`, ...); absent in the slides form. */
  view?: string
  /** The view role the window reported: `presenter`, `audience` or `reader`. */
  role?: string
  /** When it was reported (ms since the epoch). */
  at: number
}

/** The plugins' agent tools of a document, with the Node services their context offers. */
export interface McpPluginTools {
  tools: AgentTool[]
  service<T>(token: ServiceToken<T>): T | undefined
}

export interface McpHost {
  documents(): Promise<McpDocument[]>
  compile(document: string, view: McpView): Promise<{ doc: IRDocument, diagnostics: Finding[] }>
  /** The compilation's diagnostics and the plugins' checks (the full view). */
  check(document: string): Promise<Finding[]>
  build(document: string, options: { to?: string[], view?: McpView }): Promise<{ outputs: { renderer: string, outDir: string }[], findings: Finding[] }>
  /** Runs one code block now with the host's executors and execution options, recordings neither read nor written. */
  run(document: string, target: { section: string, block: string }, signal?: AbortSignal): Promise<RunResult>
  /**
   * Asks for an approval (`APPROVALS`); resolves true when allowed. Asked only
   * for the kinds `offers` names.
   */
  approve(request: ApprovalRequest, signal?: AbortSignal): Promise<boolean>
  /** Whether operations of this kind are offered at all: the tools of a kind whose policy is `off` are not listed (10.4). */
  offers(kind: ApprovalKind): boolean
  /**
   * The scope of `run_code`'s approval in a document, or `off` when the tool
   * is not offered: `content` but in SHARED mode, where it follows
   * `settings.presmium.exec.compile` (10.6). Default `content`.
   */
  runCode?(document: string): ApprovalScope | 'off'
  /**
   * The plugins' agent tools (`PresmiumNodePlugin.tools`) of a document, or
   * without one, of the documents the host has loaded (the first of a name).
   */
  tools?(document?: string): Promise<McpPluginTools>
  /**
   * The latest positions the windows of a document (or of every document)
   * reported, newest first, those of the member's present and presenter views
   * before the others. Absent without windows (`presmium-mcp`).
   */
  positions?(document: string | undefined, member: Member): McpPosition[]
  /** Calls `listener` when a window reports a new position; returns the function that stops it. */
  watchPositions?(listener: () => void): () => void
  /** The status summaries the pages of a document reported (`STATUS`), by plugin id. */
  classroom?(document: string): Record<string, unknown>
  /** Sends `go` to the windows of a document that show it (the member's presenting ones first); returns how many. */
  navigate?(document: string, position: { slide: number, step: number, view?: string }, member: Member): number
  /** Starts or ends the classroom in the windows of a document's present and presenter views; returns how many. */
  session?(document: string, action: 'start' | 'end', name?: string): number
}
