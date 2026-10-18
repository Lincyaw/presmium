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
  Finding,
  Focus,
  IRDocument,
  Member,
  RunResult,
  ServiceToken,
} from '@presmium/kernel'

/** Who calls, as the token the request carries says: the member and the mode it was issued for (`author`). */
export interface McpCaller {
  member: Member
  mode: AgentMode
  /**
   * The host confirmed this caller's operations before they reach the
   * service (a session token of DeepSeek Harness, `McpIssueOptions.confirmed`):
   * no approval is asked of a window.
   */
  confirmed?: boolean
  /** The one document the caller's calls may name, and their default (`McpIssueOptions.document`). */
  document?: string
}

/** The focus a document's workbench reported last (`presmium.server/focus`, docs/design-dsh.md 8.6). */
export interface McpFocus {
  document: string
  focus: Focus[]
  /** When it was reported (ms since the epoch). */
  at: number
}

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
  /** The id of the member whose window it is. */
  member: string
  /** 1-based section number (`Cursor.slide`). */
  slide: number
  /** The section's id, when the window reports it (F-41). */
  section?: string
  /** The step, in the window's own numbering. */
  step: number
  /**
   * The keys of the steps the window has reached in its section (F-85, `stepTrail`
   * of `@presmium/kernel`), when it reports them: the step in another numbering
   * is the last whose keys they reach.
   */
  trail?: string[]
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

/** The process that serves MCP, as the service's instructions describe it. */
export interface McpProcess {
  /** `presmium dev`, `presmium serve` or `presmium-mcp`: how a change of the source reaches the tools. */
  command: 'dev' | 'serve' | 'presmium-mcp'
}

export interface McpHost {
  /** The process that serves MCP; omitted, the instructions describe it in general terms. */
  process?: McpProcess
  documents(): Promise<McpDocument[]>
  /** The document compiled: the whole deck. */
  compile(document: string): Promise<{ doc: IRDocument, diagnostics: Finding[] }>
  /** The compilation's diagnostics and the plugins' checks. */
  check(document: string): Promise<Finding[]>
  build(document: string, options: { to?: string[] }): Promise<{ outputs: { renderer: string, outDir: string }[], findings: Finding[] }>
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
   * The approval policy of a kind (`ask` or `allow`; `off` is not offered), which
   * the tools list in `_meta` (`presmium/approval`) for a caller whose host
   * confirms its operations itself (DeepSeek Harness, docs/design-dsh.md 6.3).
   * Absent: `ask`.
   */
  approval?(kind: ApprovalKind): 'off' | 'ask' | 'allow'
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
  /**
   * The focus the workbench reported last for a document, or without one the
   * latest of any document; undefined when there is none. Absent without a
   * workbench (`presmium-mcp`): `get_focus` answers null.
   */
  focus?(document?: string): McpFocus | undefined
  /** Calls `listener` when a focus is reported; returns the function that stops it. */
  watchFocus?(listener: () => void): () => void
  /** The status summaries the pages of a document reported (`STATUS`), by plugin id. */
  classroom?(document: string): Record<string, unknown>
  /** Sends `go` to the windows of a document that show it (the member's presenting ones first); returns how many. */
  navigate?(document: string, position: { slide: number, step: number, view?: string, section?: string, trail?: string[] }, member: Member): number
  /** Starts or ends the classroom in the presenting windows of `member` (only theirs: content scope covers the caller's own sessions). */
  session?(document: string, action: 'start' | 'end', name: string | undefined, member: Member): number
}
