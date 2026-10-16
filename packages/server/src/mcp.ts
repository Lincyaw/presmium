/**
 * The `McpHost` of the server (docs/architecture.md 10.2): the documents and
 * host operations of its `ServerHost`, the windows' positions and status
 * summaries of the control channel, its approvals, and the agent tools of the
 * documents' plugins. `/mcp` mounts `@presmium/mcp` over it.
 */
import { isRecord } from '@presmium/kernel'
import type { AgentTool, ApprovalScope, Member, ServiceToken } from '@presmium/kernel'
import type { McpHost, McpPluginTools, McpPosition } from '@presmium/mcp'
import type { Control } from './control.ts'
import type { ServedDocument, ServerHost } from './host.ts'

export interface McpHostOptions {
  serverHost?: ServerHost
  control: Control
  shared: boolean
  /** The operator's settings of a document (the server's, else those its compiler read), when known. */
  settings(document: string): Record<string, Record<string, unknown>> | undefined
  /** A served document, its contributions made on its first request; undefined when there is none. */
  mount(document: string): Promise<ServedDocument | undefined>
  /** The documents mounted so far. */
  mounted(): Promise<ServedDocument[]>
  /** The server's own Node services, in front of the document's. */
  service<T>(token: ServiceToken<T>): T | undefined
}

/**
 * The scope of `run_code`'s approval (10.6): `content` in LOCAL mode; in
 * SHARED mode by `settings.presmium.exec.compile`: `approve` (the default)
 * the owner's (`workspace`), `trusted` the token's member's, `off` not offered.
 */
function runCodeScope(shared: boolean, settings: Record<string, Record<string, unknown>> | undefined): ApprovalScope | 'off' {
  if (!shared) return 'content'
  const exec = settings?.presmium?.exec
  const compile = isRecord(exec) ? exec.compile : undefined
  return compile === 'off' ? 'off' : compile === 'trusted' ? 'content' : 'workspace'
}

function toolsOf(documents: ServedDocument[], own: McpHostOptions['service']): McpPluginTools {
  const tools = new Map<string, AgentTool>()
  for (const doc of documents) {
    for (const { plugin } of doc.plugins) for (const tool of plugin.tools ?? []) if (!tools.has(tool.name)) tools.set(tool.name, tool)
  }
  const doc = documents[0]
  return { tools: [...tools.values()], service: <T>(token: ServiceToken<T>) => own(token) ?? doc?.service(token) }
}

export function serverMcpHost(options: McpHostOptions): McpHost {
  const { control } = options
  const host = (): ServerHost => {
    if (!options.serverHost) throw new Error('this server has no host operations')
    return options.serverHost
  }
  const position = (entry: ReturnType<Control['positions']>[number]): McpPosition => {
    const { report } = entry
    return { document: entry.document, slide: report.position!.slide, step: report.position!.step, view: report.position!.view, role: report.role, at: report.at }
  }
  return {
    documents: () => host().documents(),
    compile: (document, view) => host().compile(document, view),
    check: document => host().check(document),
    build: (document, build) => host().build(document, build),
    run: (document, target, signal) => host().run(document, target, signal),
    // SHARED `run_code` under `compile: approve` asks the owner even when `approvals.operate` is `allow` (10.6).
    approve: (request, signal) => (options.shared && request.scope === 'workspace' ? control.ask(request, signal) : control.approvals.request(request, signal)),
    offers: kind => control.policy(kind) !== 'off',
    runCode: document => runCodeScope(options.shared, options.settings(document)),
    async tools(document) {
      if (document === undefined) return toolsOf(await options.mounted(), options.service)
      const doc = await options.mount(document)
      return toolsOf(doc ? [doc] : [], options.service)
    },
    // The member's presenting windows first, then any window (10.4).
    positions(document: string | undefined, member: Member) {
      const all = control.positions(undefined, document)
      const presenting = (w: typeof all[number]) => w.member === member.id && (w.report.role === 'presenter' || w.report.role === 'audience')
      return [...all.filter(presenting), ...all.filter(w => !presenting(w))].map(position)
    },
    watchPositions: listener => control.watch(listener),
    classroom: document => control.status(document),
    navigate: (document, to, member) => control.go(to, member, document),
    session: (document, action, name) => control.session(action, name, document),
  }
}
